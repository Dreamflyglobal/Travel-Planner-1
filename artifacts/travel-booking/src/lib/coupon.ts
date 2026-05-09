// ── Coupon validation & usage tracking ───────────────────────────────────────

export interface Coupon {
  code: string;
  discount: number;
  discountType: "fixed" | "percentage";
  type: "public" | "welcome" | "user_specific";
  allowed_phone?: string;        // only for user_specific
  used_by?: string[];            // normalised phones that have redeemed it (populated from usage API)
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
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.slice(-10);
}

export function computeDiscountAmount(coupon: Coupon, basePrice: number): number {
  if (coupon.discountType === "percentage") {
    return Math.min(Math.round((basePrice * coupon.discount) / 100), basePrice);
  }
  return Math.round(coupon.discount);
}

// ── API functions (server-backed, cross-device) ───────────────────────────────

const API = "/api/coupons";

export async function apiFetchCoupons(): Promise<Coupon[]> {
  try {
    const res = await fetch(API);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: any[] = await res.json();
    return data.map((c) => ({
      ...c,
      type: c.type ?? (c.firstTimeOnly ? "welcome" : "public"),
      used_by: c.used_by ?? [],
    }));
  } catch (e) {
    console.error("[coupon] apiFetchCoupons failed, falling back to localStorage:", e);
    return getCoupons();
  }
}

export async function apiFetchCouponUsage(): Promise<CouponUsageRecord[]> {
  try {
    const res = await fetch(`${API}/usage`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  } catch {
    return getCouponUsage();
  }
}

export async function apiFetchCouponUsageCounts(): Promise<Record<string, number>> {
  try {
    const res = await fetch(`${API}/usage/counts`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  } catch {
    // fallback: build from localStorage usage
    const usage = getCouponUsage();
    return usage.reduce<Record<string, number>>((acc, u) => {
      acc[u.code] = (acc[u.code] ?? 0) + 1;
      return acc;
    }, {});
  }
}

export async function apiCreateCoupon(coupon: Omit<Coupon, "used_by">): Promise<Coupon> {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(coupon),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export async function apiDeleteCoupon(code: string): Promise<void> {
  const res = await fetch(`${API}/${encodeURIComponent(code)}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error ?? `HTTP ${res.status}`);
  }
}

export async function apiRecordCouponUsage(code: string, phone: string): Promise<void> {
  try {
    await fetch(`${API}/usage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, phone }),
    });
  } catch (e) {
    console.error("[coupon] apiRecordCouponUsage failed:", e);
    // Still record locally as fallback
    recordCouponUsage(code, phone);
  }
}

// ── Pure validation (works with passed-in list — no localStorage dependency) ──

export type CouponValidationResult =
  | { ok: true; coupon: Coupon; discountAmount: number }
  | { ok: false; error: string };

export interface CouponContext {
  phone?: string;
  userBookingsCount?: number;
  service_type?: "flight" | "bus" | "hotel" | "holiday";
  flight_type?: "domestic" | "international";
  airline?: string;
}

/**
 * Validate a coupon code against a pre-loaded list of coupons and usage records.
 * Does NOT read from localStorage — safe to use with API-fetched data.
 */
export function validateCouponFromList(
  code: string,
  bookingAmount: number,
  ctx: CouponContext = {},
  coupons: Coupon[],
  usageRecords: CouponUsageRecord[],
): CouponValidationResult {
  const upperCode = code.trim().toUpperCase();
  const coupon = coupons.find((c) => c.code.toUpperCase() === upperCode);
  if (!coupon) return { ok: false, error: "Invalid coupon code" };

  // Expiry
  const expiry = new Date(coupon.validUntil);
  expiry.setHours(23, 59, 59, 999);
  if (expiry < new Date()) return { ok: false, error: "Coupon has expired" };

  // Minimum booking amount
  const min = coupon.minBookingAmount ?? 0;
  if (min > 0 && bookingAmount < min) {
    return { ok: false, error: `Minimum booking amount ₹${min.toLocaleString("en-IN")} required` };
  }

  // Global usage limit
  const limit = coupon.usageLimit ?? 0;
  if (limit > 0) {
    const count = usageRecords.filter((u) => u.code === code).length;
    if (count >= limit) return { ok: false, error: "Coupon usage limit reached" };
  }

  // Service type
  if (coupon.service_type && ctx.service_type && coupon.service_type !== ctx.service_type) {
    const labels: Record<string, string> = {
      flight: "flights", bus: "bus bookings", hotel: "hotel bookings", holiday: "holiday packages",
    };
    return { ok: false, error: `Coupon valid only for ${labels[coupon.service_type] ?? coupon.service_type}` };
  }

  // Flight-specific
  if (coupon.service_type === "flight") {
    if (coupon.flight_type && ctx.flight_type && coupon.flight_type !== ctx.flight_type) {
      return { ok: false, error: `Coupon valid only for ${coupon.flight_type} flights` };
    }
    if (coupon.airline && ctx.airline) {
      const ca = coupon.airline.toLowerCase().trim();
      const ba = ctx.airline.toLowerCase().trim();
      if (!ba.includes(ca) && !ca.includes(ba)) {
        return { ok: false, error: `Coupon valid only for ${coupon.airline} flights` };
      }
    }
  }

  const normalizedPhone = ctx.phone ? normalizePhone(ctx.phone) : "";
  const couponType = coupon.type ?? (coupon.firstTimeOnly ? "welcome" : "public");

  if (couponType === "user_specific") {
    if (!coupon.allowed_phone) return { ok: false, error: "Invalid coupon" };
    const allowedNorm = normalizePhone(coupon.allowed_phone);
    if (!normalizedPhone || normalizedPhone !== allowedNorm) {
      return { ok: false, error: "This coupon is not available for your account" };
    }
    // One-time per user — check usage records
    const usedByPhone = usageRecords.filter((u) => u.code === code).map((u) => u.phone);
    const also = coupon.used_by ?? [];
    const allUsed = [...new Set([...usedByPhone, ...also])];
    if (allUsed.includes(normalizedPhone)) {
      return { ok: false, error: "You have already used this coupon" };
    }
  }

  if (couponType === "welcome" || coupon.firstTimeOnly) {
    const bookingCount = ctx.userBookingsCount ?? 0;
    if (bookingCount > 0) {
      return { ok: false, error: "Welcome coupon is for first-time bookings only" };
    }
    if (normalizedPhone) {
      const usedByPhone = usageRecords.filter((u) => u.code === code).map((u) => u.phone);
      const also = coupon.used_by ?? [];
      const allUsed = [...new Set([...usedByPhone, ...also])];
      if (allUsed.includes(normalizedPhone)) {
        return { ok: false, error: "You have already used this welcome coupon" };
      }
    }
  }

  return { ok: true, coupon, discountAmount: computeDiscountAmount(coupon, bookingAmount) };
}

