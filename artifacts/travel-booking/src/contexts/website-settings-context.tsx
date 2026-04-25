import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
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

export const DEFAULT_WEBSITE_SETTINGS: WebsiteSettings = {
  facebookUrl: "",
  instagramUrl: "",
  twitterUrl: "",
  whatsappEnabled: false,
  whatsappNumber: "",
  bannerEnabled: false,
  bannerText: "",
  bannerOffer: "",
  bannerImage: "",
  maintenanceMode: false,
  maintenanceMessage: "We're upgrading the experience. We'll be back shortly.",
};

const STORAGE_KEY = "website_settings_v1";

function loadWebsiteSettings(): WebsiteSettings {
  if (typeof window === "undefined") return DEFAULT_WEBSITE_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_WEBSITE_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<WebsiteSettings>;
    return {
      facebookUrl:
        typeof parsed.facebookUrl === "string"
          ? parsed.facebookUrl
          : DEFAULT_WEBSITE_SETTINGS.facebookUrl,
      instagramUrl:
        typeof parsed.instagramUrl === "string"
          ? parsed.instagramUrl
          : DEFAULT_WEBSITE_SETTINGS.instagramUrl,
      twitterUrl:
        typeof parsed.twitterUrl === "string"
          ? parsed.twitterUrl
          : DEFAULT_WEBSITE_SETTINGS.twitterUrl,
      whatsappEnabled:
        typeof parsed.whatsappEnabled === "boolean"
          ? parsed.whatsappEnabled
          : DEFAULT_WEBSITE_SETTINGS.whatsappEnabled,
      whatsappNumber:
        typeof parsed.whatsappNumber === "string"
          ? parsed.whatsappNumber
          : DEFAULT_WEBSITE_SETTINGS.whatsappNumber,
      bannerEnabled:
        typeof parsed.bannerEnabled === "boolean"
          ? parsed.bannerEnabled
          : DEFAULT_WEBSITE_SETTINGS.bannerEnabled,
      bannerText:
        typeof parsed.bannerText === "string"
          ? parsed.bannerText
          : DEFAULT_WEBSITE_SETTINGS.bannerText,
      bannerOffer:
        typeof parsed.bannerOffer === "string"
          ? parsed.bannerOffer
          : DEFAULT_WEBSITE_SETTINGS.bannerOffer,
      bannerImage:
        typeof parsed.bannerImage === "string"
          ? parsed.bannerImage
          : DEFAULT_WEBSITE_SETTINGS.bannerImage,
      maintenanceMode:
        typeof parsed.maintenanceMode === "boolean"
          ? parsed.maintenanceMode
          : DEFAULT_WEBSITE_SETTINGS.maintenanceMode,
      maintenanceMessage:
        typeof parsed.maintenanceMessage === "string"
          ? parsed.maintenanceMessage
          : DEFAULT_WEBSITE_SETTINGS.maintenanceMessage,
    };
  } catch {
    return DEFAULT_WEBSITE_SETTINGS;
  }
}

type WebsiteSettingsContextValue = {
  settings: WebsiteSettings;
  updateSettings: (patch: Partial<WebsiteSettings>) => void;
  resetSettings: () => void;
};

const WebsiteSettingsContext = createContext<
  WebsiteSettingsContextValue | undefined
>(undefined);

export function WebsiteSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<WebsiteSettings>(() =>
    loadWebsiteSettings(),
  );

  useEffect(() => {
    function handleStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY) return;
      setSettings(loadWebsiteSettings());
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const updateSettings = useCallback((patch: Partial<WebsiteSettings>) => {
    setSettings((prev) => {
      const next: WebsiteSettings = { ...prev, ...patch };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch (e) {
        console.error("[website-settings] Failed to save:", e);
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
    setSettings(DEFAULT_WEBSITE_SETTINGS);
  }, []);

  return (
    <WebsiteSettingsContext.Provider
      value={{ settings, updateSettings, resetSettings }}
    >
      {children}
    </WebsiteSettingsContext.Provider>
  );
}

export function useWebsiteSettings(): WebsiteSettingsContextValue {
  const ctx = useContext(WebsiteSettingsContext);
  if (!ctx) {
    return {
      settings: DEFAULT_WEBSITE_SETTINGS,
      updateSettings: () => {},
      resetSettings: () => {},
    };
  }
  return ctx;
}

export function sanitizeWhatsappNumber(input: string): string {
  return (input || "").replace(/[^0-9]/g, "");
}
