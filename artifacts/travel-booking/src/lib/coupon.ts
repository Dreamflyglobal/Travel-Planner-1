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
  service_type?: "flight" | "bus" | "hotel" | "holiday"; // undefined/null = all services
  flight_type?: "domestic" | "international";
  airline?: string;
  description?: string;
}

export interface CouponUsageRecord {
  code: string;
  phone: string;
}

export interface CouponContext {
  phone?: string;
  userBookingsCount?: number;
  service_type?: "flight" | "bus" | "hotel" | "holiday";
  flight_type?: "domestic" | "international";
  airline?: string;
}

export type CouponValidationResult =
  | { ok: true; coupon: Coupon; discountAmount: number }
  | { ok: false; error: string };

// ── Helpers ───────────────────────────────────────────────────────────────────

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.slice(-10);
}

export function computeDiscountAmount(coupon: Coupon, basePrice: number): number {
  if (coupon.discountType === "percentage") {
    return Math.min(Math.round((basePrice * coupon.discount) / 100), basePrice);
  }
  return Math.min(Math.round(coupon.discount), basePrice);
}

/**
 * Normalise a service_type value from any source (old localStorage, DB, user input).
 * Handles plurals, aliases, and case differences so old data never silently breaks.
 */
export function normalizeServiceType(
  raw: string | null | undefined,
): "flight" | "bus" | "hotel" | "holiday" | undefined {
  if (!raw) return undefined;
  const v = String(raw).toLowerCase().trim();
  if (v === "flight" || v === "flights") return "flight";
  if (v === "bus" || v === "buses") return "bus";
  if (v === "hotel" || v === "hotels") return "hotel";
  if (v === "holiday" || v === "holidays" || v === "package" || v === "packages") return "holiday";
  return undefined;
}

/**
 * Resolve coupon type with full backward compatibility:
 *  - "public" | "welcome" | "user_specific" are canonical
 *  - firstTimeOnly: true  → "welcome"
 *  - missing type          → "public"
 */
export function normalizeCouponType(
  raw: string | null | undefined,
  firstTimeOnly?: boolean,
): "public" | "welcome" | "user_specific" {
  if (raw === "welcome" || raw === "first_time" || raw === "firsttime") return "welcome";
  if (raw === "user_specific" || raw === "user-specific" || raw === "personal") return "user_specific";
  if (raw === "public") return "public";
  if (firstTimeOnly) return "welcome";
  return "public";
}

/**
 * Sanitise a raw coupon object (from API, localStorage, or any old format)
 * into a clean Coupon with normalised fields.
 */
export function sanitizeCoupon(raw: any): Coupon {
  return {
    code:             String(raw.code ?? "").trim().toUpperCase(),
    discount:         Number(raw.discount ?? 0),
    discountType:     raw.discountType === "percentage" ? "percentage" : "fixed",
    type:             normalizeCouponType(raw.type, raw.firstTimeOnly),
    allowed_phone:    raw.allowed_phone ? String(raw.allowed_phone).trim() : undefined,
    used_by:          Array.isArray(raw.used_by) ? raw.used_by : [],
    validUntil:       String(raw.validUntil ?? raw.valid_until ?? ""),
    firstTimeOnly:    !!raw.firstTimeOnly,
    usageLimit:       Number(raw.usageLimit ?? raw.usage_limit ?? 0),
    minBookingAmount: Number(raw.minBookingAmount ?? raw.min_booking_amount ?? 0),
    service_type:     normalizeServiceType(raw.service_type ?? raw.serviceType),
    flight_type:      (raw.flight_type === "domestic" || raw.flight_type === "international")
                        ? raw.flight_type : undefined,
    airline:          raw.airline ? String(raw.airline).trim() : undefined,
    description:      raw.description ? String(raw.description).trim() : undefined,
  };
}

// ── API functions (server-backed, cross-device) ───────────────────────────────

const API = "/api/coupons";

const MIGRATION_KEY = "coupons_migrated_v1";

