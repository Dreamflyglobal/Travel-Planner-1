import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { getConvenienceFee } from "@/lib/pricing";
import { saveBookingSession } from "@/lib/booking-session";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Building2, ArrowLeft, Calendar, Star, MapPin, CheckCircle2,
  ChevronRight, BedDouble, Moon, UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Guest = { name: string; age: string; gender: string; email: string; phone: string; };
type FieldErrors = Partial<Record<keyof Guest, string>>;

const emptyGuest = (): Guest => ({ name: "", age: "", gender: "", email: "", phone: "" });

function validateGuest(g: Guest): FieldErrors {
  const e: FieldErrors = {};
  if (!g.name.trim() || g.name.trim().length < 2)
    e.name = "Name must be at least 2 characters";
  if (!g.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(g.email))
    e.email = "Enter a valid email address";
  if (!g.phone.trim() || !/^\d{10}$/.test(g.phone.replace(/\D/g, "")))
    e.phone = "Enter a valid 10-digit phone number";
  return e;
}

function formatDate(d: string) {
  if (!d) return "";
  try {
    return new Date(d + "T00:00:00").toLocaleDateString("en-IN", {
      weekday: "short", day: "2-digit", month: "short", year: "numeric",
    });
  } catch { return d; }
}

export default function HotelBooking() {
  const searchString    = useSearch();
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, isAgent } = useAuth();
  const { toast }       = useToast();

  const p          = new URLSearchParams(searchString);
  const hotelId    = p.get("hotelId")       || "";
  const hotelName  = p.get("hotelName")     || "Hotel";
  const city       = p.get("city")          || "";
  const location   = p.get("location")      || "";
  const stars      = parseInt(p.get("stars")     || "0");
  const rating     = parseFloat(p.get("rating")  || "0");
  const checkin    = p.get("checkin")       || "";
  const checkout   = p.get("checkout")      || "";
  const guests     = parseInt(p.get("adults") || p.get("guests") || "2");
  const nights     = parseInt(p.get("nights")    || "1");
  const roomType   = p.get("roomType")      || "Deluxe";
  const roomPrice  = parseInt(p.get("roomPrice") || "0");
  const markupAmt  = parseInt(p.get("markup")    || "0");
  const normalMarkup = parseInt(p.get("normalMarkup") || "0");
  const agentSavings = parseInt(p.get("agentSavings")  || "0");
  const image      = decodeURIComponent(p.get("image") || "");

  const baseFare   = roomPrice * nights;
  const rawPrice   = (roomPrice - markupAmt);
  const convFee    = getConvenienceFee(rawPrice, "hotels") * nights;
  const totalBase  = baseFare + convFee;
  const savings    = (isAgent && agentSavings > 0) ? agentSavings : 0;

  const [guest,       setGuest]       = useState<Guest>(emptyGuest());
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  useEffect(() => {
    if (user && !guest.email) {
      setGuest((prev) => ({ ...prev, name: user.name || "", email: user.email || "", phone: user.phone || "" }));
    }
  }, [user]);

  function updateField(field: keyof Guest, value: string) {
    setGuest((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function handleContinue() {
    const errs = validateGuest(guest);
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      toast({ variant: "destructive", title: "Please fill all required fields" });
      return;
    }

    saveBookingSession({
      type: "hotel",
      hotelId, hotelName, city, location,
      stars, rating, image,
      checkin, checkout, nights, guests, roomType,
      guest: { name: guest.name, email: guest.email, phone: guest.phone, age: guest.age, gender: guest.gender },
      rawPrice, markupAmt, baseFare, convFee, totalBase,
      isAgent, agentSavings, normalMarkup,
      agentId:    isAgent ? user?.id    : undefined,
      agentEmail: isAgent ? user?.email : undefined,
    });

    setLocation("/booking/payment");
  }

  return (
    <Layout>
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-700 to-indigo-800 text-white">
        <div className="container mx-auto px-4 py-5">
          <button
            onClick={() => window.history.back()}
            className="flex items-center gap-1.5 text-blue-200 hover:text-white text-sm mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to hotel details
          </button>

          <div className="flex items-center gap-2 text-sm mb-5">
            {["Search", "Hotel Details", "Guest Details", "Payment"].map((step, i) => (
              <div key={step} className="flex items-center gap-2">
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2",
                  i === 2 ? "bg-white text-blue-700 border-white"
                  : i < 2 ? "bg-blue-500 border-blue-500 text-white"
                  : "border-blue-400 text-blue-400"
                )}>
                  {i < 2 ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
                </div>
                <span className={cn("hidden sm:inline text-xs", i === 2 ? "font-bold" : "text-blue-300")}>{step}</span>
                {i < 3 && <ChevronRight className="w-4 h-4 text-blue-400" />}
              </div>
            ))}
          </div>

          <h1 className="text-2xl font-extrabold">Guest Details</h1>
          <p className="text-blue-200 text-sm mt-0.5">{hotelName} · {roomType} Room</p>
        </div>
      </div>

      <div className="bg-slate-50 min-h-screen">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col lg:flex-row gap-6">

            {/* Left */}
            <div className="flex-1 min-w-0 space-y-5">

              {!isAuthenticated && (
                <Alert className="border-blue-200 bg-blue-50">
                  <UserPlus className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-blue-800 text-sm">
                    <span className="font-semibold">No login needed!</span> An account will be created automatically after payment.
                  </AlertDescription>
                </Alert>
              )}

              {/* Hotel Summary */}
              <Card className="shadow-sm border overflow-hidden">
                <div className="bg-gradient-to-r from-blue-700 to-indigo-700 px-5 py-3 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-white" />
                  <span className="text-white font-semibold text-sm">Booking Summary</span>
                </div>
                <CardContent className="p-0">
                  <div className="flex flex-col sm:flex-row">
                    {image && (
                      <div className="sm:w-44 shrink-0">
                        <img
                          src={image} alt={hotelName}
                          className="w-full h-36 sm:h-full object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=400&q=80"; }}
                        />
                      </div>
                    )}
                    <div className="flex-1 p-5 space-y-3">
                      <div>
                        <h3 className="font-bold text-lg text-slate-900">{hotelName}</h3>
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" />{location}, {city}
                        </p>
                        {rating > 0 && (
                          <div className="flex items-center gap-1.5 mt-1">
                            <div className="flex items-center gap-1 bg-green-600 text-white text-xs font-bold px-1.5 py-0.5 rounded">
                              <Star className="w-3 h-3 fill-white" />{rating}
                            </div>
                            <div className="flex">{Array.from({ length: stars }).map((_, i) => <Star key={i} className="w-3 h-3 fill-yellow-400 text-yellow-400" />)}</div>
                          </div>
                        )}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {[
                          { icon: BedDouble, label: "Room",      value: roomType },
                          { icon: Moon,      label: "Nights",    value: `${nights} night${nights>1?"s":""}` },
                          { icon: Calendar,  label: "Check-in",  value: formatDate(checkin)  || "—" },
                          { icon: Calendar,  label: "Check-out", value: formatDate(checkout) || "—" },
                        ].map(({ icon: Icon, label, value }) => (
                          <div key={label} className="flex flex-col items-center text-center p-2.5 bg-slate-50 rounded-xl border">
                            <Icon className="w-4 h-4 text-blue-600 mb-1" />
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
                            <p className="text-xs font-bold text-slate-800 mt-0.5 leading-tight">{value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Guest Details form */}
              <Card className="shadow-sm border">
                <CardHeader className="pb-4 pt-5 px-5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm shrink-0">1</div>
                    <div>
                      <CardTitle className="text-base">Primary Guest Details</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">Booking confirmation will be sent here</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="px-5 pb-5 space-y-4">
                  <div>
                    <label className="text-sm font-semibold text-slate-700 block mb-1.5">Full Name <span className="text-red-500">*</span></label>
                    <Input
                      placeholder="As on government ID"
                      value={guest.name}
                      onChange={(e) => updateField("name", e.target.value)}
                      className={cn("h-11", fieldErrors.name && "border-red-400")}
                    />
                    {fieldErrors.name && <p className="text-xs text-red-500 mt-1">{fieldErrors.name}</p>}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-semibold text-slate-700 block mb-1.5">Email <span className="text-red-500">*</span></label>
                      <Input
                        type="email" placeholder="Enter email address"
                        value={guest.email}
                        onChange={(e) => updateField("email", e.target.value)}
                        className={cn("h-11", fieldErrors.email && "border-red-400")}
                      />
                      {fieldErrors.email && <p className="text-xs text-red-500 mt-1">{fieldErrors.email}</p>}
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-slate-700 block mb-1.5">Phone <span className="text-red-500">*</span></label>
                      <div className="flex gap-2">
                        <div className="flex items-center gap-1.5 border rounded-md px-3 bg-muted/30 text-sm font-medium text-slate-600 shrink-0">
                          🇮🇳 +91
                        </div>
                        <Input
                          type="tel" placeholder="10-digit number" maxLength={10}
                          value={guest.phone}
                          onChange={(e) => updateField("phone", e.target.value.replace(/\D/g,""))}
                          className={cn("h-11 flex-1", fieldErrors.phone && "border-red-400")}
                        />
                      </div>
                      {fieldErrors.phone && <p className="text-xs text-red-500 mt-1">{fieldErrors.phone}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-semibold text-slate-700 block mb-1.5">Age</label>
                      <Input
                        type="number" min={1} max={120} placeholder="Optional"
                        value={guest.age}
                        onChange={(e) => updateField("age", e.target.value)}
                        className="h-11"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-slate-700 block mb-1.5">Gender</label>
                      <Select value={guest.gender} onValueChange={(v) => updateField("gender", v)}>
                        <SelectTrigger className="h-11">
                          <SelectValue placeholder="Optional" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="male">Male</SelectItem>
                          <SelectItem value="female">Female</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right */}
            <div className="w-full lg:w-80 shrink-0">
              <div className="sticky top-4 space-y-4">
                <Card className="shadow-sm border">
                  <CardHeader className="pb-3 pt-5 px-5">
                    <CardTitle className="text-base">Price Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="px-5 pb-5 space-y-4">

                    <div className="p-3 bg-blue-50 rounded-xl border border-blue-100">
                      <p className="text-xs text-blue-600 font-medium mb-1">Room Rate ({nights} night{nights>1?"s":""})</p>
                      <div className="flex items-baseline gap-1">
                        <span className="text-lg font-bold text-blue-800">₹</span>
                        <span className="text-3xl font-extrabold text-blue-800 tabular-nums">{baseFare.toLocaleString("en-IN")}</span>
                      </div>
                      {savings > 0 && (
                        <p className="text-xs text-green-600 font-semibold mt-1">Agent saves ₹{savings.toLocaleString("en-IN")}</p>
                      )}
                    </div>

                    <div className="space-y-2.5">
                      <div className="flex justify-between text-sm text-slate-600">
                        <span>Room × {nights} night{nights>1?"s":""}</span>
                        <span className="font-medium">₹{baseFare.toLocaleString("en-IN")}</span>
                      </div>
                      {convFee > 0 && (
                        <div className="flex justify-between text-sm text-slate-600">
                          <span>Convenience Fee</span>
                          <span className="font-medium">+₹{convFee.toLocaleString("en-IN")}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-extrabold text-lg pt-3 border-t border-dashed text-slate-900">
                        <span>Total</span>
                        <span className="text-blue-700">₹{totalBase.toLocaleString("en-IN")}</span>
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
                      {["Free cancellation (see policy)", "Instant confirmation", "24/7 support"].map((t) => (
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
