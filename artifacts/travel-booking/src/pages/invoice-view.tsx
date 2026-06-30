import { useEffect, useRef, useState } from "react";
import { useBranding } from "@/contexts/branding-context";
import { useRoute, useSearch, Link } from "wouter";
import {
  Printer, Download, ArrowLeft, CheckCircle, Plane, Bus,
  Building2, Map, MapPin, Clock, Calendar, Luggage, Users,
  BedDouble, AlertTriangle, XCircle, Phone, Mail, CreditCard,
  Hash, Star, Share2, MessageCircle, Tag, Navigation,
  ChevronRight, Shield, Info, Globe, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { invoiceNumber as buildInvoiceNumber } from "@/lib/invoice";
import { sanitizeLocation, formatRoute } from "@/lib/location-utils";
import { captureElementAsPDF } from "@/lib/html-pdf";

// ── Seat label converter ──────────────────────────────────────────────────────
const SEAT_COLS = ["A", "B", "C", "D"];
function toSeatLabel(s: string): string {
  const n = parseInt(s, 10);
  if (isNaN(n) || n < 1) return s;
  return `${SEAT_COLS[(n - 1) % 4]}${Math.floor((n - 1) / 4) + 1}`;
}
function formatSeats(seats: string[]): string {
  return seats.map(toSeatLabel).join(", ");
}

// ── Interfaces ────────────────────────────────────────────────────────────────
interface BookingInvoice {
  bookingId: string;
  bookingType: "flight" | "bus" | "hotel" | "package";
  passengerName: string;
  passengerEmail: string;
  passengerPhone: string;
  passengers: number;
  travelDate: string;
  checkoutDate?: string;
  totalAmount: number;
  paymentId: string;
  paymentStatus: string;
  timestamp: string;
  title: string;
  selectedSeats?: string[];
  roomType?: string;
  invoiceNumber?: string;
  generatedAt?: string;
  discount?: number;
  pnr?: string;
  // Hotel
  hotelName?: string;
  hotelCity?: string;
  hotelNights?: number;
  hotelRooms?: number;
  hotelAdults?: number;
  // Bus
  busBoardingPoint?: string;
  busDroppingPoint?: string;
  busDeparture?: string;
  busArrival?: string;
  busType?: string;
  busOperator?: string;
  busFrom?: string;
  busTo?: string;
  busBaseFare?: number;
  busMarkup?: number;
  busConvFee?: number;
  // Flight
  flightAirline?: string;
  flightNumber?: string;
  flightFrom?: string;
  flightTo?: string;
  flightDeparture?: string;
  flightArrival?: string;
  flightDuration?: string;
  flightBaseFare?: number;
  flightConvFee?: number;
  flightBaggageKg?: number;
  flightBaggageCost?: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────
const COMPANY = {
  name:    "Dream Fly Global",
  brand:   "Dream Fly Global",
  tagline: "Your Ultimate Travel Companion",
  phone:   "+91 9000978856",
  email:   "support@dreamflyglobal.com",
  website: "www.dreamflyglobal.in",
  gst:     "GSTIN: Applied For",
};


// ── Type accent colours ───────────────────────────────────────────────────────
function typeAccent(type: BookingInvoice["bookingType"]) {
  if (type === "flight") return {
    bg: "bg-blue-600", light: "bg-blue-50", border: "border-blue-200",
    text: "text-blue-700", badge: "bg-blue-100 text-blue-700",
    gradient: "from-blue-700 to-blue-900", bar: "bg-blue-600",
    ring: "ring-blue-500",
  };
  if (type === "hotel") return {
    bg: "bg-violet-600", light: "bg-violet-50", border: "border-violet-200",
    text: "text-violet-700", badge: "bg-violet-100 text-violet-700",
    gradient: "from-violet-700 to-violet-900", bar: "bg-violet-600",
    ring: "ring-violet-500",
  };
  if (type === "bus") return {
    bg: "bg-orange-500", light: "bg-orange-50", border: "border-orange-200",
    text: "text-orange-700", badge: "bg-orange-100 text-orange-700",
    gradient: "from-orange-600 to-orange-800", bar: "bg-orange-500",
    ring: "ring-orange-500",
  };
  return {
    bg: "bg-teal-600", light: "bg-teal-50", border: "border-teal-200",
    text: "text-teal-700", badge: "bg-teal-100 text-teal-700",
    gradient: "from-teal-600 to-teal-800", bar: "bg-teal-600",
    ring: "ring-teal-500",
  };
}

function typeLabel(type: BookingInvoice["bookingType"]) {
  if (type === "flight") return "Flight Ticket";
  if (type === "hotel")  return "Hotel Booking";
  if (type === "bus")    return "Bus Ticket";
  return "Holiday Package";
}

function TypeIcon({ type, cls = "w-5 h-5" }: { type: BookingInvoice["bookingType"]; cls?: string }) {
  if (type === "flight") return <Plane className={cls} />;
  if (type === "bus")    return <Bus className={cls} />;
  if (type === "hotel")  return <Building2 className={cls} />;
  return <Map className={cls} />;
}

// ── Cancellation policies ─────────────────────────────────────────────────────
const CANCEL_POLICIES: Record<BookingInvoice["bookingType"], { timing: string; refund: string; icon: React.ComponentType<{ className?: string }>; color: string; bar: string }[]> = {
  flight: [
    { timing: "More than 48 hours before departure", refund: "75% refund",  icon: CheckCircle,   color: "text-green-700", bar: "bg-green-500" },
    { timing: "24–48 hours before departure",        refund: "50% refund",  icon: AlertTriangle, color: "text-amber-700", bar: "bg-amber-400" },
    { timing: "Less than 24 hours before departure", refund: "No refund",   icon: XCircle,       color: "text-red-600",   bar: "bg-red-500"   },
  ],
  hotel: [
    { timing: "More than 72 hours before check-in",  refund: "Full refund", icon: CheckCircle,   color: "text-green-700", bar: "bg-green-500" },
    { timing: "24–72 hours before check-in",         refund: "50% refund",  icon: AlertTriangle, color: "text-amber-700", bar: "bg-amber-400" },
    { timing: "Less than 24 hours before check-in",  refund: "No refund",   icon: XCircle,       color: "text-red-600",   bar: "bg-red-500"   },
  ],
  bus: [
    { timing: "More than 24 hours before departure", refund: "75% refund",  icon: CheckCircle,   color: "text-green-700", bar: "bg-green-500" },
    { timing: "4–24 hours before departure",         refund: "25% refund",  icon: AlertTriangle, color: "text-amber-700", bar: "bg-amber-400" },
    { timing: "Less than 4 hours before departure",  refund: "No refund",   icon: XCircle,       color: "text-red-600",   bar: "bg-red-500"   },
  ],
  package: [
    { timing: "More than 30 days before travel",     refund: "75% refund",  icon: CheckCircle,   color: "text-green-700", bar: "bg-green-500" },
    { timing: "15–30 days before travel",            refund: "50% refund",  icon: AlertTriangle, color: "text-amber-700", bar: "bg-amber-400" },
    { timing: "Less than 15 days before travel",     refund: "No refund",   icon: XCircle,       color: "text-red-600",   bar: "bg-red-500"   },
  ],
};

// ── Important notes per type ──────────────────────────────────────────────────
const IMPORTANT_NOTES: Record<BookingInvoice["bookingType"], string[]> = {
  flight: [
    "Carry a valid government-issued photo ID (Aadhar, Passport, or Driving Licence)",
    "Web check-in opens 48 hours before departure — check in online to choose your seat",
    "Arrive at the airport at least 2 hours before domestic / 3 hours before international flights",
    "Baggage allowance as per airline policy — excess baggage charges apply at the counter",
    "This booking is subject to the airline's terms and conditions",
  ],
  bus: [
    "Arrive at the boarding point at least 15 minutes before departure",
    "Carry a valid government-issued photo ID (Aadhar, Passport, or Driving Licence)",
    "This ticket is non-transferable — only the passenger named can board",
    "Boarding points are confirmed by the bus operator and may change — check with the operator",
    "Carry minimal luggage as per operator policy",
  ],
  hotel: [
    "Standard check-in time is 2:00 PM and check-out time is 11:00 AM",
    "Early check-in / late check-out is subject to availability and may incur additional charges",
    "Carry a valid photo ID for hotel check-in — mandatory for all guests",
    "Room preferences are subject to availability at the time of check-in",
    "Damages caused by guests are the guest's responsibility",
  ],
  package: [
    "Carry a valid government-issued photo ID at all times",
    "Itinerary is subject to minor changes due to local conditions or force majeure",
    "Travel insurance is strongly recommended for international packages",
    "Package inclusions are as per the booking confirmation",
  ],
};

// ── Find invoice from all storage sources ─────────────────────────────────────
function findInvoice(bookingId: string): BookingInvoice | null {
  const id = bookingId.toUpperCase();

  try {
    const stored = JSON.parse(localStorage.getItem("ww_invoices") || "[]") as BookingInvoice[];
    const found = stored.find((i) => i.bookingId.toUpperCase() === id);
    if (found) return found;
  } catch {}

  try {
    const bookings = JSON.parse(localStorage.getItem("travel_bookings") || "[]") as BookingInvoice[];
    const found = bookings.find((b) => b.bookingId.toUpperCase() === id);
    if (found) return found;
  } catch {}

  try {
    const last = JSON.parse(localStorage.getItem("lastSuccessfulBooking") || "null") as BookingInvoice | null;
    if (last && last.bookingId.toUpperCase() === id) return last;
  } catch {}

  try {
    const msw = JSON.parse(localStorage.getItem("msw_mock_bookings") || "[]") as Record<string, unknown>[];
    const found = msw.find((b) => ((b.bookingId as string) || "").toUpperCase() === id);
    if (found) {
      return {
        bookingId:      (found.bookingId as string) || id,
        bookingType:    ((found.bookingType || found.type) as BookingInvoice["bookingType"]) || "flight",
        passengerName:  (found.passengerName || found.customerName || "") as string,
        passengerEmail: (found.passengerEmail || found.customerEmail || "") as string,
        passengerPhone: (found.passengerPhone || found.customerPhone || "") as string,
        passengers:     (found.passengers as number) || 1,
        travelDate:     (found.travelDate || found.date || new Date().toISOString()) as string,
        checkoutDate:   (found.checkoutDate || (found as any).details?.hotelInfo?.checkout) as string | undefined,
        totalAmount:    (found.totalAmount || found.amount || 0) as number,
        paymentId:      (found.paymentId || found.razorpayPaymentId || "—") as string,
        paymentStatus:  (found.paymentStatus || found.status || "paid") as string,
        timestamp:      (found.createdAt || found.timestamp || new Date().toISOString()) as string,
        title:          (found.title || found.description || "") as string,
        selectedSeats:  (found.selectedSeats || (found as any).details?.selectedSeats) as string[] | undefined,
        roomType:       (found.roomType || (found as any).details?.hotelInfo?.room_type) as string | undefined,
        hotelName:      (found.hotelName || (found as any).details?.hotelInfo?.hotel_name) as string | undefined,
        hotelCity:      (found.hotelCity || found.city || (found as any).details?.hotelInfo?.city) as string | undefined,
        hotelNights:    (found.hotelNights || (found as any).details?.hotelInfo?.nights) as number | undefined,
        hotelRooms:     ((found.hotelRooms || (found as any).details?.hotelInfo?.rooms) as number) || 1,
        hotelAdults:    (found.hotelAdults || found.guests || (found as any).details?.hotelInfo?.guests) as number | undefined,
        busBoardingPoint: (found.busBoardingPoint || (found as any).details?.busInfo?.boarding_point) as string | undefined,
        busDroppingPoint: (found.busDroppingPoint || (found as any).details?.busInfo?.dropping_point) as string | undefined,
        busDeparture:     (found.busDeparture     || (found as any).details?.busInfo?.departure) as string | undefined,
        busArrival:       (found.busArrival        || (found as any).details?.busInfo?.arrival)   as string | undefined,
        busType:          (found.busType           || (found as any).details?.busInfo?.busType)   as string | undefined,
        busOperator:      (found.busOperator       || found.operator || (found as any).details?.busInfo?.operator) as string | undefined,
        busFrom:          (found.busFrom           || (found as any).details?.busInfo?.from  || found.from) as string | undefined,
        busTo:            (found.busTo             || (found as any).details?.busInfo?.to    || found.to)   as string | undefined,
        busBaseFare:      (found.busBaseFare       || (found as any).details?.baseAmount) as number | undefined,
        busConvFee:       (found.busConvFee        || (found as any).details?.convenience_fee) as number | undefined,
        flightAirline:    (found.flightAirline || found.airline) as string | undefined,
        flightNumber:     (found.flightNumber || found.flightNum) as string | undefined,
        flightFrom:       (found.flightFrom || (found as any).details?.flightInfo?.from || found.from) as string | undefined,
        flightTo:         (found.flightTo   || (found as any).details?.flightInfo?.to   || found.to)   as string | undefined,
        flightDeparture:  found.flightDeparture as string | undefined,
        flightArrival:    found.flightArrival   as string | undefined,
        flightDuration:   found.flightDuration  as string | undefined,
        flightBaseFare:   (found.flightBaseFare   || (found as any).details?.baseAmount) as number | undefined,
        flightConvFee:    (found.flightConvFee    || (found as any).details?.convenienceFee) as number | undefined,
        flightBaggageKg:  (found.flightBaggageKg  || (found as any).details?.extraBaggageKg) as number | undefined,
        flightBaggageCost:(found.flightBaggageCost || (found as any).details?.extraBaggageCost) as number | undefined,
        discount:         (found.discount          || (found as any).details?.discountAmount) as number | undefined,
      } as BookingInvoice;
    }
  } catch {}

  return null;
}

// ── Formatters ────────────────────────────────────────────────────────────────
function fmt(date: string) {
  try {
    return new Date(date + (date.includes("T") ? "" : "T00:00:00")).toLocaleDateString("en-IN", {
      weekday: "short", day: "2-digit", month: "short", year: "numeric",
    });
  } catch { return date; }
}
function fmtDt(date: string) {
  return new Date(date).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}
function inr(n: number) { return `₹${n.toLocaleString("en-IN")}`; }

// ── Google Maps URL ───────────────────────────────────────────────────────────
function mapsUrl(query: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

// ── WhatsApp share ────────────────────────────────────────────────────────────
function waShareUrl(bookingId: string, invNo: string, amount: number, type: string) {
  const msg = `✅ My ${type} booking is confirmed!\n\nBooking ID: ${bookingId}\nInvoice: ${invNo}\nAmount: ₹${amount.toLocaleString("en-IN")}\n\nView invoice: ${window.location.href}`;
  return `https://wa.me/?text=${encodeURIComponent(msg)}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────
function SectionHeading({ icon, title, accent }: { icon: React.ReactNode; title: string; accent: string }) {
  return (
    <div className={`flex items-center gap-2.5 mb-5 pb-3 border-b-2 ${accent}`}>
      <span className="opacity-80">{icon}</span>
      <h3 className="font-bold text-slate-800 text-sm tracking-widest uppercase">{title}</h3>
    </div>
  );
}

function Row({ label, value, icon, mono, accent }: {
  label: string; value: React.ReactNode; icon?: React.ReactNode; mono?: boolean; accent?: boolean;
}) {
  return (
    <div className={`flex items-start gap-3 py-2.5 border-b border-slate-100 last:border-0 ${accent ? "bg-orange-50 -mx-1 px-1 rounded-lg" : ""}`}>
      {icon && <span className="text-slate-400 mt-0.5 shrink-0">{icon}</span>}
      <span className="text-slate-500 text-sm w-40 shrink-0 leading-snug">{label}</span>
      <span className={`text-sm flex-1 leading-snug ${mono ? "font-mono text-xs" : "font-semibold"} ${accent ? "text-orange-700" : "text-slate-800"}`}>
        {value}
      </span>
    </div>
  );
}

function RouteChip({ label, place, time, sublabel, color, mapQuery }: {
  label: string; place: string; time?: string; sublabel?: string;
  color: "green" | "red" | "blue"; mapQuery?: string;
}) {
  const c = {
    green: { dot: "bg-green-500", bg: "bg-green-50 border-green-200", label: "text-green-600", place: "text-green-900" },
    red:   { dot: "bg-red-500",   bg: "bg-red-50 border-red-200",     label: "text-red-600",   place: "text-red-900"   },
    blue:  { dot: "bg-blue-500",  bg: "bg-blue-50 border-blue-200",   label: "text-blue-600",  place: "text-blue-900"  },
  }[color];
  return (
    <div className={`flex-1 border rounded-2xl p-4 ${c.bg}`}>
      <div className="flex items-center gap-1.5 mb-2">
        <span className={`w-2 h-2 rounded-full ${c.dot}`} />
        <span className={`text-[10px] font-bold uppercase tracking-widest ${c.label}`}>{label}</span>
      </div>
      <p className={`font-black text-lg leading-tight ${c.place}`}>{place}</p>
      {sublabel && <p className="text-slate-500 text-xs mt-0.5">{sublabel}</p>}
      {time && <p className="text-slate-700 text-sm mt-1 font-bold">{time}</p>}
      {mapQuery && (
        <a
          href={mapsUrl(mapQuery)} target="_blank" rel="noopener noreferrer"
          className={`inline-flex items-center gap-1 mt-2 text-[10px] font-bold ${c.label} hover:underline`}
        >
          <Navigation className="w-3 h-3" /> View on Maps
        </a>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function InvoiceView() {
  const [, params] = useRoute("/invoice/:bookingId");
  const bookingId  = params?.bookingId ?? "";
  const search     = useSearch();
  const autoDownload = new URLSearchParams(search).get("download") === "1";

  const [invoice,     setInvoice]     = useState<BookingInvoice | null>(null);
  const [notFound,    setNotFound]    = useState(false);
  const [downloading, setDownloading] = useState(false);
  const printAreaRef = useRef<HTMLDivElement>(null);
  const { branding } = useBranding();
  const company = { ...COMPANY, name: branding.companyName, brand: branding.companyName };

  useEffect(() => {
    window.scrollTo(0, 0);
    if (!bookingId) { setNotFound(true); return; }

    // 1. Try all localStorage sources first (instant, offline-capable)
    const cached = findInvoice(bookingId);
    if (cached) { setInvoice(cached); return; }

    // 2. Fall back to the database via API — works cross-device / after cache clear
    const apiBase = (import.meta.env.VITE_API_BASE_URL as string) ?? "";
    fetch(`${apiBase}/api/invoice/${encodeURIComponent(bookingId.toUpperCase())}`)
      .then(async (r) => {
        if (!r.ok) { setNotFound(true); return; }
        const data = await r.json() as BookingInvoice;
        if (!data || !data.bookingId) { setNotFound(true); return; }
        setInvoice(data);
      })
      .catch(() => setNotFound(true));
  }, [bookingId]);

  // Auto-download when ?download=1 is in the URL (triggered from other pages)
  useEffect(() => {
    if (autoDownload && invoice && printAreaRef.current) {
      // Small delay to ensure full render + fonts loaded
      const t = setTimeout(() => { void handleDownload(); }, 800);
      return () => clearTimeout(t);
    }
  }, [autoDownload, invoice]);

  const handlePrint = () => window.print();

  const handleDownload = async () => {
    if (!invoice || !printAreaRef.current) return;
    setDownloading(true);
    try {
      await captureElementAsPDF(
        printAreaRef.current,
        `DreamFlyGlobal-Invoice-${invoice.bookingId}.pdf`,
      );
    } finally {
      setDownloading(false);
    }
  };

  const handleEmail = () => {
    if (!invoice) return;
    const sub = `Your ${typeLabel(invoice.bookingType)} Confirmation — ${invoice.bookingId}`;
    const body = `Hi,\n\nYour booking is confirmed!\n\nBooking ID: ${invoice.bookingId}\nView Invoice: ${window.location.href}\n\nThank you for booking with ${company.name}.`;
    window.location.href = `mailto:?subject=${encodeURIComponent(sub)}&body=${encodeURIComponent(body)}`;
  };

  if (notFound) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-6">
            <span className="text-4xl">🔍</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mb-3">Invoice Not Found</h1>
          <p className="text-slate-500 mb-2">
            No invoice found for <span className="font-mono font-bold text-slate-700">{bookingId}</span>.
          </p>
          <p className="text-slate-400 text-sm mb-8">
            If you booked on this device, try opening the link again from your bookings page.
          </p>
          <Link href="/bookings"><Button className="w-full">View My Bookings</Button></Link>
        </div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-500">Loading invoice…</p>
        </div>
      </div>
    );
  }

  const invoiceNo     = invoice.invoiceNumber || buildInvoiceNumber(invoice.bookingId, invoice.bookingType);
  const genDate       = invoice.generatedAt   || invoice.timestamp;
  const accent        = typeAccent(invoice.bookingType);
  const cancelPolicy  = CANCEL_POLICIES[invoice.bookingType] || CANCEL_POLICIES.package;
  const notes         = IMPORTANT_NOTES[invoice.bookingType] || IMPORTANT_NOTES.package;

  // Price breakdown
  const baseFare    = invoice.flightBaseFare || invoice.busBaseFare || invoice.totalAmount;
  const convFee     = invoice.flightConvFee  || invoice.busConvFee  || 0;
  const baggageCost = (invoice.flightBaggageKg ?? 0) > 0 ? (invoice.flightBaggageCost ?? 0) : 0;
  const discount    = invoice.discount || 0;

  // PNR: use real API PNR only — never derive a fake one
  const pnr = invoice.pnr || undefined;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 to-slate-200 print:bg-white">

      {/* ── Toolbar ──────────────────────────────────────────────────────────── */}
      <div className="print:hidden sticky top-0 z-10 bg-white border-b shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-2 flex-wrap">
          <Link href="/">
            <button className="flex items-center gap-2 text-slate-600 hover:text-slate-900 text-sm font-medium transition-colors">
              <ArrowLeft className="w-4 h-4" /> Back to {company.name}
            </button>
          </Link>
          <div className="flex items-center gap-2">
            {/* WhatsApp share */}
            <a
              href={waShareUrl(invoice.bookingId, invoiceNo, invoice.totalAmount, typeLabel(invoice.bookingType))}
              target="_blank" rel="noopener noreferrer"
            >
              <Button variant="outline" size="sm" className="gap-1.5 text-xs border-green-300 text-green-700 hover:bg-green-50">
                <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
              </Button>
            </a>
            {/* Email share */}
            <Button variant="outline" size="sm" onClick={handleEmail} className="gap-1.5 text-xs border-blue-300 text-blue-700 hover:bg-blue-50">
              <Mail className="w-3.5 h-3.5" /> Email
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5 text-xs">
              <Printer className="w-3.5 h-3.5" /> Print
            </Button>
            <Button size="sm" onClick={handleDownload} disabled={downloading} className="gap-1.5 text-xs bg-orange-500 hover:bg-orange-600 disabled:opacity-70">
              {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              {downloading ? "Generating…" : "Download PDF"}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Invoice paper ─────────────────────────────────────────────────────── */}
      <div ref={printAreaRef} className="max-w-3xl mx-auto my-6 print:my-0 bg-white shadow-2xl print:shadow-none rounded-3xl print:rounded-none overflow-hidden">

        {/* ══ HEADER ══════════════════════════════════════════════════════════ */}
        <div className="relative overflow-hidden" style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 55%, #0f172a 100%)" }}>
          {/* Decorative blobs */}
          <div className="absolute -top-12 -right-12 w-52 h-52 rounded-full opacity-10" style={{ background: "radial-gradient(circle, white, transparent)" }} />
          <div className="absolute -bottom-8 -left-8 w-40 h-40 rounded-full opacity-5"  style={{ background: "radial-gradient(circle, white, transparent)" }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full opacity-3" style={{ background: "radial-gradient(circle, #f97316 0%, transparent 70%)" }} />

          <div className="relative px-8 pt-8 pb-0">
            {/* Company row */}
            <div className="flex items-start justify-between mb-6 gap-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center shrink-0 shadow-xl">
                  <span className="text-white font-black text-xl tracking-tighter">WW</span>
                </div>
                <div>
                  <h1 className="text-white text-2xl font-black tracking-tight leading-none">{company.name}</h1>
                  <p className="text-orange-300 text-xs font-semibold mt-1">{company.brand}</p>
                  <p className="text-slate-400 text-xs mt-1">{company.tagline}</p>
                  <div className="flex flex-wrap items-center gap-3 mt-2">
                    <span className="flex items-center gap-1 text-slate-400 text-xs">
                      <Phone className="w-3 h-3" /> {company.phone}
                    </span>
                    <span className="flex items-center gap-1 text-slate-400 text-xs">
                      <Mail className="w-3 h-3" /> {company.email}
                    </span>
                  </div>
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className={`inline-flex items-center gap-1.5 text-white text-xs font-bold px-3 py-1.5 rounded-lg ${accent.bg} mb-3`}>
                  <TypeIcon type={invoice.bookingType} cls="w-3.5 h-3.5" />
                  TAX INVOICE
                </span>
                <div className="space-y-0.5">
                  <p className="text-slate-500 text-xs">Invoice No.</p>
                  <p className="text-slate-200 font-mono font-bold text-sm">{invoiceNo}</p>
                </div>
                <div className="mt-2 space-y-0.5">
                  <p className="text-slate-500 text-xs">Generated</p>
                  <p className="text-slate-300 text-xs font-semibold">{fmtDt(genDate)}</p>
                </div>
              </div>
            </div>

            {/* Booking ID + type banner */}
            <div className="flex items-stretch gap-0 bg-white bg-opacity-5 border border-white border-opacity-10 rounded-2xl overflow-hidden mb-0">
              <div className="flex items-center gap-3 px-5 py-4 flex-1">
                <div className="w-10 h-10 rounded-full bg-green-500 bg-opacity-20 border border-green-400 border-opacity-40 flex items-center justify-center shrink-0">
                  <CheckCircle className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <p className="text-green-400 text-xs font-bold uppercase tracking-widest">Payment Confirmed</p>
                  <p className="text-white font-bold text-base mt-0.5">{typeLabel(invoice.bookingType)}</p>
                  <p className="text-slate-400 text-xs">Your booking has been confirmed</p>
                </div>
              </div>
              <div className="border-l border-white border-opacity-10 px-5 py-4 text-right min-w-0 max-w-[180px]">
                <p className="text-slate-400 text-xs uppercase tracking-wide">Booking ID</p>
                <p className="text-white font-mono font-bold text-sm mt-0.5 break-all leading-snug">{invoice.bookingId}</p>
                {pnr && (
                  <>
                    <p className="text-slate-400 text-xs uppercase tracking-wide mt-2">PNR / Ref</p>
                    <p className="text-orange-300 font-mono font-bold text-base">{pnr}</p>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Status strip */}
          <div className="grid grid-cols-3 border-t border-white border-opacity-10 mt-6">
            <div className="px-6 py-3 border-r border-white border-opacity-10">
              <p className="text-slate-500 text-[10px] uppercase tracking-widest">Booking Date</p>
              <p className="text-slate-200 font-bold text-sm mt-0.5">{fmt(invoice.timestamp)}</p>
            </div>
            <div className="px-6 py-3 border-r border-white border-opacity-10">
              <p className="text-slate-500 text-[10px] uppercase tracking-widest">Total Paid</p>
              <p className="text-green-400 font-black text-lg mt-0.5">{inr(invoice.totalAmount)}</p>
            </div>
            <div className="px-6 py-3">
              <p className="text-slate-500 text-[10px] uppercase tracking-widest">Status</p>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-green-400 font-bold text-sm uppercase">PAID</span>
              </div>
            </div>
          </div>
        </div>

        {/* ══ CUSTOMER DETAILS ════════════════════════════════════════════════ */}
        <div className="px-8 py-6 border-b border-slate-100">
          <SectionHeading icon={<Users className="w-4 h-4 text-slate-500" />} title="Customer Details" accent="border-slate-300" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-0">
            <Row label="Full Name"   value={invoice.passengerName}  icon={<Users      className="w-3.5 h-3.5" />} />
            <Row label="Phone"       value={invoice.passengerPhone} icon={<Phone      className="w-3.5 h-3.5" />} />
            <Row label="Email"       value={invoice.passengerEmail} icon={<Mail       className="w-3.5 h-3.5" />} />
            <Row label="Payment ID"  value={invoice.paymentId}      icon={<CreditCard className="w-3.5 h-3.5" />} mono />
          </div>
        </div>

        {/* ══ FLIGHT DETAILS ══════════════════════════════════════════════════ */}
        {invoice.bookingType === "flight" && (
          <div className="px-8 py-6 border-b border-slate-100">
            <SectionHeading
              icon={<Plane className="w-4 h-4 text-blue-600" />}
              title="✈️  Flight Ticket"
              accent="border-blue-400"
            />

            {/* Airline header */}
            {(invoice.flightAirline || invoice.flightNumber) && (
              <div className="flex items-center gap-3 mb-5">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shrink-0 shadow">
                  <span className="text-white font-black text-sm">
                    {(invoice.flightAirline || "?").substring(0, 2).toUpperCase()}
                  </span>
                </div>
                <div>
                  {invoice.flightAirline && <p className="font-bold text-slate-800 text-base">{invoice.flightAirline}</p>}
                  {invoice.flightNumber && (
                    <span className="inline-block bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded mt-0.5 font-mono">
                      {invoice.flightNumber}
                    </span>
                  )}
                </div>
                {invoice.flightDuration && (
                  <div className="ml-auto text-right">
                    <p className="text-slate-400 text-xs">Duration</p>
                    <p className="font-bold text-slate-700">{invoice.flightDuration}</p>
                  </div>
                )}
              </div>
            )}

            {/* Route visual */}
            {(invoice.flightFrom || invoice.flightTo) && (
              <div className="flex items-center gap-3 mb-6">
                <RouteChip label="Departure" place={sanitizeLocation(invoice.flightFrom) || "—"} time={invoice.flightDeparture} color="blue" />
                <div className="flex-shrink-0 flex flex-col items-center gap-1">
                  <Plane className="w-5 h-5 text-slate-300 rotate-90 sm:rotate-0" />
                  <div className="w-12 h-px bg-slate-200" />
                </div>
                <RouteChip label="Arrival" place={sanitizeLocation(invoice.flightTo) || "—"} time={invoice.flightArrival} color="red" />
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-0">
              <Row label="Travel Date"   value={fmt(invoice.travelDate)}          icon={<Calendar  className="w-3.5 h-3.5" />} />
              <Row label="Passengers"    value={`${invoice.passengers || 1} Pax`} icon={<Users     className="w-3.5 h-3.5" />} />
              <Row label="PNR / Ref No." value={pnr || "PNR Pending"}              icon={<Hash      className="w-3.5 h-3.5" />} mono />
              {invoice.selectedSeats?.length ? (
                <Row label="Seat Numbers" value={invoice.selectedSeats.join(", ")} icon={<Star className="w-3.5 h-3.5" />} />
              ) : null}
              {(invoice.flightBaggageKg ?? 0) > 0 && (
                <Row label="Extra Baggage" value={`${invoice.flightBaggageKg} kg (${inr(invoice.flightBaggageCost || 0)})`} icon={<Luggage className="w-3.5 h-3.5" />} />
              )}
              {invoice.flightDuration && (
                <Row label="Duration" value={invoice.flightDuration} icon={<Clock className="w-3.5 h-3.5" />} />
              )}
            </div>
          </div>
        )}

        {/* ══ BUS DETAILS ═════════════════════════════════════════════════════ */}
        {invoice.bookingType === "bus" && (
          <div className="px-8 py-6 border-b border-slate-100">
            <SectionHeading icon={<Bus className="w-4 h-4 text-orange-500" />} title="🚌  Bus Ticket" accent="border-orange-400" />

            {/* Operator header */}
            {(invoice.busOperator || invoice.busType) && (
              <div className="flex items-center gap-3 mb-5">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center shrink-0 shadow">
                  <Bus className="w-6 h-6 text-white" />
                </div>
                <div>
                  {invoice.busOperator && <p className="font-bold text-slate-800 text-base">{invoice.busOperator}</p>}
                  {invoice.busType && (
                    <span className="inline-block bg-orange-100 text-orange-700 text-xs font-bold px-2 py-0.5 rounded mt-0.5">
                      {invoice.busType}
                    </span>
                  )}
                </div>
                {(invoice.busFrom || invoice.busTo) && (
                  <div className="ml-auto text-right">
                    <p className="text-slate-400 text-xs">Route</p>
                    <p className="font-bold text-slate-700 text-sm">{formatRoute(invoice.busFrom, invoice.busTo)}</p>
                  </div>
                )}
              </div>
            )}

            {/* Boarding → Dropping route */}
            <div className="flex items-stretch gap-3 mb-6">
              <RouteChip
                label="Boarding Point"
                place={sanitizeLocation(invoice.busBoardingPoint || invoice.busFrom) || "—"}
                sublabel={sanitizeLocation(invoice.busFrom) || undefined}
                time={invoice.busDeparture}
                color="green"
                mapQuery={invoice.busBoardingPoint || invoice.busFrom}
              />
              <div className="flex-shrink-0 flex flex-col items-center justify-center gap-1.5">
                <ChevronRight className="w-5 h-5 text-slate-300" />
              </div>
              <RouteChip
                label="Dropping Point"
                place={sanitizeLocation(invoice.busDroppingPoint || invoice.busTo) || "—"}
                sublabel={sanitizeLocation(invoice.busTo) || undefined}
                time={invoice.busArrival}
                color="red"
                mapQuery={invoice.busDroppingPoint || invoice.busTo}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-0">
              <Row label="Travel Date"   value={fmt(invoice.travelDate)}          icon={<Calendar className="w-3.5 h-3.5" />} />
              <Row label="Passengers"    value={`${invoice.passengers || 1} Pax`} icon={<Users    className="w-3.5 h-3.5" />} />
              {invoice.selectedSeats?.length ? (
                <Row label="Seat Numbers" value={formatSeats(invoice.selectedSeats)} icon={<Star className="w-3.5 h-3.5" />} />
              ) : null}
              <Row label="PNR / Ref No." value={pnr || "PNR Pending"} icon={<Hash className="w-3.5 h-3.5" />} mono />
            </div>
          </div>
        )}

        {/* ══ HOTEL DETAILS ═══════════════════════════════════════════════════ */}
        {invoice.bookingType === "hotel" && (
          <div className="px-8 py-6 border-b border-slate-100">
            <SectionHeading icon={<Building2 className="w-4 h-4 text-violet-600" />} title="🏨  Hotel Booking" accent="border-violet-400" />

            {/* Hotel header */}
            {invoice.hotelName && (
              <div className="flex items-start gap-3 mb-5">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center shrink-0 shadow">
                  <Building2 className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-slate-800 text-base">{invoice.hotelName}</p>
                  {invoice.hotelCity && (
                    <span className="inline-flex items-center gap-1 text-violet-600 text-xs font-semibold mt-0.5">
                      <MapPin className="w-3 h-3" /> {invoice.hotelCity}
                    </span>
                  )}
                  {invoice.hotelNights && (
                    <span className="ml-3 inline-block bg-violet-100 text-violet-700 text-xs font-bold px-2 py-0.5 rounded mt-0.5">
                      {invoice.hotelNights} Night{invoice.hotelNights > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                {invoice.hotelCity && (
                  <a
                    href={mapsUrl((invoice.hotelName || "") + " " + (invoice.hotelCity || ""))}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-800 font-bold border border-violet-200 rounded-lg px-2 py-1 bg-violet-50 hover:bg-violet-100 transition-colors"
                  >
                    <Navigation className="w-3 h-3" /> View Location
                  </a>
                )}
              </div>
            )}

            {/* Check-in / Check-out */}
            <div className="flex items-stretch gap-3 mb-6">
              <RouteChip label="Check-in"  place={fmt(invoice.travelDate)} time="2:00 PM" color="green" />
              <div className="flex-shrink-0 flex items-center justify-center">
                <ChevronRight className="w-5 h-5 text-slate-300" />
              </div>
              <RouteChip label="Check-out" place={invoice.checkoutDate ? fmt(invoice.checkoutDate) : "—"} time="11:00 AM" color="red" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-0">
              {invoice.roomType && (
                <Row label="Room Type" value={<span className="capitalize">{invoice.roomType} Room</span>} icon={<BedDouble className="w-3.5 h-3.5" />} />
              )}
              <Row label="Rooms"   value={`${invoice.hotelRooms  || 1} Room${(invoice.hotelRooms  || 1) > 1 ? "s" : ""}`} />
              <Row label="Guests"  value={`${invoice.hotelAdults || 2} Adult${(invoice.hotelAdults || 2) > 1 ? "s" : ""}`} icon={<Users className="w-3.5 h-3.5" />} />
              <Row label="Nights"  value={`${invoice.hotelNights || "—"} Night${(invoice.hotelNights || 1) > 1 ? "s" : ""}`} icon={<BedDouble className="w-3.5 h-3.5" />} />
              <Row label="PNR / Ref No." value={pnr} icon={<Hash className="w-3.5 h-3.5" />} mono />
            </div>
          </div>
        )}

        {/* ══ PACKAGE ═════════════════════════════════════════════════════════ */}
        {invoice.bookingType === "package" && (
          <div className="px-8 py-6 border-b border-slate-100">
            <SectionHeading icon={<Map className="w-4 h-4 text-teal-600" />} title="🌴  Holiday Package" accent="border-teal-400" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-0">
              <Row label="Package"     value={invoice.title}                           />
              <Row label="Travel Date" value={fmt(invoice.travelDate)}                 icon={<Calendar className="w-3.5 h-3.5" />} />
              {invoice.checkoutDate && <Row label="Return Date" value={fmt(invoice.checkoutDate)} icon={<Calendar className="w-3.5 h-3.5" />} />}
              <Row label="Travelers"   value={`${invoice.passengers || 1} Person${(invoice.passengers || 1) > 1 ? "s" : ""}`} icon={<Users className="w-3.5 h-3.5" />} />
              <Row label="Ref No."     value={pnr} icon={<Hash className="w-3.5 h-3.5" />} mono />
            </div>
          </div>
        )}

        {/* ══ PAYMENT BREAKDOWN ═══════════════════════════════════════════════ */}
        <div className="px-8 py-6 border-b border-slate-100">
          <SectionHeading icon={<CreditCard className="w-4 h-4 text-slate-500" />} title="Payment Summary" accent="border-slate-300" />

          <div className="rounded-2xl overflow-hidden border border-slate-200">
            {/* Base fare */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50">
              <span className="text-slate-600 text-sm">
                {invoice.bookingType === "hotel" ? "Room Rate" : "Base Fare"}
                {invoice.bookingType === "hotel" && invoice.hotelNights
                  ? ` × ${invoice.hotelNights} Night${invoice.hotelNights > 1 ? "s" : ""}`
                  : invoice.passengers > 1 ? ` × ${invoice.passengers}` : ""}
              </span>
              <span className="text-slate-800 font-semibold">{inr(baseFare)}</span>
            </div>

            {/* Extra baggage */}
            {baggageCost > 0 && (
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50">
                <span className="text-slate-600 text-sm">Extra Baggage ({invoice.flightBaggageKg} kg)</span>
                <span className="text-slate-800 font-semibold">{inr(baggageCost)}</span>
              </div>
            )}

            {/* Convenience fee */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50">
              <span className="text-slate-600 text-sm">Convenience Fee</span>
              {convFee > 0
                ? <span className="text-slate-800 font-semibold">{inr(convFee)}</span>
                : <span className="text-green-600 text-sm font-semibold">Included</span>}
            </div>

            {/* Taxes */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50">
              <span className="text-slate-600 text-sm">Taxes & GST</span>
              <span className="text-green-600 text-sm font-semibold">Included</span>
            </div>

            {/* Discount */}
            {discount > 0 && (
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-green-50">
                <span className="text-green-700 text-sm flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5" /> Discount Applied
                </span>
                <span className="text-green-700 font-bold">− {inr(discount)}</span>
              </div>
            )}

            {/* Total */}
            <div className="flex items-center justify-between px-5 py-4 bg-gradient-to-r from-orange-500 to-orange-600">
              <div>
                <p className="text-orange-100 text-xs">Total Amount Paid</p>
                <p className="text-white font-bold text-sm">via Razorpay</p>
              </div>
              <span className="text-white font-black text-2xl">{inr(invoice.totalAmount)}</span>
            </div>
          </div>

          {/* Payment ID */}
          <div className="mt-3 flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5">
            <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
            <span className="text-green-700 text-xs font-bold">PAYMENT ID:&nbsp;</span>
            <span className="text-green-800 text-xs font-mono break-all">{invoice.paymentId}</span>
          </div>
        </div>

        {/* ══ CANCELLATION POLICY ═════════════════════════════════════════════ */}
        <div className="px-8 py-6 border-b border-slate-100">
          <SectionHeading icon={<Shield className="w-4 h-4 text-slate-500" />} title="Cancellation Policy" accent="border-slate-300" />
          <div className="space-y-2">
            {cancelPolicy.map(({ timing, refund, icon: Icon, color, bar }) => (
              <div key={timing} className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5">
                <div className={`w-1.5 self-stretch rounded-full ${bar} shrink-0`} />
                <div className="flex-1">
                  <p className="text-slate-700 text-sm leading-snug">{timing}</p>
                </div>
                <div className={`flex items-center gap-1.5 font-bold text-sm shrink-0 ${color}`}>
                  <Icon className="w-4 h-4" />
                  {refund}
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-3 flex items-center gap-1">
            <Info className="w-3 h-3" />
            Processing fee (if any) is non-refundable. Subject to provider policy.
          </p>
        </div>

        {/* ══ IMPORTANT NOTES ═════════════════════════════════════════════════ */}
        <div className="px-8 py-6 border-b border-slate-100">
          <SectionHeading icon={<AlertTriangle className="w-4 h-4 text-amber-500" />} title="Important Notes" accent="border-amber-300" />
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 space-y-3">
            {notes.map((note, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="w-5 h-5 rounded-full bg-amber-400 text-white text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <p className="text-slate-700 text-sm leading-snug">{note}</p>
              </div>
            ))}
            <div className="pt-2 border-t border-amber-200 flex items-center gap-2 text-amber-700 text-xs font-semibold">
              <Phone className="w-3.5 h-3.5" /> Need help? Call {company.phone}
            </div>
          </div>
        </div>

        {/* ══ SHARE & DOWNLOAD ════════════════════════════════════════════════ */}
        <div className="px-8 py-6 border-b border-slate-100 print:hidden">
          <SectionHeading icon={<Share2 className="w-4 h-4 text-slate-500" />} title="Share & Download" accent="border-slate-300" />
          <div className="grid grid-cols-3 gap-3">
            <Button
              variant="outline"
              onClick={handleDownload}
              disabled={downloading}
              className="flex-col h-20 gap-2 rounded-2xl border-orange-200 hover:bg-orange-50 hover:border-orange-300 disabled:opacity-70"
            >
              {downloading ? <Loader2 className="w-5 h-5 text-orange-500 animate-spin" /> : <Download className="w-5 h-5 text-orange-500" />}
              <span className="text-xs font-bold text-slate-700">{downloading ? "Generating…" : "Download PDF"}</span>
            </Button>
            <a
              href={waShareUrl(invoice.bookingId, invoiceNo, invoice.totalAmount, typeLabel(invoice.bookingType))}
              target="_blank" rel="noopener noreferrer" className="block"
            >
              <Button
                variant="outline"
                className="w-full flex-col h-20 gap-2 rounded-2xl border-green-200 hover:bg-green-50 hover:border-green-300"
              >
                <MessageCircle className="w-5 h-5 text-green-500" />
                <span className="text-xs font-bold text-slate-700">Share WhatsApp</span>
              </Button>
            </a>
            <Button
              variant="outline"
              onClick={handleEmail}
              className="flex-col h-20 gap-2 rounded-2xl border-blue-200 hover:bg-blue-50 hover:border-blue-300"
            >
              <Mail className="w-5 h-5 text-blue-500" />
              <span className="text-xs font-bold text-slate-700">Email Invoice</span>
            </Button>
          </div>
        </div>

        {/* ══ FOOTER ══════════════════════════════════════════════════════════ */}
        <div className="relative overflow-hidden" style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)" }}>
          <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full opacity-5" style={{ background: "radial-gradient(circle, #f97316, transparent)" }} />
          <div className="px-8 py-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-orange-500 flex items-center justify-center mx-auto mb-4 shadow-lg">
              <span className="text-white font-black text-lg">WW</span>
            </div>
            <p className="text-white font-bold text-lg mb-1">Thank you for booking with Dream Fly! ✈️</p>
            <p className="text-orange-300 text-sm font-semibold mb-4">{company.brand} — {company.tagline}</p>
            <div className="flex flex-wrap items-center justify-center gap-4 text-slate-400 text-xs mb-4">
              <span className="flex items-center gap-1.5"><Globe className="w-3 h-3" /> {company.website}</span>
              <span className="flex items-center gap-1.5"><Mail  className="w-3 h-3" /> {company.email}</span>
              <span className="flex items-center gap-1.5"><Phone className="w-3 h-3" /> {company.phone}</span>
            </div>
            <div className="border-t border-white border-opacity-10 pt-4">
              <p className="text-slate-600 text-xs">
                Invoice: {invoiceNo} · Generated: {fmtDt(genDate)} · {company.gst}
              </p>
              <p className="text-slate-700 text-xs mt-1">
                This is a computer-generated invoice and does not require a physical signature.
              </p>
            </div>
          </div>
        </div>

      </div>
      <div className="h-8 print:hidden" />
    </div>
  );
}
