import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { loadBookingSession, saveBookingSession } from "@/lib/booking-session";
import type { FlightBookingSession } from "@/lib/booking-session";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Plane, ArrowLeft, CheckCircle2, ChevronRight,
  Armchair, Luggage, Loader2, ShieldCheck, ShieldAlert, UtensilsCrossed,
} from "lucide-react";
import { cn } from "@/lib/utils";

type SeatInfo    = { code: string; available: boolean; amount: number; seatType?: string; rowNo?: number };
type BaggageInfo = { code: string; desc: string; amount: number; kg: number };
type MealOption  = { code: string; desc: string; amount: number };

type TfrPolicy = {
  amount?: number;
  additionalFee?: number;
  policyInfo?: string;
  st?: string;
  et?: string;
};
type TfrRules = {
  CANCELLATION?: TfrPolicy[];
  DATECHANGE?:   TfrPolicy[];
  NO_SHOW?:      TfrPolicy[];
  SEAT_CHARGEABLE?: TfrPolicy[];
};
type TjConditions = {
  iss?:    boolean;
  isBA?:   boolean;
  addOns?: { isbpa?: boolean };
  ifmm?:   boolean;
};

function fmtHrs(h: number): string {
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  const r = h % 24;
  return r === 0 ? `${d} day${d > 1 ? "s" : ""}` : `${d}d ${r}h`;
}
function formatHourWindow(st?: string, et?: string): string {
  const s = parseInt(st ?? "0");
  const e = parseInt(et ?? "8760");
  if (isNaN(s) || isNaN(e)) return "";
  if (s === 0 && e <= 4)    return "Within 4 hours of departure";
  if (e >= 8760 && s > 0)   return `More than ${fmtHrs(s)} before departure`;
  if (e >= 8760 && s === 0) return "Any time";
  return `${fmtHrs(s)}–${fmtHrs(e)} before departure`;
}

function parseSsrData(raw: string | null): { seats: SeatInfo[] | null; baggage: BaggageInfo[] | null } {
  if (!raw) return { seats: null, baggage: null };
  try {
    const data = JSON.parse(raw);
    const seatInfos: SeatInfo[] | null =
      data?.data?.seatList?.[0]?.tripSeatList?.[0]?.seatInfos ?? null;
    const rawBaggage = data?.data?.baggageList?.[0]?.tripBaggageList?.[0]?.baggageInfos;
    const baggageInfos: BaggageInfo[] | null = rawBaggage
      ? rawBaggage.map((b: any) => ({
          code:   b.code  ?? "UNKNOWN",
          desc:   b.desc  ?? b.code ?? "Baggage",
          amount: b.amount ?? 0,
          kg:     parseInt(b.desc ?? "0") || 0,
        }))
      : null;
    return { seats: seatInfos, baggage: baggageInfos };
  } catch {
    return { seats: null, baggage: null };
  }
}

function parseFareQuoteData(raw: string | null): {
  meals: MealOption[];
  fareQuoteBaggage: BaggageInfo[];
  tfrRules: TfrRules | null;
  conditions: TjConditions | null;
  refundable: boolean | null;
} {
  const empty = { meals: [], fareQuoteBaggage: [], tfrRules: null, conditions: null, refundable: null };
  if (!raw) return empty;
  try {
    const fq = JSON.parse(raw);

    // ssrInfo lives on the first segment of the first tripInfo
    const seg = fq?.tripInfos?.[0]?.sI?.[0] ?? fq?.data?.tripInfos?.[0]?.sI?.[0] ?? {};
    const ssrInfo = seg?.ssrInfo ?? {};

    const meals: MealOption[] = (ssrInfo.MEAL ?? []).map((m: any) => ({
      code:   String(m.code ?? ""),
      desc:   String(m.desc ?? m.code ?? "Meal"),
      amount: Number(m.amount ?? 0),
    })).filter((m: MealOption) => m.code);

    const rawBag = ssrInfo.BAGGAGE ?? [];
    const fareQuoteBaggage: BaggageInfo[] = rawBag.map((b: any) => {
      const desc   = String(b.desc ?? b.code ?? "");
      const kgStr  = desc.match(/(\d+)\s*[Kk][Gg]/)?.[1] ?? "";
      const kg     = kgStr ? parseInt(kgStr) : 0;
      return {
        code:   String(b.code ?? ""),
        desc:   desc || `Extra ${kg > 0 ? kg + " kg" : "Baggage"}`,
        amount: Number(b.amount ?? 0),
        kg,
      };
    }).filter((b: BaggageInfo) => b.code);

    // fareRuleInformation.tfr lives on the first totalPriceList entry
    const tpl  = fq?.tripInfos?.[0]?.totalPriceList?.[0]
              ?? fq?.data?.tripInfos?.[0]?.totalPriceList?.[0];
    const tfr  = tpl?.fareRuleInformation?.tfr ?? null;

    // conditions at top level
    const conditions: TjConditions | null = fq?.conditions ?? fq?.data?.conditions ?? null;

    // Refundability from fd.ADULT.rT
    const rTRaw = tpl?.fd?.ADULT?.rT;
    const rTNum = typeof rTRaw === "number" ? rTRaw : null;
    const nRF   = tpl?.fd?.ADULT?.nRF === true;
    const refundable: boolean | null =
      rTNum === 1 || rTNum === 2 ? true :
      rTNum === 0 ? false :
      nRF ? false :
      null;

    return { meals, fareQuoteBaggage, tfrRules: tfr, conditions, refundable };
  } catch {
    return empty;
  }
}

