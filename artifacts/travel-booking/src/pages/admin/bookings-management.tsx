import { useEffect, useMemo, useState } from "react";
import { sanitizeLocation, formatRoute, sanitizeBookingTitle } from "@/lib/location-utils";
import { Link } from "wouter";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Search, RefreshCw, Eye, X, CheckCircle2, AlertTriangle,
  Loader2, Wallet, Plane, Bus as BusIcon, Building2, Briefcase,
  IndianRupee, Mail, MessageSquare, Phone, Copy, Download, Clock,
  MapPin, User, CreditCard, FileText, StickyNote, ChevronRight,
  Send, CheckCheck, XCircle, Hotel, Calendar, Users, Hash, UserCheck,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type RefundInfo = {
  id: number;
  status: string;
  amount: number;
  refundId: string | null;
  errorMessage: string | null;
  createdAt: string;
};

type AdminNote = { note: string; addedAt: string; addedBy: string };

type AdminBooking = {
  id: number;
  bookingRef: string | null;
  userId: string | null;
  userName: string;
  userEmail: string;
  userPhone: string | null;
  serviceType: string;
  title: string | null;
  amount: number;
  status: string;
  bookingStatus: string;
  failureReason: string | null;
  failureCode: string | null;
  paymentMethod: string | null;
  paymentStatus: string;
  paymentId: string | null;
  razorpayOrderId: string | null;
  travelDate: string;
  passengers: number;
  details: unknown;
  createdAt: string;
  refund: RefundInfo | null;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: "all",           label: "All statuses" },
  { value: "confirmed",     label: "Ticket Confirmed" },
  { value: "pending",       label: "Pending" },
  { value: "booking_failed",label: "Booking Failed" },
  { value: "cancelled",     label: "Cancelled" },
  { value: "refunded",      label: "Refunded" },
];

const PAYMENT_STATUS_OPTIONS = [
  { value: "all",     label: "All payments" },
  { value: "paid",    label: "Payment Successful" },
  { value: "pending", label: "Payment Pending" },
  { value: "failed",  label: "Payment Failed" },
];

const BOOKING_STATUS_OPTIONS = [
  { value: "all",        label: "All booking states" },
  { value: "confirmed",  label: "Ticket Confirmed" },
  { value: "processing", label: "Booking Processing" },
  { value: "pending",    label: "Booking Pending" },
  { value: "failed",     label: "Booking Failed" },
];