/**
 * Get eligible coupons from a pre-loaded list — no localStorage dependency.
 */
export function getAvailableCouponsFromList(
  bookingAmount: number,
  ctx: CouponContext = {},
  coupons: Coupon[],
  usageRecords: CouponUsageRecord[],
): Coupon[] {
  const now = new Date();
  const normalizedPhone = ctx.phone ? normalizePhone(ctx.phone) : "";
  const bookingCount = ctx.userBookingsCount ?? 0;

  return coupons.filter((coupon) => {
    const expiry = new Date(coupon.validUntil);
    expiry.setHours(23, 59, 59, 999);
    if (expiry < now) return false;

    const min = coupon.minBookingAmount ?? 0;
    if (min > 0 && bookingAmount < min) return false;

    const limit = coupon.usageLimit ?? 0;
    if (limit > 0) {
      const count = usageRecords.filter((u) => u.code.toUpperCase() === coupon.code.toUpperCase()).length;
      if (count >= limit) return false;
    }

    // Only filter by service_type when BOTH coupon and context have a type set
    if (coupon.service_type && ctx.service_type && coupon.service_type !== ctx.service_type) return false;

    if (coupon.service_type === "flight") {
      if (coupon.flight_type && ctx.flight_type && coupon.flight_type !== ctx.flight_type) return false;
      if (coupon.airline && ctx.airline) {
        const ca = coupon.airline.toLowerCase().trim();
        const ba = ctx.airline.toLowerCase().trim();
        if (!ba.includes(ca) && !ca.includes(ba)) return false;
      }
    }

    const couponType = coupon.type ?? (coupon.firstTimeOnly ? "welcome" : "public");

    if (couponType === "user_specific") {
      if (!coupon.allowed_phone || !normalizedPhone) return false;
      if (normalizePhone(coupon.allowed_phone) !== normalizedPhone) return false;
      const usedByPhone = usageRecords.filter((u) => u.code === coupon.code).map((u) => u.phone);
      const allUsed = [...new Set([...usedByPhone, ...(coupon.used_by ?? [])])];
      if (allUsed.includes(normalizedPhone)) return false;
      return true;
    }

    if (couponType === "welcome" || coupon.firstTimeOnly) {
      if (bookingCount > 0) return false;
      if (normalizedPhone) {
        const usedByPhone = usageRecords.filter((u) => u.code === coupon.code).map((u) => u.phone);
        const allUsed = [...new Set([...usedByPhone, ...(coupon.used_by ?? [])])];
        if (allUsed.includes(normalizedPhone)) return false;
      }
      return true;
    }

    return true; // public
  });
}

// ── localStorage fallbacks (kept for backward compatibility) ──────────────────

const USAGE_KEY = "coupon_usage";

export function getCoupons(): Coupon[] {
  try {
    const raw = JSON.parse(localStorage.getItem("coupons") ?? "[]");
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
  const usage = getCouponUsage();
  usage.push({ code, phone: normalized });
  localStorage.setItem(USAGE_KEY, JSON.stringify(usage));
  const coupons = getCoupons();
  const idx = coupons.findIndex((c) => c.code === code);
  if (idx >= 0) {
    const usedBy = coupons[idx].used_by ?? [];
    if (!usedBy.includes(normalized)) usedBy.push(normalized);
    coupons[idx] = { ...coupons[idx], used_by: usedBy };
    localStorage.setItem("coupons", JSON.stringify(coupons));
  }
}

/** @deprecated Use validateCouponFromList with API-fetched data */
export function validateCoupon(
  code: string,
  bookingAmount: number,
  ctx: CouponContext = {},
): CouponValidationResult {
  return validateCouponFromList(code, bookingAmount, ctx, getCoupons(), getCouponUsage());
}

/** @deprecated Use getAvailableCouponsFromList with API-fetched data */
export function getAvailableCoupons(
  bookingAmount: number,
  ctx: CouponContext = {},
): Coupon[] {
  return getAvailableCouponsFromList(bookingAmount, ctx, getCoupons(), getCouponUsage());
}

// Legacy helper kept for backward compat
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
