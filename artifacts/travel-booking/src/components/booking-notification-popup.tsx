import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";
import { POPUP_EVENT, type PopupEventDetail } from "@/hooks/use-booking-notifier";

export function BookingNotificationPopup() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<PopupEventDetail | null>(null);

  useEffect(() => {
    function onPopup(e: Event) {
      const detail = (e as CustomEvent<PopupEventDetail>).detail;
      if (!detail?.message) return;
      setData(detail);
      setOpen(true);
    }
    window.addEventListener(POPUP_EVENT, onPopup);
    return () => window.removeEventListener(POPUP_EVENT, onPopup);
  }, []);

  if (!data) return null;

  const heading = data.trigger === "booking" ? "Booking Confirmed!" : "Payment Successful!";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mb-3">
            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
          </div>
          <DialogTitle className="text-center text-xl">{heading}</DialogTitle>
          <DialogDescription className="text-center text-base text-slate-600 pt-1">
            {data.message}
          </DialogDescription>
        </DialogHeader>
        {(data.bookingId || data.customerName) && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm space-y-1 mt-2">
            {data.customerName && (
              <div className="flex justify-between">
                <span className="text-slate-500">Name</span>
                <span className="font-semibold">{data.customerName}</span>
              </div>
            )}
            {data.bookingId && (
              <div className="flex justify-between">
                <span className="text-slate-500">Booking ID</span>
                <span className="font-mono font-semibold">{data.bookingId}</span>
              </div>
            )}
          </div>
        )}
        <Button onClick={() => setOpen(false)} className="mt-4 w-full">
          OK
        </Button>
      </DialogContent>
    </Dialog>
  );
}
