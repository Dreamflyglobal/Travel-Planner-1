import { APP_NAME } from "@/lib/app-config";
import { useState, useEffect } from "react";
import type { JSX } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { useAbandonedLeadTracker } from "@/hooks/use-abandoned-lead-tracker";
import { useMarketing } from "@/hooks/use-marketing";
import { getHiddenMarkupAmount } from "@/lib/pricing";
import { getBoardingPoints, getDroppingPoints } from "@/lib/bus-cities";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Bus,
  SlidersHorizontal,
  IndianRupee,
  Filter,
  Clock,
  Zap,
  Calendar,
  ArrowRight,
  Pencil,
  MapPin,
  Wind,
  Wifi,
  Coffee,
  BatteryCharging,
  ChevronRight,
  Star,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Structured bus data (RedBus style) ───────────────────────────────────────
import type { Bus as BusItem } from "@/services/busService";
import { fetchBuses } from "@/services/busService";

// Mock data removed — buses are now fetched via /services/busService.ts.
// Kept as a mutable export so other pages (bus-detail.tsx, bus-seat-selection.tsx)
// can still resolve the most recently loaded list when navigating directly.
export let MOCK_BUSES: BusItem[] = [];

const AMENITY_ICONS: Record<string, JSX.Element> = {
  "AC":            <Wind className="w-3 h-3" />,
  "Wifi":          <Wifi className="w-3 h-3" />,
  "Water Bottle":  <Coffee className="w-3 h-3" />,
  "Charging":      <BatteryCharging className="w-3 h-3" />,
  "Entertainment": <span className="text-[10px]">📺</span>,
};

function parseTime12(t: string): number {
  const m = t.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return 0;
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  const period = m[3].toUpperCase();
  if (period === "PM" && h !== 12) h += 12;
  if (period === "AM" && h === 12) h = 0;
  return h * 60 + min;
}

function parseDuration(d: string): number {
  const m = d.match(/(\d+)h\s*(\d+)?m?/);
  return m ? parseInt(m[1] || "0") * 60 + parseInt(m[2] || "0") : 0;
}

function formatDate(d: string) {
  if (!d) return "";
  try {
    return new Date(d + "T00:00:00").toLocaleDateString("en-IN", {
      weekday: "short", day: "2-digit", month: "short",
    });
  } catch { return d; }
}

function getTimePeriod(t: string) {
  const mins = parseTime12(t);
  const h = Math.floor(mins / 60);
  if (h >= 6  && h < 12) return "morning";
  if (h >= 12 && h < 18) return "afternoon";
  if (h >= 18 && h < 24) return "evening";
  return "night";
}

