import { useRef, useState, ChangeEvent } from "react";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Image as ImageIcon, Sparkles, Upload, Trash2, RotateCcw, Save, Globe } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useBranding, BrandingSettings } from "@/contexts/branding-context";

const MAX_LOGO_BYTES = 1_500_000; // 1.5 MB — keeps localStorage manageable
const MAX_FAVICON_BYTES = 500_000; // 500 KB

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
}

export default function AdminSettings() {
  const { branding, updateBranding, resetBranding } = useBranding();
  const { toast } = useToast();

  const [draft, setDraft] = useState<BrandingSettings>(branding);
  const [dirty, setDirty] = useState(false);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  function patchDraft(patch: Partial<BrandingSettings>) {
    setDraft((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  }

  async function handleFileSelect(
    e: ChangeEvent<HTMLInputElement>,
    kind: "logo" | "favicon",
  ) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting same file
    if (!file) return;

    const limit = kind === "logo" ? MAX_LOGO_BYTES : MAX_FAVICON_BYTES;
    if (file.size > limit) {
      toast({
        title: "File too large",
        description: `${kind === "logo" ? "Logo" : "Favicon"} must be smaller than ${(limit / 1_000_000).toFixed(1)} MB.`,
        variant: "destructive",
      });
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Unsupported file",
        description: "Please choose an image file (PNG, JPG, SVG, or ICO).",
        variant: "destructive",
      });
      return;
    }

    try {
      const dataUrl = await readFileAsDataURL(file);
      if (kind === "logo") {
        patchDraft({ logoUrl: dataUrl });
      } else {
        patchDraft({ faviconUrl: dataUrl });
      }
    } catch (err) {
      console.error(err);
      toast({
        title: "Could not read image",
        description: "Please try a different file.",
        variant: "destructive",
      });
    }
  }

  function handleSave() {
    updateBranding(draft);
    setDirty(false);
    toast({
      title: "Branding updated",
      description: "Your changes are now live across the site.",
    });
  }

  function handleDiscard() {
    setDraft(branding);
    setDirty(false);
  }

  function handleReset() {
    resetBranding();
    // Pull defaults back into the local draft after the context resets
    setTimeout(() => {
      setDraft({
        companyName: "Dream Fly Global",
        tagline: "Explore the world",
        logoUrl: null,
        faviconUrl: null,
      });
      setDirty(false);
    }, 0);
    toast({
      title: "Reset to defaults",
      description: "Branding has been restored to the original values.",
    });
  }

  return (
    <AdminLayout>
      <div className="p-4 md:p-8 max-w-5xl mx-auto">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Settings</h1>
            <p className="text-sm text-slate-500 mt-1">
              Manage your website branding — header logo, browser tab favicon, and company name.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            data-testid="button-reset-branding"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset to defaults
          </Button>
        </div>

        {/* Company identity */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-600" />
              Company Identity
            </CardTitle>
            <CardDescription>
              Shown in the header next to the logo and on the browser tab.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="company-name">Company name</Label>
                <Input
                  id="company-name"
                  value={draft.companyName}
                  onChange={(e) => patchDraft({ companyName: e.target.value })}
                  placeholder="Dream Fly Global"
                  data-testid="input-company-name"
                />
              </div>
              <div>
                <Label htmlFor="tagline">Tagline</Label>
                <Input
                  id="tagline"
                  value={draft.tagline}
                  onChange={(e) => patchDraft({ tagline: e.target.value })}
                  placeholder="Explore the world"
                  data-testid="input-tagline"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Header logo */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-blue-600" />
              Website Header Logo
            </CardTitle>
            <CardDescription>
              Recommended: square or wide PNG/SVG, transparent background, under 1.5&nbsp;MB.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-6">
              <LogoPreview
                logoUrl={draft.logoUrl}
                companyName={draft.companyName}
                size="lg"
              />
              <div className="flex-1 min-w-[220px]">
                <p className="text-sm text-slate-600 mb-3">
                  This appears in the top-left corner of every page on the site.
                </p>
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    className="hidden"
                    onChange={(e) => handleFileSelect(e, "logo")}
                    data-testid="input-file-logo"
                  />
                  <Button
                    onClick={() => logoInputRef.current?.click()}
                    data-testid="button-upload-logo"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Upload logo
                  </Button>
                  {draft.logoUrl && (
                    <Button
                      variant="outline"
                      onClick={() => patchDraft({ logoUrl: null })}
                      data-testid="button-remove-logo"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Favicon */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-emerald-600" />
              Browser Tab Favicon
            </CardTitle>
            <CardDescription>
              Recommended: square 32×32 or 64×64 PNG/ICO/SVG, under 500&nbsp;KB.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-6">
              <FaviconPreview faviconUrl={draft.faviconUrl} />
              <div className="flex-1 min-w-[220px]">
                <p className="text-sm text-slate-600 mb-3">
                  Shown in the browser tab, bookmarks, and history.
                </p>
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={faviconInputRef}
                    type="file"
                    accept="image/png,image/x-icon,image/vnd.microsoft.icon,image/svg+xml,image/webp"
                    className="hidden"
                    onChange={(e) => handleFileSelect(e, "favicon")}
                    data-testid="input-file-favicon"
                  />
                  <Button
                    onClick={() => faviconInputRef.current?.click()}
                    data-testid="button-upload-favicon"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Upload favicon
                  </Button>
                  {draft.faviconUrl && (
                    <Button
                      variant="outline"
                      onClick={() => patchDraft({ faviconUrl: null })}
                      data-testid="button-remove-favicon"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Separator className="my-6" />

        {/* Sticky-feeling save bar */}
        <div className="sticky bottom-4 bg-white border border-slate-200 rounded-2xl shadow-lg p-4 flex items-center justify-between gap-4">
          <div className="text-sm">
            {dirty ? (
              <span className="text-amber-700 font-medium">You have unsaved changes</span>
            ) : (
              <span className="text-slate-500">All changes saved</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleDiscard}
              disabled={!dirty}
              data-testid="button-discard-branding"
            >
              Discard
            </Button>
            <Button
              onClick={handleSave}
              disabled={!dirty}
              data-testid="button-save-branding"
            >
              <Save className="w-4 h-4 mr-2" />
              Save changes
            </Button>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

function LogoPreview({
  logoUrl,
  companyName,
  size = "md",
}: {
  logoUrl: string | null;
  companyName: string;
  size?: "md" | "lg";
}) {
  const dim = size === "lg" ? "w-20 h-20" : "w-12 h-12";
  return (
    <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3 min-w-[220px]">
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={companyName}
          className={`${dim} rounded-lg object-contain bg-white border border-slate-200`}
          data-testid="img-preview-logo"
        />
      ) : (
        <div
          className={`${dim} rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shadow-md`}
        >
          <Sparkles className="h-8 w-8 text-white" />
        </div>
      )}
      <div className="flex flex-col">
        <span className="font-bold text-lg bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
          {companyName || "Your Brand"}
        </span>
        <span className="text-[11px] text-slate-500">Header preview</span>
      </div>
    </div>
  );
}

function FaviconPreview({ faviconUrl }: { faviconUrl: string | null }) {
  return (
    <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3 min-w-[220px]">
      <div className="w-12 h-12 rounded-lg bg-white border border-slate-200 flex items-center justify-center overflow-hidden">
        {faviconUrl ? (
          <img
            src={faviconUrl}
            alt="Favicon"
            className="w-8 h-8 object-contain"
            data-testid="img-preview-favicon"
          />
        ) : (
          <Globe className="w-7 h-7 text-slate-300" />
        )}
      </div>
      <div className="flex flex-col">
        <span className="text-sm font-semibold text-slate-700">Browser tab</span>
        <span className="text-[11px] text-slate-500">
          {faviconUrl ? "Custom favicon" : "Default favicon"}
        </span>
      </div>
    </div>
  );
}
