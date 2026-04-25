import { useLocation } from "wouter";
import type { ReactNode } from "react";
import { useWebsiteSettings } from "@/contexts/website-settings-context";
import { useBranding } from "@/contexts/branding-context";
import { Wrench } from "lucide-react";

const ALLOWED_PREFIXES = [
  "/master-admin",
  "/admin",
  "/staff",
  "/staff-login",
];

export function MaintenanceGate({ children }: { children: ReactNode }) {
  const { settings } = useWebsiteSettings();
  const { branding } = useBranding();
  const [location] = useLocation();

  if (!settings.maintenanceMode) return <>{children}</>;

  const isAllowed = ALLOWED_PREFIXES.some((p) => location.startsWith(p));
  if (isAllowed) return <>{children}</>;

  const brandName = branding?.companyName || "Our website";

  return (
    <div
      className="min-h-[100dvh] flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-100 px-6"
      data-testid="maintenance-page"
    >
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-amber-100">
          <Wrench className="h-10 w-10 text-amber-600" />
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">
            Site Under Maintenance
          </h1>
          <p className="text-muted-foreground">
            {settings.maintenanceMessage ||
              `${brandName} is currently undergoing scheduled maintenance. Please check back soon.`}
          </p>
        </div>
        <div className="text-xs text-muted-foreground">
          Thank you for your patience.
        </div>
      </div>
    </div>
  );
}
