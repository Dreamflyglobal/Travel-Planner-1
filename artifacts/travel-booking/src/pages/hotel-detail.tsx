import { useState, useEffect, useCallback } from "react";
import type { JSX } from "react";
import { useParams, useLocation, useSearch } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { getHiddenMarkupAmount, getConvenienceFee } from "@/lib/pricing";
import { saveBookingSession } from "@/lib/booking-session";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Building2, Star, MapPin, ArrowLeft, Wifi, Car, Utensils, Waves,
  Dumbbell, Wind, Tv, Coffee, CheckCircle2, ChevronRight, Users, Calendar,
  Loader2, BedDouble, ShieldCheck, XCircle, Phone, Mail, User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MOCK_HOTELS } from "./hotel-results";

// ── Types ─────────────────────────────────────────────────────────────────────
interface RoomOption {
  code: string;
  name: string;
  rateKey: string | null;
  boardName: string;
  priceINR: number;
  refundable: boolean;
  cancellationDeadline: string;
}

interface PassengerInfo {
  firstName: string;
  lastName:  string;
  email:     string;
  phone:     string;
}

type BookingStep = "rooms" | "details" | "failed";

// ── Amenity icons ──────────────────────────────────────────────────────────────
const AMENITY_ICONS: Record<string, JSX.Element> = {
  "AC":                   <Wind className="w-4 h-4 text-blue-500" />,
  "WiFi":                 <Wifi className="w-4 h-4 text-blue-500" />,
  "Pool":                 <Waves className="w-4 h-4 text-blue-500" />,
  "Parking":              <Car className="w-4 h-4 text-blue-500" />,
  "Restaurant":           <Utensils className="w-4 h-4 text-blue-500" />,
  "Gym":                  <Dumbbell className="w-4 h-4 text-blue-500" />,
  "TV":                   <Tv className="w-4 h-4 text-blue-500" />,
  "Bar":                  <Coffee className="w-4 h-4 text-blue-500" />,
  "Spa":                  <span className="text-lg">✨</span>,
  "Beach Access":         <Waves className="w-4 h-4 text-blue-500" />,
  "Heritage Architecture":<span className="text-lg">🏛️</span>,
  "Yoga":                 <span className="text-lg">🧘</span>,
  "Room Service":         <span className="text-lg">🛎️</span>,
};

// ── Helpers ────────────────────────────────────────────────────────────────────
function formatDate(d: string) {
  if (!d) return "";
  try {
    return new Date(d + "T00:00:00").toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch { return d; }
}

function nightsBetween(checkin: string, checkout: string) {
  try {
    return Math.max(1, Math.round(
      (new Date(checkout).getTime() - new Date(checkin).getTime()) / 86400000,
    ));
  } catch { return 1; }
}

function validatePassenger(p: PassengerInfo): Partial<Record<keyof PassengerInfo, string>> {
  const e: Partial<Record<keyof PassengerInfo, string>> = {};
  if (!p.firstName.trim() || p.firstName.trim().length < 2) e.firstName = "Enter first name (min 2 chars)";
  if (!p.lastName.trim()  || p.lastName.trim().length  < 2) e.lastName  = "Enter last name (min 2 chars)";
  if (!p.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/))         e.email     = "Enter a valid email address";
  if (!p.phone.replace(/\D/g, "").match(/^\d{10}$/))         e.phone     = "Enter a 10-digit phone number";
  return e;
}

const PLACEHOLDER = "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80";

// ── Step indicator ─────────────────────────────────────────────────────────────
const STEP_LABELS: Record<string, string> = {
  rooms:   "Select Room",
  details: "Your Details",
  payment: "Payment",
};

