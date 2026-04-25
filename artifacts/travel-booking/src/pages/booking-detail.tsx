import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import { Link, useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  Download,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Plane,
  Bus,
  Building2,
  Map,
  Calendar,
  Users,
  CreditCard,
  MessageCircle,
  ExternalLink,
  Phone,
  Mail,
  MapPin,
  Clock,
  BedDouble,
} from "lucide-react";
import { generateInvoicePDF } from "@/lib/invoice";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface BookingDetail {
  id?: string | number;
  bookingId?: string;
  userId?: string;
  type?: string;
  bookingType?: string;
  referenceId?: number;
  passengerName?: string;
  customerName?: string;
  passengerEmail?: string;
  customerEmail?: string;
  passengerPhone?: string;
  customerPhone?: string;
  customerGender?: string;
  passengers?: number;
  passengerDetails?: Array<{
    name: string;
    email: string;
    phone: string;
    gender: "male" | "female" | "other";
    age: number;
  }>;
  travelDate?: string;
  checkoutDate?: string;
  selectedSeats?: string[];
  roomType?: string;
  totalAmount?: number;
  amount?: number;
  totalPrice?: number;
  paymentId?: string;
  orderId?: string;
  paymentStatus?: string;
  paymentMethod?: string;
  status?: string;
  timestamp?: string;
  bookingDate?: string;
  createdAt?: string;
  title?: string;
  details?: {
    title?: string;
    passengers?: number;
    pricePerUnit?: number;
  };
  emiDetails?: {
    tenure?: number;
    monthlyAmount?: number;
    processingFee?: number;
  };
  couponCode?: string;
  // Flight-specific
  flightAirline?: string;
  flightNumber?: string;
  flightFrom?: string;
  flightTo?: string;
  flightDeparture?: string;
  flightArrival?: string;
  flightDuration?: string;
  // Bus-specific
  busOperator?: string;
  busType?: string;
  busFrom?: string;
  busTo?: string;
  busBoardingPoint?: string;
  busDroppingPoint?: string;
  busDeparture?: string;
  busArrival?: string;
  // Hotel-specific
  hotelName?: string;
  hotelCity?: string;
  hotelNights?: number;
  hotelRooms?: number;
  hotelAdults?: number;
}

