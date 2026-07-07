import { useState, useEffect, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { getConvenienceFee } from "@/lib/pricing";
import { validateCouponFromList, apiFetchCoupons, apiFetchCouponUsage, apiRecordCouponUsage, checkFirstTimeUsage, type Coupon, type CouponContext, type CouponUsageRecord } from "@/lib/coupon";
import { AvailableCoupons } from "@/components/available-coupons";
import { useCreateBooking } from "@workspace/api-client-react";
import { openRazorpayCheckout, verifyRazorpayPayment } from "@/lib/use-razorpay";
import { deductWallet, creditWallet } from "@/lib/wallet";
import { autoSaveLead, convertLeadToBooked } from "@/lib/crm";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { useBookingNotifier } from "@/hooks/use-booking-notifier";
import { logStaffBooking } from "@/lib/staff-data";
import {
  loadBookingSession, clearBookingSession,
  type BookingSession, type FlightBookingSession,
  type BusBookingSession, type HotelBookingSession,
} from "@/lib/booking-session";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import {
  Plane, Bus, Building2, ArrowLeft, CheckCircle2, Loader2,
  Tag, XCircle, CreditCard, AlertCircle, Wallet,
  MapPin, Calendar, Users, Clock, BedDouble, Moon, Star, Armchair,
  Luggage, ChevronRight, ShieldCheck, Award, Headphones, Receipt,
} from "lucide-react";
import { cn } from "@/lib/utils";

function formatDate(d: string) {
  if (!d) return "";
  try {
    return new Date(d + "T00:00:00").toLocaleDateString("en-IN", {
      weekday: "short", day: "2-digit", month: "short", year: "numeric",
    });
  } catch { return d; }
}

function FlightSummary({ s }: { s: FlightBookingSession }) {
  return (
    <Card className="shadow-sm border overflow-hidden">
      <div className="bg-gradient-to-r from-blue-700 to-indigo-800 px-5 py-3 flex items-center gap-2">
        <Plane className="w-4 h-4 text-white" />
        <span className="text-white font-semibold text-sm">Flight Summary</span>
      </div>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm shrink-0">
            <span className="text-white font-extrabold text-sm">{s.airline.substring(0,2).toUpperCase()}</span>
          </div>
          <div>
            <p className="font-bold text-slate-900">{s.airline}</p>
            <p className="text-xs text-muted-foreground">{s.flightNum}</p>
          </div>
          <Badge className="ml-auto bg-slate-100 text-slate-600 border-0">{s.cabinLabel || "Economy"}</Badge>
        </div>
        <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl">
          <div>
            <p className="text-2xl font-extrabold text-slate-900">{s.departure}</p>
            <p className="text-xs font-semibold text-slate-500 mt-0.5">{s.from}</p>
          </div>
          <div className="flex-1 flex flex-col items-center">
            <p className="text-xs text-muted-foreground font-medium mb-1">{s.duration}</p>
            <div className="w-full flex items-center gap-1">
              <div className="flex-1 h-px bg-slate-300" />
              <Plane className="w-4 h-4 text-blue-500" />
              <div className="flex-1 h-px bg-slate-300" />
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-extrabold text-slate-900">{s.arrival}</p>
            <p className="text-xs font-semibold text-slate-500 mt-0.5">{s.to}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { icon: Calendar, label: "Date",      value: formatDate(s.date) },
            { icon: Clock,    label: "Duration",  value: s.duration },
            { icon: Users,    label: "Passengers",value: `${s.travelers} Adult${s.travelers>1?"s":""}` },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="p-2.5 bg-slate-50 rounded-xl border">
              <Icon className="w-3.5 h-3.5 text-blue-600 mx-auto mb-1" />
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
              <p className="text-xs font-bold text-slate-800 mt-0.5 leading-tight">{value}</p>
            </div>
          ))}
        </div>
        {(s.selectedSeats.length > 0 || s.extraBaggageKg > 0) && (
          <div className="space-y-1.5 pt-2 border-t text-sm text-slate-600">
            {s.selectedSeats.length > 0 && (
              <div className="flex items-center gap-2">
                <Armchair className="w-3.5 h-3.5 text-blue-500" />
                <span>Seats: <strong>{s.selectedSeats.join(", ")}</strong></span>
              </div>
            )}
            {s.extraBaggageKg > 0 && (
              <div className="flex items-center gap-2">
                <Luggage className="w-3.5 h-3.5 text-orange-500" />
                <span>Extra baggage: <strong>{s.extraBaggageKg}kg (+₹{s.extraBaggageCost.toLocaleString("en-IN")})</strong></span>
              </div>
            )}
          </div>
        )}
        <div className="pt-2 border-t">
          <p className="text-xs font-semibold text-slate-500 mb-1.5">Passengers</p>
          {s.passengers.map((p, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-slate-700 py-1">
              <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold">{i+1}</span>
              <span className="font-medium">{p.name}</span>
              <span className="text-muted-foreground text-xs">· DOB {p.dob} · {p.gender}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function BusSummary({ s }: { s: BusBookingSession }) {
  return (
    <Card className="shadow-sm border overflow-hidden">
      <div className="bg-gradient-to-r from-orange-600 to-pink-700 px-5 py-3 flex items-center gap-2">
        <Bus className="w-4 h-4 text-white" />
        <span className="text-white font-semibold text-sm">Bus Summary</span>
      </div>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-pink-600 flex items-center justify-center shadow-sm shrink-0">
            <Bus className="w-6 h-6 text-white" />
          </div>
          <div>
            <p className="font-bold text-slate-900">{s.busName}</p>
            <p className="text-xs text-muted-foreground">{s.operator} · {s.busType}</p>
          </div>
          <Badge className="ml-auto bg-slate-100 text-slate-600 border-0">{s.seatCount} Seat{s.seatCount>1?"s":""}</Badge>
        </div>
        <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl">
          <div>
            <p className="text-xl font-extrabold text-slate-900">{s.departure}</p>
            <p className="text-xs font-semibold text-slate-500 flex items-center gap-1 mt-0.5"><MapPin className="w-3 h-3" />{s.from}</p>
          </div>
          <div className="flex-1 flex flex-col items-center">
            <p className="text-xs text-muted-foreground font-medium mb-1">{s.duration}</p>
            <div className="w-full flex items-center gap-1">
              <div className="flex-1 h-px bg-slate-300" />
              <Bus className="w-4 h-4 text-orange-400" />
              <div className="flex-1 h-px bg-slate-300" />
            </div>
          </div>
          <div className="text-right">
            <p className="text-xl font-extrabold text-slate-900">{s.arrival}</p>
            <p className="text-xs font-semibold text-slate-500 flex items-center gap-1 mt-0.5"><MapPin className="w-3 h-3" />{s.to}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm text-slate-600">
          <div className="p-2 bg-slate-50 rounded-lg border">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Boarding</p>
            <p className="font-medium text-xs">{s.boardingPoint || "—"}</p>
          </div>
          <div className="p-2 bg-slate-50 rounded-lg border">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Dropping</p>
            <p className="font-medium text-xs">{s.droppingPoint || "—"}</p>
          </div>
        </div>
        {s.selectedSeats.length > 0 && (
          <div className="flex items-center gap-2 text-sm">
            <Armchair className="w-3.5 h-3.5 text-orange-500" />
            <span>Seats: <strong>{s.selectedSeats.join(", ")}</strong></span>
          </div>
        )}
        <div className="pt-2 border-t">
          <p className="text-xs font-semibold text-slate-500 mb-1.5">Passengers</p>
          {s.passengers.map((p, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-slate-700 py-1">
              <span className="w-5 h-5 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center text-[10px] font-bold">{i+1}</span>
              <span className="font-medium">{p.name}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function HotelSummary({ s }: { s: HotelBookingSession }) {
  return (
    <Card className="shadow-sm border overflow-hidden">
      <div className="bg-gradient-to-r from-blue-700 to-indigo-800 px-5 py-3 flex items-center gap-2">
        <Building2 className="w-4 h-4 text-white" />
        <span className="text-white font-semibold text-sm">Hotel Summary</span>
      </div>
      <CardContent className="p-0">
        <div className="flex flex-col sm:flex-row">
          {s.image && (
            <div className="sm:w-40 shrink-0">
              <img src={s.image} alt={s.hotelName} className="w-full h-32 sm:h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=400&q=80"; }} />
            </div>
          )}
          <div className="flex-1 p-5 space-y-3">
            <div>
              <h3 className="font-bold text-lg text-slate-900">{s.hotelName}</h3>
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />{s.location}, {s.city}
              </p>
              {s.rating > 0 && (
                <div className="flex items-center gap-1.5 mt-1">
                  <div className="flex items-center gap-1 bg-green-600 text-white text-xs font-bold px-1.5 py-0.5 rounded">
                    <Star className="w-3 h-3 fill-white" />{s.rating}
                  </div>
                  <div className="flex">{Array.from({ length: s.stars }).map((_, i) => <Star key={i} className="w-3 h-3 fill-yellow-400 text-yellow-400" />)}</div>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { icon: BedDouble, label: "Room",      value: s.roomType },
                { icon: Moon,      label: "Nights",    value: `${s.nights} night${s.nights>1?"s":""}` },
                { icon: Calendar,  label: "Check-in",  value: formatDate(s.checkin) },
                { icon: Calendar,  label: "Check-out", value: formatDate(s.checkout) },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex flex-col items-center text-center p-2 bg-slate-50 rounded-xl border">
                  <Icon className="w-3.5 h-3.5 text-blue-600 mb-0.5" />
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
                  <p className="text-xs font-bold text-slate-800 mt-0.5 leading-tight">{value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function BookingPayment() {
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, isAgent, autoLoginOrRegister, refreshUser } = useAuth();
  const { toast } = useToast();
  const createBooking = useCreateBooking();
  const { isConfigured: pushEnabled } = usePushNotifications(
    user ? { id: user.id, name: user.name, phone: user.phone, email: user.email } : undefined
  );
  const notifyBookingSuccess = useBookingNotifier();

  const [session, setSession] = useState<BookingSession | null>(null);

  const [couponInput,     setCouponInput]     = useState("");
  const [couponStatus,    setCouponStatus]    = useState<"idle"|"valid"|"invalid">("idle");
  const [couponError,     setCouponError]     = useState<string>("");
  const [discount,        setDiscount]        = useState(0);
  const [appliedCoupon,   setAppliedCoupon]   = useState<Coupon | null>(null);
  const [processing,      setProcessing]      = useState(false);
  const [walletPaying,    setWalletPaying]    = useState(false);
  const [paymentError,    setPaymentError]    = useState<string | null>(null);
  const [useCredits,      setUseCredits]      = useState(false);
  const [allCoupons,      setAllCoupons]      = useState<Coupon[]>([]);
  const [couponUsageRecs, setCouponUsageRecs] = useState<CouponUsageRecord[]>([]);

  const paymentDoneRef = useRef(false);

  useEffect(() => {
    const s = loadBookingSession();
    if (!s) {
      setLocation("/");
      return;
    }
    setSession(s);
  }, []);

  // Fetch coupons from API on mount + whenever the tab regains focus
  useEffect(() => {
    const fetchCoupons = () => {
      apiFetchCoupons().then(setAllCoupons).catch(() => {});
      apiFetchCouponUsage().then(setCouponUsageRecs).catch(() => {});
    };
    fetchCoupons();
    const onFocus = () => { if (document.visibilityState === "visible") fetchCoupons(); };
    document.addEventListener("visibilitychange", onFocus);
    return () => document.removeEventListener("visibilitychange", onFocus);
  }, []);

  // Clear coupon state whenever the booking service type changes (prevents bus coupon carrying over to hotel etc.)
  const sessionTypeRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!session) return;
    if (sessionTypeRef.current !== undefined && sessionTypeRef.current !== session.type) {
      setCouponInput("");
      setCouponStatus("idle");
      setCouponError("");
      setDiscount(0);
      setAppliedCoupon(null);
    }
    sessionTypeRef.current = session.type;
  }, [session?.type]);

  const totalBase = useMemo(() => {
    if (!session) return 0;
    // Use lockedTotalPrice when set (flight review confirmed price)
    if (session.type === "flight" && (session as any).lockedTotalPrice) {
      return (session as any).lockedTotalPrice as number;
    }
    return session.totalBase;
  }, [session]);

  const totalAfterCoupon = Math.max(0, totalBase - discount);

  const walletBalance  = user?.walletBalance ?? 0;
  const canPayByWallet = isAgent && isAuthenticated && walletBalance >= totalAfterCoupon;
  const canUseCredits  = user?.role === "user" && isAuthenticated && walletBalance > 0;
  const creditApplied  = useCredits && canUseCredits ? Math.min(walletBalance, totalAfterCoupon) : 0;
  const netPayable     = totalAfterCoupon - creditApplied;

  // service_type is undefined until session loads — this prevents defaulting to "flight" prematurely
  const serviceType = session?.type as "flight" | "bus" | "hotel" | "holiday" | undefined;

  const couponContext = useMemo(() => {
    const phone = user?.phone ?? (session?.type === "flight" ? session.passengers[0]?.phone
      : session?.type === "bus" ? session.passengers[0]?.phone
      : session?.type === "hotel" ? session.guest.phone : "") ?? "";
    let userBookingsCount = 0;
    try {
      const stored = JSON.parse(localStorage.getItem("travel_bookings") ?? "[]");
      if (user?.id) userBookingsCount = stored.filter((b: any) => b.userId === user.id).length;
    } catch {}
    return { phone, userBookingsCount, service_type: serviceType };
  }, [user, session, serviceType]);

  function applyCoupon(codeOverride?: string) {
    const code = (codeOverride ?? couponInput).trim().toUpperCase();
    if (!code) return;
    // When called from the available-offers list, also fill the input box
    if (codeOverride) setCouponInput(codeOverride);
    const result = validateCouponFromList(code, totalBase, couponContext, allCoupons, couponUsageRecs);
    if (result.ok) {
      setDiscount(result.discountAmount);
      setAppliedCoupon(result.coupon);
      setCouponStatus("valid");
      setCouponError("");
      toast({ title: "Coupon applied!", description: `₹${result.discountAmount.toLocaleString("en-IN")} off your booking` });
    } else {
      setDiscount(0);
      setAppliedCoupon(null);
      setCouponStatus("invalid");
      setCouponError(result.error);
      toast({ variant: "destructive", title: "Coupon not applied", description: result.error });
    }
  }

  function removeCoupon() {
    setCouponInput("");
    setCouponStatus("idle");
    setCouponError("");
    setDiscount(0);
    setAppliedCoupon(null);
  }

  function buildFlightBooking(s: FlightBookingSession, paymentId: string, bookingRef: string, userId: string) {
    const travelDate = s.date || new Date().toISOString().split("T")[0];
    const commissionEarned = s.isAgent ? (s.agentSavings * s.travelers) : 0;
    const bookedByRole = s.isAgent ? "agent" : user?.role === "staff" ? "staff" : "customer";
    const rawBaseAmount  = s.rawPrice * s.travelers;
    const markupAmount   = s.hiddenMarkup * s.travelers;
    const convenienceFee = s.convFee * s.travelers;
    return {
      bookingType: "flight" as const,
      referenceId: parseInt(s.flightId, 10) || 1,
      passengerName:  s.passengers[0].name,
      passengerEmail: s.passengers[0].email,
      passengerPhone: s.passengers[0].phone,
      passengers: s.travelers,
      travelDate,
      baseFare: rawBaseAmount,
      markupAmount,
      convenienceFee,
      details: {
        userId,
        bookedByRole,
        agentId:          s.isAgent ? s.agentId : undefined,
        agentEmail:       s.isAgent ? s.agentEmail : undefined,
        agentMarkup:      s.isAgent ? s.hiddenMarkup : undefined,
        normalMarkup:     s.isAgent ? s.normalMarkup : undefined,
        commissionEarned: commissionEarned > 0 ? commissionEarned : undefined,
        type: "flight", status: "paid",
        customerName:    s.passengers[0].name,
        customerEmail:   s.passengers[0].email,
        customerPhone:   s.passengers[0].phone,
        customerGender:  s.passengers[0].gender,
        passengerDetails: s.passengers,
        selectedSeats:   s.selectedSeats,
        extraBaggageKg:  s.extraBaggageKg || undefined,
        extraBaggageCost:s.extraBaggageCost || undefined,
        amount:          totalAfterCoupon,
        rawBaseAmount,
        markupAmount,
        baseAmount:      s.baseFare * s.travelers,
        convenienceFee,
        discountAmount:  discount || undefined,
        couponCode:      appliedCoupon?.code || undefined,
        creditApplied:   creditApplied || undefined,
        paymentMethod:   paymentId.startsWith("wallet") ? "wallet" : creditApplied > 0 ? "credits+razorpay" : "razorpay",
        paymentId, bookingRef, createdAt: new Date().toISOString(),
        cabinClass:  s.cabinClass  || undefined,
        cabinLabel:  s.cabinLabel  || undefined,
        tjBookingId: s.tjBookingId || undefined,
        flightInfo: { airline: s.airline, flightNum: s.flightNum, from: s.from, to: s.to, departure: s.departure, arrival: s.arrival, duration: s.duration, date: s.date },
      },
    };
  }

  function buildBusBooking(s: BusBookingSession, paymentId: string, bookingRef: string, userId: string) {
    const travelDate = s.date || new Date().toISOString().split("T")[0];
    const commissionEarned = s.isAgent ? (s.agentSavings * s.seatCount) : 0;
    const bookedByRole = s.isAgent ? "agent" : user?.role === "staff" ? "staff" : "customer";
    const rawBaseAmount  = s.rawPrice * s.seatCount;
    const markupAmount   = s.hiddenMarkup * s.seatCount;
    const convenienceFee = s.convFee * s.seatCount;
    return {
      bookingType: "bus" as const,
      referenceId: parseInt(s.busId, 10) || 1,
      title: `${s.busName} · ${s.from} → ${s.to}`,
      passengerName:  s.passengers[0].name,
      passengerEmail: s.passengers[0].email,
      passengerPhone: s.passengers[0].phone,
      passengers: s.seatCount,
      travelDate,
      baseFare: rawBaseAmount,
      markupAmount,
      convenienceFee,
      details: {
        userId,
        bookedByRole,
        agentId:          s.isAgent ? s.agentId : undefined,
        agentEmail:       s.isAgent ? s.agentEmail : undefined,
        agentMarkup:      s.isAgent ? s.hiddenMarkup : undefined,
        normalMarkup:     s.isAgent ? s.normalMarkup : undefined,
        commissionEarned: commissionEarned > 0 ? commissionEarned : undefined,
        type: "bus", status: "paid",
        customerName:    s.passengers[0].name,
        customerEmail:   s.passengers[0].email,
        customerPhone:   s.passengers[0].phone,
        customerGender:  s.passengers[0].gender,
        passengerDetails: s.passengers,
        amount:          totalAfterCoupon,
        rawBaseAmount,
        markupAmount,
        baseAmount:      s.baseFare * s.seatCount,
        convenienceFee,
        discountAmount:  discount || undefined,
        couponCode:      appliedCoupon?.code || undefined,
        creditApplied:   creditApplied || undefined,
        paymentMethod:   paymentId.startsWith("wallet") ? "wallet" : creditApplied > 0 ? "credits+razorpay" : "razorpay",
        paymentId, bookingRef, createdAt: new Date().toISOString(),
        busInfo: { busId: s.busId, bus_name: s.busName, operator: s.operator, from: s.from, to: s.to, departure: s.departure, arrival: s.arrival, duration: s.duration, date: s.date, busType: s.busType, seats: s.selectedSeats, boarding_point: s.boardingPoint, dropping_point: s.droppingPoint },
      },
    };
  }

  function buildHotelBooking(s: HotelBookingSession, paymentId: string, bookingRef: string, userId: string) {
    const commissionEarned = s.isAgent ? s.agentSavings : 0;
    const bookedByRole = s.isAgent ? "agent" : user?.role === "staff" ? "staff" : "customer";
    const rawBaseAmount  = s.rawPrice * s.nights;
    const markupAmount   = s.markupAmt * s.nights;
    const convenienceFee = s.convFee;
    return {
      bookingType: "hotel" as const,
      referenceId: parseInt(s.hotelId, 10) || 1,
      title: `${s.hotelName} · ${s.roomType} Room`,
      passengerName:  s.guest.name,
      passengerEmail: s.guest.email,
      passengerPhone: s.guest.phone,
      passengers: s.guests,
      travelDate: s.checkin,
      baseFare: rawBaseAmount,
      markupAmount,
      convenienceFee,
      details: {
        userId,
        bookedByRole,
        agentId:          s.isAgent ? s.agentId : undefined,
        agentEmail:       s.isAgent ? s.agentEmail : undefined,
        agentMarkup:      s.isAgent ? s.markupAmt : undefined,
        normalMarkup:     s.isAgent ? s.normalMarkup : undefined,
        commissionEarned: commissionEarned > 0 ? commissionEarned : undefined,
        type: "hotel", status: "paid",
        customerName:  s.guest.name,
        customerEmail: s.guest.email,
        customerPhone: s.guest.phone,
        amount:        totalAfterCoupon,
        rawBaseAmount,
        markupAmount,
        baseAmount:    s.baseFare,
        convenienceFee,
        discountAmount:  discount || undefined,
        couponCode:      appliedCoupon?.code || undefined,
        creditApplied:   creditApplied || undefined,
        paymentMethod:   paymentId.startsWith("wallet") ? "wallet" : creditApplied > 0 ? "credits+razorpay" : "razorpay",
        paymentId, bookingRef, createdAt: new Date().toISOString(),
        hotelInfo: { hotelId: s.hotelId, hotel_name: s.hotelName, city: s.city, location: s.location, stars: s.stars, rating: s.rating, checkin: s.checkin, checkout: s.checkout, nights: s.nights, guests: s.guests, room_type: s.roomType },
      },
    };
  }

  // ── Refund helper ─────────────────────────────────────────────────────────
  // Attempts to trigger a Razorpay refund via the backend admin route.
  // For non-admin users the API returns 401 and `initiated` will be false;
  // the payment details are always persisted in localStorage for admin review.
  async function attemptRefund(
    paymentId: string,
    amount: number,
    reason: string,
  ): Promise<{ initiated: boolean; refundId?: string; error?: string }> {
    const apiBase = (import.meta.env.VITE_API_BASE_URL as string) ?? "";

    // Always record locally so admins can spot and process orphaned payments.
    try {
      const pending = JSON.parse(localStorage.getItem("ww_pending_refunds") ?? "[]");
      pending.push({ paymentId, amount, reason, timestamp: new Date().toISOString() });
      localStorage.setItem("ww_pending_refunds", JSON.stringify(pending));
    } catch { /* localStorage unavailable — continue */ }

    try {
      const res = await fetch(`${apiBase}/api/refund`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ paymentId, amount }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        console.info("[refund] initiated:", data.refundId, "paymentId:", paymentId);
        return { initiated: true, refundId: data.refundId };
      }
      console.warn("[refund] backend returned error:", data.error ?? res.status, "paymentId:", paymentId);
      return { initiated: false, error: data.error ?? `HTTP ${res.status}` };
    } catch (err) {
      console.error("[refund] network error for paymentId:", paymentId, err);
      return { initiated: false, error: "Network error during refund" };
    }
  }

  async function attemptTjBook(
    s: FlightBookingSession,
  ): Promise<{ pnr?: string; tjBookingRef?: string; error?: string }> {
    const tjId = sessionStorage.getItem("ww_tj_booking_id");
    if (!tjId) return { error: "No TripJack booking ID found" };

    // Extract traceId and resultIndex from the fareQuote cache
    let traceId: string | undefined;
    let resultIndex: string | undefined;
    try {
      const fqStr = sessionStorage.getItem("ww_tj_farequote");
      if (fqStr) {
        const fq = JSON.parse(fqStr);
        traceId     = fq?.data?.traceId ?? fq?.traceId ?? undefined;
        resultIndex = fq?.data?.results?.[0]?.resultIndex
                   ?? fq?.data?.resultIndex
                   ?? undefined;
      }
    } catch { /* use undefined */ }
    // Authoritative resultIndex stored at fare-selection time
    const fareKeyStored = sessionStorage.getItem("ww_tj_farequote_key") ?? undefined;
    if (!resultIndex && fareKeyStored) resultIndex = fareKeyStored;

    const apiBase = (import.meta.env.VITE_API_BASE_URL as string) ?? "";
    try {
      const res = await fetch(`${apiBase}/api/tj-book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId: tjId,
          ...(traceId     && { traceId }),
          ...(resultIndex && { resultIndex }),
          paymentInfos: [{ paymentMode: "ONLINE_PAYMENT", amount: totalAfterCoupon, currency: "INR" }],
          travellerInfo: s.passengers.map((p, idx) => {
            const t: Record<string, unknown> = {
              fn: p.name.split(" ")[0] || p.name,
              ln: p.name.split(" ").slice(1).join(" ") || ".",
              ti: "MR",
              pt: "ADULT",
            };
            if (p.phone) t.pNum = p.phone;
            if (p.email) t.eml  = p.email;
            if (s.selectedSeats[idx])  t.ssrSeatInfos    = [{ key: s.selectedSeats[idx],  code: s.selectedSeats[idx] }];
            if (s.extraBaggageCode)    t.ssrBaggageInfos = [{ key: s.extraBaggageCode,    code: s.extraBaggageCode }];
            return t;
          }),
          deliveryInfo: {
            emails:   [s.passengers[0].email].filter(Boolean),
            contacts: [s.passengers[0].phone?.replace(/^\+?91/, "").replace(/[\s\-()]/g, "").slice(-10)].filter(Boolean),
          },
        }),
      });
      const data = await res.json();
      sessionStorage.removeItem("ww_tj_booking_id");

      if (!res.ok || data?.status === false || data?.errors?.length) {
        const msg = data?.errors?.[0]?.message
          || data?.message
          || data?.error
          || "Airline booking failed.";
        return { error: msg };
      }

      return {
        pnr:          data?.data?.pnr       || undefined,
        tjBookingRef: data?.data?.bookingId || undefined,
      };
    } catch {
      return { error: "Could not reach airline system." };
    }
  }

  async function handleWalletPay() {
    if (!session || !user || !isAuthenticated) return;
    setWalletPaying(true);
    setPaymentError(null);

    const label = session.type === "flight"
      ? `Flight ${(session as FlightBookingSession).airline} · ${session.from}→${session.to}`
      : session.type === "bus"
      ? `Bus ${(session as BusBookingSession).busName} · ${session.from}→${session.to}`
      : `Hotel ${(session as HotelBookingSession).hotelName}`;

    const result = deductWallet(user.id, totalAfterCoupon, label);
    if (!result.ok) {
      setWalletPaying(false);
      setPaymentError("Insufficient wallet balance.");
      toast({ variant: "destructive", title: "Insufficient wallet balance" });
      return;
    }

    const bookingRef = `BK-${Date.now().toString(36).toUpperCase()}`;
    const paymentId  = `wallet_${Date.now()}`;
    let booking: any;
    if (session.type === "flight") booking = buildFlightBooking(session as FlightBookingSession, paymentId, bookingRef, user.id);
    else if (session.type === "bus") booking = buildBusBooking(session as BusBookingSession, paymentId, bookingRef, user.id);
    else booking = buildHotelBooking(session as HotelBookingSession, paymentId, bookingRef, user.id);

    try {
      await createBooking.mutateAsync({ data: booking });
    } catch (err) {
      console.error("Booking save failed:", err);
      setWalletPaying(false);
      toast({ variant: "destructive", title: "Booking Failed", description: "Could not save your booking. Please contact support." });
      return;
    }
    if (appliedCoupon) {
      const phone = session.type === "hotel" ? (session as HotelBookingSession).guest.phone : (session as any).passengers[0].phone;
      apiRecordCouponUsage(appliedCoupon.code, phone);
    }
    if (user?.role === "staff") {
      const wCustName    = session.type === "hotel" ? (session as HotelBookingSession).guest.name : (session as any).passengers[0].name;
      const bookingProfit = (booking.details.markupAmount ?? booking.details.markup ?? 0)
                          + (booking.details.convenienceFee ?? booking.details.convenience_fee ?? 0);
      logStaffBooking({ staffId: user.id, staffName: user.name, bookingRef, type: session.type as any, amount: totalAfterCoupon, profit: bookingProfit, customerName: wCustName, date: new Date().toISOString() });
    }
    const wName  = session.type === "hotel" ? (session as HotelBookingSession).guest.name  : (session as any).passengers[0].name;
    const wEmail = session.type === "hotel" ? (session as HotelBookingSession).guest.email : (session as any).passengers[0].email;
    const wPhone = session.type === "hotel" ? (session as HotelBookingSession).guest.phone : (session as any).passengers[0].phone;
    const wLastSuccessful = {
      bookingId:      bookingRef,
      bookingType:    session.type as "flight" | "bus" | "hotel",
      passengerName:  wName  || "",
      passengerEmail: wEmail || "",
      passengerPhone: wPhone || "",
      passengers:     session.type === "hotel" ? (session as HotelBookingSession).guests : session.type === "bus" ? (session as BusBookingSession).seatCount : (session as FlightBookingSession).travelers,
      travelDate:     session.type === "hotel" ? (session as HotelBookingSession).checkin : session.date,
      totalAmount:    totalAfterCoupon,
      paymentId,
      paymentStatus:  "paid" as const,
      timestamp:      new Date().toISOString(),
      title: session.type === "flight"
        ? `${(session as FlightBookingSession).airline} · ${session.from} → ${session.to}`
        : session.type === "bus"
        ? `${(session as BusBookingSession).busName} · ${session.from} → ${session.to}`
        : `${(session as HotelBookingSession).hotelName}`,
      selectedSeats: session.type === "flight" ? (session as FlightBookingSession).selectedSeats : session.type === "bus" ? (session as BusBookingSession).selectedSeats.map(String) : undefined,
      roomType:     session.type === "hotel" ? (session as HotelBookingSession).roomType  : undefined,
      checkoutDate: session.type === "hotel" ? (session as HotelBookingSession).checkout  : undefined,
      hotelName:    session.type === "hotel" ? (session as HotelBookingSession).hotelName : undefined,
      hotelCity:    session.type === "hotel" ? (session as HotelBookingSession).city       : undefined,
      hotelNights:  session.type === "hotel" ? (session as HotelBookingSession).nights     : undefined,
      hotelRooms:   1,
      hotelAdults:  session.type === "hotel" ? (session as HotelBookingSession).guests     : undefined,
      busBoardingPoint: session.type === "bus" ? (session as BusBookingSession).boardingPoint : undefined,
      busDroppingPoint: session.type === "bus" ? (session as BusBookingSession).droppingPoint : undefined,
      busDeparture:     session.type === "bus" ? (session as BusBookingSession).departure     : undefined,
      busArrival:       session.type === "bus" ? (session as BusBookingSession).arrival       : undefined,
      busType:          session.type === "bus" ? (session as BusBookingSession).busType       : undefined,
      busOperator:      session.type === "bus" ? (session as BusBookingSession).operator      : undefined,
      busFrom:          session.type === "bus" ? (session as BusBookingSession).from          : undefined,
      busTo:            session.type === "bus" ? (session as BusBookingSession).to            : undefined,
      busBaseFare:      session.type === "bus" ? (session as BusBookingSession).baseFare      : undefined,
      busMarkup:        session.type === "bus" ? (session as BusBookingSession).hiddenMarkup  : undefined,
      busConvFee:       session.type === "bus" ? (session as BusBookingSession).convFee       : undefined,
      flightAirline:    session.type === "flight" ? (session as FlightBookingSession).airline          : undefined,
      flightNumber:     session.type === "flight" ? (session as FlightBookingSession).flightNum        : undefined,
      flightFrom:       session.type === "flight" ? (session as FlightBookingSession).from             : undefined,
      flightTo:         session.type === "flight" ? (session as FlightBookingSession).to               : undefined,
      flightDeparture:  session.type === "flight" ? (session as FlightBookingSession).departure        : undefined,
      flightArrival:    session.type === "flight" ? (session as FlightBookingSession).arrival          : undefined,
      flightDuration:   session.type === "flight" ? (session as FlightBookingSession).duration         : undefined,
      flightBaseFare:   session.type === "flight" ? (session as FlightBookingSession).baseFare         : undefined,
      flightConvFee:    session.type === "flight" ? (session as FlightBookingSession).convFee          : undefined,
      flightBaggageKg:  session.type === "flight" ? (session as FlightBookingSession).extraBaggageKg   : undefined,
      flightBaggageCost:session.type === "flight" ? (session as FlightBookingSession).extraBaggageCost : undefined,
      discount:         discount || undefined,
    };
    const wTjResult = session.type === "flight" ? await attemptTjBook(session as FlightBookingSession) : undefined;
    if (wTjResult?.error) {
      creditWallet(user!.id, totalAfterCoupon, "Refund: airline booking failed");
      refreshUser();
      setWalletPaying(false);
      setPaymentError(`Booking failed: ${wTjResult.error}. Your wallet has been credited back ₹${totalAfterCoupon.toLocaleString("en-IN")}.`);
      toast({ variant: "destructive", title: "Booking Failed", description: wTjResult.error, duration: 8000 });
      return;
    }
    if (wTjResult?.pnr)          (wLastSuccessful as any).tjPnr        = wTjResult.pnr;
    if (wTjResult?.tjBookingRef) (wLastSuccessful as any).tjBookingRef = wTjResult.tjBookingRef;
    localStorage.setItem("lastSuccessfulBooking", JSON.stringify(wLastSuccessful));
    paymentDoneRef.current = true;
    clearBookingSession();
    refreshUser();
    setWalletPaying(false);
    toast({ title: "Booking Confirmed! 🎉", description: "Paid from wallet. Redirecting…" });
    notifyBookingSuccess({
      customerName:  session.type === "hotel" ? (session as HotelBookingSession).guest.name  : (session as any).passengers[0].name,
      customerEmail: session.type === "hotel" ? (session as HotelBookingSession).guest.email : (session as any).passengers[0].email,
      bookingType:   session.type,
      amount:        netPayable,
      reference:     wLastSuccessful.id,
      paymentMethod: "Wallet",
    });
    setTimeout(() => setLocation("/payment-success"), 800);
  }

  async function handlePay() {
    if (!session) return;
    setProcessing(true);
    setPaymentError(null);

    if (appliedCoupon?.firstTimeOnly) {
      const phone = session.type === "hotel" ? (session as HotelBookingSession).guest.phone : (session as any).passengers[0].phone;
      const check = checkFirstTimeUsage(appliedCoupon.code, phone);
      if (!check.ok) {
        setProcessing(false);
        toast({ variant: "destructive", title: check.error });
        return;
      }
    }

    if (creditApplied > 0 && netPayable === 0) {
      if (!user) { setProcessing(false); return; }
      const label = session.type === "hotel"
        ? `Hotel ${(session as HotelBookingSession).hotelName} (Travel Credits)`
        : `${session.type} booking (Travel Credits)`;
      const result = deductWallet(user.id, creditApplied, label);
      if (!result.ok) { setProcessing(false); setPaymentError("Insufficient Travel Credits."); return; }
      const bookingRef = `BK-${Date.now().toString(36).toUpperCase()}`;
      const paymentId  = `cred_${Date.now()}`;
      let booking: any;
      if (session.type === "flight") booking = buildFlightBooking(session as FlightBookingSession, paymentId, bookingRef, user.id);
      else if (session.type === "bus") booking = buildBusBooking(session as BusBookingSession, paymentId, bookingRef, user.id);
      else booking = buildHotelBooking(session as HotelBookingSession, paymentId, bookingRef, user.id);
      try {
        await createBooking.mutateAsync({ data: booking });
      } catch (err) {
        console.error("Booking save failed:", err);
        setProcessing(false);
        toast({ variant: "destructive", title: "Booking Failed", description: "Could not save your booking. Please contact support." });
        return;
      }
      if (appliedCoupon) {
        const phone = session.type === "hotel" ? (session as HotelBookingSession).guest.phone : (session as any).passengers[0].phone;
        apiRecordCouponUsage(appliedCoupon.code, phone);
      }
      if (user?.role === "staff") {
        const cCustName    = session.type === "hotel" ? (session as HotelBookingSession).guest.name : (session as any).passengers[0].name;
        const bookingProfit = (booking.details.markupAmount ?? booking.details.markup ?? 0)
                            + (booking.details.convenienceFee ?? booking.details.convenience_fee ?? 0);
        logStaffBooking({ staffId: user.id, staffName: user.name, bookingRef, type: session.type as any, amount: totalAfterCoupon, profit: bookingProfit, customerName: cCustName, date: new Date().toISOString() });
      }
      const cName  = session.type === "hotel" ? (session as HotelBookingSession).guest.name  : (session as any).passengers[0].name;
      const cEmail = session.type === "hotel" ? (session as HotelBookingSession).guest.email : (session as any).passengers[0].email;
      const cPhone = session.type === "hotel" ? (session as HotelBookingSession).guest.phone : (session as any).passengers[0].phone;
      const cLastSuccessful = {
        bookingId:      bookingRef,
        bookingType:    session.type as "flight" | "bus" | "hotel",
        passengerName:  cName  || "",
        passengerEmail: cEmail || "",
        passengerPhone: cPhone || "",
        passengers:     session.type === "hotel" ? (session as HotelBookingSession).guests : session.type === "bus" ? (session as BusBookingSession).seatCount : (session as FlightBookingSession).travelers,
        travelDate:     session.type === "hotel" ? (session as HotelBookingSession).checkin : session.date,
        totalAmount:    totalAfterCoupon,
        paymentId,
        paymentStatus:  "paid" as const,
        timestamp:      new Date().toISOString(),
        title: session.type === "flight"
          ? `${(session as FlightBookingSession).airline} · ${session.from} → ${session.to}`
          : session.type === "bus"
          ? `${(session as BusBookingSession).busName} · ${session.from} → ${session.to}`
          : `${(session as HotelBookingSession).hotelName}`,
        selectedSeats: session.type === "flight" ? (session as FlightBookingSession).selectedSeats : session.type === "bus" ? (session as BusBookingSession).selectedSeats.map(String) : undefined,
        roomType:     session.type === "hotel" ? (session as HotelBookingSession).roomType : undefined,
        checkoutDate: session.type === "hotel" ? (session as HotelBookingSession).checkout : undefined,
        hotelName:    session.type === "hotel" ? (session as HotelBookingSession).hotelName : undefined,
        hotelCity:    session.type === "hotel" ? (session as HotelBookingSession).city       : undefined,
        hotelNights:  session.type === "hotel" ? (session as HotelBookingSession).nights     : undefined,
        hotelRooms:   1,
        hotelAdults:  session.type === "hotel" ? (session as HotelBookingSession).guests     : undefined,
        busBoardingPoint: session.type === "bus" ? (session as BusBookingSession).boardingPoint : undefined,
        busDroppingPoint: session.type === "bus" ? (session as BusBookingSession).droppingPoint : undefined,
        busDeparture:     session.type === "bus" ? (session as BusBookingSession).departure     : undefined,
        busArrival:       session.type === "bus" ? (session as BusBookingSession).arrival       : undefined,
        busType:          session.type === "bus" ? (session as BusBookingSession).busType       : undefined,
        busOperator:      session.type === "bus" ? (session as BusBookingSession).operator      : undefined,
        busFrom:          session.type === "bus" ? (session as BusBookingSession).from          : undefined,
        busTo:            session.type === "bus" ? (session as BusBookingSession).to            : undefined,
        busBaseFare:      session.type === "bus" ? (session as BusBookingSession).baseFare      : undefined,
        busMarkup:        session.type === "bus" ? (session as BusBookingSession).hiddenMarkup  : undefined,
        busConvFee:       session.type === "bus" ? (session as BusBookingSession).convFee       : undefined,
        flightAirline:    session.type === "flight" ? (session as FlightBookingSession).airline          : undefined,
        flightNumber:     session.type === "flight" ? (session as FlightBookingSession).flightNum        : undefined,
        flightFrom:       session.type === "flight" ? (session as FlightBookingSession).from             : undefined,
        flightTo:         session.type === "flight" ? (session as FlightBookingSession).to               : undefined,
        flightDeparture:  session.type === "flight" ? (session as FlightBookingSession).departure        : undefined,
        flightArrival:    session.type === "flight" ? (session as FlightBookingSession).arrival          : undefined,
        flightDuration:   session.type === "flight" ? (session as FlightBookingSession).duration         : undefined,
        flightBaseFare:   session.type === "flight" ? (session as FlightBookingSession).baseFare         : undefined,
        flightConvFee:    session.type === "flight" ? (session as FlightBookingSession).convFee          : undefined,
        flightBaggageKg:  session.type === "flight" ? (session as FlightBookingSession).extraBaggageKg   : undefined,
        flightBaggageCost:session.type === "flight" ? (session as FlightBookingSession).extraBaggageCost : undefined,
        discount:         discount || undefined,
      };
      const cTjResult = session.type === "flight" ? await attemptTjBook(session as FlightBookingSession) : undefined;
      if (cTjResult?.error) {
        if (user) creditWallet(user.id, creditApplied, "Refund: airline booking failed");
        refreshUser();
        setProcessing(false);
        setPaymentError(`Booking failed: ${cTjResult.error}. Your Travel Credits have been refunded.`);
        toast({ variant: "destructive", title: "Booking Failed", description: cTjResult.error, duration: 8000 });
        return;
      }
      if (cTjResult?.pnr)          (cLastSuccessful as any).tjPnr        = cTjResult.pnr;
      if (cTjResult?.tjBookingRef) (cLastSuccessful as any).tjBookingRef = cTjResult.tjBookingRef;
      localStorage.setItem("lastSuccessfulBooking", JSON.stringify(cLastSuccessful));
      paymentDoneRef.current = true;
      clearBookingSession();
      refreshUser();
      setProcessing(false);
      toast({ title: "Booking Confirmed! 🎉", description: "Paid entirely with Travel Credits." });
      notifyBookingSuccess({
        customerName:  session.type === "hotel" ? (session as HotelBookingSession).guest.name  : (session as any).passengers[0].name,
        customerEmail: session.type === "hotel" ? (session as HotelBookingSession).guest.email : (session as any).passengers[0].email,
        bookingType:   session.type,
        amount:        netPayable,
        reference:     cLastSuccessful.id,
        paymentMethod: "Travel Credits",
      });
      setTimeout(() => setLocation("/payment-success"), 800);
      return;
    }

    if (creditApplied > 0 && user) {
      const result = deductWallet(user.id, creditApplied, "Partial Travel Credits");
      if (!result.ok) { setProcessing(false); setPaymentError("Insufficient Travel Credits."); return; }
      refreshUser();
    }

    const custName  = session.type === "hotel" ? (session as HotelBookingSession).guest.name  : (session as any).passengers[0].name;
    const custEmail = session.type === "hotel" ? (session as HotelBookingSession).guest.email : (session as any).passengers[0].email;
    const custPhone = session.type === "hotel" ? (session as HotelBookingSession).guest.phone : (session as any).passengers[0].phone;
    const desc = session.type === "flight"
      ? `Flight ${(session as FlightBookingSession).airline} · ${session.from}→${session.to}`
      : session.type === "bus"
      ? `Bus ${(session as BusBookingSession).busName} · ${session.from}→${session.to}`
      : `Hotel ${(session as HotelBookingSession).hotelName}`;

    openRazorpayCheckout({
      amount: netPayable,
      name:   custName  || "Customer",
      email:  custEmail || "",
      phone:  custPhone || "",
      description: desc,

      onSuccess: async (paymentId, orderId, signature) => {
        const bookingRef = `BK-${Date.now().toString(36).toUpperCase()}`;

        // Verify payment signature for all booking types
        const verify = await verifyRazorpayPayment(paymentId, orderId, signature, {
          bookingId:     bookingRef,
          passengerName: custName,
          phone:         custPhone || "",
          from:          (session as any).from,
          to:            (session as any).to,
          date:          session.type === "hotel" ? (session as HotelBookingSession).checkin : session.date,
          amount:        totalAfterCoupon,
          airline:       session.type === "flight" ? (session as FlightBookingSession).airline   : undefined,
          flightNum:     session.type === "flight" ? (session as FlightBookingSession).flightNum : undefined,
        });
        if (!verify.success) {
          setProcessing(false);
          setPaymentError("Payment verification failed. Please contact support.");
          return;
        }

        let bookingUserId = user?.id || "guest";
        if (!isAuthenticated) {
          try {
            const result = await autoLoginOrRegister(custName, custEmail, custPhone);
            bookingUserId = result.user.id;
            if (result.isNew) {
              toast({ title: "Account Created! 🎉", description: `Welcome ${result.user.name}! Password: ${result.generatedPassword}`, duration: 8000 });
            } else {
              toast({ title: `Welcome back, ${result.user.name}!`, description: "You've been logged in automatically." });
            }
          } catch { bookingUserId = user?.id || "guest"; }
        }

        // ── Flight: one backend call handles TJ booking + DB save + auto-refund ──
        let flightBookResult: {
          success: boolean; duplicate?: boolean;
          status?: "confirmed" | "pending";
          pnr?: string; tjBookingRef?: string;
          error?: string; refundInitiated?: boolean;
        } | null = null;

        if (session.type === "flight") {
          const fs = session as FlightBookingSession;
          // Build the full details blob (same shape as before, for the DB record)
          const flightMeta = buildFlightBooking(fs, paymentId, bookingRef, bookingUserId);

          // Pull fareData from sessionStorage (set during farequote step)
          let traceId: string | undefined;
          let resultIndex: string | undefined;
          let fqData: any = null;
          try {
            const fqStr = sessionStorage.getItem("ww_tj_farequote");
            if (fqStr) {
              fqData = JSON.parse(fqStr);
              traceId = fqData?.data?.traceId ?? fqData?.traceId ?? undefined;
              // Try several paths for resultIndex in the fareQuote response
              resultIndex = fqData?.data?.results?.[0]?.resultIndex
                         ?? fqData?.data?.resultIndex
                         ?? undefined;
            }
          } catch { /* use undefined */ }

          // ww_tj_farequote_key is the original resultIndex/priceId stored reliably at
          // fare-selection time — use it as the authoritative resultIndex for the backend's
          // fareQuote-refresh step (it's the value TripJack needs to re-create the session).
          const fareKey = sessionStorage.getItem("ww_tj_farequote_key") ?? undefined;
          if (!resultIndex && fareKey) resultIndex = fareKey;

          // bookingId from sessionStorage → fallback to session object → "" for non-TJ fares
          const tjBookingId = sessionStorage.getItem("ww_tj_booking_id")
                           ?? fs.tjBookingId
                           ?? "";
          const isTjFare = sessionStorage.getItem("ww_is_tj_fare") !== "0";

          console.info(
            "[book-flight] bookingId:", tjBookingId || "(non-TJ fare)",
            "| traceId:", traceId ?? "(none)",
            "| resultIndex:", resultIndex ?? "(none)",
            "| fareKey:", fareKey ?? "(none)",
            "| isTjFare:", isTjFare,
          );

          // Guard: reject stale fallback fare data — fare was never verified
          if (isTjFare && fqData?.fallback) {
            setProcessing(false);
            setPaymentError("Invalid booking session: fare not verified. Please select your flight again.");
            toast({ variant: "destructive", title: "Invalid Booking Session", description: "Please go back and select your flight again.", duration: 8000 });
            return;
          }

          // Guard: TJ fare bookingId must be present (session may have expired)
          if (isTjFare && !tjBookingId) {
            setProcessing(false);
            setPaymentError("Session expired. Please select your flight again to continue.");
            toast({ variant: "destructive", title: "Session Expired", description: "Please go back and select your flight again." });
            return;
          }

          try {
            const apiRes = await fetch("/api/book-flight", {
              method:  "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                paymentId,
                orderId,
                signature,
                amount:   totalAfterCoupon,
                fareData: { bookingId: tjBookingId, traceId, resultIndex, fare: totalAfterCoupon },
                passengers: fs.passengers.map((p, idx) => ({
                  name:        p.name,
                  email:       p.email,
                  phone:       p.phone,
                  gender:      p.gender,
                  seatCode:    fs.selectedSeats[idx] || undefined,
                  baggageCode: fs.extraBaggageCode   || undefined,
                })),
                bookingMeta: {
                  bookingRef,
                  passengerName:  flightMeta.passengerName,
                  passengerEmail: flightMeta.passengerEmail,
                  passengerPhone: flightMeta.passengerPhone,
                  travelDate:     flightMeta.travelDate,
                  totalPrice:     totalAfterCoupon,
                  details:        flightMeta.details,
                },
              }),
            });
            flightBookResult = await apiRes.json();
          } catch {
            flightBookResult = { success: false, error: "Could not reach booking server." };
          }

          sessionStorage.removeItem("ww_tj_booking_id");

          if (!flightBookResult?.success && !flightBookResult?.duplicate) {
            setProcessing(false);
            const refundMsg = flightBookResult?.refundInitiated
              ? `Booking failed: ${flightBookResult?.error}. Refund initiated — allow 5–7 business days. Payment ID: ${paymentId}`
              : `Booking failed: ${flightBookResult?.error}. Please contact support for a refund. Payment ID: ${paymentId}`;
            setPaymentError(refundMsg);
            toast({ variant: "destructive", title: "Booking Failed", description: flightBookResult?.error, duration: 8000 });
            return;
          }
        } else if (session.type === "bus") {
          // ── Bus: save to DB ────────────────────────────────────────────────
          const busBooking = buildBusBooking(session as BusBookingSession, paymentId, bookingRef, bookingUserId);
          try {
            await createBooking.mutateAsync({ data: busBooking });
          } catch (err) {
            console.error("Booking save failed:", err);
            const refundResult = await attemptRefund(paymentId, totalAfterCoupon, "booking_save_failed");
            setProcessing(false);
            const refundMsg = refundResult.initiated
              ? `Payment successful but booking failed. Refund initiated — allow 5–7 business days. Payment ID: ${paymentId}`
              : `Payment successful but booking failed. Refund will be processed manually. Payment ID: ${paymentId} — please contact support.`;
            setPaymentError(refundMsg);
            toast({ title: "Refund Initiated", description: `₹${totalAfterCoupon.toLocaleString("en-IN")} will be refunded to your account.`, duration: 12000 });
            return;
          }
        } else {
          // ── Hotel: confirm with HotelBeds (if rateKey present) then save to DB
          const hs = session as HotelBookingSession;
          const hotelBooking = buildHotelBooking(hs, paymentId, bookingRef, bookingUserId);

          if (hs.rateKey) {
            try {
              const hbRes = await fetch("/api/hotels/book", {
                method:  "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  rateKey:      hs.rateKey,
                  hotelId:      parseInt(hs.hotelId),
                  hotelName:    hs.hotelName,
                  holder: {
                    name:    hs.holderFirstName || hs.guest.name.split(" ")[0] || hs.guest.name,
                    surname: hs.holderLastName  || hs.guest.name.split(" ").slice(1).join(" ") || ".",
                  },
                  paxes: [{
                    roomId: 1, type: "AD",
                    name:    hs.holderFirstName || hs.guest.name.split(" ")[0] || hs.guest.name,
                    surname: hs.holderLastName  || hs.guest.name.split(" ").slice(1).join(" ") || ".",
                  }],
                  contactEmail: hs.guest.email,
                  contactPhone: hs.guest.phone,
                }),
              });
              const hbData = await hbRes.json().catch(() => ({}));
              if (!hbRes.ok) {
                const refundResult = await attemptRefund(paymentId, totalAfterCoupon, "hotelbeds_booking_failed");
                setProcessing(false);
                const refundMsg = refundResult.initiated
                  ? `Hotel booking failed: ${hbData.error || "Could not confirm with hotel"}. Refund initiated — allow 5–7 business days. Payment ID: ${paymentId}`
                  : `Hotel booking failed. Refund will be processed manually. Payment ID: ${paymentId} — please contact support.`;
                setPaymentError(refundMsg);
                toast({ variant: "destructive", title: "Hotel Booking Failed", description: hbData.error || "Could not confirm with hotel. Refund initiated.", duration: 8000 });
                return;
              }
              const hbRef = hbData?.booking?.reference || hbData?.booking?.bookingReference || hbData?.booking?.clientReference;
              if (hbRef) (hotelBooking as any).details.hbBookingRef = hbRef;
            } catch {
              const refundResult = await attemptRefund(paymentId, totalAfterCoupon, "hotelbeds_booking_network_error");
              setProcessing(false);
              const refundMsg = refundResult.initiated
                ? `Hotel booking failed (network error). Refund initiated — allow 5–7 business days. Payment ID: ${paymentId}`
                : `Hotel booking failed. Refund will be processed manually. Payment ID: ${paymentId} — please contact support.`;
              setPaymentError(refundMsg);
              toast({ variant: "destructive", title: "Hotel Booking Failed", description: "Network error during hotel confirmation.", duration: 8000 });
              return;
            }
          }

          try {
            await createBooking.mutateAsync({ data: hotelBooking });
          } catch (err) {
            console.error("Booking save failed:", err);
            const refundResult = await attemptRefund(paymentId, totalAfterCoupon, "booking_save_failed");
            setProcessing(false);
            const refundMsg = refundResult.initiated
              ? `Payment successful but booking failed to save. Refund initiated — allow 5–7 business days. Payment ID: ${paymentId}`
              : `Payment successful but booking failed. Refund will be processed manually. Payment ID: ${paymentId} — please contact support.`;
            setPaymentError(refundMsg);
            toast({ title: "Refund Initiated", description: `₹${totalAfterCoupon.toLocaleString("en-IN")} will be refunded to your account.`, duration: 12000 });
            return;
          }
        }

        if (appliedCoupon) apiRecordCouponUsage(appliedCoupon.code, custPhone);
        convertLeadToBooked(custPhone, session.type, bookingRef);

        // Push notification: booking confirmation
        if (pushEnabled) {
          const route = session.type === "hotel"
            ? (session as HotelBookingSession).hotelName
            : `${session.from} → ${session.to}`;
          const fcmToken = localStorage.getItem("ww_fcm_token");
          if (fcmToken) {
            fetch(`${(import.meta.env.BASE_URL ?? "").replace(/\/$/, "")}/api/push/send-booking-confirmation`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token: fcmToken, bookingId: bookingRef, route, amount: totalAfterCoupon }),
            }).catch(() => {});
          }
        }

        if (user?.role === "staff") {
          const rzBookingProfit = (booking.details.markupAmount ?? booking.details.markup ?? 0)
                                + (booking.details.convenienceFee ?? booking.details.convenience_fee ?? 0);
          logStaffBooking({
            staffId:      user.id,
            staffName:    user.name,
            bookingRef,
            type:         session.type as "flight" | "bus" | "hotel",
            amount:       totalAfterCoupon,
            profit:       rzBookingProfit,
            customerName: custName,
            date:         new Date().toISOString(),
          });
        }

        // Save booking details for payment-success page + invoice
        const lastSuccessful = {
          bookingId:      bookingRef,
          bookingType:    session.type as "flight" | "bus" | "hotel",
          passengerName:  custName  || "",
          passengerEmail: custEmail || "",
          passengerPhone: custPhone || "",
          passengers:     session.type === "hotel"
            ? (session as HotelBookingSession).guests
            : session.type === "bus"
            ? (session as BusBookingSession).seatCount
            : (session as FlightBookingSession).travelers,
          travelDate:  session.type === "hotel" ? (session as HotelBookingSession).checkin : session.date,
          totalAmount: totalAfterCoupon,
          paymentId,
          paymentStatus: "paid" as const,
          timestamp:     new Date().toISOString(),
          title: session.type === "flight"
            ? `${(session as FlightBookingSession).airline} · ${session.from} → ${session.to}`
            : session.type === "bus"
            ? `${(session as BusBookingSession).busName} · ${session.from} → ${session.to}`
            : `${(session as HotelBookingSession).hotelName}`,
          selectedSeats: session.type === "flight"
            ? (session as FlightBookingSession).selectedSeats
            : session.type === "bus"
            ? (session as BusBookingSession).selectedSeats.map(String)
            : undefined,
          roomType:     session.type === "hotel" ? (session as HotelBookingSession).roomType : undefined,
          checkoutDate: session.type === "hotel" ? (session as HotelBookingSession).checkout : undefined,
          hotelName:    session.type === "hotel" ? (session as HotelBookingSession).hotelName : undefined,
          hotelCity:    session.type === "hotel" ? (session as HotelBookingSession).city       : undefined,
          hotelNights:  session.type === "hotel" ? (session as HotelBookingSession).nights     : undefined,
          hotelRooms:   1,
          hotelAdults:  session.type === "hotel" ? (session as HotelBookingSession).guests     : undefined,
          // Bus-specific details
          busBoardingPoint: session.type === "bus" ? (session as BusBookingSession).boardingPoint : undefined,
          busDroppingPoint: session.type === "bus" ? (session as BusBookingSession).droppingPoint : undefined,
          busDeparture:     session.type === "bus" ? (session as BusBookingSession).departure     : undefined,
          busArrival:       session.type === "bus" ? (session as BusBookingSession).arrival       : undefined,
          busType:          session.type === "bus" ? (session as BusBookingSession).busType       : undefined,
          busOperator:      session.type === "bus" ? (session as BusBookingSession).operator      : undefined,
          busFrom:          session.type === "bus" ? (session as BusBookingSession).from          : undefined,
          busTo:            session.type === "bus" ? (session as BusBookingSession).to            : undefined,
          busBaseFare:      session.type === "bus" ? (session as BusBookingSession).baseFare      : undefined,
          busMarkup:        session.type === "bus" ? (session as BusBookingSession).hiddenMarkup  : undefined,
          busConvFee:       session.type === "bus" ? (session as BusBookingSession).convFee       : undefined,
          // Flight-specific details
          flightAirline:    session.type === "flight" ? (session as FlightBookingSession).airline          : undefined,
          flightNumber:     session.type === "flight" ? (session as FlightBookingSession).flightNum        : undefined,
          flightFrom:       session.type === "flight" ? (session as FlightBookingSession).from             : undefined,
          flightTo:         session.type === "flight" ? (session as FlightBookingSession).to               : undefined,
          flightDeparture:  session.type === "flight" ? (session as FlightBookingSession).departure        : undefined,
          flightArrival:    session.type === "flight" ? (session as FlightBookingSession).arrival          : undefined,
          flightDuration:   session.type === "flight" ? (session as FlightBookingSession).duration         : undefined,
          flightBaseFare:   session.type === "flight" ? (session as FlightBookingSession).baseFare         : undefined,
          flightConvFee:    session.type === "flight" ? (session as FlightBookingSession).convFee          : undefined,
          flightBaggageKg:  session.type === "flight" ? (session as FlightBookingSession).extraBaggageKg   : undefined,
          flightBaggageCost:session.type === "flight" ? (session as FlightBookingSession).extraBaggageCost : undefined,
        };
        // PNR, TJ booking ref and status come from the backend response (flight only)
        if (flightBookResult?.pnr)          (lastSuccessful as any).tjPnr          = flightBookResult.pnr;
        if (flightBookResult?.tjBookingRef) (lastSuccessful as any).tjBookingRef   = flightBookResult.tjBookingRef;
        if (flightBookResult?.status)       (lastSuccessful as any).tjBookingStatus = flightBookResult.status;
        localStorage.setItem("lastSuccessfulBooking", JSON.stringify(lastSuccessful));
        paymentDoneRef.current = true;
        clearBookingSession();
        refreshUser();
        setProcessing(false);
        const isPending = flightBookResult?.status === "pending";
        toast({
          title:       isPending ? "Booking Submitted ✓" : "Booking Confirmed! 🎉",
          description: isPending
            ? "Payment received. Awaiting airline confirmation — we'll update your PNR shortly."
            : "Payment successful. Redirecting…",
        });
        notifyBookingSuccess({
          customerName:  custName,
          customerEmail: custEmail,
          bookingType:   session.type,
          amount:        netPayable,
          reference:     lastSuccessful.id,
          paymentMethod: "Razorpay",
        });
        setTimeout(() => setLocation("/payment-success"), 800);
      },

      onFailure: (message) => {
        setProcessing(false);
        const isCancelled = message === "Payment was cancelled.";

        // Record actual failures (not simple modal dismissals) in DB for admin visibility
        if (!isCancelled && session) {
          const _custName  = session.type === "hotel"
            ? (session as HotelBookingSession).guest.name
            : (session as any).passengers?.[0]?.name  || "";
          const _custEmail = session.type === "hotel"
            ? (session as HotelBookingSession).guest.email
            : (session as any).passengers?.[0]?.email || "";
          const _custPhone = session.type === "hotel"
            ? (session as HotelBookingSession).guest.phone
            : (session as any).passengers?.[0]?.phone || "";
          const _failRef = `FAIL-${Date.now().toString(36).toUpperCase()}`;
          const _travelDate = session.type === "hotel"
            ? (session as HotelBookingSession).checkin
            : (session as any).date || new Date().toISOString().split("T")[0];
          const _paxCount = session.type === "hotel"
            ? (session as HotelBookingSession).guests
            : session.type === "bus"
            ? (session as BusBookingSession).seatCount
            : (session as FlightBookingSession).travelers;

          fetch("/api/bookings/record-failed", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              bookingRef:     _failRef,
              bookingType:    session.type,
              passengerName:  _custName,
              passengerEmail: _custEmail,
              passengerPhone: _custPhone,
              totalPrice:     totalAfterCoupon,
              travelDate:     _travelDate,
              passengers:     _paxCount,
              failureReason:  message,
              failureCode:    "payment_failed",
              details: {
                from:          (session as any).from,
                to:            (session as any).to,
                failureReason: message,
              },
            }),
          }).catch((e) => console.warn("[payment] could not save failed payment record:", e));

          setPaymentError(message || "Payment failed. Please try again.");
          toast({ variant: "destructive", title: "Payment Failed", description: message });
        }
        // If cancelled (modal dismissed) — silently reset, no error shown
      },

      onDismiss: () => { setProcessing(false); },
    });
  }

  if (!session) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      </Layout>
    );
  }

  const accentColor = session.type === "bus" ? "orange" : "blue";
  const gradientClass = session.type === "bus"
    ? "from-orange-600 to-pink-700"
    : "from-blue-700 to-indigo-800";

  return (
    <Layout>
      {/* Header */}
      <div className={cn("bg-gradient-to-r text-white", gradientClass)}>
        <div className="container mx-auto px-4 py-5">
          <button
            onClick={() => window.history.back()}
            className="flex items-center gap-1.5 text-white/70 hover:text-white text-sm mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to details
          </button>

          <div className="flex items-center gap-2 text-sm mb-5">
            {["Search", "Details", "Payment"].map((step, i) => (
              <div key={step} className="flex items-center gap-2">
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2",
                  i === 2 ? "bg-white text-blue-700 border-white"
                  : "bg-white/30 border-white/50 text-white"
                )}>
                  {i < 2 ? <CheckCircle2 className="w-3.5 h-3.5" /> : "3"}
                </div>
                <span className={cn("hidden sm:inline text-sm", i === 2 ? "font-bold" : "text-white/60")}>{step}</span>
                {i < 2 && <ChevronRight className="w-4 h-4 text-white/50" />}
              </div>
            ))}
          </div>

          <h1 className="text-2xl font-extrabold">Payment</h1>
          <p className="text-white/70 text-sm mt-0.5">Review your booking and complete payment</p>
        </div>
      </div>

      <div className="bg-slate-50 min-h-screen">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col lg:flex-row gap-6">

            {/* Left: Booking summary */}
            <div className="flex-1 min-w-0 space-y-5">
              {session.type === "flight" && <FlightSummary s={session as FlightBookingSession} />}
              {session.type === "bus"    && <BusSummary    s={session as BusBookingSession} />}
              {session.type === "hotel"  && <HotelSummary  s={session as HotelBookingSession} />}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {[
                  { icon: ShieldCheck, text: "Secure Payment",       color: "text-green-600 bg-green-50"   },
                  { icon: CheckCircle2,text: "Instant Confirmation",  color: "text-blue-600 bg-blue-50"     },
                  { icon: Award,       text: "Trusted Platform",      color: "text-purple-600 bg-purple-50" },
                  { icon: Headphones,  text: "24/7 Support",          color: "text-orange-600 bg-orange-50" },
                ].map(({ icon: Icon, text, color }) => (
                  <div key={text} className="flex flex-col items-center gap-1.5 p-3 bg-white rounded-xl border text-center shadow-sm hover:shadow-md transition-shadow">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <p className="text-[11px] font-semibold text-slate-600 leading-tight">{text}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Payment panel */}
            <div className="w-full lg:w-80 shrink-0">
              <div className="sticky top-4 space-y-4">
                <Card className="shadow-sm border">
                  <CardHeader className="pb-3 pt-5 px-5">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">Order Summary</CardTitle>
                      {session?.type === "flight" && (session as any).lockedTotalPrice && (
                        <span className="flex items-center gap-1 text-[10px] font-semibold text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
                          <ShieldCheck className="w-3 h-3" /> Price Confirmed
                        </span>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="px-5 pb-5 space-y-4">

                    {/* Itemized price breakdown */}
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Receipt className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Price Breakdown</span>
                      </div>
                      {session && (() => {
                        const pax = session.type === "flight" ? session.travelers
                          : session.type === "bus" ? session.seatCount
                          : 1;
                        const baseFareTotal = session.baseFare * (session.type === "hotel" ? 1 : pax);
                        const convFeeTotal  = session.convFee  * (session.type === "hotel" ? 1 : pax);
                        const seatAddOn     = session.type === "flight" ? ((session as any).seatAddOnPrice    ?? 0) : 0;
                        const baggageAddOn  = session.type === "flight" ? ((session as any).baggageAddOnPrice ?? 0) : 0;
                        return (
                          <>
                            <div className="flex justify-between text-slate-600">
                              <span>
                                Base fare
                                {pax > 1 && <span className="text-muted-foreground ml-1 text-xs">× {pax}</span>}
                              </span>
                              <span className="font-medium tabular-nums">₹{baseFareTotal.toLocaleString("en-IN")}</span>
                            </div>
                            {convFeeTotal > 0 && (
                              <div className="flex justify-between text-slate-600">
                                <span>Convenience fee</span>
                                <span className="font-medium tabular-nums">+₹{convFeeTotal.toLocaleString("en-IN")}</span>
                              </div>
                            )}
                            {seatAddOn > 0 && (
                              <div className="flex justify-between text-slate-600">
                                <span>Seat charges</span>
                                <span className="font-medium tabular-nums">+₹{seatAddOn.toLocaleString("en-IN")}</span>
                              </div>
                            )}
                            {baggageAddOn > 0 && (
                              <div className="flex justify-between text-slate-600">
                                <span>Baggage charges</span>
                                <span className="font-medium tabular-nums">+₹{baggageAddOn.toLocaleString("en-IN")}</span>
                              </div>
                            )}
                          </>
                        );
                      })()}
                      <div className="flex justify-between font-semibold text-slate-700 pt-1.5 border-t border-dashed">
                        <span>Booking total</span>
                        <span className="tabular-nums">₹{totalBase.toLocaleString("en-IN")}</span>
                      </div>
                      {discount > 0 && (
                        <div className="flex justify-between text-green-600 font-medium">
                          <span className="flex items-center gap-1">
                            <Tag className="w-3 h-3" />
                            Coupon {appliedCoupon?.code && <span className="text-[10px] bg-green-100 rounded px-1">{appliedCoupon.code}</span>}
                          </span>
                          <span className="tabular-nums">−₹{discount.toLocaleString("en-IN")}</span>
                        </div>
                      )}
                      {creditApplied > 0 && (
                        <div className="flex justify-between text-amber-600 font-medium">
                          <span>Travel Credits</span>
                          <span className="tabular-nums">−₹{creditApplied.toLocaleString("en-IN")}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-extrabold text-lg pt-2 border-t border-dashed text-slate-900">
                        <span>Total Payable</span>
                        <span className="text-blue-700 tabular-nums">₹{netPayable.toLocaleString("en-IN")}</span>
                      </div>
                    </div>

                    {/* Coupon */}
                    <div className="space-y-3 pt-3 border-t">
                      <AvailableCoupons
                        bookingAmount={totalBase}
                        context={couponContext}
                        onApply={(code) => applyCoupon(code)}
                        appliedCode={appliedCoupon?.code}
                        coupons={allCoupons}
                        usageRecords={couponUsageRecs}
                      />
                      <label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5" /> Have a coupon?
                      </label>
                      <div className="flex gap-2">
                        <Input
                          placeholder="Enter code"
                          value={couponInput}
                          onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                          disabled={couponStatus === "valid"}
                          className="h-9 text-sm"
                        />
                        {couponStatus === "valid" ? (
                          <Button variant="outline" size="sm" onClick={removeCoupon} className="h-9 shrink-0">
                            <XCircle className="w-4 h-4" />
                          </Button>
                        ) : (
                          <Button variant="outline" size="sm" onClick={() => applyCoupon()} className="h-9 shrink-0">Apply</Button>
                        )}
                      </div>
                      {couponStatus === "valid" && (
                        <p className="text-xs text-green-600 flex items-center gap-1 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Coupon applied! ₹{discount.toLocaleString("en-IN")} off
                        </p>
                      )}
                      {couponStatus === "invalid" && (
                        <p className="text-xs text-red-500 flex items-center gap-1">
                          <XCircle className="w-3.5 h-3.5" /> {couponError || "Invalid coupon code"}
                        </p>
                      )}
                    </div>

                    {/* Travel Credits */}
                    {canUseCredits && (
                      <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 space-y-2">
                        <div className="flex items-center justify-between">
                          <label htmlFor="use-credits" className="flex items-center gap-2 cursor-pointer">
                            <Wallet className="w-4 h-4 text-amber-600" />
                            <span className="text-sm font-semibold text-amber-800">Travel Credits</span>
                          </label>
                          <input
                            id="use-credits"
                            type="checkbox"
                            checked={useCredits}
                            onChange={(e) => setUseCredits(e.target.checked)}
                            className="w-4 h-4 accent-amber-500 cursor-pointer"
                          />
                        </div>
                        <div className="flex justify-between text-xs text-amber-700">
                          <span>Available</span>
                          <span className="font-bold">₹{walletBalance.toLocaleString("en-IN")}</span>
                        </div>
                        {useCredits && (
                          <p className="text-xs text-amber-600">
                            ₹{creditApplied.toLocaleString("en-IN")} will be used
                            {netPayable > 0 ? `, pay ₹${netPayable.toLocaleString("en-IN")} via Razorpay` : " — no additional payment needed!"}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Wallet pay for agents */}
                    {canPayByWallet && (
                      <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-blue-700">Wallet Balance</span>
                          <span className="text-sm font-bold text-blue-800">₹{walletBalance.toLocaleString("en-IN")}</span>
                        </div>
                        <Button
                          size="sm"
                          onClick={handleWalletPay}
                          disabled={walletPaying || processing}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold gap-1.5"
                        >
                          {walletPaying
                            ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</>
                            : <><Wallet className="w-4 h-4" /> Pay ₹{totalAfterCoupon.toLocaleString("en-IN")} with Wallet</>
                          }
                        </Button>
                      </div>
                    )}

                    {/* Payment error */}
                    {paymentError && (
                      <Alert className="border-red-200 bg-red-50 py-2">
                        <AlertCircle className="h-4 w-4 text-red-500" />
                        <AlertDescription className="text-red-700 text-xs">{paymentError}</AlertDescription>
                      </Alert>
                    )}

                    {/* Pay button */}
                    <Button
                      size="lg"
                      onClick={handlePay}
                      disabled={processing}
                      className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold h-12 text-base gap-2 shadow-md"
                    >
                      {processing
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Opening Payment…</>
                        : <><CreditCard className="w-4 h-4" />
                            {netPayable === 0 ? "Confirm Booking (Free)" : `Pay ₹${netPayable.toLocaleString("en-IN")}`}
                          </>
                      }
                    </Button>

                    <div className="flex items-center justify-center gap-2">
                      <span className="text-[10px] text-muted-foreground">Secured by</span>
                      <span className="text-[11px] font-bold text-blue-600">Razorpay</span>
                      <span className="text-[10px]">🔒</span>
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
