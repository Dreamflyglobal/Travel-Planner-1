import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  BarChart2, TrendingUp, Users, Plane, Building2, Bus, Map,
  RefreshCw, IndianRupee, BookOpen, CalendarDays,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Booking {
  id?: string;
  bookingId?: string;
  type?: string;
  bookingType?: string;
  status?: string;
  paymentStatus?: string;
  amount?: number;
  totalAmount?: number;
  createdAt?: string;
  bookingDate?: string;
  customerName?: string;
  passengerName?: string;
  title?: string;
}

function loadBookings(): Booking[] {
  const seen = new Set<string>();
  const all: Booking[] = [];

  const keys = ["travel_bookings", "msw_mock_bookings", "staff_bookings"];
  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const arr = JSON.parse(raw) as Booking[];
      for (const b of arr) {
        const uid = b.id || b.bookingId || "";
        if (uid && seen.has(uid)) continue;
        if (uid) seen.add(uid);
        all.push(b);
      }
    } catch { /* noop */ }
  }
  try {
    const raw = sessionStorage.getItem("msw_mock_bookings");
    if (raw) {
      const arr = JSON.parse(raw) as Booking[];
      for (const b of arr) {
        const uid = b.id || b.bookingId || "";
        if (uid && seen.has(uid)) continue;
        if (uid) seen.add(uid);
        all.push(b);
      }
    }
  } catch { /* noop */ }
  return all;
}

function loadUsers(): number {
  try {
    const raw = localStorage.getItem("users");
    if (!raw) return 0;
    return (JSON.parse(raw) as unknown[]).length;
  } catch { return 0; }
}

function formatINR(n: number) {
  return "₹" + n.toLocaleString("en-IN");
}

function formatDate(iso?: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return "—"; }
}

const TYPE_META: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  flight:  { label: "Flights",  icon: Plane,     color: "text-sky-700",    bg: "bg-sky-100" },
  hotel:   { label: "Hotels",   icon: Building2,  color: "text-teal-700",   bg: "bg-teal-100" },
  bus:     { label: "Buses",    icon: Bus,        color: "text-orange-700", bg: "bg-orange-100" },
  package: { label: "Packages", icon: Map,        color: "text-purple-700", bg: "bg-purple-100" },
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