/**
 * One-time migration: reads old coupons from localStorage and posts any
 * that don't already exist in the DB.  Runs at most once per browser.
 */
async function migrateLegacyCouponsToApi(apiCoupons: Coupon[]): Promise<void> {
  try {
    if (localStorage.getItem(MIGRATION_KEY)) return; // already done
    const raw = JSON.parse(localStorage.getItem("coupons") ?? "[]");
    if (!Array.isArray(raw) || raw.length === 0) {
      localStorage.setItem(MIGRATION_KEY, "1");
      return;
    }
    const apiCodes = new Set(apiCoupons.map((c) => c.code.toUpperCase()));
    const toMigrate: any[] = raw
      .map(sanitizeCoupon)
      .filter((c: Coupon) => c.code && !apiCodes.has(c.code.toUpperCase()));

    for (const coupon of toMigrate) {
      try {
        await fetch(API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(coupon),
        });
      } catch {
        // best-effort; ignore individual failures
      }
    }
    localStorage.setItem(MIGRATION_KEY, "1");
  } catch {
    // never crash
  }
}

export async function apiFetchCoupons(): Promise<Coupon[]> {
  try {
    const res = await fetch(API);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: any[] = await res.json();
    const coupons = data.map(sanitizeCoupon);

    // One-time migration of old localStorage coupons into the DB
    migrateLegacyCouponsToApi(coupons).catch(() => {});

    return coupons;
  } catch (e) {
    console.error("[coupon] apiFetchCoupons failed, using localStorage:", e);
    return getCoupons();
  }
}

export async function apiFetchCouponUsage(): Promise<CouponUsageRecord[]> {
  try {
    const res = await fetch(`${API}/usage`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: any[] = await res.json();
    return data.map((u) => ({
      code:  String(u.code ?? "").toUpperCase(),
      phone: normalizePhone(String(u.phone ?? "")),
    }));
  } catch {
    return getCouponUsage();
  }
}

export async function apiFetchCouponUsageCounts(): Promise<Record<string, number>> {
  try {
    const res = await fetch(`${API}/usage/counts`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const raw: Record<string, number> = await res.json();
    // Ensure keys are uppercase
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw)) out[k.toUpperCase()] = v;
    return out;
  } catch {
    const usage = getCouponUsage();
    return usage.reduce<Record<string, number>>((acc, u) => {
      const k = u.code.toUpperCase();
      acc[k] = (acc[k] ?? 0) + 1;
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
  return sanitizeCoupon(await res.json());
}

export async function apiDeleteCoupon(code: string): Promise<void> {
  const res = await fetch(`${API}/${encodeURIComponent(code.toUpperCase())}`, { method: "DELETE" });
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
      body: JSON.stringify({ code: code.toUpperCase(), phone }),
    });
  } catch (e) {
    console.error("[coupon] apiRecordCouponUsage failed:", e);
    recordCouponUsage(code, phone);
  }
}

// ── Pure validation (works with pre-fetched lists) ────────────────────────────

/**
 * Validate a coupon code against a pre-loaded list of coupons and usage records.
 * All comparisons are case-insensitive. Old coupon formats are handled via sanitizeCoupon.
 */
