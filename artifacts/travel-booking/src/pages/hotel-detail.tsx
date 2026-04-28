import { useState, useCallback } from "react";
import type { JSX } from "react";
import { useParams, useLocation, useSearch } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { getHiddenMarkupAmount } from "@/lib/pricing";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Building2, Star, MapPin, ArrowLeft, Wifi, Car, Utensils, Waves,
  Dumbbell, Wind, Tv, Coffee, CheckCircle2, ChevronRight, Users, Calendar, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MOCK_HOTELS } from "./hotel-results";

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

function getRooms(basePrice: number, rateKey: string | null) {
  return [
    {
      type:      "Standard",
      price:     basePrice,
      capacity:  2,
      amenities: ["Non-AC", "WiFi", "TV"],
      desc:      "Comfortable room with modern amenities and great city views.",
      rateKey,
    },
    {
      type:      "Deluxe",
      price:     Math.round(basePrice * 1.4),
      capacity:  2,
      amenities: ["AC", "WiFi", "TV", "Mini Bar"],
      desc:      "Spacious deluxe room with premium furnishings and en-suite bathroom.",
      rateKey,
    },
    {
      type:      "Suite",
      price:     Math.round(basePrice * 2.2),
      capacity:  4,
      amenities: ["AC", "WiFi", "TV", "Mini Bar", "Jacuzzi", "City View"],
      desc:      "Expansive suite with separate living area, Jacuzzi, and panoramic views.",
      rateKey,
    },
  ];
}

function formatDate(d: string) {
  if (!d) return "";
  try {
    return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return d; }
}

function nightsBetween(checkin: string, checkout: string) {
  try {
    const d1 = new Date(checkin), d2 = new Date(checkout);
    return Math.max(1, Math.round((d2.getTime() - d1.getTime()) / 86400000));
  } catch { return 1; }
}

