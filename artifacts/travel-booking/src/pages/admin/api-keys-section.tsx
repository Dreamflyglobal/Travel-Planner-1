import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Key,
  Save,
  RotateCcw,
  Eye,
  EyeOff,
  Plane,
  Bus,
  Building2,
  CreditCard,
  Lock,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type KeyMeta = { masked: string; set: boolean; source: "db" | "env" | "none" };

type KeysResponse = {
  success: boolean;
  keys: {
    flightApiKey:     KeyMeta;
    busApiKey:        KeyMeta;
    hotelApiKey:      KeyMeta;
    hotelApiSecret:   KeyMeta;
    tboApiKey:        KeyMeta;
    paymentApiKey:    KeyMeta;
    paymentApiSecret: KeyMeta;
  };
  updatedAt: string | null;
};

type FieldKey = "flightApiKey" | "busApiKey" | "hotelApiKey" | "hotelApiSecret" | "tboApiKey" | "paymentApiKey" | "paymentApiSecret";

const FIELDS: Array<{
  key:         FieldKey;
  label:       string;
  description: string;
  Icon:        typeof Plane;
  group:       "flight" | "bus" | "hotel" | "tbo" | "payment";
  sensitive?:  boolean;
  hideTest?:   boolean;
}> = [
  {
    key:         "flightApiKey",
    label:       "TripJack API Key",
    description: "API key for TripJack flight search, fare-quote, SSR and booking.",
    Icon:        Plane,
    group:       "flight",
  },
  {
    key:         "tboApiKey",
    label:       "TBO API Key",
    description: "API key for Travel Boutique Online (TBO) flight provider.",
    Icon:        Plane,
    group:       "tbo",
  },
  {
    key:         "busApiKey",
    label:       "Bus API Key",
    description: "RapidAPI / bus provider key.",
    Icon:        Bus,
    group:       "bus",
  },
  {
    key:         "hotelApiKey",
    label:       "HotelBeds API Key",
    description: "HotelBeds API key — required for live hotel search.",
    Icon:        Building2,
    group:       "hotel",
  },
  {
    key:         "hotelApiSecret",
    label:       "HotelBeds API Secret",
    description: "HotelBeds API secret — used to compute X-Signature for every request.",
    Icon:        Lock,
    group:       "hotel",
    sensitive:   true,
    hideTest:    true,
  },
  {
    key:         "paymentApiKey",
    label:       "Razorpay Key ID",
    description: "Razorpay publishable key — starts with rzp_test_ or rzp_live_.",
    Icon:        CreditCard,
    group:       "payment",
  },
  {
    key:         "paymentApiSecret",
    label:       "Razorpay Key Secret",
    description: "Razorpay secret key — stored server-side only, never sent to the browser.",
    Icon:        Lock,
    group:       "payment",
    sensitive:   true,
    hideTest:    true,
  },
];

const EMPTY_DRAFTS: Record<FieldKey, string> = {
  flightApiKey: "", busApiKey: "", hotelApiKey: "", hotelApiSecret: "",
  tboApiKey: "", paymentApiKey: "", paymentApiSecret: "",
};

const EMPTY_REVEAL: Record<FieldKey, boolean> = {
  flightApiKey: false, busApiKey: false, hotelApiKey: false, hotelApiSecret: false,
  tboApiKey: false, paymentApiKey: false, paymentApiSecret: false,
};

