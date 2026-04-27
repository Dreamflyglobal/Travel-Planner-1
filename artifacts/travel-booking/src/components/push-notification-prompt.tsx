import { useState, useEffect } from "react";
import { Bell, BellOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { useAuth } from "@/contexts/auth-context";
import { APP_NAME } from "@/lib/app-config";

const DISMISSED_KEY = "ww_push_dismissed";

export function PushNotificationPrompt() {
  const { user } = useAuth();
  const { requestPermission, isConfigured } = usePushNotifications(
    user ? { id: user.id, name: user.name, phone: user.phone, email: user.email } : undefined
  );
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isConfigured) return;
    if (!("Notification" in window)) return;
    if (Notification.permission !== "default") return;
    const dismissed = localStorage.getItem(DISMISSED_KEY);
    if (dismissed) return;
    // Show after a short delay so it doesn't block initial render
    const t = setTimeout(() => setShow(true), 3500);
    return () => clearTimeout(t);
  }, [isConfigured]);

  if (!show) return null;

  async function handleAllow() {
    await requestPermission();
    setShow(false);
  }

  function handleDismiss() {
    localStorage.setItem(DISMISSED_KEY, "1");
    setShow(false);
  }

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4 animate-in slide-in-from-bottom-4 duration-300">
      <Card className="shadow-xl border-orange-200 bg-white">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
              <Bell className="w-5 h-5 text-orange-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-gray-900 mb-0.5">
                Stay updated with {APP_NAME}
              </p>
              <p className="text-xs text-gray-500 leading-relaxed">
                Get booking confirmations, exclusive deals, and travel offers instantly.
              </p>
              <div className="flex gap-2 mt-3">
                <Button
                  size="sm"
                  className="bg-orange-500 hover:bg-orange-600 text-white text-xs h-8 px-3 flex-1"
                  onClick={handleAllow}
                >
                  <Bell className="w-3 h-3 mr-1.5" />
                  Allow Notifications
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs h-8 px-3 text-gray-400 hover:text-gray-600"
                  onClick={handleDismiss}
                >
                  <BellOff className="w-3 h-3 mr-1.5" />
                  Not now
                </Button>
              </div>
            </div>
            <button
              onClick={handleDismiss}
              className="flex-shrink-0 text-gray-300 hover:text-gray-500 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
