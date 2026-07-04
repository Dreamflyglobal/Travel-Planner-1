import { useState, useEffect, useCallback, useMemo } from "react";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  BarChart2, TrendingUp, Users, Plane, Building2, Bus, Map,
  RefreshCw, IndianRupee, BookOpen, CalendarDays, AlertCircle,
  CheckCircle2, XCircle, Package,
} from "lucide-react";
import { cn } from "@/lib/utils";

function formatINR(n: number) {
  return "₹" + n.toLocaleString("en-IN");
}

function formatDate(iso?: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return "—"; }
}

const getAmount = (b: any): number =>
  Number(b.totalPrice ?? b.amount ?? b.details?.amount ?? 0);

const getMarkup = (b: any): number =>
  Number(b.markupAmount ?? b.details?.markupAmount ?? b.details?.markup ?? 0);

const getConvFee = (b: any): number =>
  Number(b.convenienceFee ?? b.details?.convenienceFee ?? b.details?.convenience_fee ?? 0);

const getNetProfit = (b: any): number =>
  getMarkup(b) + getConvFee(b) - (Number(b.commissionEarned) || Number(b.details?.commissionEarned) || 0);

// Financial metrics are ONLY computed over bookings with status = confirmed or completed.
// Pending, Failed, Cancelled, and Abandoned bookings contribute ₹0 to revenue.
const isActive = (b: any): boolean => {
  const s = (b.status || "").toLowerCase();
  return s === "confirmed" || s === "completed";
};

const getBookingDate = (b: any): string =>
  b.createdAt?.slice(0, 10) ?? b.details?.createdAt?.slice(0, 10) ?? b.travelDate ?? "";

const TYPE_META: Record<string, { label: string; icon: React.ElementType; color: string; bg: string; bar: string }> = {
  flight:  { label: "Flights",  icon: Plane,    color: "text-sky-700",    bg: "bg-sky-100",    bar: "bg-sky-400" },
  hotel:   { label: "Hotels",   icon: Building2, color: "text-teal-700",   bg: "bg-teal-100",   bar: "bg-teal-400" },
  bus:     { label: "Buses",    icon: Bus,       color: "text-orange-700", bg: "bg-orange-100", bar: "bg-orange-400" },
  package: { label: "Packages", icon: Package,   color: "text-purple-700", bg: "bg-purple-100", bar: "bg-purple-400" },
};

