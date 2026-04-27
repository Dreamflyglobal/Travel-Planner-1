import { useEffect, useState, useRef } from "react";
import { useLocation, Link } from "wouter";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Download, Mail, Calendar, CreditCard, User, Phone, MapPin, Plane, Building2, Bus, Map, Gift, MessageCircle, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { popUnseenRewardNotifications } from "@/lib/referral";
import { generateInvoicePDF, openWhatsAppConfirmation, openEmailConfirmation } from "@/lib/invoice";
import { API_CONFIG } from "@/lib/api-config";

interface BookingDetails {
  bookingId: string;
  bookingType: "flight" | "bus" | "hotel" | "package";
  passengerName: string;
  passengerEmail: string;
  passengerPhone: string;
  passengers: number;
  travelDate: string;
  totalAmount: number;
  paymentId: string;
  paymentStatus: "paid";
  timestamp: string;
  title: string;
  selectedSeats?: string[];
  roomType?: string;
  checkoutDate?: string;
  // Hotel
  hotelName?: string;
  hotelCity?: string;
  hotelNights?: number;
  hotelRooms?: number;
  hotelAdults?: number;
  // Bus
  busFrom?: string;
  busTo?: string;
  busOperator?: string;
  busType?: string;
  busBoardingPoint?: string;
  busDroppingPoint?: string;
  busDeparture?: string;
  busArrival?: string;
  // Flight
  flightFrom?: string;
  flightTo?: string;
  flightAirline?: string;
  flightNumber?: string;
  flightDeparture?: string;
  flightArrival?: string;
  flightDuration?: string;
  tjPnr?: string;
}

