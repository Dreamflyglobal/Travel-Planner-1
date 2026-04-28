import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { FileText, Save, RotateCcw, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

const CMS_KEY = "admin_cms_pages_v1";

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

function loadCms(): CmsData {
  try {
    const raw = localStorage.getItem(CMS_KEY);
    if (!raw) return DEFAULT_CMS;
    return { ...DEFAULT_CMS, ...(JSON.parse(raw) as Partial<CmsData>) };
  } catch { return DEFAULT_CMS; }
}

function saveCms(data: CmsData) {
  try { localStorage.setItem(CMS_KEY, JSON.stringify(data)); } catch { /* noop */ }
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
  const [data, setData] = useState<CmsData>(loadCms);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [active, setActive] = useState<keyof CmsData>("aboutUs");

  function patch(key: keyof CmsData, value: string) {
    setData((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  function handleSave() {
    saveCms(data);
    setDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    toast({ title: "CMS pages saved", description: "Content updated and visible on your public pages." });
  }

  function handleReset() {
    const fresh = loadCms();
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
            <Button variant="outline" size="sm" onClick={handleReset} disabled={!dirty} className="gap-1.5">
              <RotateCcw className="w-4 h-4" /> Discard
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!dirty} className="gap-1.5">
              <Save className="w-4 h-4" /> Save All
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
                <Button variant="outline" size="sm" onClick={handleReset} disabled={!dirty} className="gap-1.5">
                  <RotateCcw className="w-4 h-4" /> Discard Changes
                </Button>
                <Button size="sm" onClick={handleSave} disabled={!dirty} className="gap-1.5">
                  <Save className="w-4 h-4" /> Save
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">
              <strong>Tip:</strong> Content saved here is stored locally and used by your public pages. To integrate with a backend CMS or database, connect this to your API server's content table.
            </p>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
