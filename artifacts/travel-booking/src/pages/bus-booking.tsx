import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { getConvenienceFee, getHiddenMarkupAmount } from "@/lib/pricing";
import { saveBookingSession } from "@/lib/booking-session";
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
  Bus, ArrowLeft, CheckCircle2, ChevronRight,
  MapPin, Armchair, UserPlus,
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

export default function BusBooking() {
  const searchString = useSearch();
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, isAgent } = useAuth();
  const { toast } = useToast();

  const p = new URLSearchParams(searchString);
  const busId           = p.get("busId")          || "";
  const busName         = p.get("busName")         || "Bus";
  const operator        = p.get("operator")        || busName;
  const from            = p.get("from")            || "";
  const to              = p.get("to")              || "";
  const departure       = p.get("departure")       || "";
  const arrival         = p.get("arrival")         || "";
  const duration        = p.get("duration")        || "";
  const date            = p.get("date")            || "";
  const busType         = p.get("busType")         || "";
  const rawPrice        = parseInt(p.get("price")            || "0",  10);
  const markupFromUrl   = parseInt(p.get("markup")           || "-1", 10);
  const priceWithMarkup = parseInt(p.get("priceWithMarkup")  || "-1", 10);
  const normalMarkupUrl = parseInt(p.get("normalMarkup")     || "-1", 10);
  const agentSavingsUrl = parseInt(p.get("agentSavings")     || "0",  10);
  const seatsParam      = p.get("seats")           || "";
  const boardingPoint   = p.get("boardingPoint")   || "";
  const droppingPoint   = p.get("droppingPoint")   || "";

  const selectedSeats: string[] = seatsParam ? seatsParam.split(",").filter(Boolean) : [];
  const seatCount     = Math.max(1, selectedSeats.length);

  const hiddenMarkup = markupFromUrl >= 0 ? markupFromUrl : getHiddenMarkupAmount(rawPrice, "buses");
  const baseFare     = priceWithMarkup > 0 ? priceWithMarkup : rawPrice + hiddenMarkup;
  const convFee      = getConvenienceFee(rawPrice, "buses");
  const savings      = (isAgent && agentSavingsUrl > 0) ? agentSavingsUrl : 0;

  const [passengers, setPassengers] = useState<Passenger[]>(Array.from({ length: seatCount }, emptyPassenger));
  const [errors,     setErrors]     = useState<FieldErrors[]>(Array.from({ length: seatCount }, () => ({})));

  useEffect(() => {
    if (user && passengers[0].email === "") {
      setPassengers((prev) => {
        const next = [...prev];
        next[0] = { ...next[0], name: user.name || "", email: user.email || "" };
        return next;
      });
    }
  }, [user]);

  function updatePassenger(i: number, field: keyof Passenger, value: string) {
    setPassengers((prev) => { const next = [...prev]; next[i] = { ...next[i], [field]: value }; return next; });
    setErrors((prev)     => { const next = [...prev]; next[i] = { ...next[i], [field]: undefined }; return next; });
  }

  const totalBase = (baseFare + convFee) * seatCount;

  function handleContinue() {
    const validated = validatePassengers(passengers);
    if (validated.some((e) => Object.keys(e).length > 0)) {
      setErrors(validated);
      toast({ variant: "destructive", title: "Please fill all passenger details" });
      return;
    }

    saveBookingSession({
      type: "bus",
      busId, busName, operator,
      from, to, date, departure, arrival, duration, busType,
      selectedSeats, boardingPoint, droppingPoint,
      passengers, seatCount,
      rawPrice, hiddenMarkup, baseFare, convFee, totalBase,
      isAgent, agentSavings: agentSavingsUrl, normalMarkup: normalMarkupUrl >= 0 ? normalMarkupUrl : hiddenMarkup,
      agentId:    isAgent ? user?.id    : undefined,
      agentEmail: isAgent ? user?.email : undefined,
    });

    setLocation("/booking/payment");
  }

  return (
    <Layout>
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-600 to-pink-700 text-white">
        <div className="container mx-auto px-4 py-5">
          <button
            onClick={() => window.history.back()}
            className="flex items-center gap-1.5 text-orange-200 hover:text-white text-sm mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to seat selection
          </button>

          <div className="flex items-center gap-2 text-sm mb-5">
            {["Seat Selection", "Passenger Details", "Payment"].map((step, i) => (
              <div key={step} className="flex items-center gap-2">
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2",
                  i === 1 ? "bg-white text-orange-700 border-white"
                  : i < 1 ? "bg-orange-500 border-orange-500 text-white"
                  : "border-orange-400 text-orange-400"
                )}>
                  {i < 1 ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
                </div>
                <span className={cn("hidden sm:inline", i === 1 ? "font-bold" : "text-orange-300")}>{step}</span>
                {i < 2 && <ChevronRight className="w-4 h-4 text-orange-400" />}
              </div>
            ))}
          </div>

          <h1 className="text-2xl font-extrabold">Passenger Details</h1>
          <p className="text-orange-200 text-sm mt-0.5">Fill in details for all passengers, then continue to payment</p>
        </div>
      </div>

      <div className="bg-slate-50 min-h-screen">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col lg:flex-row gap-6">

            {/* Left column */}
            <div className="flex-1 min-w-0 space-y-5">

              {!isAuthenticated && (
                <Alert className="border-orange-200 bg-orange-50">
                  <UserPlus className="h-4 w-4 text-orange-600" />
                  <AlertDescription className="text-orange-800 text-sm">
                    <span className="font-semibold">No login needed!</span> An account will be created automatically after payment.
                  </AlertDescription>
                </Alert>
              )}

              {/* Journey Summary */}
              <Card className="shadow-sm border overflow-hidden">
                <div className="bg-gradient-to-r from-orange-700 to-pink-700 px-5 py-3 flex items-center gap-2">
                  <Bus className="w-4 h-4 text-white" />
                  <span className="text-white font-semibold text-sm">Journey Summary</span>
                </div>
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-pink-600 flex items-center justify-center shadow-sm shrink-0">
                      <Bus className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">{busName}</p>
                      <p className="text-xs text-muted-foreground">{operator} · {busType}</p>
                    </div>
                    <Badge className="ml-auto bg-slate-100 text-slate-600 border-0">{seatCount} Seat{seatCount>1?"s":""}</Badge>
                  </div>

                  <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl">
                    <div>
                      <p className="text-2xl font-extrabold text-slate-900">{departure}</p>
                      <p className="text-xs font-semibold text-slate-500 flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3" />{from}
                      </p>
                    </div>
                    <div className="flex-1 flex flex-col items-center">
                      <p className="text-xs text-muted-foreground font-medium mb-1">{duration}</p>
                      <div className="w-full flex items-center gap-1">
                        <div className="flex-1 h-px bg-slate-300" />
                        <Bus className="w-4 h-4 text-orange-400" />
                        <div className="flex-1 h-px bg-slate-300" />
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-extrabold text-slate-900">{arrival}</p>
                      <p className="text-xs font-semibold text-slate-500 flex items-center gap-1 mt-0.5 justify-end">
                        <MapPin className="w-3 h-3" />{to}
                      </p>
                    </div>
                  </div>

                  {selectedSeats.length > 0 && (
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Armchair className="w-4 h-4 text-orange-500" />
                      <span>Selected seats: <strong>{selectedSeats.join(", ")}</strong></span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2.5 bg-slate-50 rounded-xl border text-center">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Boarding</p>
                      <p className="text-xs font-bold text-slate-800">{boardingPoint || "—"}</p>
                    </div>
                    <div className="p-2.5 bg-slate-50 rounded-xl border text-center">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Dropping</p>
                      <p className="text-xs font-bold text-slate-800">{droppingPoint || "—"}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Passenger forms */}
              {Array.from({ length: seatCount }).map((_, i) => (
                <Card key={i} className="shadow-sm border">
                  <CardHeader className="pb-4 pt-5 px-5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center font-bold text-sm shrink-0">
                        {i + 1}
                      </div>
                      <div>
                        <CardTitle className="text-base">
                          {i === 0 ? "Primary Passenger" : `Passenger ${i + 1}`}
                        </CardTitle>
                        {selectedSeats[i] && (
                          <p className="text-xs text-muted-foreground mt-0.5">Seat {selectedSeats[i]}</p>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="px-5 pb-5 space-y-4">
                    <div>
                      <label className="text-sm font-semibold text-slate-700 block mb-1.5">Full Name <span className="text-red-500">*</span></label>
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
                        <label className="text-sm font-semibold text-slate-700 block mb-1.5">Age <span className="text-red-500">*</span></label>
                        <Input
                          type="number" min={1} max={120} placeholder="Enter age"
                          value={passengers[i].age}
                          onChange={(e) => updatePassenger(i, "age", e.target.value)}
                          className={cn("h-11", errors[i]?.age && "border-red-400")}
                        />
                        {errors[i]?.age && <p className="text-xs text-red-500 mt-1">{errors[i].age}</p>}
                      </div>
                      <div>
                        <label className="text-sm font-semibold text-slate-700 block mb-1.5">Gender <span className="text-red-500">*</span></label>
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
                      <label className="text-sm font-semibold text-slate-700 block mb-1.5">Email Address <span className="text-red-500">*</span></label>
                      <Input
                        type="email" placeholder="your@email.com"
                        value={passengers[i].email}
                        onChange={(e) => updatePassenger(i, "email", e.target.value)}
                        className={cn("h-11", errors[i]?.email && "border-red-400")}
                      />
                      {errors[i]?.email && <p className="text-xs text-red-500 mt-1">{errors[i].email}</p>}
                    </div>

                    <div>
                      <label className="text-sm font-semibold text-slate-700 block mb-1.5">Phone Number <span className="text-red-500">*</span></label>
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

            {/* Right: Price summary */}
            <div className="w-full lg:w-80 shrink-0">
              <div className="sticky top-4 space-y-4">
                <Card className="shadow-sm border">
                  <CardHeader className="pb-3 pt-5 px-5">
                    <CardTitle className="text-base">Price Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="px-5 pb-5 space-y-4">

                    <div className="p-3 bg-orange-50 rounded-xl border border-orange-100">
                      <p className="text-xs text-orange-600 font-medium mb-1">Per Seat</p>
                      <div className="flex items-baseline gap-1">
                        <span className="text-lg font-bold text-orange-800">₹</span>
                        <span className="text-3xl font-extrabold text-orange-800 tabular-nums">{baseFare.toLocaleString("en-IN")}</span>
                      </div>
                      {savings > 0 && (
                        <p className="text-xs text-green-600 font-semibold mt-1">Agent saves ₹{savings.toLocaleString("en-IN")} per seat</p>
                      )}
                    </div>

                    <div className="space-y-2.5">
                      <div className="flex justify-between text-sm text-slate-600">
                        <span>Base Fare × {seatCount}</span>
                        <span className="font-medium">₹{(baseFare * seatCount).toLocaleString("en-IN")}</span>
                      </div>
                      {convFee > 0 && (
                        <div className="flex justify-between text-sm text-slate-600">
                          <span>Convenience Fee × {seatCount}</span>
                          <span className="font-medium">+₹{(convFee * seatCount).toLocaleString("en-IN")}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-extrabold text-lg pt-3 border-t border-dashed text-slate-900">
                        <span>Total</span>
                        <span className="text-orange-600">₹{totalBase.toLocaleString("en-IN")}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">Coupons & credits applied on next step</p>
                    </div>

                    <Button
                      size="lg"
                      onClick={handleContinue}
                      className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold h-12 text-base gap-2 shadow-md"
                    >
                      Continue to Payment <ChevronRight className="w-4 h-4" />
                    </Button>

                    <div className="space-y-1.5 pt-2 border-t">
                      {["Instant confirmation", "E-ticket via email", "24/7 support"].map((t) => (
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
