import { useCallback } from "react";
import { useNotificationSettings } from "@/contexts/notification-settings-context";
import { useToast } from "@/hooks/use-toast";

const API = import.meta.env.VITE_API_BASE_URL ?? "";

export type NotifyTrigger = "booking" | "payment";

export interface NotifyParams {
  trigger: NotifyTrigger;
  to?: string;
  customerName?: string;
  bookingId?: string;
  amount?: number;
  details?: string;
}

export const POPUP_EVENT = "dreamflyglobal:notification-popup";
export interface PopupEventDetail {
  trigger: NotifyTrigger;
  message: string;
  bookingId?: string;
  customerName?: string;
}

function buildEmailHtml(p: NotifyParams) {
  const heading = p.trigger === "booking" ? "Booking Confirmed" : "Payment Successful";
  const intro = p.trigger === "booking"
    ? "Your booking has been confirmed. Details below:"
    : "We've received your payment. Your booking is confirmed.";
  const rows: string[] = [];
  if (p.bookingId) rows.push(`<tr><td style="padding:6px 0;color:#64748b">Booking ID</td><td style="padding:6px 0;font-weight:600">${p.bookingId}</td></tr>`);
  if (p.customerName) rows.push(`<tr><td style="padding:6px 0;color:#64748b">Name</td><td style="padding:6px 0;font-weight:600">${p.customerName}</td></tr>`);
  if (typeof p.amount === "number") rows.push(`<tr><td style="padding:6px 0;color:#64748b">Amount</td><td style="padding:6px 0;font-weight:600">₹${p.amount.toLocaleString("en-IN")}</td></tr>`);
  if (p.details) rows.push(`<tr><td style="padding:6px 0;color:#64748b">Details</td><td style="padding:6px 0">${p.details}</td></tr>`);

  return `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#f1f5f9;font-family:system-ui,-apple-system,sans-serif;color:#0f172a">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.06)">
      <div style="background:linear-gradient(135deg,#7c3aed,#4f46e5);padding:28px 32px;color:#fff">
        <h1 style="margin:0;font-size:22px;font-weight:700">${heading}</h1>
        <p style="margin:6px 0 0;opacity:.9;font-size:14px">${intro}</p>
      </div>
      <div style="padding:24px 32px">
        <table style="width:100%;border-collapse:collapse;font-size:14px">${rows.join("")}</table>
        <p style="margin-top:24px;font-size:13px;color:#64748b">If you have any questions, just reply to this email.</p>
      </div>
      <div style="padding:16px 32px;background:#f8fafc;color:#94a3b8;font-size:12px;text-align:center">
        Sent from your travel platform
      </div>
    </div>
  </body></html>`;
}

export function useBookingNotifier() {
  const { settings } = useNotificationSettings();
  const { toast } = useToast();

  return useCallback(async (params: NotifyParams) => {
    // 1) Popup notification — fire global event so the popup component shows it
    if (settings.popupEnabled && typeof window !== "undefined") {
      const detail: PopupEventDetail = {
        trigger: params.trigger,
        message: settings.popupMessage,
        bookingId: params.bookingId,
        customerName: params.customerName,
      };
      window.dispatchEvent(new CustomEvent(POPUP_EVENT, { detail }));
    }

    // 2) Email notification — POST to backend with admin's SMTP creds
    if (settings.emailEnabled && params.to) {
      try {
        const subject = params.trigger === "booking"
          ? `Booking Confirmed${params.bookingId ? ` — ${params.bookingId}` : ""}`
          : `Payment Successful${params.bookingId ? ` — ${params.bookingId}` : ""}`;

        const res = await fetch(`${API}/api/admin/notify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: params.to,
            subject,
            html: buildEmailHtml(params),
            smtpUser: settings.smtpEmail || undefined,
            smtpPass: settings.smtpPassword || undefined,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (data?.success) {
          toast({ title: "Email sent", description: `Confirmation emailed to ${params.to}` });
        } else if (data?.reason && data.reason !== "SMTP not configured") {
          // Don't spam the user with config-missing errors — just stay silent then
          console.warn("[notifier] email skipped:", data.reason);
        }
      } catch (err) {
        console.warn("[notifier] email failed:", err);
      }
    }
  }, [settings, toast]);
}