function stepIndex(step: BookingStep): number {
  return ["rooms", "details", "failed"].indexOf(step);
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function HotelDetail() {
  const { id }          = useParams();
  const searchString    = useSearch();
  const [, setLocation] = useLocation();
  const { user, isAgent } = useAuth();

  const p          = new URLSearchParams(searchString);
  const checkin    = p.get("checkin")  || "";
  const checkout   = p.get("checkout") || "";
  const guests     = p.get("guests")   || "2";
  const nights     = nightsBetween(checkin, checkout);
  const urlRateKey = p.get("rateKey")  || null;


  // ── Hotel data resolution ──────────────────────────────
  const hotelFromParams = p.get("hotelName") ? {
    id:           parseInt(id || "0", 10) || 0,
    name:         p.get("hotelName")    || "Hotel",
    city:         p.get("city")         || "",
    location:     p.get("location")     || p.get("city") || "",
    stars:        parseInt(p.get("stars")        || "3", 10),
    rating:       parseFloat(p.get("rating")     || "4.0"),
    ratingCount:  parseInt(p.get("ratingCount")  || "0", 10),
    ratingLabel:  p.get("ratingLabel")  || "Good",
    pricePerNight: (() => {
      if (p.get("rawPrice")) return parseInt(p.get("rawPrice")!, 10);
      const pn = parseInt(p.get("pricePerNight") || "3000", 10);
      const mk = parseInt(p.get("markup")        || "0",    10);
      return mk > 0 ? pn - mk : pn;
    })(),
    amenities:    ["AC", "WiFi", "TV", "Parking"],
    images:       (() => {
      const img = p.get("image") ? decodeURIComponent(p.get("image")!) : "";
      return img ? [img] : [PLACEHOLDER];
    })(),
    description:  `${p.get("hotelName")} in ${p.get("city") || "India"} — rated ${p.get("rating") || "4.0"}/5 by guests.`,
    rateKey:      urlRateKey,
  } : null;

  const mockHotel = !hotelFromParams
    ? MOCK_HOTELS.find((h) => h.id === parseInt(id || "0", 10))
    : null;

  const hotel = hotelFromParams || mockHotel;

  // ── UI state ───────────────────────────────────────────
  const [activeImage,  setActiveImage]  = useState(0);
  const [step,         setStep]         = useState<BookingStep>("rooms");
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [hotelRooms,   setHotelRooms]   = useState<RoomOption[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<RoomOption | null>(null);
  const [roomsError,   setRoomsError]   = useState("");
  const [passenger,    setPassenger]    = useState<PassengerInfo>({
    firstName: "", lastName: "", email: "", phone: "",
  });
  const [formErrors,   setFormErrors]   = useState<Partial<Record<keyof PassengerInfo, string>>>({});
  const [bookingError, setBookingError] = useState("");

  // ── Pricing ────────────────────────────────────────────
  const agentMarkupFlat: number | null =
    isAgent && user?.agentMarkup !== undefined ? user.agentMarkup : null;
  const normalMarkup    = hotel ? getHiddenMarkupAmount(hotel.pricePerNight, "hotels") : 0;
  const effectiveMarkup = agentMarkupFlat !== null ? agentMarkupFlat : normalMarkup;

  const roomPrice  = selectedRoom ? selectedRoom.priceINR + effectiveMarkup : 0;
  const totalPrice = roomPrice * nights;
  const savings    =
    agentMarkupFlat !== null && normalMarkup > agentMarkupFlat
      ? (normalMarkup - agentMarkupFlat) * nights
      : null;

  // ── Normalise images ───────────────────────────────────
  const hotelImages: string[] =
    (hotel as any)?.images?.length  ? (hotel as any).images  :
    (hotel as any)?.photos?.length  ? (hotel as any).photos  :
    (hotel as any)?.imageUrl        ? [(hotel as any).imageUrl] :
    [PLACEHOLDER];

  // ── Fetch real rooms from HotelBeds ───────────────────
  useEffect(() => {
    if (!id || !checkin || !checkout) return;
    const hotelCode = parseInt(id);
    if (!hotelCode || isNaN(hotelCode)) return;

    setLoadingRooms(true);
    setRoomsError("");

    fetch(
      `/api/hotels/rooms?hotelCode=${hotelCode}&checkin=${checkin}&checkout=${checkout}&adults=${parseInt(guests) || 2}`,
    )
      .then((r) => r.json())
      .then((data) => {
        if (data.rooms?.length > 0) {
          setHotelRooms(data.rooms);
          setSelectedRoom(data.rooms[0]);
        } else {
          setRoomsError(data.message || "No rooms available for these dates.");
        }
      })
      .catch(() => setRoomsError("Could not load rooms. Please try again."))
      .finally(() => setLoadingRooms(false));
  }, [id, checkin, checkout, guests]);

  // ── Booking handler — save session and proceed to payment ─────────
  const handleBookNow = useCallback(() => {
    const errs = validatePassenger(passenger);
    if (Object.keys(errs).length > 0) { setFormErrors(errs); return; }
    setFormErrors({});

    if (!selectedRoom) {
      setBookingError("Please select a room first.");
      setStep("failed");
      return;
    }

    const rawPrice  = selectedRoom.priceINR;
    const convFee   = getConvenienceFee(rawPrice, "hotels") * nights;
    const baseFare  = roomPrice * nights;
    const totalBase = baseFare + convFee;

    saveBookingSession({
      type:      "hotel",
      hotelId:   String(hotel!.id),
      hotelName: hotel!.name,
      city:      hotel!.city,
      location:  hotel!.location,
      stars:     hotel!.stars,
      rating:    hotel!.rating,
      image:     hotelImages[0] || "",
      checkin,
      checkout,
      nights,
      guests:    parseInt(guests) || 2,
      roomType:  selectedRoom.name,
      rateKey:   selectedRoom.rateKey,
      holderFirstName: passenger.firstName,
      holderLastName:  passenger.lastName,
      guest: {
        name:  `${passenger.firstName} ${passenger.lastName}`.trim(),
        email: passenger.email,
        phone: passenger.phone,
      },
      rawPrice,
      markupAmt:    effectiveMarkup,
      baseFare,
      convFee,
      totalBase,
      isAgent:      isAgent || false,
      agentSavings: savings ?? 0,
      normalMarkup,
      agentId:      isAgent ? user?.id    : undefined,
      agentEmail:   isAgent ? user?.email : undefined,
    });

    setLocation("/booking/payment");
  }, [selectedRoom, passenger, hotel, nights, guests, roomPrice, hotelImages,
      checkin, checkout, effectiveMarkup, normalMarkup, savings, isAgent, user, setLocation]);

  // ── Hotel not found ────────────────────────────────────
  if (!hotel) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-24 text-center">
          <Building2 className="w-16 h-16 text-slate-200 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Hotel not found</h2>
          <p className="text-muted-foreground mb-6">This hotel doesn't exist or may have been removed.</p>
          <Button onClick={() => setLocation("/hotels")}>Browse Hotels</Button>
        </div>
      </Layout>
    );
  }

  // ── Render ─────────────────────────────────────────────
  return (
    <Layout>

      {/* ── Hotel header ── */}
      <div className="bg-gradient-to-br from-blue-700 to-indigo-800 text-white py-5 px-4">
        <div className="container mx-auto">
          <button
            onClick={() =>
              step === "details" ? setStep("rooms") : window.history.back()
            }
            className="flex items-center gap-1.5 text-blue-200 hover:text-white text-sm mb-3 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            {step === "details" ? "Back to rooms" : "Back to results"}
          </button>

          <h1 className="text-2xl font-extrabold">{hotel.name}</h1>
          <p className="text-blue-200 text-sm flex items-center gap-1 mt-1">
            <MapPin className="w-3.5 h-3.5" />{hotel.location}, {hotel.city}
          </p>

          {/* Progress steps */}
          <div className="flex items-center gap-2 mt-3">
            {(["rooms", "details", "payment"] as const).map((s, i) => {
              const active = (s === "rooms" && step === "rooms") || (s === "details" && step === "details");
              const done   = (s === "rooms" && step === "details");
              return (
                <div key={s} className="flex items-center gap-2">
                  <div className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                    active ? "bg-white text-blue-700" :
                    done   ? "bg-blue-400 text-white" : "bg-blue-600/60 text-blue-300",
                  )}>
                    {done ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                  </div>
                  <span className="text-xs text-blue-200 hidden sm:inline">
                    {STEP_LABELS[s]}
                  </span>
                  {i < 2 && <ChevronRight className="w-3 h-3 text-blue-400 shrink-0" />}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="bg-slate-50 min-h-screen">
        <div className="container mx-auto px-4 py-6">

          {/* ══════════════════════ STEP: ROOMS ═════════════════════ */}
          {step === "rooms" && (
            <div className="flex flex-col lg:flex-row gap-6">

              {/* Left */}
              <div className="flex-1 min-w-0 space-y-6">

                {/* Image gallery */}
                <Card className="overflow-hidden shadow-sm border">
                  <div className="relative">
                    <img
                      src={hotelImages[activeImage] ?? PLACEHOLDER}
                      alt={hotel.name}
                      className="w-full h-64 md:h-80 object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER; }}
                    />
                    <div className="absolute top-3 left-3 flex gap-1">
                      {Array.from({ length: hotel.stars }).map((_, i) => (
                        <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400 drop-shadow" />
                      ))}
                    </div>
                    <div className="absolute bottom-3 right-3 bg-green-600 text-white text-xs font-bold px-2 py-0.5 rounded-lg flex items-center gap-1">
                      <Star className="w-3 h-3 fill-white" />{hotel.rating}
                    </div>
                  </div>
                  {hotelImages.length > 1 && (
                    <div className="p-3 bg-slate-100 flex gap-2 overflow-x-auto">
                      {hotelImages.map((img, i) => (
                        <button
                          key={i}
                          onClick={() => setActiveImage(i)}
                          className={cn(
                            "w-20 h-14 rounded-lg overflow-hidden shrink-0 border-2 transition-all",
                            activeImage === i ? "border-blue-600 shadow-md" : "border-transparent hover:border-blue-300",
                          )}
                        >
                          <img
                            src={img}
                            alt=""
                            className="w-full h-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER; }}
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </Card>

                {/* Hotel info */}
                <Card className="shadow-sm border">
                  <CardContent className="p-6">
                    <p className="text-slate-600 text-sm leading-relaxed mb-5">{hotel.description}</p>
                    <h3 className="font-bold text-slate-900 mb-3 text-sm">Amenities</h3>
                    <div className="flex flex-wrap gap-2">
                      {hotel.amenities.map((a) => (
                        <div key={a} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 rounded-full border text-sm">
                          {AMENITY_ICONS[a] ?? <CheckCircle2 className="w-4 h-4 text-blue-500" />}
                          <span className="font-medium text-slate-700 text-xs">{a}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Available rooms */}
                <Card className="shadow-sm border">
                  <CardContent className="p-6">
                    <h3 className="font-bold text-slate-900 mb-4 text-base">Available Rooms</h3>

                    {loadingRooms ? (
                      <div className="flex items-center justify-center py-12 gap-3 text-slate-500">
                        <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                        <span className="text-sm">Checking availability…</span>
                      </div>
                    ) : hotelRooms.length === 0 ? (
                      <div className="text-center py-8 text-slate-500">
                        <BedDouble className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                        <p className="font-medium text-sm mb-1">No rooms available</p>
                        <p className="text-xs text-muted-foreground">
                          {roomsError || "Try different dates or another hotel."}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {hotelRooms.map((room) => (
                          <button
                            key={room.rateKey ?? room.code}
                            onClick={() => setSelectedRoom(room)}
                            className={cn(
                              "w-full text-left p-4 rounded-xl border-2 transition-all",
                              selectedRoom?.rateKey === room.rateKey && selectedRoom?.code === room.code
                                ? "border-blue-600 bg-blue-50"
                                : "border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50/40",
                            )}
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                                  <p className="font-bold text-slate-900 text-sm">{room.name}</p>
                                  {selectedRoom?.rateKey === room.rateKey && selectedRoom?.code === room.code && (
                                    <Badge className="bg-blue-600 text-white border-0 text-[10px] px-1.5">
                                      Selected
                                    </Badge>
                                  )}
                                  {room.refundable ? (
                                    <Badge className="bg-green-50 text-green-700 border border-green-200 text-[10px] px-1.5 font-medium">
                                      <ShieldCheck className="w-2.5 h-2.5 mr-0.5" />Free cancellation
                                    </Badge>
                                  ) : (
                                    <Badge className="bg-red-50 text-red-600 border border-red-200 text-[10px] px-1.5 font-medium">
                                      Non-refundable
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-slate-500 mb-1">{room.boardName}</p>
                                {room.cancellationDeadline && (
                                  <p className="text-[11px] text-slate-400">
                                    Free cancellation until {formatDate(room.cancellationDeadline.slice(0, 10))}
                                  </p>
                                )}
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-xl font-extrabold text-slate-900">
                                  ₹{(room.priceINR + effectiveMarkup).toLocaleString()}
                                </p>
                                <p className="text-[11px] text-muted-foreground">per night</p>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Right sidebar */}
              <div className="lg:w-80 shrink-0">
                <div className="sticky top-[80px]">
                  <Card className="shadow-sm border border-blue-200">
                    <CardContent className="p-5 space-y-4">
                      <h3 className="font-bold text-slate-900">Your Stay</h3>

                      <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                        {checkin && checkout && (
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-blue-500 shrink-0" />
                            <div>
                              <p className="font-semibold text-slate-800 text-xs">
                                {formatDate(checkin)} → {formatDate(checkout)}
                              </p>
                              <p className="text-muted-foreground text-[11px]">
                                {nights} night{nights > 1 ? "s" : ""} · {guests} guest{parseInt(guests) > 1 ? "s" : ""}
                              </p>
                            </div>
                          </div>
                        )}
                        {selectedRoom && (
                          <div className="flex items-center gap-2">
                            <BedDouble className="w-4 h-4 text-blue-500 shrink-0" />
                            <div>
                              <p className="font-semibold text-slate-800 text-xs">{selectedRoom.name}</p>
                              <p className="text-muted-foreground text-[11px]">{selectedRoom.boardName}</p>
                            </div>
                          </div>
                        )}
                      </div>

                      {selectedRoom ? (
                        <>
                          {savings !== null && savings > 0 && (
                            <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-xs">
                              <p className="font-bold text-green-800">Agent savings: ₹{savings.toLocaleString()}</p>
                            </div>
                          )}

                          <div className="space-y-1.5 text-sm">
                            <div className="flex justify-between text-slate-600">
                              <span>
                                ₹{(selectedRoom.priceINR + effectiveMarkup).toLocaleString()} × {nights} night{nights > 1 ? "s" : ""}
                              </span>
                              <span className="font-semibold">₹{totalPrice.toLocaleString()}</span>
                            </div>
                          </div>

                          <div className="pt-3 border-t">
                            <div className="flex justify-between items-center">
                              <span className="font-bold text-slate-900">Total</span>
                              <span className="text-2xl font-extrabold text-slate-900">₹{totalPrice.toLocaleString()}</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground text-right mt-0.5">
                              for {nights} night{nights > 1 ? "s" : ""}
                            </p>
                          </div>

                          {selectedRoom.rateKey ? (
                            <Button
                              onClick={() => { setStep("details"); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                              className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold gap-2"
                            >
                              Continue to Details <ChevronRight className="w-4 h-4" />
                            </Button>
                          ) : (
                            <div className="text-center text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
                              Online booking unavailable for this property. Please contact us.
                            </div>
                          )}

                          <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                            Free cancellation before check-in
                          </div>
                        </>
                      ) : !loadingRooms ? (
                        <p className="text-sm text-center text-muted-foreground py-2">
                          Select a room to continue
                        </p>
                      ) : null}
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════ STEP: DETAILS ═══════════════════ */}
          {step === "details" && (
            <div className="flex flex-col lg:flex-row gap-6">

              {/* Left: Passenger form */}
              <div className="flex-1 min-w-0">
                <Card className="shadow-sm border">
                  <CardContent className="p-6 space-y-6">
                    <h3 className="font-bold text-slate-900 text-base">Lead Guest Details</h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                      {/* First Name */}
                      <div className="space-y-1.5">
                        <Label htmlFor="firstName" className="text-sm font-medium text-slate-700">
                          First Name <span className="text-red-500">*</span>
                        </Label>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <Input
                            id="firstName"
                            placeholder="John"
                            value={passenger.firstName}
                            onChange={(e) => {
                              setPassenger((prev) => ({ ...prev, firstName: e.target.value }));
                              setFormErrors((prev) => ({ ...prev, firstName: "" }));
                            }}
                            className={cn("pl-9", formErrors.firstName && "border-red-400 focus-visible:ring-red-300")}
                          />
                        </div>
                        {formErrors.firstName && (
                          <p className="text-xs text-red-500">{formErrors.firstName}</p>
                        )}
                      </div>

                      {/* Last Name */}
                      <div className="space-y-1.5">
                        <Label htmlFor="lastName" className="text-sm font-medium text-slate-700">
                          Last Name <span className="text-red-500">*</span>
                        </Label>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <Input
                            id="lastName"
                            placeholder="Doe"
                            value={passenger.lastName}
                            onChange={(e) => {
                              setPassenger((prev) => ({ ...prev, lastName: e.target.value }));
                              setFormErrors((prev) => ({ ...prev, lastName: "" }));
                            }}
                            className={cn("pl-9", formErrors.lastName && "border-red-400 focus-visible:ring-red-300")}
                          />
                        </div>
                        {formErrors.lastName && (
                          <p className="text-xs text-red-500">{formErrors.lastName}</p>
                        )}
                      </div>

                      {/* Email */}
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label htmlFor="email" className="text-sm font-medium text-slate-700">
                          Email Address <span className="text-red-500">*</span>
                        </Label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <Input
                            id="email"
                            type="email"
                            placeholder="john@example.com"
                            value={passenger.email}
                            onChange={(e) => {
                              setPassenger((prev) => ({ ...prev, email: e.target.value }));
                              setFormErrors((prev) => ({ ...prev, email: "" }));
                            }}
                            className={cn("pl-9", formErrors.email && "border-red-400 focus-visible:ring-red-300")}
                          />
                        </div>
                        {formErrors.email && (
                          <p className="text-xs text-red-500">{formErrors.email}</p>
                        )}
                      </div>

                      {/* Phone */}
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label htmlFor="phone" className="text-sm font-medium text-slate-700">
                          Phone Number <span className="text-red-500">*</span>
                        </Label>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <Input
                            id="phone"
                            type="tel"
                            placeholder="9876543210"
                            value={passenger.phone}
                            onChange={(e) => {
                              setPassenger((prev) => ({
                                ...prev,
                                phone: e.target.value.replace(/\D/g, "").slice(0, 10),
                              }));
                              setFormErrors((prev) => ({ ...prev, phone: "" }));
                            }}
                            className={cn("pl-9", formErrors.phone && "border-red-400 focus-visible:ring-red-300")}
                          />
                        </div>
                        {formErrors.phone && (
                          <p className="text-xs text-red-500">{formErrors.phone}</p>
                        )}
                      </div>
                    </div>

                    <div className="pt-2 space-y-2">
                      <Button
                        onClick={handleBookNow}
                        className="w-full h-12 bg-orange-500 hover:bg-orange-600 text-white font-bold gap-2 text-base"
                      >
                        Continue to Payment <ChevronRight className="w-5 h-5" />
                      </Button>
                      <p className="text-[11px] text-center text-muted-foreground">
                        You'll complete payment securely via Razorpay on the next step.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Right: Booking summary */}
              <div className="lg:w-80 shrink-0">
                <div className="sticky top-[80px]">
                  <Card className="shadow-sm border border-blue-200">
                    <CardContent className="p-5 space-y-4">
                      <h3 className="font-bold text-slate-900">Booking Summary</h3>

                      <div className="space-y-3">
                        <div className="flex items-start gap-2.5">
                          <Building2 className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                          <div>
                            <p className="font-semibold text-slate-800 text-sm">{hotel.name}</p>
                            <p className="text-xs text-muted-foreground">{hotel.location}, {hotel.city}</p>
                          </div>
                        </div>

                        {selectedRoom && (
                          <div className="flex items-start gap-2.5">
                            <BedDouble className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                            <div>
                              <p className="font-semibold text-slate-800 text-sm">{selectedRoom.name}</p>
                              <p className="text-xs text-muted-foreground">{selectedRoom.boardName}</p>
                              {selectedRoom.refundable ? (
                                <p className="text-[11px] text-green-600 font-medium mt-0.5">Free cancellation</p>
                              ) : (
                                <p className="text-[11px] text-red-500 font-medium mt-0.5">Non-refundable</p>
                              )}
                            </div>
                          </div>
                        )}

                        <div className="flex items-start gap-2.5">
                          <Calendar className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                          <div>
                            <p className="font-semibold text-slate-800 text-sm">
                              {formatDate(checkin)} → {formatDate(checkout)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {nights} night{nights > 1 ? "s" : ""} · {guests} guest{parseInt(guests) > 1 ? "s" : ""}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2.5">
                          <Users className="w-4 h-4 text-blue-500 shrink-0" />
                          <p className="text-sm text-slate-600">
                            {passenger.firstName || passenger.lastName
                              ? `${passenger.firstName} ${passenger.lastName}`.trim()
                              : "Guest details not entered yet"}
                          </p>
                        </div>
                      </div>

                      <div className="pt-3 border-t space-y-1.5 text-sm">
                        {selectedRoom && (
                          <div className="flex justify-between text-slate-600">
                            <span>₹{(selectedRoom.priceINR + effectiveMarkup).toLocaleString()} × {nights}n</span>
                            <span className="font-semibold">₹{totalPrice.toLocaleString()}</span>
                          </div>
                        )}
                        {savings !== null && savings > 0 && (
                          <div className="flex justify-between text-green-600 text-xs">
                            <span>Agent discount</span>
                            <span>-₹{savings.toLocaleString()}</span>
                          </div>
                        )}
                        <div className="flex justify-between items-center pt-1.5 border-t">
                          <span className="font-bold text-slate-900">Total</span>
                          <span className="text-xl font-extrabold text-slate-900">₹{totalPrice.toLocaleString()}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════ STEP: FAILED ════════════════════ */}
          {step === "failed" && (
            <div className="max-w-lg mx-auto py-10">
              <Card className="shadow-md border border-red-200 overflow-hidden">
                <div className="bg-red-50 border-b border-red-100 p-6 text-center">
                  <XCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
                  <h2 className="text-xl font-bold text-red-700">Booking Failed</h2>
                  <p className="text-red-600 text-sm mt-2">{bookingError}</p>
                </div>
                <CardContent className="p-6 space-y-3">
                  <Button
                    onClick={() => { setStep("details"); setBookingError(""); }}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold"
                  >
                    Try Again
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => { setStep("rooms"); setBookingError(""); }}
                    className="w-full"
                  >
                    Change Room
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}

        </div>
      </div>
    </Layout>
  );
}
