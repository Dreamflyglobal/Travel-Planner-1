import { useState, useEffect } from "react";
import type { JSX } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { useAbandonedLeadTracker } from "@/hooks/use-abandoned-lead-tracker";
import { useMarketing } from "@/hooks/use-marketing";
import { getHiddenMarkupAmount } from "@/lib/pricing";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Building2, SlidersHorizontal, Star, MapPin, Calendar, Users,
  Wifi, Car, Utensils, Waves, Dumbbell, Wind, Tv, Coffee,
  ArrowRight, Pencil, Filter, IndianRupee, ChevronRight,
  WifiOff, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

import type { Hotel } from "@/services/hotelService";
import { fetchHotels } from "@/services/hotelService";

// Mock data removed — hotels are now fetched via /services/hotelService.ts.
// Kept as a mutable export so other pages (hotel-detail.tsx) can still resolve
// the most recently loaded list when navigating to /hotels/:id directly.
export let MOCK_HOTELS: Hotel[] = [];

const AMENITY_ICONS: Record<string, JSX.Element> = {
  "AC":                   <Wind className="w-3 h-3" />,
  "WiFi":                 <Wifi className="w-3 h-3" />,
  "Pool":                 <Waves className="w-3 h-3" />,
  "Parking":              <Car className="w-3 h-3" />,
  "Restaurant":           <Utensils className="w-3 h-3" />,
  "Gym":                  <Dumbbell className="w-3 h-3" />,
  "TV":                   <Tv className="w-3 h-3" />,
  "Bar":                  <Coffee className="w-3 h-3" />,
  "Spa":                  <span className="text-[10px]">✨</span>,
  "Beach Access":         <Waves className="w-3 h-3" />,
  "Heritage Architecture":<span className="text-[10px]">🏛️</span>,
  "Yoga":                 <span className="text-[10px]">🧘</span>,
  "Room Service":         <span className="text-[10px]">🛎️</span>,
};

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

function starLabel(r: number) {
  if (r >= 4.5) return { label: "Exceptional", color: "text-green-700 bg-green-50 border-green-200" };
  if (r >= 4.0) return { label: "Excellent",   color: "text-green-700 bg-green-50 border-green-200" };
  if (r >= 3.5) return { label: "Very Good",   color: "text-blue-700 bg-blue-50 border-blue-200" };
  return            { label: "Good",           color: "text-slate-600 bg-slate-50 border-slate-200" };
}

