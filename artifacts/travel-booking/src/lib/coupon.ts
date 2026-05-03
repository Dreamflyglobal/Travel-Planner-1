// ── Coupon validation & usage tracking ───────────────────────────────────────

export interface Coupon {
  code: string;
  discount: number;
  discountType: "fixed" | "percentage";
  type: "public" | "welcome" | "user_specific";
  allowed_phone?: string;        // only for user_specific
  used_by?: string[];            // normalised phones that have redeemed it
  validUntil: string;
  firstTimeOnly?: boolean;       // legacy compat → treated same as welcome
  usageLimit?: number;           // 0 or undefined = unlimited global uses
  minBookingAmount?: number;     // 0 or undefined = no minimum
  // ── Category restrictions ──────────────────────────────────────────────────
  service_type?: "flight" | "bus" | "hotel" | "holiday"; // undefined = all services
  flight_type?: "domestic" | "international";             // only for flight coupons
  airline?: string;                                       // optional, only for flights
  description?: string;                                   // optional human-readable description
}

export interface CouponUsageRecord {
  code: string;
  phone: string;
  timestamp: string;
}

const USAGE_KEY = "coupon_usage";

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.slice(-10);
}

export function getCoupons(): Coupon[] {
  try {
    const raw = JSON.parse(localStorage.getItem("coupons") ?? "[]");
    // Back-compat: ensure every coupon has a `type` field
    return raw.map((c: any) => ({
      ...c,
      type: c.type ?? (c.firstTimeOnly ? "welcome" : "public"),
      used_by: c.used_by ?? [],
    }));
  } catch {
    return [];
  }
}