export default function BusResults() {
  const searchString = useSearch();
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(searchString);

  const from = params.get("from") || "";
  const to   = params.get("to")   || "";
  const date = params.get("date") || "";

  const { user, isAgent } = useAuth();
  useAbandonedLeadTracker("bus");
  const { fireSearchEvent } = useMarketing();
  useEffect(() => {
    fireSearchEvent({ searchType: "bus", from, to });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const agentMarkupFlat: number | null = (isAgent && user?.agentMarkup !== undefined) ? user.agentMarkup : null;

  // ── Fetch buses from /services/busService.ts (axios → API) ────────────────
  const [allBuses, setAllBuses]   = useState<BusItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError]     = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const refetch = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setIsError(false);
    fetchBuses()
      .then((list) => {
        if (cancelled) return;
        setAllBuses(list);
        // Update the shared export so direct-link detail/seat pages can resolve items.
        MOCK_BUSES = list;
        setIsLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setIsError(true);
        setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, [reloadKey]);

  // Optional client-side route filter; fall back to full list if filter is empty.
  const normalise = (v: string) => v.split(",")[0].trim().toLowerCase();
  const fromCity = normalise(from);
  const toCity   = normalise(to);
  const routeFiltered: BusItem[] = allBuses.filter((b) => {
    const bFrom = b.from.trim().toLowerCase();
    const bTo   = b.to.trim().toLowerCase();
    return (!fromCity || bFrom === fromCity) && (!toCity || bTo === toCity);
  });
  const busList: BusItem[] = routeFiltered.length > 0 ? routeFiltered : allBuses;
  const dataSource = isError ? "fallback" : null;

  const operators  = Array.from(new Set(busList.map((b) => b.operator)));
  const busTypes   = Array.from(new Set(busList.map((b) => b.busType)));

  // Dynamic price range
  const maxBusPrice = busList.length > 0 ? Math.ceil((Math.max(...busList.map((b) => b.price)) + 500) / 500) * 500 : 5000;
  const [priceRange, setPriceRange] = useState([0, maxBusPrice]);
  useEffect(() => { setPriceRange([0, maxBusPrice]); }, [maxBusPrice]);
  const [selectedOperators, setSelectedOperators] = useState<string[]>([]);
  const [selectedBusTypes,  setSelectedBusTypes]  = useState<string[]>([]);
  const [departureFilter,   setDepartureFilter]   = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<"cheapest" | "fastest" | "earliest">("cheapest");
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const clearAllFilters = () => {
    setSelectedOperators([]);
    setSelectedBusTypes([]);
    setDepartureFilter([]);
    setPriceRange([0, maxBusPrice]);
  };

  const activeFilterCount =
    selectedOperators.length +
    selectedBusTypes.length +
    departureFilter.length +
    (priceRange[0] > 0 || priceRange[1] < maxBusPrice ? 1 : 0);

  const filteredBuses = busList.filter((bus) => {
    const normalMarkup    = getHiddenMarkupAmount(bus.price, "buses");
    const effectiveMarkup = agentMarkupFlat !== null ? agentMarkupFlat : normalMarkup;
    const displayPrice    = bus.price + effectiveMarkup;

    const matchesPrice    = displayPrice >= priceRange[0] && displayPrice <= priceRange[1];
    const matchesOperator = selectedOperators.length === 0 || selectedOperators.includes(bus.operator);
    const matchesBusType  = selectedBusTypes.length === 0  || selectedBusTypes.includes(bus.busType);
    const matchesTime     = departureFilter.length === 0   || departureFilter.includes(getTimePeriod(bus.departure));
    return matchesPrice && matchesOperator && matchesBusType && matchesTime;
  });

  const sortedBuses = [...filteredBuses].sort((a, b) => {
    if (sortBy === "cheapest") {
      const mkA = agentMarkupFlat !== null ? agentMarkupFlat : getHiddenMarkupAmount(a.price, "buses");
      const mkB = agentMarkupFlat !== null ? agentMarkupFlat : getHiddenMarkupAmount(b.price, "buses");
      return (a.price + mkA) - (b.price + mkB);
    }
    if (sortBy === "fastest")  return parseDuration(a.duration) - parseDuration(b.duration);
    if (sortBy === "earliest") return parseTime12(a.departure) - parseTime12(b.departure);
    return 0;
  });

  const goToModify = () => setLocation(`/buses?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&date=${date}`);

  const FiltersPanel = () => (
    <Card className="sticky top-[72px] border shadow-sm">
      <CardContent className="p-5 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4" /> Filters
          </h3>
          {activeFilterCount > 0 && (
            <button onClick={clearAllFilters} className="text-xs text-orange-600 font-semibold hover:underline">Clear All</button>
          )}
        </div>

        {/* Price */}
        <div className="pb-5 border-b">
          <h4 className="font-semibold mb-3 text-xs uppercase tracking-wide text-muted-foreground">Price per seat</h4>
          <Slider value={priceRange} onValueChange={setPriceRange} min={0} max={maxBusPrice} step={50} className="mb-3" />
          <div className="flex items-center justify-between text-sm font-bold">
            <span className="text-orange-600">₹{priceRange[0].toLocaleString()}</span>
            <span className="text-muted-foreground text-xs">to</span>
            <span className="text-orange-600">₹{priceRange[1].toLocaleString()}</span>
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
                    ? "bg-orange-600 text-white border-orange-600"
                    : "bg-background hover:border-orange-400 hover:bg-orange-50"
                )}
              >
                <span className="text-base mb-0.5">{slot.icon}</span>
                <span className="font-semibold text-[11px]">{slot.label}</span>
                <span className={cn("text-[10px]", departureFilter.includes(slot.value) ? "text-orange-100" : "text-muted-foreground")}>{slot.time}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Operators */}
        {operators.length > 0 && (
          <div className="pb-5 border-b">
            <h4 className="font-semibold mb-3 text-xs uppercase tracking-wide text-muted-foreground">Bus Operators</h4>
            <div className="space-y-2.5 max-h-52 overflow-y-auto pr-1">
              {operators.map((op) => (
                <label key={op} className="flex items-center gap-2.5 cursor-pointer group">
                  <Checkbox
                    checked={selectedOperators.includes(op)}
                    onCheckedChange={() =>
                      setSelectedOperators((prev) =>
                        prev.includes(op) ? prev.filter((o) => o !== op) : [...prev, op]
                      )
                    }
                    className="rounded"
                  />
                  <span className="text-sm group-hover:text-orange-600 transition-colors">{op}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Bus Types */}
        {busTypes.length > 0 && (
          <div>
            <h4 className="font-semibold mb-3 text-xs uppercase tracking-wide text-muted-foreground">Bus Type</h4>
            <div className="space-y-2.5 max-h-52 overflow-y-auto pr-1">
              {busTypes.map((type) => (
                <label key={type} className="flex items-center gap-2.5 cursor-pointer group">
                  <Checkbox
                    checked={selectedBusTypes.includes(type)}
                    onCheckedChange={() =>
                      setSelectedBusTypes((prev) =>
                        prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
                      )
                    }
                    className="rounded"
                  />
                  <span className="text-sm group-hover:text-orange-600 transition-colors">{type}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">

      {/* ── Top bar ── */}
      <header className="sticky top-0 z-40 bg-white border-b shadow-sm">
        <div className="container mx-auto px-4 h-[60px] flex items-center gap-3">
          <Link href="/" className="flex items-center gap-1.5 shrink-0 group">
            <div className="w-7 h-7 rounded-md bg-gradient-to-br from-orange-500 to-pink-600 flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
              <Bus className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-base bg-gradient-to-r from-orange-600 to-pink-600 bg-clip-text text-transparent hidden sm:block">{APP_NAME}</span>
          </Link>

          <div className="w-px h-6 bg-border shrink-0" />

          <div className="flex items-center gap-2 flex-1 overflow-x-auto min-w-0 scrollbar-hide">
            <div className="flex items-center gap-1.5 bg-orange-50 border border-orange-100 rounded-lg px-3 py-1.5 shrink-0">
              <Bus className="w-3.5 h-3.5 text-orange-600 shrink-0" />
              <span className="font-bold text-sm text-orange-900">{from || "—"}</span>
              <ArrowRight className="w-3 h-3 text-orange-400 shrink-0" />
              <span className="font-bold text-sm text-orange-900">{to || "—"}</span>
            </div>
            {date && (
              <div className="flex items-center gap-1.5 bg-muted/60 border rounded-lg px-3 py-1.5 shrink-0">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium">{formatDate(date)}</span>
              </div>
            )}
          </div>

          <Button onClick={goToModify} size="sm" className="bg-orange-500 hover:bg-orange-600 text-white font-bold shrink-0 gap-1.5">
            <Pencil className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Modify</span>
          </Button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex-1">
        <div className="container mx-auto px-4 py-5">
          <div className="flex flex-col lg:flex-row gap-5">

            {/* Sidebar */}
            <aside className="hidden lg:block w-64 shrink-0">
              {FiltersPanel()}
            </aside>

            {/* Results */}
            <main className="flex-1 min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">
                    {isLoading ? (
                      <span className="text-muted-foreground font-normal">Searching buses…</span>
                    ) : (
                      <>
                        {sortedBuses.length} bus{sortedBuses.length !== 1 ? "es" : ""} found
                        {(from || to) && (
                          <span className="text-muted-foreground font-normal text-sm ml-2">
                            {from && to ? `${from.split(",")[0].trim()} → ${to.split(",")[0].trim()}` : from || to}
                          </span>
                        )}
                      </>
                    )}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Prices per seat · Taxes included</p>
                </div>
                <Button variant="outline" size="sm" className="lg:hidden gap-1.5" onClick={() => setShowMobileFilters(!showMobileFilters)}>
                  <Filter className="w-4 h-4" />
                  Filters {activeFilterCount > 0 && `(${activeFilterCount})`}
                </Button>
              </div>

              {/* Sort chips */}
              <div className="flex gap-2 mb-4 bg-white border rounded-xl p-3 shadow-sm flex-wrap">
                <span className="text-xs text-muted-foreground font-semibold self-center mr-1">Sort:</span>
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
                        ? "bg-orange-600 text-white border-orange-600"
                        : "bg-white text-slate-600 hover:border-orange-400 hover:bg-orange-50"
                    )}
                  >
                    {chip.icon}{chip.label}
                  </button>
                ))}
              </div>

              {showMobileFilters && <div className="lg:hidden mb-4">{FiltersPanel()}</div>}

              {/* Data source banner — driven by busService (axios) */}
              {!isLoading && (
                <div className={cn(
                  "flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium mb-4 border",
                  isError
                    ? "bg-amber-50 border-amber-200 text-amber-700"
                    : "bg-green-50 border-green-200 text-green-700"
                )}>
                  {isError ? (
                    <><Bus className="w-3.5 h-3.5 shrink-0" /><span>Failed to load buses.</span><button onClick={() => refetch()} className="ml-auto underline hover:opacity-80">Retry</button></>
                  ) : (
                    <><Bus className="w-3.5 h-3.5 shrink-0" /><span className="font-semibold">Showing {busList.length} buses</span><span className="opacity-70">· Live data{dataSource ? ` (${dataSource})` : ""}</span></>
                  )}
                </div>
              )}

              {isLoading ? (
                <div className="space-y-3">
                  {[1,2,3,4].map((i) => (
                    <Card key={i} className="shadow-sm">
                      <CardContent className="p-0">
                        <div className="flex flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x animate-pulse">
                          <div className="flex-1 p-5 space-y-3">
                            <div className="h-4 bg-slate-200 rounded w-32" />
                            <div className="h-3 bg-slate-100 rounded w-24" />
                            <div className="flex gap-4 mt-2">
                              <div className="h-6 bg-slate-200 rounded w-20" />
                              <div className="h-6 bg-slate-100 rounded w-16" />
                              <div className="h-6 bg-slate-200 rounded w-20" />
                            </div>
                          </div>
                          <div className="sm:w-48 p-5 bg-slate-50 space-y-2">
                            <div className="h-8 bg-slate-200 rounded w-24 ml-auto" />
                            <div className="h-10 bg-orange-100 rounded w-full" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : sortedBuses.length === 0 ? (
                <Card className="shadow-sm">
                  <CardContent className="py-20 text-center">
                    <Bus className="w-12 h-12 text-orange-300 mx-auto mb-4" />
                    <h3 className="text-xl font-bold mb-2">No buses found</h3>
                    <p className="text-muted-foreground mb-4 text-sm">
                      {activeFilterCount > 0
                        ? "No buses match the current filters. Try clearing some filters."
                        : fromCity && toCity
                        ? `No direct buses for ${from.split(",")[0].trim()} → ${to.split(",")[0].trim()}. Try a different route.`
                        : "Search for a route above to see available buses."}
                    </p>
                    <div className="flex gap-3 justify-center">
                      {activeFilterCount > 0 && <Button onClick={clearAllFilters} variant="outline">Clear Filters</Button>}
                      <Button onClick={goToModify} className="bg-orange-500 hover:bg-orange-600 gap-1.5">
                        <Pencil className="w-4 h-4" /> Modify Search
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {sortedBuses.map((bus) => {
                    const normalMarkup    = getHiddenMarkupAmount(bus.price, "buses");
                    const effectiveMarkup = agentMarkupFlat !== null ? agentMarkupFlat : normalMarkup;
                    const finalPrice      = bus.price + effectiveMarkup;
                    const b2cPrice        = bus.price + normalMarkup;
                    const savings         = (agentMarkupFlat !== null && normalMarkup > agentMarkupFlat)
                      ? normalMarkup - agentMarkupFlat
                      : null;

                    const seatParams = new URLSearchParams({
                      busId:       String(bus.id),
                      busName:     bus.name,
                      operator:    bus.operator,
                      from:        bus.from,
                      to:          bus.to,
                      departure:   bus.departure,
                      arrival:     bus.arrival,
                      duration:    bus.duration,
                      date,
                      price:       String(bus.price),
                      markup:      String(effectiveMarkup),
                      priceWithMarkup: String(finalPrice),
                      normalMarkup:    String(normalMarkup),
                      agentSavings:    String(savings ?? 0),
                      busType:     bus.busType,
                      totalSeats:  String(bus.totalSeats),
                      seatsAvailable: String(bus.seatsAvailable),
                      boardingPoints:  (getBoardingPoints(bus.from).length ? getBoardingPoints(bus.from) : bus.boardingPoints).join("|"),
                      droppingPoints:  (getDroppingPoints(bus.to).length ? getDroppingPoints(bus.to) : bus.droppingPoints).join("|"),
                    });

                    const lowSeats = bus.seatsAvailable <= 10;

                    return (
                      <Card
                        key={bus.id}
                        className="overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 bg-white border hover:border-orange-200"
                      >
                        <CardContent className="p-0">
                          <div className="flex flex-col sm:flex-row">

                            {/* ── Bus info ── */}
                            <div className="flex-1 p-5">
                              {/* Operator row */}
                              <div className="flex items-center gap-3 mb-4">
                                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-orange-500 to-pink-600 flex items-center justify-center shadow-sm shrink-0">
                                  <Bus className="w-5 h-5 text-white" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-bold text-sm text-slate-800">{bus.name}</p>
                                  <p className="text-xs text-muted-foreground">{bus.busType}</p>
                                </div>
                                <div className="flex items-center gap-1 text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 shrink-0">
                                  <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                                  {bus.rating}
                                </div>
                              </div>

                              {/* Timing row */}
                              <div className="flex items-center gap-3 mb-4 p-3 bg-slate-50 rounded-xl">
                                <div>
                                  <p className="text-2xl font-extrabold text-slate-900 tabular-nums">{bus.departure}</p>
                                  <p className="text-xs font-semibold text-slate-500 flex items-center gap-1 mt-0.5">
                                    <MapPin className="w-3 h-3" />{bus.from}
                                  </p>
                                </div>
                                <div className="flex-1 flex flex-col items-center">
                                  <p className="text-[11px] text-muted-foreground font-medium mb-1">{bus.duration}</p>
                                  <div className="w-full flex items-center gap-1">
                                    <div className="flex-1 h-px bg-slate-300" />
                                    <div className="w-6 h-6 rounded-full bg-orange-50 border-2 border-orange-200 flex items-center justify-center">
                                      <Bus className="w-3 h-3 text-orange-600" />
                                    </div>
                                    <div className="flex-1 h-px bg-slate-300" />
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className="text-2xl font-extrabold text-slate-900 tabular-nums">{bus.arrival}</p>
                                  <p className="text-xs font-semibold text-slate-500 flex items-center gap-1 mt-0.5 justify-end">
                                    <MapPin className="w-3 h-3" />{bus.to}
                                  </p>
                                </div>
                              </div>

                              {/* Seats + amenities */}
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={cn(
                                  "text-xs font-semibold px-2 py-0.5 rounded-full border",
                                  bus.seatsAvailable <= 5
                                    ? "bg-red-50 text-red-600 border-red-200"
                                    : lowSeats
                                    ? "bg-orange-50 text-orange-600 border-orange-200"
                                    : "bg-green-50 text-green-700 border-green-200"
                                )}>
                                  {bus.seatsAvailable <= 5 ? "🔥" : "💺"} {bus.seatsAvailable} seats left
                                </span>
                                <span className="text-xs font-medium px-2 py-0.5 rounded-full border bg-slate-50 text-slate-500 border-slate-200">
                                  👁 {((bus.id * 11 + 5) % 15) + 5} viewing
                                </span>
                                {bus.seatsAvailable <= 5 && (
                                  <span className="text-[10px] font-bold text-red-500 animate-pulse">↑ Hurry, filling fast!</span>
                                )}
                                {bus.amenities.map((a) => (
                                  <span key={a} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-medium">
                                    {AMENITY_ICONS[a] ?? null}{a}
                                  </span>
                                ))}
                              </div>
                            </div>

                            {/* ── Price & CTA ── */}
                            <div className="sm:w-48 shrink-0 flex flex-col items-end justify-center gap-3 p-5 bg-slate-50 border-t sm:border-t-0 sm:border-l">
                              <div className="text-right">
                                {savings !== null && (
                                  <p className="text-xs text-slate-400 line-through mb-0.5">₹{b2cPrice.toLocaleString()}</p>
                                )}
                                <p className="text-3xl font-extrabold text-slate-900">₹{finalPrice.toLocaleString()}</p>
                                <p className="text-[11px] text-muted-foreground">per seat</p>
                                {savings !== null && (
                                  <p className="text-xs font-bold text-green-600 mt-0.5">Save ₹{savings}</p>
                                )}
                              </div>
                              <Button
                                className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold gap-1"
                                onClick={() => setLocation(`/bus/seat-selection?${seatParams.toString()}`)}
                              >
                                Select Seats <ChevronRight className="w-3.5 h-3.5" />
                              </Button>
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
