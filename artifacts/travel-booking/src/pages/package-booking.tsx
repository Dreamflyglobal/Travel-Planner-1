import { useState, useMemo } from "react";
import { deductWallet } from "@/lib/wallet";
import { autoSaveLead, convertLeadToBooked } from "@/lib/crm";
import { useLocation, useSearch } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, MapPin, Clock, Users, CheckCircle2, Tag, Loader2, ShieldCheck, Wallet, XCircle,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { getConvenienceFee, getHiddenMarkupAmount, getAgentEffectiveMarkup, getAgentCommissionAmount } from "@/lib/pricing";
import { validateCoupon, recordCouponUsage, type Coupon } from "@/lib/coupon";
import { AvailableCoupons } from "@/components/available-coupons";

const STEPS = ["Search", "Details", "Booking", "Payment"];

export default function PackageBooking() {
  const [, setLocation] = useLocation();
  const { toast }       = useToast();
  const { user, isAgent, refreshUser } = useAuth();
  const search          = useSearch();
  const params          = new URLSearchParams(search);

  const pkgId    = params.get("pkgId") || "";
  const pkgName  = params.get("name") || "Holiday Package";
  const pkgDest  = params.get("dest") || "";
  const pkgDur   = params.get("duration") || "";
  const pkgImg   = params.get("img") || "";
  const rawPrice = parseInt(params.get("price") || "0", 10);
  const people   = parseInt(params.get("people") || "2", 10);

  // Apply admin hidden markup (absorbed into base, never shown separately)
  const agentMarkupFlat = isAgent && user?.agentMarkup != null ? user.agentMarkup : null;
  const effectiveMarkupPP = agentMarkupFlat != null
    ? getAgentEffectiveMarkup(rawPrice, "packages", agentMarkupFlat)
    : getHiddenMarkupAmount(rawPrice, "packages");
  const displayedPPP = rawPrice + effectiveMarkupPP;
  const baseTotal    = displayedPPP * people;

  // Commission for agents (shown to agent in summary)
  const hiddenMarkupPP = getHiddenMarkupAmount(rawPrice, "packages");
  const commissionTotal = isAgent && agentMarkupFlat != null
    ? Math.max(0, hiddenMarkupPP - agentMarkupFlat) * people
    : 0;

  // Convenience fee with correct service type
  const convFeePerPerson = getConvenienceFee(rawPrice, "packages");
  const convFee = convFeePerPerson * people;

  // Form
  const [name,    setName]    = useState(user?.name  || "");
  const [email,   setEmail]   = useState(user?.email || "");
  const [phone,   setPhone]   = useState("");
  const [gender,  setGender]  = useState("male");
  const [errors,  setErrors]  = useState<Record<string, string>>({});

  // Coupon
  const [couponCode,    setCouponCode]    = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [discountAmt,   setDiscountAmt]   = useState(0);
  const [couponStatus,  setCouponStatus]  = useState<"idle" | "valid" | "invalid">("idle");
  const [couponError,   setCouponError]   = useState("");
  const subTotal     = baseTotal - discountAmt;
  const finalTotal   = subTotal + convFee;

  const couponContext = useMemo(() => {
    const userPhone = phone || user?.phone || "";
    let userBookingsCount = 0;
    try {
      const stored = JSON.parse(localStorage.getItem("travel_bookings") ?? "[]");
      const session = JSON.parse(localStorage.getItem("msw_mock_bookings") ?? "[]");
      if (user?.id) userBookingsCount = [...stored, ...session].filter((b: any) => b.userId === user.id).length;
    } catch {}
    return { phone: userPhone, userBookingsCount, service_type: "holiday" as const };
  }, [user, phone]);

  const [paying,       setPaying]       = useState(false);
  const [paid,         setPaid]         = useState(false);
  const [walletPaying, setWalletPaying] = useState(false);
  const [useCredits,   setUseCredits]   = useState(false);

  const walletBalance  = user?.walletBalance ?? 0;
  const canPayByWallet = isAgent && !!user && walletBalance >= finalTotal;
  const canUseCredits  = user?.role === "user" && !!user && walletBalance > 0;
  const creditApplied  = useCredits && canUseCredits ? Math.min(walletBalance, finalTotal) : 0;
  const netPayable     = finalTotal - creditApplied;

  function applyCoupon(codeOverride?: string) {
    const code = (codeOverride ?? couponCode).toUpperCase().trim();
    if (!code) return;
    if (codeOverride) setCouponCode(codeOverride);
    const result = validateCoupon(code, baseTotal + convFee, couponContext);
    if (result.ok) {
      setAppliedCoupon(result.coupon);
      setDiscountAmt(result.discountAmount);
      setCouponStatus("valid");
      setCouponError("");
      toast({ title: "Coupon applied!", description: `₹${result.discountAmount.toLocaleString("en-IN")} off` });
    } else {
      setAppliedCoupon(null);
      setDiscountAmt(0);
      setCouponStatus("invalid");
      setCouponError(result.error);
      toast({ variant: "destructive", title: result.error });
    }
  }

  function removeCoupon() {
    setAppliedCoupon(null);
    setDiscountAmt(0);
    setCouponCode("");
    setCouponStatus("idle");
    setCouponError("");
  }

  function validate() {
    const errs: Record<string, string> = {};
    if (!name.trim() || name.trim().length < 2) errs.name  = "Name must be at least 2 characters";
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) errs.email = "Valid email required";
    if (!phone.trim() || !/^\d{10}$/.test(phone.replace(/\D/g, ""))) errs.phone = "Valid 10-digit mobile required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleWalletPay() {
    if (!validate() || !user) return;
    autoSaveLead(name.trim(), phone.trim(), "holiday", email.trim());
    setWalletPaying(true);
    const result = deductWallet(user.id, finalTotal, `Package booking ${pkgName} · ${pkgDest}`);
    if (!result.ok) {
      setWalletPaying(false);
      toast({ variant: "destructive", title: "Insufficient wallet balance" });
      return;
    }
    const bookingData = {
      bookingType: "holiday",
      referenceId: Date.now(),
      title: `${pkgName} · ${pkgDest}`,
      passengerName: name.trim(), passengerEmail: email.trim(), passengerPhone: phone.trim(),
      passengers: people,
      travelDate: new Date().toISOString().split("T")[0],
      details: {
        type: "holiday", status: "paid",
        userId: user.id,
        customerName: name.trim(), customerEmail: email.trim(), customerPhone: phone.trim(),
        customerGender: gender,
        packageId: pkgId, packageName: pkgName, destination: pkgDest, duration: pkgDur,
        people, pricePerPerson: displayedPPP, baseTotal, coupon: appliedCoupon,
        discountAmount: discountAmt, subTotal, convenienceFee: convFee,
        totalPrice: finalTotal, imageUrl: pkgImg,
        paymentMethod: "wallet", paymentId: `wallet_${Date.now()}`,
      },
    };
    try {
      const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
      const res  = await fetch(`${BASE}/api/bookings`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bookingData),
      });
      const data = await res.json();
      convertLeadToBooked(phone.trim(), "holiday");
      if (appliedCoupon) recordCouponUsage(appliedCoupon.code, phone.trim());
      setPaid(true);
      refreshUser();
      toast({ title: "Booking Confirmed!", description: `Paid from wallet. Booking ID: ${data.bookingId || data.id}` });
    } catch {
      toast({ title: "Booking failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setWalletPaying(false);
    }
  }

  async function handlePay() {
    if (!validate()) return;
    autoSaveLead(name.trim(), phone.trim(), "holiday", email.trim());
    setPaying(true);

    // Deduct Travel Credits before booking
    if (creditApplied > 0 && user) {
      const result = deductWallet(user.id, creditApplied, `Package booking ${pkgName} · ${pkgDest} (Travel Credits)`);
      if (!result.ok) {
        setPaying(false);
        toast({ variant: "destructive", title: "Insufficient Travel Credits." });
        return;
      }
      refreshUser();
    }

    const bookingData = {
      bookingType:   "holiday",
      referenceId:   Date.now(),
      title:         `${pkgName} · ${pkgDest}`,
      passengerName: name.trim(),
      passengerEmail: email.trim(),
      passengerPhone: phone.trim(),
      passengers:    people,
      travelDate:    new Date().toISOString().split("T")[0],
      details: {
        type:              "holiday",
        status:            "paid",
        userId:            user?.id || "guest",
        customerName:      name.trim(),
        customerEmail:     email.trim(),
        customerPhone:     phone.trim(),
        customerGender:    gender,
        packageId:         pkgId,
        packageName:       pkgName,
        destination:       pkgDest,
        duration:          pkgDur,
        people,
        pricePerPerson:    displayedPPP,
        baseTotal,
        coupon:            appliedCoupon,
        discountAmount:    discountAmt,
        subTotal,
        convenienceFee:    convFee,
        totalPrice:        finalTotal,
        creditApplied:     creditApplied > 0 ? creditApplied : undefined,
        netPaid:           netPayable,
        paymentMethod:     creditApplied > 0 ? (netPayable === 0 ? "travel_credits" : "credits+partial") : "online",
        imageUrl:          pkgImg,
      },
    };

    try {
      const res = await fetch("/api/bookings", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(bookingData),
      });
      const data = await res.json();
      convertLeadToBooked(phone.trim(), "holiday", data.bookingId || data.id);
      setPaid(true);
      toast({ title: "Booking Confirmed!", description: `Booking ID: ${data.bookingId || data.id}` });

      // Fire-and-forget WhatsApp with PDF itinerary (non-blocking)
      fetch("/api/holiday-whatsapp", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName:   name.trim(),
          phone:          phone.trim(),
          destination:    pkgDest,
          duration:       pkgDur,
          people,
          packageName:    pkgName,
          pricePerPerson: rawPrice,
          totalPrice:     finalTotal,
          trigger:        "booking",
          bookingId:      data.bookingId || data.id,
        }),
      }).catch(() => {/* silent fail */});
    } catch {
      toast({ title: "Booking failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setPaying(false);
    }
  }

  if (paid) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-20 max-w-lg text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 mb-2">Booking Confirmed!</h1>
          <p className="text-muted-foreground mb-2">Your holiday package is booked successfully.</p>
          <div className="bg-slate-50 border rounded-xl p-4 text-sm text-left space-y-2 mb-6">
            <div className="flex justify-between"><span className="text-muted-foreground">Package</span><span className="font-semibold">{pkgName}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Destination</span><span className="font-semibold">{pkgDest}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Travellers</span><span className="font-semibold">{people} person{people > 1 ? "s" : ""}</span></div>
            <Separator />
            <div className="flex justify-between font-bold text-slate-900"><span>Total Paid</span><span>₹{finalTotal.toLocaleString()}</span></div>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setLocation("/packages")}>Browse More</Button>
            <Button className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-bold" onClick={() => setLocation("/bookings")}>My Bookings</Button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Steps */}
      <div className="bg-gradient-to-r from-purple-600 to-violet-700 text-white py-6">
        <div className="container mx-auto px-4">
          <div className="flex items-center gap-1 mb-3">
            <button onClick={() => setLocation(`/packages/${pkgId}`)} className="text-white/70 hover:text-white transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <span className="text-white/70 text-sm ml-1">Package Booking</span>
          </div>
          <div className="flex items-center gap-2">
            {STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                  i < 2 ? "bg-white text-purple-600" : i === 2 ? "bg-white text-purple-600 ring-2 ring-white ring-offset-2 ring-offset-purple-600" : "bg-white/20 text-white/60"
                )}>
                  {i < 2 ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
                </div>
                <span className={cn("text-xs font-semibold", i === 2 ? "text-white" : i < 2 ? "text-white/80" : "text-white/40")}>{s}</span>
                {i < STEPS.length - 1 && <div className={cn("w-8 h-px", i < 2 ? "bg-white/60" : "bg-white/20")} />}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* ── Form ── */}
          <div className="lg:col-span-3 space-y-6">
            {/* Package summary */}
            <div className="bg-white border rounded-2xl p-4 flex gap-4 shadow-sm">
              {pkgImg && (
                <img
                  src={pkgImg}
                  alt={pkgName}
                  className="w-24 h-18 object-cover rounded-xl shrink-0"
                  style={{ height: "72px" }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              )}
              <div>
                <p className="font-extrabold text-slate-900 text-base">{pkgName}</p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                  {pkgDest && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{pkgDest}</span>}
                  {pkgDur  && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{pkgDur}</span>}
                  <span className="flex items-center gap-1"><Users className="w-3 h-3" />{people} traveller{people > 1 ? "s" : ""}</span>
                </div>
              </div>
            </div>

            {/* Guest details */}
            <div className="bg-white border rounded-2xl p-5 shadow-sm space-y-4">
              <h2 className="font-extrabold text-slate-900 text-lg">Primary Traveller Details</h2>

              <div>
                <label className="text-sm font-semibold text-slate-700 block mb-1.5">Full Name <span className="text-red-500">*</span></label>
                <Input
                  placeholder="As on government ID"
                  value={name}
                  onChange={(e) => { setName(e.target.value); setErrors((p) => ({ ...p, name: "" })); }}
                  className={cn("h-11", errors.name && "border-red-400")}
                />
                {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-semibold text-slate-700 block mb-1.5">Email <span className="text-red-500">*</span></label>
                  <Input
                    type="email"
                    placeholder="Enter email address"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setErrors((p) => ({ ...p, email: "" })); }}
                    className={cn("h-11", errors.email && "border-red-400")}
                  />
                  {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700 block mb-1.5">Mobile <span className="text-red-500">*</span></label>
                  <Input
                    type="tel"
                    placeholder="10-digit mobile number"
                    value={phone}
                    onChange={(e) => { setPhone(e.target.value); setErrors((p) => ({ ...p, phone: "" })); }}
                    className={cn("h-11", errors.phone && "border-red-400")}
                  />
                  {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone}</p>}
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-700 block mb-1.5">Gender</label>
                <div className="flex gap-3">
                  {["male", "female", "other"].map((g) => (
                    <label key={g} className={cn(
                      "flex-1 flex items-center justify-center gap-2 border rounded-xl h-10 cursor-pointer text-sm font-semibold transition-all",
                      gender === g ? "bg-purple-600 text-white border-purple-600" : "hover:bg-purple-50 hover:border-purple-300"
                    )}>
                      <input type="radio" name="gender" value={g} checked={gender === g} onChange={() => setGender(g)} className="hidden" />
                      {g.charAt(0).toUpperCase() + g.slice(1)}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Coupon */}
            <div className="bg-white border rounded-2xl p-5 shadow-sm space-y-3">
              <h2 className="font-extrabold text-slate-900 flex items-center gap-2">
                <Tag className="w-4 h-4 text-purple-600" /> Offers & Coupons
              </h2>
              <AvailableCoupons
                bookingAmount={baseTotal + convFee}   // markup-inclusive total
                context={couponContext}
                onApply={(code) => applyCoupon(code)}
                appliedCode={appliedCoupon?.code}
              />
              {couponStatus === "valid" && appliedCoupon ? (
                <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                  <span className="text-green-700 font-bold text-sm flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" /> {appliedCoupon.code} · ₹{discountAmt.toLocaleString("en-IN")} off
                  </span>
                  <button onClick={removeCoupon} className="text-xs text-red-500 hover:underline font-medium">Remove</button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter coupon code"
                    value={couponCode}
                    onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setCouponError(""); setCouponStatus("idle"); }}
                    className={cn("h-10 font-mono tracking-wider", couponError && "border-red-400")}
                    onKeyDown={(e) => e.key === "Enter" && applyCoupon()}
                  />
                  <Button onClick={() => applyCoupon()} variant="outline" className="h-10 px-5 border-purple-200 text-purple-700 font-bold shrink-0">Apply</Button>
                </div>
              )}
              {couponError && <p className="text-xs text-red-500">{couponError}</p>}
            </div>
          </div>

          {/* ── Right: Price ── */}
          <div className="lg:col-span-2 space-y-4">
            {/* Summary (no conv fee here) */}
            <div className="bg-white border rounded-2xl p-5 shadow-sm">
              <h2 className="font-extrabold text-slate-900 mb-4 text-base">Price Summary</h2>
              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">₹{displayedPPP.toLocaleString()} × {people} traveller{people > 1 ? "s" : ""}</span>
                  <span className="font-semibold">₹{baseTotal.toLocaleString()}</span>
                </div>
                {appliedCoupon && (
                  <div className="flex justify-between text-green-600">
                    <span className="font-medium">Coupon ({appliedCoupon.code})</span>
                    <span className="font-semibold">−₹{discountAmt.toLocaleString()}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between font-bold text-slate-900">
                  <span>Sub Total</span>
                  <span>₹{subTotal.toLocaleString()}</span>
                </div>
                {isAgent && commissionTotal > 0 && (
                  <div className="flex justify-between text-green-600 text-xs">
                    <span className="font-medium">Commission Earned</span>
                    <span className="font-semibold">₹{commissionTotal.toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Final Payment (conv fee shown here only) */}
            <div className="bg-purple-600 text-white rounded-2xl p-5 shadow-lg">
              <h2 className="font-extrabold mb-4 text-base">Final Payment</h2>
              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between text-white/80">
                  <span>Sub Total</span>
                  <span>₹{subTotal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-white/80">
                  <span>Convenience Fee</span>
                  <span>₹{convFee.toLocaleString()}</span>
                </div>
                <Separator className="bg-white/20" />
                <div className="flex justify-between font-extrabold text-lg">
                  <span>Total</span>
                  <span>₹{finalTotal.toLocaleString()}</span>
                </div>
                {creditApplied > 0 && (
                  <div className="flex justify-between text-sm text-amber-300 font-medium pt-1">
                    <span>Travel Credits Applied</span>
                    <span>−₹{creditApplied.toLocaleString()}</span>
                  </div>
                )}
                {creditApplied > 0 && (
                  <div className="flex justify-between font-extrabold text-base border-t border-white/20 pt-1">
                    <span>You Pay</span>
                    <span>₹{netPayable.toLocaleString()}</span>
                  </div>
                )}
              </div>

              {/* Travel Credits toggle for regular users */}
              {canUseCredits && (
                <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <label htmlFor="use-credits-pkg" className="flex items-center gap-2 cursor-pointer">
                      <Wallet className="w-4 h-4 text-amber-600" />
                      <span className="text-sm font-semibold text-amber-800">Use Travel Credits</span>
                    </label>
                    <input
                      id="use-credits-pkg"
                      type="checkbox"
                      checked={useCredits}
                      onChange={(e) => setUseCredits(e.target.checked)}
                      className="w-4 h-4 accent-amber-500 cursor-pointer"
                    />
                  </div>
                  <div className="flex justify-between text-xs text-amber-700">
                    <span>Available Balance</span>
                    <span className="font-bold">₹{walletBalance.toLocaleString("en-IN")}</span>
                  </div>
                  {useCredits && (
                    <p className="text-xs text-amber-600">
                      ₹{creditApplied.toLocaleString()} will be deducted from your Travel Credits
                      {netPayable > 0 ? `, pay ₹${netPayable.toLocaleString()} online` : " — no additional payment needed!"}
                    </p>
                  )}
                </div>
              )}

              {/* Wallet pay option for agents */}
              {canPayByWallet && (
                <div className="mt-4 p-3 rounded-xl bg-white/10 border border-white/20 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white/80">Wallet Balance</span>
                    <span className="text-sm font-bold text-white">₹{walletBalance.toLocaleString("en-IN")}</span>
                  </div>
                  <Button
                    onClick={handleWalletPay}
                    disabled={walletPaying || paying}
                    className="w-full h-10 bg-white text-purple-700 hover:bg-purple-50 font-bold gap-1.5"
                  >
                    {walletPaying
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</>
                      : <><Wallet className="w-4 h-4" /> Pay ₹{finalTotal.toLocaleString()} with Wallet</>
                    }
                  </Button>
                  <p className="text-[10px] text-white/60 text-center">Instant — no OTP needed</p>
                </div>
              )}

              <Button
                onClick={handlePay}
                disabled={paying}
                className="w-full mt-4 h-12 bg-white text-purple-700 hover:bg-purple-50 font-extrabold text-base gap-2 shadow"
              >
                {paying ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</> : <>{netPayable === 0 ? "Confirm Booking (Free with Credits)" : `Pay ₹${netPayable.toLocaleString()}`}</>}
              </Button>

              <div className="flex items-center justify-center gap-2 mt-3 text-white/60 text-[11px]">
                <ShieldCheck className="w-3.5 h-3.5" /> Secured by Razorpay · 256-bit SSL
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 text-xs text-amber-800">
              <p className="font-semibold mb-1">Cancellation Policy</p>
              <p>Free cancellation within 24 hrs of booking. After that, partial charges may apply as per the package policy.</p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