export default function BookingDetail() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    window.scrollTo(0, 0);
    const fetchBooking = async () => {
      try {
        const response = await fetch(`/api/bookings/${id}`);
        if (response.ok) {
          const data = await response.json();
          setBooking(data);
        } else {
          const bookingsStr = localStorage.getItem("bookings");
          if (bookingsStr) {
            const bookings: BookingDetail[] = JSON.parse(bookingsStr);
            const found = bookings.find(b =>
              b.bookingId === id ||
              b.id?.toString() === id ||
              (b as any).id === id
            );
            if (found) setBooking(found);
          }
        }
      } catch (error) {
      } finally {
        setIsLoading(false);
      }
    };
    fetchBooking();
  }, [id]);

  if (isLoading) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-12 max-w-4xl">
          <Skeleton className="h-8 w-48 mb-8" />
          <Skeleton className="h-32 w-full mb-8 rounded-xl" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <Skeleton className="h-64 w-full rounded-xl" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        </div>
      </Layout>
    );
  }

  if (!booking) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-24 text-center">
          <h2 className="text-2xl font-bold mb-4">Booking not found</h2>
          <Button asChild>
            <Link href="/bookings">Back to my bookings</Link>
          </Button>
        </div>
      </Layout>
    );
  }

  const bookingType = (booking.type || booking.bookingType || "package") as "flight" | "bus" | "hotel" | "package";
  const isHotel  = bookingType === "hotel";
  const isFlight = bookingType === "flight";
  const isBus    = bookingType === "bus";
  const bookingStatus = booking.status || booking.paymentStatus || "confirmed";
  const isCancelled = bookingStatus === "cancelled";
  const totalAmount = booking.totalAmount || booking.amount || booking.totalPrice || 0;
  const bookingId = String(booking.bookingId || booking.id || "N/A");

  const getIcon = () => {
    if (isFlight) return <Plane className="w-7 h-7" />;
    if (isBus)    return <Bus className="w-7 h-7" />;
    if (isHotel)  return <Building2 className="w-7 h-7" />;
    return <Map className="w-7 h-7" />;
  };

  const typeAccent = () => {
    if (isFlight) return { bg: "bg-blue-600",   light: "bg-blue-50",   border: "border-blue-200",   text: "text-blue-700"   };
    if (isHotel)  return { bg: "bg-violet-600", light: "bg-violet-50", border: "border-violet-200", text: "text-violet-700" };
    if (isBus)    return { bg: "bg-orange-500", light: "bg-orange-50", border: "border-orange-200", text: "text-orange-700" };
    return              { bg: "bg-teal-600",   light: "bg-teal-50",   border: "border-teal-200",   text: "text-teal-700"   };
  };
  const accent = typeAccent();

  const handleDownloadPDF = () => {
    if (!booking) return;
    generateInvoicePDF({
      bookingId,
      bookingType,
      passengerName:   booking.passengerName   || booking.customerName   || "Guest",
      passengerEmail:  booking.passengerEmail  || booking.customerEmail  || "",
      passengerPhone:  booking.passengerPhone  || booking.customerPhone  || "",
      passengers:      booking.passengers      || 1,
      travelDate:      booking.travelDate      || booking.bookingDate    || new Date().toISOString(),
      checkoutDate:    booking.checkoutDate,
      totalAmount,
      paymentId:       booking.paymentId       || booking.orderId        || "N/A",
      paymentStatus:   bookingStatus,
      timestamp:       booking.timestamp       || booking.createdAt      || booking.bookingDate || new Date().toISOString(),
      title:           booking.title           || booking.details?.title || "Booking",
      selectedSeats:   booking.selectedSeats,
      roomType:        booking.roomType,
      // Hotel
      hotelName:       booking.hotelName,
      hotelCity:       booking.hotelCity,
      hotelNights:     booking.hotelNights,
      hotelRooms:      booking.hotelRooms,
      hotelAdults:     booking.hotelAdults,
      // Flight
      flightAirline:   booking.flightAirline,
      flightNumber:    booking.flightNumber,
      flightFrom:      booking.flightFrom,
      flightTo:        booking.flightTo,
      flightDeparture: booking.flightDeparture,
      flightArrival:   booking.flightArrival,
      flightDuration:  booking.flightDuration,
      // Bus
      busOperator:     booking.busOperator,
      busType:         booking.busType,
      busFrom:         booking.busFrom,
      busTo:           booking.busTo,
      busBoardingPoint:booking.busBoardingPoint,
      busDroppingPoint:booking.busDroppingPoint,
      busDeparture:    booking.busDeparture,
      busArrival:      booking.busArrival,
    });
    toast({ title: "Invoice Downloaded", description: `Dream Fly Global branded PDF invoice saved.` });
  };

  const handleCancel = async () => {
    if (!booking) return;
    const bId = booking.id || booking.bookingId;
    try {
      const response = await fetch(`/api/bookings/${bId}/cancel`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
      });
      if (response.ok) {
        toast({ title: "Booking Cancelled", description: "Your booking has been successfully cancelled." });
        setTimeout(() => setLocation("/bookings"), 1500);
      } else {
        throw new Error("Failed to cancel");
      }
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to cancel booking. Please try again." });
    }
  };

  const invoiceUrl = `/invoice/${bookingId}`;
  const dateStr = (d: string) => {
    try { return format(new Date(d), "dd MMM yyyy"); } catch { return d; }
  };

  return (
    <Layout>
      {/* ── Header strip ─────────────────────────────────────────────────── */}
      <div className={`${accent.bg} text-white`}>
        <div className="container mx-auto px-4 max-w-5xl py-6">
          <Button variant="ghost" asChild className="mb-4 text-white/80 hover:text-white hover:bg-white/10 pl-0">
            <Link href="/bookings">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to My Bookings
            </Link>
          </Button>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-2xl bg-white/20">
                {getIcon()}
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-white/70 text-xs font-bold uppercase tracking-widest">
                    {bookingType} Booking
                  </span>
                  {!isCancelled && (
                    <span className="bg-green-400/20 text-green-100 border border-green-400/40 text-xs font-bold px-2 py-0.5 rounded-full">
                      Confirmed
                    </span>
                  )}
                  {isCancelled && (
                    <span className="bg-red-400/20 text-red-100 border border-red-400/40 text-xs font-bold px-2 py-0.5 rounded-full">
                      Cancelled
                    </span>
                  )}
                </div>
                <h1 className="text-xl md:text-2xl font-extrabold">
                  {booking.title || booking.details?.title || `${bookingType} Booking`}
                </h1>
                <p className="text-white/70 text-sm mt-0.5">
                  Booking ID: <span className="font-mono font-bold text-white">{bookingId}</span>
                </p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                className="bg-white/20 text-white hover:bg-white/30 border-0"
                onClick={handleDownloadPDF}
              >
                <Download className="w-4 h-4 mr-1.5" /> Download PDF
              </Button>
              <Button size="sm" variant="secondary" className="bg-white/20 text-white hover:bg-white/30 border-0" asChild>
                <a href={invoiceUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4 mr-1.5" /> View Invoice
                </a>
              </Button>
              {!isCancelled && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="destructive" className="bg-red-500/80 hover:bg-red-600">
                      Cancel Booking
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle className="flex items-center">
                        <AlertCircle className="w-5 h-5 mr-2" /> Cancel Booking
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to cancel this booking? This action cannot be undone.
                        A cancellation confirmation will be sent to {booking.customerEmail || booking.passengerEmail}.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep Booking</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={handleCancel}
                      >
                        Yes, Cancel
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="container mx-auto px-4 py-8 max-w-5xl space-y-6">

        {/* ── Row 1: Passenger + Payment ─────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Passenger Info */}
          <Card className="shadow-sm">
            <CardHeader className={`pb-3 border-b ${accent.light}`}>
              <CardTitle className={`text-sm font-bold uppercase tracking-wider flex items-center gap-2 ${accent.text}`}>
                <Users className="w-4 h-4" /> Passenger Information
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-5 space-y-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Full Name</p>
                <p className="font-bold text-lg">{booking.passengerName || booking.customerName || "—"}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Phone className="w-3 h-3" /> Phone</p>
                  <p className="font-semibold text-sm">{booking.passengerPhone || booking.customerPhone || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Mail className="w-3 h-3" /> Email</p>
                  <p className="font-semibold text-sm truncate">{booking.passengerEmail || booking.customerEmail || "—"}</p>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">{isHotel ? "Guests" : "Passengers"}</p>
                <p className="font-semibold">{booking.passengers || 1} Person(s)</p>
              </div>
              {booking.selectedSeats && booking.selectedSeats.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">{isHotel ? "Room Numbers" : "Seat Numbers"}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {booking.selectedSeats.map((s) => (
                      <Badge key={s} variant="secondary" className="font-mono text-xs">{s}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Payment Summary */}
          <Card className="shadow-sm">
            <CardHeader className={`pb-3 border-b ${accent.light}`}>
              <CardTitle className={`text-sm font-bold uppercase tracking-wider flex items-center gap-2 ${accent.text}`}>
                <CreditCard className="w-4 h-4" /> Payment Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-5 space-y-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Booking ID</p>
                <p className="font-mono font-bold text-base bg-muted px-3 py-1.5 rounded inline-block">{bookingId}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Payment ID</p>
                <p className="font-mono text-sm text-muted-foreground">{booking.paymentId || booking.orderId || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Booked On</p>
                <p className="font-semibold text-sm">
                  {booking.bookingDate || booking.timestamp || booking.createdAt
                    ? dateStr(booking.bookingDate || booking.timestamp || booking.createdAt || "")
                    : "—"}
                </p>
              </div>
              <div className="pt-2 border-t">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Base Fare</span>
                  <span className="text-sm">₹{(totalAmount * 0.85).toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-sm text-muted-foreground">Taxes & Fees (15%)</span>
                  <span className="text-sm">₹{(totalAmount * 0.15).toFixed(2)}</span>
                </div>
                <div className={`flex justify-between items-center mt-3 pt-3 border-t font-bold text-lg`}>
                  <span>Total Paid</span>
                  <span className={accent.text}>₹{totalAmount.toFixed(2)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Service-specific details ───────────────────────────────────── */}

        {/* FLIGHT details */}
        {isFlight && (
          <Card className="shadow-sm border-blue-200">
            <CardHeader className="pb-3 border-b bg-blue-50">
              <CardTitle className="text-sm font-bold uppercase tracking-wider flex items-center gap-2 text-blue-700">
                <Plane className="w-4 h-4" /> Flight Details
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {(booking.flightAirline || booking.flightNumber) && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Airline</p>
                    <p className="font-bold text-base">
                      {booking.flightAirline || "—"}
                      {booking.flightNumber && (
                        <span className="text-sm font-normal text-muted-foreground ml-2">({booking.flightNumber})</span>
                      )}
                    </p>
                  </div>
                )}
                {(booking.flightFrom || booking.flightTo) && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><MapPin className="w-3 h-3" /> Route</p>
                    <p className="font-bold text-base">
                      {booking.flightFrom || "—"} → {booking.flightTo || "—"}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Calendar className="w-3 h-3" /> Travel Date</p>
                  <p className="font-semibold">{booking.travelDate ? dateStr(booking.travelDate) : "—"}</p>
                </div>
                {booking.flightDuration && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Clock className="w-3 h-3" /> Duration</p>
                    <p className="font-semibold">{booking.flightDuration}</p>
                  </div>
                )}
              </div>

              {/* Departure / Arrival chips */}
              {(booking.flightDeparture || booking.flightArrival) && (
                <div className="flex gap-4 mt-5">
                  {booking.flightDeparture && (
                    <div className="flex-1 bg-green-50 border border-green-200 rounded-xl p-3.5">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="w-2 h-2 rounded-full bg-green-500" />
                        <span className="text-xs font-bold text-green-700 uppercase">Departure</span>
                      </div>
                      <p className="font-bold text-base text-green-900">{booking.flightFrom || "—"}</p>
                      <p className="text-sm text-slate-500 mt-0.5 font-medium">{booking.flightDeparture}</p>
                    </div>
                  )}
                  {booking.flightArrival && (
                    <div className="flex-1 bg-red-50 border border-red-200 rounded-xl p-3.5">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="w-2 h-2 rounded-full bg-red-500" />
                        <span className="text-xs font-bold text-red-700 uppercase">Arrival</span>
                      </div>
                      <p className="font-bold text-base text-red-900">{booking.flightTo || "—"}</p>
                      <p className="text-sm text-slate-500 mt-0.5 font-medium">{booking.flightArrival}</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* BUS details */}
        {isBus && (
          <Card className="shadow-sm border-orange-200">
            <CardHeader className="pb-3 border-b bg-orange-50">
              <CardTitle className="text-sm font-bold uppercase tracking-wider flex items-center gap-2 text-orange-700">
                <Bus className="w-4 h-4" /> Bus Details
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {(booking.busOperator || booking.busType) && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Operator</p>
                    <p className="font-bold text-base">
                      {booking.busOperator || "—"}
                      {booking.busType && (
                        <span className="text-sm font-normal text-muted-foreground ml-2">({booking.busType})</span>
                      )}
                    </p>
                  </div>
                )}
                {(booking.busFrom || booking.busTo) && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><MapPin className="w-3 h-3" /> Route</p>
                    <p className="font-bold text-base">{booking.busFrom || "—"} → {booking.busTo || "—"}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Calendar className="w-3 h-3" /> Travel Date</p>
                  <p className="font-semibold">{booking.travelDate ? dateStr(booking.travelDate) : "—"}</p>
                </div>
                {booking.selectedSeats && booking.selectedSeats.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Seat Numbers</p>
                    <div className="flex flex-wrap gap-1.5">
                      {booking.selectedSeats.map((s) => (
                        <Badge key={s} variant="secondary" className="font-mono text-xs">{s}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Boarding / Dropping chips */}
              {(booking.busBoardingPoint || booking.busDroppingPoint) && (
                <div className="flex gap-4 mt-5">
                  {booking.busBoardingPoint && (
                    <div className="flex-1 bg-green-50 border border-green-200 rounded-xl p-3.5">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="w-2 h-2 rounded-full bg-green-500" />
                        <span className="text-xs font-bold text-green-700 uppercase">Boarding</span>
                      </div>
                      <p className="font-bold text-base text-green-900">{booking.busBoardingPoint}</p>
                      {booking.busDeparture && <p className="text-sm text-slate-500 mt-0.5 font-medium">{booking.busDeparture}</p>}
                    </div>
                  )}
                  {booking.busDroppingPoint && (
                    <div className="flex-1 bg-red-50 border border-red-200 rounded-xl p-3.5">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="w-2 h-2 rounded-full bg-red-500" />
                        <span className="text-xs font-bold text-red-700 uppercase">Dropping</span>
                      </div>
                      <p className="font-bold text-base text-red-900">{booking.busDroppingPoint}</p>
                      {booking.busArrival && <p className="text-sm text-slate-500 mt-0.5 font-medium">{booking.busArrival}</p>}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* HOTEL details */}
        {isHotel && (
          <Card className="shadow-sm border-violet-200">
            <CardHeader className="pb-3 border-b bg-violet-50">
              <CardTitle className="text-sm font-bold uppercase tracking-wider flex items-center gap-2 text-violet-700">
                <Building2 className="w-4 h-4" /> Hotel Details
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {booking.hotelName && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Hotel Name</p>
                    <p className="font-bold text-base">{booking.hotelName}</p>
                  </div>
                )}
                {booking.hotelCity && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><MapPin className="w-3 h-3" /> Location</p>
                    <p className="font-semibold">{booking.hotelCity}</p>
                  </div>
                )}
                {booking.roomType && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><BedDouble className="w-3 h-3" /> Room Type</p>
                    <p className="font-semibold capitalize">{booking.roomType}</p>
                  </div>
                )}
                {booking.hotelRooms && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Rooms</p>
                    <p className="font-semibold">{booking.hotelRooms}</p>
                  </div>
                )}
                {booking.hotelAdults && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Guests</p>
                    <p className="font-semibold">{booking.hotelAdults} Adult{booking.hotelAdults > 1 ? "s" : ""}</p>
                  </div>
                )}
              </div>

              {/* Check-in / Check-out chips */}
              {(booking.travelDate || booking.checkoutDate) && (
                <div className="flex gap-4 mt-5">
                  {booking.travelDate && (
                    <div className="flex-1 bg-green-50 border border-green-200 rounded-xl p-3.5">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="w-2 h-2 rounded-full bg-green-500" />
                        <span className="text-xs font-bold text-green-700 uppercase">Check-in</span>
                      </div>
                      <p className="font-bold text-base text-green-900">{dateStr(booking.travelDate)}</p>
                    </div>
                  )}
                  {booking.checkoutDate && (
                    <div className="flex-1 bg-red-50 border border-red-200 rounded-xl p-3.5">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="w-2 h-2 rounded-full bg-red-500" />
                        <span className="text-xs font-bold text-red-700 uppercase">Check-out</span>
                      </div>
                      <p className="font-bold text-base text-red-900">{dateStr(booking.checkoutDate)}</p>
                      {booking.hotelNights && (
                        <p className="text-sm text-slate-500 mt-0.5 font-medium">{booking.hotelNights} night{booking.hotelNights > 1 ? "s" : ""}</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Status banners ────────────────────────────────────────────── */}
        {!isCancelled && (
          <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-5 flex items-start gap-4">
            <CheckCircle2 className="w-6 h-6 text-green-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-green-800 mb-1">You're all set!</h4>
              <p className="text-green-700/80 text-sm leading-relaxed">
                Your booking is confirmed. A detailed itinerary has been sent to{" "}
                <strong>{booking.customerEmail || booking.passengerEmail || "your email"}</strong>.
                Please carry a valid photo ID during your journey.
              </p>
            </div>
          </div>
        )}

        {isCancelled && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-5 flex items-start gap-4">
            <XCircle className="w-6 h-6 text-destructive shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-destructive mb-1">Booking Cancelled</h4>
              <p className="text-destructive/80 text-sm leading-relaxed">
                This booking has been cancelled. If a refund is applicable, it will be processed
                to your original payment method within 5–7 business days.
              </p>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
