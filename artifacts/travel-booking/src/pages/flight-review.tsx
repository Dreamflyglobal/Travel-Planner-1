import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { loadBookingSession, saveBookingSession } from "@/lib/booking-session";
import type { FlightBookingSession } from "@/lib/booking-session";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Plane, ArrowLeft, CheckCircle2, ChevronRight,
  User, Armchair, Luggage, ShieldCheck, ShieldAlert, Loader2, Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";

function fmt(d: string) {
  if (!d) return "";
  try {
    return new Date(d + "T00:00:00").toLocaleDateString("en-IN", {
      weekday: "short", day: "2-digit", month: "short", year: "numeric",
    });
  } catch { return d; }
}

export default function FlightReview() {
  const [, setLocation] = useLocation();
  const [session, setSession] = useState<FlightBookingSession | null>(null);

  useEffect(() => {
    const s = loadBookingSession();
    if (!s || s.type !== "flight") {
      setLocation("/");
      return;
    }
    setSession(s as FlightBookingSession);
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

  const seatAddOn    = session.seatAddOnPrice    ?? 0;
  const baggageAddOn = session.baggageAddOnPrice ?? 0;
  const baseFareTotal = session.baseFare * session.travelers;
  const convFeeTotal  = session.convFee  * session.travelers;
  const grandTotal    = session.totalBase;

  function handleConfirmAndPay() {
    if (!session) return;

    const locked: FlightBookingSession = {
      ...session,
      lockedTotalPrice: grandTotal,
    };
    saveBookingSession(locked);

    console.info("[flight-review] Price locked and confirmed:", {
      grandTotal,
      baseFare:    session.baseFare,
      travelers:   session.travelers,
      seatAddOn,
      baggageAddOn,
      seats:       session.selectedSeats,
      baggageCode: session.extraBaggageCode,
      baggageKg:   session.extraBaggageKg,
    });

    setLocation("/booking/payment");
  }

  const STEPS = ["Flight", "Passengers", "Add-ons", "Review", "Payment"];
  const CURRENT = 3;

  return (
    <Layout>
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-700 to-indigo-800 text-white">
        <div className="container mx-auto px-4 py-5">
          <button
            onClick={() => window.history.back()}
            className="flex items-center gap-1.5 text-blue-200 hover:text-white text-sm mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Add-ons
          </button>

          {/* Step indicator */}
          <div className="flex items-center gap-2 text-sm mb-5 flex-wrap">
            {STEPS.map((step, i) => (
              <div key={step} className="flex items-center gap-2">
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2",
                  i === CURRENT ? "bg-white text-blue-700 border-white"
                  : i < CURRENT ? "bg-blue-500 border-blue-500 text-white"
                  : "border-blue-400 text-blue-400"
                )}>
                  {i < CURRENT ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
                </div>
                <span className={cn(
                  "hidden sm:inline",
                  i === CURRENT ? "font-bold"
                  : i < CURRENT ? "text-blue-200"
                  : "text-blue-400"
                )}>{step}</span>
                {i < STEPS.length - 1 && <ChevronRight className="w-4 h-4 text-blue-400" />}
              </div>
            ))}
          </div>

          <h1 className="text-2xl font-extrabold">Review Your Booking</h1>
          <p className="text-blue-200 text-sm mt-0.5">Confirm all details before payment</p>
        </div>
      </div>

      <div className="bg-slate-50 min-h-screen">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col lg:flex-row gap-6">

            {/* Left: Details */}
            <div className="flex-1 min-w-0 space-y-5">

              {/* Flight Details */}
              <Card className="shadow-sm border overflow-hidden">
                <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-5 py-3 flex items-center gap-2">
                  <Plane className="w-4 h-4 text-white" />
                  <span className="text-white font-semibold text-sm">Flight Details</span>
                </div>
                <CardContent className="p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm shrink-0">
                      <span className="text-white font-extrabold text-xs">{session.airline.substring(0, 2).toUpperCase()}</span>
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">{session.airline}</p>
                      <p className="text-xs text-muted-foreground">{session.flightNum}</p>
                    </div>
                    <Badge className="ml-auto bg-slate-100 text-slate-600 border-0">{session.cabinLabel || "Economy"}</Badge>
                  </div>

                  <div className="flex items-center gap-4 p-3 bg-slate-50 rounded-xl mb-3">
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

                  <p className="text-xs text-muted-foreground text-center">{fmt(session.date)}</p>
                </CardContent>
              </Card>

              {/* Passengers */}
              <Card className="shadow-sm border">
                <CardHeader className="pb-3 pt-5 px-5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0">
                      <User className="w-4 h-4" />
                    </div>
                    <CardTitle className="text-base">
                      Passengers ({session.travelers})
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="px-5 pb-5 space-y-3">
                  {session.passengers.map((p, idx) => (
                    <div key={idx} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border">
                      <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600 shrink-0">
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-900 text-sm truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{p.gender} · Age {p.age}</p>
                      </div>
                      {p.email && (
                        <p className="text-xs text-slate-400 hidden sm:block truncate max-w-[140px]">{p.email}</p>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Fare Rules */}
              {session.fareRules && (
                <Card className="shadow-sm border">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        "w-9 h-9 rounded-full flex items-center justify-center shrink-0",
                        session.fareRules.refundable === false ? "bg-red-100" : "bg-green-100"
                      )}>
                        {session.fareRules.refundable === false
                          ? <ShieldAlert className="w-4 h-4 text-red-600" />
                          : <ShieldCheck className="w-4 h-4 text-green-600" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800">
                          {session.fareRules.refundable ? "Refundable Fare" : "Non-refundable Fare"}
                        </p>
                        <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                          {typeof session.fareRules.cancellationCharge === "number" && (
                            <p>Cancellation charge: ₹{session.fareRules.cancellationCharge.toLocaleString("en-IN")} per passenger</p>
                          )}
                          {typeof session.fareRules.dateChangeCharge === "number" && (
                            <p>Date change charge: ₹{session.fareRules.dateChangeCharge.toLocaleString("en-IN")} per passenger</p>
                          )}
                          {session.fareRules.note && <p>{session.fareRules.note}</p>}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* SSR Selections */}
              <Card className="shadow-sm border">
                <CardHeader className="pb-3 pt-5 px-5">
                  <CardTitle className="text-base">Add-on Selections</CardTitle>
                </CardHeader>
                <CardContent className="px-5 pb-5 space-y-3">
                  {/* Seats */}
                  <div className="flex items-start gap-3 p-3 rounded-xl border bg-slate-50">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                      <Armchair className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-700">Seat Selection</p>
                      {session.selectedSeats.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {session.selectedSeats.map((s) => (
                            <Badge key={s} className="bg-blue-100 text-blue-700 border-0 text-xs">{s}</Badge>
                          ))}
                          {seatAddOn > 0 && (
                            <span className="text-xs text-slate-500 self-center">· +₹{seatAddOn.toLocaleString("en-IN")}</span>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-1">No seat selected — will be assigned at check-in</p>
                      )}
                    </div>
                  </div>

                  {/* Baggage */}
                  <div className="flex items-start gap-3 p-3 rounded-xl border bg-slate-50">
                    <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                      <Luggage className="w-4 h-4 text-orange-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-700">Extra Baggage</p>
                      {session.extraBaggageKg > 0 ? (
                        <p className="text-xs text-slate-600 mt-1">
                          {session.extraBaggageKg} kg extra
                          {baggageAddOn > 0 && ` · +₹${baggageAddOn.toLocaleString("en-IN")}`}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-1">No extra baggage added</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

            </div>

            {/* Right: Price + Confirm */}
            <div className="w-full lg:w-80 shrink-0">
              <div className="sticky top-4 space-y-4">

                {/* Price Breakdown */}
                <Card className="shadow-sm border">
                  <CardHeader className="pb-3 pt-5 px-5">
                    <CardTitle className="text-base flex items-center gap-2">
                      Final Price Breakdown
                      <Lock className="w-3.5 h-3.5 text-slate-400" />
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-5 pb-5 space-y-3">
                    {/* Total Hero */}
                    <div className="p-3 bg-blue-50 rounded-xl border border-blue-100 text-center">
                      <p className="text-xs text-blue-600 font-medium mb-1">Total Amount to Pay</p>
                      <div className="flex items-baseline gap-1 justify-center">
                        <span className="text-lg font-bold text-blue-800">₹</span>
                        <span className="text-4xl font-extrabold text-blue-800 tabular-nums">
                          {grandTotal.toLocaleString("en-IN")}
                        </span>
                      </div>
                      <p className="text-[10px] text-blue-400 mt-1">incl. all charges</p>
                    </div>

                    {/* Breakdown rows */}
                    <div className="space-y-2">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Breakdown</p>

                      <div className="flex justify-between text-sm text-slate-600">
                        <span>Base Fare × {session.travelers}</span>
                        <span className="font-medium">₹{baseFareTotal.toLocaleString("en-IN")}</span>
                      </div>

                      {convFeeTotal > 0 && (
                        <div className="flex justify-between text-sm text-slate-600">
                          <span>Conv. Fee × {session.travelers}</span>
                          <span className="font-medium">+₹{convFeeTotal.toLocaleString("en-IN")}</span>
                        </div>
                      )}

                      {seatAddOn > 0 && (
                        <div className="flex justify-between text-sm text-slate-600">
                          <span>Seat Charges</span>
                          <span className="font-medium">+₹{seatAddOn.toLocaleString("en-IN")}</span>
                        </div>
                      )}

                      {baggageAddOn > 0 && (
                        <div className="flex justify-between text-sm text-slate-600">
                          <span>Baggage Charges ({session.extraBaggageKg}kg)</span>
                          <span className="font-medium">+₹{baggageAddOn.toLocaleString("en-IN")}</span>
                        </div>
                      )}

                      <Separator className="my-2" />

                      <div className="flex justify-between font-extrabold text-base text-slate-900">
                        <span>Total</span>
                        <span className="text-blue-700">₹{grandTotal.toLocaleString("en-IN")}</span>
                      </div>

                      <p className="text-xs text-muted-foreground">Coupons & credits applied on payment page</p>
                    </div>

                    {/* Confirm Button */}
                    <Button
                      size="lg"
                      onClick={handleConfirmAndPay}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold h-12 text-base gap-2 shadow-md mt-2"
                    >
                      <Lock className="w-4 h-4" />
                      Confirm &amp; Pay ₹{grandTotal.toLocaleString("en-IN")}
                    </Button>

                    {/* Trust badges */}
                    <div className="space-y-1.5 pt-2 border-t">
                      {[
                        "Price locked — no hidden charges",
                        "Instant PNR on payment",
                        "Auto-refund if booking fails",
                      ].map((t) => (
                        <div key={t} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <ShieldCheck className="w-3.5 h-3.5 text-green-500 shrink-0" />
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
