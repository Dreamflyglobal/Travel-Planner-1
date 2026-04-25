import { useLocation } from "wouter";
import {
  useWebsiteSettings,
  sanitizeWhatsappNumber,
} from "@/contexts/website-settings-context";

export function WhatsappFloat() {
  const { settings } = useWebsiteSettings();
  const [location] = useLocation();

  if (!settings.whatsappEnabled) return null;

  const number = sanitizeWhatsappNumber(settings.whatsappNumber);
  if (!number) return null;

  if (location.startsWith("/master-admin") || location.startsWith("/admin")) {
    return null;
  }

  const href = `https://wa.me/${number}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      aria-label="Chat on WhatsApp"
      data-testid="whatsapp-float-button"
      className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-[#25D366] focus:ring-offset-2"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 32 32"
        className="h-7 w-7"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M19.11 17.32c-.27-.13-1.6-.79-1.85-.88-.25-.09-.43-.13-.61.13-.18.27-.7.88-.86 1.06-.16.18-.31.2-.58.07-.27-.13-1.13-.42-2.16-1.34-.8-.71-1.34-1.6-1.5-1.86-.16-.27-.02-.41.12-.55.12-.12.27-.31.4-.47.13-.16.18-.27.27-.45.09-.18.04-.34-.02-.47-.07-.13-.61-1.47-.84-2.02-.22-.53-.45-.46-.61-.47l-.52-.01c-.18 0-.47.07-.72.34-.25.27-.95.93-.95 2.27 0 1.34.97 2.63 1.11 2.81.13.18 1.92 2.93 4.65 4.11.65.28 1.16.45 1.55.58.65.21 1.24.18 1.71.11.52-.08 1.6-.65 1.83-1.28.23-.63.23-1.18.16-1.29-.07-.11-.25-.18-.52-.31zM16.05 5.33h-.01c-5.93 0-10.74 4.81-10.74 10.74 0 1.9.5 3.76 1.45 5.4l-1.55 5.65 5.78-1.52a10.7 10.7 0 0 0 5.06 1.29h.01c5.93 0 10.74-4.81 10.74-10.74 0-2.87-1.12-5.57-3.15-7.6a10.66 10.66 0 0 0-7.59-3.22zm0 19.65h-.01a8.91 8.91 0 0 1-4.55-1.25l-.33-.19-3.43.9.91-3.34-.21-.34a8.92 8.92 0 0 1-1.36-4.71c0-4.93 4.01-8.94 8.95-8.94 2.39 0 4.63.93 6.32 2.62a8.86 8.86 0 0 1 2.62 6.33c0 4.93-4.01 8.94-8.94 8.94z" />
      </svg>
    </a>
  );
}