export function validateCouponFromList(
  code: string,
  bookingAmount: number,
  ctx: CouponContext = {},
  coupons: Coupon[],
  usageRecords: CouponUsageRecord[],
): CouponValidationResult {
  const upperCode = code.trim().toUpperCase();
  if (!upperCode) return { ok: false, error: "Please enter a coupon code" };

  const coupon = coupons.find((c) => c.code.toUpperCase() === upperCode);
  if (!coupon) return { ok: false, error: "Invalid coupon code" };

  // ── Expiry ────────────────────────────────────────────────────────────────
  if (coupon.validUntil) {
    const expiry = new Date(coupon.validUntil);
    expiry.setHours(23, 59, 59, 999);
    if (expiry < new Date()) return { ok: false, error: "This coupon has expired" };
  }

  // ── Minimum booking amount ────────────────────────────────────────────────
  const min = Number(coupon.minBookingAmount ?? 0);
  if (min > 0 && bookingAmount < min) {
    return { ok: false, error: `Minimum booking amount ₹${min.toLocaleString("en-IN")} required` };
  }

  // ── Global usage limit ────────────────────────────────────────────────────
  const limit = Number(coupon.usageLimit ?? 0);
  if (limit > 0) {
    const count = usageRecords.filter((u) => u.code.toUpperCase() === upperCode).length;
    if (count >= limit) return { ok: false, error: "Coupon usage limit has been reached" };
  }

  // ── Service type restriction ──────────────────────────────────────────────
  const couponSvc = normalizeServiceType(coupon.service_type);
  const ctxSvc    = normalizeServiceType(ctx.service_type);

  if (couponSvc && ctxSvc && couponSvc !== ctxSvc) {
    const labels: Record<string, string> = {
      flight:  "flight bookings",
      bus:     "bus bookings",
      hotel:   "hotel bookings",
      holiday: "holiday packages",
    };
    return { ok: false, error: `This coupon is valid only for ${labels[couponSvc] ?? couponSvc}` };
  }

  // ── Flight-specific sub-restrictions ─────────────────────────────────────
  if (couponSvc === "flight") {
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

  // ── Coupon type checks ────────────────────────────────────────────────────
  const normalizedPhone = ctx.phone ? normalizePhone(ctx.phone) : "";
  const couponType      = normalizeCouponType(coupon.type, coupon.firstTimeOnly);

  if (couponType === "user_specific") {
    if (!coupon.allowed_phone) {
      return { ok: false, error: "Invalid coupon configuration" };
    }
    if (!normalizedPhone) {
      return { ok: false, error: "Please log in to use this coupon" };
    }
    const allowedNorm = normalizePhone(coupon.allowed_phone);
    if (normalizedPhone !== allowedNorm) {
      return { ok: false, error: "This coupon is not available for your account" };
    }
    // One-time per user
    const usedPhones = [
      ...usageRecords.filter((u) => u.code.toUpperCase() === upperCode).map((u) => u.phone),
      ...(coupon.used_by ?? []),
    ];
    if (usedPhones.includes(normalizedPhone)) {
      return { ok: false, error: "You have already used this coupon" };
    }
  }

  if (couponType === "welcome") {
    const bookingCount = Number(ctx.userBookingsCount ?? 0);
    if (bookingCount > 0) {
      return { ok: false, error: "This coupon is only for first-time bookings" };
    }
    if (normalizedPhone) {
      const usedPhones = [
        ...usageRecords.filter((u) => u.code.toUpperCase() === upperCode).map((u) => u.phone),
        ...(coupon.used_by ?? []),
      ];
      if (usedPhones.includes(normalizedPhone)) {
        return { ok: false, error: "You have already used this welcome coupon" };
      }
    }
  }

  return { ok: true, coupon, discountAmount: computeDiscountAmount(coupon, bookingAmount) };
}

/**
 * Get all coupons applicable to the current booking context.
 * Filters by validity, service type, user type, usage, etc.
 */
export function getAvailableCouponsFromList(
  bookingAmount: number,
  ctx: CouponContext = {},
  coupons: Coupon[],
  usageRecords: CouponUsageRecord[],
): Coupon[] {
  const now             = new Date();
  const normalizedPhone = ctx.phone ? normalizePhone(ctx.phone) : "";
  const bookingCount    = Number(ctx.userBookingsCount ?? 0);
  const ctxSvc          = normalizeServiceType(ctx.service_type);

  return coupons.filter((coupon) => {
    // Expiry
    if (coupon.validUntil) {
      const expiry = new Date(coupon.validUntil);
      expiry.setHours(23, 59, 59, 999);
      if (expiry < now) return false;
    }

    // Minimum amount
    const min = Number(coupon.minBookingAmount ?? 0);
    if (min > 0 && bookingAmount < min) return false;

    // Global usage limit
    const limit = Number(coupon.usageLimit ?? 0);
    if (limit > 0) {
      const upperCode = coupon.code.toUpperCase();
      const count = usageRecords.filter((u) => u.code.toUpperCase() === upperCode).length;
      if (count >= limit) return false;
    }

    // Service type — only filter when BOTH sides are known
    const couponSvc = normalizeServiceType(coupon.service_type);
    if (couponSvc && ctxSvc && couponSvc !== ctxSvc) return false;

    // Flight sub-restrictions
    if (couponSvc === "flight") {
      if (coupon.flight_type && ctx.flight_type && coupon.flight_type !== ctx.flight_type) return false;
      if (coupon.airline && ctx.airline) {
        const ca = coupon.airline.toLowerCase().trim();
        const ba = ctx.airline.toLowerCase().trim();
        if (!ba.includes(ca) && !ca.includes(ba)) return false;
      }
    }

    const couponType  = normalizeCouponType(coupon.type, coupon.firstTimeOnly);
    const upperCode   = coupon.code.toUpperCase();

    if (couponType === "user_specific") {
      if (!coupon.allowed_phone || !normalizedPhone) return false;
      if (normalizePhone(coupon.allowed_phone) !== normalizedPhone) return false;
      const usedPhones = [
        ...usageRecords.filter((u) => u.code.toUpperCase() === upperCode).map((u) => u.phone),
        ...(coupon.used_by ?? []),
      ];
      return !usedPhones.includes(normalizedPhone);
    }

    if (couponType === "welcome") {
      if (bookingCount > 0) return false;
      if (normalizedPhone) {
        const usedPhones = [
          ...usageRecords.filter((u) => u.code.toUpperCase() === upperCode).map((u) => u.phone),
          ...(coupon.used_by ?? []),
        ];
        if (usedPhones.includes(normalizedPhone)) return false;
      }
    }

    return true; // public or welcome (eligible)
  });
}

// ── localStorage fallbacks (kept for backward compatibility) ──────────────────

const USAGE_KEY = "coupon_usage";

export function getCoupons(): Coupon[] {
  try {
    const raw = JSON.parse(localStorage.getItem("coupons") ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw.map(sanitizeCoupon).filter((c) => c.code);
  } catch {
    return [];
  }
}

export function getCouponUsage(): CouponUsageRecord[] {
  try {
    const raw = JSON.parse(localStorage.getItem(USAGE_KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw.map((u: any) => ({
      code:  String(u.code ?? "").toUpperCase(),
      phone: normalizePhone(String(u.phone ?? "")),
    }));
  } catch {
    return [];
  }
}

export function recordCouponUsage(code: string, phone: string): void {
  const upperCode  = code.trim().toUpperCase();
  const normalized = normalizePhone(phone);
  const usage      = getCouponUsage();
  usage.push({ code: upperCode, phone: normalized });
  localStorage.setItem(USAGE_KEY, JSON.stringify(usage));
  const coupons = getCoupons();
  const idx = coupons.findIndex((c) => c.code.toUpperCase() === upperCode);
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

/** Legacy helper kept for backward compat */
export function checkFirstTimeUsage(
  code: string,
  phone: string,
): { ok: true } | { ok: false; error: string } {
  const upperCode  = code.trim().toUpperCase();
  const coupons    = getCoupons();
  const coupon     = coupons.find((c) => c.code.toUpperCase() === upperCode);
  if (!coupon) return { ok: true };
  const couponType = normalizeCouponType(coupon.type, coupon.firstTimeOnly);
  if (couponType !== "welcome") return { ok: true };
  const normalized = normalizePhone(phone);
  const usedBy     = coupon.used_by ?? [];
  if (usedBy.includes(normalized)) {
    return { ok: false, error: "Already used this welcome offer" };
  }
  return { ok: true };
}
