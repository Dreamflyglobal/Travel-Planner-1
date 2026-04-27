import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { APP_NAME, APP_TAGLINE } from "@/lib/app-config";

export type BrandingSettings = {
  companyName: string;
  tagline: string;
  logoUrl: string | null;
  faviconUrl: string | null;
};

const STORAGE_KEY = "branding_settings_v1";

const DEFAULT_BRANDING: BrandingSettings = {
  companyName: APP_NAME,
  tagline:     APP_TAGLINE,
  logoUrl:     null,
  faviconUrl:  null,
};

function loadBranding(): BrandingSettings {
  if (typeof window === "undefined") return DEFAULT_BRANDING;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_BRANDING;
    const parsed = JSON.parse(raw) as Partial<BrandingSettings>;
    return {
      companyName: parsed.companyName?.trim() || DEFAULT_BRANDING.companyName,
      tagline: parsed.tagline?.trim() || DEFAULT_BRANDING.tagline,
      logoUrl: parsed.logoUrl ?? null,
      faviconUrl: parsed.faviconUrl ?? null,
    };
  } catch {
    return DEFAULT_BRANDING;
  }
}

function applyFavicon(faviconUrl: string | null) {
  if (typeof document === "undefined") return;
  const href = faviconUrl || "/favicon.svg";
  // Remove all existing favicon link tags so the browser picks up the new one
  const existing = document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]');
  existing.forEach((node) => node.parentNode?.removeChild(node));
  const link = document.createElement("link");
  link.rel = "icon";
  if (faviconUrl && faviconUrl.startsWith("data:")) {
    const match = /^data:([^;]+);/.exec(faviconUrl);
    if (match?.[1]) link.type = match[1];
  } else if (href.endsWith(".svg")) {
    link.type = "image/svg+xml";
  }
  link.href = href;
  document.head.appendChild(link);
}

function applyTitle(companyName: string) {
  if (typeof document === "undefined") return;
  document.title = companyName;
}

type BrandingContextValue = {
  branding: BrandingSettings;
  updateBranding: (patch: Partial<BrandingSettings>) => void;
  resetBranding: () => void;
};

const BrandingContext = createContext<BrandingContextValue | undefined>(undefined);

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<BrandingSettings>(() => loadBranding());

  // Apply favicon + title on mount and any time branding changes
  useEffect(() => {
    applyFavicon(branding.faviconUrl);
    applyTitle(branding.companyName);
  }, [branding.faviconUrl, branding.companyName]);

  // Sync across tabs
  useEffect(() => {
    function handleStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY) return;
      setBranding(loadBranding());
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const updateBranding = useCallback((patch: Partial<BrandingSettings>) => {
    setBranding((prev) => {
      const next: BrandingSettings = {
        companyName: patch.companyName !== undefined ? patch.companyName.trim() || prev.companyName : prev.companyName,
        tagline: patch.tagline !== undefined ? patch.tagline.trim() || prev.tagline : prev.tagline,
        logoUrl: patch.logoUrl !== undefined ? patch.logoUrl : prev.logoUrl,
        faviconUrl: patch.faviconUrl !== undefined ? patch.faviconUrl : prev.faviconUrl,
      };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch (e) {
        console.error("[branding] Failed to save settings:", e);
      }
      return next;
    });
  }, []);

  const resetBranding = useCallback(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* noop */
    }
    setBranding(DEFAULT_BRANDING);
  }, []);

  return (
    <BrandingContext.Provider value={{ branding, updateBranding, resetBranding }}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding(): BrandingContextValue {
  const ctx = useContext(BrandingContext);
  if (!ctx) throw new Error("useBranding must be used inside <BrandingProvider>");
  return ctx;
}
