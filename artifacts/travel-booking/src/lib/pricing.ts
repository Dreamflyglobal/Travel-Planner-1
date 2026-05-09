// ── Pricing system ─────────────────────────────────────────────────────────
//
// THREE layers of markup / fees, all admin-configurable per service:
//
//   customer_markup  – hidden profit from B2C customers (never shown)
//   agent_markup     – global default markup for B2B agents (lower than customer)
//   convenience_fee  – visible charge shown at checkout
//
// Pricing formulas:
//   Customer:  rawPrice + customerMarkup + convFee
//   Agent:     rawPrice + agentMarkup   + convFee   (agentMarkup < customerMarkup)
//   Staff:     rawPrice + customerMarkup + convFee   (same as customer — no discount)
//
// Profit split:
//   Customer booking: admin profit = customerMarkup + convFee
//   Agent booking:    admin profit = agentMarkup + convFee  (lower margin)
//                     agent earns  = customerMarkup − agentMarkup (commission)
//   Staff booking:    admin profit = customerMarkup + convFee
//                     staff earns  = incentive (configured separately)

export interface MarkupConfig {
  value: number;               // flat ₹ amount OR percentage (0–100)
  type:  "flat" | "percentage";
}

export interface MarkupSettings {
  flights:  MarkupConfig;
  hotels:   MarkupConfig;
  buses:    MarkupConfig;
  packages: MarkupConfig;
}

export type ServiceType = keyof MarkupSettings;

const DEFAULT_CONFIG: MarkupConfig = { value: 0, type: "flat" };
const DEFAULT_SETTINGS: MarkupSettings = {
  flights:  { ...DEFAULT_CONFIG },
  hotels:   { ...DEFAULT_CONFIG },
  buses:    { ...DEFAULT_CONFIG },
  packages: { ...DEFAULT_CONFIG },
};

// ── Module-level in-memory caches (warmed by MarkupProvider on mount/focus) ──

let _convenienceCache: MarkupSettings | null = null;
let _hiddenCache: MarkupSettings | null = null;
let _agentCache: MarkupSettings | null = null;

export function warmConvenienceFeeCache(settings: MarkupSettings): void {
  _convenienceCache = settings;
}
export function warmHiddenMarkupCache(settings: MarkupSettings): void {
  _hiddenCache = settings;
}
export function warmAgentMarkupCache(settings: MarkupSettings): void {
  _agentCache = settings;
}

// ── Convenience Fee (VISIBLE to customers) ────────────────────────────────

const FEE_KEY_V2 = "markup_settings_v2";
const FEE_KEY_V1 = "markup_settings";   // legacy migration

export function getMarkupSettings(): MarkupSettings {
  if (_convenienceCache) return _convenienceCache;
  try {
    const raw = localStorage.getItem(FEE_KEY_V2);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<MarkupSettings>;
      return {
        flights:  { ...DEFAULT_CONFIG, ...parsed.flights  },
        hotels:   { ...DEFAULT_CONFIG, ...parsed.hotels   },
        buses:    { ...DEFAULT_CONFIG, ...parsed.buses    },
        packages: { ...DEFAULT_CONFIG, ...parsed.packages },
      };
    }
    // Migrate from legacy flat-only format
    const old = localStorage.getItem(FEE_KEY_V1);
    if (old) {
      const oldParsed: Record<string, number> = JSON.parse(old);
      const migrated = { ...DEFAULT_SETTINGS };
      (["flights", "hotels", "buses", "packages"] as const).forEach((k) => {
        if (oldParsed[k] != null) migrated[k] = { value: oldParsed[k], type: "flat" };
      });
      return migrated;
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS };
}

export function saveMarkupSettings(settings: MarkupSettings): void {
  _convenienceCache = settings;
  localStorage.setItem(FEE_KEY_V2, JSON.stringify(settings));
}

/** Returns the visible Convenience Fee ₹ for a given raw base price + service */
export function getConvenienceFee(basePrice: number, service: ServiceType): number {
  const cfg = getMarkupSettings()[service] ?? DEFAULT_CONFIG;
  return cfg.type === "percentage"
    ? Math.round((basePrice * cfg.value) / 100)
    : Math.round(cfg.value ?? 0);
}

// ── Customer Markup (INVISIBLE to customers — B2C internal profit) ────────

const HIDDEN_MARKUP_KEY = "hidden_markup_v1";