export default function PaymentSuccess() {
  const [, params] = useLocation();
  const [bookingDetails, setBookingDetails] = useState<BookingDetails | null>(null);
  const [invoiceUrl, setInvoiceUrl] = useState<string>("");
  const notifySentRef = useRef(false);
  const { toast } = useToast();
  const { refreshUser } = useAuth();

  // ── Auto-send email + WhatsApp with invoice link ─────────────────────────
  async function triggerNotification(booking: BookingDetails) {
    if (notifySentRef.current) return;
    notifySentRef.current = true;

    const frontendBaseUrl = window.location.origin;
    const invoiceLink = `${frontendBaseUrl}/invoice/${booking.bookingId}`;
    setInvoiceUrl(invoiceLink);

    console.log("[notify] Sending post-payment notification for", booking.bookingId, "type:", booking.bookingType);

    try {
      // Derive from/to for WhatsApp route line based on booking type
      const fromCity = booking.flightFrom || booking.busFrom || booking.hotelCity || "";
      const toCity   = booking.flightTo   || booking.busTo   || "";

      // Use relative URL (Vite proxy) — never direct localhost from browser
      const res = await fetch("/api/payments/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frontendBaseUrl,
          bookingContext: {
            bookingId:      booking.bookingId,
            bookingType:    booking.bookingType,
            passengerName:  booking.passengerName,
            passengerEmail: booking.passengerEmail,
            phone:          booking.passengerPhone,
            title:          booking.title,
            travelDate:     booking.travelDate,
            checkoutDate:   booking.checkoutDate,
            totalAmount:    booking.totalAmount,
            paymentId:      booking.paymentId,
            passengers:     booking.passengers,
            // Route info for WhatsApp message
            from:           fromCity,
            to:             toCity,
            // Hotel-specific
            hotelName:      booking.hotelName,
            hotelCity:      booking.hotelCity,
            hotelNights:    booking.hotelNights,
            hotelRooms:     booking.hotelRooms,
            hotelAdults:    booking.hotelAdults,
            roomType:       booking.roomType,
            // Flight-specific
            flightAirline:  booking.flightAirline,
            flightNumber:   booking.flightNumber,
            flightFrom:     booking.flightFrom,
            flightTo:       booking.flightTo,
            flightDeparture:booking.flightDeparture,
            flightArrival:  booking.flightArrival,
            flightDuration: booking.flightDuration,
            // Bus-specific
            busOperator:    booking.busOperator,
            busType:        booking.busType,
            busFrom:        booking.busFrom,
            busTo:          booking.busTo,
            busBoardingPoint: booking.busBoardingPoint,
            busDroppingPoint: booking.busDroppingPoint,
            busDeparture:   booking.busDeparture,
            busArrival:     booking.busArrival,
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        console.log("[notify] Result:", data);
        if (data.emailSent) {
          toast({
            title: "Confirmation Email Sent",
            description: `Booking confirmation sent to ${booking.passengerEmail}`,
            duration: 5000,
          });
        } else if (data.emailReason) {
          console.warn("[notify] Email not sent:", data.emailReason);
        }
        if (data.whatsappSent) {
          console.log("WhatsApp sent");
          toast({
            title: "WhatsApp Confirmation Sent",
            description: "Booking confirmation sent via WhatsApp",
            duration: 5000,
          });
        } else if (data.whatsappReason) {
          console.warn("[notify] WhatsApp not sent:", data.whatsappReason);
        }
      } else {
        console.warn("[notify] Server returned", res.status, await res.text().catch(() => ""));
      }
    } catch (err) {
      // Non-blocking — booking is already confirmed, just log
      console.warn("[notify] Could not reach notification server:", err);
    }
  }

  useEffect(() => {
    // Simple celebration animation without external dependencies
    const duration = 3 * 1000;
    const animationEnd = Date.now() + duration;

    const interval = setInterval(() => {
      const timeLeft = animationEnd - Date.now();
      if (timeLeft <= 0) {
        clearInterval(interval);
        return;
      }
      createParticle();
    }, 150);

    // Get booking details from localStorage (set by payment handler)
    const savedBooking = localStorage.getItem("lastSuccessfulBooking");
    if (savedBooking) {
      try {
        const booking = JSON.parse(savedBooking);
        setBookingDetails(booking);
        // Set invoice URL immediately so the button appears right away
        setInvoiceUrl(`${window.location.origin}/invoice/${booking.bookingId}`);
        // Trigger email + WhatsApp notification (fire and forget)
        triggerNotification(booking);
      } catch (error) {
        console.error("Failed to parse booking details:", error);
      }
    }

    // ── Check for referral reward notifications ──────────────────────────────
    refreshUser();
    try {
      const sessionRaw = localStorage.getItem("user");
      if (sessionRaw) {
        const sessionUser = JSON.parse(sessionRaw);
        const notifs = popUnseenRewardNotifications(sessionUser.id);
        if (notifs.length > 0) {
          setTimeout(() => {
            notifs.forEach((n) => {
              toast({
                title: "Travel Credits Earned!",
                description: n.message,
                duration: 6000,
              });
            });
          }, 1200);
        }
      }
    } catch { /* non-blocking */ }

    return () => clearInterval(interval);
  }, []);
  // Simple particle effect function
  const createParticle = () => {
    const colors = ["#f97316", "#fb923c", "#fdba74", "#ef4444", "#fbbf24"];
    const particle = document.createElement("div");
    particle.className = "celebration-particle";
    particle.style.left = Math.random() * 100 + "%";
    particle.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    particle.style.animationDuration = (Math.random() * 2 + 1) + "s";
    document.body.appendChild(particle);
    
    setTimeout(() => {
      particle.remove();
    }, 3000);
  };

  const getBookingIcon = () => {
    switch (bookingDetails?.bookingType) {
      case "flight":
        return <Plane className="w-8 h-8" />;
      case "hotel":
        return <Building2 className="w-8 h-8" />;
      case "bus":
        return <Bus className="w-8 h-8" />;
      case "package":
        return <Map className="w-8 h-8" />;
      default:
        return <Calendar className="w-8 h-8" />;
    }
  };  const handleDownloadTicket = () => {
    if (!bookingDetails) return;
    try {
      generateInvoicePDF(bookingDetails);
      toast({
        title: "Invoice Downloaded!",
        description: `Dream Fly Global branded invoice for ${bookingDetails.bookingId} saved as PDF.`,
      });
    } catch (error) {
      console.error("Error generating invoice:", error);
      toast({
        variant: "destructive",
        title: "Download Failed",
        description: "There was an error generating the invoice. Please try again.",
      });
    }
  };

  const handleEmailTicket = () => {
    if (!bookingDetails) return;
    openEmailConfirmation(bookingDetails);
    toast({
      title: "Email Client Opened",
      description: `Booking confirmation draft ready to send to ${bookingDetails.passengerEmail}`,
    });
  };

  const handleWhatsApp = () => {
    if (!bookingDetails) return;
    openWhatsAppConfirmation(bookingDetails);
  };

  if (!bookingDetails) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-24 text-center">
          <h2 className="text-2xl font-bold mb-4">Loading booking details...</h2>
          <p className="text-muted-foreground">Please wait while we retrieve your booking information.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 py-12">
        <div className="container mx-auto px-4">
          {/* Success Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-green-500 text-white mb-6 animate-bounce">
              <CheckCircle className="w-16 h-16" />
            </div>
            <h1 className="text-4xl md:text-5xl font-extrabold text-green-700 mb-4">
              Payment Successful! 🎉
            </h1>
            <p className="text-xl text-gray-600 mb-2">
              Your booking has been confirmed
            </p>
            <p className="text-sm text-muted-foreground">
              Booking ID: <span className="font-mono font-bold text-primary">{bookingDetails.bookingId}</span>
            </p>
            {bookingDetails.tjPnr && (
              <p className="text-sm text-muted-foreground mt-1">
                PNR: <span className="font-mono font-bold text-green-700 text-base">{bookingDetails.tjPnr}</span>
              </p>
            )}
          </div>

          {/* Booking Details Card */}
          <Card className="max-w-4xl mx-auto shadow-2xl border-2 border-green-200">
            <CardHeader className="bg-gradient-to-r from-green-500 to-emerald-600 text-white">
              <CardTitle className="flex items-center gap-3 text-2xl">
                {getBookingIcon()}
                <span>{bookingDetails.title}</span>
                <Badge variant="secondary" className="ml-auto bg-white text-green-700 font-bold">
                  {bookingDetails.paymentStatus.toUpperCase()}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-8">
              {/* Passenger Details */}
              <div className="grid md:grid-cols-2 gap-6 mb-8">
                <div className="space-y-4">
                  <h3 className="text-lg font-bold text-gray-800 border-b pb-2">Passenger Information</h3>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <User className="w-5 h-5 text-gray-500" />
                      <div>
                        <p className="text-xs text-gray-500">Name</p>
                        <p className="font-semibold">{bookingDetails.passengerName}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Mail className="w-5 h-5 text-gray-500" />
                      <div>
                        <p className="text-xs text-gray-500">Email</p>
                        <p className="font-semibold">{bookingDetails.passengerEmail}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Phone className="w-5 h-5 text-gray-500" />
                      <div>
                        <p className="text-xs text-gray-500">Phone</p>
                        <p className="font-semibold">{bookingDetails.passengerPhone}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-bold text-gray-800 border-b pb-2">Booking Details</h3>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <Calendar className="w-5 h-5 text-gray-500" />
                      <div>
                        <p className="text-xs text-gray-500">Travel Date</p>
                        <p className="font-semibold">{new Date(bookingDetails.travelDate).toLocaleDateString('en-US', { 
                          weekday: 'short', 
                          year: 'numeric', 
                          month: 'short', 
                          day: 'numeric' 
                        })}</p>
                      </div>
                    </div>
                    {bookingDetails.checkoutDate && (
                      <div className="flex items-center gap-3">
                        <Calendar className="w-5 h-5 text-gray-500" />
                        <div>
                          <p className="text-xs text-gray-500">Check-out Date</p>
                          <p className="font-semibold">{new Date(bookingDetails.checkoutDate).toLocaleDateString('en-US', { 
                            weekday: 'short', 
                            year: 'numeric', 
                            month: 'short', 
                            day: 'numeric' 
                          })}</p>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-3">
                      <MapPin className="w-5 h-5 text-gray-500" />
                      <div>
                        <p className="text-xs text-gray-500">{bookingDetails.bookingType === "hotel" ? "Rooms" : "Passengers"}</p>
                        <p className="font-semibold">{bookingDetails.passengers}</p>
                      </div>
                    </div>
                    {bookingDetails.selectedSeats && bookingDetails.selectedSeats.length > 0 && (
                      <div className="flex items-start gap-3">
                        <MapPin className="w-5 h-5 text-gray-500 mt-1" />
                        <div>
                          <p className="text-xs text-gray-500">Selected Seats</p>
                          <p className="font-semibold">{bookingDetails.selectedSeats.join(", ")}</p>
                        </div>
                      </div>
                    )}
                    {bookingDetails.roomType && (
                      <div className="flex items-center gap-3">
                        <Building2 className="w-5 h-5 text-gray-500" />
                        <div>
                          <p className="text-xs text-gray-500">Room Type</p>
                          <p className="font-semibold capitalize">{bookingDetails.roomType}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Payment Details */}
              <div className="bg-green-50 rounded-lg p-6 border-2 border-green-200">
                <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <CreditCard className="w-5 h-5" />
                  Payment Details
                </h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-500">Payment ID</p>
                    <p className="font-mono font-semibold text-sm">{bookingDetails.paymentId}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Transaction Date</p>
                    <p className="font-semibold text-sm">{new Date(bookingDetails.timestamp).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Payment Method</p>
                    <p className="font-semibold text-sm">Razorpay</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Amount Paid</p>
                    <p className="font-bold text-2xl text-green-600">₹{bookingDetails.totalAmount.toFixed(2)}</p>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mt-8">
                {invoiceUrl && (
                  <Button asChild size="lg" className="w-full bg-orange-500 hover:bg-orange-600 col-span-full sm:col-span-1">
                    <a href={invoiceUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-5 h-5 mr-2" />
                      View Invoice
                    </a>
                  </Button>
                )}
                <Button onClick={handleDownloadTicket} size="lg" className="w-full" variant="default">
                  <Download className="w-5 h-5 mr-2" />
                  Download PDF
                </Button>
                <Button onClick={handleEmailTicket} variant="outline" size="lg" className="w-full">
                  <Mail className="w-5 h-5 mr-2" />
                  Email
                </Button>
                <Button onClick={handleWhatsApp} variant="outline" size="lg" className="w-full border-green-300 text-green-700 hover:bg-green-50">
                  <MessageCircle className="w-5 h-5 mr-2" />
                  WhatsApp
                </Button>
                <Button asChild variant="secondary" size="lg" className="w-full">
                  <Link href="/bookings">My Bookings</Link>
                </Button>
              </div>

              {/* Important Notice */}
              <div className="mt-8 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <h4 className="font-bold text-blue-900 mb-2">📧 Important</h4>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• A confirmation email has been sent to <strong>{bookingDetails.passengerEmail}</strong></li>
                  <li>• Please carry a valid ID proof during your journey</li>
                  <li>• Check-in opens 2 hours before {bookingDetails.bookingType === "flight" ? "departure" : "journey"}</li>
                  <li>• For any queries, contact our 24/7 support</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Continue Browsing */}
          <div className="text-center mt-8">
            <Button asChild variant="ghost" size="lg">
              <Link href="/">← Back to Home</Link>
            </Button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
