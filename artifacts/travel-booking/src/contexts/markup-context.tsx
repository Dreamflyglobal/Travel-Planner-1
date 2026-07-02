import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import {
  warmConvenienceFeeCache,
  warmHiddenMarkupCache,
  warmAgentMarkupCache,
  type MarkupSettings,
} from "@/lib/pricing";

const DEFAULT_MARKUP: MarkupSettings = {
  flights:  { value: 0, type: "flat" },
  hotels:   { value: 0, type: "flat" },
  buses:    { value: 0, type: "flat" },
  packages: { value: 0, type: "flat" },
};

function normalizeMU(raw: Partial<MarkupSettings>): MarkupSettings {
  const def = { value: 0, type: "flat" as const };
  return {
    flights:  { ...def, ...raw?.flights  },
    hotels:   { ...def, ...raw?.hotels   },
    buses:    { ...def, ...raw?.buses    },
    packages: { ...def, ...raw?.packages },
  };
}

async function fetchSetting<T>(ns: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`/api/settings/${ns}`);
    if (!res.ok) return fallback;
    const data = await res.json() as object;
    return (Object.keys(data).length > 0 ? data : fallback) as T;
  } catch {
    return fallback;
  }
}

async function putSetting(ns: string, data: unknown): Promise<void> {
  try {
    await fetch(`/api/settings/${ns}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  } catch { /* noop */ }
}

interface MarkupContextValue {
  simpleMarkup: number;
  simpleMarkupType: "fixed" | "percentage";
  convenienceFee: MarkupSettings;
  hiddenMarkup: MarkupSettings;
  agentMarkup: MarkupSettings;
  isLoading: boolean;
  saveSimpleMarkup: (value: number, type: "fixed" | "percentage") => Promise<void>;
  saveConvenienceFee: (settings: MarkupSettings) => Promise<void>;
  saveHiddenMarkup: (settings: MarkupSettings) => Promise<void>;
  saveAgentMarkup: (settings: MarkupSettings) => Promise<void>;
  reload: () => Promise<void>;
}

const MarkupContext = createContext<MarkupContextValue | null>(null);

export function MarkupProvider({ children }: { children: ReactNode }) {
  const [simpleMarkup, setSimpleMarkup] = useState<number>(() => {
    try { return parseFloat(localStorage.getItem("markup") || "0"); } catch { return 0; }
  });
  const [simpleMarkupType, setSimpleMarkupType] = useState<"fixed" | "percentage">(() => {
    try { return (localStorage.getItem("markupType") as "fixed" | "percentage") || "percentage"; } catch { return "percentage"; }
  });
  const [convenienceFee, setConvenienceFee] = useState<MarkupSettings>(DEFAULT_MARKUP);
  const [hiddenMarkup, setHiddenMarkup] = useState<MarkupSettings>(DEFAULT_MARKUP);
  const [agentMarkup, setAgentMarkup] = useState<MarkupSettings>(DEFAULT_MARKUP);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [sm, cf, hm, am] = await Promise.all([
        fetchSetting<{ value: number; type: "fixed" | "percentage" }>(
          "markup_simple",
          { value: simpleMarkup, type: simpleMarkupType },
        ),
        fetchSetting<Partial<MarkupSettings>>("markup_convenience", {}),
        fetchSetting<Partial<MarkupSettings>>("markup_hidden", {}),
        fetchSetting<Partial<MarkupSettings>>("markup_agent", {}),
      ]);

      const sv = sm?.value ?? 0;
      const st = sm?.type ?? "percentage";
      setSimpleMarkup(sv);
      setSimpleMarkupType(st);
      localStorage.setItem("markup", sv.toString());
      localStorage.setItem("markupType", st);

      const cfNorm = normalizeMU(cf);
      const hmNorm = normalizeMU(hm);
      const amNorm = normalizeMU(am);

      setConvenienceFee(cfNorm);
      setHiddenMarkup(hmNorm);
      setAgentMarkup(amNorm);

      warmConvenienceFeeCache(cfNorm);
      warmHiddenMarkupCache(hmNorm);
      warmAgentMarkupCache(amNorm);

      localStorage.setItem("markup_settings_v2", JSON.stringify(cfNorm));
      localStorage.setItem("hidden_markup_v1", JSON.stringify(hmNorm));
      localStorage.setItem("agent_markup_v1", JSON.stringify(amNorm));
    } catch { /* noop */ } finally {
      setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
    const onFocus = () => { void load(); };
    window.addEventListener("focus", onFocus);
    // Periodic sync: propagate markup changes to all open tabs automatically
    const intervalId = setInterval(() => { void load(); }, 60_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      clearInterval(intervalId);
    };
  }, [load]);

  const saveSimpleMarkup = useCallback(async (value: number, type: "fixed" | "percentage") => {
    setSimpleMarkup(value);
    setSimpleMarkupType(type);
    localStorage.setItem("markup", value.toString());
    localStorage.setItem("markupType", type);
    await putSetting("markup_simple", { value, type });
  }, []);

  const saveConvenienceFee = useCallback(async (settings: MarkupSettings) => {
    const norm = normalizeMU(settings);
    setConvenienceFee(norm);
    warmConvenienceFeeCache(norm);
    localStorage.setItem("markup_settings_v2", JSON.stringify(norm));
    await putSetting("markup_convenience", norm);
  }, []);

  const saveHiddenMarkup = useCallback(async (settings: MarkupSettings) => {
    const norm = normalizeMU(settings);
    setHiddenMarkup(norm);
    warmHiddenMarkupCache(norm);
    localStorage.setItem("hidden_markup_v1", JSON.stringify(norm));
    await putSetting("markup_hidden", norm);
  }, []);

  const saveAgentMarkup = useCallback(async (settings: MarkupSettings) => {
    const norm = normalizeMU(settings);
    setAgentMarkup(norm);
    warmAgentMarkupCache(norm);
    localStorage.setItem("agent_markup_v1", JSON.stringify(norm));
    await putSetting("markup_agent", norm);
  }, []);

  return (
    <MarkupContext.Provider
      value={{
        simpleMarkup,
        simpleMarkupType,
        convenienceFee,
        hiddenMarkup,
        agentMarkup,
        isLoading,
        saveSimpleMarkup,
        saveConvenienceFee,
        saveHiddenMarkup,
        saveAgentMarkup,
        reload: load,
      }}
    >
      {children}
    </MarkupContext.Provider>
  );
}

export function useMarkupContext(): MarkupContextValue {
  const ctx = useContext(MarkupContext);
  if (!ctx) throw new Error("useMarkupContext must be used within MarkupProvider");
  return ctx;
}
