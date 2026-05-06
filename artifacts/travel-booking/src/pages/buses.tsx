import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import { Link, useLocation } from "wouter";
import { PageHero } from "@/components/page-hero";
import { useBusesWithFallback } from "@/lib/use-data-with-fallback";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AutocompleteInput } from "@/components/autocomplete-input";
import { busCitySuggestions } from "@/lib/city-suggestions";
import { 
  Bus, 
  Search, 
  Filter, 
  IndianRupee,
  MapPin,
  Calendar,
  Users,
  SlidersHorizontal,
  Wind,
  Wifi,
  Coffee,
  Music,
  Zap,
  ArrowLeftRight
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export default function Buses() {
  const { data: buses, isLoading } = useBusesWithFallback();
  const [location, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");  const [priceRange, setPriceRange] = useState([0, 5000]);
  const [selectedOperators, setSelectedOperators] = useState<string[]>([]);
  const [selectedBusTypes, setSelectedBusTypes] = useState<string[]>([]);
  const [departureTime, setDepartureTime] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<"cheapest" | "fastest" | "earliest" | "latest">("cheapest");
  
  const today = new Date().toISOString().split("T")[0];

    // Search form states
  const [busFrom, setBusFrom] = useState("");
  const [busTo, setBusTo] = useState("");
  const [busDate, setBusDate] = useState(today);
    // Validation error state
  const [searchError, setSearchError] = useState(false);
  
  // MakeMyTrip-style: Don't show results until user searches
  // BUT if coming from home page with search params, show results immediately
  const [hasSearched, setHasSearched] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  
  // Get admin markup
  const markup = parseFloat(localStorage.getItem("markup") || "0");
  // Check if we have URL search parameters from home page
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const fromParam = urlParams.get('from');
    const toParam = urlParams.get('to');
    
    // Only show results if user actually entered BOTH search values
    if (fromParam && fromParam.trim() !== '' && toParam && toParam.trim() !== '') {
      // User came from home page with actual search values - show results immediately
      setHasSearched(true);
      setBusFrom(fromParam);
      setBusTo(toParam);
    }
  }, []);
    // Reset filters when navigating to this page
  useEffect(() => {
    if (location === "/buses") {
      const urlParams = new URLSearchParams(window.location.search);
      const fromParam = urlParams.get('from');
      const toParam = urlParams.get('to');
      const hasValidParams = fromParam && fromParam.trim() !== '' && toParam && toParam.trim() !== '';
      
      setSearchTerm("");
      setPriceRange([0, 5000]);
      setSelectedOperators([]);
      setSelectedBusTypes([]);
      
      if (!hasValidParams) {
        setHasSearched(false); // Only reset if no valid search params
        setBusFrom("");
        setBusTo("");
      }
    }
  }, [location]);

  // Get unique operators
  const operators = Array.isArray(buses) 
    ? Array.from(new Set(buses.map(b => b.operator)))
    : [];
  // Get unique bus types
  const busTypes = Array.isArray(buses)
    ? Array.from(new Set(buses.map(b => b.busType)))
    : [];

  // Helper function to get time period from departure time
  const getTimePeriod = (time: string) => {
    const hour = parseInt(time.split(':')[0]);
    if (hour >= 6 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 18) return 'afternoon';
    if (hour >= 18 && hour < 24) return 'evening';
    return 'night'; // 12AM - 6AM
  };

  const filteredBuses = Array.isArray(buses) ? buses.filter((bus) => {
    const matchesSearch = 
      bus.destination.toLowerCase().includes(searchTerm.toLowerCase()) ||
      bus.origin.toLowerCase().includes(searchTerm.toLowerCase()) ||
      bus.operator.toLowerCase().includes(searchTerm.toLowerCase());
    
    const finalPrice = bus.price + markup;
    const matchesPrice = finalPrice >= priceRange[0] && finalPrice <= priceRange[1];
    
    const matchesOperator = selectedOperators.length === 0 || 
      selectedOperators.includes(bus.operator);
    
    const matchesBusType = selectedBusTypes.length === 0 ||
      selectedBusTypes.includes(bus.busType);
    
    const matchesDepartureTime = departureTime.length === 0 ||
      departureTime.includes(getTimePeriod(bus.departureTime));
    
    return matchesSearch && matchesPrice && matchesOperator && matchesBusType && matchesDepartureTime;
  }) : [];

  // Sort buses based on selected option
  const sortedBuses = [...filteredBuses].sort((a, b) => {
    if (sortBy === "cheapest") {
      return (a.price + markup) - (b.price + markup);
    } else if (sortBy === "fastest") {
      const aDuration = parseInt(a.duration?.split('h')[0] || '0') * 60 + parseInt(a.duration?.split('h')[1]?.split('m')[0] || '0');
      const bDuration = parseInt(b.duration?.split('h')[0] || '0') * 60 + parseInt(b.duration?.split('h')[1]?.split('m')[0] || '0');
      return aDuration - bDuration;
    } else if (sortBy === "earliest") {
      return a.departureTime.localeCompare(b.departureTime);
    } else { // latest
      return b.departureTime.localeCompare(a.departureTime);
    }
  });

  const toggleOperator = (operator: string) => {
    setSelectedOperators(prev =>
      prev.includes(operator)
        ? prev.filter(o => o !== operator)
        : [...prev, operator]
    );
  };

  const toggleBusType = (busType: string) => {
    setSelectedBusTypes(prev =>
      prev.includes(busType)
        ? prev.filter(t => t !== busType)
        : [...prev, busType]
    );
  };
  const clearAllFilters = () => {
    setSelectedOperators([]);
    setSelectedBusTypes([]);
    setDepartureTime([]);
    setPriceRange([0, 5000]);
    setSearchTerm("");
  };

  const handleSwap = () => {
    const tmp = busFrom;
    setBusFrom(busTo);
    setBusTo(tmp);
  };

  const handleSearch = () => {
    // Validate required fields
    if (!busFrom.trim() || !busTo.trim() || !busDate.trim()) {
      setSearchError(true);
      setTimeout(() => setSearchError(false), 3000);
      return;
    }
    
    // Navigate to dedicated results page
    setSearchError(false);
    const params = new URLSearchParams({ from: busFrom, to: busTo, date: busDate });
    setLocation(`/bus/results?${params.toString()}`);
  };

  const getAmenityIcon = (amenity: string) => {
    const a = amenity.toLowerCase();
    if (a.includes('ac') || a.includes('air')) return <Wind className="w-3 h-3" />;
    if (a.includes('wifi') || a.includes('internet')) return <Wifi className="w-3 h-3" />;
    if (a.includes('water') || a.includes('snack') || a.includes('food')) return <Coffee className="w-3 h-3" />;
    if (a.includes('entertainment') || a.includes('tv')) return <Music className="w-3 h-3" />;
    if (a.includes('power') || a.includes('charging') || a.includes('usb')) return <Zap className="w-3 h-3" />;
    return null;
  };

  return (
    <Layout>
      <PageHero tab="buses" headline="Search Buses" sub="Book bus tickets online with the best offers">
        {/* Search Card */}
            <Card className="shadow-2xl border-0 bg-white/95 backdrop-blur-md supports-[backdrop-filter]:bg-white/88 max-w-4xl">
              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                  {/* From + Swap + To */}
                  <div className="md:col-span-2 flex flex-col md:flex-row md:items-end gap-3 md:gap-2">
                    {/* FROM */}
                    <div className="w-full md:flex-1 min-w-0">
                      <Label className="text-xs text-muted-foreground mb-2">FROM CITY</Label>
                      <div className="flex items-center gap-2 border rounded-lg px-3 py-2 bg-background focus-within:ring-2 focus-within:ring-primary">
                        <Bus className="w-4 h-4 text-muted-foreground shrink-0" />
                        <AutocompleteInput
                          placeholder="Hyderabad"
                          suggestions={busCitySuggestions}
                          value={busFrom}
                          onChange={setBusFrom}
                          className="border-0 p-0 h-7 font-semibold focus-visible:ring-0 bg-transparent w-full"
                        />
                      </div>
                    </div>

                    {/* Swap button */}
                    <button
                      onClick={handleSwap}
                      className="w-10 h-10 rounded-full border-2 border-primary bg-white text-primary hover:bg-primary hover:text-white transition-colors flex items-center justify-center shadow-md flex-shrink-0 self-center md:mb-0.5"
                      title="Swap cities"
                    >
                      <ArrowLeftRight className="w-4 h-4" />
                    </button>

                    {/* TO */}
                    <div className="w-full md:flex-1 min-w-0">
                      <Label className="text-xs text-muted-foreground mb-2">TO CITY</Label>
                      <div className="flex items-center gap-2 border rounded-lg px-3 py-2 bg-background focus-within:ring-2 focus-within:ring-primary">
                        <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                        <AutocompleteInput
                          placeholder="Vijayawada"
                          suggestions={busCitySuggestions}
                          value={busTo}
                          onChange={setBusTo}
                          className="border-0 p-0 h-7 font-semibold focus-visible:ring-0 bg-transparent w-full"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Date */}
                  <div>
                    <Label className="text-xs text-muted-foreground mb-2">TRAVEL DATE</Label>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <Input 
                        type="date"
                        value={busDate}
                        min={today}
                        onChange={(e) => setBusDate(e.target.value)}
                        className="border-0 p-0 h-8 font-semibold focus-visible:ring-0"
                      />
                    </div>
                  </div>
                </div>                <Button 
                  size="lg" 
                  className="w-full mt-6 bg-orange-600 hover:bg-orange-700 text-white font-bold h-12"
                  onClick={handleSearch}
                >
                  <Search className="w-5 h-5 mr-2" />
                  SEARCH BUSES
                </Button>
                
                {/* Error Message */}
                {searchError && (
                  <div className="mt-4">
                    <p className="text-red-600 text-sm font-medium flex items-center gap-2">
                      <span className="text-lg">⚠️</span>
                      Please fill in all required fields
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
      </PageHero>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar Filters - Desktop - Only show after search */}
          {hasSearched && (
            <aside className={cn(
              "lg:w-80 space-y-6",
              showMobileFilters ? "block" : "hidden lg:block"
            )}>
              <Card className="sticky top-20">
                <CardContent className="p-6 space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-lg flex items-center gap-2">
                      <SlidersHorizontal className="w-5 h-5" />
                      Filters
                    </h3>
                    {(selectedOperators.length > 0 || selectedBusTypes.length > 0 || priceRange[0] > 0 || priceRange[1] < 5000) && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={clearAllFilters}
                        className="text-xs"
                      >
                        Clear All
                      </Button>
                    )}
                  </div>

                  {/* Price Range Filter */}
                  <div>
                    <h4 className="font-semibold mb-4 text-sm">Price Range</h4>
                    <div className="space-y-4">
                      <Slider
                        value={priceRange}
                        onValueChange={setPriceRange}
                        min={0}
                        max={5000}
                        step={100}
                        className="mb-2"
                      />
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center font-semibold">
                          <IndianRupee className="w-3 h-3" />
                          {priceRange[0].toLocaleString()}
                        </span>
                        <span className="text-muted-foreground">to</span>
                        <span className="flex items-center font-semibold">
                          <IndianRupee className="w-3 h-3" />
                          {priceRange[1].toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Bus Operators Filter */}
                  <div>
                    <h4 className="font-semibold mb-4 text-sm">Bus Operators</h4>
                    <div className="space-y-3 max-h-60 overflow-y-auto">
                      {operators.map((operator) => (
                        <div key={operator} className="flex items-center space-x-3">
                          <Checkbox
                            id={operator}
                            checked={selectedOperators.includes(operator)}
                            onCheckedChange={() => toggleOperator(operator)}
                          />
                          <label
                            htmlFor={operator}
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                          >
                            {operator}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Bus Type Filter */}
                  <div>
                    <h4 className="font-semibold mb-4 text-sm">Bus Type</h4>
                    <div className="space-y-3">
                      {busTypes.map((busType) => (
                        <div key={busType} className="flex items-center space-x-3">
                          <Checkbox
                            id={busType}
                            checked={selectedBusTypes.includes(busType)}
                            onCheckedChange={() => toggleBusType(busType)}
                          />
                          <label
                            htmlFor={busType}
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                          >
                            {busType}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>                  {/* Departure Time */}
                  <div>
                    <h4 className="font-semibold mb-4 text-sm">Departure Time</h4>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { value: "morning", label: "Morning", time: "6AM - 12PM", icon: "🌅" },
                        { value: "afternoon", label: "Afternoon", time: "12PM - 6PM", icon: "☀️" },
                        { value: "evening", label: "Evening", time: "6PM - 12AM", icon: "🌆" },
                        { value: "night", label: "Night", time: "12AM - 6AM", icon: "🌙" }
                      ].map((slot) => (
                        <Button
                          key={slot.value}
                          variant={departureTime.includes(slot.value) ? "default" : "outline"}
                          size="sm"
                          className={cn(
                            "flex flex-col h-auto py-3 text-xs",
                            departureTime.includes(slot.value) && "bg-primary text-primary-foreground"
                          )}
                          onClick={() => {
                            setDepartureTime(prev => 
                              prev.includes(slot.value) 
                                ? prev.filter(t => t !== slot.value)
                                : [...prev, slot.value]
                            );
                          }}
                        >
                          <span className="text-lg mb-1">{slot.icon}</span>
                          <span className="font-semibold">{slot.label}</span>
                          <span className="text-[10px] opacity-80">{slot.time}</span>
                        </Button>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </aside>
          )}

          {/* Buses List */}
          <main className="flex-1 space-y-4">
            {!hasSearched ? (
              // Initial Empty State - No Search Performed Yet
              <Card className="border-2 border-dashed">
                <CardContent className="py-24 text-center">
                  <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-orange-100 flex items-center justify-center">
                    <Bus className="w-12 h-12 text-orange-600" />
                  </div>
                  <h3 className="text-2xl font-bold mb-3">Find Your Perfect Bus</h3>
                  <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                    Enter your journey details above and click <span className="font-semibold text-orange-600">"SEARCH BUSES"</span> to see available options
                  </p>
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Search className="w-4 h-4" />
                    <span>Search to get started</span>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Results Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                  <div>
                    <h2 className="text-2xl font-bold">
                      {filteredBuses?.length || 0} Buses Available
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Choose from our wide range of buses
                    </p>
                  </div>
                  <select className="border rounded-lg px-4 py-2 text-sm font-medium bg-background">
                    <option>Cheapest First</option>
                    <option>Fastest First</option>
                    <option>Earliest Departure</option>
                    <option>Latest Departure</option>
                  </select>
                </div>

                {/* Mobile Filter Button */}
                <div className="lg:hidden mb-4">
                  <Button 
                    variant="outline"
                    className="w-full gap-2"
                    onClick={() => setShowMobileFilters(!showMobileFilters)}
                  >
                    <Filter className="w-4 h-4" />
                    Filters {(selectedOperators.length > 0 || selectedBusTypes.length > 0) && `(${selectedOperators.length + selectedBusTypes.length})`}
                  </Button>
                </div>

                {/* Loading State */}
                {isLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Card key={i}>
                        <CardContent className="p-6">
                          <div className="flex items-center gap-4">
                            <Skeleton className="h-12 w-12 rounded-full" />
                            <div className="flex-1 space-y-2">
                              <Skeleton className="h-4 w-1/4" />
                              <Skeleton className="h-6 w-1/2" />
                            </div>
                            <Skeleton className="h-10 w-28" />
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : filteredBuses?.length === 0 ? (
                  // Empty State
                  <Card>
                    <CardContent className="py-16 text-center">
                      <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                        <Bus className="w-10 h-10 text-muted-foreground opacity-50" />
                      </div>
                      <h3 className="text-xl font-bold mb-2">No buses found</h3>
                      <p className="text-muted-foreground mb-4">
                        Try adjusting your filters or search criteria
                      </p>
                      <Button onClick={clearAllFilters} variant="outline">
                        Clear All Filters
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  // Bus Cards
                  <div className="space-y-4">
                    {filteredBuses.map((bus) => {
                      const finalPrice = bus.price + markup;
                      
                      return (
                        <Card
                          key={bus.id}
                          className="overflow-hidden hover:shadow-lg transition-all duration-300 border-2 hover:border-primary/20"
                        >
                          <CardContent className="p-0">
                            <div className="flex flex-col sm:flex-row">
                              {/* Bus Info */}
                              <div className="flex-1 p-4 sm:p-6">
                                {/* Operator */}
                                <div className="flex items-center gap-3 mb-4 sm:mb-6">
                                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-gradient-to-br from-orange-500 to-pink-600 flex items-center justify-center shadow-md shrink-0">
                                    <Bus className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="font-bold text-base sm:text-lg truncate">{bus.operator}</p>
                                    <p className="text-xs text-muted-foreground">{bus.busNumber}</p>
                                  </div>
                                  <Badge variant="secondary" className="shrink-0 text-xs">
                                    {bus.busType}
                                  </Badge>
                                </div>

                                {/* Route & Time */}
                                <div className="flex items-center gap-2 mb-4">
                                  {/* Origin */}
                                  <div className="shrink-0">
                                    <p className="text-xl sm:text-2xl font-bold tabular-nums">{bus.departureTime}</p>
                                    <p className="text-xs font-semibold text-muted-foreground">{bus.origin}</p>
                                  </div>

                                  {/* Duration */}
                                  <div className="flex-1 flex flex-col items-center px-2">
                                    <p className="text-[10px] text-muted-foreground mb-1">{bus.duration}</p>
                                    <div className="w-full flex items-center gap-1">
                                      <div className="flex-1 h-px bg-slate-300" />
                                      <Bus className="w-3.5 h-3.5 text-primary shrink-0" />
                                      <div className="flex-1 h-px bg-slate-300" />
                                    </div>
                                  </div>

                                  {/* Destination */}
                                  <div className="text-right shrink-0">
                                    <p className="text-xl sm:text-2xl font-bold tabular-nums">{bus.arrivalTime}</p>
                                    <p className="text-xs font-semibold text-muted-foreground">{bus.destination}</p>
                                  </div>
                                </div>

                                {/* Amenities */}
                                {bus.amenities && bus.amenities.length > 0 && (
                                  <div className="flex flex-wrap gap-2 pt-4 border-t">
                                    {bus.amenities.slice(0, 5).map((amenity: string, i: number) => (
                                      <Badge key={i} variant="outline" className="text-xs flex items-center gap-1">
                                        {getAmenityIcon(amenity)}
                                        {amenity}
                                      </Badge>
                                    ))}
                                    {bus.amenities.length > 5 && (
                                      <Badge variant="outline" className="text-xs">
                                        +{bus.amenities.length - 5} more
                                      </Badge>
                                    )}
                                  </div>
                                )}
                              </div>

                              {/* Price & CTA */}
                              <div className="sm:w-48 bg-muted/30 p-4 sm:p-6 flex flex-col justify-between border-t sm:border-t-0 sm:border-l">
                                <div>
                                  <p className="text-xs text-muted-foreground mb-1">Starting from</p>
                                  <div className="flex items-center gap-1 mb-1">
                                    <IndianRupee className="w-5 h-5 text-primary" />
                                    <p className="text-3xl font-bold text-primary">
                                      {finalPrice.toLocaleString()}
                                    </p>
                                  </div>
                                  <p className="text-xs text-muted-foreground">per seat</p>
                                  <p className="text-xs text-muted-foreground mt-2">
                                    {bus.seatsAvailable} seats available
                                  </p>
                                </div>

                                <div className="space-y-2 mt-4">
                                  <Link href={`/buses/${bus.id}`}>
                                    <Button className="w-full bg-orange-600 hover:bg-orange-700 font-bold">
                                      Select Seats
                                    </Button>
                                  </Link>
                                  <Link href={`/buses/${bus.id}`}>
                                    <Button variant="outline" className="w-full text-xs">
                                      View Details
                                    </Button>
                                  </Link>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      </div>
    </Layout>
  );
}
