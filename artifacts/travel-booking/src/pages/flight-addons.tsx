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
  Armchair, Luggage, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const FALLBACK_ROWS = 6;
const FALLBACK_COLS = ["A", "B", "C", "D", "E", "F"];
const FALLBACK_TAKEN = new Set(["1A","1B","2C","2F","3D","4A","4E","5B","5F","6C"]);

const FALLBACK_BAGGAGE = [
  { code: "NONE",  desc: "No extra baggage",  amount: 0,    kg: 0  },
  { code: "BG15",  desc: "+15 kg baggage",    amount: 799,  kg: 15 },
  { code: "BG20",  desc: "+20 kg baggage",    amount: 1099, kg: 20 },
  { code: "BG30",  desc: "+30 kg baggage",    amount: 1499, kg: 30 },
];

type SeatInfo   = { code: string; available: boolean; amount: number; seatType?: string; rowNo?: number };
type BaggageInfo = { code: string; desc: string; amount: number; kg: number };

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

export default function FlightAddons() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [session, setSession] = useState<FlightBookingSession | null>(null);
  const [seats,   setSeats]   = useState<SeatInfo[]>([]);
  const [baggage, setBaggage] = useState<BaggageInfo[]>([]);

  const [selectedSeats,   setSelectedSeats]   = useState<string[]>([]);
  const [selectedBaggage, setSelectedBaggage] = useState<BaggageInfo>(FALLBACK_BAGGAGE[0]);

  useEffect(() => {
    const s = loadBookingSession();
    if (!s || s.type !== "flight") {
      setLocation("/");
      return;
    }
    setSession(s as FlightBookingSession);

    const { seats: parsedSeats, baggage: parsedBaggage } = parseSsrData(
      sessionStorage.getItem("ww_ssr_data")
    );

    if (parsedSeats && parsedSeats.length > 0) {
      setSeats(parsedSeats);
    } else {
      const fallback: SeatInfo[] = [];
      for (let r = 1; r <= FALLBACK_ROWS; r++) {
        for (const c of FALLBACK_COLS) {
          const code = `${r}${c}`;
          fallback.push({ code, available: !FALLBACK_TAKEN.has(code), amount: 0 });
        }
      }
      setSeats(fallback);
    }

    if (parsedBaggage && parsedBaggage.length > 0) {
      setBaggage(parsedBaggage);
      setSelectedBaggage({ ...parsedBaggage[0] });
    } else {
      setBaggage(FALLBACK_BAGGAGE);
      setSelectedBaggage(FALLBACK_BAGGAGE[0]);
    }
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

  const seatAddOn   = selectedSeats.reduce((sum, code) => {
    const s = seats.find((x) => x.code === code);
    return sum + (s?.amount ?? 0);
  }, 0);
  const baggageAddOn = selectedBaggage.amount;
  const totalWithAddons = session.totalBase + seatAddOn + baggageAddOn;

  function handleConfirm() {
    if (!session) return;
    const updated: FlightBookingSession = {
      ...session,
      selectedSeats,
      extraBaggageKg:   selectedBaggage.kg,
      extraBaggageCost: baggageAddOn,
      totalBase: totalWithAddons,
    };
    saveBookingSession(updated);
    setLocation("/booking/payment");
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
            {["Flight Selection", "Passenger Details", "Add-ons", "Payment"].map((step, i) => (
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
                {i < 3 && <ChevronRight className="w-4 h-4 text-blue-400" />}
              </div>
            ))}
          </div>

          <h1 className="text-2xl font-extrabold">Add-ons</h1>
          <p className="text-blue-200 text-sm mt-0.5">Choose your seats and baggage</p>
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
                    <Badge className="ml-auto bg-slate-100 text-slate-600 border-0">Economy</Badge>
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

              {/* Seat Selection */}
              <Card className="shadow-sm border">
                <CardHeader className="pb-3 pt-5 px-5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0">
                      <Armchair className="w-4 h-4" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Seat Selection</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Select up to {travelers} seat{travelers > 1 ? "s" : ""} · optional
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
                </CardContent>
              </Card>

              {/* Extra Baggage */}
              <Card className="shadow-sm border">
                <CardHeader className="pb-3 pt-5 px-5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center shrink-0">
                      <Luggage className="w-4 h-4" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Extra Baggage</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">Cabin bag (7kg) included free</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="px-5 pb-5">
                  <div className="grid grid-cols-2 gap-3">
                    {baggage.map((b) => {
                      const selected = selectedBaggage.code === b.code;
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
                              {b.kg === 0 ? "None" : `${b.kg}kg`}
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
                </CardContent>
              </Card>

            </div>

            {/* Right: Price Summary + Confirm */}
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
                      {baggageAddOn > 0 && (
                        <div className="flex justify-between text-sm text-slate-600">
                          <span>Extra baggage ({selectedBaggage.kg}kg)</span>
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
                      Continue to Payment <ChevronRight className="w-4 h-4" />
                    </Button>

                    <div className="space-y-1.5 pt-2 border-t">
                      {["Seats & baggage confirmed", "Instant e-ticket on payment", "24/7 customer support"].map((t) => (
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
