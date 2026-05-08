import { useState, useEffect, useCallback, useMemo } from "react";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Plane, Bus, Building2, Map, IndianRupee, Users,
  TrendingUp, BarChart2, RefreshCw, AlertCircle, Package,
} from "lucide-react";
import { cn } from "@/lib/utils";

function loadAgents(): any[] {
  try {
    const raw = localStorage.getItem("users");
    const users: any[] = raw ? JSON.parse(raw) : [];
    return users.filter((u) => u.role === "agent");
  } catch { return []; }
}

const getAmount       = (b: any): number => b.totalPrice ?? b.amount ?? b.details?.amount ?? 0;
const getMarkupProfit = (b: any): number => b.details?.markupAmount ?? b.markupAmount ?? 0;
const getFeeProfit    = (b: any): number => b.details?.convenienceFee ?? b.convenienceFee ?? 0;
const getFee          = (b: any): number => getMarkupProfit(b) + getFeeProfit(b);
const getAgentComm    = (b: any): number => Number(b.commissionEarned) || Number(b.details?.commissionEarned) || 0;
const getBookingDate  = (b: any): string =>
  b.createdAt?.slice(0, 10) ?? b.details?.createdAt?.slice(0, 10) ?? b.travelDate ?? "";

export default function AdminProfit() {
  const [allBookings, setAllBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const agents = useMemo(() => loadAgents(), []);

  const todayStr       = new Date().toISOString().slice(0, 10);
  const thisMonthStart = (() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); })();

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo,   setDateTo]   = useState("");

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/bookings");
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      setAllBookings(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e.message ?? "Failed to load bookings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBookings(); }, [fetchBookings]);

  const filtered = useMemo(() => allBookings.filter((b) => {
    const bDate   = getBookingDate(b);
    const matchDf = !dateFrom || bDate >= dateFrom;
    const matchDt = !dateTo   || bDate <= dateTo;
    return matchDf && matchDt;
  }), [allBookings, dateFrom, dateTo]);

  const revenue    = filtered.reduce((s, b) => s + getAmount(b), 0);
  const markup     = filtered.reduce((s, b) => s + getMarkupProfit(b), 0);
  const fee        = filtered.reduce((s, b) => s + getFeeProfit(b), 0);
  const profit     = filtered.reduce((s, b) => s + getFee(b), 0);
  const commission = filtered.reduce((s, b) => s + getAgentComm(b), 0);
  const netProfit  = profit - commission;
  const margin     = revenue > 0 ? ((netProfit / revenue) * 100).toFixed(1) : "0.0";

  return (
    <AdminLayout>
      <div className="min-h-screen bg-muted/30">
        {/* Header */}
        <div className="bg-primary text-primary-foreground py-6 px-6 shadow-lg">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-primary-foreground/20 flex items-center justify-center shrink-0">
                <IndianRupee className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Profit & Revenue Report</h1>
                <p className="text-primary-foreground/80 text-sm">Service-wise breakdown and agent commissions — live database data</p>
              </div>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={fetchBookings}
              disabled={loading}
              className="gap-1.5 shrink-0"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
              {loading ? "Loading…" : "Refresh"}
            </Button>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">

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

          {/* Period filter */}
          <Card>
            <CardContent className="p-4 flex flex-wrap items-center gap-3">
              <span className="text-sm font-semibold text-muted-foreground">Filter period:</span>
              <Button size="sm" variant={dateFrom === todayStr && dateTo === todayStr ? "default" : "outline"}
                onClick={() => { setDateFrom(todayStr); setDateTo(todayStr); }}>
                Today
              </Button>
              <Button size="sm" variant={dateFrom === thisMonthStart && !dateTo ? "default" : "outline"}
                onClick={() => { setDateFrom(thisMonthStart); setDateTo(""); }}>
                This Month
              </Button>
              <Button size="sm" variant={!dateFrom && !dateTo ? "default" : "outline"}
                onClick={() => { setDateFrom(""); setDateTo(""); }}>
                All Time
              </Button>
              <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                <Label className="text-xs whitespace-nowrap text-muted-foreground">Custom:</Label>
                <Input type="date" className="h-8 text-xs flex-1" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                <span className="text-xs text-muted-foreground">to</span>
                <Input type="date" className="h-8 text-xs flex-1" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
              {(dateFrom || dateTo) && (
                <Button size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground"
                  onClick={() => { setDateFrom(""); setDateTo(""); }}>
                  Clear
                </Button>
              )}
              <span className="text-xs text-muted-foreground ml-auto">
                {loading ? "Loading…" : `${filtered.length} booking${filtered.length !== 1 ? "s" : ""}`}
              </span>
            </CardContent>
          </Card>

          {/* Loading */}
          {loading && allBookings.length === 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {[...Array(5)].map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <div className="h-4 bg-muted animate-pulse rounded mb-3 w-2/3" />
                    <div className="h-7 bg-muted animate-pulse rounded" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                <Card className="border-2 border-orange-200 bg-orange-50">
                  <CardContent className="p-4">
                    <p className="text-xs font-semibold text-orange-600 uppercase mb-1">Total Revenue</p>
                    <p className="text-xl font-bold text-orange-700">₹{revenue.toLocaleString("en-IN")}</p>
                    <p className="text-xs text-orange-500 mt-1">Gross collected</p>
                  </CardContent>
                </Card>
                <Card className="border-2 border-amber-200 bg-amber-50">
                  <CardContent className="p-4">
                    <p className="text-xs font-semibold text-amber-700 uppercase mb-1">Markup Earnings</p>
                    <p className="text-xl font-bold text-amber-700">₹{markup.toLocaleString("en-IN")}</p>
                    <p className="text-xs text-amber-500 mt-1">Hidden margin</p>
                  </CardContent>
                </Card>
                <Card className="border-2 border-blue-200 bg-blue-50">
                  <CardContent className="p-4">
                    <p className="text-xs font-semibold text-blue-700 uppercase mb-1">Conv. Fee Earned</p>
                    <p className="text-xl font-bold text-blue-700">₹{fee.toLocaleString("en-IN")}</p>
                    <p className="text-xs text-blue-500 mt-1">Visible checkout fee</p>
                  </CardContent>
                </Card>
                <Card className="border-2 border-red-200 bg-red-50">
                  <CardContent className="p-4">
                    <p className="text-xs font-semibold text-red-600 uppercase mb-1">Agent Commission</p>
                    <p className="text-xl font-bold text-red-700">₹{commission.toLocaleString("en-IN")}</p>
                    <p className="text-xs text-red-500 mt-1">Paid out to agents</p>
                  </CardContent>
                </Card>
                <Card className="border-2 border-emerald-300 bg-emerald-50 sm:col-span-1 col-span-2">
                  <CardContent className="p-4">
                    <p className="text-xs font-semibold text-emerald-700 uppercase mb-1">Net Profit</p>
                    <p className="text-2xl font-extrabold text-emerald-800">₹{netProfit.toLocaleString("en-IN")}</p>
                    <p className="text-xs text-emerald-600 mt-1">Margin: {margin}%</p>
                  </CardContent>
                </Card>
              </div>

              {/* Service-wise breakdown */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart2 className="w-4 h-4 text-primary" />
                    Service-wise Profit & Revenue
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 border-b">
                        <tr>
                          <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Service</th>
                          <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Bookings</th>
                          <th className="text-right px-4 py-3 font-semibold text-orange-600">Revenue (₹)</th>
                          <th className="text-right px-4 py-3 font-semibold text-amber-600">Markup (₹)</th>
                          <th className="text-right px-4 py-3 font-semibold text-blue-600">Conv. Fee (₹)</th>
                          <th className="text-right px-4 py-3 font-semibold text-red-600">Commission (₹)</th>
                          <th className="text-right px-4 py-3 font-semibold text-green-800">Net Profit (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {([
                          { key: "flight",  label: "Flights",  Icon: Plane },
                          { key: "hotel",   label: "Hotels",   Icon: Building2 },
                          { key: "bus",     label: "Buses",    Icon: Bus },
                          { key: "package", label: "Holidays", Icon: Package },
                        ] as const).map(({ key, label, Icon }) => {
                          const svcBs   = filtered.filter((b) => (b.bookingType || b.type || "").toLowerCase() === key);
                          const svcRev  = svcBs.reduce((s, b) => s + getAmount(b), 0);
                          const svcMkp  = svcBs.reduce((s, b) => s + getMarkupProfit(b), 0);
                          const svcFee  = svcBs.reduce((s, b) => s + getFeeProfit(b), 0);
                          const svcComm = svcBs.reduce((s, b) => s + getAgentComm(b), 0);
                          const svcPft  = svcMkp + svcFee;
                          const svcNet  = svcPft - svcComm;
                          return (
                            <tr key={key} className="hover:bg-muted/20 transition-colors">
                              <td className="px-4 py-3 font-medium">
                                <span className="flex items-center gap-2">
                                  <Icon className="w-4 h-4 text-muted-foreground" />
                                  {label}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right font-semibold">{svcBs.length}</td>
                              <td className="px-4 py-3 text-right font-semibold text-orange-600">
                                {svcRev > 0 ? `₹${svcRev.toLocaleString("en-IN")}` : "—"}
                              </td>
                              <td className="px-4 py-3 text-right font-semibold text-amber-600">
                                {svcMkp > 0 ? `₹${svcMkp.toLocaleString("en-IN")}` : "—"}
                              </td>
                              <td className="px-4 py-3 text-right font-semibold text-blue-600">
                                {svcFee > 0 ? `₹${svcFee.toLocaleString("en-IN")}` : "—"}
                              </td>
                              <td className="px-4 py-3 text-right font-semibold text-red-600">
                                {svcComm > 0 ? `₹${svcComm.toLocaleString("en-IN")}` : "—"}
                              </td>
                              <td className="px-4 py-3 text-right font-bold text-green-800">
                                ₹{svcNet.toLocaleString("en-IN")}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-muted/30 border-t-2">
                        <tr>
                          <td className="px-4 py-3 font-bold">Total</td>
                          <td className="px-4 py-3 text-right font-bold">{filtered.length}</td>
                          <td className="px-4 py-3 text-right font-bold text-orange-700">₹{revenue.toLocaleString("en-IN")}</td>
                          <td className="px-4 py-3 text-right font-bold text-amber-700">₹{markup.toLocaleString("en-IN")}</td>
                          <td className="px-4 py-3 text-right font-bold text-blue-700">₹{fee.toLocaleString("en-IN")}</td>
                          <td className="px-4 py-3 text-right font-bold text-red-700">₹{commission.toLocaleString("en-IN")}</td>
                          <td className="px-4 py-3 text-right font-extrabold text-green-800 text-base">₹{netProfit.toLocaleString("en-IN")}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Agent commission breakdown */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="w-4 h-4 text-primary" />
                    Agent Commission Breakdown
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {agents.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground">
                      <Users className="w-10 h-10 mx-auto mb-3 opacity-20" />
                      <p className="font-medium">No agents registered yet</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/40 border-b">
                          <tr>
                            <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Agent</th>
                            <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Code</th>
                            <th className="text-right px-4 py-3 font-semibold text-muted-foreground">Bookings</th>
                            <th className="text-right px-4 py-3 font-semibold text-orange-600">Revenue</th>
                            <th className="text-right px-4 py-3 font-semibold text-red-600">Commission</th>
                            <th className="text-center px-4 py-3 font-semibold text-muted-foreground">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {agents.map((agent: any) => {
                            const agentBs   = filtered.filter((b) =>
                              b.agentEmail === agent.email ||
                              b.details?.agentEmail === agent.email ||
                              b.passengerEmail === agent.email ||
                              (b.agentId && b.agentId === agent.id)
                            );
                            const agentRev  = agentBs.reduce((s, b) => s + getAmount(b), 0);
                            const agentComm = agentBs.reduce((s, b) => s + getAgentComm(b), 0);
                            return (
                              <tr key={agent.id} className="hover:bg-muted/20 transition-colors">
                                <td className="px-4 py-3">
                                  <p className="font-semibold text-sm">{agent.agencyName || agent.name}</p>
                                  <p className="text-xs text-muted-foreground">{agent.email}</p>
                                </td>
                                <td className="px-4 py-3 font-mono text-xs text-blue-700">{agent.agentCode || "—"}</td>
                                <td className="px-4 py-3 text-right font-semibold">{agentBs.length}</td>
                                <td className="px-4 py-3 text-right font-semibold text-orange-600">
                                  {agentRev > 0 ? `₹${agentRev.toLocaleString("en-IN")}` : "—"}
                                </td>
                                <td className="px-4 py-3 text-right font-bold text-red-600">
                                  {agentComm > 0 ? `₹${agentComm.toLocaleString("en-IN")}` : "—"}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <span className={cn(
                                    "text-xs font-semibold px-2 py-0.5 rounded-full border",
                                    agent.isApproved
                                      ? "bg-green-50 text-green-700 border-green-200"
                                      : "bg-amber-50 text-amber-700 border-amber-200"
                                  )}>
                                    {agent.isApproved ? "Active" : "Pending"}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="bg-muted/30 border-t-2">
                          <tr>
                            <td colSpan={2} className="px-4 py-3 font-bold">All Agents Total</td>
                            <td className="px-4 py-3 text-right font-bold">
                              {agents.reduce((s: number, a: any) =>
                                s + filtered.filter((b) =>
                                  b.agentEmail === a.email || b.details?.agentEmail === a.email ||
                                  b.passengerEmail === a.email || (b.agentId && b.agentId === a.id)
                                ).length, 0)}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-orange-700">
                              ₹{agents.reduce((s: number, a: any) =>
                                s + filtered
                                  .filter((b) =>
                                    b.agentEmail === a.email || b.details?.agentEmail === a.email ||
                                    b.passengerEmail === a.email || (b.agentId && b.agentId === a.id)
                                  )
                                  .reduce((ss: number, b: any) => ss + getAmount(b), 0), 0).toLocaleString("en-IN")}
                            </td>
                            <td className="px-4 py-3 text-right font-extrabold text-red-700">
                              ₹{commission.toLocaleString("en-IN")}
                            </td>
                            <td />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Calculation legend */}
              <Card className="bg-muted/30">
                <CardContent className="p-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase mb-2 flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5" /> How profit is calculated
                  </p>
                  <ul className="text-xs text-muted-foreground space-y-1.5 list-disc list-inside">
                    <li><strong>Revenue</strong> = Total amount collected from customers (including all markups and fees)</li>
                    <li><strong>Markup Earnings</strong> = Hidden margin added over raw supplier price (not visible to customers)</li>
                    <li><strong>Conv. Fee</strong> = Visible convenience fee charged at checkout</li>
                    <li><strong>Gross Profit</strong> = Markup + Conv. Fee</li>
                    <li><strong>Agent Commission</strong> = Difference between customer markup and agent markup (agent earns this)</li>
                    <li><strong>Net Profit</strong> = Gross Profit − Agent Commission</li>
                    <li><strong>Margin %</strong> = Net Profit ÷ Revenue × 100</li>
                  </ul>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