function StatCard({
  icon: Icon, label, value, sub, color, bg,
}: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; color: string; bg: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center shrink-0", bg, color)}>
          <Icon className="w-6 h-6" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground truncate">{label}</p>
          <p className="text-2xl font-extrabold leading-tight">{value}</p>
          {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function TypeBar({ label, count, revenue, total, icon: Icon, color, bg, bar }: {
  label: string; count: number; revenue: number; total: number;
  icon: React.ElementType; color: string; bg: string; bar: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", bg, color)}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between text-xs mb-1">
          <span className="font-medium">{label}</span>
          <span className="text-muted-foreground">
            {count} booking{count !== 1 ? "s" : ""} ({pct}%) · {formatINR(revenue)}
          </span>
        </div>
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
          <div className={cn("h-full rounded-full transition-all", bar)} style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}

export default function AdminAnalytics() {
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userCount, setUserCount] = useState(0);

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/bookings");
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      setBookings(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e.message ?? "Failed to load bookings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBookings();
    const loadUsers = () => {
      try {
        const raw = localStorage.getItem("users");
        if (raw) setUserCount((JSON.parse(raw) as unknown[]).length);
      } catch { /* noop */ }
    };
    loadUsers();
  }, [fetchBookings]);

  // ── Derived metrics ────────────────────────────────────────────────────────
  const total = bookings.length;

  const confirmed = useMemo(
    () => bookings.filter((b) => {
      const s = (b.status || b.paymentStatus || "").toLowerCase();
      return s === "confirmed" || s === "paid";
    }),
    [bookings]
  );

  const cancelled = useMemo(
    () => bookings.filter((b) => {
      const s = (b.status || b.paymentStatus || "").toLowerCase();
      return s === "cancelled";
    }),
    [bookings]
  );

  // Financial metrics are only computed over active (non-failed/refunded/cancelled) bookings
  const activeBookings = useMemo(() => bookings.filter(isActive), [bookings]);

  const totalRevenue = useMemo(
    () => activeBookings.reduce((sum, b) => sum + getAmount(b), 0),
    [activeBookings]
  );

  const confirmedRevenue = useMemo(
    () => confirmed.filter(isActive).reduce((sum, b) => sum + getAmount(b), 0),
    [confirmed]
  );

  const totalNetProfit = useMemo(
    () => activeBookings.reduce((sum, b) => sum + getNetProfit(b), 0),
    [activeBookings]
  );

  const byType = useMemo(() => {
    const map: Record<string, { count: number; revenue: number; profit: number }> = {};
    for (const b of activeBookings) {
      const t = (b.bookingType || b.type || "flight").toLowerCase();
      if (!map[t]) map[t] = { count: 0, revenue: 0, profit: 0 };
      map[t].count++;
      map[t].revenue += getAmount(b);
      map[t].profit  += getNetProfit(b);
    }
    return map;
  }, [activeBookings]);

  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
  const todayStr = now.toISOString().slice(0, 10);

  const bookingsThisMonth = useMemo(
    () => activeBookings.filter((b) => getBookingDate(b) >= thisMonthStart),
    [activeBookings, thisMonthStart]
  );

  const bookingsLastMonth = useMemo(
    () => activeBookings.filter((b) => {
      const d = getBookingDate(b);
      return d >= lastMonthStart && d < thisMonthStart;
    }),
    [activeBookings, lastMonthStart, thisMonthStart]
  );

  const bookingsToday = useMemo(
    () => activeBookings.filter((b) => getBookingDate(b) === todayStr),
    [activeBookings, todayStr]
  );

  const revenueThisMonth = useMemo(
    () => bookingsThisMonth.reduce((s, b) => s + getAmount(b), 0),
    [bookingsThisMonth]
  );

  // ── Status breakdown counters ─────────────────────────────────────────────
  const successfulBookings = useMemo(
    () => bookings.filter((b) => {
      const ps = (b.paymentStatus || "").toLowerCase();
      const s  = (b.status        || "").toLowerCase();
      const bs = (b.bookingStatus || "").toLowerCase();
      return ps === "paid" && (s === "confirmed" || bs === "confirmed") && s !== "cancelled" && s !== "refunded";
    }),
    [bookings]
  );

  const pendingLeads = useMemo(
    () => bookings.filter((b) => {
      const ps = (b.paymentStatus || "").toLowerCase();
      const bs = (b.bookingStatus || "").toLowerCase();
      return ps === "pending" || bs === "pending";
    }),
    [bookings]
  );

  const failedPayments = useMemo(
    () => bookings.filter((b) => {
      const ps = (b.paymentStatus || "").toLowerCase();
      const s  = (b.status        || "").toLowerCase();
      return ps === "failed" || s === "booking_failed";
    }),
    [bookings]
  );

  const cancelledBookings = useMemo(
    () => bookings.filter((b) => {
      const s = (b.status || "").toLowerCase();
      return s === "cancelled" || s === "refunded";
    }),
    [bookings]
  );

  const recent = useMemo(
    () =>
      [...bookings]
        .sort((a, b) =>
          new Date(b.createdAt || 0).getTime() -
          new Date(a.createdAt || 0).getTime()
        )
        .slice(0, 10),
    [bookings]
  );

  return (
    <AdminLayout>
      <div className="p-4 sm:p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold flex items-center gap-2">
              <BarChart2 className="w-6 h-6 text-primary" /> Analytics
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Live booking and revenue data from all channels
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchBookings}
            disabled={loading}
            className="gap-2"
          >
            <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            {loading ? "Loading…" : "Refresh"}
          </Button>
        </div>

        {/* Error state */}
        {error && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
            <Button size="sm" variant="ghost" className="ml-auto h-7 text-red-700" onClick={fetchBookings}>
              Retry
            </Button>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && bookings.length === 0 ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Card key={i}>
                <CardContent className="p-5">
                  <div className="h-10 bg-muted animate-pulse rounded-lg mb-3" />
                  <div className="h-7 bg-muted animate-pulse rounded-lg w-3/4" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <>
            {/* Top KPI cards — financial (paid bookings only) */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <StatCard
                icon={BookOpen}
                label="Total Bookings"
                value={total}
                sub={`${bookingsThisMonth.length} this month · ${bookingsToday.length} today`}
                color="text-blue-700"
                bg="bg-blue-100"
              />
              <StatCard
                icon={IndianRupee}
                label="Total Revenue (Paid)"
                value={formatINR(totalRevenue)}
                sub={`${formatINR(revenueThisMonth)} this month · paid only`}
                color="text-green-700"
                bg="bg-green-100"
              />
              <StatCard
                icon={TrendingUp}
                label="Net Profit"
                value={formatINR(totalNetProfit)}
                sub={`${totalRevenue > 0 ? ((totalNetProfit / totalRevenue) * 100).toFixed(1) : "0.0"}% margin · paid only`}
                color="text-emerald-700"
                bg="bg-emerald-100"
              />
            </div>

            {/* Status breakdown cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                icon={CheckCircle2}
                label="Successful Bookings"
                value={successfulBookings.length}
                sub={`${formatINR(successfulBookings.reduce((s, b) => s + getAmount(b), 0))} revenue`}
                color="text-teal-700"
                bg="bg-teal-100"
              />
              <StatCard
                icon={Users}
                label="Pending Leads"
                value={pendingLeads.length}
                sub="Payment not yet completed"
                color="text-yellow-700"
                bg="bg-yellow-100"
              />
              <StatCard
                icon={AlertCircle}
                label="Failed Payments"
                value={failedPayments.length}
                sub="Payment failed or rejected"
                color="text-red-700"
                bg="bg-red-100"
              />
              <StatCard
                icon={XCircle}
                label="Cancelled / Refunded"
                value={cancelledBookings.length}
                sub={`${userCount} registered users`}
                color="text-slate-600"
                bg="bg-slate-100"
              />
            </div>

            {/* Today summary strip */}
            {bookingsToday.length > 0 && (
              <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 flex flex-wrap gap-6 items-center">
                <div className="flex items-center gap-2 text-sm">
                  <CalendarDays className="w-4 h-4 text-primary" />
                  <span className="font-semibold text-primary">Today</span>
                </div>
                <span className="text-sm"><span className="font-bold">{bookingsToday.length}</span> bookings</span>
                <span className="text-sm"><span className="font-bold text-green-700">{formatINR(bookingsToday.reduce((s, b) => s + getAmount(b), 0))}</span> revenue</span>
                <span className="text-sm"><span className="font-bold text-emerald-700">{bookingsToday.filter((b) => ["confirmed","paid"].includes((b.status||b.paymentStatus||"").toLowerCase())).length}</span> confirmed</span>
              </div>
            )}

            <div className="grid lg:grid-cols-2 gap-6">
              {/* Bookings by type */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <BarChart2 className="w-4 h-4 text-primary" />
                    Bookings by Service Type
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {total === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">No bookings found.</p>
                  ) : (
                    Object.entries(TYPE_META).map(([key, meta]) => (
                      <TypeBar
                        key={key}
                        label={meta.label}
                        count={byType[key]?.count || 0}
                        revenue={byType[key]?.revenue || 0}
                        total={activeBookings.length}
                        icon={meta.icon}
                        color={meta.color}
                        bg={meta.bg}
                        bar={meta.bar}
                      />
                    ))
                  )}
                </CardContent>
              </Card>

              {/* Monthly summary */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-primary" />
                    Period Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {[
                      {
                        label: "Today",
                        bookings: bookingsToday.length,
                        revenue: bookingsToday.reduce((s, b) => s + getAmount(b), 0),
                        color: "text-sky-700",
                        bg: "bg-sky-50",
                        border: "border-sky-200",
                      },
                      {
                        label: "This Month",
                        bookings: bookingsThisMonth.length,
                        revenue: revenueThisMonth,
                        color: "text-blue-700",
                        bg: "bg-blue-50",
                        border: "border-blue-200",
                      },
                      {
                        label: "Last Month",
                        bookings: bookingsLastMonth.length,
                        revenue: bookingsLastMonth.reduce((s, b) => s + getAmount(b), 0),
                        color: "text-slate-600",
                        bg: "bg-slate-50",
                        border: "border-slate-200",
                      },
                      {
                        label: "All Time",
                        bookings: total,
                        revenue: totalRevenue,
                        color: "text-green-700",
                        bg: "bg-green-50",
                        border: "border-green-200",
                      },
                    ].map((row) => (
                      <div key={row.label} className={cn("rounded-xl border p-3.5 flex justify-between items-center", row.bg, row.border)}>
                        <div>
                          <p className={cn("font-semibold text-sm", row.color)}>{row.label}</p>
                          <p className="text-xs text-muted-foreground">{row.bookings} booking{row.bookings !== 1 ? "s" : ""}</p>
                        </div>
                        <p className={cn("font-extrabold text-lg", row.color)}>{formatINR(row.revenue)}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Service revenue breakdown */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  Service-wise Revenue & Profit Breakdown
                  <span className="ml-1 text-xs font-normal text-muted-foreground">(failed/cancelled excluded)</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 border-b">
                      <tr>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Service</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Bookings</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Confirmed</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Cancelled</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-green-700">Revenue</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-amber-600">Markup</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-emerald-700">Net Profit</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground">Avg. Booking</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {Object.entries(TYPE_META).map(([key, meta]) => {
                        const Icon = meta.icon;
                        const allSvc = bookings.filter((b) => (b.bookingType || b.type || "").toLowerCase() === key);
                        const svcBs  = allSvc.filter(isActive);
                        const svcRev = svcBs.reduce((s, b) => s + getAmount(b), 0);
                        const svcMkp = svcBs.reduce((s, b) => s + getMarkup(b), 0);
                        const svcPft = svcBs.reduce((s, b) => s + getNetProfit(b), 0);
                        const svcConfirmed = allSvc.filter((b) => {
                          const s = (b.status || b.paymentStatus || "").toLowerCase();
                          return s === "confirmed" || s === "paid";
                        }).length;
                        const svcCancelled = allSvc.filter((b) =>
                          (b.status || b.paymentStatus || "").toLowerCase() === "cancelled"
                        ).length;
                        const avg = svcBs.length > 0 ? Math.round(svcRev / svcBs.length) : 0;
                        return (
                          <tr key={key} className="hover:bg-muted/20 transition-colors">
                            <td className="px-4 py-3">
                              <div className={cn("inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold", meta.bg, meta.color)}>
                                <Icon className="w-3.5 h-3.5" />
                                {meta.label}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right font-bold">{svcBs.length}</td>
                            <td className="px-4 py-3 text-right text-emerald-700 font-medium">{svcConfirmed}</td>
                            <td className="px-4 py-3 text-right text-red-600 font-medium">{svcCancelled}</td>
                            <td className="px-4 py-3 text-right font-bold text-green-700">
                              {svcRev > 0 ? formatINR(svcRev) : "—"}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-amber-600">
                              {svcMkp > 0 ? formatINR(svcMkp) : "—"}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-emerald-700">
                              {svcPft > 0 ? formatINR(svcPft) : "—"}
                            </td>
                            <td className="px-4 py-3 text-right text-muted-foreground">
                              {avg > 0 ? formatINR(avg) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-muted/30 border-t-2">
                      <tr>
                        <td className="px-4 py-3 font-bold">Total</td>
                        <td className="px-4 py-3 text-right font-bold">{activeBookings.length}</td>
                        <td className="px-4 py-3 text-right font-bold text-emerald-700">{confirmed.length}</td>
                        <td className="px-4 py-3 text-right font-bold text-red-600">{cancelled.length}</td>
                        <td className="px-4 py-3 text-right font-extrabold text-green-700">{formatINR(totalRevenue)}</td>
                        <td className="px-4 py-3 text-right font-bold text-amber-600">
                          {formatINR(activeBookings.reduce((s, b) => s + getMarkup(b), 0))}
                        </td>
                        <td className="px-4 py-3 text-right font-extrabold text-emerald-700">
                          {formatINR(totalNetProfit)}
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">
                          {activeBookings.length > 0 ? formatINR(Math.round(totalRevenue / activeBookings.length)) : "—"}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Recent bookings */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-primary" />
                  Recent Bookings (last 10)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {recent.length === 0 ? (
                  <div className="text-center py-12">
                    <BarChart2 className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-30" />
                    <p className="text-sm text-muted-foreground font-medium">No bookings yet</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Bookings will appear here once customers complete transactions.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-muted-foreground border-b">
                          <th className="text-left py-2.5 pr-4 font-medium">Booking Ref</th>
                          <th className="text-left py-2.5 pr-4 font-medium">Customer</th>
                          <th className="text-left py-2.5 pr-4 font-medium">Type</th>
                          <th className="text-left py-2.5 pr-4 font-medium">Date</th>
                          <th className="text-left py-2.5 pr-4 font-medium">Status</th>
                          <th className="text-right py-2.5 font-medium">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {recent.map((b, i) => {
                          const bRef = b.bookingRef || b.id || `#${i + 1}`;
                          const bType = (b.bookingType || b.type || "flight").toLowerCase();
                          const meta = TYPE_META[bType] || TYPE_META.flight;
                          const Icon = meta.icon;
                          const bStatus = (b.status || b.paymentStatus || "confirmed").toLowerCase();
                          const bAmount = getAmount(b);
                          const bName = b.passengerName || b.customerName || b.title || "—";
                          return (
                            <tr key={b.id ?? i} className="hover:bg-muted/20 transition-colors">
                              <td className="py-2.5 pr-4 font-mono text-xs text-primary font-semibold">{bRef}</td>
                              <td className="py-2.5 pr-4 font-medium truncate max-w-[140px]">{bName}</td>
                              <td className="py-2.5 pr-4">
                                <div className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", meta.bg, meta.color)}>
                                  <Icon className="w-3 h-3" />
                                  {meta.label}
                                </div>
                              </td>
                              <td className="py-2.5 pr-4 text-xs text-muted-foreground">{formatDate(b.createdAt)}</td>
                              <td className="py-2.5 pr-4">
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    "text-xs capitalize",
                                    bStatus === "confirmed" || bStatus === "paid"
                                      ? "border-green-300 text-green-700 bg-green-50"
                                      : bStatus === "cancelled"
                                      ? "border-red-300 text-red-700 bg-red-50"
                                      : "border-yellow-300 text-yellow-700 bg-yellow-50"
                                  )}
                                >
                                  {bStatus}
                                </Badge>
                              </td>
                              <td className="py-2.5 text-right font-semibold">{formatINR(bAmount)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