export function ApiKeysSection() {
  const { toast } = useToast();
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [data,       setData]       = useState<KeysResponse | null>(null);
  const [drafts,     setDrafts]     = useState<Record<FieldKey, string>>(EMPTY_DRAFTS);
  const [reveal,     setReveal]     = useState<Record<FieldKey, boolean>>(EMPTY_REVEAL);
  const [savedFlash, setSavedFlash] = useState(false);
  const [testing,    setTesting]    = useState<string | null>(null);

  async function fetchKeys() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/api-keys", {
        credentials: "include",
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          setError("Admin login required — please log in to the admin panel first.");
          return;
        }
        throw new Error("Failed to load API keys");
      }
      const json = (await res.json()) as KeysResponse;
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load API keys");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchKeys();
  }, []);

  function patchDraft(key: FieldKey, value: string) {
    setDrafts((prev) => ({ ...prev, [key]: value }));
  }

  function toggleReveal(key: FieldKey) {
    setReveal((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const dirty = FIELDS.some((f) => drafts[f.key].trim().length > 0);

  async function handleSave() {
    if (!dirty) return;
    setSaving(true);
    try {
      const payload: Record<string, string> = {};
      for (const f of FIELDS) {
        const v = drafts[f.key];
        if (v.trim().length > 0) payload[f.key] = v.trim();
      }

      const res = await fetch("/api/admin/api-keys", {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body:        JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Failed to save API keys");
      }
      const json = (await res.json()) as KeysResponse;
      setData(json);
      setDrafts(EMPTY_DRAFTS);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 3000);
      toast({ title: "Settings saved", description: "API keys stored securely on the server." });
    } catch (e) {
      toast({
        title:       "Save failed",
        description: e instanceof Error ? e.message : "Could not save API keys.",
        variant:     "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  function handleDiscard() {
    setDrafts(EMPTY_DRAFTS);
  }

  async function handleTest(group: string) {
    setTesting(group);
    try {
      const url  = group === "flight" ? "/api/test-tripjack-real" : "/api/admin/api-keys/test";
      const body = group === "flight" ? {} : { which: group };

      const res  = await fetch(url, {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json" },
        body:        JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));

      if (res.status === 401 || res.status === 403) {
        toast({
          title:       "Login required",
          description: "Please log in to the admin panel before testing API keys.",
          variant:     "destructive",
        });
        return;
      }

      if (json.ok === true) {
        toast({ title: "API working", description: json.message || "Connection successful." });
        return;
      }

      const errMsg = json.message || json.error || "Could not verify the API key.";
      toast({ title: "Test failed", description: errMsg, variant: "destructive" });
    } catch (e) {
      toast({
        title:       "Test failed",
        description: e instanceof Error ? e.message : "Could not reach the server.",
        variant:     "destructive",
      });
    } finally {
      setTesting(null);
    }
  }

  return (
    <Card data-testid="api-keys-section">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Key className="w-4 h-4 text-indigo-600" />
          API Keys
        </CardTitle>
        <CardDescription className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          Stored securely on the server. Keys are never sent back to the browser.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {savedFlash && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium" data-testid="api-keys-saved-flash">
            <CheckCircle2 className="w-4 h-4" />
            Settings saved successfully.
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500 py-6">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading current settings…
          </div>
        ) : (
          <div className="space-y-6">
            {/* API key fields */}
            <div className="space-y-5">
              {FIELDS.map(({ key, label, description, Icon, group, hideTest }) => {
                const meta        = (data?.keys as any)?.[key] as KeyMeta | undefined;
                const isSet       = !!meta?.set;
                const masked      = meta?.masked ?? "";
                const draft       = drafts[key];
                const showDraft   = reveal[key];
                const placeholder = isSet
                  ? `Current: ${masked} (leave blank to keep)`
                  : "Not set — paste a new key";

                return (
                  <div key={key} className="space-y-1.5" data-testid={`api-key-row-${key}`}>
                    <Label htmlFor={`api-key-${key}`} className="flex items-center gap-2 text-sm font-medium">
                      <Icon className="w-3.5 h-3.5 text-slate-500" />
                      {label}
                      {isSet ? (
                        <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                          <CheckCircle2 className="w-3 h-3" />
                          {masked}
                        </span>
                      ) : (
                        <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          Not set
                        </span>
                      )}
                    </Label>
                    <p className="text-[11px] text-slate-500">{description}</p>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Input
                          id={`api-key-${key}`}
                          type={showDraft ? "text" : "password"}
                          autoComplete="new-password"
                          value={draft}
                          onChange={(e) => patchDraft(key, e.target.value)}
                          placeholder={placeholder}
                          className="pr-10 font-mono"
                          data-testid={`input-api-key-${key}`}
                        />
                        <button
                          type="button"
                          onClick={() => toggleReveal(key)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                          tabIndex={-1}
                          aria-label={showDraft ? "Hide value" : "Show value"}
                        >
                          {showDraft ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      {!hideTest && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleTest(group)}
                          disabled={testing === group}
                          data-testid={`button-test-${group}`}
                        >
                          {testing === group ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Test"}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <Separator />

            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-slate-500">
                {data?.updatedAt
                  ? `Last updated: ${new Date(data.updatedAt).toLocaleString()}`
                  : "No settings saved yet."}
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDiscard}
                  disabled={!dirty || saving}
                  data-testid="button-api-keys-discard"
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Discard
                </Button>
                <Button
                  type="button"
                  onClick={handleSave}
                  disabled={!dirty || saving}
                  data-testid="button-api-keys-save"
                >
                  {saving ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Saving…</>
                  ) : (
                    <><Save className="w-4 h-4 mr-2" />Save Settings</>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