export function getHiddenMarkupSettings(): MarkupSettings {
  if (_hiddenCache) return _hiddenCache;
  try {
    const raw = localStorage.getItem(HIDDEN_MARKUP_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<MarkupSettings>;
      return {
        flights:  { ...DEFAULT_CONFIG, ...parsed.flights  },
        hotels:   { ...DEFAULT_CONFIG, ...parsed.hotels   },
        buses:    { ...DEFAULT_CONFIG, ...parsed.buses    },
        packages: { ...DEFAULT_CONFIG, ...parsed.packages },
      };
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS };
}

export function saveHiddenMarkupSettings(settings: MarkupSettings): void {
  _hiddenCache = settings;
  localStorage.setItem(HIDDEN_MARKUP_KEY, JSON.stringify(settings));
}

/** Returns the customer markup ₹ amount for a given raw base price + service.
 *  This is never shown in the UI — it is silently absorbed into the displayed base price.
 *  Staff users also pay this (no discount). */
export function getHiddenMarkupAmount(basePrice: number, service: ServiceType): number {
  const cfg = getHiddenMarkupSettings()[service] ?? DEFAULT_CONFIG;
  return cfg.type === "percentage"
    ? Math.round((basePrice * cfg.value) / 100)
    : Math.round(cfg.value ?? 0);
}

// ── Global Agent Markup (B2B — lower than customer markup) ────────────────
//
// Admin sets a GLOBAL default agent markup per service.
// Individual agents can override with a per-agent flat ₹ amount.
// Priority:  per-agent override > global agent markup > customer markup (fallback)
//
// Agent commission per booking = customerMarkup − agentMarkup

const AGENT_MARKUP_KEY = "agent_markup_v1";

export function getAgentMarkupSettings(): MarkupSettings {
  if (_agentCache) return _agentCache;
  try {
    const raw = localStorage.getItem(AGENT_MARKUP_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<MarkupSettings>;
      return {
        flights:  { ...DEFAULT_CONFIG, ...parsed.flights  },
        hotels:   { ...DEFAULT_CONFIG, ...parsed.hotels   },
        buses:    { ...DEFAULT_CONFIG, ...parsed.buses    },
        packages: { ...DEFAULT_CONFIG, ...parsed.packages },
      };
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_SETTINGS };
}

export function saveAgentMarkupSettings(settings: MarkupSettings): void {
  _agentCache = settings;
  localStorage.setItem(AGENT_MARKUP_KEY, JSON.stringify(settings));
}

/** Returns the global default agent markup ₹ for a given raw price + service.
 *  Used when an agent has no per-agent override set. */
export function getGlobalAgentMarkupAmount(basePrice: number, service: ServiceType): number {
  const cfg = getAgentMarkupSettings()[service] ?? DEFAULT_CONFIG;
  return cfg.type === "percentage"
    ? Math.round((basePrice * cfg.value) / 100)
    : Math.round(cfg.value ?? 0);
}

// ── Agent Markup helpers ──────────────────────────────────────────────────
//
// Priority chain:
//   1. Per-agent agentMarkupFlat (stored on user object)
//   2. Global agent markup (agent_markup_v1)
//   3. Full customer markup (fallback if both are 0/null)

/**
 * Returns the effective markup ₹ amount for an agent.
 * Respects the priority: per-agent override → global agent markup → customer markup.
 */
export function getAgentEffectiveMarkup(
  rawPrice:         number,
  service:          ServiceType,
  agentMarkupFlat?: number | null,
): number {
  if (agentMarkupFlat !== undefined && agentMarkupFlat !== null) {
    return Math.round(agentMarkupFlat);
  }
  const globalAgent = getGlobalAgentMarkupAmount(rawPrice, service);
  if (globalAgent > 0) return globalAgent;
  return getHiddenMarkupAmount(rawPrice, service);
}

/**
 * Returns the commission (savings) earned by an agent per unit.
 * commission = customerMarkup − agentMarkup
 */
export function getAgentCommissionAmount(
  rawPrice:        number,
  service:         ServiceType,
  agentMarkupFlat: number,
): number {
  const normalMarkup = getHiddenMarkupAmount(rawPrice, service);
  return Math.max(0, normalMarkup - agentMarkupFlat);
}

// ── Combined helpers ──────────────────────────────────────────────────────

/**
 * Returns the price charged to a customer / agent / staff after applying all fees.
 *
 *   Customer:  rawPrice + customerMarkup + convFee
 *   Agent:     rawPrice + agentMarkup   + convFee  (lower markup)
 *   Staff:     rawPrice + customerMarkup + convFee  (same as customer)
 *
 * For UI display the caller should separately compute:
 *   displayedBase = rawPrice + effectiveMarkup  (markup silently absorbed)
 *   displayedFee  = convenienceFee
 */
export function getPriceForUser(
  rawPrice:        number,
  service:         ServiceType,
  role:            "user" | "admin" | "agent" | "staff" | null,
  agentMarkupFlat: number | null = null,
): { displayPrice: number; savings: number | null } {
  const hiddenMarkup   = getHiddenMarkupAmount(rawPrice, service);
  const convenienceFee = getConvenienceFee(rawPrice, service);

  if (role === "agent") {
    const effectiveMarkup = agentMarkupFlat !== null
      ? Math.max(0, agentMarkupFlat)
      : getGlobalAgentMarkupAmount(rawPrice, service);
    const agentBase  = rawPrice + effectiveMarkup;
    const agentTotal = agentBase + convenienceFee;
    const b2cTotal   = rawPrice + hiddenMarkup + convenienceFee;
    const commission = Math.max(0, b2cTotal - agentTotal);
    return { displayPrice: agentTotal, savings: commission > 0 ? commission : null };
  }

  // customer / staff / admin — all pay the full customer markup
  return { displayPrice: rawPrice + hiddenMarkup + convenienceFee, savings: null };
}

/** @deprecated Use getConvenienceFee + getHiddenMarkupAmount directly */
export function applyMarkup(basePrice: number, service: ServiceType): number {
  return basePrice + getHiddenMarkupAmount(basePrice, service) + getConvenienceFee(basePrice, service);
}

export function applyAgentDiscount(price: number, commissionPct: number): number {
  const discount = Math.round((price * commissionPct) / 100);
  return Math.max(0, price - discount);
}
