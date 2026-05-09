import { APP_NAME, APP_SUPPORT_PHONE, APP_SUPPORT_EMAIL } from "@/lib/app-config";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { AdminLayout } from "@/components/admin-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  Search, Download, FileText, Plane, Building2, Bus, Map,
  RefreshCw, User, Phone, Mail, Calendar, CreditCard,
  IndianRupee, Eye, Printer, MessageCircle, AlertCircle,
  CheckCircle2, Clock, XCircle, Package, ChevronDown, ChevronUp,
  Filter,
} from "lucide-react";
import { sanitizeLocation, formatRoute } from "@/lib/location-utils";
import {
  generateInvoicePDF,
  openWhatsAppConfirmation,
  openEmailConfirmation,
  invoiceNumber,
  type InvoiceData,
} from "@/lib/invoice";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ApiBooking {
  id: number;
  bookingRef: string;
  bookingType: "flight" | "bus" | "hotel" | "package";
  title: string;
  status: string;
  paymentStatus: string;
  passengerName: string;
  passengerEmail: string;
  passengerPhone?: string;
  passengers: number;
  travelDate?: string;
  totalPrice: number;
  paymentId?: string;
  paymentMethod?: string;
  agentId?: string;
  agentCode?: string;
  commissionEarned?: number;
  createdAt: string;
  details?: Record<string, any>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const GST_RATE = 0.05; // 5 % GST on convenience fee (indicative)

function bookingToInvoiceData(b: ApiBooking): InvoiceData {
  const d  = b.details || {};
  const fi = d.flightInfo  || {};
  const bi = d.busInfo     || {};
  const hi = d.hotelInfo   || {};
  return {
    bookingId:      b.bookingRef || String(b.id),
    bookingType:    b.bookingType,
    passengerName:  b.passengerName || "Guest",
    passengerEmail: b.passengerEmail || "",
    passengerPhone: b.passengerPhone || d.phone || "",
    passengers:     b.passengers || 1,
    travelDate:     b.travelDate || b.createdAt?.slice(0, 10) || "",
    checkoutDate:   hi.checkout,
    totalAmount:    b.totalPrice ?? 0,
    paymentId:      b.paymentId || "—",
    paymentStatus:  b.paymentStatus || "pending",
    timestamp:      b.createdAt || new Date().toISOString(),
    title:          b.title || "",
    selectedSeats:  d.selectedSeats || bi.seats,
    roomType:       hi.room_type,
    flightAirline:    fi.airline,
    flightNumber:     fi.flightNum,
    flightFrom:       fi.from,
    flightTo:         fi.to,
    flightDeparture:  fi.departure,
    flightArrival:    fi.arrival,
    flightDuration:   fi.duration,
    busOperator:      bi.operator,
    busType:          bi.busType,
    busFrom:          bi.from,
    busTo:            bi.to,
    busBoardingPoint: bi.boarding_point,
    busDroppingPoint: bi.dropping_point,
    busDeparture:     bi.departure,
    busArrival:       bi.arrival,
    hotelName:        hi.hotel_name,
    hotelCity:        hi.city,
    hotelNights:      hi.nights,
    hotelRooms:       hi.rooms,
    hotelAdults:      hi.guests,
  };
}

function getInvNumber(b: ApiBooking) {
  return invoiceNumber(b.bookingRef || String(b.id));
}

function formatINR(n: number) {
  return "₹" + n.toLocaleString("en-IN");
}

function formatDate(iso?: string) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return "—"; }
}

function formatDatetime(iso?: string) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return "—"; }
}

// ── Type metadata ──────────────────────────────────────────────────────────────