export default function FlightAddons() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [session,       setSession]       = useState<FlightBookingSession | null>(null);
  const [seats,         setSeats]         = useState<SeatInfo[]>([]);
  const [baggage,       setBaggage]       = useState<BaggageInfo[]>([]);
  const [meals,         setMeals]         = useState<MealOption[]>([]);
  const [tfrRules,      setTfrRules]      = useState<TfrRules | null>(null);
  const [tjConditions,  setTjConditions]  = useState<TjConditions | null>(null);
  const [fareRefundable, setFareRefundable] = useState<boolean | null>(null);

  const [selectedSeats,   setSelectedSeats]   = useState<string[]>([]);
  const [selectedBaggage, setSelectedBaggage] = useState<BaggageInfo | null>(null);
  const [selectedMeal,    setSelectedMeal]    = useState<MealOption | null>(null);

  useEffect(() => {
    const s = loadBookingSession();
    if (!s || s.type !== "flight") {
      setLocation("/");
      return;
    }
    setSession(s as FlightBookingSession);

    // Parse fareQuote cache (primary source for meals, baggage, tfr rules, conditions)
    const fqData = parseFareQuoteData(sessionStorage.getItem("ww_tj_farequote"));
    setMeals(fqData.meals);
    setTfrRules(fqData.tfrRules);
    setTjConditions(fqData.conditions);
    if (fqData.refundable !== null) setFareRefundable(fqData.refundable);

    // Parse SSR API data (seat map + baggage fallback)
    const { seats: parsedSeats, baggage: parsedBaggage } = parseSsrData(
      sessionStorage.getItem("ww_ssr_data")
    );

    if (parsedSeats && parsedSeats.length > 0) {
      setSeats(parsedSeats);
    }

    // Baggage: prefer ssrInfo.BAGGAGE from fareQuote; fallback to SSR API baggage
    const baggageSource =
      fqData.fareQuoteBaggage.length > 0 ? fqData.fareQuoteBaggage :
      parsedBaggage && parsedBaggage.length > 0 ? parsedBaggage :
      [];
    setBaggage(baggageSource);
  }, []);

  if (!session) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      </Layout>
    );
  }

  const travelers = session.travelers;

  // conditions flags
  const seatSelectionAvailable = tjConditions?.iss !== false;  // default true if unknown
  const baggageAvailable       = meals.length > 0 || baggage.length > 0 || tjConditions?.isBA !== false;

  function toggleSeat(seat: SeatInfo) {
    if (!seat.available) return;
    setSelectedSeats((prev) => {
      if (prev.includes(seat.code)) return prev.filter((s) => s !== seat.code);
      if (prev.length >= travelers) {
        toast({ title: `Max ${travelers} seat${travelers > 1 ? "s" : ""}`, description: "Remove a seat first.", variant: "destructive" });
        return prev;
      }
      return [...prev, seat.code];
    });
  }

  const seatAddOn    = selectedSeats.reduce((sum, code) => {
    const s = seats.find((x) => x.code === code);
    return sum + (s?.amount ?? 0);
  }, 0);
  const baggageAddOn    = selectedBaggage?.amount ?? 0;
  const mealAddOn       = (selectedMeal?.amount ?? 0) * travelers;
  const totalWithAddons = session.totalBase + seatAddOn + baggageAddOn + mealAddOn;

  function handleConfirm() {
    if (!session) return;

    // Build fare rules from tfr (rich version) + legacy refundable flag
    const existingRules = session.fareRules ?? {};
    const updatedFareRules: FlightBookingSession["fareRules"] = {
      ...existingRules,
      refundable: fareRefundable ?? existingRules.refundable ?? true,
      ...(tfrRules ? { tfr: tfrRules } : {}),
    };

    const updated: FlightBookingSession = {
      ...session,
      selectedSeats,
      extraBaggageKg:    selectedBaggage?.kg     ?? 0,
      extraBaggageCost:  selectedBaggage?.amount  ?? 0,
      extraBaggageCode:  selectedBaggage?.code    ?? "",
      selectedMealCode:  selectedMeal?.code ?? "",
      selectedMealDesc:  selectedMeal?.desc ?? "",
      mealAddOnCost:     selectedMeal?.amount ?? 0,
      seatAddOnPrice:    seatAddOn,
      baggageAddOnPrice: baggageAddOn,
      mealAddOnPrice:    mealAddOn,
      totalBase:         totalWithAddons,
      fareRules:         updatedFareRules,
    };
    saveBookingSession(updated);
    setLocation("/booking/flight-review");
  }

  const rows: Record<number, SeatInfo[]> = {};
  for (const seat of seats) {
    const rowNo = (seat.rowNo ?? parseInt(seat.code)) || 0;
    if (!rows[rowNo]) rows[rowNo] = [];
    rows[rowNo].push(seat);
  }
  const sortedRows = Object.entries(rows)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, s]) => s);

  // Build policy rows for a TFR policy array
  function TfrPolicyRows({ policies, colorClass }: { policies: TfrPolicy[]; colorClass: string }) {
    return (
      <div className="mt-2 space-y-2">
        {policies.map((p, i) => {
          const window = formatHourWindow(p.st, p.et);
          const totalFee = (p.amount ?? 0) + (p.additionalFee ?? 0);
          return (
            <div key={i} className={cn("rounded-lg p-3 text-xs", colorClass)}>
              {window && <p className="font-semibold mb-0.5">{window}</p>}
              {totalFee > 0 && (
                <p>
                  Fee: ₹{(p.amount ?? 0).toLocaleString("en-IN")}
                  {(p.additionalFee ?? 0) > 0 && ` + ₹${p.additionalFee!.toLocaleString("en-IN")} airline surcharge`}
                </p>
              )}
              {totalFee === 0 && p.amount === 0 && <p>No charge</p>}
              {p.policyInfo && <p className="mt-0.5 text-slate-500">{p.policyInfo}</p>}
            </div>
          );
        })}
      </div>
    );
  }

  const isRefundable = fareRefundable ?? session.fareRules?.refundable ?? true;

  return (
    <Layout>
      <div className="bg-gradient-to-r from-blue-700 to-indigo-800 text-white">
        <div className="container mx-auto px-4 py-5">
          <button
            onClick={() => window.history.back()}
            className="flex items-center gap-1.5 text-blue-200 hover:text-white text-sm mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>

          <div className="flex items-center gap-2 text-sm mb-5">
            {["Flight", "Passengers", "Add-ons", "Review", "Payment"].map((step, i) => (
              <div key={step} className="flex items-center gap-2">
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2",
                  i === 2 ? "bg-white text-blue-700 border-white"
                  : i < 2 ? "bg-blue-500 border-blue-500 text-white"
                  : "border-blue-400 text-blue-400"
                )}>
                  {i < 2 ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
                </div>
                <span className={cn("hidden sm:inline", i === 2 ? "font-bold" : i < 2 ? "text-blue-200" : "text-blue-400")}>{step}</span>
                {i < 4 && <ChevronRight className="w-4 h-4 text-blue-400" />}
              </div>
            ))}
          </div>

          <h1 className="text-2xl font-extrabold">Add-ons</h1>
          <p className="text-blue-200 text-sm mt-0.5">Choose your meals, seats, and baggage</p>
        </div>
      </div>

      <div className="bg-slate-50 min-h-screen">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col lg:flex-row gap-6">

            <div className="flex-1 min-w-0 space-y-5">

              {/* Flight Summary */}
              <Card className="shadow-sm border overflow-hidden">
                <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-5 py-3 flex items-center gap-2">
                  <Plane className="w-4 h-4 text-white" />
                  <span className="text-white font-semibold text-sm">Flight Summary</span>
                </div>
                <CardContent className="p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm shrink-0">
                      <span className="text-white font-extrabold text-xs">{session.airline.substring(0,2).toUpperCase()}</span>
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">{session.airline}</p>
                      <p className="text-xs text-muted-foreground">{session.flightNum}</p>
                    </div>
                    <Badge className="ml-auto bg-slate-100 text-slate-600 border-0">{session.cabinLabel || "Economy"}</Badge>
                  </div>
                  <div className="flex items-center gap-4 p-3 bg-slate-50 rounded-xl">
                    <div>
                      <p className="text-xl font-extrabold text-slate-900">{session.departure}</p>
                      <p className="text-xs text-slate-500">{session.from}</p>
                    </div>
                    <div className="flex-1 flex flex-col items-center">
                      <p className="text-xs text-muted-foreground">{session.duration}</p>
                      <div className="w-full flex items-center gap-1 my-1">
                        <div className="flex-1 h-px bg-slate-300" />
                        <Plane className="w-3.5 h-3.5 text-blue-500" />
                        <div className="flex-1 h-px bg-slate-300" />
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-extrabold text-slate-900">{session.arrival}</p>
                      <p className="text-xs text-slate-500">{session.to}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* ── Fare Rules (from fareRuleInformation.tfr) ── */}
              <Card className="shadow-sm border">
                <CardHeader className="pb-3 pt-5 px-5">
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "w-9 h-9 rounded-full flex items-center justify-center shrink-0",
                      isRefundable ? "bg-green-100" : "bg-red-100"
                    )}>
                      {isRefundable
                        ? <ShieldCheck className="w-4 h-4 text-green-600" />
                        : <ShieldAlert className="w-4 h-4 text-red-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base">
                        {isRefundable ? "Refundable Fare" : "Non-refundable Fare"}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">Airline cancellation &amp; change policy</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="px-5 pb-5 space-y-4">
                  {tfrRules ? (
                    <>
                      {tfrRules.CANCELLATION && tfrRules.CANCELLATION.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Cancellation</p>
                          <TfrPolicyRows policies={tfrRules.CANCELLATION} colorClass="bg-red-50 text-red-800" />
                        </div>
                      )}
                      {tfrRules.DATECHANGE && tfrRules.DATECHANGE.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide mt-3">Date Change</p>
                          <TfrPolicyRows policies={tfrRules.DATECHANGE} colorClass="bg-amber-50 text-amber-800" />
                        </div>
                      )}
                      {tfrRules.NO_SHOW && tfrRules.NO_SHOW.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide mt-3">No Show</p>
                          <TfrPolicyRows policies={tfrRules.NO_SHOW} colorClass="bg-slate-100 text-slate-700" />
                        </div>
                      )}
                      {tfrRules.SEAT_CHARGEABLE && tfrRules.SEAT_CHARGEABLE.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide mt-3">Seat Charges</p>
                          <TfrPolicyRows policies={tfrRules.SEAT_CHARGEABLE} colorClass="bg-blue-50 text-blue-800" />
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {isRefundable
                        ? "Cancellation charges may apply as per airline policy."
                        : "This fare cannot be cancelled or refunded."}
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* ── Meal Preference (from ssrInfo.MEAL) ── */}
              {meals.length > 0 && (
                <Card className="shadow-sm border">
                  <CardHeader className="pb-3 pt-5 px-5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
                        <UtensilsCrossed className="w-4 h-4" />
                      </div>
                      <div>
                        <CardTitle className="text-base">Meal Preference</CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Optional · {meals.some(m => m.amount === 0) ? "free options available" : "charged per person"}
                        </p>
                      </div>
                      {selectedMeal && (
                        <Badge className="ml-auto bg-emerald-100 text-emerald-700 border-0 text-xs max-w-[140px] truncate">
                          {selectedMeal.desc}
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="px-5 pb-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {/* No meal option */}
                      <button
                        onClick={() => setSelectedMeal(null)}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-xl border-2 text-left transition-all",
                          selectedMeal === null
                            ? "border-emerald-500 bg-emerald-50"
                            : "border-slate-200 bg-white hover:border-emerald-300"
                        )}
                      >
                        <span className={cn("text-sm font-medium", selectedMeal === null ? "text-emerald-700" : "text-slate-600")}>
                          No Meal
                        </span>
                        <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Skip</span>
                        {selectedMeal === null && <CheckCircle2 className="w-4 h-4 text-emerald-500 ml-1" />}
                      </button>

                      {meals.map((m) => {
                        const selected = selectedMeal?.code === m.code;
                        return (
                          <button
                            key={m.code}
                            onClick={() => setSelectedMeal(m)}
                            className={cn(
                              "flex items-center justify-between p-3 rounded-xl border-2 text-left transition-all",
                              selected
                                ? "border-emerald-500 bg-emerald-50"
                                : "border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/50"
                            )}
                          >
                            <span className={cn("text-sm font-medium flex-1 mr-2", selected ? "text-emerald-700" : "text-slate-700")}>
                              {m.desc}
                            </span>
                            <span className={cn(
                              "text-xs font-semibold px-2 py-0.5 rounded-full shrink-0",
                              selected ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-500"
                            )}>
                              {m.amount === 0 ? "Free" : `+₹${m.amount.toLocaleString("en-IN")}`}
                            </span>
                            {selected && <CheckCircle2 className="w-4 h-4 text-emerald-500 ml-1 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                    {selectedMeal && selectedMeal.amount > 0 && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Meal charged per person · {travelers} passenger{travelers > 1 ? "s" : ""} = +₹{mealAddOn.toLocaleString("en-IN")}
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* ── Seat Selection ── */}
              {seatSelectionAvailable ? (
                <Card className="shadow-sm border">
                  <CardHeader className="pb-3 pt-5 px-5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0">
                        <Armchair className="w-4 h-4" />
                      </div>
                      <div>
                        <CardTitle className="text-base">Seat Selection</CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {seats.length > 0
                            ? `Select up to ${travelers} seat${travelers > 1 ? "s" : ""} · optional`
                            : "Seat map loading…"}
                        </p>
                      </div>
                      {selectedSeats.length > 0 && (
                        <Badge className="ml-auto bg-blue-100 text-blue-700 border-0">
                          {selectedSeats.join(", ")}
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="px-5 pb-5">
                    {seats.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
                        <Armchair className="w-10 h-10 text-slate-300" />
                        <p className="text-sm font-semibold text-slate-500">Seat map not available</p>
                        <p className="text-xs text-muted-foreground max-w-xs">
                          You will be assigned a seat at check-in.
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center flex-wrap gap-3 mb-4 text-xs text-slate-500">
                          <div className="flex items-center gap-1.5"><div className="w-5 h-5 rounded bg-slate-100 border border-slate-300" />Available</div>
                          <div className="flex items-center gap-1.5"><div className="w-5 h-5 rounded bg-blue-500" />Selected</div>
                          <div className="flex items-center gap-1.5"><div className="w-5 h-5 rounded bg-slate-300" />Taken</div>
                        </div>
                        <div className="overflow-x-auto">
                          {sortedRows.map((rowSeats, ri) => (
                            <div key={ri} className="flex gap-1 items-center justify-center mb-1.5">
                              <span className="text-[10px] text-slate-400 w-4 text-right mr-1">{ri + 1}</span>
                              {rowSeats.map((seat, ci) => {
                                const selected = selectedSeats.includes(seat.code);
                                return (
                                  <button
                                    key={seat.code}
                                    onClick={() => toggleSeat(seat)}
                                    disabled={!seat.available}
                                    title={seat.amount > 0 ? `${seat.code} (+₹${seat.amount})` : seat.code}
                                    className={cn(
                                      "w-9 h-9 rounded text-[10px] font-bold border transition-all",
                                      ci === 2 && "mr-3",
                                      !seat.available
                                        ? "bg-slate-200 border-slate-300 text-slate-400 cursor-not-allowed"
                                        : selected
                                        ? "bg-blue-500 border-blue-600 text-white shadow-md scale-105"
                                        : "bg-white border-slate-300 text-slate-600 hover:bg-blue-50 hover:border-blue-400 cursor-pointer"
                                    )}
                                  >
                                    {seat.code}
                                  </button>
                                );
                              })}
                            </div>
                          ))}
                          <p className="mt-3 text-center text-[11px] text-muted-foreground">✈ Front of aircraft</p>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <Card className="shadow-sm border">
                  <CardHeader className="pb-3 pt-5 px-5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-300 text-white flex items-center justify-center shrink-0">
                        <Armchair className="w-4 h-4" />
                      </div>
                      <div>
                        <CardTitle className="text-base text-slate-500">Seat Selection</CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">Not available for this fare</p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="px-5 pb-5">
                    <p className="text-xs text-muted-foreground">
                      Seat selection is not available for this flight or fare class. A seat will be assigned automatically at check-in.
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* ── Extra Baggage (from ssrInfo.BAGGAGE) ── */}
              {(baggage.length > 0 || tjConditions?.isBA === true) && (
                <Card className="shadow-sm border">
                  <CardHeader className="pb-3 pt-5 px-5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center shrink-0">
                        <Luggage className="w-4 h-4" />
                      </div>
                      <div>
                        <CardTitle className="text-base">Extra Baggage</CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {baggage.length > 0 ? "Pre-purchase extra check-in baggage · optional" : "Baggage options from airline"}
                        </p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="px-5 pb-5">
                    {baggage.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
                        <Luggage className="w-10 h-10 text-slate-300" />
                        <p className="text-sm font-semibold text-slate-500">No extra baggage options available</p>
                        <p className="text-xs text-muted-foreground max-w-xs">
                          This airline does not offer pre-paid baggage add-ons for this route.
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        {baggage.map((b) => {
                          const selected = selectedBaggage?.code === b.code;
                          return (
                            <button
                              key={b.code}
                              onClick={() => setSelectedBaggage(b)}
                              className={cn(
                                "flex flex-col items-start p-3 rounded-xl border-2 text-left transition-all",
                                selected
                                  ? "border-orange-500 bg-orange-50"
                                  : "border-slate-200 bg-white hover:border-orange-300 hover:bg-orange-50/50"
                              )}
                            >
                              <div className="flex items-center justify-between w-full mb-1">
                                <span className={cn("text-sm font-bold", selected ? "text-orange-700" : "text-slate-700")}>
                                  {b.kg === 0 ? (b.desc || "Extra") : `${b.kg} kg`}
                                </span>
                                <span className={cn(
                                  "text-xs font-semibold px-2 py-0.5 rounded-full",
                                  selected ? "bg-orange-500 text-white" : "bg-slate-100 text-slate-500"
                                )}>
                                  {b.amount === 0 ? "Free" : `+₹${b.amount.toLocaleString("en-IN")}`}
                                </span>
                              </div>
                              <span className="text-xs text-muted-foreground">{b.desc}</span>
                              {selected && <CheckCircle2 className="w-4 h-4 text-orange-500 mt-1.5" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

            </div>

            {/* ── Right: Price Summary + Confirm ── */}
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
                        <span className="text-3xl font-extrabold text-blue-800 tabular-nums">
                          {session.baseFare.toLocaleString("en-IN")}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2.5">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Breakdown</p>
                      <div className="flex justify-between text-sm text-slate-600">
                        <span>Base Fare × {travelers}</span>
                        <span className="font-medium">₹{(session.baseFare * travelers).toLocaleString("en-IN")}</span>
                      </div>
                      {session.convFee > 0 && (
                        <div className="flex justify-between text-sm text-slate-600">
                          <span>Convenience Fee × {travelers}</span>
                          <span className="font-medium">+₹{(session.convFee * travelers).toLocaleString("en-IN")}</span>
                        </div>
                      )}
                      {seatAddOn > 0 && (
                        <div className="flex justify-between text-sm text-slate-600">
                          <span>Seat add-on</span>
                          <span className="font-medium">+₹{seatAddOn.toLocaleString("en-IN")}</span>
                        </div>
                      )}
                      {mealAddOn > 0 && (
                        <div className="flex justify-between text-sm text-slate-600">
                          <span>Meal ({selectedMeal?.desc ?? ""})</span>
                          <span className="font-medium">+₹{mealAddOn.toLocaleString("en-IN")}</span>
                        </div>
                      )}
                      {baggageAddOn > 0 && (
                        <div className="flex justify-between text-sm text-slate-600">
                          <span>Extra baggage ({selectedBaggage?.kg ?? 0}kg)</span>
                          <span className="font-medium">+₹{baggageAddOn.toLocaleString("en-IN")}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-extrabold text-lg pt-3 border-t border-dashed text-slate-900">
                        <span>Total</span>
                        <span className="text-blue-700">₹{totalWithAddons.toLocaleString("en-IN")}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">Coupons & credits applied on payment</p>
                    </div>

                    <Button
                      size="lg"
                      onClick={handleConfirm}
                      className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold h-12 text-base gap-2 shadow-md mt-2"
                    >
                      Review & Confirm <ChevronRight className="w-4 h-4" />
                    </Button>

                    <div className="space-y-1.5 pt-2 border-t">
                      {["Seats & meals confirmed", "Instant e-ticket on payment", "24/7 customer support"].map((t) => (
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
    </Layout>
  );
}
