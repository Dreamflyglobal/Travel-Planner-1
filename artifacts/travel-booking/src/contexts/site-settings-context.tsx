import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from "react";

export type Currency = "INR" | "USD" | "EUR" | "GBP" | "AED";

export type SiteSettings = {
  contactEmail: string;
  contactPhone: string;
  paymentsEnabled: boolean;
  currency: Currency;
  bookingFee: number;
  cancellationPolicy: string;
};

const NAMESPACE = "site";
const CACHE_KEY = "site_settings_cache";

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  contactEmail:       "",
  contactPhone:       "",
  paymentsEnabled:    true,
  currency:           "INR",
  bookingFee:         0,
  cancellationPolicy: "",
};

const VALID_CURRENCIES: Currency[] = ["INR", "USD", "EUR", "GBP", "AED"];

function sanitize(raw: Partial<SiteSettings>): SiteSettings {
  return {
    contactEmail:       typeof raw.contactEmail === "string" ? raw.contactEmail : DEFAULT_SITE_SETTINGS.contactEmail,
    contactPhone:       typeof raw.contactPhone === "string" ? raw.contactPhone : DEFAULT_SITE_SETTINGS.contactPhone,
    paymentsEnabled:    typeof raw.paymentsEnabled === "boolean" ? raw.paymentsEnabled : DEFAULT_SITE_SETTINGS.paymentsEnabled,
    currency:           VALID_CURRENCIES.includes(raw.currency as Currency) ? raw.currency as Currency : DEFAULT_SITE_SETTINGS.currency,
    bookingFee:         typeof raw.bookingFee === "number" && Number.isFinite(raw.bookingFee) ? raw.bookingFee : DEFAULT_SITE_SETTINGS.bookingFee,
    cancellationPolicy: typeof raw.cancellationPolicy === "string" ? raw.cancellationPolicy : DEFAULT_SITE_SETTINGS.cancellationPolicy,
  };
}

function readCache(): SiteSettings {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return DEFAULT_SITE_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<SiteSettings>;
    // Scrub legacy keys (razorpay credentials must never be cached locally)
    if ("razorpayKeyId" in parsed || "razorpaySecret" in parsed) {
      delete (parsed as Record<string, unknown>).razorpayKeyId;
      delete (parsed as Record<string, unknown>).razorpaySecret;
    }
    return sanitize(parsed);
  } catch {
    return DEFAULT_SITE_SETTINGS;
  }
}

function writeCache(s: SiteSettings) {
  try { window.localStorage.setItem(CACHE_KEY, JSON.stringify(s)); } catch { /* noop */ }
}

type SiteSettingsContextValue = {
  settings: SiteSettings;
  updateSettings: (patch: Partial<SiteSettings>) => Promise<void>;
  resetSettings:  () => Promise<void>;
  saving: boolean;
};

const SiteSettingsContext = createContext<SiteSettingsContextValue | undefined>(undefined);

export function SiteSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SiteSettings>(() => readCache());
  const [saving, setSaving] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function fetchFromServer(signal?: AbortSignal): Promise<SiteSettings | null> {
    try {
      const res = await fetch(`/api/settings/${NAMESPACE}`, { signal });
      if (!res.ok) return null;
      const json = await res.json() as Partial<SiteSettings>;
      if (!json || typeof json !== "object") return null;
      return sanitize(json);
    } catch {
      return null;
    }
  }

  async function loadFromServer() {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const fresh = await fetchFromServer(ctrl.signal);
    if (fresh) {
      setSettings(fresh);
      writeCache(fresh);
    }
  }

  useEffect(() => {
    loadFromServer();
    function onFocus() { loadFromServer(); }
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      abortRef.current?.abort();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateSettings = useCallback(async (patch: Partial<SiteSettings>) => {
    const next = sanitize({ ...settings, ...patch });
    setSettings(next);
    writeCache(next);
    setSaving(true);
    try {
      const token = (() => { try { return localStorage.getItem("admin_token") ?? localStorage.getItem("b2c_token"); } catch { return null; } })();
      const res = await fetch(`/api/settings/${NAMESPACE}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body:    JSON.stringify(next),
      });
      if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
    } finally {
      setSaving(false);
    }
  }, [settings]);

  const resetSettings = useCallback(async () => {
    setSettings(DEFAULT_SITE_SETTINGS);
    writeCache(DEFAULT_SITE_SETTINGS);
    try { window.localStorage.removeItem(CACHE_KEY); } catch { /* noop */ }
    setSaving(true);
    try {
      await fetch(`/api/settings/${NAMESPACE}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(DEFAULT_SITE_SETTINGS),
      });
    } catch (e) {
      console.error("[site-settings] Failed to reset on server:", e);
    } finally {
      setSaving(false);
    }
  }, []);

  return (
    <SiteSettingsContext.Provider value={{ settings, updateSettings, resetSettings, saving }}>
      {children}
    </SiteSettingsContext.Provider>
  );
}

export function useSiteSettings(): SiteSettingsContextValue {
  const ctx = useContext(SiteSettingsContext);
  if (!ctx) throw new Error("useSiteSettings must be used inside <SiteSettingsProvider>");
  return ctx;
}
