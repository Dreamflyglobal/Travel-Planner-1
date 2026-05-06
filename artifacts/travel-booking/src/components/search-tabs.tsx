import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AutocompleteInput } from "@/components/autocomplete-input";
import { citySuggestions, busCitySuggestions, hotelCitySuggestions, packageDestinations } from "@/lib/city-suggestions";
import { loadAirports, searchAirports, type AirportEntry, type AirportSuggestion } from "@/lib/airport-search";
import { Plane, Bus, Building2, Map, Car, Compass, Train, Search, ArrowLeftRight, Users, ChevronDown, Plus, Minus, X } from "lucide-react";

interface SearchTabsProps {
  defaultTab?: "flights" | "hotels" | "buses" | "packages" | "cars" | "trains" | "activities";
  onTabChange?: (tab: string) => void;
  initialFrom?: string;
  initialTo?: string;
  initialDate?: string;
}

export function SearchTabs({
  defaultTab = "flights",
  onTabChange,
  initialFrom = "",
  initialTo = "",
  initialDate = "",
}: SearchTabsProps) {
  const [, setLocation] = useLocation();

  const today    = new Date().toISOString().split("T")[0];
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().split("T")[0];

  const [flightFrom, setFlightFrom] = useState(initialFrom);
  const [flightTo,   setFlightTo]   = useState(initialTo);
  const [flightDate, setFlightDate] = useState(initialDate || today);

  const [tripType,    setTripType]    = useState<"oneway" | "roundtrip" | "multicity">("oneway");
  const [returnDate,  setReturnDate]  = useState(tomorrow);
  const [adults,      setAdults]      = useState(1);
  const [children,    setChildren]    = useState(0);
  const [infants,     setInfants]     = useState(0);
  const [paxOpen,     setPaxOpen]     = useState(false);
  const paxRef = useRef<HTMLDivElement>(null);

  const [mcRoutes, setMcRoutes] = useState([
    { from: initialFrom, to: initialTo,   date: initialDate || today },
    { from: "",          to: "",           date: tomorrow             },
  ]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (paxRef.current && !paxRef.current.contains(e.target as Node)) {
        setPaxOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const totalPax = adults + children + infants;
  const paxLabel = [
    `${adults} Adult${adults !== 1 ? "s" : ""}`,
    children > 0 ? `${children} Child${children !== 1 ? "ren" : ""}` : "",
    infants  > 0 ? `${infants} Infant${infants  !== 1 ? "s"   : ""}` : "",
  ].filter(Boolean).join(", ");

  const addMcRoute    = () => setMcRoutes(r => r.length < 4 ? [...r, { from: "", to: "", date: today }] : r);
  const removeMcRoute = (i: number) => setMcRoutes(r => r.length > 2 ? r.filter((_, idx) => idx !== i) : r);
  const updateMcRoute = (i: number, field: "from" | "to" | "date", val: string) =>
    setMcRoutes(r => r.map((rt, idx) => idx === i ? { ...rt, [field]: val } : rt));

  const [airportData,      setAirportData]      = useState<AirportEntry[]>([]);
  const [fromSuggestions,  setFromSuggestions]  = useState<AirportSuggestion[]>([]);
  const [toSuggestions,    setToSuggestions]    = useState<AirportSuggestion[]>([]);
  const fromDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toDebounceRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadAirports().then(setAirportData);
  }, []);

  useEffect(() => {
    if (fromDebounceRef.current) clearTimeout(fromDebounceRef.current);
    fromDebounceRef.current = setTimeout(() => {
      setFromSuggestions(airportData.length ? searchAirports(airportData, flightFrom) : []);
    }, 300);
    return () => { if (fromDebounceRef.current) clearTimeout(fromDebounceRef.current); };
  }, [flightFrom, airportData]);

  useEffect(() => {
    if (toDebounceRef.current) clearTimeout(toDebounceRef.current);
    toDebounceRef.current = setTimeout(() => {
      setToSuggestions(airportData.length ? searchAirports(airportData, flightTo) : []);
    }, 300);
    return () => { if (toDebounceRef.current) clearTimeout(toDebounceRef.current); };
  }, [flightTo, airportData]);

  const [hotelLocation,   setHotelLocation]   = useState("");
  const [hotelSearchCity, setHotelSearchCity] = useState(""); // actual city for search (may differ if hotel brand selected)
  const [hotelCheckIn,    setHotelCheckIn]    = useState(today);
  const [hotelCheckOut,   setHotelCheckOut]   = useState(tomorrow);
  const [hotelAdults,     setHotelAdults]     = useState(2);
  const [hotelRooms,      setHotelRooms]      = useState(1);

  const hotelSmartRooms = (a: number) => a <= 2 ? 1 : a <= 4 ? 2 : 3;
  const handleHotelAdultsChange = (a: number) => { setHotelAdults(a); setHotelRooms(hotelSmartRooms(a)); };

  const [busFrom, setBusFrom] = useState("");
  const [busTo,   setBusTo]   = useState("");
  const [busDate, setBusDate] = useState(today);

  const [packageDestination, setPackageDestination] = useState("");

  const [flightError, setFlightError] = useState(false);
  const [hotelError,  setHotelError]  = useState(false);
  const [busError,    setBusError]    = useState(false);

  const handleFlightSearch = (e: React.MouseEvent) => {
    let invalid = false;
    if (tripType === "oneway" || tripType === "roundtrip") {
      invalid = !flightFrom.trim() || !flightTo.trim() || !flightDate.trim();
      if (tripType === "roundtrip") invalid = invalid || !returnDate.trim();
    } else {
      invalid = mcRoutes.some(r => !r.from.trim() || !r.to.trim() || !r.date.trim());
    }
    if (invalid) {
      e.preventDefault();
      setFlightError(true);
      setTimeout(() => setFlightError(false), 3000);
    }
  };

  const handleHotelSearch = (e: React.MouseEvent) => {
    if (!hotelLocation.trim() || !hotelCheckIn.trim() || !hotelCheckOut.trim()) {
      e.preventDefault();
      setHotelError(true);
      setTimeout(() => setHotelError(false), 3000);
    }
  };

  // When user selects a hotel suggestion: code = city to search (for hotel brands)
  const handleHotelLocationChange = (value: string, code?: string) => {
    setHotelLocation(value);
    // If code is provided (hotel brand selected), use it as the search city; otherwise use typed value
    setHotelSearchCity(code || value);
  };

  const handleBusSearch = (e: React.MouseEvent) => {
    if (!busFrom.trim() || !busTo.trim() || !busDate.trim()) {
      e.preventDefault();
      setBusError(true);
      setTimeout(() => setBusError(false), 3000);
    }
  };

  const handleBusSwap = () => { const t = busFrom; setBusFrom(busTo); setBusTo(t); };
  const handleFlightSwap = () => { const t = flightFrom; setFlightFrom(flightTo); setFlightTo(t); };

  const commonPaxParams = `&travelers=${totalPax}&adults=${adults}&children=${children}&infants=${infants}&tripType=${tripType}`;

  const flightsUrl = (() => {
    if (tripType === "oneway") {
      if (!flightFrom.trim() || !flightTo.trim() || !flightDate.trim()) return "#";
      return `/flights/results?from=${encodeURIComponent(flightFrom)}&to=${encodeURIComponent(flightTo)}&date=${encodeURIComponent(flightDate)}${commonPaxParams}`;
    }
    if (tripType === "roundtrip") {
      if (!flightFrom.trim() || !flightTo.trim() || !flightDate.trim() || !returnDate.trim()) return "#";
      return `/flights/results?from=${encodeURIComponent(flightFrom)}&to=${encodeURIComponent(flightTo)}&date=${encodeURIComponent(flightDate)}&returnDate=${encodeURIComponent(returnDate)}${commonPaxParams}`;
    }
    if (mcRoutes.some(r => !r.from.trim() || !r.to.trim() || !r.date.trim())) return "#";
    const mc = encodeURIComponent(mcRoutes.map(r => `${r.from}:${r.to}:${r.date}`).join("|"));
    return `/flights/results?from=${encodeURIComponent(mcRoutes[0].from)}&to=${encodeURIComponent(mcRoutes[0].to)}&date=${encodeURIComponent(mcRoutes[0].date)}&mc=${mc}${commonPaxParams}`;
  })();

  // Use hotelSearchCity (the actual city) for search — differs when hotel brand is selected
  const hotelCityForSearch = hotelSearchCity.trim() || hotelLocation.trim();
  const hotelsUrl = (hotelCityForSearch && hotelCheckIn.trim() && hotelCheckOut.trim())
    ? `/hotels/results?city=${encodeURIComponent(hotelCityForSearch)}&checkin=${encodeURIComponent(hotelCheckIn)}&checkout=${encodeURIComponent(hotelCheckOut)}&adults=${hotelAdults}&rooms=${hotelRooms}`
    : "#";

  const busesUrl = (busFrom.trim() && busTo.trim() && busDate.trim())
    ? `/bus/results?from=${encodeURIComponent(busFrom)}&to=${encodeURIComponent(busTo)}&date=${encodeURIComponent(busDate)}`
    : "#";

  const inputCls = "flex h-12 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
  const labelCls = "text-xs font-semibold text-muted-foreground uppercase tracking-wider";

  return (
    <Card className="w-full max-w-4xl shadow-2xl border-0 bg-white/95 backdrop-blur-md supports-[backdrop-filter]:bg-white/85">
      <CardContent className="p-2 sm:p-4">
        <Tabs
          defaultValue={defaultTab}
          className="w-full"
          onValueChange={(val) => {
            if (val === "cars")       { setLocation("/cars");       return; }
            if (val === "trains")     { setLocation("/trains");     return; }
            if (val === "activities") { setLocation("/activities"); return; }
            onTabChange?.(val);
          }}
        >
          <TabsList className="grid grid-cols-4 gap-1 p-1 h-auto sm:grid-cols-7 sm:h-14 bg-gray-100/80 rounded-lg">
            <TabsTrigger value="flights" className="flex flex-col items-center justify-center gap-0.5 py-2 px-1 h-auto sm:flex-row sm:gap-1.5 sm:px-2 sm:py-1 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-primary text-xs sm:text-sm font-semibold rounded-md w-full">
              <Plane className="w-4 h-4 shrink-0" /><span>Flights</span>
            </TabsTrigger>
            <TabsTrigger value="hotels" className="flex flex-col items-center justify-center gap-0.5 py-2 px-1 h-auto sm:flex-row sm:gap-1.5 sm:px-2 sm:py-1 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-primary text-xs sm:text-sm font-semibold rounded-md w-full">
              <Building2 className="w-4 h-4 shrink-0" /><span>Hotels</span>
            </TabsTrigger>
            <TabsTrigger value="buses" className="flex flex-col items-center justify-center gap-0.5 py-2 px-1 h-auto sm:flex-row sm:gap-1.5 sm:px-2 sm:py-1 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-primary text-xs sm:text-sm font-semibold rounded-md w-full">
              <Bus className="w-4 h-4 shrink-0" /><span>Buses</span>
            </TabsTrigger>
            <TabsTrigger value="packages" className="flex flex-col items-center justify-center gap-0.5 py-2 px-1 h-auto sm:flex-row sm:gap-1.5 sm:px-2 sm:py-1 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-primary text-xs sm:text-sm font-semibold rounded-md w-full">
              <Map className="w-4 h-4 shrink-0" /><span>Holidays</span>
            </TabsTrigger>
            <TabsTrigger value="cars" className="col-start-1 sm:col-auto flex flex-col items-center justify-center gap-0.5 py-2 px-1 h-auto sm:flex-row sm:gap-1.5 sm:px-2 sm:py-1 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-primary text-xs sm:text-sm font-semibold rounded-md w-full">
              <Car className="w-4 h-4 shrink-0" /><span>Cars</span>
            </TabsTrigger>
            <TabsTrigger value="trains" className="flex flex-col items-center justify-center gap-0.5 py-2 px-1 h-auto sm:flex-row sm:gap-1.5 sm:px-2 sm:py-1 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-primary text-xs sm:text-sm font-semibold rounded-md w-full">
              <Train className="w-4 h-4 shrink-0" /><span>Trains</span>
            </TabsTrigger>
            <TabsTrigger value="activities" className="flex flex-col items-center justify-center gap-0.5 py-2 px-1 h-auto sm:flex-row sm:gap-1.5 sm:px-2 sm:py-1 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-primary text-xs sm:text-sm font-semibold rounded-md w-full">
              <Compass className="w-4 h-4 shrink-0" /><span>Activities</span>
            </TabsTrigger>
          </TabsList>

          {/* ── Flights ── */}
          <TabsContent value="flights" className="pt-4 pb-2 px-2 space-y-4">

            {/* Trip type pills */}
            <div className="flex items-center gap-2 flex-wrap">
              {(["oneway", "roundtrip", "multicity"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTripType(t)}
                  className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-all duration-150 ${
                    tripType === t
                      ? "bg-primary text-white border-primary shadow-sm"
                      : "bg-white text-muted-foreground border-gray-200 hover:border-primary/40 hover:text-primary"
                  }`}
                >
                  {t === "oneway" ? "One Way" : t === "roundtrip" ? "Round Trip" : "Multi City"}
                </button>
              ))}
            </div>

            {/* One Way / Round Trip form */}
            {tripType !== "multicity" && (
              <div className="flex flex-col lg:grid lg:grid-cols-4 gap-4">
                <div className="lg:col-span-2 flex flex-col sm:flex-row sm:items-end gap-1.5 sm:gap-2">
                  <div className="flex-1 min-w-0 space-y-1">
                    <label className={labelCls}>From</label>
                    <AutocompleteInput placeholder="City or Airport" suggestions={fromSuggestions} value={flightFrom} onChange={setFlightFrom} maxSuggestions={6} />
                  </div>
                  <button onClick={handleFlightSwap}
                    className="w-9 h-9 rounded-full border border-gray-200 bg-white text-gray-400 hover:text-gray-600 hover:scale-105 active:scale-95 transition-all duration-150 flex items-center justify-center shadow-sm shrink-0 self-center sm:self-auto sm:mb-0.5"
                    title="Swap cities">
                    <ArrowLeftRight className="w-4 h-4" />
                  </button>
                  <div className="flex-1 min-w-0 space-y-1">
                    <label className={labelCls}>To</label>
                    <AutocompleteInput placeholder="City or Airport" suggestions={toSuggestions} value={flightTo} onChange={setFlightTo} maxSuggestions={6} />
                  </div>
                </div>

                {/* Date(s) */}
                {tripType === "oneway" ? (
                  <div className="space-y-1">
                    <label className={labelCls}>Departure Date</label>
                    <input type="date" value={flightDate} min={today} onChange={(e) => setFlightDate(e.target.value)} className={inputCls} />
                  </div>
                ) : (
                  <div className="flex gap-2 lg:col-span-1">
                    <div className="flex-1 space-y-1">
                      <label className={labelCls}>Depart</label>
                      <input type="date" value={flightDate} min={today} onChange={(e) => setFlightDate(e.target.value)} className={inputCls} />
                    </div>
                    <div className="flex-1 space-y-1">
                      <label className={labelCls}>Return</label>
                      <input type="date" value={returnDate} min={flightDate || today} onChange={(e) => setReturnDate(e.target.value)} className={inputCls} />
                    </div>
                  </div>
                )}

                <div className="space-y-1">
                  <label className={labelCls + " invisible hidden sm:block"}>Search</label>
                  <Button asChild size="lg" className="w-full h-12 text-base font-bold">
                    <Link href={flightsUrl} onClick={handleFlightSearch}>
                      <Search className="w-5 h-5 mr-2" /> Search Flights
                    </Link>
                  </Button>
                  {flightError && <p className="text-red-600 text-xs mt-2 font-medium">⚠️ Please fill all fields</p>}
                </div>
              </div>
            )}

            {/* Multi City form */}
            {tripType === "multicity" && (
              <div className="space-y-3">
                {mcRoutes.map((route, i) => (
                  <div key={i} className="flex flex-col sm:flex-row sm:items-end gap-2 p-3 rounded-xl bg-gray-50 border relative">
                    <span className="absolute top-2 left-3 text-xs font-bold text-muted-foreground">Flight {i + 1}</span>
                    <div className="flex-1 pt-4 sm:pt-0 space-y-1">
                      <label className={labelCls}>From</label>
                      <input
                        type="text"
                        placeholder="City or Airport"
                        value={route.from}
                        onChange={(e) => updateMcRoute(i, "from", e.target.value)}
                        className={inputCls}
                      />
                    </div>
                    <div className="flex-1 space-y-1">
                      <label className={labelCls}>To</label>
                      <input
                        type="text"
                        placeholder="City or Airport"
                        value={route.to}
                        onChange={(e) => updateMcRoute(i, "to", e.target.value)}
                        className={inputCls}
                      />
                    </div>
                    <div className="w-full sm:w-40 space-y-1">
                      <label className={labelCls}>Date</label>
                      <input type="date" value={route.date} min={today} onChange={(e) => updateMcRoute(i, "date", e.target.value)} className={inputCls} />
                    </div>
                    {mcRoutes.length > 2 && (
                      <button onClick={() => removeMcRoute(i)}
                        className="sm:mb-0.5 w-9 h-9 rounded-full border border-gray-200 bg-white text-gray-400 hover:text-red-500 hover:border-red-300 flex items-center justify-center shrink-0 self-center sm:self-auto transition-colors"
                        title="Remove this flight">
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
                <div className="flex items-center gap-3 flex-wrap">
                  {mcRoutes.length < 4 && (
                    <button onClick={addMcRoute}
                      className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-primary border border-primary/40 rounded-full hover:bg-primary/5 transition-colors">
                      <Plus className="w-3.5 h-3.5" /> Add Another Flight
                    </button>
                  )}
                  <div className="ml-auto">
                    <Button asChild size="lg" className="h-10 px-6 text-sm font-bold">
                      <Link href={flightsUrl} onClick={handleFlightSearch}>
                        <Search className="w-4 h-4 mr-2" /> Search Multi-City
                      </Link>
                    </Button>
                  </div>
                </div>
                {flightError && <p className="text-red-600 text-xs font-medium">⚠️ Please fill all route fields</p>}
              </div>
            )}

            {/* Passengers + Cabin Class row */}
            <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-gray-100">
              {/* Passenger selector */}
              <div className="relative" ref={paxRef}>
                <button
                  onClick={() => setPaxOpen(o => !o)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white hover:border-primary/40 transition-colors text-sm font-medium text-foreground"
                >
                  <Users className="w-4 h-4 text-muted-foreground" />
                  <span>{paxLabel}</span>
                  <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${paxOpen ? "rotate-180" : ""}`} />
                </button>
                {paxOpen && (
                  <div className="absolute top-full mt-1.5 left-0 z-50 w-64 rounded-xl border bg-white shadow-xl p-4 space-y-4">
                    {([
                      { label: "Adults",   sub: "12+ years",  val: adults,   set: setAdults,   min: 1 },
                      { label: "Children", sub: "2–11 years", val: children, set: setChildren, min: 0 },
                      { label: "Infants",  sub: "Under 2",    val: infants,  set: setInfants,  min: 0 },
                    ] as const).map(({ label, sub, val, set, min }) => (
                      <div key={label} className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{label}</p>
                          <p className="text-xs text-muted-foreground">{sub}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => set(v => Math.max(min, v - 1))}
                            disabled={val <= min}
                            className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:border-primary/40 hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="w-5 text-center text-sm font-bold">{val}</span>
                          <button
                            onClick={() => set(v => v + 1)}
                            disabled={totalPax >= 9}
                            className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:border-primary/40 hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                    <button
                      onClick={() => setPaxOpen(false)}
                      className="w-full mt-1 py-2 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-colors"
                    >
                      Done
                    </button>
                  </div>
                )}
              </div>

            </div>

          </TabsContent>

          {/* ── Hotels ── */}
          <TabsContent value="hotels" className="pt-6 pb-2 px-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
              <div className="sm:col-span-2 lg:col-span-1 space-y-1">
                <label className={labelCls}>Location or Hotel</label>
                <AutocompleteInput placeholder="City or hotel name (e.g. Mumbai, Taj)" suggestions={hotelCitySuggestions} value={hotelLocation} onChange={handleHotelLocationChange} />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Check-in</label>
                <input type="date" value={hotelCheckIn} min={today} onChange={(e) => setHotelCheckIn(e.target.value)} className={inputCls} />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Check-out</label>
                <input type="date" value={hotelCheckOut} min={hotelCheckIn || today} onChange={(e) => setHotelCheckOut(e.target.value)} className={inputCls} />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Adults</label>
                <select
                  value={hotelAdults}
                  onChange={(e) => handleHotelAdultsChange(parseInt(e.target.value))}
                  className={inputCls}
                >
                  {[1,2,3,4,5,6].map((n) => (
                    <option key={n} value={n}>{n} Adult{n > 1 ? "s" : ""}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Rooms</label>
                <select
                  value={hotelRooms}
                  onChange={(e) => setHotelRooms(parseInt(e.target.value))}
                  className={inputCls}
                >
                  {[1,2,3,4,5].map((n) => (
                    <option key={n} value={n}>{n} Room{n > 1 ? "s" : ""}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-end sm:col-span-2 lg:col-span-1">
                <div className="w-full space-y-1">
                  <label className={labelCls + " invisible"}>Search</label>
                  <Button asChild size="lg" className="w-full h-12 text-base font-bold">
                    <Link href={hotelsUrl} onClick={handleHotelSearch}>
                      <Search className="w-5 h-5 mr-2" /> Search Hotels
                    </Link>
                  </Button>
                  {hotelError && <p className="text-red-600 text-xs mt-2 font-medium">⚠️ Please fill all fields</p>}
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ── Buses ── */}
          <TabsContent value="buses" className="pt-6 pb-2 px-2">
            <div className="flex flex-col lg:grid lg:grid-cols-4 gap-4">
              {/* FROM + swap + TO — stacked on mobile, row on md+ */}
              <div className="lg:col-span-2 flex flex-col lg:flex-row lg:items-end gap-3 lg:gap-2">
                <div className="w-full lg:flex-1 min-w-0 space-y-1">
                  <label className={labelCls}>Leaving From</label>
                  <AutocompleteInput placeholder="e.g. Hyderabad" suggestions={busCitySuggestions} value={busFrom} onChange={setBusFrom} />
                </div>
                <button onClick={handleBusSwap}
                  className="w-9 h-9 rounded-full border border-gray-200 bg-white text-gray-400 hover:text-gray-600 hover:scale-105 active:scale-95 transition-all duration-150 flex items-center justify-center shadow-sm shrink-0 self-center lg:self-auto lg:mb-0.5"
                  title="Swap cities">
                  <ArrowLeftRight className="w-4 h-4" />
                </button>
                <div className="w-full lg:flex-1 min-w-0 space-y-1">
                  <label className={labelCls}>Going To</label>
                  <AutocompleteInput placeholder="e.g. Bangalore" suggestions={busCitySuggestions} value={busTo} onChange={setBusTo} />
                </div>
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Date</label>
                <input type="date" value={busDate} min={today} onChange={(e) => setBusDate(e.target.value)} className={inputCls} />
              </div>
              <div className="space-y-1">
                <label className={labelCls + " invisible hidden sm:block"}>Search</label>
                <Button asChild size="lg" className="w-full h-12 text-base font-bold">
                  <Link href={busesUrl} onClick={handleBusSearch}>
                    <Search className="w-5 h-5 mr-2" /> Search Buses
                  </Link>
                </Button>
                {busError && <p className="text-red-600 text-xs mt-2 font-medium">⚠️ Please fill all fields</p>}
              </div>
            </div>
          </TabsContent>

          {/* ── Packages ── */}
          <TabsContent value="packages" className="pt-6 pb-2 px-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="sm:col-span-2 space-y-1">
                <label className={labelCls}>Destination</label>
                <AutocompleteInput placeholder="Where do you want to go?" suggestions={packageDestinations} value={packageDestination} onChange={setPackageDestination} />
              </div>
              <div className="space-y-1">
                <label className={labelCls}>Package Type</label>
                <select className={inputCls}>
                  <option value="">Any Type</option>
                  <option value="beach">Beach</option>
                  <option value="adventure">Adventure</option>
                  <option value="cultural">Cultural</option>
                </select>
              </div>
              <div className="flex items-end">
                <div className="w-full space-y-1">
                  <label className={labelCls + " invisible"}>Search</label>
                  <Button asChild size="lg" className="w-full h-12 text-base font-bold">
                    <Link href={packageDestination ? `/packages?destination=${encodeURIComponent(packageDestination)}` : "/packages"}>
                      <Search className="w-5 h-5 mr-2" /> Find Packages
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
