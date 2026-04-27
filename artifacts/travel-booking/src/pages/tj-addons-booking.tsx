import { useState, useEffect, useRef } from "react";
import { useSearch, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Plane, ArrowLeft, CheckCircle2, ChevronRight, Armchair,
  Luggage, Loader2, AlertCircle, PartyPopper,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { API_CONFIG } from "@/lib/api-config";

const API = API_CONFIG.BASE_URL;

// ── Types ─────────────────────────────────────────────────────────────────────

type Passenger = {
  fn: string;  ln: string;  ti: string;
  dob: string; email: string; phone: string;
};

const emptyPassenger = (): Passenger => ({
  fn: "", ln: "", ti: "MR", dob: "", email: "", phone: "",
});

type TJSeat = {
  code: string; rowNo: number; seatNo: string;
  amount: number; isAvailable: boolean; seatType?: string;
};

type TJBaggage = {
  code: string; desc: string; weight: number; amount: number;
};

// ── Fallback static data (used when TripJack sandbox returns no SSR data) ─────

const FALLBACK_SEATS: TJSeat[] = Array.from({ length: 5 * 6 }, (_, i) => {
  const row = Math.floor(i / 6) + 1;
  const col = ["A","B","C","D","E","F"][i % 6];
  const TAKEN = new Set(["1A","1B","2C","3F","4D","5B"]);
  const code = `${row}${col}`;
  return { code, rowNo: row, seatNo: col, amount: 0, isAvailable: !TAKEN.has(code) };
});

const FALLBACK_BAGGAGE: TJBaggage[] = [
  { code: "NOBAG", desc: "No extra baggage",  weight: 0,  amount: 0    },
  { code: "BAG15", desc: "15 kg extra",        weight: 15, amount: 799  },
  { code: "BAG20", desc: "20 kg extra",        weight: 20, amount: 1099 },
  { code: "BAG30", desc: "30 kg extra",        weight: 30, amount: 1499 },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function TJAddonsBooking() {
  const searchString = useSearch();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const p = new URLSearchParams(searchString);
  const bookingId  = p.get("bookingId")  || "";
  const from       = p.get("from")       || "";
  const to         = p.get("to")         || "";
  const date       = p.get("date")       || "";
  const airline    = p.get("airline")    || "Airline";
  const flightNum  = p.get("flightNumber") || "";
  const departure  = p.get("departure")  || "";
  const arrival    = p.get("arrival")    || "";
  const duration   = p.get("duration")   || "";
  const price      = parseInt(p.get("price") || "0", 10);
  const travelers  = parseInt(p.get("passengers") || "1", 10);

  // ── Loading / data state ───────────────────────────────────────────────────
  const [step, setStep] = useState<"loading" | "addons" | "booking" | "success">("loading");
  const [loadingMsg, setLoadingMsg] = useState("Fetching fare details…");
  const [loadError, setLoadError]   = useState("");

  const [farequoteBookingId, setFarequoteBookingId] = useState("");
  const [quotedPrice, setQuotedPrice]               = useState(price);
  const [seats, setSeats]                           = useState<TJSeat[]>([]);
  const [baggageOptions, setBaggageOptions]         = useState<TJBaggage[]>([]);

  // ── User selections ────────────────────────────────────────────────────────
  const [selectedSeat,    setSelectedSeat]    = useState<TJSeat | null>(null);
  const [selectedBaggage, setSelectedBaggage] = useState<TJBaggage | null>(null);
  const [passengers,      setPassengers]      = useState<Passenger[]>(
    Array.from({ length: Math.max(1, travelers) }, emptyPassenger)
  );

  // ── Booking result ─────────────────────────────────────────────────────────
  const [pnr,          setPnr]          = useState("");
  const [confirmedId,  setConfirmedId]  = useState("");
  const [isBooking,    setIsBooking]    = useState(false);

  // ── Load fareQuote from cache + SSR on mount ──────────────────────────────
  // fareQuote is ONLY called when the user clicks "Select [cabin]" on the
  // flight-results page. The result is stored in sessionStorage there and
  // consumed here — we never call fareQuote automatically.
  const hasStarted = useRef(false);
  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;
    if (!bookingId) {
      setLoadError("No bookingId provided. Please go back and select a flight.");
      return;
    }
    runSSR();
  }, []);

  async function runSSR() {
    setStep("loading");

    // 1. Read fareQuote from sessionStorage cache (set during flight selection).
    // Using a local variable so the resolved ID is available immediately for SSR.
    const cachedFqStr = sessionStorage.getItem("ww_tj_farequote");
    const cachedBid   = sessionStorage.getItem("ww_tj_booking_id");
    let resolvedBid   = bookingId;

    if (cachedFqStr && cachedBid) {
      try {
        const fqData = JSON.parse(cachedFqStr);
        const fqPrice =
          fqData?.data?.totalPriceInfo?.totalFareDetail?.fC?.TF ||
          fqData?.results?.totalPriceInfo?.totalFareDetail?.fC?.TF ||
          price;
        resolvedBid = cachedBid;
        setFarequoteBookingId(cachedBid);
        setQuotedPrice(Number(fqPrice) || price);
        console.info("[tj-addons] Using cached fareQuote | bookingId:", cachedBid);
      } catch {
        resolvedBid = cachedBid || bookingId;
        setFarequoteBookingId(resolvedBid);
      }
    } else {
      // No cache — fall back to URL bookingId; SSR will still work
      console.warn("[tj-addons] No cached fareQuote found — using URL bookingId");
      setFarequoteBookingId(bookingId);
    }

    // 2. SSR — uses resolvedBid (not stale state)
    try {
      setLoadingMsg("Loading seats & baggage options…");
      const ssrBid = resolvedBid;
      const ssrRes = await fetch(`${API}/api/tj-ssr`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: ssrBid }),
      });
      const ssrData = await ssrRes.json();
      console.log("[tj-addons] SSR response:", ssrData);

      // Extract seats
      const rawSeats: TJSeat[] =
        ssrData?.tripSeatList?.[0]?.seatList?.flatMap((row: any) => row.seats || []) || [];
      // Extract baggage
      const rawBags: TJBaggage[] =
        ssrData?.tripBaggageList?.[0]?.baggageList || [];

      setSeats(rawSeats.length > 0 ? rawSeats : FALLBACK_SEATS);
      setBaggageOptions(rawBags.length > 0 ? rawBags : FALLBACK_BAGGAGE);
    } catch (err: any) {
      console.warn("[tj-addons] SSR failed, using fallback data:", err.message);
      setSeats(FALLBACK_SEATS);
      setBaggageOptions(FALLBACK_BAGGAGE);
    }

    setStep("addons");
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function updatePassenger(i: number, field: keyof Passenger, val: string) {
    setPassengers((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: val };
      return next;
    });
  }

  function validatePassengers(): boolean {
    for (const p of passengers) {
      if (!p.fn.trim() || !p.ln.trim()) {
        toast({ variant: "destructive", title: "Name required", description: "Enter first and last name for all passengers." });
        return false;
      }
      if (!p.dob) {
        toast({ variant: "destructive", title: "DOB required", description: "Enter date of birth for all passengers." });
        return false;
      }
      if (!p.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) {
        toast({ variant: "destructive", title: "Valid email required" });
        return false;
      }
      if (!p.phone.trim() || !/^\d{10}$/.test(p.phone.replace(/\D/g, ""))) {
        toast({ variant: "destructive", title: "Valid 10-digit phone required" });
        return false;
      }
    }
    return true;
  }

  // ── Step 3: Book ───────────────────────────────────────────────────────────
  async function handleBook() {
    if (!validatePassengers()) return;
    setIsBooking(true);

    const travellerInfo = passengers.map((p, idx) => ({
      fn: p.fn.toUpperCase(),
      ln: p.ln.toUpperCase(),
      ti: p.ti,
      dob: p.dob,
      pt: "ADULT",
      isPrimary: idx === 0,
      pDetails: { eml: p.email, pn: p.phone.replace(/\D/g, "") },
      ...(selectedSeat ? { seatCode: selectedSeat.code } : {}),
      ...(selectedBaggage && selectedBaggage.code !== "NOBAG"
        ? { baggageCode: selectedBaggage.code } : {}),
    }));

    const bookPayload = {
      bookingId: farequoteBookingId || bookingId,
      paymentInfos: [{ amount: quotedPrice * travelers }],
      travellerInfo,
      deliveryInfo: {
        emails:   [passengers[0].email],
        contacts: [passengers[0].phone.replace(/\D/g, "")],
        code: "91",
      },
      gstInfo: null,
    };

    console.log("[tj-addons] Book payload:", JSON.stringify(bookPayload, null, 2));

    try {
      const res = await fetch(`${API}/api/tj-book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bookPayload),
      });
      const data = await res.json();
      console.log("[tj-addons] Book response:", data);

      if (!res.ok || data?.status?.success === false) {
        const msg = data?.errors?.[0]?.message || data?.error || "Booking failed. Please try again.";
        toast({ variant: "destructive", title: "Booking failed", description: msg });
        setIsBooking(false);
        return;
      }

      const pnrVal = data?.pnr || data?.bookingId || data?.id || "—";
      const idVal  = data?.bookingId || data?.id || "";

      setPnr(pnrVal);
      setConfirmedId(idVal);
      setStep("success");
    } catch (err: any) {
      console.error("[tj-addons] Book error:", err.message);
      toast({ variant: "destructive", title: "Request failed", description: err.message });
    } finally {
      setIsBooking(false);
    }
  }

  // ── Unique seat rows for display ───────────────────────────────────────────
  const seatRows = seats.reduce<Record<number, TJSeat[]>>((acc, s) => {
    if (!acc[s.rowNo]) acc[s.rowNo] = [];
    acc[s.rowNo].push(s);
    return acc;
  }, {});

  // ── Render: loading ────────────────────────────────────────────────────────
  if (step === "loading") {
    return (
      <Layout>
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-50">
          <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          </div>
          <p className="text-slate-700 font-semibold text-lg">{loadingMsg}</p>
          <p className="text-sm text-muted-foreground">Please wait, contacting TripJack…</p>
          {loadError && (
            <Alert className="max-w-md border-red-200 bg-red-50">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">{loadError}</AlertDescription>
            </Alert>
          )}
        </div>
      </Layout>
    );
  }

  // ── Render: success ────────────────────────────────────────────────────────
  if (step === "success") {
    return (
      <Layout>
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
          <div className="bg-white rounded-2xl shadow-lg border p-10 max-w-lg w-full text-center space-y-6">
            <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto">
              <PartyPopper className="w-10 h-10 text-green-600" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold text-slate-900">Booking Confirmed!</h1>
              <p className="text-muted-foreground mt-2">Your TripJack booking is successfully placed.</p>
            </div>
            <div className="grid grid-cols-1 gap-4 text-left">
              <div className="p-4 bg-green-50 rounded-xl border border-green-200">
                <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-1">PNR</p>
                <p className="text-2xl font-extrabold text-green-800 tracking-widest">{pnr}</p>
              </div>
              {confirmedId && (
                <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
                  <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1">Booking ID</p>
                  <p className="text-lg font-bold text-blue-800 break-all">{confirmedId}</p>
                </div>
              )}
              <div className="p-4 bg-slate-50 rounded-xl border">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Flight Details</p>
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <span>{from}</span>
                  <Plane className="w-4 h-4 text-blue-500" />
                  <span>{to}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{airline} · {flightNum} · {date}</p>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setLocation("/flights")}>
                Search Again
              </Button>
              <Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={() => setLocation("/bookings")}>
                My Bookings
              </Button>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  // ── Render: add-ons + passenger form ──────────────────────────────────────
  return (
    <Layout>
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-700 to-indigo-800 text-white">
        <div className="container mx-auto px-4 py-5">
          <button
            onClick={() => window.history.back()}
            className="flex items-center gap-1.5 text-blue-200 hover:text-white text-sm mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to results
          </button>

          {/* Progress steps */}
          <div className="flex items-center gap-2 text-sm mb-5">
            {["Flight Selection", "Seats & Baggage", "Confirm & Book"].map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2",
                  i === 1 ? "bg-white text-blue-700 border-white"
                  : i < 1  ? "bg-blue-500 border-blue-500 text-white"
                  : "border-blue-400 text-blue-400"
                )}>
                  {i < 1 ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
                </div>
                <span className={cn("hidden sm:inline", i === 1 ? "font-bold" : "text-blue-300")}>{s}</span>
                {i < 2 && <ChevronRight className="w-4 h-4 text-blue-400" />}
              </div>
            ))}
          </div>

          <h1 className="text-2xl font-extrabold">Select Seats & Baggage</h1>
          <p className="text-blue-200 text-sm mt-0.5">
            {from} → {to} · {airline} {flightNum} · {date}
          </p>
        </div>
      </div>

      <div className="bg-slate-50 min-h-screen">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col lg:flex-row gap-6">

            {/* Left column: add-ons + passengers */}
            <div className="flex-1 min-w-0 space-y-5">

              {/* Fare confirmed banner */}
              <Alert className="border-green-200 bg-green-50">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800 text-sm">
                  <span className="font-semibold">Fare confirmed via TripJack.</span>{" "}
                  Price locked at ₹{quotedPrice.toLocaleString("en-IN")} per passenger.
                </AlertDescription>
              </Alert>

              {/* ── Seat Selection ─────────────────────────────────────── */}
              <Card className="shadow-sm border">
                <CardHeader className="pb-3 pt-5 px-5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0">
                      <Armchair className="w-4 h-4" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Seat Selection</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {seats === FALLBACK_SEATS ? "Sample seat map (live data unavailable in sandbox)" : "Live seat availability from TripJack"}
                      </p>
                    </div>
                    {selectedSeat && (
                      <Badge className="ml-auto bg-blue-100 text-blue-700 border-0">
                        Seat {selectedSeat.code}
                        {selectedSeat.amount > 0 && ` · +₹${selectedSeat.amount}`}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="px-5 pb-5">
                  {/* Legend */}
                  <div className="flex flex-wrap gap-3 mb-4 text-xs text-slate-500">
                    <div className="flex items-center gap-1.5"><div className="w-5 h-5 rounded bg-white border border-slate-300" />Available</div>
                    <div className="flex items-center gap-1.5"><div className="w-5 h-5 rounded bg-blue-500" />Selected</div>
                    <div className="flex items-center gap-1.5"><div className="w-5 h-5 rounded bg-slate-200 border border-slate-300" />Taken</div>
                  </div>

                  <div className="overflow-x-auto">
                    {/* Column headers */}
                    {Object.values(seatRows)[0] && (
                      <div className="flex gap-1 justify-center mb-2">
                        {Object.values(seatRows)[0].map((s) => (
                          <div key={s.seatNo} className={cn("w-9 text-center text-[10px] font-bold text-slate-400", s.seatNo === "D" && "ml-3")}>
                            {s.seatNo}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Seat rows */}
                    <div className="space-y-1.5">
                      {Object.entries(seatRows).map(([rowNum, rowSeats]) => (
                        <div key={rowNum} className="flex gap-1 items-center justify-center">
                          <span className="text-[10px] text-slate-400 w-4 text-right mr-1">{rowNum}</span>
                          {rowSeats.map((s) => {
                            const isSelected = selectedSeat?.code === s.code;
                            return (
                              <button
                                key={s.code}
                                disabled={!s.isAvailable}
                                onClick={() => setSelectedSeat(isSelected ? null : s)}
                                title={`${s.code}${s.seatType ? ` · ${s.seatType}` : ""}${s.amount > 0 ? ` · ₹${s.amount}` : " · Free"}`}
                                className={cn(
                                  "w-9 h-9 rounded text-[9px] font-bold border transition-all",
                                  s.seatNo === "D" && "ml-3",
                                  !s.isAvailable
                                    ? "bg-slate-200 border-slate-300 text-slate-400 cursor-not-allowed"
                                    : isSelected
                                    ? "bg-blue-500 border-blue-600 text-white shadow-md scale-105"
                                    : "bg-white border-slate-300 text-slate-600 hover:bg-blue-50 hover:border-blue-400 cursor-pointer"
                                )}
                              >
                                {s.code}
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                    <p className="mt-3 text-center text-[11px] text-muted-foreground">✈ Front of aircraft</p>
                  </div>
                </CardContent>
              </Card>

              {/* ── Baggage Selection ─────────────────────────────────── */}
              <Card className="shadow-sm border">
                <CardHeader className="pb-3 pt-5 px-5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center shrink-0">
                      <Luggage className="w-4 h-4" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Baggage Add-ons</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">Cabin bag (7 kg) included free</p>
                    </div>
                    {selectedBaggage && selectedBaggage.amount > 0 && (
                      <Badge className="ml-auto bg-orange-100 text-orange-700 border-0">
                        {selectedBaggage.weight}kg · +₹{selectedBaggage.amount}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="px-5 pb-5">
                  <div className="grid grid-cols-2 gap-3">
                    {baggageOptions.map((b) => {
                      const isSelected = selectedBaggage?.code === b.code;
                      return (
                        <button
                          key={b.code}
                          onClick={() => setSelectedBaggage(isSelected ? null : b)}
                          className={cn(
                            "flex flex-col items-start p-3 rounded-xl border-2 text-left transition-all",
                            isSelected
                              ? "border-orange-500 bg-orange-50"
                              : "border-slate-200 bg-white hover:border-orange-300 hover:bg-orange-50/50"
                          )}
                        >
                          <div className="flex items-center justify-between w-full mb-1">
                            <span className={cn("text-sm font-bold", isSelected ? "text-orange-700" : "text-slate-700")}>
                              {b.weight === 0 ? "None" : `${b.weight} kg`}
                            </span>
                            <span className={cn(
                              "text-xs font-semibold px-2 py-0.5 rounded-full",
                              isSelected ? "bg-orange-500 text-white" : "bg-slate-100 text-slate-500"
                            )}>
                              {b.amount === 0 ? "Free" : `+₹${b.amount.toLocaleString("en-IN")}`}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground">{b.desc}</span>
                          {isSelected && <CheckCircle2 className="w-4 h-4 text-orange-500 mt-1.5" />}
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* ── Passenger Details ─────────────────────────────────── */}
              {passengers.map((pax, i) => (
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
                          <p className="text-xs text-muted-foreground mt-0.5">Confirmation sent to this email</p>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="px-5 pb-5 space-y-4">
                    {/* Title + Name row */}
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-sm font-semibold text-slate-700 block mb-1.5">Title</label>
                        <Select value={pax.ti} onValueChange={(v) => updatePassenger(i, "ti", v)}>
                          <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {["MR","MS","MRS","MSTR","MISS"].map((t) => (
                              <SelectItem key={t} value={t}>{t}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <label className="text-sm font-semibold text-slate-700 block mb-1.5">First Name <span className="text-red-500">*</span></label>
                        <Input
                          placeholder="As on ID"
                          value={pax.fn}
                          onChange={(e) => updatePassenger(i, "fn", e.target.value)}
                          className="h-11 uppercase"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-semibold text-slate-700 block mb-1.5">Last Name <span className="text-red-500">*</span></label>
                        <Input
                          placeholder="As on ID"
                          value={pax.ln}
                          onChange={(e) => updatePassenger(i, "ln", e.target.value)}
                          className="h-11 uppercase"
                        />
                      </div>
                    </div>

                    {/* DOB */}
                    <div>
                      <label className="text-sm font-semibold text-slate-700 block mb-1.5">Date of Birth <span className="text-red-500">*</span></label>
                      <Input
                        type="date"
                        value={pax.dob}
                        max={new Date().toISOString().slice(0, 10)}
                        onChange={(e) => updatePassenger(i, "dob", e.target.value)}
                        className="h-11"
                      />
                    </div>

                    {/* Email + Phone */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-semibold text-slate-700 block mb-1.5">Email <span className="text-red-500">*</span></label>
                        <Input
                          type="email" placeholder="email@example.com"
                          value={pax.email}
                          onChange={(e) => updatePassenger(i, "email", e.target.value)}
                          className="h-11"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-semibold text-slate-700 block mb-1.5">Phone <span className="text-red-500">*</span></label>
                        <Input
                          type="tel" placeholder="10-digit number"
                          value={pax.phone}
                          onChange={(e) => updatePassenger(i, "phone", e.target.value)}
                          className="h-11"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Right column: price summary + Book Now */}
            <div className="lg:w-80 shrink-0">
              <div className="sticky top-24 space-y-4">

                {/* Flight card */}
                <Card className="shadow-sm">
                  <CardHeader className="pb-2 pt-5 px-5">
                    <CardTitle className="text-base">Flight Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="px-5 pb-5 space-y-3">
                    <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl">
                      <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-xs shrink-0">
                        {airline.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-bold text-sm text-slate-900">{airline}</p>
                        <p className="text-xs text-muted-foreground">{flightNum}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <div className="text-center">
                        <p className="text-xl font-extrabold text-slate-900">{departure}</p>
                        <p className="text-xs font-semibold text-slate-500">{from}</p>
                      </div>
                      <div className="flex flex-col items-center">
                        <p className="text-[10px] text-muted-foreground">{duration}</p>
                        <Plane className="w-4 h-4 text-blue-500" />
                      </div>
                      <div className="text-center">
                        <p className="text-xl font-extrabold text-slate-900">{arrival}</p>
                        <p className="text-xs font-semibold text-slate-500">{to}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Price breakdown */}
                <Card className="shadow-sm">
                  <CardHeader className="pb-2 pt-5 px-5">
                    <CardTitle className="text-base">Price Breakdown</CardTitle>
                  </CardHeader>
                  <CardContent className="px-5 pb-5 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Base fare × {travelers}</span>
                      <span className="font-semibold">₹{(quotedPrice * travelers).toLocaleString("en-IN")}</span>
                    </div>
                    {selectedSeat && selectedSeat.amount > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Seat {selectedSeat.code}</span>
                        <span className="font-semibold">+₹{selectedSeat.amount.toLocaleString("en-IN")}</span>
                      </div>
                    )}
                    {selectedBaggage && selectedBaggage.amount > 0 && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Baggage {selectedBaggage.weight}kg</span>
                        <span className="font-semibold">+₹{selectedBaggage.amount.toLocaleString("en-IN")}</span>
                      </div>
                    )}
                    <div className="flex justify-between pt-2 border-t font-bold text-base">
                      <span>Total</span>
                      <span className="text-blue-600">
                        ₹{(
                          quotedPrice * travelers +
                          (selectedSeat?.amount || 0) +
                          (selectedBaggage?.amount || 0)
                        ).toLocaleString("en-IN")}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">Taxes & fees included</p>
                  </CardContent>
                </Card>

                {/* Book button */}
                <Button
                  onClick={handleBook}
                  disabled={isBooking}
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold h-12 text-base"
                  size="lg"
                >
                  {isBooking ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Booking…</>
                  ) : (
                    "Confirm & Book"
                  )}
                </Button>

                <p className="text-xs text-center text-muted-foreground">
                  Booking placed directly via TripJack TEST API
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
