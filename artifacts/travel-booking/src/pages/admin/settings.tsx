import { useRef, useState, ChangeEvent, useEffect } from "react";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Image as ImageIcon, Sparkles, Upload, Trash2, RotateCcw, Save, Globe,
  Building2, CreditCard, Receipt, Mail, Phone, Eye, EyeOff,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useBranding, BrandingSettings } from "@/contexts/branding-context";
import {
  useSiteSettings,
  SiteSettings,
  Currency,
  DEFAULT_SITE_SETTINGS,
} from "@/contexts/site-settings-context";
import {
  useNotificationSettings,
  NotificationSettings,
  DEFAULT_NOTIFICATION_SETTINGS,
} from "@/contexts/notification-settings-context";
import {
  useWebsiteSettings,
  WebsiteSettings,
  DEFAULT_WEBSITE_SETTINGS,
  sanitizeWhatsappNumber,
} from "@/contexts/website-settings-context";
import { Link } from "wouter";
import { APP_NAME } from "@/lib/app-config";
import { ClipboardList, ArrowRight } from "lucide-react";
import {
  Bell,
  BellRing,
  MailCheck,
  Facebook,
  Instagram,
  Twitter,
  MessageCircle,
  MessageSquare,
  Megaphone,
  Wrench,
  CheckCircle2,
  ToggleLeft,
  RefreshCcw,
  ShieldCheck,
} from "lucide-react";

const MAX_LOGO_BYTES    = 5  * 1024 * 1024;
const MAX_FAVICON_BYTES = 2  * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = [
  "image/png", "image/jpeg", "image/jpg", "image/webp",
  "image/svg+xml", "image/gif", "image/x-icon", "image/vnd.microsoft.icon",
];

const PASSTHROUGH_TYPES = new Set(["image/svg+xml", "image/x-icon", "image/vnd.microsoft.icon"]);

async function compressImage(
  file: File,
  maxDimension: number,
  targetBytes: number,
): Promise<File> {
  if (PASSTHROUGH_TYPES.has(file.type)) return file;
  if (file.size <= targetBytes) {
    let bitmap: ImageBitmap;
    try { bitmap = await createImageBitmap(file); } catch { return file; }
    if (bitmap.width <= maxDimension && bitmap.height <= maxDimension) {
      bitmap.close();
      return file;
    }
    bitmap.close();
  }

  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); } catch { return file; }

  const { width, height } = bitmap;
  const scale = Math.min(1, maxDimension / width, maxDimension / height);
  const canvas = document.createElement("canvas");
  canvas.width  = Math.round(width  * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const outputType = file.type === "image/png" ? "image/png" : "image/jpeg";
  let quality = 0.88;
  let blob: Blob | null = null;

  for (let attempt = 0; attempt < 6; attempt++) {
    blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, outputType, quality),
    );
    if (!blob || blob.size <= targetBytes) break;
    quality -= 0.1;
    if (quality < 0.3) break;
  }

  if (!blob) return file;
  const ext  = outputType === "image/jpeg" ? ".jpg" : ".png";
  const name = file.name.replace(/\.[^.]+$/, "") + ext;
  return new File([blob], name, { type: outputType });
}

const CURRENCIES: { value: Currency; label: string }[] = [
  { value: "INR", label: "₹ INR — Indian Rupee" },
  { value: "USD", label: "$ USD — US Dollar" },
  { value: "EUR", label: "€ EUR — Euro" },
  { value: "GBP", label: "£ GBP — British Pound" },
  { value: "AED", label: "د.إ AED — UAE Dirham" },
];

async function uploadImageFile(file: File, kind: "logo" | "favicon"): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`/api/upload/${kind}`, { method: "POST", body: formData });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? `Upload failed (${res.status})`);
  }
  const data = await res.json() as { url: string };
  return data.url;
}