export default function HotelDetail() {
  const { id }         = useParams();
  const searchString   = useSearch();
  const [, setLocation]= useLocation();
  const { user, isAgent } = useAuth();

  const p         = new URLSearchParams(searchString);
  const checkin   = p.get("checkin")   || "";
  const checkout  = p.get("checkout")  || "";
  const guests    = p.get("guests")    || "1";
  const nights    = nightsBetween(checkin, checkout);
  const urlRateKey = p.get("rateKey")  || null;

  console.log("Selected Hotel ID:", id);

  // URL params are the authoritative source — they are set by the results page
  // and carry the exact hotel data the user clicked on.
  // Only fall back to MOCK_HOTELS when no params are present (direct URL access).
  const hotelFromParams = p.get("hotelName") ? {
    id:           parseInt(id || "0", 10) || 0,
    name:         p.get("hotelName")    || "Hotel",
    city:         p.get("city")         || "",
    location:     p.get("location")     || p.get("city") || "",
    stars:        parseInt(p.get("stars") || "3", 10),
    rating:       parseFloat(p.get("rating") || "4.0"),
    ratingCount:  parseInt(p.get("ratingCount") || "0", 10),
    ratingLabel:  p.get("ratingLabel")  || "Good",
    // rawPrice = pre-markup price; fall back to (pricePerNight - markup) or pricePerNight
    pricePerNight: (() => {
      if (p.get("rawPrice")) return parseInt(p.get("rawPrice")!, 10);
      const pn = parseInt(p.get("pricePerNight") || "3000", 10);
      const mk = parseInt(p.get("markup") || "0", 10);
      return mk > 0 ? pn - mk : pn;
    })(),
    amenities:    ["AC", "WiFi", "TV", "Parking"],
    images:       (() => {
      const img = p.get("image") ? decodeURIComponent(p.get("image")!) : "";
      return img
        ? [img]
        : ["https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80"];
    })(),
    description:  `${p.get("hotelName")} in ${p.get("city") || "India"} — rated ${p.get("rating") || "4.0"}/5 by guests.`,
  } : null;

  // MOCK_HOTELS used only when no URL params (e.g. direct URL access like /hotels/2)
  const mockHotel = !hotelFromParams
    ? MOCK_HOTELS.find((h) => h.id === parseInt(id || "0", 10))
    : null;

  const hotel = hotelFromParams || mockHotel;

  const [activeImage,    setActiveImage]   = useState(0);
  const [selectedRoomType, setSelectedRoomType] = useState<string>("Deluxe");
  const [bookingState,   setBookingState]  = useState<"idle" | "loading" | "success" | "error">("idle");
  const [bookingError,   setBookingError]  = useState<string>("");
  const [bookingRef,     setBookingRef]    = useState<string>("");

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

  const agentMarkupFlat: number | null = (isAgent && user?.agentMarkup !== undefined) ? user.agentMarkup : null;
  const normalMarkup    = getHiddenMarkupAmount(hotel.pricePerNight, "hotels");
  const effectiveMarkup = agentMarkupFlat !== null ? agentMarkupFlat : normalMarkup;
  const hotelRateKey    = urlRateKey ?? (hotel as any).rateKey ?? null;
  const rooms           = getRooms(hotel.pricePerNight + effectiveMarkup, hotelRateKey);
  const chosen          = rooms.find((r) => r.type === selectedRoomType) ?? rooms[1];
  const totalPrice      = chosen.price * nights;
  const savings         = (agentMarkupFlat !== null && normalMarkup > agentMarkupFlat)
    ? (normalMarkup - agentMarkupFlat) * nights : null;

  // Normalise image list — backend may return imageUrl / photos / images depending on source
  const PLACEHOLDER = "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80";
  const hotelImages: string[] =
    (hotel as any).images?.length   ? (hotel as any).images  :
    (hotel as any).photos?.length   ? (hotel as any).photos  :
    (hotel as any).imageUrl         ? [(hotel as any).imageUrl] :
    [PLACEHOLDER];

  const handleBookNow = useCallback(async () => {
    console.log("Selected Room:", { type: chosen.type, price: chosen.price, rateKey: chosen.rateKey });

    if (!chosen.rateKey) {
      setBookingState("error");
      setBookingError("Room selection failed. Please try again.");
      return;
    }

    setBookingState("loading");
    setBookingError("");

    try {
      const res = await fetch("/api/hotels/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rateKey:   chosen.rateKey,
          hotelId:   hotel!.id,
          hotelName: hotel!.name,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setBookingError(data?.error || `Booking failed (${res.status}). Please try again.`);
        setBookingState("error");
        return;
      }

      const ref =
        data?.booking?.reference        ||
        data?.booking?.bookingReference ||
        data?.booking?.clientReference  ||
        `DFG-${Date.now()}`;

      setBookingRef(ref);
      setBookingState("success");
    } catch (err: any) {
      setBookingError("Network error. Please check your connection and try again.");
      setBookingState("error");
    }
  }, [chosen, hotel]);

  return (
    <Layout>
      <div className="bg-gradient-to-br from-blue-700 to-indigo-800 text-white py-5 px-4">
        <div className="container mx-auto">
          <button
            onClick={() => window.history.back()}
            className="flex items-center gap-1.5 text-blue-200 hover:text-white text-sm mb-3 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to results
          </button>
          <h1 className="text-2xl font-extrabold">{hotel.name}</h1>
          <p className="text-blue-200 text-sm flex items-center gap-1 mt-1">
            <MapPin className="w-3.5 h-3.5" />{hotel.location}, {hotel.city}
          </p>
        </div>
      </div>

      <div className="bg-slate-50 min-h-screen">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col lg:flex-row gap-6">

            {/* ── Left ── */}
            <div className="flex-1 min-w-0 space-y-6">

              {/* Image Gallery */}
              <Card className="overflow-hidden shadow-sm border">
                <div className="relative">
                  <img
                    src={hotelImages[activeImage] ?? PLACEHOLDER}
                    alt={hotel.name}
                    className="w-full h-72 md:h-96 object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = PLACEHOLDER;
                    }}
                  />
                  <div className="absolute top-3 left-3 flex gap-1.5">
                    {Array.from({ length: hotel.stars }).map((_, i) => (
                      <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400 drop-shadow" />
                    ))}
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
                          activeImage === i ? "border-blue-600 shadow-md scale-105" : "border-transparent hover:border-blue-300"
                        )}
                      >
                        <img
                          src={img}
                          alt=""
                          className="w-full h-full object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=200&q=60"; }}
                        />
                      </button>
                    ))}
                  </div>
                )}
              </Card>

              {/* Hotel Info */}
              <Card className="shadow-sm border">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h2 className="text-xl font-bold text-slate-900">{hotel.name}</h2>
                      <p className="text-muted-foreground text-sm flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3.5 h-3.5" />{hotel.location}, {hotel.city}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 bg-green-600 text-white font-bold px-3 py-1 rounded-lg text-sm">
                      <Star className="w-3.5 h-3.5 fill-white" />{hotel.rating}
                    </div>
                  </div>

                  <p className="text-slate-600 text-sm leading-relaxed mb-5">{hotel.description}</p>

                  {/* Amenities grid */}
                  <h3 className="font-bold text-slate-900 mb-3">All Amenities</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {hotel.amenities.map((a) => (
                      <div key={a} className="flex items-center gap-2.5 p-2.5 bg-slate-50 rounded-xl border">
                        <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                          {AMENITY_ICONS[a] ?? <CheckCircle2 className="w-4 h-4 text-blue-500" />}
                        </div>
                        <span className="text-sm font-medium text-slate-700">{a}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Room Types */}
              <Card className="shadow-sm border">
                <CardContent className="p-6">
                  <h3 className="font-bold text-slate-900 mb-4 text-base">Available Room Types</h3>
                  <div className="space-y-3">
                    {rooms.map((room) => (
                      <button
                        key={room.type}
                        onClick={() => {
                          setSelectedRoomType(room.type);
                          setBookingState("idle");
                          setBookingError("");
                        }}
                        className={cn(
                          "w-full text-left p-4 rounded-xl border-2 transition-all",
                          selectedRoomType === room.type
                            ? "border-blue-600 bg-blue-50"
                            : "border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50/50"
                        )}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-bold text-slate-900">{room.type} Room</p>
                              {selectedRoomType === room.type && (
                                <Badge className="bg-blue-600 text-white border-0 text-[10px]">Selected</Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mb-2">{room.desc}</p>
                            <div className="flex flex-wrap gap-1.5">
                              <span className="text-[11px] text-slate-500 flex items-center gap-0.5">
                                <Users className="w-3 h-3" /> Up to {room.capacity} guests
                              </span>
                              {room.amenities.map((a) => (
                                <span key={a} className="text-[11px] px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-100">{a}</span>
                              ))}
                            </div>
                          </div>
                          <div className="text-right ml-4 shrink-0">
                            <p className="text-xl font-extrabold text-slate-900">₹{room.price.toLocaleString()}</p>
                            <p className="text-[11px] text-muted-foreground">per night</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* ── Right: Booking sidebar ── */}
            <div className="lg:w-80 shrink-0">
              <div className="sticky top-[80px] space-y-4">
                <Card className="shadow-sm border border-blue-200">
                  <CardContent className="p-5 space-y-4">
                    <h3 className="font-bold text-slate-900">Book This Room</h3>

                    <div className="bg-slate-50 rounded-xl p-4 space-y-3">
                      <div className="flex items-center gap-2 text-sm">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                          <Building2 className="w-4 h-4 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800 text-xs">{chosen.type} Room</p>
                          <p className="text-muted-foreground text-[11px]">{chosen.amenities.join(" · ")}</p>
                        </div>
                      </div>

                      {checkin && checkout && (
                        <div className="flex items-center gap-2 text-sm">
                          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                            <Calendar className="w-4 h-4 text-blue-600" />
                          </div>
                          <div>
                            <p className="font-semibold text-slate-800 text-xs">{formatDate(checkin)} → {formatDate(checkout)}</p>
                            <p className="text-muted-foreground text-[11px]">{nights} night{nights > 1 ? "s" : ""} · {guests} guest{parseInt(guests) > 1 ? "s" : ""}</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {savings !== null && savings > 0 && (
                      <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-xs">
                        <p className="font-bold text-green-800">Agent savings: ₹{savings.toLocaleString()}</p>
                        <p className="text-green-600 mt-0.5">Exclusive B2B pricing applied</p>
                      </div>
                    )}

                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-600">₹{chosen.price.toLocaleString()} × {nights} night{nights > 1 ? "s" : ""}</span>
                        <span className="font-semibold">₹{totalPrice.toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="pt-3 border-t">
                      <div className="flex justify-between items-center mb-0.5">
                        <span className="font-bold text-slate-900">Total</span>
                        <span className="text-2xl font-extrabold text-slate-900">₹{totalPrice.toLocaleString()}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground text-right">Convenience fee applied at payment</p>
                    </div>

                    {bookingState === "success" ? (
                      <div className="bg-green-50 border border-green-300 rounded-xl p-4 text-center space-y-1">
                        <CheckCircle2 className="w-8 h-8 text-green-600 mx-auto" />
                        <p className="font-bold text-green-800 text-sm">Booking Confirmed!</p>
                        <p className="text-green-700 text-xs">Reference: <strong>{bookingRef}</strong></p>
                        <p className="text-green-600 text-[11px]">A confirmation will be sent to your registered email.</p>
                      </div>
                    ) : (
                      <>
                        {bookingState === "error" && bookingError && (
                          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">
                            {bookingError}
                          </div>
                        )}
                        <Button
                          onClick={handleBookNow}
                          disabled={bookingState === "loading"}
                          className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold gap-2 disabled:opacity-70"
                        >
                          {bookingState === "loading" ? (
                            <><Loader2 className="w-4 h-4 animate-spin" /> Confirming Booking...</>
                          ) : (
                            <>Book Now <ChevronRight className="w-4 h-4" /></>
                          )}
                        </Button>
                        <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                          Free cancellation before check-in
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>

                {/* Journey quick info */}
                {(checkin || guests) && (
                  <Card className="shadow-sm border">
                    <CardContent className="p-4 space-y-2 text-sm text-slate-600">
                      {checkin && <div className="flex gap-2"><Calendar className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" /><span>Check-in: <strong>{formatDate(checkin)}</strong></span></div>}
                      {checkout && <div className="flex gap-2"><Calendar className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" /><span>Check-out: <strong>{formatDate(checkout)}</strong></span></div>}
                      {guests && <div className="flex gap-2"><Users className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" /><span>{guests} guest{parseInt(guests) > 1 ? "s" : ""}</span></div>}
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    </Layout>
  );
}
