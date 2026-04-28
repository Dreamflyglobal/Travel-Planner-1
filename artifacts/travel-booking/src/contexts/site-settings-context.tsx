import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";

export type Currency = "INR" | "USD" | "EUR" | "GBP" | "AED";

export type SiteSettings = {
  contactEmail: string;
  contactPhone: string;
  paymentsEnabled: boolean;
  currency: Currency;
  bookingFee: number;
  cancellationPolicy: string;
};

const STORAGE_KEY = "site_settings_v1";

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  contactEmail: "",
  contactPhone: "",
  paymentsEnabled: true,
  currency: "INR",
  bookingFee: 0,
  cancellationPolicy: "",
};

function loadSiteSettings(): SiteSettings {
  if (typeof window === "undefined") return DEFAULT_SITE_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SITE_SETTINGS;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const settings: SiteSettings = {
      contactEmail:       typeof parsed.contactEmail === "string"  ? parsed.contactEmail       : DEFAULT_SITE_SETTINGS.contactEmail,
      contactPhone:       typeof parsed.contactPhone === "string"  ? parsed.contactPhone       : DEFAULT_SITE_SETTINGS.contactPhone,
      paymentsEnabled:    typeof parsed.paymentsEnabled === "boolean" ? parsed.paymentsEnabled : DEFAULT_SITE_SETTINGS.paymentsEnabled,
      currency:           (parsed.currency as Currency)            || DEFAULT_SITE_SETTINGS.currency,
      bookingFee:         typeof parsed.bookingFee === "number" && Number.isFinite(parsed.bookingFee) ? parsed.bookingFee : DEFAULT_SITE_SETTINGS.bookingFee,
      cancellationPolicy: typeof parsed.cancellationPolicy === "string" ? parsed.cancellationPolicy : DEFAULT_SITE_SETTINGS.cancellationPolicy,
    };
    // Scrub any previously stored API credentials from localStorage
    if ("razorpayKeyId" in parsed || "razorpaySecret" in parsed) {
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* noop */ }
    }
    return settings;
  } catch {
    return DEFAULT_SITE_SETTINGS;
  }
}

type SiteSettingsContextValue = {
  settings: SiteSettings;
  updateSettings: (patch: Partial<SiteSettings>) => void;
  resetSettings: () => void;
};

const SiteSettingsContext = createContext<SiteSettingsContextValue | undefined>(undefined);

export function SiteSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SiteSettings>(() => loadSiteSettings());

  // Cross-tab sync
  useEffect(() => {
    function handleStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY) return;
      setSettings(loadSiteSettings());
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const updateSettings = useCallback((patch: Partial<SiteSettings>) => {
    setSettings((prev) => {
      const next: SiteSettings = { ...prev, ...patch };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch (e) {
        console.error("[site-settings] Failed to save:", e);
      }
      return next;
    });
  }, []);

  const resetSettings = useCallback(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* noop */
    }
    setSettings(DEFAULT_SITE_SETTINGS);
  }, []);

  return (
    <SiteSettingsContext.Provider value={{ settings, updateSettings, resetSettings }}>
      {children}
    </SiteSettingsContext.Provider>
  );
}

export function useSiteSettings(): SiteSettingsContextValue {
  const ctx = useContext(SiteSettingsContext);
  if (!ctx) throw new Error("useSiteSettings must be used inside <SiteSettingsProvider>");
  return ctx;
}
