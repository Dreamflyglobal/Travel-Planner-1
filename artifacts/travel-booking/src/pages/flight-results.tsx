import { useState, useEffect } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { useAbandonedLeadTracker } from "@/hooks/use-abandoned-lead-tracker";
import { useMarketing } from "@/hooks/use-marketing";
import { getHiddenMarkupAmount } from "@/lib/pricing";
import { useFlightSearch, type FlightSearchOptions, type FareOption } from "@/lib/use-flight-search";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Plane,
  SlidersHorizontal,
  IndianRupee,
  Filter,
  Clock,
  Zap,
  Calendar,
  Users,
  ArrowRight,
  RefreshCw,
  Wifi,
  WifiOff,
  Pencil,
  ChevronRight,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ── Airline branding colours ──────────────────────────────────────────────────
const AIRLINE_COLORS: Record<string, string> = {
  indigo:    "from-blue-500 to-indigo-600",
  "air india": "from-red-500 to-orange-500",
  vistara:   "from-purple-500 to-violet-700",
  spicejet:  "from-red-500 to-rose-600",
  "akasa air":"from-yellow-400 to-orange-500",
  "go first":"from-sky-500 to-blue-600",
  goair:     "from-sky-500 to-blue-600",
  "air asia":"from-red-600 to-rose-700",
};

function airlineGradient(name: string) {
  const key = name.toLowerCase();
  for (const k in AIRLINE_COLORS) if (key.includes(k)) return AIRLINE_COLORS[k];
  return "from-slate-500 to-slate-700";
}

