import { useState, useEffect, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { getConvenienceFee, getHiddenMarkupAmount } from "@/lib/pricing";
import { autoSaveLead } from "@/lib/crm";
import { saveBookingSession } from "@/lib/booking-session";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Plane, ArrowLeft, Clock, Calendar, Users, CheckCircle2,
  ChevronRight, AlertCircle, UserPlus, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Passenger = {
  name: string;
  age: string;
  gender: string;
  email: string;
  phone: string;
};

const emptyPassenger = (): Passenger => ({ name: "", age: "", gender: "", email: "", phone: "" });

type FieldErrors = Partial<Record<keyof Passenger, string>>;

function validatePassengers(passengers: Passenger[]): FieldErrors[] {
  return passengers.map((p) => {
    const errors: FieldErrors = {};
    if (!p.name.trim() || p.name.trim().length < 2)
      errors.name = "Full name must be at least 2 characters";
    const age = parseInt(p.age);
    if (!p.age || isNaN(age) || age < 1 || age > 120)
      errors.age = "Enter a valid age (1–120)";
    if (!p.gender)
      errors.gender = "Please select a gender";
    if (!p.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email))
      errors.email = "Enter a valid email address";
    if (!p.phone.trim() || !/^\d{10}$/.test(p.phone.replace(/\D/g, "")))
      errors.phone = "Enter a valid 10-digit phone number";
    return errors;
  });
}

function formatDate(d: string) {
  if (!d) return "";
  try {
    return new Date(d + "T00:00:00").toLocaleDateString("en-IN", {
      weekday: "long", day: "2-digit", month: "long", year: "numeric",
    });
  } catch { return d; }
}

const AIRLINE_GRADIENT: Record<string, string> = {
  indigo:      "from-blue-500 to-indigo-600",
  "air india": "from-red-500 to-orange-500",
  vistara:     "from-purple-500 to-violet-700",
  spicejet:    "from-red-500 to-rose-600",
  "akasa air": "from-yellow-400 to-orange-500",
  goair:       "from-sky-500 to-blue-600",
};
function airlineGradient(name: string) {
  const k = name.toLowerCase();
  for (const key in AIRLINE_GRADIENT) if (k.includes(key)) return AIRLINE_GRADIENT[key];
  return "from-slate-500 to-slate-700";
}

const DOMESTIC_CITIES = new Set([
  "delhi","mumbai","bangalore","bengaluru","chennai","kolkata",
  "hyderabad","pune","ahmedabad","jaipur","lucknow","bhopal",
  "chandigarh","goa","kochi","indore","nagpur","patna","surat",
  "vadodara","agra","visakhapatnam","bhubaneswar","coimbatore",
  "mangalore","amritsar","trichy","madurai","ranchi","raipur","varanasi",
]);

