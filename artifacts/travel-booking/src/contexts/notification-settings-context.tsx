import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from "react";

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

const NAMESPACE = "notification";
const CACHE_KEY = "notification_settings_cache";

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  emailEnabled:         false,
  smtpEmail:            "",
  smtpPassword:         "",
  popupEnabled:         true,
  popupMessage:         "Your booking has been confirmed! A confirmation has been sent to your email.",
  smsEnabled:           false,
  smsProvider:          "",
  whatsappNotifEnabled: false,
  whatsappNotifNumber:  "",
};

function sanitize(raw: Partial<NotificationSettings>): NotificationSettings {
  const d = DEFAULT_NOTIFICATION_SETTINGS;
  return {
    emailEnabled:         typeof raw.emailEnabled === "boolean"         ? raw.emailEnabled         : d.emailEnabled,
    smtpEmail:            typeof raw.smtpEmail === "string"             ? raw.smtpEmail             : d.smtpEmail,
    smtpPassword:         typeof raw.smtpPassword === "string"          ? raw.smtpPassword          : d.smtpPassword,
    popupEnabled:         typeof raw.popupEnabled === "boolean"         ? raw.popupEnabled          : d.popupEnabled,
    popupMessage:         typeof raw.popupMessage === "string" && raw.popupMessage.trim()
                            ? raw.popupMessage
                            : d.popupMessage,
    smsEnabled:           typeof raw.smsEnabled === "boolean"           ? raw.smsEnabled            : d.smsEnabled,
    smsProvider:          typeof raw.smsProvider === "string"           ? raw.smsProvider           : d.smsProvider,
    whatsappNotifEnabled: typeof raw.whatsappNotifEnabled === "boolean" ? raw.whatsappNotifEnabled  : d.whatsappNotifEnabled,
    whatsappNotifNumber:  typeof raw.whatsappNotifNumber === "string"   ? raw.whatsappNotifNumber   : d.whatsappNotifNumber,
  };
}

function readCache(): NotificationSettings {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return DEFAULT_NOTIFICATION_SETTINGS;
    return sanitize(JSON.parse(raw) as Partial<NotificationSettings>);
  } catch {
    return DEFAULT_NOTIFICATION_SETTINGS;
  }
}

function writeCache(s: NotificationSettings) {
  try { window.localStorage.setItem(CACHE_KEY, JSON.stringify(s)); } catch { /* noop */ }
}

type NotificationSettingsContextValue = {
  settings: NotificationSettings;
  updateSettings: (patch: Partial<NotificationSettings>) => Promise<void>;
  resetSettings:  () => Promise<void>;
  saving: boolean;
};

const NotificationSettingsContext = createContext<NotificationSettingsContextValue | undefined>(undefined);

export function NotificationSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<NotificationSettings>(() => readCache());
  const [saving, setSaving] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function fetchFromServer(signal?: AbortSignal): Promise<NotificationSettings | null> {
    try {
      const res = await fetch(`/api/settings/${NAMESPACE}`, { signal });
      if (!res.ok) return null;
      const json = await res.json() as Partial<NotificationSettings>;
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

  const updateSettings = useCallback(async (patch: Partial<NotificationSettings>) => {
    const next = sanitize({ ...settings, ...patch });
    setSettings(next);
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
      console.error("[notification-settings] Failed to persist to server:", e);
    } finally {
      setSaving(false);
    }
  }, [settings]);

  const resetSettings = useCallback(async () => {
    setSettings(DEFAULT_NOTIFICATION_SETTINGS);
    writeCache(DEFAULT_NOTIFICATION_SETTINGS);
    try { window.localStorage.removeItem(CACHE_KEY); } catch { /* noop */ }
    setSaving(true);
    try {
      await fetch(`/api/settings/${NAMESPACE}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(DEFAULT_NOTIFICATION_SETTINGS),
      });
    } catch (e) {
      console.error("[notification-settings] Failed to reset on server:", e);
    } finally {
      setSaving(false);
    }
  }, []);

  return (
    <NotificationSettingsContext.Provider value={{ settings, updateSettings, resetSettings, saving }}>
      {children}
    </NotificationSettingsContext.Provider>
  );
}

export function useNotificationSettings(): NotificationSettingsContextValue {
  const ctx = useContext(NotificationSettingsContext);
  if (!ctx) throw new Error("useNotificationSettings must be used inside <NotificationSettingsProvider>");
  return ctx;
}
