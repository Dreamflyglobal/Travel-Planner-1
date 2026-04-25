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
import { useQuery } from "@tanstack/react-query";
import {
  Building2, SlidersHorizontal, Star, MapPin, Calendar, Users,
  Wifi, Car, Utensils, Waves, Dumbbell, Wind, Tv, Coffee,
  ArrowRight, Pencil, Filter, IndianRupee, ChevronRight,
  WifiOff, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const MOCK_HOTELS = [
  {
    id: 1,
    name: "Grand Palace Hotel",
    city: "Hyderabad",
    location: "Banjara Hills",
    stars: 5,
    rating: 4.5,
    ratingCount: 1240,
    ratingLabel: "Excellent",
    pricePerNight: 2500,
    amenities: ["AC", "WiFi", "Parking", "TV", "Restaurant", "Room Service", "Gym"],
    images: [
      "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80",
      "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=800&q=80",
      "https://images.unsplash.com/photo-1455587734955-081b22074882?w=800&q=80",
    ],
    description: "A 5-star luxury hotel in the heart of Hyderabad offering world-class amenities and impeccable service.",
  },
  {
    id: 2,
    name: "Sea View Resort",
    city: "Goa",
    location: "Calangute Beach",
    stars: 4,
    rating: 4.2,
    ratingCount: 892,
    ratingLabel: "Very Good",
    pricePerNight: 3000,
    amenities: ["AC", "WiFi", "Pool", "Restaurant", "Bar", "Beach Access"],
    images: [
      "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800&q=80",
      "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800&q=80",
      "https://images.unsplash.com/photo-1501117716987-c8e1ecb2108f?w=800&q=80",
    ],
    description: "Experience the magic of Goa with stunning beach views, a sparkling pool, and vibrant nightlife.",
  },
  {
    id: 3,
    name: "The Taj Majestic",
    city: "Mumbai",
    location: "Nariman Point",
    stars: 5,
    rating: 4.7,
    ratingCount: 2100,
    ratingLabel: "Exceptional",
    pricePerNight: 8000,
    amenities: ["AC", "WiFi", "Pool", "Spa", "Restaurant", "Bar", "Gym", "Parking"],
    images: [
      "https://images.unsplash.com/photo-1444201983204-c43cbd584d93?w=800&q=80",
      "https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=800&q=80",
      "https://images.unsplash.com/photo-1568084680786-a84f91d1153c?w=800&q=80",
    ],
    description: "Iconic luxury hotel overlooking the Arabian Sea, offering an unmatched Mumbai experience.",
  },
  {
    id: 4,
    name: "Comfort Inn Express",
    city: "Delhi",
    location: "Connaught Place",
    stars: 3,
    rating: 3.8,
    ratingCount: 540,
    ratingLabel: "Good",
    pricePerNight: 1500,
    amenities: ["AC", "WiFi", "TV", "Parking"],
    images: [
      "https://images.unsplash.com/photo-1578683010236-d716f9a3f461?w=800&q=80",
      "https://images.unsplash.com/photo-1587213811864-49e7b31bb862?w=800&q=80",
    ],
    description: "Budget-friendly hotel in the heart of New Delhi, perfect for business and leisure travellers.",
  },
  {
    id: 5,
    name: "Royal Orchid Retreat",
    city: "Bangalore",
    location: "MG Road",
    stars: 4,
    rating: 4.1,
    ratingCount: 780,
    ratingLabel: "Very Good",
    pricePerNight: 3500,
    amenities: ["AC", "WiFi", "Gym", "Restaurant", "TV", "Parking"],
    images: [
      "https://images.unsplash.com/photo-1582719508461-905c673771fd?w=800&q=80",
      "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80",
    ],
    description: "A premium business hotel in the Silicon Valley of India with modern facilities and fine dining.",
  },
  {
    id: 6,
    name: "Sunrise Beach Resort",
    city: "Chennai",
    location: "Marina Beach Road",
    stars: 4,
    rating: 4.0,
    ratingCount: 430,
    ratingLabel: "Very Good",
    pricePerNight: 2200,
    amenities: ["AC", "WiFi", "Pool", "Restaurant", "Parking"],
    images: [
      "https://images.unsplash.com/photo-1561501900-3701fa6a0864?w=800&q=80",
      "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800&q=80",
    ],
    description: "Beachfront resort with panoramic views of the Bay of Bengal and world-class amenities.",
  },
  {
    id: 7,
    name: "Mountain View Lodge",
    city: "Shimla",
    location: "Mall Road",
    stars: 3,
    rating: 4.3,
    ratingCount: 320,
    ratingLabel: "Excellent",
    pricePerNight: 2800,
    amenities: ["WiFi", "Restaurant", "TV", "Room Service"],
    images: [
      "https://images.unsplash.com/photo-1518684079-3c830dcef090?w=800&q=80",
      "https://images.unsplash.com/photo-1587213811864-49e7b31bb862?w=800&q=80",
    ],
    description: "A charming mountain lodge offering breathtaking Himalayan views and peaceful surroundings.",
  },
  {
    id: 8,
    name: "Palm Grove Spa Hotel",
    city: "Kerala",
    location: "Kovalam Beach",
    stars: 5,
    rating: 4.6,
    ratingCount: 670,
    ratingLabel: "Exceptional",
    pricePerNight: 5500,
    amenities: ["AC", "WiFi", "Spa", "Pool", "Restaurant", "Yoga", "Beach Access"],
    images: [
      "https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=800&q=80",
      "https://images.unsplash.com/photo-1444201983204-c43cbd584d93?w=800&q=80",
    ],
    description: "A luxury Ayurvedic spa resort nestled amidst coconut palms on the Malabar Coast.",
  },
  {
    id: 9,
    name: "Heritage Haveli",
    city: "Jaipur",
    location: "Old City",
    stars: 4,
    rating: 4.4,
    ratingCount: 590,
    ratingLabel: "Excellent",
    pricePerNight: 3800,
    amenities: ["AC", "WiFi", "Pool", "Restaurant", "Heritage Architecture", "Parking"],
    images: [
      "https://images.unsplash.com/photo-1568084680786-a84f91d1153c?w=800&q=80",
      "https://images.unsplash.com/photo-1455587734955-081b22074882?w=800&q=80",
    ],
    description: "Stay in a beautifully restored 18th-century Haveli with royal Rajasthani hospitality.",
  },
  {
    id: 10,
    name: "Tech Park Suites",
    city: "Hyderabad",
    location: "HITEC City",
    stars: 3,
    rating: 3.9,
    ratingCount: 410,
    ratingLabel: "Good",
    pricePerNight: 1800,
    amenities: ["AC", "WiFi", "Gym", "TV", "Parking"],
    images: [
      "https://images.unsplash.com/photo-1578683010236-d716f9a3f461?w=800&q=80",
      "https://images.unsplash.com/photo-1582719508461-905c673771fd?w=800&q=80",
    ],
    description: "Modern business hotel adjacent to HITEC City, ideal for corporate travellers and IT professionals.",
  },
];

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

async function fetchLiveHotels(city: string, checkin: string, checkout: string) {
  const params = new URLSearchParams({ city });
  if (checkin)  params.set("checkin", checkin);
  if (checkout) params.set("checkout", checkout);
  const res = await fetch(`/api/hotels/live-search?${params.toString()}`);
  if (!res.ok) throw new Error("Hotel search failed");
  return res.json();
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

  const { data: liveData, isLoading, isError, refetch } = useQuery({
    queryKey: ["hotels-live-search", city, checkin, checkout],
    queryFn: () => fetchLiveHotels(city, checkin, checkout),
    enabled: Boolean(city.trim()),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const hotels: any[] = liveData?.hotels ?? MOCK_HOTELS.filter((h) => {
    if (!city) return true;
    return h.city.toLowerCase().includes(city.toLowerCase()) ||
           city.toLowerCase().includes(h.city.toLowerCase());
  });

  const fallbackMessage: string | null = liveData?.fallbackMessage ?? null;

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

              {/* Data source banner */}
              <div className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium mb-4 border",
                isLoading
                  ? "bg-blue-50 border-blue-200 text-blue-700"
                  : liveData?.source === "hotelbeds" || liveData?.source === "rapidapi"
                  ? "bg-green-50 border-green-200 text-green-700"
                  : "bg-amber-50 border-amber-200 text-amber-800"
              )}>
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                    <span>Searching live hotels in {city}…</span>
                  </>
                ) : liveData?.source === "hotelbeds" ? (
                  <>
                    <Wifi className="w-4 h-4 shrink-0" />
                    <span className="font-semibold">Live hotels from Hotelbeds</span>
                    <span className="text-green-600/70 text-xs">· Real availability &amp; pricing</span>
                  </>
                ) : liveData?.source === "rapidapi" ? (
                  <>
                    <Wifi className="w-4 h-4 shrink-0" />
                    <span className="font-semibold">Live hotels from Booking.com</span>
                    <span className="text-green-600/70 text-xs">· Real availability &amp; pricing via RapidAPI</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-4 h-4 shrink-0" />
                    <span>{fallbackMessage ?? `Showing curated top hotels in ${city}.`}</span>
                    <button onClick={() => refetch()} className="ml-auto flex items-center gap-1 font-semibold underline underline-offset-2 hover:opacity-80">
                      <RefreshCw className="w-3.5 h-3.5" /> Retry
                    </button>
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
