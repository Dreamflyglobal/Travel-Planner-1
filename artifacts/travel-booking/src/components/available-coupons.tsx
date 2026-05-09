import { useMemo } from "react";
import { Tag, Sparkles, Gift, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getAvailableCouponsFromList,
  computeDiscountAmount,
  type Coupon,
  type CouponContext,
  type CouponUsageRecord,
} from "@/lib/coupon";

interface AvailableCouponsProps {
  bookingAmount: number;
  context?: CouponContext;
  onApply: (code: string) => void;
  appliedCode?: string;
  /** Pre-fetched coupon list from API (preferred). Falls back to localStorage if omitted. */
  coupons?: Coupon[];
  /** Pre-fetched usage records from API. */
  usageRecords?: CouponUsageRecord[];
}

function typeLabel(coupon: Coupon) {
  const t = coupon.type ?? (coupon.firstTimeOnly ? "welcome" : "public");
  if (t === "welcome")      return { label: "Welcome Offer", color: "bg-amber-100 text-amber-700 border-amber-200",  icon: Gift };
  if (t === "user_specific") return { label: "Special Offer", color: "bg-purple-100 text-purple-700 border-purple-200", icon: User };
  return { label: "Public", color: "bg-blue-100 text-blue-700 border-blue-200", icon: Sparkles };
}

function serviceLabel(coupon: Coupon): { label: string; color: string } | null {
  if (!coupon.service_type) return null;
  const labels: Record<string, { label: string; color: string }> = {
    flight:  { label: "Flights",  color: "bg-sky-100 text-sky-700 border-sky-200" },
    bus:     { label: "Bus",      color: "bg-orange-100 text-orange-700 border-orange-200" },
    hotel:   { label: "Hotels",   color: "bg-green-100 text-green-700 border-green-200" },
    holiday: { label: "Holidays", color: "bg-rose-100 text-rose-700 border-rose-200" },
  };
  return labels[coupon.service_type] ?? null;
}

export function AvailableCoupons({
  bookingAmount,
  context,
  onApply,
  appliedCode,
  coupons: couponsProp,
  usageRecords = [],
}: AvailableCouponsProps) {
  const available = useMemo(() => {
    if (!couponsProp) return [];
    return getAvailableCouponsFromList(bookingAmount, context ?? {}, couponsProp, usageRecords);
  }, [
    bookingAmount,
    couponsProp,
    usageRecords,
    context?.phone,
    context?.userBookingsCount,
    context?.service_type,
    context?.flight_type,
    context?.airline,
  ]);

  if (available.length === 0) return null;

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold flex items-center gap-2 text-primary">
        <Tag className="w-4 h-4" />
        Available Offers ({available.length})
      </p>
      <div className="grid grid-cols-1 gap-2">
        {available.map((coupon) => {
          const { label, color, icon: Icon } = typeLabel(coupon);
          const svc = serviceLabel(coupon);
          const discountText =
            coupon.discountType === "percentage"
              ? `${coupon.discount}% OFF`
              : `₹${coupon.discount.toLocaleString("en-IN")} OFF`;
          const savings = computeDiscountAmount(coupon, bookingAmount);
          const isApplied = appliedCode === coupon.code;

          return (
            <div
              key={coupon.code}
              className={`flex items-center justify-between rounded-lg border px-4 py-3 transition-all ${
                isApplied
                  ? "border-green-400 bg-green-50"
                  : "border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10"
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-mono font-bold text-sm tracking-wide">{coupon.code}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${color}`}>
                      {label}
                    </span>
                    {svc && (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${svc.color}`}>
                        {svc.label}
                      </span>
                    )}
                    {coupon.flight_type && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full border bg-indigo-100 text-indigo-700 border-indigo-200 capitalize">
                        {coupon.flight_type}
                      </span>
                    )}
                    {coupon.airline && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full border bg-slate-100 text-slate-700 border-slate-200">
                        {coupon.airline}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    <span className="font-semibold text-primary">{discountText}</span>
                    {savings > 0 && ` · Save ₹${savings.toLocaleString("en-IN")}`}
                    {(coupon.minBookingAmount ?? 0) > 0 &&
                      ` · Min ₹${(coupon.minBookingAmount ?? 0).toLocaleString("en-IN")}`}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant={isApplied ? "secondary" : "default"}
                className="shrink-0 ml-2"
                onClick={() => onApply(coupon.code)}
                disabled={isApplied}
              >
                {isApplied ? "Applied" : "Apply"}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
