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

const MAX_LOGO_BYTES = 1_500_000;
const MAX_FAVICON_BYTES = 500_000;

const CURRENCIES: { value: Currency; label: string }[] = [
  { value: "INR", label: "₹ INR — Indian Rupee" },
  { value: "USD", label: "$ USD — US Dollar" },
  { value: "EUR", label: "€ EUR — Euro" },
  { value: "GBP", label: "£ GBP — British Pound" },
  { value: "AED", label: "د.إ AED — UAE Dirham" },
];

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
  const { settings, updateSettings, resetSettings } = useSiteSettings();
  const { toast } = useToast();

  const [brandingDraft, setBrandingDraft] = useState<BrandingSettings>(branding);
  const [siteDraft, setSiteDraft] = useState<SiteSettings>(settings);
  const [dirty, setDirty] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  // Keep drafts in sync if context changes elsewhere (e.g. cross-tab updates)
  useEffect(() => {
    if (!dirty) setBrandingDraft(branding);
  }, [branding, dirty]);
  useEffect(() => {
    if (!dirty) setSiteDraft(settings);
  }, [settings, dirty]);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

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
      if (kind === "logo") patchBranding({ logoUrl: dataUrl });
      else patchBranding({ faviconUrl: dataUrl });
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

    updateBranding(brandingDraft);
    updateSettings(siteDraft);
    setDirty(false);
    toast({
      title: "Settings saved",
      description: "All your changes are now live.",
    });
  }

  function handleDiscard() {
    setBrandingDraft(branding);
    setSiteDraft(settings);
    setDirty(false);
  }

  function handleReset() {
    resetBranding();
    resetSettings();
    setTimeout(() => {
      setBrandingDraft({
        companyName: "Dream Fly Global",
        tagline: "Explore the world",
        logoUrl: null,
        faviconUrl: null,
      });
      setSiteDraft(DEFAULT_SITE_SETTINGS);
      setDirty(false);
    }, 0);
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
                  placeholder="Dream Fly Global"
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
              PNG, JPG, SVG, or WebP — under 1.5&nbsp;MB. Shows in the top-left corner of every page.
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
                {brandingDraft.logoUrl && (
                  <Button
                    variant="outline"
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
              PNG, ICO, SVG, or WebP — under 500&nbsp;KB. Square 32×32 or 64×64 recommended.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-6">
              <FaviconPreview faviconUrl={brandingDraft.faviconUrl} />
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
                {brandingDraft.faviconUrl && (
                  <Button
                    variant="outline"
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
          description="Razorpay credentials and global payment toggle."
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

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="razorpay-key">Razorpay Key ID</Label>
                <Input
                  id="razorpay-key"
                  value={siteDraft.razorpayKeyId}
                  onChange={(e) => patchSite({ razorpayKeyId: e.target.value })}
                  placeholder="rzp_live_xxxxxxxxxxxx"
                  autoComplete="off"
                  data-testid="input-razorpay-key"
                />
              </div>
              <div>
                <Label htmlFor="razorpay-secret">Razorpay Key Secret</Label>
                <div className="relative">
                  <Input
                    id="razorpay-secret"
                    type={showSecret ? "text" : "password"}
                    value={siteDraft.razorpaySecret}
                    onChange={(e) => patchSite({ razorpaySecret: e.target.value })}
                    placeholder="••••••••••••••••"
                    autoComplete="new-password"
                    className="pr-10"
                    data-testid="input-razorpay-secret"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
                    aria-label={showSecret ? "Hide secret" : "Show secret"}
                    data-testid="button-toggle-secret"
                  >
                    {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="text-xs text-slate-500 bg-amber-50 border border-amber-200 rounded-md p-3">
              <strong className="text-amber-800">Note:</strong> Credentials entered here are stored in
              your browser&apos;s local storage for now. For production, move secrets to a server-side
              configuration before going live.
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

        {/* Sticky save bar */}
        <div className="sticky bottom-4 bg-white border border-slate-200 rounded-2xl shadow-lg p-4 flex items-center justify-between gap-4">
          <div className="text-sm">
            {dirty ? (
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
              disabled={!dirty}
              data-testid="button-discard-settings"
            >
              Discard
            </Button>
            <Button
              onClick={handleSave}
              disabled={!dirty}
              data-testid="button-save-settings"
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
  return (
    <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3 min-w-[260px]">
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={companyName}
          className="w-20 h-20 rounded-lg object-contain bg-white border border-slate-200"
          data-testid="img-preview-logo"
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
