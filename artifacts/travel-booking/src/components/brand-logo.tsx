import { useState, useEffect } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type SiteLogoProps = {
  logoUrl: string | null;
  companyName: string;
  containerClass?: string;
  imgClass?: string;
  iconClass?: string;
};

/**
 * Renders the uploaded brand logo.
 * Falls back to the Sparkles icon if no logo is set or the image fails to load.
 * Used on login, signup, and other standalone pages that live outside the Navbar.
 */
export function SiteLogo({
  logoUrl,
  companyName,
  containerClass = "w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shadow-md",
  imgClass = "w-full h-full object-contain rounded-xl",
  iconClass = "w-6 h-6 text-white",
}: SiteLogoProps) {
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [logoUrl]);

  if (logoUrl && !broken) {
    return (
      <div className={cn(containerClass, "bg-white border border-slate-200 shadow-md p-0 overflow-hidden")}>
        <img
          src={logoUrl}
          alt={companyName}
          className={imgClass}
          onError={() => setBroken(true)}
        />
      </div>
    );
  }

  return (
    <div className={containerClass}>
      <Sparkles className={iconClass} />
    </div>
  );
}
