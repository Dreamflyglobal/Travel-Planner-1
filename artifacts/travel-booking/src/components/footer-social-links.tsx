import { Facebook, Instagram, Twitter } from "lucide-react";
import { useWebsiteSettings } from "@/contexts/website-settings-context";

export function FooterSocialLinks() {
  const { settings } = useWebsiteSettings();

  const items = [
    { url: settings.facebookUrl, label: "Facebook", Icon: Facebook },
    { url: settings.instagramUrl, label: "Instagram", Icon: Instagram },
    { url: settings.twitterUrl, label: "Twitter", Icon: Twitter },
  ].filter((it) => !!it.url && it.url.trim().length > 0);

  if (items.length === 0) return null;

  return (
    <div
      className="mt-6 flex items-center gap-3"
      data-testid="footer-social-links"
    >
      {items.map(({ url, label, Icon }) => (
        <a
          key={label}
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          aria-label={label}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:border-primary hover:text-primary"
        >
          <Icon className="h-4 w-4" />
        </a>
      ))}
    </div>
  );
}