const TYPE_META: Record<string, { label: string; Icon: React.ElementType; color: string; bg: string; border: string }> = {
  flight:  { label: "Flight",  Icon: Plane,    color: "text-sky-700",    bg: "bg-sky-50",    border: "border-sky-200" },
  hotel:   { label: "Hotel",   Icon: Building2, color: "text-teal-700",   bg: "bg-teal-50",   border: "border-teal-200" },
  bus:     { label: "Bus",     Icon: Bus,       color: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200" },
  package: { label: "Package", Icon: Package,   color: "text-purple-700", bg: "bg-purple-50", border: "border-purple-200" },
};

function StatusBadge({ status, payment }: { status: string; payment: string }) {
  const s = (status || "").toLowerCase();
  const p = (payment || "").toLowerCase();
  const isPaid = p === "paid" || s === "confirmed";
  const isFailed = s === "cancelled" || p === "failed";
  const isPending = !isPaid && !isFailed;
  return (
    <div className="flex flex-col gap-1">
      <Badge variant="outline" className={cn("text-xs capitalize font-semibold",
        isPaid    ? "border-green-300 bg-green-50 text-green-700" :
        isFailed  ? "border-red-300 bg-red-50 text-red-700" :
        "border-yellow-300 bg-yellow-50 text-yellow-700"
      )}>
        {isPaid ? <CheckCircle2 className="w-3 h-3 mr-1 inline" /> :
         isFailed ? <XCircle className="w-3 h-3 mr-1 inline" /> :
         <Clock className="w-3 h-3 mr-1 inline" />}
        {isPaid ? "Paid" : isFailed ? "Cancelled" : "Pending"}
      </Badge>
      {!isPaid && !isFailed && (
        <Badge variant="outline" className="text-xs capitalize border-slate-200 text-slate-500">
          {payment || status || "pending"}
        </Badge>
      )}
    </div>
  );
}

// ── Invoice Row ───────────────────────────────────────────────────────────────

function InvoiceRow({ booking, onView, onDownload, onPrint, onEmail, onWhatsApp }: {
  booking: ApiBooking;
  onView: () => void;
  onDownload: () => void;
  onPrint: () => void;
  onEmail: () => void;
  onWhatsApp: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const meta = TYPE_META[booking.bookingType] || TYPE_META.flight;
  const { Icon } = meta;
  const invNum = getInvNumber(booking);
  const d = booking.details || {};
  const fi = d.flightInfo || {};
  const bi = d.busInfo || {};
  const hi = d.hotelInfo || {};
  const convFee = d.convenienceFee ?? d.convenience_fee ?? 0;
  const baseAmt = booking.totalPrice - convFee;
  const gstAmt  = Math.round(convFee * GST_RATE);

  return (
    <Card className="border shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-0">
        {/* Main row */}
        <div className="p-4 md:p-5">
          <div className="flex flex-col md:flex-row md:items-center gap-4">

            {/* Type icon + IDs */}
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border", meta.bg, meta.border)}>
                <Icon className={cn("w-5 h-5", meta.color)} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <span className="font-bold text-sm text-slate-900 font-mono">{invNum}</span>
                  <Badge className={cn("text-xs capitalize", meta.bg, meta.color, meta.border)}>
                    {meta.label}
                  </Badge>
                </div>
                <p className="text-xs text-slate-500 truncate font-medium">{booking.title || `${meta.label} Booking`}</p>
                <p className="text-xs text-slate-400 font-mono">{booking.bookingRef}</p>
              </div>
            </div>

            {/* Customer */}
            <div className="flex flex-col gap-0.5 min-w-[170px]">
              <div className="flex items-center gap-1.5 text-sm text-slate-800 font-semibold">
                <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="truncate">{booking.passengerName}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <Mail className="w-3 h-3 shrink-0" />
                <span className="truncate">{booking.passengerEmail}</span>
              </div>
              {booking.passengerPhone && (
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Phone className="w-3 h-3 shrink-0" /> {booking.passengerPhone}
                </div>
              )}
            </div>

            {/* Dates */}
            <div className="flex flex-col gap-0.5 min-w-[130px]">
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <Calendar className="w-3 h-3 shrink-0" />
                <span>Booked: {formatDate(booking.createdAt)}</span>
              </div>
              {booking.travelDate && (
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Calendar className="w-3 h-3 shrink-0" />
                  <span>Travel: {formatDate(booking.travelDate)}</span>
                </div>
              )}
              {booking.paymentId && booking.paymentId !== "—" && (
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <CreditCard className="w-3 h-3 shrink-0" />
                  <span className="truncate max-w-[110px]">{booking.paymentId}</span>
                </div>
              )}
            </div>

            {/* Amount + Status */}
            <div className="flex items-center gap-4 md:ml-auto shrink-0">
              <div className="text-right">
                <p className="text-xs text-slate-400 mb-0.5">Amount</p>
                <p className="text-lg font-extrabold text-slate-900">{formatINR(booking.totalPrice)}</p>
                <StatusBadge status={booking.status} payment={booking.paymentStatus} />
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-1.5">
                <Button size="sm" onClick={onView} className="gap-1 h-8 text-xs px-2.5 bg-primary hover:bg-primary/90">
                  <Eye className="w-3.5 h-3.5" /> View
                </Button>
                <Button size="sm" variant="outline" onClick={onDownload} className="gap-1 h-8 text-xs px-2.5">
                  <Download className="w-3.5 h-3.5" /> PDF
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setExpanded((e) => !e)}
                  className="gap-1 h-8 text-xs px-2.5 text-slate-500"
                >
                  <Filter className="w-3.5 h-3.5" />
                  {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Expanded detail + extra actions */}
        {expanded && (
          <div className="border-t bg-slate-50 px-4 md:px-5 py-4 space-y-4">

            {/* Fare breakdown */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase mb-2">Fare Breakdown</p>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Base Fare</span>
                    <span className="font-semibold">{formatINR(baseAmt > 0 ? baseAmt : booking.totalPrice)}</span>
                  </div>
                  {convFee > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Convenience Fee</span>
                      <span className="font-semibold">{formatINR(convFee)}</span>
                    </div>
                  )}
                  {gstAmt > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">GST (5% on fee)</span>
                      <span className="font-semibold">{formatINR(gstAmt)}</span>
                    </div>
                  )}
                  {d.discountAmount > 0 && (
                    <div className="flex justify-between text-green-700">
                      <span>Coupon Discount</span>
                      <span className="font-semibold">−{formatINR(d.discountAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t pt-1.5 font-bold">
                    <span>Total Paid</span>
                    <span className="text-primary">{formatINR(booking.totalPrice)}</span>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs font-bold text-slate-500 uppercase mb-2">Invoice Details</p>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Invoice No.</span>
                    <span className="font-mono font-semibold">{invNum}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Booking Ref</span>
                    <span className="font-mono font-semibold">{booking.bookingRef}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Issue Date</span>
                    <span className="font-semibold">{formatDate(booking.createdAt)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Payment Method</span>
                    <span className="font-semibold capitalize">{booking.paymentMethod || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">GST Status</span>
                    <span className="font-semibold">Applied for</span>
                  </div>
                  {booking.agentCode && (
                    <div className="flex justify-between">
                      <span className="text-slate-500">Agent Code</span>
                      <span className="font-mono font-semibold text-blue-700">{booking.agentCode}</span>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs font-bold text-slate-500 uppercase mb-2">Service Info</p>
                <div className="space-y-1.5 text-xs">
                  {booking.bookingType === "flight" && (
                    <>
                      {fi.airline   && <div className="flex justify-between"><span className="text-slate-500">Airline</span><span className="font-semibold">{fi.airline} {fi.flightNum}</span></div>}
                      {fi.from && fi.to && <div className="flex justify-between"><span className="text-slate-500">Route</span><span className="font-semibold">{formatRoute(fi.from, fi.to)}</span></div>}
                      {fi.departure && <div className="flex justify-between"><span className="text-slate-500">Departure</span><span className="font-semibold">{fi.departure}</span></div>}
                      {fi.arrival   && <div className="flex justify-between"><span className="text-slate-500">Arrival</span><span className="font-semibold">{fi.arrival}</span></div>}
                      <div className="flex justify-between"><span className="text-slate-500">Passengers</span><span className="font-semibold">{booking.passengers}</span></div>
                    </>
                  )}
                  {booking.bookingType === "hotel" && (
                    <>
                      {hi.hotel_name && <div className="flex justify-between"><span className="text-slate-500">Hotel</span><span className="font-semibold truncate max-w-[130px]">{hi.hotel_name}</span></div>}
                      {hi.city       && <div className="flex justify-between"><span className="text-slate-500">City</span><span className="font-semibold">{hi.city}</span></div>}
                      {hi.nights     && <div className="flex justify-between"><span className="text-slate-500">Nights</span><span className="font-semibold">{hi.nights}</span></div>}
                      {hi.room_type  && <div className="flex justify-between"><span className="text-slate-500">Room</span><span className="font-semibold capitalize">{hi.room_type}</span></div>}
                      {hi.guests     && <div className="flex justify-between"><span className="text-slate-500">Guests</span><span className="font-semibold">{hi.guests} adult{hi.guests > 1 ? "s" : ""}</span></div>}
                    </>
                  )}
                  {booking.bookingType === "bus" && (
                    <>
                      {bi.operator   && <div className="flex justify-between"><span className="text-slate-500">Operator</span><span className="font-semibold">{bi.operator}</span></div>}
                      {bi.busType    && <div className="flex justify-between"><span className="text-slate-500">Bus Type</span><span className="font-semibold">{bi.busType}</span></div>}
                      {bi.from && bi.to && <div className="flex justify-between"><span className="text-slate-500">Route</span><span className="font-semibold">{formatRoute(bi.from, bi.to)}</span></div>}
                      <div className="flex justify-between"><span className="text-slate-500">Passengers</span><span className="font-semibold">{booking.passengers}</span></div>
                    </>
                  )}
                  {booking.bookingType === "package" && (
                    <div className="flex justify-between"><span className="text-slate-500">Package</span><span className="font-semibold truncate max-w-[130px]">{booking.title}</span></div>
                  )}
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2 pt-2 border-t">
              <Button size="sm" onClick={onView} className="gap-1.5 text-xs h-8">
                <Eye className="w-3.5 h-3.5" /> View Invoice
              </Button>
              <Button size="sm" variant="outline" onClick={onDownload} className="gap-1.5 text-xs h-8">
                <Download className="w-3.5 h-3.5" /> Download PDF
              </Button>
              <Button size="sm" variant="outline" onClick={onPrint} className="gap-1.5 text-xs h-8">
                <Printer className="w-3.5 h-3.5" /> Print
              </Button>
              <Button size="sm" variant="outline" onClick={onEmail} className="gap-1.5 text-xs h-8 text-blue-700 border-blue-200 hover:bg-blue-50">
                <Mail className="w-3.5 h-3.5" /> Resend Email
              </Button>
              <Button size="sm" variant="outline" onClick={onWhatsApp} className="gap-1.5 text-xs h-8 text-green-700 border-green-200 hover:bg-green-50">
                <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminInvoices() {
  const [, setLocation] = useLocation();
  const [bookings, setBookings] = useState<ApiBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const { toast } = useToast();

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/bookings");
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      setBookings(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e.message ?? "Failed to load invoices.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBookings(); }, [fetchBookings]);

  // ── Filter ────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return bookings.filter((b) => {
      const invNum = getInvNumber(b).toLowerCase();
      const matchSearch =
        !q ||
        invNum.includes(q) ||
        b.bookingRef?.toLowerCase().includes(q) ||
        b.passengerName?.toLowerCase().includes(q) ||
        b.passengerEmail?.toLowerCase().includes(q) ||
        b.passengerPhone?.toLowerCase().includes(q) ||
        b.title?.toLowerCase().includes(q);
      const matchType   = filterType === "all"   || b.bookingType === filterType;
      const st = (b.status || b.paymentStatus || "").toLowerCase();
      const matchStatus =
        filterStatus === "all" ||
        (filterStatus === "paid"    && (st === "paid" || st === "confirmed")) ||
        (filterStatus === "pending" && st !== "paid" && st !== "confirmed" && st !== "cancelled") ||
        (filterStatus === "cancelled" && st === "cancelled");
      return matchSearch && matchType && matchStatus;
    });
  }, [bookings, search, filterType, filterStatus]);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const totalRevenue     = filtered.reduce((s, b) => s + (b.totalPrice ?? 0), 0);
  const thisMonthCount   = bookings.filter((b) => b.createdAt >= thisMonthStart).length;
  const paidCount        = bookings.filter((b) => {
    const s = (b.status || b.paymentStatus || "").toLowerCase();
    return s === "paid" || s === "confirmed";
  }).length;

  // ── Actions ───────────────────────────────────────────────────────────────
  function handleView(b: ApiBooking) {
    setLocation(`/invoice/${b.bookingRef || b.id}`);
  }

  function handleDownload(b: ApiBooking) {
    try {
      generateInvoicePDF(bookingToInvoiceData(b));
      toast({ title: "Invoice Downloaded", description: `${getInvNumber(b)} — ${b.passengerName}` });
    } catch {
      toast({ title: "Download Failed", variant: "destructive" });
    }
  }

  function handlePrint(b: ApiBooking) {
    const url = `/invoice/${b.bookingRef || b.id}`;
    const w = window.open(url, "_blank");
    if (w) {
      w.addEventListener("load", () => {
        setTimeout(() => { try { w.print(); } catch { /* noop */ } }, 800);
      });
    }
  }

  function handleEmail(b: ApiBooking) {
    try {
      openEmailConfirmation(bookingToInvoiceData(b));
      toast({ title: "Email Client Opened", description: `Draft ready for ${b.passengerEmail}` });
    } catch {
      toast({ title: "Email Failed", variant: "destructive" });
    }
  }

  function handleWhatsApp(b: ApiBooking) {
    if (!b.passengerPhone) {
      toast({ title: "No phone number on record", variant: "destructive" });
      return;
    }
    try {
      openWhatsAppConfirmation(bookingToInvoiceData(b));
    } catch {
      toast({ title: "WhatsApp Failed", variant: "destructive" });
    }
  }

  return (
    <AdminLayout>
      <div className="p-4 md:p-6 space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2">
              <FileText className="w-6 h-6 text-primary" /> Invoices
            </h1>
            <p className="text-slate-500 text-sm mt-0.5">
              All booking invoices from {APP_NAME} — live database · auto-generated per booking
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchBookings}
            disabled={loading}
            className="gap-2 self-start sm:self-auto"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
            {loading ? "Loading…" : "Refresh"}
          </Button>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
            <Button size="sm" variant="ghost" className="ml-auto h-7 text-red-700" onClick={fetchBookings}>
              Retry
            </Button>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total Invoices",  value: bookings.length,        Icon: FileText,     color: "text-blue-600",   bg: "bg-blue-50" },
            { label: "Paid / Confirmed",value: paidCount,              Icon: CheckCircle2, color: "text-green-600",  bg: "bg-green-50" },
            { label: "Total Revenue",   value: formatINR(bookings.reduce((s, b) => s + (b.totalPrice ?? 0), 0)), Icon: IndianRupee, color: "text-orange-600", bg: "bg-orange-50" },
            { label: "This Month",      value: thisMonthCount,         Icon: Calendar,     color: "text-purple-600", bg: "bg-purple-50" },
          ].map(({ label, value, Icon, color, bg }) => (
            <Card key={label} className="border shadow-sm">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", bg)}>
                  <Icon className={cn("w-4 h-4", color)} />
                </div>
                <div>
                  <p className="text-xs text-slate-400">{label}</p>
                  <p className="text-base font-extrabold text-slate-900">{value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Search + filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search name, booking ref, invoice no…"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {(["all", "flight", "hotel", "bus", "package"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all",
                  filterType === t
                    ? "bg-slate-900 text-white"
                    : "bg-white border border-slate-200 text-slate-600 hover:border-slate-400"
                )}
              >
                {t === "all" ? "All Types" : t}
              </button>
            ))}
          </div>
          <div className="flex gap-2 flex-wrap">
            {(["all", "paid", "pending", "cancelled"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all",
                  filterStatus === s
                    ? "bg-primary text-white"
                    : "bg-white border border-slate-200 text-slate-600 hover:border-slate-400"
                )}
              >
                {s === "all" ? "All Status" : s}
              </button>
            ))}
          </div>
        </div>

        {/* Results count */}
        {!loading && (
          <div className="flex items-center justify-between text-xs text-slate-400 px-1">
            <span>
              Showing <span className="font-semibold text-slate-700">{filtered.length}</span> of {bookings.length} invoices
              {filtered.length > 0 && (
                <span> · Total: <span className="font-semibold text-green-700">{formatINR(totalRevenue)}</span></span>
              )}
            </span>
            <span className="text-slate-300">Click any row to expand details & actions</span>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && bookings.length === 0 && (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <Card key={i} className="border">
                <CardContent className="p-5">
                  <div className="flex gap-4 items-center">
                    <div className="w-11 h-11 rounded-xl bg-slate-100 animate-pulse shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-slate-100 animate-pulse rounded w-1/3" />
                      <div className="h-3 bg-slate-100 animate-pulse rounded w-1/2" />
                    </div>
                    <div className="h-8 w-20 bg-slate-100 animate-pulse rounded" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Invoice list */}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-20">
            <FileText className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="font-semibold text-slate-500 text-base">
              {bookings.length === 0 ? "No invoices yet" : "No invoices match your filters"}
            </p>
            <p className="text-sm text-slate-400 mt-1">
              {bookings.length === 0
                ? "Invoices are generated automatically after every confirmed booking."
                : "Try adjusting your search or filter criteria."}
            </p>
            {(search || filterType !== "all" || filterStatus !== "all") && (
              <Button
                size="sm"
                variant="outline"
                className="mt-4"
                onClick={() => { setSearch(""); setFilterType("all"); setFilterStatus("all"); }}
              >
                Clear Filters
              </Button>
            )}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="space-y-3">
            {filtered.map((b) => (
              <InvoiceRow
                key={b.id}
                booking={b}
                onView={() => handleView(b)}
                onDownload={() => handleDownload(b)}
                onPrint={() => handlePrint(b)}
                onEmail={() => handleEmail(b)}
                onWhatsApp={() => handleWhatsApp(b)}
              />
            ))}
          </div>
        )}

        {/* Footer info */}
        {!loading && bookings.length > 0 && (
          <Card className="bg-slate-50 border-0">
            <CardContent className="p-4 text-xs text-slate-400 space-y-1">
              <p className="font-semibold text-slate-500">About Invoices</p>
              <p>• Invoices are auto-generated from every confirmed booking stored in the database.</p>
              <p>• Invoice numbers follow the format <code className="bg-slate-100 px-1 rounded">FLT-INV-000001</code> (flights), <code className="bg-slate-100 px-1 rounded">BUS-INV-000001</code> (buses), <code className="bg-slate-100 px-1 rounded">HTL-INV-000001</code> (hotels), derived from the booking reference.</p>
              <p>• GST (5%) is applicable on the convenience fee component. Full GSTIN details will be updated once registration is complete.</p>
              <p>• For support: {APP_SUPPORT_PHONE} · {APP_SUPPORT_EMAIL}</p>
            </CardContent>
          </Card>
        )}

      </div>
    </AdminLayout>
  );
}
