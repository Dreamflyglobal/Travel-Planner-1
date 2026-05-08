import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Building2, Wallet, ShieldCheck, ShieldOff, Plus, BookOpen,
  RefreshCw, TrendingUp, Users, IndianRupee, ArrowRight, Plane,
  Bus, Map, CheckCircle, XCircle, Clock, Search, Download, Edit2,
  Trash2, Eye, EyeOff, Lock,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { creditWallet } from "@/lib/wallet";
import {
  getAgentMarkupSettings,
  getHiddenMarkupAmount,
} from "@/lib/pricing";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────
interface AgentUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  agencyName?: string;
  agentCode?: string;
  walletBalance?: number;
  commission?: number;
  agentMarkup?: number;
  isApproved?: boolean;
  createdAt?: string;
  gstNumber?: string;
  password?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function loadAgents(): AgentUser[] {
  try {
    const raw = localStorage.getItem("users");
    const users: any[] = raw ? JSON.parse(raw) : [];
    return users.filter((u) => u.role === "agent");
  } catch { return []; }
}

function mergeAllBookings(): any[] {
  try {
    const lsRaw = localStorage.getItem("travel_bookings");
    const ssRaw = localStorage.getItem("msw_mock_bookings");
    const lsAll: any[] = lsRaw ? JSON.parse(lsRaw) : [];
    const ssAll: any[] = ssRaw ? JSON.parse(ssRaw) : [];
    const seen = new Set<string>();
    const merged: any[] = [];
    for (const b of [...ssAll, ...lsAll]) {
      const key = b.bookingId || b.id?.toString() || "";
      if (!seen.has(key)) { seen.add(key); merged.push(b); }
    }
    return merged;
  } catch { return []; }
}

function countAgentBookings(agentEmail: string): number {
  try {
    return mergeAllBookings().filter(
      (b) => b.agentEmail === agentEmail || b.passengerEmail === agentEmail || b.details?.agentEmail === agentEmail
    ).length;
  } catch { return 0; }
}

function sumAgentCommission(agentEmail: string): number {
  try {
    return mergeAllBookings()
      .filter((b) => b.agentEmail === agentEmail || b.passengerEmail === agentEmail || b.details?.agentEmail === agentEmail)
      .reduce((sum, b) => sum + (Number(b.commissionEarned) || b.details?.commissionEarned || 0), 0);
  } catch { return 0; }
}

function generateAgentCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "AG";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function saveAgentField(agentId: string, fields: Partial<AgentUser>) {
  try {
    const raw = localStorage.getItem("users");
    const users: any[] = raw ? JSON.parse(raw) : [];
    const idx = users.findIndex((u) => u.id === agentId);
    if (idx !== -1) {
      users[idx] = { ...users[idx], ...fields };
      localStorage.setItem("users", JSON.stringify(users));
      const sessionRaw = localStorage.getItem("user");
      if (sessionRaw) {
        const session = JSON.parse(sessionRaw);
        if (session.id === agentId) {
          localStorage.setItem("user", JSON.stringify({ ...session, ...fields }));
        }
      }
    }
  } catch { /* ignore */ }
}

function getBookingDate(b: any): string {
  return b.details?.createdAt?.slice(0, 10) ?? b.createdAt?.slice(0, 10) ?? b.travelDate ?? "";
}

