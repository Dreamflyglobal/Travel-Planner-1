import { useWebsiteSettings } from "@/contexts/website-settings-context";
import { Sparkles } from "lucide-react";

export function HomepageBanner() {
  const { settings } = useWebsiteSettings();

  if (!settings.bannerEnabled) return null;

  const hasText = !!(settings.bannerText || settings.bannerOffer);
  const hasImage = !!settings.bannerImage;
  if (!hasText && !hasImage) return null;

  return (
    <section
      className="relative w-full overflow-hidden border-b border-primary/10 bg-gradient-to-r from-primary/10 via-primary/5 to-orange-100/40"
      data-testid="homepage-banner"
    >
      <div className="container py-6 md:py-8">
        <div className="flex flex-col items-center gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-4 md:flex-1">
            {!hasImage && (
              <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary md:flex">
                <Sparkles className="h-6 w-6" />
              </div>
            )}
            <div className="flex-1 text-center md:text-left">
              {settings.bannerText && (
                <h2 className="text-xl font-bold leading-tight md:text-2xl">
                  {settings.bannerText}
                </h2>
              )}
              {settings.bannerOffer && (
                <p className="mt-1 text-sm font-medium text-primary md:text-base">
                  {settings.bannerOffer}
                </p>
              )}
            </div>
          </div>
          {hasImage && (
            <div className="w-full max-w-xs md:w-64 md:shrink-0">
              <img
                src={settings.bannerImage}
                alt={settings.bannerText || "Banner"}
                className="w-full rounded-lg object-cover shadow-sm"
                loading="lazy"
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