export default function FlightBooking() {
  const searchString = useSearch();
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, isAgent } = useAuth();
  const { toast } = useToast();

  const p = new URLSearchParams(searchString);
  const flightId    = p.get("id")            || "";
  const airline     = p.get("airline")       || "Airline";
  const flightNum   = p.get("flightNumber")  || "";
  const from        = p.get("from")          || "";
  const to          = p.get("to")            || "";
  const departure   = p.get("departure")     || "";
  const arrival     = p.get("arrival")       || "";
  const duration    = p.get("duration")      || "";
  const date        = p.get("date")          || "";
  const rawPrice           = parseInt(p.get("price")           || "0",  10);
  const markupFromUrl      = parseInt(p.get("markup")          || "-1", 10);
  const priceWithMarkupUrl = parseInt(p.get("priceWithMarkup") || "-1", 10);
  const normalMarkupUrl    = parseInt(p.get("normalMarkup")    || "-1", 10);
  const agentSavingsUrl    = parseInt(p.get("agentSavings")    || "0",  10);
  const travelers          = parseInt(p.get("travelers")       || "1",  10);
  const cabinClass         = p.get("cabinClass")               || "ECONOMY";
  const cabinLabel         = p.get("cabinLabel")               || "Economy";
  // TripJack fareId from the selected fare option — used as bookingId for fareQuote / SSR
  const fareKey            = p.get("fareKey")                  || flightId;

  const hiddenMarkup   = markupFromUrl >= 0 ? markupFromUrl : getHiddenMarkupAmount(rawPrice, "flights");
  const baseFare       = priceWithMarkupUrl > 0 ? priceWithMarkupUrl : rawPrice + hiddenMarkup;
  const convFee        = getConvenienceFee(rawPrice, "flights");
  const savings        = (isAgent && agentSavingsUrl > 0) ? agentSavingsUrl : 0;

  const [passengers, setPassengers] = useState<Passenger[]>(Array.from({ length: travelers }, emptyPassenger));
  const [errors,     setErrors]     = useState<FieldErrors[]>(Array.from({ length: travelers }, () => ({})));
  const [submitting, setSubmitting] = useState(false);
  const [submitStep, setSubmitStep] = useState("");
  const [fareUnavailable, setFareUnavailable] = useState<string | null>(null);
  const [priceChangeInfo, setPriceChangeInfo] = useState<{
    oldTotal: number;
    newTotal: number;
    newRawPrice: number;
    newBaseFare: number;
    resolvedBookingId: string;
  } | null>(null);

  // Pre-fill from logged-in user
  useEffect(() => {
    if (user && passengers[0].email === "") {
      setPassengers((prev) => {
        const next = [...prev];
        next[0] = { ...next[0], name: user.name || "", email: user.email || "", phone: user.phone || "" };
        return next;
      });
    }
  }, [user]);

  // Abandoned lead timer
  const abandonedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const name  = passengers[0]?.name?.trim()  ?? "";
    const phone = passengers[0]?.phone?.trim().replace(/\D/g,"") ?? "";
    if (name.length >= 2 && phone.length === 10) {
      if (abandonedTimerRef.current) clearTimeout(abandonedTimerRef.current);
      abandonedTimerRef.current = setTimeout(() => {
        autoSaveLead(name, phone, "flight", passengers[0]?.email || undefined, `Abandoned flight booking: ${from} → ${to}`, "auto", "abandoned");
      }, 2 * 60 * 1000);
    } else {
      if (abandonedTimerRef.current) { clearTimeout(abandonedTimerRef.current); abandonedTimerRef.current = null; }
    }
    return () => { if (abandonedTimerRef.current) clearTimeout(abandonedTimerRef.current); };
  }, [passengers[0]?.name, passengers[0]?.phone]);

  function updatePassenger(i: number, field: keyof Passenger, value: string) {
    setPassengers((prev) => { const next = [...prev]; next[i] = { ...next[i], [field]: value }; return next; });
    setErrors((prev)     => { const next = [...prev]; next[i] = { ...next[i], [field]: undefined }; return next; });
  }

  const totalBase = (baseFare + convFee) * travelers;

  async function handleContinue() {
    setFareUnavailable(null);
    setPriceChangeInfo(null);
    const validated = validatePassengers(passengers);
    if (validated.some((e) => Object.keys(e).length > 0)) {
      setErrors(validated);
      toast({ variant: "destructive", title: "Please fill all passenger details", description: "Check the form for errors." });
      return;
    }

    if (abandonedTimerRef.current) clearTimeout(abandonedTimerRef.current);

    saveBookingSession({
      type: "flight",
      flightId, airline, flightNum,
      from, to, date, departure, arrival, duration,
      passengers, travelers,
      selectedSeats: [],
      extraBaggageKg: 0,
      extraBaggageCost: 0,
      extraBaggageCode: "",
      rawPrice, hiddenMarkup, baseFare, convFee, totalBase,
      isAgent, agentSavings: agentSavingsUrl, normalMarkup: normalMarkupUrl >= 0 ? normalMarkupUrl : hiddenMarkup,
      agentId:    isAgent ? user?.id    : undefined,
      agentEmail: isAgent ? user?.email : undefined,
      cabinClass,
      cabinLabel,
      tjBookingId: fareKey,
    });

    setSubmitting(true);
    const apiBase = (import.meta.env.VITE_API_BASE_URL as string) ?? "";

    // ── Step 1: Fare Quote ────────────────────────────────────────────────────
    // If the user came via flight-results, fareQuote was already called there
    // and the result is cached in sessionStorage.  Use it directly so we never
    // hit the airline twice, which is the root cause of false "sold out" errors.
    setSubmitStep("Confirming fare…");
    let resolvedBookingId = fareKey;

    const prefetchedKey = sessionStorage.getItem("ww_tj_farequote_key");
    const prefetchedStr = sessionStorage.getItem("ww_tj_farequote");
    const prefetchedId  = sessionStorage.getItem("ww_tj_booking_id");  // "" for non-TJ fares
    const isTjFare      = sessionStorage.getItem("ww_is_tj_fare") !== "0";
    // prefetchedId may be empty for non-TJ fares — that's intentional; don't require it
    const hasPrefetch   = prefetchedKey === fareKey && !!prefetchedStr;

    if (hasPrefetch) {
      // ── Use data already fetched at flight selection ──────────────────────
      // For non-TJ fares, prefetchedId is "" (empty) — resolvedBookingId stays ""
      resolvedBookingId = prefetchedId ?? "";
      const fqCached: any = JSON.parse(prefetchedStr!);
      console.info("[fareQuote] using pre-fetched data | bookingId:", resolvedBookingId || "(non-TJ fare)", "| isTjFare:", isTjFare);

      // Still check whether the cached data shows a different price
      const tf: number = fqCached?.data?.totalPriceInfo?.totalFareDetail?.fC?.TF ?? 0;
      if (tf > 0 && Math.abs(tf - rawPrice * travelers) > 1) {
        const newRawPerPerson = Math.round(tf / travelers);
        const newBaseFare     = newRawPerPerson + hiddenMarkup;
        const newTotal        = (newBaseFare + convFee) * travelers;
        setPriceChangeInfo({ oldTotal: totalBase, newTotal, newRawPrice: newRawPerPerson, newBaseFare, resolvedBookingId });
        setSubmitting(false);
        setSubmitStep("");
        return;
      }
      // Price consistent — skip the network block entirely; SSR will use resolvedBookingId
    } else {
      // No pre-fetched fareQuote in session — the user likely refreshed the page
      // or landed here via a direct URL. Send them back to search so they can
      // select a flight and have the fare verified before proceeding.
      console.warn("[fareQuote] no cached data — redirecting to search");
      toast({
        variant:     "destructive",
        title:       "Session expired",
        description: "Please select your flight again to continue.",
      });
      setSubmitting(false);
      setSubmitStep("");
      return;
    }

    // ── Step 2: SSR — seats & baggage (optional — failure shows empty state) ──
    setSubmitStep("Fetching seats & baggage…");
    try {
      const ssrRes = await fetch(`${apiBase}/api/tj-ssr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: resolvedBookingId }),
      });
      const ssrData = await ssrRes.json();
      // Store even if data is empty — add-ons page will show "not available" cleanly
      sessionStorage.setItem("ww_ssr_data", JSON.stringify(ssrData));
    } catch {
      // SSR failure is non-fatal; clear any stale SSR data so add-ons shows empty state
      sessionStorage.removeItem("ww_ssr_data");
    }

    // Persist the resolved booking ID for downstream pages (add-ons, payment)
    sessionStorage.setItem("ww_tj_booking_id", resolvedBookingId);
    setSubmitting(false);
    setSubmitStep("");
    setLocation("/booking/flight-addons");
  }

  async function handleAcceptPriceChange() {
    if (!priceChangeInfo) return;
    const { newRawPrice, newBaseFare, newTotal, resolvedBookingId } = priceChangeInfo;
    setPriceChangeInfo(null);
    setSubmitting(true);
    setSubmitStep("Fetching seats & baggage…");

    // Update booking session with the accepted new price
    saveBookingSession({
      type: "flight",
      flightId, airline, flightNum,
      from, to, date, departure, arrival, duration,
      passengers, travelers,
      selectedSeats: [],
      extraBaggageKg: 0,
      extraBaggageCost: 0,
      extraBaggageCode: "",
      rawPrice:    newRawPrice,
      hiddenMarkup,
      baseFare:    newBaseFare,
      convFee,
      totalBase:   newTotal,
      isAgent, agentSavings: agentSavingsUrl,
      normalMarkup: normalMarkupUrl >= 0 ? normalMarkupUrl : hiddenMarkup,
      agentId:    isAgent ? user?.id    : undefined,
      agentEmail: isAgent ? user?.email : undefined,
      cabinClass,
      cabinLabel,
      tjBookingId: resolvedBookingId,
    });

    // SSR (re-fetch with the resolved booking ID)
    const apiBase = (import.meta.env.VITE_API_BASE_URL as string) ?? "";
    try {
      const ssrRes = await fetch(`${apiBase}/api/tj-ssr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: resolvedBookingId }),
      });
      const ssrData = await ssrRes.json();
      sessionStorage.setItem("ww_ssr_data", JSON.stringify(ssrData));
    } catch {
      sessionStorage.removeItem("ww_ssr_data");
    }

    sessionStorage.setItem("ww_tj_booking_id", resolvedBookingId);
    setSubmitting(false);
    setSubmitStep("");
    setLocation("/booking/flight-addons");
  }

  const gradient = airlineGradient(airline);

  return (
    <Layout>
      {/* Page header */}
      <div className="bg-gradient-to-r from-blue-700 to-indigo-800 text-white">
        <div className="container mx-auto px-4 py-5">
          <button
            onClick={() => window.history.back()}
            className="flex items-center gap-1.5 text-blue-200 hover:text-white text-sm mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to results
          </button>

          <div className="flex items-center gap-2 text-sm mb-5">
            {["Flight Selection", "Passenger Details", "Add-ons", "Payment"].map((step, i) => (
              <div key={step} className="flex items-center gap-2">
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2",
                  i === 1 ? "bg-white text-blue-700 border-white"
                  : i < 1 ? "bg-blue-500 border-blue-500 text-white"
                  : "border-blue-400 text-blue-400"
                )}>
                  {i < 1 ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
                </div>
                <span className={cn("hidden sm:inline", i === 1 ? "font-bold" : "text-blue-300")}>{step}</span>
                {i < 3 && <ChevronRight className="w-4 h-4 text-blue-400" />}
              </div>
            ))}
          </div>

          <h1 className="text-2xl font-extrabold">Passenger Details</h1>
          <p className="text-blue-200 text-sm mt-0.5">Fill in your details — seats & baggage are selected in the next step</p>
        </div>
      </div>

      <div className="bg-slate-50 min-h-screen">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col lg:flex-row gap-6">

            {/* Left column */}
            <div className="flex-1 min-w-0 space-y-5">

              {!isAuthenticated && (
                <Alert className="border-blue-200 bg-blue-50">
                  <UserPlus className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-blue-800 text-sm">
                    <span className="font-semibold">No login needed!</span> An account will be created automatically after payment.
                  </AlertDescription>
                </Alert>
              )}

              {/* Flight Summary */}
              <Card className="shadow-sm border overflow-hidden">
                <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-5 py-3 flex items-center gap-2">
                  <Plane className="w-4 h-4 text-white" />
                  <span className="text-white font-semibold text-sm">Flight Summary</span>
                </div>
                <CardContent className="p-5">
                  <div className="flex items-center gap-3 mb-5">
                    <div className={cn("w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center shadow-sm shrink-0", gradient)}>
                      <span className="text-white font-extrabold text-sm">{airline.substring(0,2).toUpperCase()}</span>
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">{airline}</p>
                      <p className="text-xs text-muted-foreground">{flightNum}</p>
                    </div>
                    <Badge className="ml-auto bg-slate-100 text-slate-600 border-0">{cabinLabel}</Badge>
                  </div>
                  <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl mb-4">
                    <div>
                      <p className="text-3xl font-extrabold text-slate-900 tabular-nums">{departure}</p>
                      <p className="text-sm font-semibold text-slate-600 mt-0.5">{from}</p>
                    </div>
                    <div className="flex-1 flex flex-col items-center">
                      <p className="text-xs text-muted-foreground font-medium mb-1">{duration}</p>
                      <div className="w-full flex items-center gap-1">
                        <div className="flex-1 h-px bg-slate-300" />
                        <div className="w-7 h-7 rounded-full bg-blue-50 border-2 border-blue-200 flex items-center justify-center">
                          <Plane className="w-3.5 h-3.5 text-blue-600" />
                        </div>
                        <div className="flex-1 h-px bg-slate-300" />
                      </div>
                      <p className="text-[11px] text-green-600 font-bold mt-1 uppercase tracking-wide">Non-stop</p>
                    </div>
                    <div className="text-right">
                      <p className="text-3xl font-extrabold text-slate-900 tabular-nums">{arrival}</p>
                      <p className="text-sm font-semibold text-slate-600 mt-0.5">{to}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { icon: Calendar, label: "Date",      value: formatDate(date) || "—" },
                      { icon: Clock,    label: "Duration",  value: duration || "—"          },
                      { icon: Users,    label: "Travelers", value: `${travelers} Adult${travelers>1?"s":""}` },
                    ].map(({ icon: Icon, label, value }) => (
                      <div key={label} className="flex flex-col items-center p-3 bg-slate-50 rounded-xl border text-center">
                        <Icon className="w-4 h-4 text-blue-600 mb-1" />
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">{label}</p>
                        <p className="text-xs font-bold text-slate-800 mt-0.5 leading-tight">{value}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Passenger Details */}
              {Array.from({ length: travelers }).map((_, i) => (
                <Card key={i} className="shadow-sm border">
                  <CardHeader className="pb-4 pt-5 px-5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm shrink-0">
                        {i + 1}
                      </div>
                      <div>
                        <CardTitle className="text-base">
                          {i === 0 ? "Primary Passenger" : `Passenger ${i + 1}`}
                        </CardTitle>
                        {i === 0 && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Booking confirmation will be sent here
                          </p>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="px-5 pb-5 space-y-4">
                    <div>
                      <label className="text-sm font-semibold text-slate-700 block mb-1.5">
                        Full Name <span className="text-red-500">*</span>
                      </label>
                      <Input
                        placeholder="As on government ID"
                        value={passengers[i].name}
                        onChange={(e) => updatePassenger(i, "name", e.target.value)}
                        className={cn("h-11", errors[i]?.name && "border-red-400")}
                      />
                      {errors[i]?.name && <p className="text-xs text-red-500 mt-1">{errors[i].name}</p>}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-semibold text-slate-700 block mb-1.5">
                          Age <span className="text-red-500">*</span>
                        </label>
                        <Input
                          type="number" min={1} max={120} placeholder="Enter age"
                          value={passengers[i].age}
                          onChange={(e) => updatePassenger(i, "age", e.target.value)}
                          className={cn("h-11", errors[i]?.age && "border-red-400")}
                        />
                        {errors[i]?.age && <p className="text-xs text-red-500 mt-1">{errors[i].age}</p>}
                      </div>
                      <div>
                        <label className="text-sm font-semibold text-slate-700 block mb-1.5">
                          Gender <span className="text-red-500">*</span>
                        </label>
                        <Select value={passengers[i].gender} onValueChange={(v) => updatePassenger(i, "gender", v)}>
                          <SelectTrigger className={cn("h-11", errors[i]?.gender && "border-red-400")}>
                            <SelectValue placeholder="Select gender" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="male">Male</SelectItem>
                            <SelectItem value="female">Female</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                        {errors[i]?.gender && <p className="text-xs text-red-500 mt-1">{errors[i].gender}</p>}
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-semibold text-slate-700 block mb-1.5">
                        Email Address <span className="text-red-500">*</span>
                      </label>
                      <Input
                        type="email" placeholder="passenger@email.com"
                        value={passengers[i].email}
                        onChange={(e) => updatePassenger(i, "email", e.target.value)}
                        className={cn("h-11", errors[i]?.email && "border-red-400")}
                      />
                      {errors[i]?.email && <p className="text-xs text-red-500 mt-1">{errors[i].email}</p>}
                    </div>

                    <div>
                      <label className="text-sm font-semibold text-slate-700 block mb-1.5">
                        Phone Number <span className="text-red-500">*</span>
                      </label>
                      <div className="flex gap-2">
                        <div className="flex items-center gap-1.5 border rounded-md px-3 bg-muted/30 text-sm font-medium text-slate-600 shrink-0">
                          🇮🇳 +91
                        </div>
                        <Input
                          type="tel" placeholder="10-digit mobile number" maxLength={10}
                          value={passengers[i].phone}
                          onChange={(e) => updatePassenger(i, "phone", e.target.value.replace(/\D/g,""))}
                          className={cn("h-11 flex-1", errors[i]?.phone && "border-red-400")}
                        />
                      </div>
                      {errors[i]?.phone && <p className="text-xs text-red-500 mt-1">{errors[i].phone}</p>}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Right: Price summary + Continue */}
            <div className="w-full lg:w-80 shrink-0">
              <div className="sticky top-4 space-y-4">
                <Card className="shadow-sm border">
                  <CardHeader className="pb-3 pt-5 px-5">
                    <CardTitle className="text-base">Price Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="px-5 pb-5 space-y-4">

                    <div className="p-3 bg-blue-50 rounded-xl border border-blue-100">
                      <p className="text-xs text-blue-600 font-medium mb-1">Base Fare (per person)</p>
                      <div className="flex items-baseline gap-1">
                        <span className="text-lg font-bold text-blue-800">₹</span>
                        <span className="text-3xl font-extrabold text-blue-800 tabular-nums">{baseFare.toLocaleString("en-IN")}</span>
                      </div>
                      {savings > 0 && (
                        <p className="text-xs text-green-600 font-semibold mt-1">Agent saves ₹{savings.toLocaleString("en-IN")} per person</p>
                      )}
                    </div>

                    <div className="space-y-2.5">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Breakdown</p>
                      <div className="flex justify-between text-sm text-slate-600">
                        <span>Base Fare × {travelers}</span>
                        <span className="font-medium">₹{(baseFare * travelers).toLocaleString("en-IN")}</span>
                      </div>
                      {convFee > 0 && (
                        <div className="flex justify-between text-sm text-slate-600">
                          <span>Convenience Fee × {travelers}</span>
                          <span className="font-medium">+₹{(convFee * travelers).toLocaleString("en-IN")}</span>
                        </div>
                      )}
                      {isAgent && savings > 0 && (
                        <div className="flex justify-between text-xs text-emerald-600 bg-emerald-50 rounded-lg px-2 py-1.5">
                          <span className="font-medium">Commission saved × {travelers}</span>
                          <span className="font-bold">₹{(savings * travelers).toLocaleString("en-IN")}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-extrabold text-lg pt-3 border-t border-dashed text-slate-900">
                        <span>Total</span>
                        <span className="text-blue-700">₹{totalBase.toLocaleString("en-IN")}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">Coupons & credits applied on next step</p>
                    </div>

                    {/* ── Fare unavailable ───────────────────────────────────── */}
                    {fareUnavailable && (
                      <Alert className="border-red-200 bg-red-50">
                        <AlertCircle className="h-4 w-4 text-red-600" />
                        <AlertDescription className="text-red-800 text-sm">
                          <p className="font-semibold mb-2">{fareUnavailable}</p>
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full border-red-300 text-red-700 hover:bg-red-50"
                            onClick={() => window.history.back()}
                          >
                            ← Back to Flight Results
                          </Button>
                        </AlertDescription>
                      </Alert>
                    )}

                    {/* ── Normal continue button ──────────────────────────────── */}
                    {!fareUnavailable && (
                    <Button
                      size="lg"
                      onClick={handleContinue}
                      disabled={submitting}
                      className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold h-12 text-base gap-2 shadow-md mt-2"
                    >
                      {submitting
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> {submitStep || "Please wait…"}</>
                        : <>Continue to Add-ons <ChevronRight className="w-4 h-4" /></>
                      }
                    </Button>
                    )}

                    {!isAuthenticated && (
                      <p className="text-[11px] text-center text-slate-500">
                        Your account will be created automatically after payment
                      </p>
                    )}

                    <div className="space-y-1.5 pt-2 border-t">
                      {["No login required to book", "Instant e-ticket on confirmation", "24/7 customer support"].map((t) => (
                        <div key={t} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                          {t}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* ── Price Updated Modal ─────────────────────────────────────────────── */}
      <Dialog
        open={!!priceChangeInfo}
        onOpenChange={(open) => {
          if (!open && priceChangeInfo) {
            setPriceChangeInfo(null);
            window.history.back();
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader className="items-center text-center gap-3 pb-1">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-amber-100">
              <AlertCircle className="h-6 w-6 text-amber-600" />
            </div>
            <DialogTitle className="text-xl font-bold text-slate-800">
              Price Updated
            </DialogTitle>
            <DialogDescription asChild>
              <div className="text-center space-y-3 pt-1">
                <p className="text-slate-600 text-sm">
                  The price has changed from{" "}
                  <span className="font-semibold text-slate-500 line-through">
                    ₹{priceChangeInfo?.oldTotal.toLocaleString("en-IN")}
                  </span>{" "}
                  to{" "}
                  <span className="font-bold text-slate-900">
                    ₹{priceChangeInfo?.newTotal.toLocaleString("en-IN")}
                  </span>
                </p>
                <div className="flex items-center justify-center gap-4 bg-slate-50 rounded-lg px-6 py-3 border">
                  <div className="text-center">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">Was</p>
                    <p className="text-base font-bold text-slate-400 line-through">
                      ₹{priceChangeInfo?.oldTotal.toLocaleString("en-IN")}
                    </p>
                  </div>
                  <div className="text-amber-500 font-bold text-xl">→</div>
                  <div className="text-center">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-0.5">Now</p>
                    <p className="text-xl font-extrabold text-amber-700">
                      ₹{priceChangeInfo?.newTotal.toLocaleString("en-IN")}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-slate-400">
                  This fare is still available — would you like to continue with the updated price?
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 pt-2 sm:flex-col">
            <Button
              onClick={handleAcceptPriceChange}
              disabled={submitting}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold h-11 gap-2"
            >
              {submitting
                ? <><Loader2 className="w-4 h-4 animate-spin" /> {submitStep || "Please wait…"}</>
                : <>Continue <ChevronRight className="w-4 h-4" /></>
              }
            </Button>
            <Button
              variant="outline"
              onClick={() => { setPriceChangeInfo(null); window.history.back(); }}
              disabled={submitting}
              className="w-full h-11 border-slate-200 text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </Layout>
  );
}