function getAmount(b: any): number {
  return b.amount ?? b.details?.amount ?? b.totalPrice ?? 0;
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function AdminAgents() {
  const { toast } = useToast();
  const [tab, setTab] = useState<"agents" | "bookings">("agents");

  // ── Agents state ────────────────────────────────────────────────────────────
  const [agents, setAgents] = useState<AgentUser[]>([]);
  const [topUpAgentId, setTopUpAgentId] = useState<string | null>(null);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [markupEdits, setMarkupEdits] = useState<Record<string, string>>({});
  const [agentSearch, setAgentSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "pending">("all");
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [deleteAgentId, setDeleteAgentId] = useState<string | null>(null);
  const [editingPasswordId, setEditingPasswordId] = useState<string | null>(null);
  const [newPasswordVal, setNewPasswordVal] = useState("");
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});

  // Create Agent form
  const [showCreateAgent, setShowCreateAgent] = useState(false);
  const [newAgent, setNewAgent] = useState({
    name: "", email: "", phone: "", password: "", agencyName: "", gstNumber: "",
  });
  const [createAgentError, setCreateAgentError] = useState("");

  // Bookings state
  const [adminBookings, setAdminBookings] = useState<any[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [bookingSearch, setBookingSearch] = useState("");

  // ── Load data ────────────────────────────────────────────────────────────────
  const refreshAgents = useCallback(() => setAgents(loadAgents()), []);

  const fetchBookings = useCallback(async () => {
    setBookingsLoading(true);
    try {
      const res = await fetch("/api/bookings");
      if (res.ok) {
        const data = await res.json();
        setAdminBookings(Array.isArray(data) ? data : []);
      }
    } catch { /* silent */ }
    setBookingsLoading(false);
  }, []);

  useEffect(() => {
    refreshAgents();
    fetchBookings();
  }, [refreshAgents, fetchBookings]);

  // ── Derived ───────────────────────────────────────────────────────────────────
  const filteredAgents = agents.filter((a) => {
    const q = agentSearch.toLowerCase();
    const matchQ = !q
      || (a.agencyName || a.name).toLowerCase().includes(q)
      || a.email.toLowerCase().includes(q)
      || (a.agentCode || "").toLowerCase().includes(q)
      || (a.phone || "").includes(q);
    const matchStatus =
      statusFilter === "all"
      || (statusFilter === "active" && a.isApproved)
      || (statusFilter === "pending" && !a.isApproved);
    return matchQ && matchStatus;
  });

  const agentBookings = adminBookings.filter(
    (b) => b.agentId || b.agentEmail || b.agentCode || b.details?.agentId || b.details?.agentEmail
  );

  const filteredAgentBookings = agentSearch && tab === "bookings"
    ? agentBookings.filter((b) => {
        const q = bookingSearch.toLowerCase();
        return (
          (b.passengerName || "").toLowerCase().includes(q) ||
          (b.customerName || "").toLowerCase().includes(q) ||
          (b.agentEmail || b.details?.agentEmail || "").toLowerCase().includes(q) ||
          (b.agentCode || b.details?.agentCode || "").toLowerCase().includes(q)
        );
      })
    : agentBookings;

  // Stats
  const totalRevenue = agentBookings.reduce((s, b) => s + getAmount(b), 0);
  const totalCommission = agentBookings.reduce(
    (s, b) => s + (b.commissionEarned ? Number(b.commissionEarned) : (b.details?.commissionEarned ?? 0)), 0
  );
  const pendingApproval = agents.filter((a) => !a.isApproved).length;

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleApproveAgent = (id: string, approve: boolean) => {
    saveAgentField(id, { isApproved: approve });
    refreshAgents();
    toast({ title: approve ? "Agent approved ✓" : "Agent deactivated" });
  };

  const handleDeleteAgent = (id: string) => {
    try {
      const raw = localStorage.getItem("users");
      const users: any[] = raw ? JSON.parse(raw) : [];
      localStorage.setItem("users", JSON.stringify(users.filter((u) => u.id !== id)));
      refreshAgents();
      setDeleteAgentId(null);
      toast({ title: "Agent deleted" });
    } catch { /* ignore */ }
  };

  const handleSetAgentMarkup = (id: string) => {
    const val = parseFloat(markupEdits[id] ?? "");
    if (isNaN(val) || val < 0) {
      toast({ title: "Invalid markup", description: "Enter a valid ₹ amount (0 or greater)", variant: "destructive" });
      return;
    }
    saveAgentField(id, { agentMarkup: val });
    refreshAgents();
    toast({ title: "Agent markup updated", description: `Set to ₹${val}` });
  };

  const handleCreateAgent = () => {
    setCreateAgentError("");
    const { name, email, phone, password, agencyName, gstNumber } = newAgent;
    if (!name || !email || !phone || !password) {
      setCreateAgentError("Name, email, phone and password are required.");
      return;
    }
    const raw = localStorage.getItem("users");
    const users: any[] = raw ? JSON.parse(raw) : [];
    if (users.find((u) => u.email === email)) {
      setCreateAgentError("An account with this email already exists.");
      return;
    }
    const agent: AgentUser = {
      id: `agent_${Date.now()}`,
      name,
      email,
      phone,
      password,
      role: "agent",
      agencyName: agencyName || name,
      gstNumber: gstNumber || "",
      agentCode: generateAgentCode(),
      walletBalance: 0,
      commission: 5,
      isApproved: false,
      createdAt: new Date().toISOString(),
    };
    users.push(agent);
    localStorage.setItem("users", JSON.stringify(users));
    refreshAgents();
    setNewAgent({ name: "", email: "", phone: "", password: "", agencyName: "", gstNumber: "" });
    setShowCreateAgent(false);
    toast({ title: "Agent created!", description: `${agent.agencyName} (${agent.agentCode}) — approve to activate.` });
  };

  const handleTopUp = () => {
    if (!topUpAgentId) return;
    const amount = parseFloat(topUpAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: "Invalid amount", variant: "destructive" });
      return;
    }
    const agent = agents.find((a) => a.id === topUpAgentId);
    const newBalance = creditWallet(topUpAgentId, amount, "Admin top-up");
    saveAgentField(topUpAgentId, { walletBalance: newBalance });
    refreshAgents();
    setTopUpAgentId(null);
    setTopUpAmount("");
    toast({ title: `₹${amount.toLocaleString("en-IN")} added to ${agent?.name ?? "agent"}'s wallet` });
  };

  const handleChangePassword = (id: string) => {
    if (!newPasswordVal.trim()) {
      toast({ title: "Password cannot be empty", variant: "destructive" });
      return;
    }
    saveAgentField(id, { password: newPasswordVal.trim() });
    setEditingPasswordId(null);
    setNewPasswordVal("");
    toast({ title: "Password updated ✓" });
  };

  // ── CSV Export ───────────────────────────────────────────────────────────────
  const handleExportCSV = () => {
    const rows = [
      ["Agency", "Contact", "Email", "Phone", "Agent Code", "Status", "Wallet", "Bookings", "Commission", "Created"],
      ...agents.map((a) => [
        a.agencyName || a.name,
        a.name,
        a.email,
        a.phone || "",
        a.agentCode || "",
        a.isApproved ? "Active" : "Pending",
        a.walletBalance ?? 0,
        countAgentBookings(a.email),
        sumAgentCommission(a.email),
        a.createdAt ? new Date(a.createdAt).toLocaleDateString("en-IN") : "",
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `agents-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "CSV exported ✓" });
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <AdminLayout>
      <div className="p-4 sm:p-6 space-y-6">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Building2 className="w-6 h-6 text-primary" />
              Agent Management
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Manage B2B travel agents, commissions, wallets and bookings
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={handleExportCSV} className="gap-1.5">
              <Download className="w-4 h-4" /> Export CSV
            </Button>
            <Button
              size="sm"
              onClick={() => { setShowCreateAgent(true); setCreateAgentError(""); }}
              className="gap-1.5"
            >
              <Plus className="w-4 h-4" /> Add Agent
            </Button>
          </div>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border p-4 text-center">
            <p className="text-2xl font-bold text-primary">{agents.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Total Agents</p>
          </div>
          <div className={cn("rounded-xl border p-4 text-center", pendingApproval > 0 ? "bg-amber-50 border-amber-200" : "bg-white")}>
            <p className={cn("text-2xl font-bold", pendingApproval > 0 ? "text-amber-700" : "text-muted-foreground")}>
              {pendingApproval}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Pending Approval</p>
          </div>
          <div className="bg-white rounded-xl border p-4 text-center">
            <p className="text-2xl font-bold text-blue-700">{agentBookings.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Agent Bookings</p>
          </div>
          <div className="bg-white rounded-xl border p-4 text-center">
            <p className="text-lg font-bold text-emerald-700">₹{totalCommission.toLocaleString("en-IN")}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Total Commission</p>
          </div>
        </div>

        {/* Create Agent Dialog */}
        <Dialog open={showCreateAgent} onOpenChange={setShowCreateAgent}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-primary" /> Create New B2B Agent
              </DialogTitle>
              <DialogDescription>
                Agent will be in Pending state — approve to activate login access.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium">Contact Name *</Label>
                <Input placeholder="Agent contact name" value={newAgent.name} onChange={(e) => setNewAgent({ ...newAgent, name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Agency Name</Label>
                <Input placeholder="Travel agency name" value={newAgent.agencyName} onChange={(e) => setNewAgent({ ...newAgent, agencyName: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Email *</Label>
                <Input type="email" placeholder="agent@example.com" value={newAgent.email} onChange={(e) => setNewAgent({ ...newAgent, email: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Phone *</Label>
                <Input placeholder="10-digit mobile" value={newAgent.phone} onChange={(e) => setNewAgent({ ...newAgent, phone: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">Password *</Label>
                <Input type="password" placeholder="Login password" value={newAgent.password} onChange={(e) => setNewAgent({ ...newAgent, password: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium">GST Number</Label>
                <Input placeholder="Optional GST number" value={newAgent.gstNumber} onChange={(e) => setNewAgent({ ...newAgent, gstNumber: e.target.value })} />
              </div>
            </div>
            {createAgentError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {createAgentError}
              </p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateAgent(false)}>Cancel</Button>
              <Button onClick={handleCreateAgent}>Create Agent</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={!!deleteAgentId} onOpenChange={(open) => { if (!open) setDeleteAgentId(null); }}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Delete Agent?</DialogTitle>
              <DialogDescription>
                This will permanently remove the agent account. Their past bookings will remain.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteAgentId(null)}>Cancel</Button>
              <Button variant="destructive" onClick={() => deleteAgentId && handleDeleteAgent(deleteAgentId)}>
                Delete Agent
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Main Tabs */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as "agents" | "bookings")}>
          <TabsList className="bg-primary/10 p-1">
            <TabsTrigger value="agents" className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />
              Agents
              {agents.length > 0 && (
                <span className="ml-1 bg-primary text-primary-foreground text-[10px] font-bold rounded-full px-1.5 py-0.5">
                  {agents.length}
                </span>
              )}
              {pendingApproval > 0 && (
                <span className="ml-0.5 bg-amber-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {pendingApproval}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="bookings" className="flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5" />
              Agent Bookings
              {agentBookings.length > 0 && (
                <span className="ml-1 bg-primary text-primary-foreground text-[10px] font-bold rounded-full px-1.5 py-0.5">
                  {agentBookings.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ── Agents Tab ── */}
          <TabsContent value="agents" className="mt-4">
            {/* Filter bar */}
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by agency, email, phone or code…"
                  className="pl-9"
                  value={agentSearch}
                  onChange={(e) => setAgentSearch(e.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | "active" | "pending")}>
                <SelectTrigger className="w-full sm:w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Agents</SelectItem>
                  <SelectItem value="active">Active Only</SelectItem>
                  <SelectItem value="pending">Pending Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {filteredAgents.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground bg-white rounded-xl border">
                <Building2 className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="font-medium">
                  {agents.length === 0 ? "No agents registered yet" : "No agents match your filter"}
                </p>
                <p className="text-sm mt-1">
                  {agents.length === 0 ? 'Click "Add Agent" above or agents can self-register at /signup → "Travel Agent"' : "Try adjusting your search or filter."}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredAgents.map((agent) => {
                  const isExpanded = expandedAgent === agent.id;
                  const bookingCount = countAgentBookings(agent.email);
                  const commissionEarned = sumAgentCommission(agent.email);
                  const agentMkp = agent.agentMarkup;
                  const globalMkp = getAgentMarkupSettings().flights;
                  const globalMkpAmt =
                    globalMkp.type === "percentage"
                      ? Math.round((5000 * globalMkp.value) / 100)
                      : Math.round(globalMkp.value);
                  const normalMkp = getHiddenMarkupAmount(5000, "flights");
                  const effectiveMkp = agentMkp !== undefined ? agentMkp : globalMkpAmt;
                  const commission = Math.max(0, normalMkp - effectiveMkp);

                  return (
                    <div key={agent.id} className="bg-white rounded-xl border shadow-sm overflow-hidden">
                      {/* Agent header row */}
                      <div
                        className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 cursor-pointer hover:bg-muted/20 transition-colors"
                        onClick={() => setExpandedAgent(isExpanded ? null : agent.id)}
                      >
                        {/* Avatar + name */}
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                            <Building2 className="w-5 h-5 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-bold text-sm truncate">
                                {agent.agencyName || agent.name}
                              </p>
                              {agent.isApproved ? (
                                <Badge className="bg-green-100 text-green-700 border-green-200 border text-[10px]">Active</Badge>
                              ) : (
                                <Badge className="bg-amber-100 text-amber-700 border-amber-200 border text-[10px]">Pending</Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground truncate">
                              {agent.name} · {agent.email}
                            </p>
                            <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                              Code: {agent.agentCode} · Phone: {agent.phone || "—"}
                            </p>
                          </div>
                        </div>

                        {/* Quick stats */}
                        <div className="flex items-center gap-4 shrink-0">
                          <div className="text-center">
                            <p className="font-bold text-sm">{bookingCount}</p>
                            <p className="text-[10px] text-muted-foreground">Bookings</p>
                          </div>
                          <div className="text-center">
                            <p className="font-bold text-sm text-emerald-700">
                              ₹{commissionEarned.toLocaleString("en-IN")}
                            </p>
                            <p className="text-[10px] text-muted-foreground">Earned</p>
                          </div>
                          <div className="text-center">
                            <p className="font-bold text-sm text-blue-700">
                              ₹{(agent.walletBalance ?? 0).toLocaleString("en-IN")}
                            </p>
                            <p className="text-[10px] text-muted-foreground">Wallet</p>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                          {agent.isApproved ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600 border-red-200 hover:bg-red-50 gap-1"
                              onClick={() => handleApproveAgent(agent.id, false)}
                            >
                              <ShieldOff className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Deactivate</span>
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              className="bg-green-600 hover:bg-green-700 gap-1"
                              onClick={() => handleApproveAgent(agent.id, true)}
                            >
                              <ShieldCheck className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Approve</span>
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 border-red-200 hover:bg-red-50"
                            onClick={() => setDeleteAgentId(agent.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>

                      {/* Expanded details */}
                      {isExpanded && (
                        <div className="border-t bg-muted/10 p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

                          {/* Wallet top-up */}
                          <div className="space-y-2">
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                              <Wallet className="w-3.5 h-3.5" /> Wallet Balance
                            </p>
                            <p className="text-xl font-bold text-blue-700">
                              ₹{(agent.walletBalance ?? 0).toLocaleString("en-IN")}
                            </p>
                            {topUpAgentId === agent.id ? (
                              <div className="flex gap-2">
                                <Input
                                  type="number"
                                  min="1"
                                  placeholder="Amount ₹"
                                  value={topUpAmount}
                                  onChange={(e) => setTopUpAmount(e.target.value)}
                                  className="h-8 text-sm"
                                  autoFocus
                                />
                                <Button size="sm" className="h-8 bg-blue-600 hover:bg-blue-700" onClick={handleTopUp}>
                                  Add
                                </Button>
                                <Button size="sm" variant="ghost" className="h-8" onClick={() => setTopUpAgentId(null)}>
                                  ✕
                                </Button>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => { setTopUpAgentId(agent.id); setTopUpAmount(""); }}
                                className="gap-1.5"
                              >
                                <Wallet className="w-3.5 h-3.5" /> Top Up Wallet
                              </Button>
                            )}
                          </div>

                          {/* Markup override */}
                          <div className="space-y-2">
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                              <IndianRupee className="w-3.5 h-3.5" /> Markup Override (₹)
                            </p>
                            <div className="flex items-baseline gap-2">
                              <p className="text-lg font-bold text-emerald-700">
                                {agentMkp !== undefined
                                  ? `₹${agentMkp}`
                                  : <span className="text-orange-600 text-sm">Global ({globalMkpAmt > 0 ? `₹${globalMkpAmt}` : "not set"})</span>
                                }
                              </p>
                              <p className="text-xs text-slate-500">vs Customer ₹{normalMkp}</p>
                            </div>
                            {commission > 0 && (
                              <p className="text-xs text-emerald-600 font-semibold">
                                Commission: ₹{commission} per ₹5k booking
                              </p>
                            )}
                            <div className="flex gap-2">
                              <Input
                                type="number"
                                min="0"
                                placeholder={`e.g. ${normalMkp > 0 ? Math.round(normalMkp * 0.7) : 200}`}
                                value={markupEdits[agent.id] ?? ""}
                                onChange={(e) => setMarkupEdits((prev) => ({ ...prev, [agent.id]: e.target.value }))}
                                className="h-8 text-sm w-28"
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                                onClick={() => handleSetAgentMarkup(agent.id)}
                              >
                                Set
                              </Button>
                            </div>
                            <p className="text-[10px] text-muted-foreground">
                              Commission = ₹{normalMkp} − ₹{effectiveMkp} = ₹{commission}
                            </p>
                          </div>

                          {/* Login credentials */}
                          <div className="space-y-2">
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                              <Lock className="w-3.5 h-3.5" /> Login Access
                            </p>
                            <div className="space-y-1 text-sm">
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-muted-foreground">Email</span>
                                <span className="font-mono text-xs">{agent.email}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-muted-foreground">Password</span>
                                <div className="flex items-center gap-1">
                                  <span className="font-mono text-xs">
                                    {showPasswords[agent.id] ? (agent.password || "—") : "••••••••"}
                                  </span>
                                  <button
                                    onClick={() => setShowPasswords((p) => ({ ...p, [agent.id]: !p[agent.id] }))}
                                    className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                                  >
                                    {showPasswords[agent.id] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                  </button>
                                </div>
                              </div>
                            </div>
                            {editingPasswordId === agent.id ? (
                              <div className="flex gap-2">
                                <Input
                                  type="text"
                                  placeholder="New password"
                                  value={newPasswordVal}
                                  onChange={(e) => setNewPasswordVal(e.target.value)}
                                  className="h-8 text-sm"
                                  autoFocus
                                />
                                <Button size="sm" className="h-8" onClick={() => handleChangePassword(agent.id)}>Save</Button>
                                <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditingPasswordId(null)}>✕</Button>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => { setEditingPasswordId(agent.id); setNewPasswordVal(""); }}
                                className="gap-1.5"
                              >
                                <Lock className="w-3.5 h-3.5" /> Change Password
                              </Button>
                            )}
                            <div className="pt-1">
                              <Badge className={cn(
                                "text-[10px]",
                                agent.isApproved
                                  ? "bg-green-100 text-green-700 border-green-200 border"
                                  : "bg-amber-100 text-amber-700 border-amber-200 border"
                              )}>
                                {agent.isApproved ? "Login Enabled" : "Login Disabled (Pending Approval)"}
                              </Badge>
                            </div>
                          </div>

                          {/* Agent details */}
                          <div className="space-y-2 sm:col-span-2 lg:col-span-3 pt-3 border-t">
                            <div className="flex flex-wrap gap-4 text-sm">
                              {agent.gstNumber && (
                                <div>
                                  <span className="text-xs text-muted-foreground">GST: </span>
                                  <span className="font-mono font-medium">{agent.gstNumber}</span>
                                </div>
                              )}
                              {agent.createdAt && (
                                <div>
                                  <span className="text-xs text-muted-foreground">Joined: </span>
                                  <span className="font-medium">{new Date(agent.createdAt).toLocaleDateString("en-IN")}</span>
                                </div>
                              )}
                              <div>
                                <span className="text-xs text-muted-foreground">Total Bookings: </span>
                                <span className="font-bold">{bookingCount}</span>
                              </div>
                              <div>
                                <span className="text-xs text-muted-foreground">Total Commission: </span>
                                <span className="font-bold text-emerald-700">₹{commissionEarned.toLocaleString("en-IN")}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ── Agent Bookings Tab ── */}
          <TabsContent value="bookings" className="mt-4 space-y-4">
            {/* Header with refresh */}
            <div className="flex items-center justify-between">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search agent or passenger…"
                  className="pl-9"
                  value={bookingSearch}
                  onChange={(e) => setBookingSearch(e.target.value)}
                />
              </div>
              <Button size="sm" variant="outline" onClick={fetchBookings} disabled={bookingsLoading} className="gap-1.5 ml-2">
                <RefreshCw className={cn("w-3.5 h-3.5", bookingsLoading && "animate-spin")} />
                {bookingsLoading ? "Loading…" : "Refresh"}
              </Button>
            </div>

            {/* Per-agent summary cards */}
            {agents.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {agents.map((agent) => {
                  const agentBs = adminBookings.filter(
                    (b) =>
                      b.agentEmail === agent.email ||
                      b.details?.agentEmail === agent.email ||
                      b.passengerEmail === agent.email
                  );
                  const agentRevenue = agentBs.reduce((s, b) => s + getAmount(b), 0);
                  const agentComm = agentBs.reduce(
                    (s, b) => s + (b.commissionEarned ? Number(b.commissionEarned) : (b.details?.commissionEarned ?? 0)),
                    0
                  );
                  return (
                    <div key={agent.id} className="bg-white border rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                          <Building2 className="w-4 h-4 text-blue-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate">{agent.agencyName || agent.name}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">{agent.agentCode}</p>
                        </div>
                        <span className={cn(
                          "ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full border",
                          agent.isApproved
                            ? "bg-green-100 text-green-700 border-green-200"
                            : "bg-amber-100 text-amber-700 border-amber-200"
                        )}>
                          {agent.isApproved ? "Active" : "Pending"}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="bg-muted/30 rounded-lg p-2 border">
                          <p className="text-lg font-bold">{agentBs.length}</p>
                          <p className="text-[10px] text-muted-foreground">Bookings</p>
                        </div>
                        <div className="bg-muted/30 rounded-lg p-2 border">
                          <p className="text-sm font-bold text-blue-700">₹{agentRevenue.toLocaleString("en-IN")}</p>
                          <p className="text-[10px] text-muted-foreground">Revenue</p>
                        </div>
                        <div className="bg-muted/30 rounded-lg p-2 border">
                          <p className="text-sm font-bold text-emerald-700">₹{agentComm.toLocaleString("en-IN")}</p>
                          <p className="text-[10px] text-muted-foreground">Comm.</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Bookings table */}
            <Card>
              <CardHeader className="bg-primary text-primary-foreground py-3 px-4">
                <CardTitle className="flex items-center gap-2 text-base">
                  <BookOpen className="w-4 h-4" />
                  All Agent Bookings
                  <span className="text-sm font-normal opacity-80">({agentBookings.length})</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {bookingsLoading && agentBookings.length === 0 ? (
                  <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin" /> Loading…
                  </div>
                ) : agentBookings.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Building2 className="w-10 h-10 mx-auto mb-3 opacity-20" />
                    <p className="font-medium">No agent bookings yet</p>
                    <p className="text-sm mt-1">Bookings made by approved B2B agents will appear here</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground whitespace-nowrap">Booking ID</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Agent</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Passenger</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Type</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">Date</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground whitespace-nowrap">Total</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-emerald-700 whitespace-nowrap">Commission</th>
                          <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {(bookingSearch
                          ? agentBookings.filter((b) => {
                              const q = bookingSearch.toLowerCase();
                              return (
                                (b.passengerName || b.customerName || "").toLowerCase().includes(q) ||
                                (b.agentEmail || b.details?.agentEmail || "").toLowerCase().includes(q) ||
                                (b.agentCode || b.details?.agentCode || "").toLowerCase().includes(q) ||
                                (b.id || "").toString().includes(q)
                              );
                            })
                          : agentBookings
                        ).map((b, i) => {
                          const agentEmail = b.agentEmail || b.details?.agentEmail || "";
                          const agentCode = b.agentCode || b.details?.agentCode || "";
                          const agentObj = agents.find((a) => a.email === agentEmail);
                          const commission = b.commissionEarned
                            ? Number(b.commissionEarned)
                            : (b.details?.commissionEarned ?? 0);
                          const rawStatus = b.status || b.paymentStatus || "confirmed";
                          const statusCls =
                            rawStatus === "confirmed" || rawStatus === "paid"
                              ? "bg-green-50 text-green-700 border-green-200"
                              : rawStatus === "cancelled"
                              ? "bg-red-50 text-red-700 border-red-200"
                              : "bg-amber-50 text-amber-700 border-amber-200";

                          return (
                            <tr key={b.id ?? i} className="hover:bg-muted/20 transition-colors">
                              <td className="px-4 py-3 whitespace-nowrap">
                                <span className="font-mono text-xs bg-primary/10 text-primary px-2 py-1 rounded font-semibold">
                                  {b.details?.bookingRef || b.bookingRef || b.bookingId || `#${b.id}`}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <p className="font-semibold text-xs">{agentObj?.agencyName || agentObj?.name || agentEmail || "—"}</p>
                                <p className="text-[10px] font-mono text-blue-600">{agentCode}</p>
                              </td>
                              <td className="px-4 py-3">
                                <p className="font-medium text-xs">{b.passengerName || b.customerName || b.details?.customerName || "—"}</p>
                                <p className="text-[10px] text-muted-foreground">{b.passengerEmail || b.customerEmail || ""}</p>
                              </td>
                              <td className="px-4 py-3">
                                <span className="capitalize text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                                  {b.bookingType || b.type || "flight"}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                                {getBookingDate(b) || "—"}
                              </td>
                              <td className="px-4 py-3 text-right font-bold text-sm">
                                ₹{getAmount(b).toLocaleString("en-IN")}
                              </td>
                              <td className="px-4 py-3 text-right font-bold text-emerald-600 text-sm">
                                {commission > 0 ? `₹${commission.toLocaleString("en-IN")}` : "—"}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize", statusCls)}>
                                  {rawStatus}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      {agentBookings.length > 0 && (
                        <tfoot className="bg-muted/30 border-t-2">
                          <tr>
                            <td colSpan={5} className="px-4 py-3 font-semibold text-sm">
                              Totals ({agentBookings.length} bookings)
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-sm">
                              ₹{totalRevenue.toLocaleString("en-IN")}
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-emerald-600 text-sm">
                              ₹{totalCommission.toLocaleString("en-IN")}
                            </td>
                            <td />
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