export function getCouponUsage(): CouponUsageRecord[] {
  try {
    return JSON.parse(localStorage.getItem(USAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function recordCouponUsage(code: string, phone: string): void {
  const normalized = normalizePhone(phone);

  // 1. Append to global usage log
  const usage = getCouponUsage();
  usage.push({ code, phone: normalized, timestamp: new Date().toISOString() });
  localStorage.setItem(USAGE_KEY, JSON.stringify(usage));

  // 2. Add to the coupon's own used_by list
  const coupons = getCoupons();
  const idx = coupons.findIndex((c) => c.code === code);
  if (idx >= 0) {
    const usedBy = coupons[idx].used_by ?? [];
    if (!usedBy.includes(normalized)) usedBy.push(normalized);
    coupons[idx] = { ...coupons[idx], used_by: usedBy };
    localStorage.setItem("coupons", JSON.stringify(coupons));
  }
}

export type CouponValidationResult =
  | { ok: true; coupon: Coupon; discountAmount: number }
  | { ok: false; error: string };

export interface CouponContext {
  phone?: string;              // normalised or raw — we normalise internally
  userBookingsCount?: number;  // 0 = first-time user, >0 = returning
  // ── Category context (provided by each booking page) ──────────────────────
  service_type?: "flight" | "bus" | "hotel" | "holiday";
  flight_type?: "domestic" | "international";
  airline?: string;
}

export function validateCoupon(
  code: string,
  bookingAmount: number,
  ctx: CouponContext = {},
): CouponValidationResult {
  const coupons = getCoupons();
  const coupon = coupons.find((c) => c.code === code);
  if (!coupon) return { ok: false, error: "Invalid coupon code" };

  // ── Expiry ──────────────────────────────────────────────────────────────
  const expiry = new Date(coupon.validUntil);
  expiry.setHours(23, 59, 59, 999);
  if (expiry < new Date()) return { ok: false, error: "Coupon has expired" };

  // ── Minimum booking amount ───────────────────────────────────────────────
  const min = coupon.minBookingAmount ?? 0;
  if (min > 0 && bookingAmount < min) {
    return {
      ok: false,
      error: `Minimum booking amount ₹${min.toLocaleString("en-IN")} required`,
    };
  }

  // ── Global usage limit ──────────────────────────────────────────────────
  const limit = coupon.usageLimit ?? 0;
  if (limit > 0) {
    const usage = getCouponUsage();
    const count = usage.filter((u) => u.code === code).length;
    if (count >= limit) return { ok: false, error: "Coupon usage limit reached" };
  }

  // ── Service type check ───────────────────────────────────────────────────
  if (coupon.service_type && ctx.service_type && coupon.service_type !== ctx.service_type) {
    const labels: Record<string, string> = {
      flight: "flights", bus: "bus bookings", hotel: "hotel bookings", holiday: "holiday packages",
    };
    return { ok: false, error: `Coupon valid only for ${labels[coupon.service_type] ?? coupon.service_type}` };
  }

  // ── Flight-specific checks ───────────────────────────────────────────────
  if (coupon.service_type === "flight") {
    if (coupon.flight_type && ctx.flight_type && coupon.flight_type !== ctx.flight_type) {
      return { ok: false, error: `Coupon valid only for ${coupon.flight_type} flights` };
    }
    if (coupon.airline && ctx.airline) {
      const couponAirline = coupon.airline.toLowerCase().trim();
      const bookingAirline = ctx.airline.toLowerCase().trim();
      if (!bookingAirline.includes(couponAirline) && !couponAirline.includes(bookingAirline)) {
        return { ok: false, error: `Coupon valid only for ${coupon.airline} flights` };
      }
    }
  }

  const normalizedPhone = ctx.phone ? normalizePhone(ctx.phone) : "";

  // ── Type-specific checks ────────────────────────────────────────────────
  const couponType = coupon.type ?? (coupon.firstTimeOnly ? "welcome" : "public");

  if (couponType === "user_specific") {
    if (!coupon.allowed_phone) return { ok: false, error: "Invalid coupon" };
    const allowedNorm = normalizePhone(coupon.allowed_phone);
    if (!normalizedPhone || normalizedPhone !== allowedNorm) {
      return { ok: false, error: "This coupon is not available for your account" };
    }
    // One-time per user
    const usedBy = coupon.used_by ?? [];
    if (usedBy.includes(normalizedPhone)) {
      return { ok: false, error: "You have already used this coupon" };
    }
  }

  if (couponType === "welcome" || coupon.firstTimeOnly) {
    // Welcome coupon: allowed only for first-time users
    const bookingCount = ctx.userBookingsCount ?? 0;
    if (bookingCount > 0) {
      return { ok: false, error: "Welcome coupon is for first-time bookings only" };
    }
    // Also enforce one-time per phone if phone provided
    if (normalizedPhone) {
      const usedBy = coupon.used_by ?? [];
      if (usedBy.includes(normalizedPhone)) {
        return { ok: false, error: "You have already used this welcome coupon" };
      }
    }
  }

  return { ok: true, coupon, discountAmount: computeDiscountAmount(coupon, bookingAmount) };
}

// Legacy helper kept for backward compat — now handled inside validateCoupon
export function checkFirstTimeUsage(
  code: string,
  phone: string,
): { ok: true } | { ok: false; error: string } {
  const coupons = getCoupons();
  const coupon = coupons.find((c) => c.code === code);
  if (!coupon) return { ok: true };

  const couponType = coupon.type ?? (coupon.firstTimeOnly ? "welcome" : "public");
  if (couponType !== "welcome" && !coupon.firstTimeOnly) return { ok: true };

  const normalized = normalizePhone(phone);
  const usedBy = coupon.used_by ?? [];
  if (usedBy.includes(normalized)) {
    return { ok: false, error: "Already used this welcome offer" };
  }
  return { ok: true };
}

export function computeDiscountAmount(coupon: Coupon, basePrice: number): number {
  if (coupon.discountType === "percentage") {
    return Math.min(Math.round((basePrice * coupon.discount) / 100), basePrice);
  }
  return Math.round(coupon.discount);
}

// ── Available coupons for a given user / booking context ────────────────────
export function getAvailableCoupons(
  bookingAmount: number,
  ctx: CouponContext = {},
): Coupon[] {
  const coupons = getCoupons();
  const now = new Date();
  const normalizedPhone = ctx.phone ? normalizePhone(ctx.phone) : "";
  const bookingCount = ctx.userBookingsCount ?? 0;

  return coupons.filter((coupon) => {
    // Must not be expired
    const expiry = new Date(coupon.validUntil);
    expiry.setHours(23, 59, 59, 999);
    if (expiry < now) return false;

    // Must meet minimum amount
    const min = coupon.minBookingAmount ?? 0;
    if (min > 0 && bookingAmount < min) return false;

    // Must not exceed global usage limit
    const limit = coupon.usageLimit ?? 0;
    if (limit > 0) {
      const usage = getCouponUsage();
      const count = usage.filter((u) => u.code === coupon.code).length;
      if (count >= limit) return false;
    }

    // ── Service type filter ─────────────────────────────────────────────────
    if (coupon.service_type && ctx.service_type && coupon.service_type !== ctx.service_type) {
      return false;
    }

    // ── Flight-specific filter ──────────────────────────────────────────────
    if (coupon.service_type === "flight") {
      if (coupon.flight_type && ctx.flight_type && coupon.flight_type !== ctx.flight_type) {
        return false;
      }
      if (coupon.airline && ctx.airline) {
        const couponAirline = coupon.airline.toLowerCase().trim();
        const bookingAirline = ctx.airline.toLowerCase().trim();
        if (!bookingAirline.includes(couponAirline) && !couponAirline.includes(bookingAirline)) {
          return false;
        }
      }
    }

    const couponType = coupon.type ?? (coupon.firstTimeOnly ? "welcome" : "public");

    if (couponType === "user_specific") {
      if (!coupon.allowed_phone || !normalizedPhone) return false;
      if (normalizePhone(coupon.allowed_phone) !== normalizedPhone) return false;
      const usedBy = coupon.used_by ?? [];
      if (usedBy.includes(normalizedPhone)) return false;
      return true;
    }

    if (couponType === "welcome" || coupon.firstTimeOnly) {
      if (bookingCount > 0) return false;
      if (normalizedPhone) {
        const usedBy = coupon.used_by ?? [];
        if (usedBy.includes(normalizedPhone)) return false;
      }
      return true;
    }

    // public — everyone sees it
    return true;
  });
}