export default function AdminSettings() {
  const { branding, updateBranding, resetBranding, saving: brandingSaving } = useBranding();
  const { settings, updateSettings, resetSettings, saving: siteSaving } = useSiteSettings();
  const { toast } = useToast();

  const [brandingDraft, setBrandingDraft] = useState<BrandingSettings>(branding);
  const [siteDraft, setSiteDraft] = useState<SiteSettings>(settings);
  const [dirty, setDirty] = useState(false);
  const isSaving = brandingSaving || siteSaving;

  // Keep drafts in sync if context changes elsewhere (e.g. cross-tab updates)
  useEffect(() => {
    if (!dirty) setBrandingDraft(branding);
  }, [branding, dirty]);
  useEffect(() => {
    if (!dirty) setSiteDraft(settings);
  }, [settings, dirty]);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);

  function patchBranding(patch: Partial<BrandingSettings>) {
    setBrandingDraft((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  }
  function patchSite(patch: Partial<SiteSettings>) {
    setSiteDraft((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  }

  async function handleFileSelect(
    e: ChangeEvent<HTMLInputElement>,
    kind: "logo" | "favicon",
  ) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      toast({
        title: "Unsupported file type",
        description: "Allowed formats: PNG, JPG, JPEG, WEBP, SVG, ICO.",
        variant: "destructive",
      });
      return;
    }

    const limit      = kind === "logo" ? MAX_LOGO_BYTES : MAX_FAVICON_BYTES;
    const maxDim     = kind === "logo" ? 1200 : 256;
    const targetSize = kind === "logo" ? 4 * 1024 * 1024 : 1.5 * 1024 * 1024;

    if (kind === "logo") setUploadingLogo(true);
    else setUploadingFavicon(true);

    try {
      const processed = await compressImage(file, maxDim, targetSize);

      if (processed.size > limit) {
        toast({
          title: "File too large",
          description: `${kind === "logo" ? "Logo" : "Favicon"} must be under ${(limit / 1_048_576).toFixed(0)} MB even after compression. Please use a smaller image.`,
          variant: "destructive",
        });
        return;
      }

      const url = await uploadImageFile(processed, kind);
      const patch = kind === "logo" ? { logoUrl: url } : { faviconUrl: url };
      // Update local draft immediately (without marking as dirty — auto-saved below)
      setBrandingDraft((prev) => ({ ...prev, ...patch }));
      // Persist to DB straight away so the change is live site-wide without
      // requiring the user to also click "Save Changes"
      await updateBranding(patch);
      toast({
        title: `${kind === "logo" ? "Logo" : "Favicon"} uploaded`,
        description: `${kind === "logo" ? "Logo" : "Favicon"} is now live across the site.`,
      });
    } catch (err: any) {
      toast({
        title: "Upload failed",
        description: err?.message ?? "Could not upload image. Please try again.",
        variant: "destructive",
      });
    } finally {
      if (kind === "logo") setUploadingLogo(false);
      else setUploadingFavicon(false);
    }
  }

  async function handleSave() {
    // Validate booking fee
    if (siteDraft.bookingFee < 0 || !Number.isFinite(siteDraft.bookingFee)) {
      toast({
        title: "Invalid booking fee",
        description: "Booking fee must be zero or a positive number.",
        variant: "destructive",
      });
      return;
    }
    // Validate email if provided
    if (siteDraft.contactEmail && !/^\S+@\S+\.\S+$/.test(siteDraft.contactEmail)) {
      toast({
        title: "Invalid contact email",
        description: "Please enter a valid email address.",
        variant: "destructive",
      });
      return;
    }

    await Promise.all([
      updateBranding(brandingDraft),
      updateSettings(siteDraft),
    ]);
    setDirty(false);
    toast({
      title: "Settings saved",
      description: "All your changes are now live across all devices.",
    });
  }

  function handleDiscard() {
    setBrandingDraft(branding);
    setSiteDraft(settings);
    setDirty(false);
  }

  async function handleReset() {
    await Promise.all([resetBranding(), resetSettings()]);
    setBrandingDraft({
      companyName: APP_NAME,
      tagline: "Explore the world",
      logoUrl: null,
      faviconUrl: null,
    });
    setSiteDraft(DEFAULT_SITE_SETTINGS);
    setDirty(false);
    toast({
      title: "Reset to defaults",
      description: "All settings have been restored to the original values.",
    });
  }

  return (
    <AdminLayout>
      <div className="p-4 md:p-8 max-w-5xl mx-auto pb-24">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900">Settings</h1>
            <p className="text-sm text-slate-500 mt-1">
              Manage branding, site info, payments, and booking preferences. Changes apply instantly across the site.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            data-testid="button-reset-settings"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset to defaults
          </Button>
        </div>

        {/* ============== Quick links to other admin tools ============== */}
        <Link
          href="/master-admin/bookings-management"
          className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-purple-50 p-4 hover:shadow-md transition-shadow cursor-pointer group"
          data-testid="link-bookings-management"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
              <ClipboardList className="w-5 h-5" />
            </div>
            <div>
              <div className="font-semibold text-slate-900">Booking Management</div>
              <div className="text-xs text-slate-600">
                View, confirm, cancel bookings and process Razorpay refunds.
              </div>
            </div>
          </div>
          <ArrowRight className="w-5 h-5 text-indigo-600 group-hover:translate-x-1 transition-transform" />
        </Link>

        {/* ============== A) WEBSITE BRANDING ============== */}
        <SectionHeader
          icon={<Sparkles className="w-5 h-5 text-purple-600" />}
          title="Website Branding"
          description="Logo, favicon, and the brand identity displayed in the header."
        />

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="w-4 h-4 text-purple-600" />
              Brand Name &amp; Tagline
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="company-name">Site name</Label>
                <Input
                  id="company-name"
                  value={brandingDraft.companyName}
                  onChange={(e) => patchBranding({ companyName: e.target.value })}
                  placeholder={APP_NAME}
                  data-testid="input-company-name"
                />
              </div>
              <div>
                <Label htmlFor="tagline">Tagline</Label>
                <Input
                  id="tagline"
                  value={brandingDraft.tagline}
                  onChange={(e) => patchBranding({ tagline: e.target.value })}
                  placeholder="Explore the world"
                  data-testid="input-tagline"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ImageIcon className="w-4 h-4 text-blue-600" />
              Header Logo
            </CardTitle>
            <CardDescription>
              PNG, JPG, WEBP, SVG, or ICO — up to 5&nbsp;MB (auto-compressed if needed). Shows in the top-left corner of every page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-6">
              <LogoPreview
                logoUrl={brandingDraft.logoUrl}
                companyName={brandingDraft.companyName}
              />
              <div className="flex flex-wrap gap-2">
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon,image/vnd.microsoft.icon"
                  className="hidden"
                  onChange={(e) => handleFileSelect(e, "logo")}
                  data-testid="input-file-logo"
                />
                <Button
                  onClick={() => logoInputRef.current?.click()}
                  disabled={uploadingLogo}
                  data-testid="button-upload-logo"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {uploadingLogo ? "Uploading…" : "Upload logo"}
                </Button>
                {brandingDraft.logoUrl && (
                  <Button
                    variant="outline"
                    disabled={uploadingLogo}
                    onClick={() => patchBranding({ logoUrl: null })}
                    data-testid="button-remove-logo"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Remove
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe className="w-4 h-4 text-emerald-600" />
              Browser Tab Favicon
            </CardTitle>
            <CardDescription>
              PNG, ICO, SVG, or WEBP — up to 2&nbsp;MB (auto-compressed if needed). Square 32×32 or 64×64 recommended.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-6">
              <FaviconPreview faviconUrl={brandingDraft.faviconUrl} />
              <div className="flex flex-wrap gap-2">
                <input
                  ref={faviconInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/x-icon,image/vnd.microsoft.icon,image/svg+xml"
                  className="hidden"
                  onChange={(e) => handleFileSelect(e, "favicon")}
                  data-testid="input-file-favicon"
                />
                <Button
                  onClick={() => faviconInputRef.current?.click()}
                  disabled={uploadingFavicon}
                  data-testid="button-upload-favicon"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {uploadingFavicon ? "Uploading…" : "Upload favicon"}
                </Button>
                {brandingDraft.faviconUrl && (
                  <Button
                    variant="outline"
                    disabled={uploadingFavicon}
                    onClick={() => patchBranding({ faviconUrl: null })}
                    data-testid="button-remove-favicon"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Remove
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ============== B) WEBSITE INFO ============== */}
        <SectionHeader
          icon={<Mail className="w-5 h-5 text-blue-600" />}
          title="Website Info"
          description="Public contact details for your business."
        />

        <Card className="mb-8">
          <CardContent className="pt-6 space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="contact-email">Contact email</Label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <Input
                    id="contact-email"
                    type="email"
                    className="pl-9"
                    value={siteDraft.contactEmail}
                    onChange={(e) => patchSite({ contactEmail: e.target.value })}
                    placeholder="hello@dreamflyglobal.com"
                    data-testid="input-contact-email"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="contact-phone">Phone number</Label>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <Input
                    id="contact-phone"
                    type="tel"
                    className="pl-9"
                    value={siteDraft.contactPhone}
                    onChange={(e) => patchSite({ contactPhone: e.target.value })}
                    placeholder="+91 90009 78856"
                    data-testid="input-contact-phone"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ============== C) PAYMENT SETTINGS ============== */}
        <SectionHeader
          icon={<CreditCard className="w-5 h-5 text-amber-600" />}
          title="Payment Settings"
          description="Global payment toggle. Razorpay credentials are configured via environment variables."
        />

        <Card className="mb-8">
          <CardContent className="pt-6 space-y-5">
            <div className="flex items-center justify-between gap-4 p-3 rounded-lg bg-slate-50 border border-slate-200">
              <div>
                <p className="text-sm font-semibold text-slate-900">Enable payments</p>
                <p className="text-xs text-slate-500">
                  When off, the checkout flow will hide the pay button across the site.
                </p>
              </div>
              <Switch
                checked={siteDraft.paymentsEnabled}
                onCheckedChange={(v) => patchSite({ paymentsEnabled: v })}
                data-testid="switch-payments-enabled"
              />
            </div>

            <div className="flex items-start gap-3 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm">
              <ShieldCheck className="w-4 h-4 mt-0.5 text-emerald-600 shrink-0" />
              <p className="text-emerald-800">
                <strong>Razorpay Key ID and Secret</strong> are configured securely via environment variables on the server.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* ============== D) BOOKING SETTINGS ============== */}
        <SectionHeader
          icon={<Receipt className="w-5 h-5 text-emerald-600" />}
          title="Booking Settings"
          description="Defaults applied across all bookings."
        />

        <Card className="mb-8">
          <CardContent className="pt-6 space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="currency">Default currency</Label>
                <Select
                  value={siteDraft.currency}
                  onValueChange={(v: Currency) => patchSite({ currency: v })}
                >
                  <SelectTrigger id="currency" data-testid="select-currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c.value} value={c.value} data-testid={`option-currency-${c.value}`}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="booking-fee">Booking fee</Label>
                <Input
                  id="booking-fee"
                  type="number"
                  min={0}
                  step={1}
                  value={Number.isFinite(siteDraft.bookingFee) ? siteDraft.bookingFee : 0}
                  onChange={(e) => patchSite({ bookingFee: Number(e.target.value) })}
                  placeholder="0"
                  data-testid="input-booking-fee"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Flat fee added to every booking, in the selected currency.
                </p>
              </div>
            </div>
            <div>
              <Label htmlFor="cancellation-policy">Cancellation policy</Label>
              <Textarea
                id="cancellation-policy"
                rows={6}
                value={siteDraft.cancellationPolicy}
                onChange={(e) => patchSite({ cancellationPolicy: e.target.value })}
                placeholder="Describe your cancellation, refund, and reschedule policy here..."
                data-testid="input-cancellation-policy"
              />
            </div>
          </CardContent>
        </Card>

        <Separator className="my-6" />

        {/* Website Settings — modular, independent of branding/site/notification settings */}
        <WebsiteSettingsSection />

        <Separator className="my-6" />

        {/* Notification Settings — modular, independent of branding/site settings */}
        <NotificationSettingsSection />

        <Separator className="my-6" />

        {/* Payment Mode — Test vs Live toggle */}
        <PaymentModeSection />

        <Separator className="my-6" />

        {/* Sticky save bar */}
        <div className="sticky bottom-4 bg-white border border-slate-200 rounded-2xl shadow-lg p-4 flex items-center justify-between gap-4">
          <div className="text-sm">
            {isSaving ? (
              <span className="text-blue-600 font-medium" data-testid="text-saving-status">
                Saving to database…
              </span>
            ) : dirty ? (
              <span className="text-amber-700 font-medium" data-testid="text-dirty-status">
                You have unsaved changes
              </span>
            ) : (
              <span className="text-slate-500" data-testid="text-saved-status">
                All changes saved
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleDiscard}
              disabled={!dirty || isSaving}
              data-testid="button-discard-settings"
            >
              Discard
            </Button>
            <Button
              onClick={handleSave}
              disabled={!dirty || isSaving}
              data-testid="button-save-settings"
            >
              <Save className="w-4 h-4 mr-2" />
              {isSaving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}

function SectionHeader({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-3 mt-2 flex items-center gap-2.5">
      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-white border border-slate-200 shadow-sm">
        {icon}
      </div>
      <div>
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700">{title}</h2>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
    </div>
  );
}

function LogoPreview({
  logoUrl,
  companyName,
}: {
  logoUrl: string | null;
  companyName: string;
}) {
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [logoUrl]);
  const showImg = logoUrl && !broken;
  return (
    <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3 min-w-[260px]">
      {showImg ? (
        <img
          src={logoUrl}
          alt={companyName}
          className="w-20 h-20 rounded-lg object-contain bg-white border border-slate-200"
          data-testid="img-preview-logo"
          onError={() => setBroken(true)}
        />
      ) : (
        <div className="w-20 h-20 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shadow-md">
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
    <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3 min-w-[260px]">
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

// ── Notification Settings (modular, additive) ────────────────────────────────
function NotificationSettingsSection() {
  const { settings, updateSettings, resetSettings, saving } = useNotificationSettings();
  const { toast } = useToast();

  const [draft, setDraft] = useState<NotificationSettings>(settings);
  const [dirty, setDirty] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    if (!dirty) setDraft(settings);
  }, [settings, dirty]);

  function patch(p: Partial<NotificationSettings>) {
    setDraft((prev) => ({ ...prev, ...p }));
    setDirty(true);
  }

  async function handleSave() {
    if (draft.emailEnabled) {
      if (!draft.smtpEmail.trim() || !/^\S+@\S+\.\S+$/.test(draft.smtpEmail.trim())) {
        toast({ title: "Invalid SMTP email", description: "Please enter a valid email address.", variant: "destructive" });
        return;
      }
      if (!draft.smtpPassword.trim()) {
        toast({ title: "SMTP password required", description: "Enter the app password for the SMTP account.", variant: "destructive" });
        return;
      }
    }
    if (draft.popupEnabled && !draft.popupMessage.trim()) {
      toast({ title: "Popup message required", description: "Enter the message to show in the popup.", variant: "destructive" });
      return;
    }
    await updateSettings(draft);
    setDirty(false);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 3000);
    toast({ title: "Notification settings saved", description: "Your notification preferences are now active across all devices." });
  }

  async function handleReset() {
    await resetSettings();
    setDraft(DEFAULT_NOTIFICATION_SETTINGS);
    setDirty(false);
    toast({ title: "Reset", description: "Notification settings restored to defaults." });
  }

  return (
    <Card>
      <CardHeader>
        <SectionHeader
          icon={<Bell className="w-5 h-5 text-purple-600" />}
          title="Notification Settings"
          description="Control email + popup notifications shown after a successful booking or payment."
        />
      </CardHeader>
      <CardContent className="space-y-8">

        {savedFlash && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium">
            <MailCheck className="w-4 h-4" />
            Notification settings saved successfully.
          </div>
        )}

        {/* ── Email Notifications ───────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Label htmlFor="notif-email-enabled" className="text-base font-semibold flex items-center gap-2">
                <MailCheck className="w-4 h-4 text-blue-600" />
                Enable Email Notifications
              </Label>
              <p className="text-xs text-slate-500 mt-1">
                Send a confirmation email to the customer after a successful booking and payment.
              </p>
            </div>
            <Switch
              id="notif-email-enabled"
              checked={draft.emailEnabled}
              onCheckedChange={(v) => patch({ emailEnabled: v })}
              data-testid="switch-notif-email"
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="notif-smtp-email">SMTP Email</Label>
              <Input
                id="notif-smtp-email"
                type="email"
                placeholder="notifications@yourcompany.com"
                value={draft.smtpEmail}
                onChange={(e) => patch({ smtpEmail: e.target.value })}
                disabled={!draft.emailEnabled}
                data-testid="input-notif-smtp-email"
              />
              <p className="text-[11px] text-slate-500">
                Gmail, Outlook, Yahoo, or any SMTP-capable address.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notif-smtp-pass">SMTP Password / App Password</Label>
              <div className="relative">
                <Input
                  id="notif-smtp-pass"
                  type={showPwd ? "text" : "password"}
                  placeholder="App password (16 chars for Gmail)"
                  value={draft.smtpPassword}
                  onChange={(e) => patch({ smtpPassword: e.target.value })}
                  disabled={!draft.emailEnabled}
                  className="pr-10"
                  data-testid="input-notif-smtp-pass"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  tabIndex={-1}
                >
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[11px] text-slate-500">
                Stored locally — only sent to the server when an email is dispatched.
              </p>
            </div>
          </div>
        </div>

        <Separator />

        {/* ── Popup Notifications ───────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Label htmlFor="notif-popup-enabled" className="text-base font-semibold flex items-center gap-2">
                <BellRing className="w-4 h-4 text-purple-600" />
                Enable Popup Notifications
              </Label>
              <p className="text-xs text-slate-500 mt-1">
                Show a confirmation popup to the customer immediately after booking or payment success.
              </p>
            </div>
            <Switch
              id="notif-popup-enabled"
              checked={draft.popupEnabled}
              onCheckedChange={(v) => patch({ popupEnabled: v })}
              data-testid="switch-notif-popup"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notif-popup-msg">Custom Popup Message</Label>
            <Textarea
              id="notif-popup-msg"
              rows={3}
              value={draft.popupMessage}
              onChange={(e) => patch({ popupMessage: e.target.value })}
              placeholder="Your booking has been confirmed! Check your email for details."
              disabled={!draft.popupEnabled}
              data-testid="input-notif-popup-msg"
            />
            <p className="text-[11px] text-slate-500">
              Shown verbatim in the success popup. Keep it short and friendly.
            </p>
          </div>
        </div>

        <Separator />

        {/* ── SMS Notifications ─────────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Label htmlFor="notif-sms-enabled" className="text-base font-semibold flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-green-600" />
                Enable SMS Notifications
              </Label>
              <p className="text-xs text-slate-500 mt-1">
                Send an SMS alert to the customer after a successful booking or payment.
              </p>
            </div>
            <Switch
              id="notif-sms-enabled"
              checked={draft.smsEnabled}
              onCheckedChange={(v) => patch({ smsEnabled: v })}
              data-testid="switch-notif-sms"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notif-sms-provider">SMS Provider / API Endpoint</Label>
            <Input
              id="notif-sms-provider"
              value={draft.smsProvider}
              onChange={(e) => patch({ smsProvider: e.target.value })}
              placeholder="e.g. Twilio, MSG91, Fast2SMS API URL"
              disabled={!draft.smsEnabled}
              data-testid="input-notif-sms-provider"
            />
            <p className="text-[11px] text-slate-500">
              Enter your SMS gateway name or API endpoint. SMS dispatch requires server integration.
            </p>
          </div>
        </div>

        <Separator />

        {/* ── WhatsApp Notifications ─────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Label htmlFor="notif-whatsapp-enabled" className="text-base font-semibold flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-emerald-600" />
                Enable WhatsApp Notifications
              </Label>
              <p className="text-xs text-slate-500 mt-1">
                Send a WhatsApp message to the customer after a successful booking or payment.
              </p>
            </div>
            <Switch
              id="notif-whatsapp-enabled"
              checked={draft.whatsappNotifEnabled}
              onCheckedChange={(v) => patch({ whatsappNotifEnabled: v })}
              data-testid="switch-notif-whatsapp"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notif-whatsapp-number">WhatsApp Business Number</Label>
            <Input
              id="notif-whatsapp-number"
              value={draft.whatsappNotifNumber}
              onChange={(e) => patch({ whatsappNotifNumber: e.target.value })}
              placeholder="+91 98765 43210"
              disabled={!draft.whatsappNotifEnabled}
              data-testid="input-notif-whatsapp-number"
            />
            <p className="text-[11px] text-slate-500">
              Enter the WhatsApp Business number that will send notifications. Requires WhatsApp Business API integration.
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={saving}
            data-testid="button-notif-reset"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset
          </Button>
          <Button
            onClick={handleSave}
            disabled={!dirty || saving}
            data-testid="button-notif-save"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? "Saving…" : "Save Notification Settings"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Website Settings (modular, additive) ────────────────────────────────────
function WebsiteSettingsSection() {
  const { settings, updateSettings, resetSettings, saving } = useWebsiteSettings();
  const { toast } = useToast();

  const [draft, setDraft] = useState<WebsiteSettings>(settings);
  const [dirty, setDirty] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!dirty) setDraft(settings);
  }, [settings, dirty]);

  function patch(p: Partial<WebsiteSettings>) {
    setDraft((prev) => ({ ...prev, ...p }));
    setDirty(true);
  }

  function isValidUrl(value: string): boolean {
    if (!value.trim()) return true;
    try {
      const u = new URL(value.trim());
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }

  async function handleBannerImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Unsupported file",
        description: "Please choose an image file (PNG, JPG, or WebP).",
        variant: "destructive",
      });
      return;
    }
    if (file.size > 2_000_000) {
      toast({
        title: "Image too large",
        description: "Banner image must be smaller than 2 MB.",
        variant: "destructive",
      });
      return;
    }
    try {
      const dataUrl = await readFileAsDataURL(file);
      patch({ bannerImage: dataUrl });
    } catch (err) {
      console.error(err);
      toast({
        title: "Could not read image",
        description: "Please try a different file.",
        variant: "destructive",
      });
    }
  }

  async function handleSave() {
    for (const [field, label] of [
      ["facebookUrl", "Facebook URL"],
      ["instagramUrl", "Instagram URL"],
      ["twitterUrl", "Twitter URL"],
    ] as const) {
      if (!isValidUrl(draft[field])) {
        toast({
          title: `Invalid ${label}`,
          description: "Please enter a full URL starting with https://",
          variant: "destructive",
        });
        return;
      }
    }
    if (draft.whatsappEnabled) {
      const cleaned = sanitizeWhatsappNumber(draft.whatsappNumber);
      if (cleaned.length < 8 || cleaned.length > 15) {
        toast({
          title: "Invalid WhatsApp number",
          description: "Enter a valid number with country code (digits only, 8–15 digits).",
          variant: "destructive",
        });
        return;
      }
    }
    await updateSettings(draft);
    setDirty(false);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 3000);
    toast({
      title: "Website settings saved",
      description: "Your changes are now live across all devices.",
    });
  }

  async function handleReset() {
    await resetSettings();
    setDraft(DEFAULT_WEBSITE_SETTINGS);
    setDirty(false);
    toast({
      title: "Reset",
      description: "Website settings restored to defaults.",
    });
  }

  return (
    <Card data-testid="website-settings-section">
      <CardHeader>
        <SectionHeader
          icon={<Globe className="w-5 h-5 text-blue-600" />}
          title="Website Settings"
          description="Social media links, WhatsApp chat, homepage banner, and maintenance mode."
        />
      </CardHeader>
      <CardContent className="space-y-8">
        {savedFlash && (
          <div
            className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium"
            data-testid="website-settings-saved-flash"
          >
            <CheckCircle2 className="w-4 h-4" />
            Website settings saved successfully.
          </div>
        )}

        {/* ── Social Media Links ───────────────────────────────────────── */}
        <div className="space-y-4">
          <Label className="text-base font-semibold flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-pink-600" />
            Social Media Links
          </Label>
          <p className="text-xs text-slate-500 -mt-2">
            Shown as icons in the website footer. Leave blank to hide.
          </p>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="ws-facebook" className="flex items-center gap-1.5 text-sm">
                <Facebook className="w-3.5 h-3.5 text-blue-600" /> Facebook URL
              </Label>
              <Input
                id="ws-facebook"
                type="url"
                placeholder="https://facebook.com/yourpage"
                value={draft.facebookUrl}
                onChange={(e) => patch({ facebookUrl: e.target.value })}
                data-testid="input-website-facebook"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ws-instagram" className="flex items-center gap-1.5 text-sm">
                <Instagram className="w-3.5 h-3.5 text-pink-600" /> Instagram URL
              </Label>
              <Input
                id="ws-instagram"
                type="url"
                placeholder="https://instagram.com/yourhandle"
                value={draft.instagramUrl}
                onChange={(e) => patch({ instagramUrl: e.target.value })}
                data-testid="input-website-instagram"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ws-twitter" className="flex items-center gap-1.5 text-sm">
                <Twitter className="w-3.5 h-3.5 text-sky-500" /> Twitter URL
              </Label>
              <Input
                id="ws-twitter"
                type="url"
                placeholder="https://twitter.com/yourhandle"
                value={draft.twitterUrl}
                onChange={(e) => patch({ twitterUrl: e.target.value })}
                data-testid="input-website-twitter"
              />
            </div>
          </div>
        </div>

        <Separator />

        {/* ── WhatsApp Chat Button ─────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Label
                htmlFor="ws-whatsapp-enabled"
                className="text-base font-semibold flex items-center gap-2"
              >
                <MessageCircle className="w-4 h-4 text-emerald-600" />
                WhatsApp Chat Button
              </Label>
              <p className="text-xs text-slate-500 mt-1">
                Show a floating WhatsApp button on every page (except admin).
              </p>
            </div>
            <Switch
              id="ws-whatsapp-enabled"
              checked={draft.whatsappEnabled}
              onCheckedChange={(v) => patch({ whatsappEnabled: v })}
              data-testid="switch-website-whatsapp"
            />
          </div>
          <div className="space-y-1.5 max-w-md">
            <Label htmlFor="ws-whatsapp-number">WhatsApp Number (with country code)</Label>
            <Input
              id="ws-whatsapp-number"
              type="tel"
              inputMode="tel"
              placeholder="919000978856"
              value={draft.whatsappNumber}
              onChange={(e) => patch({ whatsappNumber: e.target.value })}
              disabled={!draft.whatsappEnabled}
              data-testid="input-website-whatsapp-number"
            />
            <p className="text-[11px] text-slate-500">
              Digits only, including country code. Example: 919000978856.
              Opens https://wa.me/&lt;number&gt; on click.
            </p>
          </div>
        </div>

        <Separator />

        {/* ── Homepage Banner ──────────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Label
                htmlFor="ws-banner-enabled"
                className="text-base font-semibold flex items-center gap-2"
              >
                <Megaphone className="w-4 h-4 text-orange-600" />
                Homepage Banner
              </Label>
              <p className="text-xs text-slate-500 mt-1">
                Promo banner shown at the top of the homepage. Updates instantly after save.
              </p>
            </div>
            <Switch
              id="ws-banner-enabled"
              checked={draft.bannerEnabled}
              onCheckedChange={(v) => patch({ bannerEnabled: v })}
              data-testid="switch-website-banner"
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="ws-banner-text">Banner Text</Label>
              <Input
                id="ws-banner-text"
                placeholder="Summer Sale is here!"
                value={draft.bannerText}
                onChange={(e) => patch({ bannerText: e.target.value })}
                disabled={!draft.bannerEnabled}
                data-testid="input-website-banner-text"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ws-banner-offer">Offer Text</Label>
              <Input
                id="ws-banner-offer"
                placeholder="Flat 25% off — use code SUMMER25"
                value={draft.bannerOffer}
                onChange={(e) => patch({ bannerOffer: e.target.value })}
                disabled={!draft.bannerEnabled}
                data-testid="input-website-banner-offer"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Banner Image</Label>
            <div className="flex flex-wrap items-center gap-4">
              <div className="w-32 h-20 rounded-lg border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center">
                {draft.bannerImage ? (
                  <img
                    src={draft.bannerImage}
                    alt="Banner preview"
                    className="w-full h-full object-cover"
                    data-testid="img-banner-preview"
                  />
                ) : (
                  <ImageIcon className="w-7 h-7 text-slate-300" />
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={bannerInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={handleBannerImage}
                  data-testid="input-file-banner"
                />
                <Button
                  variant="outline"
                  onClick={() => bannerInputRef.current?.click()}
                  disabled={!draft.bannerEnabled}
                  data-testid="button-upload-banner"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Upload image
                </Button>
                {draft.bannerImage && (
                  <Button
                    variant="outline"
                    onClick={() => patch({ bannerImage: "" })}
                    disabled={!draft.bannerEnabled}
                    data-testid="button-remove-banner"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Remove
                  </Button>
                )}
              </div>
            </div>
            <p className="text-[11px] text-slate-500">
              PNG, JPG, or WebP — under 2 MB. Optional.
            </p>
          </div>
        </div>

        <Separator />

        {/* ── Maintenance Mode ─────────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Label
                htmlFor="ws-maintenance-enabled"
                className="text-base font-semibold flex items-center gap-2"
              >
                <Wrench className="w-4 h-4 text-amber-600" />
                Maintenance Mode
              </Label>
              <p className="text-xs text-slate-500 mt-1">
                Hide the public site and show a maintenance page. Admin and staff routes stay accessible.
              </p>
            </div>
            <Switch
              id="ws-maintenance-enabled"
              checked={draft.maintenanceMode}
              onCheckedChange={(v) => patch({ maintenanceMode: v })}
              data-testid="switch-website-maintenance"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ws-maintenance-message">Maintenance Message</Label>
            <Textarea
              id="ws-maintenance-message"
              rows={2}
              placeholder="We're upgrading the experience. We'll be back shortly."
              value={draft.maintenanceMessage}
              onChange={(e) => patch({ maintenanceMessage: e.target.value })}
              disabled={!draft.maintenanceMode}
              data-testid="input-website-maintenance-message"
            />
          </div>
          {draft.maintenanceMode && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <strong>Heads up:</strong> The public website will display the maintenance page until this is turned off.
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={saving}
            data-testid="button-website-reset"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset
          </Button>
          <Button
            onClick={handleSave}
            disabled={!dirty || saving}
            data-testid="button-website-save"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? "Saving…" : "Save Website Settings"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Payment Mode Toggle (Test / Live) ────────────────────────────────────────
const PAYMENT_MODE_KEY = "payment_mode_settings_v1";
type PaymentMode = "test" | "live";

function loadPaymentMode(): PaymentMode {
  try {
    const raw = localStorage.getItem(PAYMENT_MODE_KEY);
    if (raw === "live") return "live";
  } catch { /* noop */ }
  return "test";
}

function PaymentModeSection() {
  const [mode, setMode] = useState<PaymentMode>(loadPaymentMode);
  const [saved, setSaved] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const load = () => {
      fetch("/api/settings/paymentmode")
        .then((r) => r.json())
        .then((d) => {
          const m: PaymentMode = d?.mode === "live" ? "live" : "test";
          setMode(m);
          try { localStorage.setItem(PAYMENT_MODE_KEY, m); } catch { /* noop */ }
        })
        .catch(() => {});
    };
    load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, []);

  function handleToggle(checked: boolean) {
    const next: PaymentMode = checked ? "live" : "test";
    setMode(next);
    try { localStorage.setItem(PAYMENT_MODE_KEY, next); } catch { /* noop */ }
    fetch("/api/settings/paymentmode", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: next }),
    }).catch(() => {});
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    toast({
      title: `Payment mode set to ${next === "live" ? "Live" : "Test"}`,
      description: next === "live"
        ? "Real transactions will be processed. Ensure your Live Razorpay keys are configured."
        : "Using test mode — no real money will be charged.",
    });
  }

  return (
    <Card>
      <CardHeader>
        <SectionHeader
          icon={<CreditCard className="w-5 h-5 text-orange-500" />}
          title="Payment Mode"
          description="Switch between Test (sandbox) and Live (production) payment processing."
        />
      </CardHeader>
      <CardContent className="space-y-6">
        {saved && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium">
            <CheckCircle2 className="w-4 h-4" />
            Payment mode updated successfully.
          </div>
        )}

        <div className="flex items-start justify-between gap-4">
          <div>
            <Label htmlFor="payment-mode-switch" className="text-base font-semibold flex items-center gap-2">
              <ToggleLeft className="w-4 h-4 text-orange-500" />
              {mode === "live" ? "Live Mode (Production)" : "Test Mode (Sandbox)"}
            </Label>
            <p className="text-xs text-slate-500 mt-1">
              {mode === "live"
                ? "Real payments are active. Customers will be charged actual amounts."
                : "No real charges. Use Razorpay test card numbers for transactions."}
            </p>
          </div>
          <Switch
            id="payment-mode-switch"
            checked={mode === "live"}
            onCheckedChange={handleToggle}
            data-testid="switch-payment-mode"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div
            className={`rounded-xl border-2 p-4 text-center transition-colors ${
              mode === "test"
                ? "border-blue-400 bg-blue-50"
                : "border-slate-200 bg-slate-50 opacity-50"
            }`}
          >
            <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1">Test Mode</p>
            <p className="text-[11px] text-slate-500">Safe sandbox · No real charges</p>
          </div>
          <div
            className={`rounded-xl border-2 p-4 text-center transition-colors ${
              mode === "live"
                ? "border-green-400 bg-green-50"
                : "border-slate-200 bg-slate-50 opacity-50"
            }`}
          >
            <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-1">Live Mode</p>
            <p className="text-[11px] text-slate-500">Production · Real payments active</p>
          </div>
        </div>

        <p className="text-[11px] text-slate-400">
          This setting is stored locally. Ensure your Razorpay keys above match the selected mode
          (test keys start with <code>rzp_test_</code>, live keys with <code>rzp_live_</code>).
        </p>

        <Separator />

        {/* ── Auto Refund Toggle ─────────────────────────────────────────── */}
        <AutoRefundToggle />
      </CardContent>
    </Card>
  );
}

