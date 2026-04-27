import { APP_NAME } from "@/lib/app-config";
import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Wallet,
  Plane,
  Building2,
  Bus,
  Palmtree,
  Hotel,
  Copy,
  CheckCircle,
  Clock,
  XCircle,
  IndianRupee,
  TrendingUp,
  BookOpen,
  AlertCircle,
  ArrowRight,
  BadgeIndianRupee,
  PlusCircle,
  ArrowUpCircle,
  ArrowDownCircle,
  History,
  CalendarDays,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getMarkupSettings } from "@/lib/pricing";
import { creditWallet, getWalletTxns, type WalletTxn } from "@/lib/wallet";
import { openRazorpayCheckout } from "@/lib/use-razorpay";

interface Booking {
  id: string;
  bookingId?: string;
  bookingType: string;
  passengerName: string;
  customerName?: string;
  totalPrice: number;
  status: string;
  travelDate: string;
  createdAt?: string;
  agentId?: string;
  agentEmail?: string;
  details?: {
    commissionEarned?: number;
    agentMarkup?: number;
    normalMarkup?: number;
    amount?: number;
    agentEmail?: string;
  };
}

function getServiceType(b: Booking): string {
  const t = (b.bookingType ?? "").toLowerCase();
  if (t.includes("flight")) return "flight";
  if (t.includes("hotel")) return "hotel";
  if (t.includes("bus"))   return "bus";
  if (t.includes("package") || t.includes("holiday")) return "holiday";
  return t || "flight";
}

function getServiceLabel(type: string): string {
  if (type === "flight")  return "Flight";
  if (type === "hotel")   return "Hotel";
  if (type === "bus")     return "Bus";
  if (type === "holiday") return "Holiday";
  return "Flight";
}

function ServiceIcon({ type, className }: { type: string; className?: string }) {
  if (type === "hotel")   return <Hotel className={className} />;
  if (type === "bus")     return <Bus className={className} />;
  if (type === "holiday") return <Palmtree className={className} />;
  return <Plane className={className} />;
}

function loadBookings(agentEmail: string): Booking[] {
  try {
    const lsRaw  = localStorage.getItem("travel_bookings");
    const mswRaw = localStorage.getItem("msw_mock_bookings");
    const lsAll: any[] = lsRaw  ? JSON.parse(lsRaw)  : [];
    const ssAll: any[] = mswRaw ? JSON.parse(mswRaw) : [];

    const seen = new Set<string>();
    const merged: any[] = [];
    for (const b of [...ssAll, ...lsAll]) {
      const key = b.bookingId || b.id?.toString() || "";
      if (!seen.has(key)) { seen.add(key); merged.push(b); }
    }

    return merged.filter(
      (b: any) =>
        b.agentEmail === agentEmail ||
        b.agentId    === agentEmail ||
        b.passengerEmail === agentEmail ||
        b.details?.agentEmail === agentEmail
    );
  } catch {
    return [];
  }
}

function getEarning(b: Booking, markup: ReturnType<typeof getMarkupSettings>, agentMarkup?: number): number {
  if (b.details?.commissionEarned) return b.details.commissionEarned;
  const svc = getServiceType(b) as string;
  const key = svc === "holiday" ? "packages" : (svc === "flight" ? "flights" : svc === "hotel" ? "hotels" : svc === "bus" ? "buses" : "flights") as "flights" | "hotels" | "buses" | "packages";
  const normalMkp = markup[key]?.value ?? 0;
  const agentMkp  = agentMarkup ?? normalMkp;
  return Math.max(0, normalMkp - agentMkp);
}