export default function HotelResults() {
  const searchString = useSearch();
  const [, setLocation] = useLocation();
  const p = new URLSearchParams(searchString);
  const city    = p.get("city")     || "";
  const checkin = p.get("checkin")  || "";
  const checkout= p.get("checkout") || "";
  const guests  = p.get("guests")   || "1";

  const { user, isAgent } = useAuth();
  useAbandonedLeadTracker("hotel");
  const { fireSearchEvent } = useMarketing();
  useEffect(() => {
    fireSearchEvent({ searchType: "hotel", from: city, to: city });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const agentMarkupFlat: number | null = (isAgent && user?.agentMarkup !== undefined) ? user.agentMarkup : null;

  const nights = nightsBetween(checkin, checkout);

  // ── Fetch hotels from /services/hotelService.ts (axios → API) ─────────────
  const [allHotels, setAllHotels] = useState<Hotel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError]     = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const refetch = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setIsError(false);
    fetchHotels()
      .then((list) => {
        if (cancelled) return;
        setAllHotels(list);
        // Update the shared export so direct-link detail pages can resolve items.
        MOCK_HOTELS = list;
        setIsLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setIsError(true);
        setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const hotels: any[] = allHotels.filter((h) => {
    if (!city) return true;
    return h.city.toLowerCase().includes(city.toLowerCase()) ||
           city.toLowerCase().includes(h.city.toLowerCase());
  });

  const fallbackMessage: string | null = null;

  const allAmenities = Array.from(new Set(hotels.flatMap((h) => h.amenities ?? [])));
  const starOptions  = [3, 4, 5];

  const [priceRange,       setPriceRange]       = useState([0, 20000]);
  const [selectedStars,    setSelectedStars]    = useState<number[]>([]);
  const [selectedAmenities,setSelectedAmenities]= useState<string[]>([]);
  const [sortBy,           setSortBy]           = useState<"cheapest" | "rating" | "popular">("cheapest");
  const [showMobileFilter, setShowMobileFilter] = useState(false);

  const clearFilters = () => { setSelectedStars([]); setSelectedAmenities([]); setPriceRange([0, 20000]); };
  const activeCount  = selectedStars.length + selectedAmenities.length + (priceRange[0] > 0 || priceRange[1] < 20000 ? 1 : 0);

  const filtered = hotels.filter((h) => {
    const mk         = agentMarkupFlat !== null ? agentMarkupFlat : getHiddenMarkupAmount(h.pricePerNight, "hotels");
    const totalPerNight = h.pricePerNight + mk;
    const inPrice    = totalPerNight >= priceRange[0] && totalPerNight <= priceRange[1];
    const inStars    = selectedStars.length === 0 || selectedStars.includes(h.stars);
    const inAmenity  = selectedAmenities.length === 0 || selectedAmenities.every((a) => h.amenities.includes(a));
    return inPrice && inStars && inAmenity;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "cheapest") {
      const mkA = agentMarkupFlat !== null ? agentMarkupFlat : getHiddenMarkupAmount(a.pricePerNight, "hotels");
      const mkB = agentMarkupFlat !== null ? agentMarkupFlat : getHiddenMarkupAmount(b.pricePerNight, "hotels");
      return (a.pricePerNight + mkA) - (b.pricePerNight + mkB);
    }
    if (sortBy === "rating")  return b.rating - a.rating;
    if (sortBy === "popular") return b.ratingCount - a.ratingCount;
    return 0;
  });

  const FiltersPanel = () => (
    <Card className="sticky top-[72px] shadow-sm border">
      <CardContent className="p-5 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm flex items-center gap-2"><SlidersHorizontal className="w-4 h-4" />Filters</h3>
          {activeCount > 0 && <button onClick={clearFilters} className="text-xs text-blue-600 font-semibold hover:underline">Clear All</button>}
        </div>

        {/* Price */}
        <div className="pb-5 border-b">
          <h4 className="font-semibold mb-3 text-xs uppercase tracking-wide text-muted-foreground">Price per Night</h4>
          <Slider value={priceRange} onValueChange={setPriceRange} min={0} max={20000} step={200} className="mb-3" />
          <div className="flex justify-between text-sm font-bold">
            <span className="text-blue-600">₹{priceRange[0].toLocaleString()}</span>
            <span className="text-muted-foreground text-xs">to</span>
            <span className="text-blue-600">₹{priceRange[1].toLocaleString()}</span>
          </div>
        </div>

        {/* Stars */}
        <div className="pb-5 border-b">
          <h4 className="font-semibold mb-3 text-xs uppercase tracking-wide text-muted-foreground">Star Rating</h4>
          <div className="flex gap-2 flex-wrap">
            {starOptions.map((s) => (
              <button
                key={s}
                onClick={() => setSelectedStars((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])}
                className={cn(
                  "flex items-center gap-1 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all",
                  selectedStars.includes(s)
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white hover:border-blue-400 hover:bg-blue-50"
                )}
              >
                {Array.from({ length: s }).map((_, i) => <Star key={i} className="w-3 h-3 fill-current" />)}
                <span>{s}★</span>
              </button>
            ))}
          </div>
        </div>

        {/* Amenities */}
        <div>
          <h4 className="font-semibold mb-3 text-xs uppercase tracking-wide text-muted-foreground">Amenities</h4>
          <div className="space-y-2.5 max-h-52 overflow-y-auto pr-1">
            {["AC", "WiFi", "Pool", "Parking", "Restaurant", "Gym", "Spa"].map((a) => (
              <label key={a} className="flex items-center gap-2.5 cursor-pointer group">
                <Checkbox
                  checked={selectedAmenities.includes(a)}
                  onCheckedChange={() =>
                    setSelectedAmenities((prev) =>
                      prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]
                    )
                  }
                  className="rounded"
                />
                <span className="text-sm group-hover:text-blue-600 transition-colors flex items-center gap-1.5">
                  {AMENITY_ICONS[a] ?? null}{a}
                </span>
              </label>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Top bar */}
      <header className="sticky top-0 z-40 bg-white border-b shadow-sm">
        <div className="container mx-auto px-4 h-[60px] flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1.5 shrink-0 group">
            <div className="w-7 h-7 rounded-md bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
              <Building2 className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-base bg-gradient-to-r from-blue-600 to-indigo-700 bg-clip-text text-transparent hidden sm:block">Dream Fly Global</span>
          </Link>

          <div className="w-px h-6 bg-border shrink-0" />

          <div className="flex items-center gap-2 flex-1 overflow-x-auto min-w-0">
            {city && (
              <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-100 rounded-lg px-3 py-1.5 shrink-0">
                <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span className="font-bold text-sm text-blue-900">{city}</span>
              </div>
            )}
            {checkin && checkout && (
              <div className="flex items-center gap-1.5 bg-muted/60 border rounded-lg px-3 py-1.5 shrink-0">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium">{formatDate(checkin)} → {formatDate(checkout)}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 bg-muted/60 border rounded-lg px-3 py-1.5 shrink-0">
              <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium">{guests} Guest{parseInt(guests) > 1 ? "s" : ""}</span>
            </div>
          </div>

          <Button
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold shrink-0 gap-1.5"
            onClick={() => setLocation(`/hotels?city=${encodeURIComponent(city)}&checkin=${checkin}&checkout=${checkout}&guests=${guests}`)}
          >
            <Pencil className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Modify</span>
          </Button>
        </div>
      </header>

      <div className="flex-1">
        <div className="container mx-auto px-4 py-5">
          <div className="flex flex-col lg:flex-row gap-5">
            {/* Sidebar */}
            <aside className="hidden lg:block w-64 shrink-0">{FiltersPanel()}</aside>

            {/* Results */}
            <main className="flex-1 min-w-0">

              {/* Data source banner — driven by hotelService (axios) */}
              <div className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium mb-4 border",
                isLoading
                  ? "bg-blue-50 border-blue-200 text-blue-700"
                  : isError
                  ? "bg-rose-50 border-rose-200 text-rose-700"
                  : "bg-green-50 border-green-200 text-green-700"
              )}>
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                    <span>Loading hotels{city ? ` in ${city}` : ""}…</span>
                  </>
                ) : isError ? (
                  <>
                    <WifiOff className="w-4 h-4 shrink-0" />
                    <span>Failed to load hotels. Please try again.</span>
                    <button onClick={() => refetch()} className="ml-auto flex items-center gap-1 font-semibold underline underline-offset-2 hover:opacity-80">
                      <RefreshCw className="w-3.5 h-3.5" /> Retry
                    </button>
                  </>
                ) : (
                  <>
                    <Wifi className="w-4 h-4 shrink-0" />
                    <span className="font-semibold">Showing {hotels.length} hotels</span>
                    <span className="text-green-600/70 text-xs">· Live data</span>
                  </>
                )}
              </div>

              {/* Loading skeletons */}
              {isLoading && (
                <div className="space-y-4">
                  {[1, 2, 3, 4].map((i) => (
                    <Card key={i} className="overflow-hidden">
                      <div className="flex">
                        <Skeleton className="w-48 h-40 shrink-0 rounded-none" />
                        <CardContent className="p-4 flex-1 space-y-3">
                          <Skeleton className="h-5 w-2/3" />
                          <Skeleton className="h-4 w-1/3" />
                          <Skeleton className="h-4 w-1/2" />
                          <Skeleton className="h-8 w-28 mt-4" />
                        </CardContent>
                      </div>
                    </Card>
                  ))}
                </div>
              )}

              {/* Results header */}
              {!isLoading && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-800">
                      {sorted.length} hotel{sorted.length !== 1 ? "s" : ""} found
                      {city && <span className="text-muted-foreground font-normal text-sm ml-2">in {city}</span>}
                    </h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {nights} night{nights !== 1 ? "s" : ""} · {guests} guest{parseInt(guests) > 1 ? "s" : ""} · Taxes included
                    </p>
                  </div>
                  <Button variant="outline" size="sm" className="lg:hidden gap-1.5" onClick={() => setShowMobileFilter(!showMobileFilter)}>
                    <Filter className="w-4 h-4" /> Filters {activeCount > 0 && `(${activeCount})`}
                  </Button>
                </div>
              )}

              {/* Sort chips */}
              {!isLoading && (
                <div className="flex gap-2 mb-4 bg-white border rounded-xl p-3 shadow-sm flex-wrap">
                  <span className="text-xs text-muted-foreground font-semibold self-center mr-1">Sort:</span>
                  {[
                    { key: "cheapest", label: "Cheapest First" },
                    { key: "rating",   label: "Top Rated" },
                    { key: "popular",  label: "Most Popular" },
                  ].map((chip) => (
                    <button
                      key={chip.key}
                      onClick={() => setSortBy(chip.key as any)}
                      className={cn(
                        "px-4 py-1.5 rounded-full text-xs font-semibold border transition-all",
                        sortBy === chip.key
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white text-slate-600 hover:border-blue-400 hover:bg-blue-50"
                      )}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Mobile filter panel */}
              {!isLoading && showMobileFilter && (
                <div className="lg:hidden mb-4">{FiltersPanel()}</div>
              )}

              {/* Empty state */}
              {!isLoading && sorted.length === 0 && (
                <Card className="shadow-sm">
                  <CardContent className="py-20 text-center">
                    <Building2 className="w-12 h-12 text-blue-200 mx-auto mb-4" />
                    <h3 className="text-xl font-bold mb-2">No hotels found</h3>
                    <p className="text-muted-foreground mb-4 text-sm">Try clearing filters or searching a different city.</p>
                    <Button onClick={clearFilters} variant="outline">Clear Filters</Button>
                  </CardContent>
                </Card>
              )}

              {/* Hotel cards */}
              {!isLoading && sorted.length > 0 && (
                <div className="space-y-4">
                  {sorted.map((hotel) => {
                    const normalMarkup    = getHiddenMarkupAmount(hotel.pricePerNight, "hotels");
                    const effectiveMarkup = agentMarkupFlat !== null ? agentMarkupFlat : normalMarkup;
                    const pricePerNight   = hotel.pricePerNight + effectiveMarkup;
                    const totalPrice      = pricePerNight * nights;
                    const b2cPrice        = hotel.pricePerNight + normalMarkup;
                    const savings         = (agentMarkupFlat !== null && normalMarkup > agentMarkupFlat)
                      ? (normalMarkup - agentMarkupFlat) * nights : null;

                    const visibleAmenities = hotel.amenities.slice(0, 3);
                    const extraAmenities   = hotel.amenities.length - 3;
                    const { label, color } = starLabel(hotel.rating);
                    const hotelImg         = hotel.imageUrl ?? hotel.images?.[0] ?? "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80";

                    const bookParams = new URLSearchParams({
                      hotelId:      String(hotel.id),
                      hotelName:    hotel.name,
                      city:         hotel.city || city,
                      location:     hotel.location || city,
                      stars:        String(hotel.stars),
                      rating:       String(hotel.rating),
                      ratingCount:  String(hotel.ratingCount ?? 0),
                      ratingLabel:  hotel.ratingLabel ?? "Good",
                      checkin,
                      checkout,
                      guests,
                      nights:       String(nights),
                      rawPrice:     String(hotel.pricePerNight),
                      pricePerNight: String(pricePerNight),
                      markup:       String(effectiveMarkup),
                      normalMarkup: String(normalMarkup),
                      agentSavings: String(savings ?? 0),
                      image:        encodeURIComponent(hotelImg),
                    });

                    return (
                      <Card
                        key={hotel.id}
                        className="overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 bg-white border hover:border-blue-200"
                      >
                        <CardContent className="p-0">
                          <div className="flex flex-col sm:flex-row">
                            <div className="sm:w-52 shrink-0 relative overflow-hidden">
                              <img
                                src={hotelImg}
                                alt={hotel.name}
                                className="w-full h-48 sm:h-full object-cover hover:scale-105 transition-transform duration-500"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src =
                                    "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80";
                                }}
                              />
                              {hotel.stars > 0 && (
                                <div className="absolute top-2 left-2 bg-black/50 text-white text-[11px] font-bold px-2 py-0.5 rounded-full backdrop-blur-sm flex items-center gap-0.5">
                                  {Array.from({ length: Math.min(hotel.stars, 5) }).map((_, i) => (
                                    <Star key={i} className="w-2.5 h-2.5 fill-yellow-400 text-yellow-400" />
                                  ))}
                                </div>
                              )}
                            </div>

                            <div className="flex-1 flex flex-col sm:flex-row p-5 gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2 mb-1">
                                  <h3 className="font-bold text-slate-900 text-base leading-tight">{hotel.name}</h3>
                                  <span className={cn("text-[11px] font-bold px-2 py-0.5 rounded-full border shrink-0", color)}>
                                    {label}
                                  </span>
                                </div>
                                <p className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
                                  <MapPin className="w-3 h-3" />{hotel.location}, {hotel.city}
                                </p>
                                <div className="flex items-center gap-1.5 mb-3">
                                  <div className="flex items-center gap-0.5 bg-green-600 text-white text-xs font-bold px-2 py-0.5 rounded">
                                    <Star className="w-3 h-3 fill-white" />{hotel.rating}
                                  </div>
                                  <span className="text-xs text-muted-foreground">{hotel.ratingCount.toLocaleString()} reviews</span>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {visibleAmenities.map((a) => (
                                    <span key={a} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-medium">
                                      {AMENITY_ICONS[a] ?? null}{a}
                                    </span>
                                  ))}
                                  {extraAmenities > 0 && (
                                    <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[11px] font-medium">
                                      +{extraAmenities} more
                                    </span>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-2 mt-2">
                                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 bg-slate-50 border border-slate-200 rounded-full px-2.5 py-0.5">
                                    👁 {((hotel.id * 9 + 3) % 20) + 8} viewing
                                  </span>
                                  {((hotel.id * 7) % 5) < 2 && (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-orange-600 bg-orange-50 border border-orange-200 rounded-full px-2.5 py-0.5">
                                      🔥 Only {((hotel.id * 3) % 3) + 1} rooms left
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="sm:w-40 shrink-0 flex flex-col items-end justify-between gap-3 sm:border-l sm:pl-4">
                                <div className="text-right">
                                  {savings !== null && savings > 0 && (
                                    <p className="text-xs text-slate-400 line-through mb-0.5">₹{(b2cPrice * nights).toLocaleString()}</p>
                                  )}
                                  <p className="text-2xl font-extrabold text-slate-900">₹{totalPrice.toLocaleString()}</p>
                                  <p className="text-[11px] text-muted-foreground">for {nights} night{nights > 1 ? "s" : ""}</p>
                                  <p className="text-[11px] text-slate-500">₹{pricePerNight.toLocaleString()}/night</p>
                                  {savings !== null && savings > 0 && (
                                    <p className="text-xs font-bold text-green-600 mt-0.5">Save ₹{savings.toLocaleString()}</p>
                                  )}
                                </div>
                                <div className="flex flex-col gap-2 w-full sm:w-auto">
                                  <Button
                                    className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white font-bold gap-1"
                                    onClick={() => setLocation(`/hotels/${hotel.id}?${bookParams.toString()}`)}
                                  >
                                    View Hotel <ChevronRight className="w-3.5 h-3.5" />
                                  </Button>
                                  <p className="text-[10px] text-center text-muted-foreground">Free cancellation</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