const AUTO_REFUND_KEY = "payment_auto_refund_v1";

function AutoRefundToggle() {
  const [enabled, setEnabled] = useState<boolean>(() => {
    try { return localStorage.getItem(AUTO_REFUND_KEY) === "true"; } catch { return false; }
  });
  const { toast } = useToast();

  useEffect(() => {
    const load = () => {
      fetch("/api/settings/autorefund")
        .then((r) => r.json())
        .then((d) => {
          if (typeof d?.enabled === "boolean") {
            setEnabled(d.enabled);
            try { localStorage.setItem(AUTO_REFUND_KEY, String(d.enabled)); } catch { /* noop */ }
          }
        })
        .catch(() => {});
    };
    load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, []);

  function handleToggle(checked: boolean) {
    setEnabled(checked);
    try { localStorage.setItem(AUTO_REFUND_KEY, String(checked)); } catch { /* noop */ }
    fetch("/api/settings/autorefund", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: checked }),
    }).catch(() => {});
    toast({
      title: checked ? "Auto Refund enabled" : "Auto Refund disabled",
      description: checked
        ? "Failed payments will automatically trigger a refund to the customer."
        : "Manual action will be required to process refunds on booking failures.",
    });
  }

  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <Label htmlFor="auto-refund-switch" className="text-base font-semibold flex items-center gap-2">
          <RefreshCcw className="w-4 h-4 text-blue-500" />
          Auto Refund on Booking Failure
        </Label>
        <p className="text-xs text-slate-500 mt-1">
          {enabled
            ? "When a booking fails after payment, a refund will be initiated automatically via Razorpay."
            : "Refunds on failed bookings must be processed manually from the Bookings Management page."}
        </p>
      </div>
      <Switch
        id="auto-refund-switch"
        checked={enabled}
        onCheckedChange={handleToggle}
        data-testid="switch-auto-refund"
      />
    </div>
  );
}