const TYPE_OPTIONS = [
  { value: "all",     label: "All types" },
  { value: "flight",  label: "Flight" },
  { value: "bus",     label: "Bus" },
  { value: "hotel",   label: "Hotel" },
  { value: "package", label: "Package" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function getAuthHeader(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const token =
      window.localStorage.getItem("admin_jwt") ||
      window.localStorage.getItem("jwt_token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch { return {}; }
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "confirmed":     return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "pending":       return "bg-amber-100 text-amber-800 border-amber-200";
    case "processing":    return "bg-blue-100 text-blue-800 border-blue-200";
    case "cancelled":     return "bg-rose-100 text-rose-800 border-rose-200";
    case "refunded":      return "bg-indigo-100 text-indigo-800 border-indigo-200";
    case "booking_failed":
    case "failed":        return "bg-red-100 text-red-800 border-red-200";
    default:              return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

function paymentStatusBadgeClass(status: string): string {
  switch (status) {
    case "paid":    return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "pending": return "bg-amber-100 text-amber-800 border-amber-200";
    case "failed":  return "bg-rose-100 text-rose-800 border-rose-200";
    default:        return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

function paymentStatusLabel(status: string): string {
  switch (status) {
    case "paid":    return "Payment Successful";
    case "pending": return "Payment Pending";
    case "failed":  return "Payment Failed";
    default:        return status;
  }
}

function bookingStatusLabel(status: string): string {
  switch (status) {
    case "confirmed":  return "Ticket Confirmed";
    case "processing": return "Booking Processing";
    case "pending":    return "Booking Pending";
    case "failed":     return "Booking Failed";
    default:           return status;
  }
}

function refundBadgeClass(status: string): string {
  switch (status) {
    case "completed":  return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "processing": return "bg-amber-100 text-amber-800 border-amber-200";
    case "failed":     return "bg-rose-100 text-rose-800 border-rose-200";
    default:           return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

function formatINR(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", maximumFractionDigits: 0,
  }).format(n);
}

function fmtDate(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

function fmtDateShort(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch { return iso; }
}

function ServiceIcon({ type, cls = "w-3.5 h-3.5" }: { type: string; cls?: string }) {
  switch (type) {
    case "flight":  return <Plane     className={cls} />;
    case "bus":     return <BusIcon   className={cls} />;
    case "hotel":   return <Building2 className={cls} />;
    case "package": return <Briefcase className={cls} />;
    default:        return <Briefcase className={cls} />;
  }
}

// ── Field display component ───────────────────────────────────────────────────

function Field({
  label, value, mono, className, icon,
}: {
  label: string; value: string | undefined | null; mono?: boolean; className?: string; icon?: React.ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold flex items-center gap-1">
        {icon}{label}
      </div>
      <div className={`text-sm text-slate-900 break-words ${mono ? "font-mono" : ""} ${className ?? ""}`}>
        {value || "—"}
      </div>
    </div>
  );
}

// ── Service-specific detail panels ────────────────────────────────────────────

function FlightDetails({ d }: { d: Record<string, any> }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-xl border border-blue-100">
        <Plane className="w-8 h-8 text-blue-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-bold text-lg text-slate-900">
            {formatRoute(d.from || d.origin, d.to || d.destination) || "—"}
          </div>
          <div className="text-sm text-slate-600">
            {d.airline || d.airlineName || "—"} · {d.flightNumber || d.flight_number || "—"}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Departure" value={d.departureTime || d.departure?.time || d.departure} />
        <Field label="Arrival" value={d.arrivalTime || d.arrival?.time || d.arrival} />
        <Field label="Duration" value={d.duration} />
        <Field label="Class" value={d.cabinClass || d.class || d.fareClass} />
        <Field label="PNR / Ticket No." value={d.pnr || d.ticketNumber || d.bookingCode || "PNR Pending"} mono />
        <Field label="Airline PNR" value={d.airlinePnr || d.providerPnr || "PNR Pending"} mono />
        <Field label="From City" value={d.from || d.origin} />
        <Field label="To City" value={d.to || d.destination} />
      </div>
      {Array.isArray(d.passengers) && d.passengers.length > 0 && (
        <div>
          <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Passengers</h5>
          <div className="rounded-lg border divide-y">
            {d.passengers.map((p: any, i: number) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2 text-sm">
                <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="font-medium flex-1">{p.name || p.passengerName || `Passenger ${i + 1}`}</span>
                <span className="text-slate-500 text-xs">{p.age ? `${p.age} yrs` : ""} {p.gender || ""}</span>
                <span className="text-xs text-slate-400 font-mono">{p.seatNumber || p.seat || ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {d.fareDetails && (
        <div>
          <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Fare Breakdown</h5>
          <div className="rounded-lg border bg-slate-50 p-3 space-y-1.5 text-sm">
            {Object.entries(d.fareDetails as Record<string, any>).map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <span className="text-slate-600 capitalize">{k.replace(/([A-Z])/g, " $1").trim()}</span>
                <span className="font-medium">
                  {typeof v === "number" ? formatINR(v) : String(v)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function HotelDetails({ d }: { d: Record<string, any> }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-xl border border-amber-100">
        <Hotel className="w-8 h-8 text-amber-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-bold text-lg text-slate-900">{d.hotelName || d.name || "—"}</div>
          <div className="text-sm text-slate-600">{d.city || d.hotelCity || "—"}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Check-In" value={d.checkIn || d.checkInDate} icon={<Calendar className="w-3 h-3" />} />
        <Field label="Check-Out" value={d.checkOut || d.checkOutDate} icon={<Calendar className="w-3 h-3" />} />
        <Field label="Nights" value={d.nights ? String(d.nights) : undefined} />
        <Field label="Rooms" value={d.rooms ? String(d.rooms) : undefined} />
        <Field label="Room Type" value={d.roomType || d.room_type} />
        <Field label="Board Basis" value={d.boardBasis || d.mealPlan} />
        <Field label="Booking Code" value={d.bookingCode || d.confirmationNumber} mono />
        <Field label="Hotel ID" value={d.hotelId || d.propertyId} mono />
      </div>
      {d.guests && (
        <div>
          <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Guests</h5>
          <div className="rounded-lg border divide-y">
            {(Array.isArray(d.guests) ? d.guests : [d.guests]).map((g: any, i: number) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2 text-sm">
                <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="font-medium">{g.name || `Guest ${i + 1}`}</span>
                <span className="text-slate-500 text-xs ml-auto">{g.type || ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {d.priceBreakdown && (
        <div>
          <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Price Breakdown</h5>
          <div className="rounded-lg border bg-slate-50 p-3 space-y-1.5 text-sm">
            {Object.entries(d.priceBreakdown as Record<string, any>).map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <span className="text-slate-600 capitalize">{k.replace(/([A-Z])/g, " $1").trim()}</span>
                <span className="font-medium">{typeof v === "number" ? formatINR(v) : String(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BusDetails({ d }: { d: Record<string, any> }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 p-4 bg-green-50 rounded-xl border border-green-100">
        <BusIcon className="w-8 h-8 text-green-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-bold text-lg text-slate-900">
            {formatRoute(d.from || d.origin, d.to || d.destination) || "—"}
          </div>
          <div className="text-sm text-slate-600">
            {d.operator || d.busName || d.name || "—"} · {d.busType || ""}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Departure" value={d.departure || d.departureTime} />
        <Field label="Arrival" value={d.arrival || d.arrivalTime} />
        <Field label="Duration" value={d.duration} />
        <Field label="Seat Numbers" value={Array.isArray(d.seatNumbers) ? d.seatNumbers.join(", ") : d.seatNumbers} />
        <Field label="Boarding Point" value={d.boardingPoint} icon={<MapPin className="w-3 h-3" />} />
        <Field label="Dropping Point" value={d.droppingPoint} icon={<MapPin className="w-3 h-3" />} />
        <Field label="Ticket No." value={d.ticketNumber || d.pnr || "PNR Pending"} mono />
        <Field label="Bus Type" value={d.busType} />
      </div>
      {Array.isArray(d.passengers) && d.passengers.length > 0 && (
        <div>
          <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Passengers</h5>
          <div className="rounded-lg border divide-y">
            {d.passengers.map((p: any, i: number) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2 text-sm">
                <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="font-medium flex-1">{p.name || p.passengerName || `Passenger ${i + 1}`}</span>
                <span className="text-slate-500 text-xs">{p.age ? `${p.age} yrs` : ""} {p.gender || ""}</span>
                <span className="text-xs text-slate-400 font-mono">{p.seat || p.seatNumber || ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PackageDetails({ d }: { d: Record<string, any> }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 p-4 bg-purple-50 rounded-xl border border-purple-100">
        <Briefcase className="w-8 h-8 text-purple-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="font-bold text-lg text-slate-900">{d.packageName || d.name || "Holiday Package"}</div>
          <div className="text-sm text-slate-600">{d.destination || d.city || "—"}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nights" value={d.nights ? `${d.nights} nights` : undefined} />
        <Field label="Days" value={d.days ? `${d.days} days` : undefined} />
        <Field label="Destination" value={d.destination} />
        <Field label="Category" value={d.category || d.packageType} />
        <Field label="Check-In" value={d.checkIn || d.startDate} />
        <Field label="Check-Out" value={d.checkOut || d.endDate} />
      </div>
      {d.inclusions && (
        <div>
          <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Inclusions</h5>
          <div className="rounded-lg border bg-slate-50 p-3 text-sm text-slate-700">
            {Array.isArray(d.inclusions)
              ? <ul className="space-y-1">{d.inclusions.map((inc: string, i: number) => (
                  <li key={i} className="flex items-start gap-2"><CheckCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />{inc}</li>
                ))}</ul>
              : d.inclusions}
          </div>
        </div>
      )}
      {d.pricingBreakdown && (
        <div>
          <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Price Breakdown</h5>
          <div className="rounded-lg border bg-slate-50 p-3 space-y-1.5 text-sm">
            {Object.entries(d.pricingBreakdown as Record<string, any>).map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <span className="text-slate-600 capitalize">{k.replace(/([A-Z])/g, " $1").trim()}</span>
                <span className="font-medium">{typeof v === "number" ? formatINR(v) : String(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ServiceDetails({ booking }: { booking: AdminBooking }) {
  const d = (booking.details ?? {}) as Record<string, any>;
  switch (booking.serviceType) {
    case "flight":  return <FlightDetails d={d} />;
    case "hotel":   return <HotelDetails d={d} />;
    case "bus":     return <BusDetails d={d} />;
    case "package": return <PackageDetails d={d} />;
    default:
      return (
        <div className="rounded-lg border bg-slate-50 p-4">
          <pre className="text-xs text-slate-600 whitespace-pre-wrap break-all">
            {JSON.stringify(d, null, 2)}
          </pre>
        </div>
      );
  }
}

// ── Timeline builder ──────────────────────────────────────────────────────────

type TimelineEvent = {
  label: string;
  desc: string;
  time: string;
  icon: React.ReactNode;
  color: string;
};

function buildTimeline(booking: AdminBooking): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  events.push({
    label: "Booking Created",
    desc:  `${booking.serviceType} booking placed by ${booking.userName}`,
    time:  fmtDate(booking.createdAt),
    icon:  <FileText className="w-3.5 h-3.5" />,
    color: "bg-blue-500",
  });

  if (booking.paymentStatus === "paid" && booking.paymentId) {
    events.push({
      label: "Payment Successful",
      desc:  `${formatINR(booking.amount)} via ${booking.paymentMethod || "Razorpay"} · ${booking.paymentId}`,
      time:  fmtDate(booking.createdAt),
      icon:  <CreditCard className="w-3.5 h-3.5" />,
      color: "bg-emerald-500",
    });
  }

  if (booking.status === "confirmed") {
    events.push({
      label: "Booking Confirmed",
      desc:  "Ticket issued and confirmation sent to customer",
      time:  fmtDate(booking.createdAt),
      icon:  <CheckCheck className="w-3.5 h-3.5" />,
      color: "bg-emerald-600",
    });
  }

  if (booking.status === "cancelled") {
    events.push({
      label: "Booking Cancelled",
      desc:  "Booking was marked as cancelled by admin",
      time:  "—",
      icon:  <XCircle className="w-3.5 h-3.5" />,
      color: "bg-rose-500",
    });
  }

  if (booking.bookingStatus === "failed" || booking.status === "booking_failed") {
    events.push({
      label: "Booking Failed",
      desc:  booking.failureReason ?? "The booking could not be confirmed after payment",
      time:  fmtDate(booking.createdAt),
      icon:  <AlertTriangle className="w-3.5 h-3.5" />,
      color: "bg-red-500",
    });
  }

  if (booking.refund) {
    events.push({
      label: `Refund ${booking.refund.status === "completed" ? "Completed" : booking.refund.status === "processing" ? "Processing" : "Failed"}`,
      desc:  `${formatINR(booking.refund.amount)} · ${booking.refund.refundId || "pending"}`,
      time:  fmtDate(booking.refund.createdAt),
      icon:  <Wallet className="w-3.5 h-3.5" />,
      color: booking.refund.status === "completed" ? "bg-indigo-500" : "bg-amber-500",
    });
  }

  const d = (booking.details ?? {}) as Record<string, any>;
  const adminNotes: AdminNote[] = Array.isArray(d.adminNotes) ? d.adminNotes : [];
  for (const n of adminNotes) {
    events.push({
      label: "Admin Note",
      desc:  n.note,
      time:  fmtDate(n.addedAt),
      icon:  <StickyNote className="w-3.5 h-3.5" />,
      color: "bg-amber-400",
    });
  }

  return events;
}

// ── Main BookingDetailSheet ───────────────────────────────────────────────────

function BookingDetailSheet({
  booking,
  open,
  onOpenChange,
  onBookingUpdated,
}: {
  booking: AdminBooking | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onBookingUpdated: (updated: AdminBooking) => void;
}) {
  const { toast } = useToast();
  const [acting, setActing] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [resending, setResending] = useState<string | null>(null);
  const [markingFailed, setMarkingFailed] = useState(false);
  const [failureReasonInput, setFailureReasonInput] = useState("");
  const [showMarkFailedForm, setShowMarkFailedForm] = useState(false);

  if (!booking) return null;

  const d = (booking.details ?? {}) as Record<string, any>;
  const adminNotes: AdminNote[] = Array.isArray(d.adminNotes) ? d.adminNotes : [];
  const timeline = buildTimeline(booking);

  async function handleStatusChange(status: "confirmed" | "cancelled") {
    setActing(true);
    try {
      const res = await fetch(`/api/admin/bookings/${booking!.id}/status`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed");
      onBookingUpdated(json.booking as AdminBooking);
      toast({
        title: status === "confirmed" ? "Booking confirmed" : "Booking cancelled",
        description: `Booking ${booking!.bookingRef ?? `#${booking!.id}`} updated.`,
      });
    } catch (e) {
      toast({ title: "Update failed", description: String(e instanceof Error ? e.message : e), variant: "destructive" });
    } finally { setActing(false); }
  }

  async function handleResend(channel: "email" | "sms" | "whatsapp" | "all") {
    setResending(channel);
    try {
      const res = await fetch(`/api/admin/bookings/${booking!.id}/resend`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ channel }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Resend failed");
      const results = json.results as Record<string, { sent: boolean; reason?: string }>;
      const sentChannels = Object.entries(results).filter(([, v]) => v.sent).map(([k]) => k);
      const failedChannels = Object.entries(results).filter(([, v]) => !v.sent).map(([k]) => k);
      if (sentChannels.length > 0) {
        toast({ title: "Notifications sent", description: `Sent via: ${sentChannels.join(", ")}` });
      }
      if (failedChannels.length > 0) {
        toast({
          title: "Some channels failed",
          description: `Failed: ${failedChannels.map(k => `${k} (${results[k]?.reason ?? "unknown"})`).join(", ")}`,
          variant: "destructive",
        });
      }
    } catch (e) {
      toast({ title: "Resend failed", description: String(e instanceof Error ? e.message : e), variant: "destructive" });
    } finally { setResending(null); }
  }

  async function handleAddNote() {
    if (!noteText.trim()) return;
    setAddingNote(true);
    try {
      const res = await fetch(`/api/admin/bookings/${booking!.id}/notes`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ note: noteText.trim() }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to add note");
      const updatedDetails = {
        ...(booking!.details as Record<string, any>),
        adminNotes: json.adminNotes,
      };
      onBookingUpdated({ ...booking!, details: updatedDetails });
      setNoteText("");
      toast({ title: "Note added", description: "Admin note saved to booking." });
    } catch (e) {
      toast({ title: "Failed", description: String(e instanceof Error ? e.message : e), variant: "destructive" });
    } finally { setAddingNote(false); }
  }

  function copyBookingDetails() {
    const lines = [
      `Booking ID: ${booking.bookingRef ?? `#${booking.id}`}`,
      `Customer: ${booking.userName}`,
      `Email: ${booking.userEmail}`,
      `Phone: ${booking.userPhone || "—"}`,
      `Service: ${booking.serviceType}`,
      `Title: ${booking.title || "—"}`,
      `Amount: ${formatINR(booking.amount)}`,
      `Status: ${booking.status}`,
      `Payment ID: ${booking.paymentId || "—"}`,
      `Travel Date: ${booking.travelDate}`,
      `Passengers: ${booking.passengers}`,
    ].join("\n");
    navigator.clipboard.writeText(lines).then(() => {
      toast({ title: "Copied", description: "Booking details copied to clipboard." });
    });
  }

  const canConfirm    = booking.status !== "confirmed" && booking.status !== "refunded";
  const canCancel     = booking.status !== "cancelled"  && booking.status !== "refunded";
  const canMarkFailed = booking.paymentStatus === "paid"
    && booking.bookingStatus !== "failed"
    && booking.status !== "refunded"
    && booking.status !== "booking_failed";

  async function handleMarkFailed() {
    if (!failureReasonInput.trim()) {
      toast({ title: "Reason required", description: "Please enter the failure reason.", variant: "destructive" });
      return;
    }
    setMarkingFailed(true);
    try {
      const res = await fetch(`/api/admin/bookings/${booking!.id}/mark-failed`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ reason: failureReasonInput.trim(), code: "api_error", initiateRefund: true }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed");
      onBookingUpdated(json.booking as AdminBooking);
      setShowMarkFailedForm(false);
      setFailureReasonInput("");
      toast({
        title: "Booking marked as failed",
        description: json.refund?.initiated
          ? `Refund of ${formatINR(booking!.amount)} initiated successfully.`
          : "Booking marked as failed. Refund could not be initiated automatically.",
      });
    } catch (e) {
      toast({ title: "Failed", description: String(e instanceof Error ? e.message : e), variant: "destructive" });
    } finally { setMarkingFailed(false); }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto p-0" side="right">

        {/* ── Header ── */}
        <div className="sticky top-0 z-10 bg-white border-b px-5 py-4">
          <SheetHeader>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <SheetTitle className="text-base font-bold text-slate-900 flex items-center gap-2 flex-wrap">
                  <ServiceIcon type={booking.serviceType} cls="w-4 h-4 text-slate-600" />
                  <span className="font-mono">{booking.bookingRef ?? `#${booking.id}`}</span>
                  <Badge variant="outline" className={`capitalize text-xs ${statusBadgeClass(booking.status)}`}>
                    {booking.status}
                  </Badge>
                  {booking.paymentStatus === "paid" ? (
                    <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">Paid</Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                      {booking.paymentStatus}
                    </Badge>
                  )}
                </SheetTitle>
                <SheetDescription className="text-xs mt-0.5">
                  {sanitizeBookingTitle(booking.title) || booking.serviceType} · Created {fmtDate(booking.createdAt)}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          {/* Quick action buttons */}
          <div className="flex flex-wrap gap-2 mt-3">
            <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8"
              disabled={resending === "email"} onClick={() => handleResend("email")}>
              {resending === "email" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
              Email
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8"
              disabled={resending === "sms"} onClick={() => handleResend("sms")}>
              {resending === "sms" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Phone className="w-3 h-3" />}
              SMS
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8"
              disabled={resending === "whatsapp"} onClick={() => handleResend("whatsapp")}>
              {resending === "whatsapp" ? <Loader2 className="w-3 h-3 animate-spin" /> : <MessageSquare className="w-3 h-3" />}
              WhatsApp
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8"
              disabled={resending === "all"} onClick={() => handleResend("all")}>
              {resending === "all" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              Resend All
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8" onClick={copyBookingDetails}>
              <Copy className="w-3 h-3" /> Copy
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8" asChild>
              <a href={`/api/tickets/${booking.bookingRef ?? booking.id}`} target="_blank" rel="noreferrer">
                <Download className="w-3 h-3" /> PDF
              </a>
            </Button>
          </div>
        </div>

        {/* ── Content tabs ── */}
        <div className="px-5 py-4">
          <Tabs defaultValue="overview">
            <TabsList className="w-full grid grid-cols-4 mb-5">
              <TabsTrigger value="overview"  className="text-xs">Overview</TabsTrigger>
              <TabsTrigger value="details"   className="text-xs">Details</TabsTrigger>
              <TabsTrigger value="timeline"  className="text-xs">Timeline</TabsTrigger>
              <TabsTrigger value="notes"     className="text-xs">
                Notes {adminNotes.length > 0 && <span className="ml-1 rounded-full bg-amber-500 text-white text-[9px] px-1.5">{adminNotes.length}</span>}
              </TabsTrigger>
            </TabsList>

            {/* ── Overview tab ── */}
            <TabsContent value="overview" className="space-y-5 mt-0">

              {/* Customer */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" /> Customer Information
                </h4>
                <div className="grid grid-cols-2 gap-3 p-4 rounded-xl bg-slate-50 border">
                  <Field label="Full Name"   value={booking.userName} />
                  <Field label="Email"       value={booking.userEmail} />
                  <Field label="Phone"       value={booking.userPhone} />
                  <Field label="User ID"     value={booking.userId} mono />
                  <Field label="Passengers"  value={String(booking.passengers)} />
                  <Field label="Travel Date" value={fmtDateShort(booking.travelDate)} />
                </div>
              </div>

              {/* Payment */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3 flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5" /> Payment Information
                </h4>
                <div className="grid grid-cols-2 gap-3 p-4 rounded-xl bg-slate-50 border">
                  <div className="col-span-2 flex items-center justify-between">
                    <span className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Total Amount</span>
                    <span className="text-2xl font-bold text-slate-900">{formatINR(booking.amount)}</span>
                  </div>
                  {/* Fare breakdown */}
                  {(booking.baseFare || booking.markupAmount || booking.convenienceFee ||
                    booking.details?.rawBaseAmount || booking.details?.base_price ||
                    booking.details?.markupAmount || booking.details?.markup ||
                    booking.details?.convenienceFee || booking.details?.convenience_fee) && (
                    <div className="col-span-2 rounded-lg border border-slate-200 bg-white divide-y text-xs">
                      {(() => {
                        const baseFare = booking.baseFare ?? booking.details?.rawBaseAmount ?? booking.details?.base_price ?? null;
                        const markup   = booking.markupAmount ?? booking.details?.markupAmount ?? booking.details?.markup ?? null;
                        const convFee  = booking.convenienceFee ?? booking.details?.convenienceFee ?? booking.details?.convenience_fee ?? null;
                        const discount = booking.details?.discountAmount ?? null;
                        const credit   = booking.details?.creditApplied ?? null;
                        return (
                          <>
                            {baseFare != null && Number(baseFare) > 0 && (
                              <div className="flex justify-between px-3 py-2 text-slate-600">
                                <span>Base Supplier Fare</span>
                                <span className="font-medium">{formatINR(Number(baseFare))}</span>
                              </div>
                            )}
                            {markup != null && Number(markup) > 0 && (
                              <div className="flex justify-between px-3 py-2 text-amber-700">
                                <span>Platform Markup</span>
                                <span className="font-medium">+ {formatINR(Number(markup))}</span>
                              </div>
                            )}
                            {convFee != null && Number(convFee) > 0 && (
                              <div className="flex justify-between px-3 py-2 text-blue-700">
                                <span>Convenience Fee</span>
                                <span className="font-medium">+ {formatINR(Number(convFee))}</span>
                              </div>
                            )}
                            {discount != null && Number(discount) > 0 && (
                              <div className="flex justify-between px-3 py-2 text-green-700">
                                <span>Coupon Discount</span>
                                <span className="font-medium">− {formatINR(Number(discount))}</span>
                              </div>
                            )}
                            {credit != null && Number(credit) > 0 && (
                              <div className="flex justify-between px-3 py-2 text-teal-700">
                                <span>Credits Applied</span>
                                <span className="font-medium">− {formatINR(Number(credit))}</span>
                              </div>
                            )}
                            <div className="flex justify-between px-3 py-2 font-semibold text-slate-900 bg-slate-50 rounded-b-lg">
                              <span>Total Charged</span>
                              <span>{formatINR(booking.amount)}</span>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">Payment</span>
                    <Badge variant="outline" className={`text-xs ${paymentStatusBadgeClass(booking.paymentStatus)}`}>
                      {paymentStatusLabel(booking.paymentStatus)}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">Booking</span>
                    <Badge variant="outline" className={`text-xs ${statusBadgeClass(booking.bookingStatus)}`}>
                      {bookingStatusLabel(booking.bookingStatus)}
                    </Badge>
                  </div>
                  <Field label="Method"         value={booking.paymentMethod} className="capitalize" />
                  <Field label="Payment ID"     value={booking.paymentId} mono />
                  <Field label="Razorpay Order" value={booking.razorpayOrderId} mono />
                </div>
              </div>

              {/* Refund block */}
              {booking.refund && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3 flex items-center gap-1.5">
                    <Wallet className="w-3.5 h-3.5" /> Refund
                  </h4>
                  <div className="grid grid-cols-2 gap-3 p-4 rounded-xl border border-indigo-100 bg-indigo-50">
                    <Field label="Status"   value={booking.refund.status} className="capitalize" />
                    <Field label="Amount"   value={formatINR(booking.refund.amount)} />
                    <Field label="Refund ID" value={booking.refund.refundId} mono />
                    <Field label="Initiated" value={fmtDate(booking.refund.createdAt)} />
                    {booking.refund.errorMessage && (
                      <div className="col-span-2 text-rose-700 text-xs p-2 bg-rose-50 rounded-lg">
                        {booking.refund.errorMessage}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Failure info banner */}
              {(booking.bookingStatus === "failed" || booking.status === "booking_failed") && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-red-600 mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" /> Booking Failure Details
                  </h4>
                  <div className="space-y-1.5">
                    {booking.failureReason && (
                      <p className="text-sm text-red-800"><span className="font-medium">Reason:</span> {booking.failureReason}</p>
                    )}
                    {booking.failureCode && (
                      <p className="text-xs text-red-600 font-mono">Code: {booking.failureCode}</p>
                    )}
                    {booking.refund ? (
                      <p className="text-xs text-emerald-700 mt-2 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Refund {booking.refund.status} · {formatINR(booking.refund.amount)}
                        {booking.refund.refundId && ` · ID: ${booking.refund.refundId}`}
                      </p>
                    ) : (
                      <p className="text-xs text-amber-700 mt-2">No refund record found.</p>
                    )}
                  </div>
                </div>
              )}

              {/* Admin status actions */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5" /> Support Actions
                </h4>
                <div className="flex flex-wrap gap-2">
                  {canConfirm && (
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 gap-1.5"
                      onClick={() => handleStatusChange("confirmed")} disabled={acting}>
                      {acting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                      Mark Confirmed
                    </Button>
                  )}
                  {canCancel && (
                    <Button size="sm" variant="destructive" className="gap-1.5"
                      onClick={() => handleStatusChange("cancelled")} disabled={acting}>
                      {acting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                      Mark Cancelled
                    </Button>
                  )}
                  {canMarkFailed && !showMarkFailedForm && (
                    <Button size="sm" variant="outline" className="gap-1.5 border-red-300 text-red-700 hover:bg-red-50"
                      onClick={() => setShowMarkFailedForm(true)} disabled={acting}>
                      <AlertTriangle className="w-3.5 h-3.5" /> Mark Booking Failed
                    </Button>
                  )}
                </div>

                {/* Mark Failed inline form */}
                {showMarkFailedForm && (
                  <div className="mt-4 p-4 rounded-xl border border-red-200 bg-red-50 space-y-3">
                    <p className="text-xs font-semibold text-red-700 uppercase tracking-wide">Mark Booking as Failed</p>
                    <p className="text-xs text-red-600">
                      This will mark the booking as failed and automatically initiate a full refund of {formatINR(booking.amount)} via Razorpay.
                      The customer will be notified via email, SMS, and WhatsApp.
                    </p>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-red-700">Failure Reason *</Label>
                      <Textarea
                        placeholder="e.g. Flight ticket could not be issued by the airline. Seats no longer available."
                        value={failureReasonInput}
                        onChange={(e) => setFailureReasonInput(e.target.value)}
                        rows={2}
                        className="resize-none text-sm border-red-200"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="destructive" className="gap-1.5"
                        onClick={handleMarkFailed} disabled={markingFailed || !failureReasonInput.trim()}>
                        {markingFailed ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                        Confirm & Initiate Refund
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setShowMarkFailedForm(false); setFailureReasonInput(""); }}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ── Details tab ── */}
            <TabsContent value="details" className="mt-0">
              <ServiceDetails booking={booking} />

              {/* Raw API response */}
              <details className="mt-5">
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-400 hover:text-slate-600 select-none">
                  Raw API Response Data
                </summary>
                <div className="mt-2 rounded-lg border bg-slate-50 p-3 overflow-x-auto">
                  <pre className="text-xs text-slate-600 whitespace-pre-wrap break-all">
                    {JSON.stringify(booking.details, null, 2)}
                  </pre>
                </div>
              </details>
            </TabsContent>

            {/* ── Timeline tab ── */}
            <TabsContent value="timeline" className="mt-0">
              <div className="relative pl-5">
                {timeline.map((event, i) => (
                  <div key={i} className="relative pb-6 last:pb-0">
                    {i < timeline.length - 1 && (
                      <div className="absolute left-[-5px] top-5 bottom-0 w-px bg-slate-200" />
                    )}
                    <div className={`absolute left-[-12px] top-1 w-5 h-5 rounded-full ${event.color} flex items-center justify-center text-white shadow-sm`}>
                      {event.icon}
                    </div>
                    <div className="ml-3">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold text-sm text-slate-900">{event.label}</span>
                        <span className="text-[10px] text-slate-400 shrink-0 mt-0.5">{event.time}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{event.desc}</p>
                    </div>
                  </div>
                ))}
                {timeline.length === 0 && (
                  <p className="text-sm text-slate-400">No timeline events yet.</p>
                )}
              </div>
            </TabsContent>

            {/* ── Notes tab ── */}
            <TabsContent value="notes" className="space-y-4 mt-0">
              {adminNotes.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  <StickyNote className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No admin notes yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {adminNotes.map((n, i) => (
                    <div key={i} className="p-3 rounded-xl border bg-amber-50 border-amber-100">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold text-amber-700">{n.addedBy}</span>
                        <span className="text-[10px] text-slate-400">{fmtDate(n.addedAt)}</span>
                      </div>
                      <p className="text-sm text-slate-800 leading-relaxed">{n.note}</p>
                    </div>
                  ))}
                </div>
              )}

              <Separator />

              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Add Note
                </Label>
                <Textarea
                  placeholder="Type an admin note about this booking…"
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  rows={3}
                  className="resize-none text-sm"
                />
                <Button size="sm" onClick={handleAddNote} disabled={addingNote || !noteText.trim()}
                  className="gap-1.5">
                  {addingNote ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <StickyNote className="w-3.5 h-3.5" />}
                  Save Note
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BookingsManagementPage() {
  const { toast } = useToast();
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [search, setSearch]     = useState("");
  const [statusFilter,        setStatusFilter]        = useState("all");
  const [typeFilter,          setTypeFilter]          = useState("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("all");
  const [bookingStatusFilter, setBookingStatusFilter] = useState("all");
  const [viewBooking, setViewBooking]   = useState<AdminBooking | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    booking: AdminBooking; type: "cancel" | "confirm" | "refund" | "convert_lead";
  } | null>(null);
  const [acting,              setActing]             = useState(false);
  const [refundAmount,        setRefundAmount]        = useState("");
  const [convertPaymentMethod, setConvertPaymentMethod] = useState("cash");
  const [convertNote,         setConvertNote]         = useState("");

  async function fetchBookings() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim())                   params.set("search",        search.trim());
      if (statusFilter        !== "all")   params.set("status",        statusFilter);
      if (typeFilter          !== "all")   params.set("type",          typeFilter);
      if (paymentStatusFilter !== "all")   params.set("paymentStatus", paymentStatusFilter);
      if (bookingStatusFilter !== "all")   params.set("bookingStatus", bookingStatusFilter);
      const url = `/api/admin/bookings${params.toString() ? `?${params}` : ""}`;
      const res = await fetch(url, { credentials: "include", headers: { ...getAuthHeader() } });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) throw new Error("You must be signed in as admin.");
        throw new Error("Failed to load bookings");
      }
      const json = await res.json();
      setBookings(json.bookings ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load bookings");
    } finally { setLoading(false); }
  }

  useEffect(() => { fetchBookings(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = setTimeout(() => fetchBookings(), 300);
    return () => clearTimeout(t);
  }, [search, statusFilter, typeFilter, paymentStatusFilter, bookingStatusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const summary = useMemo(() => {
    const t = { total: 0, confirmed: 0, pending: 0, cancelled: 0, refunded: 0, failed: 0, revenue: 0 };
    for (const b of bookings) {
      t.total++;
      if (b.status === "confirmed")      t.confirmed++;
      if (b.status === "pending")        t.pending++;
      if (b.status === "cancelled")      t.cancelled++;
      if (b.status === "refunded")       t.refunded++;
      if (b.status === "booking_failed" || b.bookingStatus === "failed") t.failed++;
      // Revenue: ONLY count paid bookings — pending/failed must be excluded
      if (b.paymentStatus === "paid" && b.status !== "cancelled" && b.status !== "refunded") {
        t.revenue += b.amount;
      }
    }
    return t;
  }, [bookings]);

  function handleBookingUpdated(updated: AdminBooking) {
    setBookings((prev) => prev.map((b) => (b.id === updated.id ? { ...b, ...updated } : b)));
    if (viewBooking?.id === updated.id) setViewBooking({ ...viewBooking, ...updated });
  }

  async function handleStatusChange(b: AdminBooking, status: "confirmed" | "cancelled") {
    setActing(true);
    try {
      const res = await fetch(`/api/admin/bookings/${b.id}/status`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed");
      setBookings((prev) => prev.map((x) => (x.id === b.id ? { ...x, status: json.booking.status } : x)));
      toast({ title: status === "confirmed" ? "Booking confirmed" : "Booking cancelled",
              description: `Booking ${b.bookingRef ?? `#${b.id}`} updated.` });
      setConfirmAction(null);
    } catch (e) {
      toast({ title: "Update failed", description: e instanceof Error ? e.message : "Could not update.", variant: "destructive" });
    } finally { setActing(false); }
  }

  async function handleConvertLead(b: AdminBooking) {
    setActing(true);
    try {
      const res = await fetch(`/api/admin/bookings/${b.id}/convert-lead`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ paymentMethod: convertPaymentMethod, note: convertNote }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to convert lead");
      setBookings((prev) => prev.map((x) => (x.id === b.id ? { ...x, ...json.booking } : x)));
      toast({
        title: "Lead Converted",
        description: `Booking ${b.bookingRef ?? `#${b.id}`} is now marked as confirmed (${convertPaymentMethod}).`,
      });
      setConfirmAction(null);
      setConvertNote("");
      setConvertPaymentMethod("cash");
    } catch (e) {
      toast({ title: "Conversion failed", description: e instanceof Error ? e.message : "Could not convert lead.", variant: "destructive" });
    } finally { setActing(false); }
  }

  async function handleRefund(b: AdminBooking) {
    const amount = Number(refundAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({ title: "Invalid amount", description: "Must be a positive number.", variant: "destructive" }); return;
    }
    if (!b.paymentId) {
      toast({ title: "No payment ID", description: "Cannot refund — no Razorpay payment ID.", variant: "destructive" }); return;
    }
    setActing(true);
    try {
      const res = await fetch("/api/admin/refund", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({ paymentId: b.paymentId, amount, bookingId: b.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Refund failed");
      const refundStatus = json?.refund?.status ?? "failed";
      const ok = json.success && refundStatus !== "failed";
      toast({
        title: ok ? "Refund initiated" : "Refund failed",
        description: refundStatus === "completed"
          ? `${formatINR(amount)} refunded${json.refund?.demo ? " (demo)" : ""}.`
          : refundStatus === "processing" ? "Razorpay is processing the refund."
          : json.refund?.errorMessage || "Could not process refund.",
        variant: ok ? "default" : "destructive",
      });
      await fetchBookings();
      setConfirmAction(null);
      setRefundAmount("");
    } catch (e) {
      toast({ title: "Refund failed", description: e instanceof Error ? e.message : "Failed.", variant: "destructive" });
    } finally { setActing(false); }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <Link href="/master-admin/dashboard">
            <Button variant="ghost" size="sm" className="gap-1.5">
              <ArrowLeft className="w-4 h-4" /> Admin
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-slate-900">Booking Management</h1>
            <p className="text-xs text-slate-500">View, confirm, cancel and refund bookings.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => fetchBookings()} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <SummaryCard label="Total"     value={summary.total}     tone="slate" />
          <SummaryCard label="Confirmed" value={summary.confirmed} tone="emerald" />
          <SummaryCard label="Pending"   value={summary.pending}   tone="amber" />
          <SummaryCard label="Cancelled" value={summary.cancelled} tone="rose" />
          <SummaryCard label="Refunded"  value={summary.refunded}  tone="indigo" />
          <SummaryCard label="Failed"    value={summary.failed}    tone="red" />
        </div>

        {/* Revenue banner */}
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white border shadow-sm">
          <IndianRupee className="w-5 h-5 text-emerald-600 shrink-0" />
          <div>
            <div className="text-xs text-slate-500 font-semibold uppercase tracking-wide">Total Revenue</div>
            <div className="text-xl font-bold text-slate-900">{formatINR(summary.revenue)}</div>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-5">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-4">
                <Label className="text-xs uppercase tracking-wide text-slate-500">Search</Label>
                <div className="relative mt-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)}
                    placeholder="Booking ID, email, name or phone…" className="pl-9" />
                </div>
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs uppercase tracking-wide text-slate-500">Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs uppercase tracking-wide text-slate-500">Payment</Label>
                <Select value={paymentStatusFilter} onValueChange={setPaymentStatusFilter}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs uppercase tracking-wide text-slate-500">Booking State</Label>
                <Select value={bookingStatusFilter} onValueChange={setBookingStatusFilter}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BOOKING_STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs uppercase tracking-wide text-slate-500">Service Type</Label>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Bookings table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bookings ({bookings.length})</CardTitle>
            <CardDescription>Click the eye icon or any booking row to see full details.</CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
                <AlertTriangle className="w-4 h-4" /> {error}
              </div>
            )}

            {loading ? (
              <div className="py-12 flex items-center justify-center text-slate-500 text-sm">
                <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Loading bookings…
              </div>
            ) : bookings.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-500">No bookings match your filters.</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Booking ID</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead>Booking</TableHead>
                      <TableHead>Lead Status</TableHead>
                      <TableHead>Refund</TableHead>
                      <TableHead>Travel Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bookings.map((b) => (
                      <TableRow
                        key={b.id}
                        className="cursor-pointer hover:bg-slate-50"
                        onClick={() => setViewBooking(b)}
                      >
                        <TableCell className="font-mono text-xs font-semibold text-slate-700">
                          {b.bookingRef ?? `#${b.id}`}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm font-medium text-slate-900">{b.userName}</div>
                          <div className="text-xs text-slate-400">{b.userEmail}</div>
                          {b.userPhone && <div className="text-xs text-slate-400">{b.userPhone}</div>}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="gap-1 capitalize">
                            <ServiceIcon type={b.serviceType} />
                            {b.serviceType}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold text-slate-900">
                          {formatINR(b.amount)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-xs ${paymentStatusBadgeClass(b.paymentStatus)}`}>
                            {b.paymentStatus === "paid" ? "Paid" : b.paymentStatus === "failed" ? "Failed" : "Pending"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-xs ${statusBadgeClass(b.bookingStatus)}`}>
                            {bookingStatusLabel(b.bookingStatus)}
                          </Badge>
                          {b.failureReason && (
                            <div className="text-[10px] text-red-600 mt-0.5 max-w-[140px] truncate" title={b.failureReason}>
                              {b.failureReason}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {b.paymentStatus === "paid" && b.status !== "cancelled" && b.status !== "refunded" && b.status !== "booking_failed" ? (
                            <Badge variant="outline" className="text-xs bg-teal-50 text-teal-700 border-teal-200">Active</Badge>
                          ) : b.paymentStatus === "failed" || b.status === "booking_failed" ? (
                            <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200">Failed Lead</Badge>
                          ) : b.status === "cancelled" || b.status === "refunded" ? (
                            <Badge variant="outline" className="text-xs bg-slate-100 text-slate-600 border-slate-200 capitalize">{b.status}</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-200">Pending Lead</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {b.refund
                            ? <Badge variant="outline" className={`capitalize ${refundBadgeClass(b.refund.status)}`}>{b.refund.status}</Badge>
                            : <span className="text-xs text-slate-400">—</span>}
                        </TableCell>
                        <TableCell className="text-xs text-slate-600">{b.travelDate}</TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end gap-1.5">
                            <Button size="sm" variant="outline" onClick={() => setViewBooking(b)} title="View details">
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                            {b.status !== "confirmed" && b.status !== "refunded" && (
                              <Button size="sm" variant="outline" className="text-emerald-700 hover:bg-emerald-50"
                                title="Confirm" onClick={() => setConfirmAction({ booking: b, type: "confirm" })}>
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            {b.status !== "cancelled" && b.status !== "refunded" && (
                              <Button size="sm" variant="outline" className="text-rose-700 hover:bg-rose-50"
                                title="Cancel" onClick={() => setConfirmAction({ booking: b, type: "cancel" })}>
                                <X className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            {b.paymentId && b.status !== "refunded" && (
                              <Button size="sm" variant="outline" className="text-indigo-700 hover:bg-indigo-50"
                                title="Refund" onClick={() => { setRefundAmount(String(b.amount)); setConfirmAction({ booking: b, type: "refund" }); }}>
                                <Wallet className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            {b.paymentStatus === "paid" && b.bookingStatus !== "failed" && b.status !== "refunded" && b.status !== "booking_failed" && (
                              <Button size="sm" variant="outline" className="text-red-700 hover:bg-red-50 border-red-200"
                                title="Mark Booking Failed" onClick={() => { setViewBooking(b); }}>
                                <AlertTriangle className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            {(b.paymentStatus === "pending" || b.paymentStatus === "failed" || b.status === "booking_failed") && b.status !== "cancelled" && b.status !== "refunded" && (
                              <Button size="sm" variant="outline" className="text-violet-700 hover:bg-violet-50 border-violet-200"
                                title="Convert Lead to Confirmed Booking"
                                onClick={() => { setConvertNote(""); setConvertPaymentMethod("cash"); setConfirmAction({ booking: b, type: "convert_lead" }); }}>
                                <UserCheck className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* ── Full booking detail sheet ── */}
      <BookingDetailSheet
        booking={viewBooking}
        open={!!viewBooking}
        onOpenChange={(o) => { if (!o) setViewBooking(null); }}
        onBookingUpdated={handleBookingUpdated}
      />

      {/* ── Confirm action dialog ── */}
      <Dialog open={!!confirmAction} onOpenChange={(o) => { if (!o) { setConfirmAction(null); setRefundAmount(""); setConvertNote(""); setConvertPaymentMethod("cash"); } }}>
        <DialogContent>
          {confirmAction && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {confirmAction.type === "confirm"      && "Confirm booking?"}
                  {confirmAction.type === "cancel"       && "Cancel booking?"}
                  {confirmAction.type === "refund"       && "Initiate refund?"}
                  {confirmAction.type === "convert_lead" && "Convert lead to confirmed booking?"}
                </DialogTitle>
                <DialogDescription>
                  {confirmAction.type === "confirm"      && `Booking ${confirmAction.booking.bookingRef ?? `#${confirmAction.booking.id}`} will be marked as confirmed.`}
                  {confirmAction.type === "cancel"       && `Booking ${confirmAction.booking.bookingRef ?? `#${confirmAction.booking.id}`} will be cancelled. This does not refund the customer.`}
                  {confirmAction.type === "refund"       && `A refund will be initiated via Razorpay against payment ${confirmAction.booking.paymentId}.`}
                  {confirmAction.type === "convert_lead" && `This marks the lead as paid and confirmed. Use this when payment was collected outside Razorpay (cash, bank transfer, UPI, etc.).`}
                </DialogDescription>
              </DialogHeader>

              {confirmAction.type === "refund" && (
                <div className="py-2 space-y-2">
                  <Label htmlFor="refund-amount" className="text-sm">Refund amount (INR)</Label>
                  <div className="relative">
                    <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input id="refund-amount" type="number" min={1} max={confirmAction.booking.amount}
                      step="0.01" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} className="pl-9" />
                  </div>
                  <p className="text-xs text-slate-500">Booking total: {formatINR(confirmAction.booking.amount)}</p>
                </div>
              )}

              {confirmAction.type === "convert_lead" && (
                <div className="py-2 space-y-4">
                  {/* Lead summary */}
                  <div className="rounded-lg bg-violet-50 border border-violet-200 px-4 py-3 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Booking</span>
                      <span className="font-mono font-semibold">{confirmAction.booking.bookingRef ?? `#${confirmAction.booking.id}`}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Customer</span>
                      <span className="font-medium">{confirmAction.booking.userName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Amount</span>
                      <span className="font-bold text-violet-700">{formatINR(confirmAction.booking.amount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Current status</span>
                      <span className="capitalize text-amber-700">{confirmAction.booking.paymentStatus}</span>
                    </div>
                  </div>

                  {/* Payment method */}
                  <div className="space-y-1.5">
                    <Label htmlFor="convert-method" className="text-sm font-medium">How was payment collected?</Label>
                    <Select value={convertPaymentMethod} onValueChange={setConvertPaymentMethod}>
                      <SelectTrigger id="convert-method">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="bank_transfer">Bank Transfer / NEFT / RTGS</SelectItem>
                        <SelectItem value="upi">UPI (GPay / PhonePe / Paytm)</SelectItem>
                        <SelectItem value="cheque">Cheque</SelectItem>
                        <SelectItem value="card_pos">Card (POS Terminal)</SelectItem>
                        <SelectItem value="wallet">Wallet / Voucher</SelectItem>
                        <SelectItem value="agent_credit">Agent Credit / Commission Offset</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Note */}
                  <div className="space-y-1.5">
                    <Label htmlFor="convert-note" className="text-sm font-medium">Note <span className="text-slate-400 font-normal">(optional)</span></Label>
                    <Textarea
                      id="convert-note"
                      placeholder="e.g. Customer paid via bank transfer on 04 Jul 2026, UTR: XXXXXXXXXX"
                      value={convertNote}
                      onChange={(e) => setConvertNote(e.target.value)}
                      rows={2}
                      className="resize-none text-sm"
                    />
                  </div>
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                    ⚠️ This action cannot be undone automatically. Make sure payment has actually been received before converting.
                  </p>
                </div>
              )}

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => { setConfirmAction(null); setRefundAmount(""); setConvertNote(""); setConvertPaymentMethod("cash"); }} disabled={acting}>
                  Cancel
                </Button>
                {confirmAction.type === "confirm" && (
                  <Button onClick={() => handleStatusChange(confirmAction.booking, "confirmed")} disabled={acting}
                    className="bg-emerald-600 hover:bg-emerald-700">
                    {acting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                    Mark Confirmed
                  </Button>
                )}
                {confirmAction.type === "cancel" && (
                  <Button variant="destructive" onClick={() => handleStatusChange(confirmAction.booking, "cancelled")} disabled={acting}>
                    {acting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <X className="w-4 h-4 mr-2" />}
                    Cancel Booking
                  </Button>
                )}
                {confirmAction.type === "refund" && (
                  <Button onClick={() => handleRefund(confirmAction.booking)} disabled={acting}
                    className="bg-indigo-600 hover:bg-indigo-700">
                    {acting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wallet className="w-4 h-4 mr-2" />}
                    Initiate Refund
                  </Button>
                )}
                {confirmAction.type === "convert_lead" && (
                  <Button onClick={() => handleConvertLead(confirmAction.booking)} disabled={acting}
                    className="bg-violet-600 hover:bg-violet-700">
                    {acting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserCheck className="w-4 h-4 mr-2" />}
                    Convert to Confirmed
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Summary card ─────────────────────────────────────────────────────────────

function SummaryCard({ label, value, tone }: {
  label: string; value: number;
  tone: "slate" | "emerald" | "amber" | "rose" | "indigo" | "red";
}) {
  const tones: Record<typeof tone, string> = {
    slate:   "bg-slate-50 border-slate-200 text-slate-700",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-800",
    amber:   "bg-amber-50 border-amber-200 text-amber-800",
    rose:    "bg-rose-50 border-rose-200 text-rose-800",
    indigo:  "bg-indigo-50 border-indigo-200 text-indigo-800",
    red:     "bg-red-50 border-red-200 text-red-800",
  };
  return (
    <div className={`rounded-lg border p-3 ${tones[tone]}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wide opacity-80">{label}</div>
      <div className="text-2xl font-bold leading-tight">{value}</div>
    </div>
  );
}
