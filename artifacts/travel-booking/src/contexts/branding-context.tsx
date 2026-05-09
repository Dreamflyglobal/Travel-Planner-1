import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from "react";
import { APP_NAME, APP_TAGLINE } from "@/lib/app-config";

export type BrandingSettings = {
  companyName: string;
  tagline: string;
  logoUrl: string | null;
  faviconUrl: string | null;
};

const NAMESPACE = "branding";
const CACHE_KEY = "branding_settings_cache";

export const DEFAULT_BRANDING: BrandingSettings = {
  companyName: APP_NAME,
  tagline:     APP_TAGLINE,
  logoUrl:     null,
  faviconUrl:  null,
};

function sanitize(raw: Partial<BrandingSettings>): BrandingSettings {
  return {
    companyName: raw.companyName?.trim()  || DEFAULT_BRANDING.companyName,
    tagline:     raw.tagline?.trim()      || DEFAULT_BRANDING.tagline,
    logoUrl:     raw.logoUrl   ?? null,
    faviconUrl:  raw.faviconUrl ?? null,
  };
}

function readCache(): BrandingSettings {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return DEFAULT_BRANDING;
    return sanitize(JSON.parse(raw) as Partial<BrandingSettings>);
  } catch {
    return DEFAULT_BRANDING;
  }
}

function writeCache(s: BrandingSettings) {
  try { window.localStorage.setItem(CACHE_KEY, JSON.stringify(s)); } catch { /* noop */ }
}

function applyFavicon(faviconUrl: string | null) {
  if (typeof document === "undefined") return;
  const href = faviconUrl || "/favicon.svg";
  document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]').forEach((n) => n.parentNode?.removeChild(n));
  const link = document.createElement("link");
  link.rel = "icon";
  if (faviconUrl?.startsWith("data:")) {
    const m = /^data:([^;]+);/.exec(faviconUrl);
    if (m?.[1]) link.type = m[1];
  } else if (href.endsWith(".svg")) {
    link.type = "image/svg+xml";
  }
  link.href = href;
  document.head.appendChild(link);
}

function applyTitle(name: string) {
  if (typeof document !== "undefined") document.title = name;
}

type BrandingContextValue = {
  branding: BrandingSettings;
  updateBranding: (patch: Partial<BrandingSettings>) => Promise<void>;
  resetBranding: () => Promise<void>;
  saving: boolean;
};

const BrandingContext = createContext<BrandingContextValue | undefined>(undefined);

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<BrandingSettings>(() => readCache());
  const [saving, setSaving] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function fetchFromServer(signal?: AbortSignal): Promise<BrandingSettings | null> {
    try {
      const res = await fetch(`/api/settings/${NAMESPACE}`, { signal });
      if (!res.ok) return null;
      const json = await res.json() as Partial<BrandingSettings>;
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
      setBranding(fresh);
      writeCache(fresh);
    }
  }

  useEffect(() => {
    loadFromServer();
    // Re-fetch when the user returns to the tab — catches changes made on another device
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

  useEffect(() => {
    applyFavicon(branding.faviconUrl);
    applyTitle(branding.companyName);
  }, [branding.faviconUrl, branding.companyName]);

  const updateBranding = useCallback(async (patch: Partial<BrandingSettings>) => {
    const next = sanitize({ ...branding, ...patch });
    setBranding(next);
    writeCache(next);
    setSaving(true);
    try {
      const res = await fetch(`/api/settings/${NAMESPACE}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(next),
      });
      if (!res.ok) throw new Error(await res.text());
    } catch (e) {
      console.error("[branding] Failed to persist to server:", e);
    } finally {
      setSaving(false);
    }
  }, [branding]);

  const resetBranding = useCallback(async () => {
    setBranding(DEFAULT_BRANDING);
    writeCache(DEFAULT_BRANDING);
    try {
      window.localStorage.removeItem(CACHE_KEY);
    } catch { /* noop */ }
    setSaving(true);
    try {
      await fetch(`/api/settings/${NAMESPACE}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(DEFAULT_BRANDING),
      });
    } catch (e) {
      console.error("[branding] Failed to reset on server:", e);
    } finally {
      setSaving(false);
    }
  }, []);

  return (
    <BrandingContext.Provider value={{ branding, updateBranding, resetBranding, saving }}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding(): BrandingContextValue {
  const ctx = useContext(BrandingContext);
  if (!ctx) throw new Error("useBranding must be used inside <BrandingProvider>");
  return ctx;
}
