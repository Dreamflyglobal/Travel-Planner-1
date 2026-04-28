import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";

export type NotificationSettings = {
  emailEnabled: boolean;
  smtpEmail: string;
  smtpPassword: string;
  popupEnabled: boolean;
  popupMessage: string;
  smsEnabled: boolean;
  smsProvider: string;
  whatsappNotifEnabled: boolean;
  whatsappNotifNumber: string;
};

const STORAGE_KEY = "notification_settings_v1";

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  emailEnabled: false,
  smtpEmail: "",
  smtpPassword: "",
  popupEnabled: true,
  popupMessage: "Your booking has been confirmed! A confirmation has been sent to your email.",
  smsEnabled: false,
  smsProvider: "",
  whatsappNotifEnabled: false,
  whatsappNotifNumber: "",
};

function loadSettings(): NotificationSettings {
  if (typeof window === "undefined") return DEFAULT_NOTIFICATION_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_NOTIFICATION_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<NotificationSettings>;
    return {
      emailEnabled: typeof parsed.emailEnabled === "boolean" ? parsed.emailEnabled : DEFAULT_NOTIFICATION_SETTINGS.emailEnabled,
      smtpEmail: typeof parsed.smtpEmail === "string" ? parsed.smtpEmail : DEFAULT_NOTIFICATION_SETTINGS.smtpEmail,
      smtpPassword: typeof parsed.smtpPassword === "string" ? parsed.smtpPassword : DEFAULT_NOTIFICATION_SETTINGS.smtpPassword,
      popupEnabled: typeof parsed.popupEnabled === "boolean" ? parsed.popupEnabled : DEFAULT_NOTIFICATION_SETTINGS.popupEnabled,
      popupMessage: typeof parsed.popupMessage === "string" && parsed.popupMessage.trim()
        ? parsed.popupMessage
        : DEFAULT_NOTIFICATION_SETTINGS.popupMessage,
      smsEnabled: typeof parsed.smsEnabled === "boolean" ? parsed.smsEnabled : DEFAULT_NOTIFICATION_SETTINGS.smsEnabled,
      smsProvider: typeof parsed.smsProvider === "string" ? parsed.smsProvider : DEFAULT_NOTIFICATION_SETTINGS.smsProvider,
      whatsappNotifEnabled: typeof parsed.whatsappNotifEnabled === "boolean" ? parsed.whatsappNotifEnabled : DEFAULT_NOTIFICATION_SETTINGS.whatsappNotifEnabled,
      whatsappNotifNumber: typeof parsed.whatsappNotifNumber === "string" ? parsed.whatsappNotifNumber : DEFAULT_NOTIFICATION_SETTINGS.whatsappNotifNumber,
    };
  } catch {
    return DEFAULT_NOTIFICATION_SETTINGS;
  }
}

type NotificationSettingsContextValue = {
  settings: NotificationSettings;
  updateSettings: (patch: Partial<NotificationSettings>) => void;
  resetSettings: () => void;
};

const NotificationSettingsContext = createContext<NotificationSettingsContextValue | undefined>(undefined);

export function NotificationSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<NotificationSettings>(() => loadSettings());

  // Cross-tab sync — whenever another tab changes settings, pick them up
  useEffect(() => {
    function handleStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY) return;
      setSettings(loadSettings());
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const updateSettings = useCallback((patch: Partial<NotificationSettings>) => {
    setSettings((prev) => {
      const next: NotificationSettings = { ...prev, ...patch };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch (e) {
        console.error("[notifications] Failed to save:", e);
      }
      return next;
    });
  }, []);

  const resetSettings = useCallback(() => {
    try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
    setSettings(DEFAULT_NOTIFICATION_SETTINGS);
  }, []);

  return (
    <NotificationSettingsContext.Provider value={{ settings, updateSettings, resetSettings }}>
      {children}
    </NotificationSettingsContext.Provider>
  );
}

export function useNotificationSettings(): NotificationSettingsContextValue {
  const ctx = useContext(NotificationSettingsContext);
  if (!ctx) throw new Error("useNotificationSettings must be used inside <NotificationSettingsProvider>");
  return ctx;
}