function isThisMonth(dateStr?: string): boolean {
  if (!dateStr) return false;
  try {
    const d = new Date(dateStr);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  } catch {
    return false;
  }
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; icon: any; cls: string }> = {
    confirmed: { label: "Confirmed", icon: CheckCircle, cls: "bg-green-100 text-green-700 border-green-200" },
    pending:   { label: "Pending",   icon: Clock,        cls: "bg-amber-100 text-amber-700 border-amber-200" },
    cancelled: { label: "Cancelled", icon: XCircle,      cls: "bg-red-100 text-red-700 border-red-200" },
    paid:      { label: "Paid",      icon: CheckCircle,  cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  };
  const s = map[status?.toLowerCase()] ?? map.pending;
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${s.cls}`}>
      <Icon className="w-3 h-3" />
      {s.label}
    </span>
  );
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return dateStr; }
}

export default function AgentDashboard() {
  const { user, isAuthenticated, isAgent, refreshUser } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [codeCopied, setCodeCopied] = useState(false);
  const markup = getMarkupSettings();

  const [topUpAmount, setTopUpAmount] = useState("");
  const [topUpLoading, setTopUpLoading] = useState(false);
  const [walletTxns, setWalletTxns] = useState<WalletTxn[]>([]);

  useEffect(() => { refreshUser(); }, []);

  useEffect(() => {
    if (!isAuthenticated) { setLocation("/login"); return; }
    if (user && !isAgent)  { setLocation("/"); return; }
    if (user?.email) setBookings(loadBookings(user.email));
    if (user?.id)    setWalletTxns(getWalletTxns(user.id));
  }, [user, isAuthenticated, isAgent]);

  async function handleTopUp() {
    const amount = parseFloat(topUpAmount);
    if (!user || isNaN(amount) || amount < 100) {
      toast({ variant: "destructive", title: "Minimum top-up is ₹100" });
      return;
    }
    setTopUpLoading(true);
    openRazorpayCheckout({
      amount,
      name: user.name,
      email: user.email,
      phone: user.phone ?? "9999999999",
      description: ` Wallet Top-up`,
      onSuccess: () => {
        const newBalance = creditWallet(user.id, amount, `Wallet top-up ₹${amount}`);
        refreshUser();
        setWalletTxns(getWalletTxns(user.id));
        setTopUpAmount("");
        setTopUpLoading(false);
        toast({
          title: "Wallet Topped Up!",
          description: `₹${amount.toLocaleString("en-IN")} added. New balance: ₹${newBalance.toLocaleString("en-IN")}`,
        });
      },
      onFailure: (msg) => {
        setTopUpLoading(false);
        if (msg !== "Payment was cancelled.")
          toast({ variant: "destructive", title: "Top-up Failed", description: msg });
      },
      onDismiss: () => { setTopUpLoading(false); },
    });
  }

  const copyCode = () => {
    if (user?.agentCode) {
      navigator.clipboard.writeText(user.agentCode).catch(() => {});
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
      toast({ title: "Agent code copied!" });
    }
  };

  if (!user || !isAgent) return null;

  const isApproved = user.isApproved ?? false;
  const wallet     = user.walletBalance ?? 0;

  // ── Earnings calculations ──────────────────────────────────────────────────
  const bookingsWithEarnings = bookings.map((b) => ({
    ...b,
    earning: getEarning(b, markup, user.agentMarkup),
  }));

  const totalEarnings  = bookingsWithEarnings.reduce((s, b) => s + b.earning, 0);
  const monthlyEarnings = bookingsWithEarnings
    .filter((b) => isThisMonth(b.createdAt ?? b.travelDate))
    .reduce((s, b) => s + b.earning, 0);
  const totalBookings  = bookings.length;

  const serviceEarnings: Record<string, number> = { flight: 0, hotel: 0, bus: 0, holiday: 0 };
  for (const b of bookingsWithEarnings) {
    const svc = getServiceType(b);
    serviceEarnings[svc] = (serviceEarnings[svc] ?? 0) + b.earning;
  }

  const recentBookings = [...bookingsWithEarnings]
    .sort((a, b) => {
      const da = new Date(a.createdAt ?? a.travelDate ?? 0).getTime();
      const db = new Date(b.createdAt ?? b.travelDate ?? 0).getTime();
      return db - da;
    })
    .slice(0, 20);

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Building2 className="w-6 h-6 text-blue-600" />
              <h1 className="text-2xl font-bold">Agent Dashboard</h1>
              {isApproved ? (
                <Badge className="bg-green-100 text-green-700 border-green-200 border">Active</Badge>
              ) : (
                <Badge className="bg-amber-100 text-amber-700 border-amber-200 border">Pending Approval</Badge>
              )}
            </div>
            <p className="text-muted-foreground text-sm">
              {user.agencyName || user.name} · {user.email}
            </p>
          </div>
          <Link href="/flights">
            <Button className="bg-blue-600 hover:bg-blue-700">
              Search Flights <ArrowRight className="ml-1.5 w-4 h-4" />
            </Button>
          </Link>
        </div>

        {/* Pending approval banner */}
        {!isApproved && (
          <div className="mb-6 flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Account Pending Approval</p>
              <p className="text-sm">Your agent account is under review. The admin will approve your account shortly. Discounted pricing will be active after approval.</p>
            </div>
          </div>
        )}

        {/* Top summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card className="border-2 border-blue-100">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Wallet className="w-5 h-5 text-blue-600" />
                <span className="text-xs font-medium text-muted-foreground uppercase">Wallet</span>
              </div>
              <p className="text-2xl font-bold text-blue-700">₹{wallet.toLocaleString("en-IN")}</p>
              <p className="text-xs text-muted-foreground mt-1">Available balance</p>
            </CardContent>
          </Card>

          <Card className="border-2 border-emerald-100">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-5 h-5 text-emerald-600" />
                <span className="text-xs font-medium text-muted-foreground uppercase">Total Earned</span>
              </div>
              <p className="text-2xl font-bold text-emerald-700">₹{totalEarnings.toLocaleString("en-IN")}</p>
              <p className="text-xs text-muted-foreground mt-1">All time earnings</p>
            </CardContent>
          </Card>

          <Card className="border-2 border-purple-100">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <CalendarDays className="w-5 h-5 text-purple-500" />
                <span className="text-xs font-medium text-muted-foreground uppercase">This Month</span>
              </div>
              <p className="text-2xl font-bold text-purple-700">₹{monthlyEarnings.toLocaleString("en-IN")}</p>
              <p className="text-xs text-muted-foreground mt-1">Current month</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <BookOpen className="w-5 h-5 text-slate-500" />
                <span className="text-xs font-medium text-muted-foreground uppercase">Bookings</span>
              </div>
              <p className="text-2xl font-bold">{totalBookings}</p>
              <p className="text-xs text-muted-foreground mt-1">Total bookings</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="earnings" className="space-y-6">
          <TabsList>
            <TabsTrigger value="earnings">
              <BadgeIndianRupee className="w-3.5 h-3.5 mr-1" />
              Earnings
            </TabsTrigger>
            <TabsTrigger value="info">My Account</TabsTrigger>
            <TabsTrigger value="wallet">
              <Wallet className="w-3.5 h-3.5 mr-1" />
              Wallet
            </TabsTrigger>
            <TabsTrigger value="bookings">Booking History</TabsTrigger>
          </TabsList>

          {/* ── EARNINGS TAB ──────────────────────────────────────────────── */}
          <TabsContent value="earnings" className="space-y-6">

            {/* A. Earnings summary cards */}
            <div>
              <h2 className="text-base font-bold text-slate-800 mb-3">Your Earnings</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="border-2 border-emerald-100 bg-emerald-50/40">
                  <CardContent className="p-5">
                    <p className="text-xs font-semibold text-emerald-600 uppercase mb-1">Total Earnings</p>
                    <p className="text-3xl font-extrabold text-emerald-700">₹{totalEarnings.toLocaleString("en-IN")}</p>
                    <p className="text-xs text-muted-foreground mt-1">All bookings ever</p>
                  </CardContent>
                </Card>
                <Card className="border-2 border-purple-100 bg-purple-50/40">
                  <CardContent className="p-5">
                    <p className="text-xs font-semibold text-purple-600 uppercase mb-1">This Month</p>
                    <p className="text-3xl font-extrabold text-purple-700">₹{monthlyEarnings.toLocaleString("en-IN")}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date().toLocaleString("en-IN", { month: "long", year: "numeric" })}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-2 border-slate-200">
                  <CardContent className="p-5">
                    <p className="text-xs font-semibold text-slate-600 uppercase mb-1">Total Bookings</p>
                    <p className="text-3xl font-extrabold text-slate-800">{totalBookings}</p>
                    <p className="text-xs text-muted-foreground mt-1">Across all services</p>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* B. Service-wise earnings */}
            <div>
              <h2 className="text-base font-bold text-slate-800 mb-3">Service-wise Earnings</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { type: "flight",  label: "Flights",  color: "text-blue-600",   bg: "bg-blue-50",    border: "border-blue-100" },
                  { type: "hotel",   label: "Hotels",   color: "text-green-600",  bg: "bg-green-50",   border: "border-green-100" },
                  { type: "bus",     label: "Buses",    color: "text-orange-600", bg: "bg-orange-50",  border: "border-orange-100" },
                  { type: "holiday", label: "Holidays", color: "text-purple-600", bg: "bg-purple-50",  border: "border-purple-100" },
                ].map(({ type, label, color, bg, border }) => (
                  <Card key={type} className={`border-2 ${border} ${bg}`}>
                    <CardContent className="p-4 text-center">
                      <div className={`flex items-center justify-center mb-2 ${color}`}>
                        <ServiceIcon type={type} className="w-5 h-5" />
                      </div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1">{label}</p>
                      <p className={`text-xl font-bold ${color}`}>
                        ₹{(serviceEarnings[type] ?? 0).toLocaleString("en-IN")}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {/* C. Recent bookings table */}
            <div>
              <h2 className="text-base font-bold text-slate-800 mb-3">Recent Bookings</h2>
              <Card>
                <CardContent className="p-0">
                  {recentBookings.length === 0 ? (
                    <div className="text-center py-14 text-muted-foreground">
                      <IndianRupee className="w-10 h-10 mx-auto mb-3 opacity-20" />
                      <p className="font-medium">No bookings yet</p>
                      <p className="text-sm mt-1">Your earnings will appear here after your first booking.</p>
                      <Link href="/flights">
                        <Button className="mt-4" variant="outline" size="sm">Search Flights</Button>
                      </Link>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-muted/40 border-b">
                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Booking ID</th>
                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Service</th>
                            <th className="text-left px-4 py-3 font-semibold text-slate-600">Customer</th>
                            <th className="text-right px-4 py-3 font-semibold text-emerald-700">Earning</th>
                            <th className="text-right px-4 py-3 font-semibold text-slate-600">Date</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {recentBookings.map((b, i) => {
                            const svc = getServiceType(b);
                            const bid = b.bookingId ?? (b.id ? `#${b.id}` : `—`);
                            const customer = b.customerName ?? b.passengerName ?? "—";
                            const date = formatDate(b.createdAt ?? b.travelDate);
                            return (
                              <tr key={b.id ?? i} className="hover:bg-muted/20 transition-colors">
                                <td className="px-4 py-3 font-mono text-xs text-slate-700">{bid}</td>
                                <td className="px-4 py-3">
                                  <span className="inline-flex items-center gap-1.5">
                                    <ServiceIcon type={svc} className="w-3.5 h-3.5 text-muted-foreground" />
                                    <span className="capitalize">{getServiceLabel(svc)}</span>
                                  </span>
                                </td>
                                <td className="px-4 py-3 font-medium text-slate-800">{customer}</td>
                                <td className="px-4 py-3 text-right">
                                  <span className={`font-bold ${b.earning > 0 ? "text-emerald-600" : "text-slate-400"}`}>
                                    ₹{b.earning.toLocaleString("en-IN")}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right text-slate-500 text-xs">{date}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="bg-emerald-50 border-t-2 border-emerald-200">
                            <td colSpan={3} className="px-4 py-3 font-bold text-slate-700">Total Earnings</td>
                            <td className="px-4 py-3 text-right font-extrabold text-emerald-700 text-base">
                              ₹{totalEarnings.toLocaleString("en-IN")}
                            </td>
                            <td className="px-4 py-3" />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── ACCOUNT INFO TAB ─────────────────────────────────────────────── */}
          <TabsContent value="info" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Agent Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Agency Name</p>
                    <p className="font-semibold">{user.agencyName || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Contact Name</p>
                    <p className="font-semibold">{user.name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Email</p>
                    <p className="font-semibold">{user.email}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Phone</p>
                    <p className="font-semibold">{user.phone || "—"}</p>
                  </div>
                  {user.gstNumber && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">GST Number</p>
                      <p className="font-semibold font-mono">{user.gstNumber}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Account Status</p>
                    <StatusBadge status={isApproved ? "confirmed" : "pending"} />
                  </div>
                </div>

                {/* Agent code */}
                <div className="mt-4 p-4 rounded-xl bg-blue-50 border border-blue-200">
                  <p className="text-xs text-blue-600 font-semibold uppercase mb-2">Your Agent Code</p>
                  <div className="flex items-center gap-3">
                    <p className="text-2xl font-mono font-bold text-blue-800 tracking-wider">
                      {user.agentCode}
                    </p>
                    <button
                      onClick={copyCode}
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                    >
                      {codeCopied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      {codeCopied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <p className="text-xs text-blue-600 mt-1">Share this code with clients and the admin for account identification.</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── WALLET TAB ───────────────────────────────────────────────────── */}
          <TabsContent value="wallet" className="space-y-4">
            <Card className="border-2 border-blue-100">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Wallet className="w-5 h-5 text-blue-600" />
                  My Wallet
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-blue-50 border border-blue-100">
                  <div>
                    <p className="text-xs text-blue-600 font-semibold uppercase tracking-wide mb-1">Wallet Balance</p>
                    <p className="text-4xl font-extrabold text-blue-800">₹{wallet.toLocaleString("en-IN")}</p>
                    <p className="text-xs text-blue-500 mt-1">Use this balance to pay for bookings instantly</p>
                  </div>
                  <div className="shrink-0 text-center">
                    <p className="text-xs text-muted-foreground mb-1">{walletTxns.length} transactions</p>
                  </div>
                </div>

                {/* Top-up section */}
                <div>
                  <p className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                    <PlusCircle className="w-4 h-4 text-green-600" />
                    Add Money to Wallet
                  </p>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min="100"
                      step="100"
                      placeholder="Enter amount (min ₹100)"
                      value={topUpAmount}
                      onChange={(e) => setTopUpAmount(e.target.value)}
                      className="max-w-[220px]"
                    />
                    <Button
                      onClick={handleTopUp}
                      disabled={topUpLoading || !topUpAmount}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      {topUpLoading ? "Processing…" : "Add Money"}
                    </Button>
                  </div>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {[500, 1000, 2000, 5000].map((amt) => (
                      <button
                        key={amt}
                        onClick={() => setTopUpAmount(String(amt))}
                        className="text-xs px-3 py-1 rounded-full border border-blue-200 text-blue-700 hover:bg-blue-50 transition-colors font-medium"
                      >
                        + ₹{amt.toLocaleString("en-IN")}
                      </button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Transaction history */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <History className="w-4 h-4" />
                  Transaction History
                </CardTitle>
              </CardHeader>
              <CardContent>
                {walletTxns.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <Wallet className="w-10 h-10 mx-auto mb-3 opacity-20" />
                    <p className="font-medium">No transactions yet</p>
                    <p className="text-sm mt-1">Add money to get started</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {walletTxns.map((txn) => (
                      <div key={txn.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/20 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                            txn.type === "credit" ? "bg-green-100" : "bg-red-100"
                          }`}>
                            {txn.type === "credit"
                              ? <ArrowUpCircle className="w-4 h-4 text-green-600" />
                              : <ArrowDownCircle className="w-4 h-4 text-red-500" />
                            }
                          </div>
                          <div>
                            <p className="text-sm font-medium">{txn.note}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(txn.createdAt).toLocaleString("en-IN", {
                                day: "2-digit", month: "short", year: "numeric",
                                hour: "2-digit", minute: "2-digit",
                              })}
                            </p>
                            {txn.bookingRef && (
                              <p className="text-xs text-blue-500 font-mono">Ref: {txn.bookingRef}</p>
                            )}
                          </div>
                        </div>
                        <p className={`font-bold text-sm ${txn.type === "credit" ? "text-green-600" : "text-red-500"}`}>
                          {txn.type === "credit" ? "+" : "−"}₹{txn.amount.toLocaleString("en-IN")}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── BOOKING HISTORY TAB ──────────────────────────────────────────── */}
          <TabsContent value="bookings">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Booking History ({totalBookings})</CardTitle>
              </CardHeader>
              <CardContent>
                {bookings.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="font-medium">No bookings yet</p>
                    <p className="text-sm mt-1">Start by searching for flights or hotels</p>
                    <Link href="/flights">
                      <Button className="mt-4" variant="outline">Search Flights</Button>
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {bookingsWithEarnings.map((b, i) => {
                      const svc = getServiceType(b);
                      return (
                        <div key={b.id ?? i} className="flex items-center justify-between p-4 rounded-xl border hover:bg-muted/30 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
                              <ServiceIcon type={svc} className="w-4 h-4 text-blue-600" />
                            </div>
                            <div>
                              <p className="font-semibold text-sm">{b.customerName ?? b.passengerName}</p>
                              <p className="text-xs text-muted-foreground capitalize">
                                {getServiceLabel(svc)} · {b.travelDate || "—"}
                              </p>
                              {b.bookingId && (
                                <p className="text-xs text-muted-foreground font-mono">{b.bookingId}</p>
                              )}
                              {b.earning > 0 && (
                                <p className="text-xs text-emerald-600 font-semibold">
                                  Earned: ₹{b.earning.toLocaleString("en-IN")}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-bold">₹{(b.totalPrice ?? b.details?.amount ?? 0).toLocaleString("en-IN")}</p>
                            <StatusBadge status={b.status ?? "pending"} />
                          </div>
                        </div>
                      );
                    })}

                    <div className="mt-4 pt-4 border-t grid grid-cols-3 text-center gap-2">
                      <div>
                        <p className="text-xs text-muted-foreground">Bookings</p>
                        <p className="font-bold text-sm">{totalBookings}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">This Month</p>
                        <p className="font-bold text-sm text-purple-600">₹{monthlyEarnings.toLocaleString("en-IN")}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Total Earned</p>
                        <p className="font-bold text-sm text-emerald-600">₹{totalEarnings.toLocaleString("en-IN")}</p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
