import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { FileText, Save, RotateCcw, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface CmsData {
  aboutUs: string;
  termsAndConditions: string;
  privacyPolicy: string;
}

const DEFAULT_CMS: CmsData = {
  aboutUs: "",
  termsAndConditions: "",
  privacyPolicy: "",
};

async function fetchCms(): Promise<CmsData> {
  try {
    const res = await fetch("/api/settings/cms");
    if (!res.ok) return DEFAULT_CMS;
    const data = await res.json() as Partial<CmsData>;
    return { ...DEFAULT_CMS, ...data };
  } catch { return DEFAULT_CMS; }
}

async function saveCmsToDb(data: CmsData): Promise<void> {
  await fetch("/api/settings/cms", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

const PAGES = [
  { key: "aboutUs" as const,            label: "About Us",            placeholder: "Tell customers who you are, your mission, and what makes Dream Fly Global special…" },
  { key: "termsAndConditions" as const, label: "Terms & Conditions",  placeholder: "Outline booking terms, cancellation policy, liability clauses…" },
  { key: "privacyPolicy" as const,      label: "Privacy Policy",      placeholder: "Describe what data you collect, how it is used, third-party sharing, GDPR/DPDP compliance…" },
];

function SectionHeader({ icon, title, description }: { icon: React.ReactNode; title: string; description?: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">{icon}</div>
      <div>
        <p className="font-bold text-base leading-tight">{title}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
    </div>
  );
}

export default function AdminCms() {
  const { toast } = useToast();
  const [data, setData] = useState<CmsData>(DEFAULT_CMS);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [active, setActive] = useState<keyof CmsData>("aboutUs");

  useEffect(() => {
    const load = () => {
      fetchCms().then(setData).catch(() => {});
    };
    load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, []);

  function patch(key: keyof CmsData, value: string) {
    setData((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await saveCmsToDb(data);
      setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      toast({ title: "CMS pages saved", description: "Content updated and visible on your public pages." });
    } catch {
      toast({ variant: "destructive", title: "Save failed", description: "Could not save CMS content. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    const fresh = await fetchCms();
    setData(fresh);
    setDirty(false);
    toast({ title: "Discarded changes", description: "Reverted to the last saved version." });
  }

  const currentPage = PAGES.find((p) => p.key === active)!;
  const wordCount = data[active].trim() ? data[active].trim().split(/\s+/).length : 0;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold flex items-center gap-2">
              <FileText className="w-6 h-6 text-primary" /> CMS Pages
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Edit the content of your public pages directly from the admin panel
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleReset} disabled={!dirty || saving} className="gap-1.5">
              <RotateCcw className="w-4 h-4" /> Discard
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!dirty || saving} className="gap-1.5">
              <Save className="w-4 h-4" /> {saving ? "Saving…" : "Save All"}
            </Button>
          </div>
        </div>

        {saved && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium">
            <CheckCircle2 className="w-4 h-4" /> All CMS pages saved successfully.
          </div>
        )}

        <div className="grid lg:grid-cols-[240px_1fr] gap-6">
          {/* Sidebar */}
          <div className="space-y-1">
            {PAGES.map((p) => {
              const wordCnt = data[p.key].trim() ? data[p.key].trim().split(/\s+/).length : 0;
              return (
                <button
                  key={p.key}
                  onClick={() => setActive(p.key)}
                  className={cn(
                    "w-full text-left rounded-xl px-4 py-3 border transition-colors",
                    active === p.key
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card border-border hover:bg-muted/50"
                  )}
                >
                  <p className="font-semibold text-sm">{p.label}</p>
                  <p className={cn("text-xs mt-0.5", active === p.key ? "text-primary-foreground/70" : "text-muted-foreground")}>
                    {wordCnt > 0 ? `${wordCnt} words` : "Not written yet"}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Editor */}
          <Card>
            <CardHeader className="pb-3">
              <SectionHeader
                icon={<FileText className="w-5 h-5 text-primary" />}
                title={currentPage.label}
                description={`This content appears on your public /${active === "aboutUs" ? "about" : active === "termsAndConditions" ? "terms" : "privacy-policy"} page.`}
              />
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="cms-editor">Page Content</Label>
                  <span className="text-xs text-muted-foreground">{wordCount} words</span>
                </div>
                <Textarea
                  id="cms-editor"
                  rows={20}
                  className="font-mono text-sm resize-y"
                  placeholder={currentPage.placeholder}
                  value={data[active]}
                  onChange={(e) => patch(active, e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">
                  Plain text is supported. HTML tags will be rendered as-is. Use line breaks for paragraphs.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={handleReset} disabled={!dirty || saving} className="gap-1.5">
                  <RotateCcw className="w-4 h-4" /> Discard Changes
                </Button>
                <Button size="sm" onClick={handleSave} disabled={!dirty || saving} className="gap-1.5">
                  <Save className="w-4 h-4" /> {saving ? "Saving…" : "Save"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">
              <strong>Tip:</strong> Content saved here is stored in the database and synced across all devices. Changes are reflected immediately on all admin sessions.
            </p>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
