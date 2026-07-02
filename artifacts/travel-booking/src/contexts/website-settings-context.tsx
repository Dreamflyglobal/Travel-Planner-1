import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useRef,
  type ReactNode,
} from "react";

export type WebsiteSettings = {
  facebookUrl: string;
  instagramUrl: string;
  twitterUrl: string;
  whatsappEnabled: boolean;
  whatsappNumber: string;
  bannerEnabled: boolean;
  bannerText: string;
  bannerOffer: string;
  bannerImage: string;
  maintenanceMode: boolean;
  maintenanceMessage: string;
};

const NAMESPACE = "website";
const CACHE_KEY = "website_settings_cache";

export const DEFAULT_WEBSITE_SETTINGS: WebsiteSettings = {
  facebookUrl:        "",
  instagramUrl:       "",
  twitterUrl:         "",
  whatsappEnabled:    false,
  whatsappNumber:     "",
  bannerEnabled:      false,
  bannerText:         "",
  bannerOffer:        "",
  bannerImage:        "",
  maintenanceMode:    false,
  maintenanceMessage: "We're upgrading the experience. We'll be back shortly.",
};

function sanitize(raw: Partial<WebsiteSettings>): WebsiteSettings {
  const d = DEFAULT_WEBSITE_SETTINGS;
  return {
    facebookUrl:        typeof raw.facebookUrl === "string"        ? raw.facebookUrl        : d.facebookUrl,
    instagramUrl:       typeof raw.instagramUrl === "string"       ? raw.instagramUrl       : d.instagramUrl,
    twitterUrl:         typeof raw.twitterUrl === "string"         ? raw.twitterUrl         : d.twitterUrl,
    whatsappEnabled:    typeof raw.whatsappEnabled === "boolean"   ? raw.whatsappEnabled    : d.whatsappEnabled,
    whatsappNumber:     typeof raw.whatsappNumber === "string"     ? raw.whatsappNumber     : d.whatsappNumber,
    bannerEnabled:      typeof raw.bannerEnabled === "boolean"     ? raw.bannerEnabled      : d.bannerEnabled,
    bannerText:         typeof raw.bannerText === "string"         ? raw.bannerText         : d.bannerText,
    bannerOffer:        typeof raw.bannerOffer === "string"        ? raw.bannerOffer        : d.bannerOffer,
    bannerImage:        typeof raw.bannerImage === "string"        ? raw.bannerImage        : d.bannerImage,
    maintenanceMode:    typeof raw.maintenanceMode === "boolean"   ? raw.maintenanceMode    : d.maintenanceMode,
    maintenanceMessage: typeof raw.maintenanceMessage === "string" && raw.maintenanceMessage.trim()
                          ? raw.maintenanceMessage
                          : d.maintenanceMessage,
  };
}

function readCache(): WebsiteSettings {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return DEFAULT_WEBSITE_SETTINGS;
    return sanitize(JSON.parse(raw) as Partial<WebsiteSettings>);
  } catch {
    return DEFAULT_WEBSITE_SETTINGS;
  }
}

function writeCache(s: WebsiteSettings) {
  try { window.localStorage.setItem(CACHE_KEY, JSON.stringify(s)); } catch { /* noop */ }
}

type WebsiteSettingsContextValue = {
  settings: WebsiteSettings;
  updateSettings: (patch: Partial<WebsiteSettings>) => Promise<void>;
  resetSettings:  () => Promise<void>;
  saving: boolean;
};

const WebsiteSettingsContext = createContext<WebsiteSettingsContextValue | undefined>(undefined);

export function WebsiteSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<WebsiteSettings>(() => readCache());
  const [saving, setSaving] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function fetchFromServer(signal?: AbortSignal): Promise<WebsiteSettings | null> {
    try {
      const res = await fetch(`/api/settings/${NAMESPACE}`, { signal });
      if (!res.ok) return null;
      const json = await res.json() as Partial<WebsiteSettings>;
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

  const updateSettings = useCallback(async (patch: Partial<WebsiteSettings>) => {
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
    setSettings(DEFAULT_WEBSITE_SETTINGS);
    writeCache(DEFAULT_WEBSITE_SETTINGS);
    try { window.localStorage.removeItem(CACHE_KEY); } catch { /* noop */ }
    setSaving(true);
    try {
      await fetch(`/api/settings/${NAMESPACE}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(DEFAULT_WEBSITE_SETTINGS),
      });
    } catch (e) {
      console.error("[website-settings] Failed to reset on server:", e);
    } finally {
      setSaving(false);
    }
  }, []);

  return (
    <WebsiteSettingsContext.Provider value={{ settings, updateSettings, resetSettings, saving }}>
      {children}
    </WebsiteSettingsContext.Provider>
  );
}

export function useWebsiteSettings(): WebsiteSettingsContextValue {
  const ctx = useContext(WebsiteSettingsContext);
  if (!ctx) {
    return {
      settings:       DEFAULT_WEBSITE_SETTINGS,
      updateSettings: async () => {},
      resetSettings:  async () => {},
      saving:         false,
    };
  }
  return ctx;
}

export function sanitizeWhatsappNumber(input: string): string {
  return (input || "").replace(/[^0-9]/g, "");
}