function TypeBar({ label, count, total, icon: Icon, color, bg }: {
  label: string; count: number; total: number; icon: React.ElementType; color: string; bg: string;
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
          <span className="text-muted-foreground">{count} ({pct}%)</span>
        </div>
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", bg.replace("bg-", "bg-").replace("-100", "-400"))}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export default function AdminAnalytics() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [userCount, setUserCount] = useState(0);

  function refresh() {
    setBookings(loadBookings());
    setUserCount(loadUsers());
  }

  useEffect(() => { refresh(); }, []);

  const total = bookings.length;
  const confirmed = bookings.filter((b) => {
    const s = (b.status || b.paymentStatus || "").toLowerCase();
    return s === "confirmed" || s === "paid";
  });
  const cancelled = bookings.filter((b) => {
    const s = (b.status || b.paymentStatus || "").toLowerCase();
    return s === "cancelled";
  });

  const totalRevenue = bookings.reduce((sum, b) => sum + (b.amount || b.totalAmount || 0), 0);
  const confirmedRevenue = confirmed.reduce((sum, b) => sum + (b.amount || b.totalAmount || 0), 0);

  const byType: Record<string, number> = {};
  for (const b of bookings) {
    const t = (b.type || b.bookingType || "flight").toLowerCase();
    byType[t] = (byType[t] || 0) + 1;
  }

  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const bookingsThisMonth = bookings.filter(
    (b) => (b.createdAt || b.bookingDate || "") >= thisMonthStart
  );
  const bookingsLastMonth = bookings.filter((b) => {
    const d = b.createdAt || b.bookingDate || "";
    return d >= lastMonthStart && d < thisMonthStart;
  });

  const revenueThisMonth = bookingsThisMonth.reduce((s, b) => s + (b.amount || b.totalAmount || 0), 0);

  const recent = [...bookings]
    .sort((a, b) =>
      new Date(b.createdAt || b.bookingDate || 0).getTime() -
      new Date(a.createdAt || a.bookingDate || 0).getTime()
    )
    .slice(0, 10);

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold flex items-center gap-2">
              <BarChart2 className="w-6 h-6 text-primary" /> Analytics
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Overview of bookings and revenue across all channels
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={refresh} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Refresh
          </Button>
        </div>

        {/* Top KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={BookOpen}
            label="Total Bookings"
            value={total}
            sub={`${bookingsThisMonth.length} this month`}
            color="text-blue-700"
            bg="bg-blue-100"
          />
          <StatCard
            icon={IndianRupee}
            label="Total Revenue"
            value={formatINR(totalRevenue)}
            sub={`${formatINR(revenueThisMonth)} this month`}
            color="text-green-700"
            bg="bg-green-100"
          />
          <StatCard
            icon={TrendingUp}
            label="Confirmed"
            value={confirmed.length}
            sub={`${formatINR(confirmedRevenue)} confirmed`}
            color="text-emerald-700"
            bg="bg-emerald-100"
          />
          <StatCard
            icon={Users}
            label="Registered Users"
            value={userCount}
            sub={`${cancelled.length} cancelled bookings`}
            color="text-purple-700"
            bg="bg-purple-100"
          />
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Bookings by type */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-primary" />
                Bookings by Type
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
                    count={byType[key] || 0}
                    total={total}
                    icon={meta.icon}
                    color={meta.color}
                    bg={meta.bg}
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
                Monthly Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
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
                    revenue: bookingsLastMonth.reduce((s, b) => s + (b.amount || b.totalAmount || 0), 0),
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
                  <div key={row.label} className={cn("rounded-xl border p-4 flex justify-between items-center", row.bg, row.border)}>
                    <div>
                      <p className={cn("font-semibold text-sm", row.color)}>{row.label}</p>
                      <p className="text-xs text-muted-foreground">{row.bookings} bookings</p>
                    </div>
                    <p className={cn("font-extrabold text-lg", row.color)}>{formatINR(row.revenue)}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

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
                <p className="text-sm text-muted-foreground font-medium">No bookings found</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Bookings will appear here once customers complete transactions.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground border-b">
                      <th className="text-left py-2 pr-4 font-medium">Booking ID</th>
                      <th className="text-left py-2 pr-4 font-medium">Customer</th>
                      <th className="text-left py-2 pr-4 font-medium">Type</th>
                      <th className="text-left py-2 pr-4 font-medium">Date</th>
                      <th className="text-left py-2 pr-4 font-medium">Status</th>
                      <th className="text-right py-2 font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {recent.map((b, i) => {
                      const bId = b.id || b.bookingId || `#${i + 1}`;
                      const bType = (b.type || b.bookingType || "flight").toLowerCase();
                      const meta = TYPE_META[bType] || TYPE_META.flight;
                      const Icon = meta.icon;
                      const bStatus = (b.status || b.paymentStatus || "confirmed").toLowerCase();
                      const bAmount = b.amount || b.totalAmount || 0;
                      const bName = b.customerName || b.passengerName || b.title || "—";
                      const bDate = b.createdAt || b.bookingDate;
                      return (
                        <tr key={bId} className="hover:bg-muted/20 transition-colors">
                          <td className="py-2.5 pr-4 font-mono text-xs text-muted-foreground">{bId}</td>
                          <td className="py-2.5 pr-4 font-medium truncate max-w-[140px]">{bName}</td>
                          <td className="py-2.5 pr-4">
                            <div className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", meta.bg, meta.color)}>
                              <Icon className="w-3 h-3" />
                              {meta.label}
                            </div>
                          </td>
                          <td className="py-2.5 pr-4 text-xs text-muted-foreground">{formatDate(bDate)}</td>
                          <td className="py-2.5 pr-4">
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-xs",
                                bStatus === "confirmed" || bStatus === "paid"
                                  ? "border-green-300 text-green-700"
                                  : bStatus === "cancelled"
                                  ? "border-red-300 text-red-700"
                                  : "border-yellow-300 text-yellow-700"
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
      </div>
    </AdminLayout>
  );
}