export default function FlightResults() {
  const searchString = useSearch();
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(searchString);

  const from      = params.get("from")     || "";
  const to        = params.get("to")       || "";
  const date      = params.get("date")     || "";
  const travelers = parseInt(params.get("travelers") || "1", 10);

  // Extended search params passed from the new search UI
  const tripType   = params.get("tripType")   || "oneway";
  const returnDate = params.get("returnDate") || undefined;
  const cabinClass = params.get("cabinClass") || undefined;
  const adults     = params.get("adults")     ? parseInt(params.get("adults")!,   10) : undefined;
  const children   = params.get("children")   ? parseInt(params.get("children")!, 10) : undefined;
  const infants    = params.get("infants")    ? parseInt(params.get("infants")!,  10) : undefined;

  // Multi-city: mc=FROM1:TO1:DATE1|FROM2:TO2:DATE2
  const mcParam = params.get("mc");
  const routeInfos: FlightSearchOptions["routeInfos"] = mcParam
    ? mcParam.split("|").map((seg) => {
        const [f, t, d] = seg.split(":");
        return { from: f || "", to: t || "", date: d || "" };
      })
    : undefined;

  const searchOpts: FlightSearchOptions = {
    tripType,
    ...(returnDate  && { returnDate  }),
    ...(cabinClass  && { cabinClass  }),
    ...(adults      !== undefined && { adults   }),
    ...(children    !== undefined && { children }),
    ...(infants     !== undefined && { infants  }),
    ...(routeInfos  && { routeInfos }),
  };

  const {
    flights: allFlights,
    isLoading,
    isLiveError,
    source,
    fallbackMessage,
    traceId,
    refetch,
  } = useFlightSearch(from, to, date, searchOpts);

  const [priceRange,       setPriceRange]       = useState([0, 50000]);
  const [selectedAirlines, setSelectedAirlines] = useState<string[]>([]);
  const [departureFilter,  setDepartureFilter]  = useState<string[]>([]);
  const [stopsFilter,      setStopsFilter]      = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<"cheapest" | "fastest" | "earliest" | "latest">("cheapest");
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [expandedFlight,   setExpandedFlight]  = useState<number | null>(null);

  const { user, isAgent } = useAuth();
  const { toast } = useToast();
  const [bookingLoadingId, setBookingLoadingId] = useState<string | null>(null);

  // ── Reset loading state whenever the search changes ──────────────────────
  useEffect(() => {
    setBookingLoadingId(null);
  }, [searchString]);

  // ── fareQuote on fare/flight selection ────────────────────────────────────
  // `isTjFare` must be true only when fareKey is a real TripJack price-list ID
  // (i.e. the user picked a specific fare class from the expanded panel).
  // Direct "Book Now" flights use a sequential DB id that TripJack won't
  // recognise — those skip fareQuote and go straight to the passenger page.
  async function handleSelectFlight(
    fareKey: string,
    urlParams: URLSearchParams,
    isTjFare: boolean,
    resultIndex?: string,
    searchTraceId?: string,
  ) {
    setBookingLoadingId(fareKey);
    sessionStorage.removeItem("ww_tj_farequote");
    sessionStorage.removeItem("ww_tj_booking_id");
    sessionStorage.removeItem("ww_tj_farequote_key");

    // No valid TripJack bookingId → skip fareQuote, navigate directly
    if (!isTjFare) {
      setBookingLoadingId(null);
      setLocation(`/booking/flight?${urlParams.toString()}`);
      return;
    }

    const apiBase = (import.meta.env.VITE_API_BASE_URL as string) ?? "";
    try {
      const ri = resultIndex  || "";
      const ti = searchTraceId || "";
      console.info(
        "[fareQuote/select] fareKey:", fareKey,
        "| resultIndex:", ri || "(none)",
        "| traceId:", ti || "(none)",
      );

      const res  = await fetch(`${apiBase}/api/tj-farequote`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ bookingId: fareKey, traceId: ti, resultIndex: ri }),
      });
      const data = await res.json().catch(() => ({}));
      console.info("[fareQuote/select] status:", res.status, "| fareKey:", fareKey);

      // ── HTTP 4xx / 5xx — fare could not be verified; treat as unavailable ──
      if (!res.ok) {
        setBookingLoadingId(null);
        toast({
          variant:     "destructive",
          title:       "Flight sold out",
          description: "This fare is no longer available. Please select another flight.",
        });
        return;
      }

      // ── TripJack application-level error ──────────────────────────────────
      if (data?.status === false || data?.errors?.length) {
        const msg: string  = (data?.errors?.[0]?.message || data?.message || "").toLowerCase();
        const tf: number   = data?.data?.totalPriceInfo?.totalFareDetail?.fC?.TF ?? 0;
        const isPriceChange = tf > 0 &&
          (msg.includes("price") || msg.includes("fare chang") || msg.includes("revised") || msg.includes("updated"));

        if (isPriceChange) {
          // Cache the updated fare and let the passenger page show the price-change dialog
          const resolvedId = data?.data?.bookingId || fareKey;
          const travelersCount = parseInt(urlParams.get("travelers") || "1", 10);
          const newRawPerPerson = Math.round(tf / travelersCount);
          urlParams.set("price", String(newRawPerPerson));
          urlParams.set("priceWithMarkup", String(newRawPerPerson + parseInt(urlParams.get("markup") || "0", 10)));
          sessionStorage.setItem("ww_tj_farequote",     JSON.stringify(data));
          sessionStorage.setItem("ww_tj_booking_id",    resolvedId);
          sessionStorage.setItem("ww_tj_farequote_key", fareKey);
          setBookingLoadingId(null);
          setLocation(`/booking/flight?${urlParams.toString()}`);
          return;
        }

        // Fare genuinely sold out (TripJack said so explicitly)
        setBookingLoadingId(null);
        toast({
          variant:     "destructive",
          title:       "Flight sold out",
          description: "This fare is no longer available. Please select another flight.",
        });
        return;
      }

      // ── Success — cache and navigate ──────────────────────────────────────
      const resolvedId     = data?.data?.bookingId || fareKey;
      const tf: number     = data?.data?.totalPriceInfo?.totalFareDetail?.fC?.TF ?? 0;
      if (tf > 0) {
        const travelersCount  = parseInt(urlParams.get("travelers") || "1", 10);
        const newRawPerPerson = Math.round(tf / travelersCount);
        urlParams.set("price", String(newRawPerPerson));
        urlParams.set("priceWithMarkup", String(newRawPerPerson + parseInt(urlParams.get("markup") || "0", 10)));
      }
      sessionStorage.setItem("ww_tj_farequote",     JSON.stringify(data));
      sessionStorage.setItem("ww_tj_booking_id",    resolvedId);
      sessionStorage.setItem("ww_tj_farequote_key", fareKey);
      console.info("[fareQuote/select] cached — resolvedId:", resolvedId);
      setBookingLoadingId(null);
      setLocation(`/booking/flight?${urlParams.toString()}`);

    } catch {
      setBookingLoadingId(null);
      toast({
        variant:     "destructive",
        title:       "Network error",
        description: "Could not reach the airline. Please check your connection.",
      });
    }
  }

  useAbandonedLeadTracker("flight");
  const { fireSearchEvent } = useMarketing();
  useEffect(() => {
    fireSearchEvent({ searchType: "flight", from, to });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // New B2B model: agentMarkup is a flat ₹ value (not %)
  const agentMarkupFlat: number | null = (isAgent && user?.agentMarkup !== undefined) ? user.agentMarkup : null;

  const airlines = Array.from(new Set(allFlights.map((f) => f.airline)));

  const getTimePeriod = (time: string) => {
    const h = parseInt(time.split(":")[0]);
    if (h >= 6  && h < 12) return "morning";
    if (h >= 12 && h < 18) return "afternoon";
    if (h >= 18 && h < 24) return "evening";
    return "night";
  };

  // For today's date, calculate current time in minutes to filter out past flights
  const today = new Date().toISOString().split("T")[0];
  const isToday = date === today;
  const nowMinutes = (() => {
    if (!isToday) return -1;
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  })();

  const filteredFlights = allFlights.filter((flight) => {
    // Filter uses the search display price: rawPrice + effectiveMarkup (no conv fee)
    const normalMarkup    = getHiddenMarkupAmount(flight.price, "flights");
    const effectiveMarkup = agentMarkupFlat !== null ? agentMarkupFlat : normalMarkup;
    const displayPrice    = flight.price + effectiveMarkup;
    const matchesPrice   = displayPrice >= priceRange[0] && displayPrice <= priceRange[1];
    const matchesAirline = selectedAirlines.length === 0 || selectedAirlines.includes(flight.airline);
    const matchesTime    = departureFilter.length === 0  || departureFilter.includes(getTimePeriod(flight.departureTime));
    const resolvedStops  = flight.stops !== undefined        ? flight.stops
      : flight.stopsLabel === "Non-stop"                     ? 0
      : flight.stopsLabel === "1 Stop"                       ? 1
      : flight.stopsLabel                                    ? 2
      : -1; // unknown — excluded when filter is active
    const stopsLabelNorm = resolvedStops === 0 ? "Non-stop" : resolvedStops === 1 ? "1 Stop" : "2+ Stops";
    const matchesNonStop = stopsFilter.length === 0 || stopsFilter.includes(stopsLabelNorm);

    // For today: hide flights that departed more than 15 minutes ago
    const notPast = (() => {
      if (nowMinutes < 0) return true;
      const parts = (flight.departureTime || "").split(":");
      if (parts.length < 2) return true;
      const depMins = parseInt(parts[0]) * 60 + parseInt(parts[1]);
      return depMins >= nowMinutes - 15;
    })();

    return matchesPrice && matchesAirline && matchesTime && matchesNonStop && notPast;
  });

  const getDurationMinutes = (d: string | number) => {
    if (typeof d === "number") return d;
    const m = d.toString().match(/(\d+)h?\s*(\d+)?m?/);
    return m ? parseInt(m[1] || "0") * 60 + parseInt(m[2] || "0") : 0;
  };

  const getTimeMinutes = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  };

  const sortedFlights = [...filteredFlights].sort((a, b) => {
    switch (sortBy) {
      case "cheapest": {
        // Sort by agent-effective display price (raw + effectiveMarkup)
        const mkA = agentMarkupFlat !== null ? agentMarkupFlat : getHiddenMarkupAmount(a.price, "flights");
        const mkB = agentMarkupFlat !== null ? agentMarkupFlat : getHiddenMarkupAmount(b.price, "flights");
        const pa  = a.price + mkA;
        const pb  = b.price + mkB;
        return pa - pb;
      }
      case "fastest":  return getDurationMinutes(a.duration) - getDurationMinutes(b.duration);
      case "earliest": return getTimeMinutes(a.departureTime) - getTimeMinutes(b.departureTime);
      case "latest":   return getTimeMinutes(b.departureTime) - getTimeMinutes(a.departureTime);
      default: return 0;
    }
  });

  const toggleAirline = (airline: string) =>
    setSelectedAirlines((prev) =>
      prev.includes(airline) ? prev.filter((a) => a !== airline) : [...prev, airline]
    );

  const clearAllFilters = () => {
    setSelectedAirlines([]);
    setPriceRange([0, 50000]);
    setDepartureFilter([]);
    setStopsFilter([]);
  };

  const goToModify = () => {
    const p = new URLSearchParams({ from, to, travelers: String(travelers) });
    if (date) p.set("date", date);
    setLocation(`/flights?${p.toString()}`);
  };

  const activeFilterCount =
    selectedAirlines.length +
    departureFilter.length +
    (priceRange[0] > 0 || priceRange[1] < 50000 ? 1 : 0) +
    stopsFilter.length;

  const formatDate = (d: string) => {
    if (!d) return "";
    try {
      return new Date(d + "T00:00:00").toLocaleDateString("en-IN", {
        weekday: "short", day: "2-digit", month: "short",
      });
    } catch { return d; }
  };

  // ── Filters Panel ─────────────────────────────────────────────────────────
  const FiltersPanel = () => (
    <Card className="sticky top-[72px] border shadow-sm">
      <CardContent className="p-5 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4" /> Filters
          </h3>
          {activeFilterCount > 0 && (
            <button onClick={clearAllFilters} className="text-xs text-blue-600 font-semibold hover:underline">
              Clear All
            </button>
          )}
        </div>

        {/* Stops */}
        <div className="pb-5 border-b">
          <h4 className="font-semibold mb-3 text-xs uppercase tracking-wide text-muted-foreground">Stops</h4>
          <div className="flex flex-col gap-2">
            {[
              { label: "Non-stop", color: "text-green-700 border-green-300 bg-green-50", activeColor: "bg-green-600 text-white border-green-600" },
              { label: "1 Stop",   color: "text-amber-700 border-amber-300 bg-amber-50",  activeColor: "bg-amber-500 text-white border-amber-500"  },
              { label: "2+ Stops", color: "text-slate-600 border-slate-300 bg-slate-50", activeColor: "bg-slate-600 text-white border-slate-600" },
            ].map(({ label, color, activeColor }) => {
              const active = stopsFilter.includes(label);
              return (
                <button
                  key={label}
                  onClick={() =>
                    setStopsFilter((prev) =>
                      prev.includes(label) ? prev.filter((s) => s !== label) : [...prev, label]
                    )
                  }
                  className={cn(
                    "flex items-center justify-between px-3 py-2 rounded-lg border text-sm font-medium transition-all",
                    active ? activeColor : color + " hover:border-primary/40"
                  )}
                >
                  <span>{label}</span>
                  {active && <span className="text-xs opacity-80">✓</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Price Range */}
        <div className="pb-5 border-b">
          <h4 className="font-semibold mb-3 text-xs uppercase tracking-wide text-muted-foreground">Price per person</h4>
          <Slider value={priceRange} onValueChange={setPriceRange} min={0} max={50000} step={500} className="mb-3" />
          <div className="flex items-center justify-between text-sm font-bold">
            <span className="text-primary">₹{priceRange[0].toLocaleString()}</span>
            <span className="text-muted-foreground text-xs">to</span>
            <span className="text-primary">₹{priceRange[1].toLocaleString()}</span>
          </div>
        </div>

        {/* Departure Time */}
        <div className="pb-5 border-b">
          <h4 className="font-semibold mb-3 text-xs uppercase tracking-wide text-muted-foreground">Departure Time</h4>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: "morning",   label: "Morning",   time: "6AM–12PM", icon: "🌅" },
              { value: "afternoon", label: "Afternoon", time: "12–6PM",   icon: "☀️" },
              { value: "evening",   label: "Evening",   time: "6–12AM",   icon: "🌆" },
              { value: "night",     label: "Night",     time: "12–6AM",   icon: "🌙" },
            ].map((slot) => (
              <button
                key={slot.value}
                onClick={() =>
                  setDepartureFilter((prev) =>
                    prev.includes(slot.value) ? prev.filter((t) => t !== slot.value) : [...prev, slot.value]
                  )
                }
                className={cn(
                  "flex flex-col items-center p-2 rounded-lg border text-xs font-medium transition-all",
                  departureFilter.includes(slot.value)
                    ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                    : "bg-background hover:border-blue-400 hover:bg-blue-50"
                )}
              >
                <span className="text-base mb-0.5">{slot.icon}</span>
                <span className="font-semibold text-[11px]">{slot.label}</span>
                <span className={cn("text-[10px]", departureFilter.includes(slot.value) ? "text-blue-100" : "text-muted-foreground")}>{slot.time}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Airlines */}
        {airlines.length > 0 && (
          <div>
            <h4 className="font-semibold mb-3 text-xs uppercase tracking-wide text-muted-foreground">Airlines</h4>
            <div className="space-y-2.5 max-h-52 overflow-y-auto pr-1">
              {airlines.map((airline) => (
                <label key={airline} className="flex items-center gap-2.5 cursor-pointer group">
                  <Checkbox
                    id={`airline-${airline}`}
                    checked={selectedAirlines.includes(airline)}
                    onCheckedChange={() => toggleAirline(airline)}
                    className="rounded"
                  />
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className={cn(
                      "w-5 h-5 rounded flex items-center justify-center bg-gradient-to-br text-white text-[8px] font-bold shrink-0",
                      airlineGradient(airline)
                    )}>
                      {airline.substring(0, 2).toUpperCase()}
                    </div>
                    <span className="text-sm leading-none group-hover:text-primary transition-colors truncate">{airline}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );

  // ── Main Render ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">

      {/* ── Compact top bar ── */}
      <header className="sticky top-0 z-40 bg-white border-b shadow-sm">
        <div className="container mx-auto px-4 h-[60px] flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1.5 shrink-0 group">
            <div className="w-7 h-7 rounded-md bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
              <Plane className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-base bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent hidden sm:block">
              Dream Fly Global
            </span>
          </Link>

          <div className="w-px h-6 bg-border shrink-0" />

          <div className="flex items-center gap-2 flex-1 overflow-x-auto min-w-0 scrollbar-hide">
            <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-100 rounded-lg px-3 py-1.5 shrink-0">
              <Plane className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span className="font-bold text-sm text-blue-900">{from || "—"}</span>
              <ArrowRight className="w-3 h-3 text-blue-400 shrink-0" />
              <span className="font-bold text-sm text-blue-900">{to || "—"}</span>
            </div>
            {date && (
              <div className="flex items-center gap-1.5 bg-muted/60 border rounded-lg px-3 py-1.5 shrink-0">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium">{formatDate(date)}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 bg-muted/60 border rounded-lg px-3 py-1.5 shrink-0">
              <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium">{travelers} Adult{travelers !== 1 ? "s" : ""}</span>
            </div>
          </div>

          <Button onClick={goToModify} size="sm" className="bg-orange-500 hover:bg-orange-600 text-white font-bold shrink-0 gap-1.5">
            <Pencil className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Modify Search</span>
            <span className="sm:hidden">Edit</span>
          </Button>
        </div>
      </header>

      {/* ── Data source banner ── */}
      {!isLoading && (from || to) && (
        <div className={cn(
          "border-b text-xs px-4 py-2 flex items-center gap-2",
          source === "booking.com" || source === "aviationstack"
            ? "bg-green-50 border-green-200 text-green-700"
            : "bg-amber-50 border-amber-200 text-amber-700"
        )}>
          {source === "booking.com" ? (
            <><Wifi className="w-3.5 h-3.5 shrink-0" /><span className="font-medium">Live fares from Booking.com</span><span className="text-green-600/70">· Real-time pricing via RapidAPI</span></>
          ) : source === "aviationstack" ? (
            <><Wifi className="w-3.5 h-3.5 shrink-0" /><span>Live flight data · Prices are indicative</span></>
          ) : (
            <>
              <WifiOff className="w-3.5 h-3.5 shrink-0" />
              <span>{fallbackMessage ?? `Showing typical scheduled flights for ${from} → ${to}.`}</span>
              <button onClick={() => refetch()} className="ml-auto flex items-center gap-1 font-semibold underline underline-offset-2 hover:opacity-80">
                <RefreshCw className="w-3 h-3" /> Retry
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Body ── */}
      <div className="flex-1">
        <div className="container mx-auto px-4 py-5">
          <div className="flex flex-col lg:flex-row gap-5">

            {/* Sidebar */}
            <aside className="hidden lg:block w-64 shrink-0">
              {FiltersPanel()}
            </aside>

            {/* Results column */}
            <main className="flex-1 min-w-0">

              {/* Header row */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div>
                  {isLoading ? (
                    <Skeleton className="h-6 w-48" />
                  ) : (
                    <h2 className="text-lg font-bold text-slate-800">
                      {sortedFlights.length} flight{sortedFlights.length !== 1 ? "s" : ""} found
                      {(from || to) && (
                        <span className="text-muted-foreground font-normal text-sm ml-2">
                          {from && to ? `${from} → ${to}` : from || to}
                        </span>
                      )}
                    </h2>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5">Prices per person · Taxes included</p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="lg:hidden gap-1.5"
                    onClick={() => setShowMobileFilters(!showMobileFilters)}
                  >
                    <Filter className="w-4 h-4" />
                    Filters {activeFilterCount > 0 && `(${activeFilterCount})`}
                  </Button>
                </div>
              </div>

              {/* Sort chips */}
              <div className="flex gap-2 mb-4 flex-wrap bg-white border rounded-xl p-3 shadow-sm">
                <span className="text-xs text-muted-foreground font-semibold self-center mr-1">Sort by:</span>
                {[
                  { key: "cheapest", icon: <IndianRupee className="w-3 h-3" />, label: "Cheapest" },
                  { key: "fastest",  icon: <Zap className="w-3 h-3" />,          label: "Fastest"  },
                  { key: "earliest", icon: <Clock className="w-3 h-3" />,         label: "Earliest" },
                ].map((chip) => (
                  <button
                    key={chip.key}
                    onClick={() => setSortBy(chip.key as any)}
                    className={cn(
                      "flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold border transition-all",
                      sortBy === chip.key
                        ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                        : "bg-white text-slate-600 hover:border-blue-400 hover:bg-blue-50"
                    )}
                  >
                    {chip.icon}{chip.label}
                  </button>
                ))}
              </div>

              {/* Mobile filters */}
              {showMobileFilters && (
                <div className="lg:hidden mb-4">
                  {FiltersPanel()}
                </div>
              )}

              {/* Loading */}
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <Card key={i} className="shadow-sm">
                      <CardContent className="p-5">
                        <div className="flex items-center gap-4">
                          <Skeleton className="h-12 w-12 rounded-lg" />
                          <div className="flex-1 space-y-2">
                            <Skeleton className="h-4 w-1/3" />
                            <Skeleton className="h-6 w-3/4" />
                            <Skeleton className="h-3 w-1/4" />
                          </div>
                          <div className="space-y-2 text-right">
                            <Skeleton className="h-8 w-24 ml-auto" />
                            <Skeleton className="h-10 w-28 ml-auto" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  <p className="text-center text-xs text-muted-foreground animate-pulse pt-2">Searching live flights…</p>
                </div>
              ) : sortedFlights.length === 0 ? (
                <Card className="shadow-sm">
                  <CardContent className="py-20 text-center">
                    <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-blue-50 flex items-center justify-center">
                      <Plane className="w-10 h-10 text-blue-300" />
                    </div>
                    <h3 className="text-xl font-bold mb-2 text-slate-800">No flights found</h3>
                    <p className="text-muted-foreground mb-6 max-w-sm mx-auto text-sm">
                      {activeFilterCount > 0
                        ? "Your filters are hiding all results. Try clearing them."
                        : "No flights available for this route."}
                    </p>
                    <div className="flex gap-3 justify-center flex-wrap">
                      {activeFilterCount > 0 && (
                        <Button onClick={clearAllFilters} variant="outline">Clear Filters</Button>
                      )}
                      <Button onClick={() => refetch()} variant="outline" className="gap-1.5">
                        <RefreshCw className="w-4 h-4" /> Retry
                      </Button>
                      <Button onClick={goToModify} className="gap-1.5 bg-orange-500 hover:bg-orange-600">
                        <Pencil className="w-4 h-4" /> Modify Search
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {sortedFlights.map((flight) => {
                    // B2B model: agent gets a lower markup (agentMarkup ₹ < normalMarkup ₹)
                    const normalMarkup    = getHiddenMarkupAmount(flight.price, "flights");
                    const effectiveMarkup = agentMarkupFlat !== null ? agentMarkupFlat : normalMarkup;
                    const searchBasePrice = flight.price + normalMarkup; // B2C base (for strikethrough)
                    const finalPrice      = flight.price + effectiveMarkup; // agent-effective base
                    const savings         = (agentMarkupFlat !== null && normalMarkup > agentMarkupFlat)
                      ? (normalMarkup - agentMarkupFlat)
                      : null;
                    const isLive = source === "aviationstack";
                    const gradient = airlineGradient(flight.airline);

                    return (
                      <Card
                        key={flight.id}
                        className="overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 bg-white border hover:border-blue-200 group"
                      >
                        <CardContent className="p-0">
                          <div className="flex flex-col sm:flex-row">

                            {/* ── Main flight info ── */}
                            <div className="flex-1 p-5">

                              {/* Row 1: Airline header */}
                              <div className="flex items-center gap-3 mb-5">
                                {/* Airline logo badge */}
                                <div className={cn(
                                  "w-11 h-11 rounded-xl bg-gradient-to-br flex items-center justify-center shadow-sm shrink-0",
                                  gradient
                                )}>
                                  <span className="text-white font-extrabold text-sm tracking-tight">
                                    {flight.airline.substring(0, 2).toUpperCase()}
                                  </span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-bold text-sm text-slate-800 leading-tight">{flight.airline}</p>
                                  <p className="text-xs text-muted-foreground mt-0.5">{flight.flightNumber}</p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {flight.status && flight.status !== "scheduled" && (
                                    <Badge
                                      variant="outline"
                                      className={cn("text-[10px] py-0.5 capitalize", {
                                        "text-green-600 border-green-300 bg-green-50":    flight.status === "active" || flight.status === "landed",
                                        "text-orange-600 border-orange-300 bg-orange-50": flight.status === "delayed",
                                        "text-red-600 border-red-300 bg-red-50":          flight.status === "cancelled",
                                      })}
                                    >
                                      {flight.status}
                                    </Badge>
                                  )}
                                  <Badge className="bg-slate-100 text-slate-600 border-0 text-xs font-medium hover:bg-slate-100">
                                    {flight.class || "Economy"}
                                  </Badge>
                                  {isLive && (
                                    <Badge className="bg-blue-50 text-blue-600 border-0 text-[10px]">Live</Badge>
                                  )}
                                </div>
                              </div>

                              {/* Row 2: Flight timeline — horizontal */}
                              <div className="flex items-center gap-3">
                                {/* Departure */}
                                <div className="shrink-0 text-left">
                                  <p className="text-2xl font-extrabold text-slate-900 tabular-nums leading-none">
                                    {flight.departureTime}
                                  </p>
                                  <p className="text-sm font-semibold text-slate-600 mt-0.5">{flight.origin}</p>
                                </div>

                                {/* Timeline bar */}
                                <div className="flex-1 flex flex-col items-center px-2 min-w-0">
                                  <p className="text-xs text-muted-foreground font-medium mb-1">{flight.duration}</p>
                                  <div className="w-full flex items-center gap-1">
                                    <div className="flex-1 h-px bg-slate-200" />
                                    <div className="w-6 h-6 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0">
                                      <Plane className="w-3 h-3 text-blue-600" />
                                    </div>
                                    <div className="flex-1 h-px bg-slate-200" />
                                  </div>
                                  {(() => {
                                    const raw = flight.stopsLabel ?? (flight.stops === 0 ? "Non-stop" : flight.stops === 1 ? "1 Stop" : "2+ Stops");
                                    const label = raw === "Multi-stop" ? "2+ Stops" : raw;
                                    return (
                                      <p className={cn(
                                        "text-[10px] font-bold mt-1 uppercase tracking-wide",
                                        label === "Non-stop" ? "text-green-600" :
                                        label === "1 Stop"   ? "text-amber-600" :
                                                               "text-slate-500"
                                      )}>
                                        {label}
                                      </p>
                                    );
                                  })()}
                                </div>

                                {/* Arrival */}
                                <div className="shrink-0 text-right">
                                  <p className="text-2xl font-extrabold text-slate-900 tabular-nums leading-none">
                                    {flight.arrivalTime}
                                  </p>
                                  <p className="text-sm font-semibold text-slate-600 mt-0.5">{flight.destination}</p>
                                </div>
                              </div>

                              {/* Row 3: Tags */}
                              <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-100 flex-wrap">
                                <span className={`inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2.5 py-0.5 border ${
                                  flight.seatsAvailable <= 5
                                    ? "bg-red-50 text-red-600 border-red-200"
                                    : flight.seatsAvailable <= 10
                                    ? "bg-orange-50 text-orange-600 border-orange-200"
                                    : "bg-slate-50 text-slate-500 border-slate-200"
                                }`}>
                                  {flight.seatsAvailable <= 5 ? "🔥" : "💺"} {flight.seatsAvailable} seats left
                                </span>
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 bg-slate-50 border border-slate-200 rounded-full px-2.5 py-0.5">
                                  👁 {((flight.id * 13 + 7) % 18) + 6} viewing
                                </span>
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2.5 py-0.5">
                                  ✓ Refundable
                                </span>
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-2.5 py-0.5">
                                  🍽 Free meal
                                </span>
                                {flight.seatsAvailable <= 5 && (
                                  <span className="text-[10px] font-bold text-red-500 animate-pulse">↑ Prices rising fast!</span>
                                )}
                              </div>
                            </div>

                            {/* ── Price & CTA ── */}
                            <div className="sm:w-52 border-t sm:border-t-0 sm:border-l border-slate-100 bg-gradient-to-b from-slate-50 to-white p-5 flex flex-col justify-between items-center gap-4">
                              <div className="text-center w-full">
                                <p className="text-xs text-muted-foreground mb-1">Per person</p>

                                {/* Agent: strikethrough shows base price before their discount */}
                                {savings !== null && savings > 0 && (
                                  <p className="text-xs line-through text-slate-400 tabular-nums mb-0.5">
                                    ₹{searchBasePrice.toLocaleString()}
                                  </p>
                                )}

                                <div className="flex items-baseline justify-center gap-0.5">
                                  <span className="text-lg font-bold text-slate-500">₹</span>
                                  <span className="text-3xl font-extrabold text-blue-700 tabular-nums">
                                    {finalPrice.toLocaleString()}
                                  </span>
                                </div>

                                {/* Taxes & fees extra — added at checkout */}
                                <p className="text-[10px] text-slate-400 mt-0.5">+ taxes & fees</p>

                                {savings !== null && savings > 0 && (
                                  <span className="inline-block bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full mt-1">
                                    Agent saves ₹{savings.toLocaleString()}
                                  </span>
                                )}

                                {travelers > 1 && (
                                  <p className="text-xs text-muted-foreground mt-1.5">
                                    Total <span className="font-semibold text-slate-700">₹{(finalPrice * travelers).toLocaleString()}</span> for {travelers}
                                  </p>
                                )}
                              </div>

                              <div className="w-full space-y-2">
                                {/* ── Fare selection or direct book ── */}
                                {flight.fareOptions && flight.fareOptions.length > 0 ? (
                                  <Button
                                    size="lg"
                                    onClick={() => setExpandedFlight(expandedFlight === flight.id ? null : flight.id)}
                                    className={cn(
                                      "w-full font-bold text-sm gap-1.5 shadow-sm transition-all",
                                      expandedFlight === flight.id
                                        ? "bg-blue-700 hover:bg-blue-800 text-white"
                                        : "bg-orange-500 hover:bg-orange-600 text-white"
                                    )}
                                  >
                                    <Plane className="w-4 h-4" />
                                    Select Flight
                                    <ChevronDown className={cn("w-4 h-4 ml-auto transition-transform", expandedFlight === flight.id && "rotate-180")} />
                                  </Button>
                                ) : (
                                  <Button
                                    size="lg"
                                    disabled={bookingLoadingId !== null}
                                    onClick={() => handleSelectFlight(
                                      String(flight.id),
                                      new URLSearchParams({
                                        id:             String(flight.id),
                                        airline:        flight.airline,
                                        flightNumber:   flight.flightNumber,
                                        from:           flight.origin,
                                        to:             flight.destination,
                                        departure:      flight.departureTime,
                                        arrival:        flight.arrivalTime,
                                        duration:       String(flight.duration),
                                        date:           date || "",
                                        price:          String(flight.price),
                                        markup:         String(effectiveMarkup),
                                        priceWithMarkup:String(finalPrice),
                                        normalMarkup:   String(normalMarkup),
                                        agentSavings:   String(savings ?? 0),
                                        travelers:      String(travelers),
                                      }),
                                      false, // sequential DB id — skip fareQuote
                                    )}
                                    className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm gap-1.5 shadow-sm"
                                  >
                                    {bookingLoadingId === String(flight.id)
                                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Checking fare…</>
                                      : <>Book Now <ChevronRight className="w-4 h-4" /></>
                                    }
                                  </Button>
                                )}
                                <p className="text-[10px] text-muted-foreground text-center">
                                  {flight.fareOptions && flight.fareOptions.length > 0
                                    ? "Select fare below · all taxes included"
                                    : "Taxes & fees included"}
                                </p>
                              </div>
                            </div>

                          </div>

                          {/* ── Expanded fare options panel ── */}
                          {expandedFlight === flight.id && flight.fareOptions && flight.fareOptions.length > 0 && (
                            <div className="border-t border-blue-100 bg-blue-50/60 px-5 py-4">
                              <p className="text-[11px] font-bold text-blue-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                                <Plane className="w-3.5 h-3.5" /> Choose your fare class
                              </p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {flight.fareOptions.map((fare: FareOption) => {
                                  const fareWithMarkup = fare.totalFare + effectiveMarkup;
                                  const bookParams = new URLSearchParams({
                                    id:             String(flight.id),
                                    airline:        flight.airline,
                                    flightNumber:   flight.flightNumber,
                                    from:           flight.origin,
                                    to:             flight.destination,
                                    departure:      flight.departureTime,
                                    arrival:        flight.arrivalTime,
                                    duration:       String(flight.duration),
                                    date:           date || "",
                                    price:          String(fare.totalFare),
                                    markup:         String(effectiveMarkup),
                                    priceWithMarkup:String(fareWithMarkup),
                                    normalMarkup:   String(normalMarkup),
                                    agentSavings:   String(savings ?? 0),
                                    travelers:      String(travelers),
                                    cabinClass:     fare.cabinClass,
                                    cabinLabel:     fare.cabinLabel,
                                    fareKey:        fare.fareId,
                                  });
                                  const isFareLoading = bookingLoadingId === fare.fareId;
                                  const isPremium = fare.cabinClass === "BUSINESS" || fare.cabinClass === "FIRST" || fare.cabinClass === "PREMIUM_ECONOMY";
                                  return (
                                    <div
                                      key={fare.fareId || fare.cabinClass}
                                      className={cn(
                                        "p-3.5 rounded-xl border-2 bg-white flex flex-col gap-3",
                                        bookingLoadingId && bookingLoadingId !== fare.fareId ? "opacity-50" : "",
                                        isPremium ? "border-purple-200" : "border-slate-200"
                                      )}
                                    >
                                      {/* Cabin class label + seats */}
                                      <div className="flex items-start justify-between gap-2">
                                        <div>
                                          <p className="font-bold text-sm text-slate-800">{fare.cabinLabel}</p>
                                          <p className={cn(
                                            "text-[10px] font-semibold mt-0.5",
                                            fare.seatsLeft <= 5 ? "text-red-500" : "text-slate-400"
                                          )}>
                                            {fare.seatsLeft <= 5 ? `🔥 Only ${fare.seatsLeft} left` : `${fare.seatsLeft} seats`}
                                          </p>
                                        </div>
                                        {isPremium && (
                                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 uppercase tracking-wide shrink-0">
                                            {fare.cabinLabel}
                                          </span>
                                        )}
                                      </div>

                                      {/* Price */}
                                      <div>
                                        <p className="text-2xl font-extrabold text-blue-700 tabular-nums leading-none">
                                          ₹{fareWithMarkup.toLocaleString("en-IN")}
                                        </p>
                                        <p className="text-[10px] text-muted-foreground mt-0.5">per person · all taxes incl.</p>
                                        {travelers > 1 && (
                                          <p className="text-xs text-slate-500 mt-0.5">
                                            Total <span className="font-semibold">₹{(fareWithMarkup * travelers).toLocaleString("en-IN")}</span> for {travelers}
                                          </p>
                                        )}
                                      </div>

                                      {/* Select button — the sole trigger for this fare */}
                                      <Button
                                        size="sm"
                                        disabled={!!bookingLoadingId}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (bookingLoadingId) return;
                                          const ri = fare.resultIndex || flight.resultIndex;
                                          console.log("[fareSelect] fareId:", fare.fareId, "| cabinClass:", fare.cabinClass, "| resultIndex:", ri, "| traceId:", traceId || "(none)");
                                          handleSelectFlight(fare.fareId, bookParams, true, ri, traceId);
                                        }}
                                        className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs h-8 gap-1"
                                      >
                                        {isFareLoading
                                          ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking fare…</>
                                          : <>Select {fare.cabinLabel} <ChevronRight className="w-3.5 h-3.5" /></>
                                        }
                                      </Button>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

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
