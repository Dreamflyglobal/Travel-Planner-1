import { useState, useEffect, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { creditWallet } from "@/lib/wallet";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { 
  Plane, 
  Bus, 
  Building2, 
  Map, 
  CreditCard, 
  Users, 
  TrendingUp,
  Clock,
  CheckCircle,
  XCircle,
  Settings,
  Package,
  Tag,
  FileText,
  Plus,
  Trash2,
  Calendar,
  Percent,
  IndianRupee,
  Wallet,
  ShieldCheck,
  ShieldOff,
  ShieldAlert,
  Search,
  RefreshCw,
  BookOpen,
  ArrowRight,
  Download,
  BarChart2,
  Phone,
  MessageSquare,
  Sparkles,
  CheckCircle2,
  Bell,
  Send,
  Smartphone,
} from "lucide-react";
import { getMarkupSettings, saveMarkupSettings, getHiddenMarkupSettings, saveHiddenMarkupSettings, getHiddenMarkupAmount, getAgentMarkupSettings, saveAgentMarkupSettings, type MarkupSettings, type MarkupConfig } from "@/lib/pricing";
import { getAllStaffBookings } from "@/lib/staff-data";
import { getLeads, getEnquiries, updateEnquiryStatus, updateLeadStatus, type HolidayLead, type HolidayEnquiry, type LeadStatus } from "@/lib/holiday-data";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
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
import { Textarea } from "@/components/ui/textarea";

interface AgentUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  agencyName?: string;
  agentCode?: string;
  walletBalance?: number;
  commission?: number;     // legacy %
  agentMarkup?: number;    // new: flat ₹ markup — lower than B2C hidden markup
  isApproved?: boolean;
  createdAt?: string;
}

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
    const all = mergeAllBookings();
    return all.filter((b) => b.agentEmail === agentEmail || b.passengerEmail === agentEmail || b.details?.agentEmail === agentEmail).length;
  } catch { return 0; }
}

function sumAgentCommission(agentEmail: string): number {
  try {
    const all = mergeAllBookings();
    return all
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
      // Also update current session if it's this agent
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

export default function AdminDashboard() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState(() =>
    location === "/master-admin/agents" ? "agents" : "bookings"
  );
  const [showRevenueModal, setShowRevenueModal] = useState(false);
  const [showProfitModal, setShowProfitModal] = useState(false);

  // ── Convenience Fee settings state (VISIBLE to customers) ─────────────────
  const [markup, setMarkup] = useState<MarkupSettings>(() => getMarkupSettings());
  const [markupDraft, setMarkupDraft] = useState<MarkupSettings>(() => getMarkupSettings());

  const handleSaveMarkup = () => {
    saveMarkupSettings(markupDraft);
    setMarkup(markupDraft);
    toast({ title: "Convenience Fee settings saved!", description: "Visible fee updated across all services." });
  };

  // ── Customer Markup settings state (INTERNAL profit — never shown to customers)
  const [hiddenMarkup, setHiddenMarkup] = useState<MarkupSettings>(() => getHiddenMarkupSettings());
  const [hiddenMarkupDraft, setHiddenMarkupDraft] = useState<MarkupSettings>(() => getHiddenMarkupSettings());

  const handleSaveHiddenMarkup = () => {
    saveHiddenMarkupSettings(hiddenMarkupDraft);
    setHiddenMarkup(hiddenMarkupDraft);
    toast({ title: "Customer markup saved!", description: "Customer pricing updated across all services." });
  };

  // ── Global Agent Markup settings state (B2B — lower than customer markup)
  const [agentMarkup, setAgentMarkup] = useState<MarkupSettings>(() => getAgentMarkupSettings());
  const [agentMarkupDraft, setAgentMarkupDraft] = useState<MarkupSettings>(() => getAgentMarkupSettings());

  const handleSaveAgentMarkup = () => {
    saveAgentMarkupSettings(agentMarkupDraft);
    setAgentMarkup(agentMarkupDraft);
    toast({ title: "Agent markup saved!", description: "Global agent pricing updated across all services." });
  };

  // ── Agents state ──────────────────────────────────────────────────────────
  const [agents, setAgents] = useState<AgentUser[]>([]);
  const [topUpAgentId, setTopUpAgentId] = useState<string | null>(null);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [markupEdits, setMarkupEdits] = useState<Record<string, string>>({});

  // Create Agent form state
  const [showCreateAgent, setShowCreateAgent] = useState(false);
  const [newAgent, setNewAgent] = useState({ name: "", email: "", phone: "", password: "", agencyName: "", gstNumber: "" });
  const [createAgentError, setCreateAgentError] = useState("");

  const refreshAgents = () => setAgents(loadAgents());

  const handleApproveAgent = (id: string, approve: boolean) => {
    saveAgentField(id, { isApproved: approve });
    refreshAgents();
    toast({ title: approve ? "Agent approved" : "Agent deactivated" });
  };

  const handleSetAgentMarkup = (id: string) => {
    const val = parseFloat(markupEdits[id] ?? "");
    if (isNaN(val) || val < 0) {
      toast({ title: "Invalid markup", description: "Enter a valid ₹ amount (0 or greater)", variant: "destructive" });
      return;
    }
    saveAgentField(id, { agentMarkup: val });
    refreshAgents();
    toast({ title: "Agent markup updated", description: `Agent markup set to ₹${val}` });
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
    const agent = {
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
    toast({ title: "Agent created!", description: `${agent.agencyName} (${agent.agentCode}) — approve them to activate.` });
  };

  const handleTopUp = () => {
    if (!topUpAgentId) return;
    const amount = parseFloat(topUpAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: "Invalid amount", variant: "destructive" });
      return;
    }
    const agent = agents.find((a) => a.id === topUpAgentId);
    const newBalance = creditWallet(topUpAgentId, amount, `Admin top-up by admin`);
    saveAgentField(topUpAgentId, { walletBalance: newBalance });
    refreshAgents();
    setTopUpAgentId(null);
    setTopUpAmount("");
    toast({ title: `₹${amount.toLocaleString("en-IN")} added to ${agent?.name ?? "agent"}'s wallet` });
  };

  // Coupon state
  const [coupons, setCoupons] = useState<Array<{
    code: string;
    discount: number;
    discountType: "fixed" | "percentage";
    type: "public" | "welcome" | "user_specific";
    allowed_phone?: string;
    used_by?: string[];
    validUntil: string;
    firstTimeOnly?: boolean;
    usageLimit?: number;
    minBookingAmount?: number;
    service_type?: "flight" | "bus" | "hotel" | "holiday";
    flight_type?: "domestic" | "international";
    airline?: string;
    description?: string;
  }>>([]);
  const [newCoupon, setNewCoupon] = useState({
    code: "",
    discount: "",
    discountType: "fixed" as "fixed" | "percentage",
    type: "public" as "public" | "welcome" | "user_specific",
    allowed_phone: "",
    validUntil: "",
    firstTimeOnly: false,
    usageLimit: "",
    minBookingAmount: "",
    service_type: "" as "" | "flight" | "bus" | "hotel" | "holiday",
    flight_type: "" as "" | "domestic" | "international",
    airline: "",
    description: "",
  });
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [couponToDelete, setCouponToDelete] = useState<string | null>(null);

  // Package state
  const [packages, setPackages] = useState<Array<{
    id: string;
    name: string;
    description: string;
    price: number;
    duration: string;
    destination: string;
  }>>([]);
  const [showPackageDialog, setShowPackageDialog] = useState(false);
  const [newPackage, setNewPackage] = useState({
    name: "",
    description: "",
    price: "",
    duration: "",
    destination: ""
  });
  const [showDeletePackageDialog, setShowDeletePackageDialog] = useState(false);
  const [packageToDelete, setPackageToDelete] = useState<string | null>(null);

  // Load coupons, packages, and agents from localStorage
  useEffect(() => {
    const savedCoupons = localStorage.getItem("coupons");
    if (savedCoupons) {
      try {
        setCoupons(JSON.parse(savedCoupons));
      } catch (e) {
        console.error("Error loading coupons:", e);
        setCoupons([]);
      }
    }

    const savedPackages = localStorage.getItem("packages");
    if (savedPackages) {
      try {
        setPackages(JSON.parse(savedPackages));
      } catch (e) {
        console.error("Error loading packages:", e);
        setPackages([]);
      }
    }

    refreshAgents();
  }, []);

  // Save coupons to localStorage
  const saveCoupons = (updatedCoupons: typeof coupons) => {
    localStorage.setItem("coupons", JSON.stringify(updatedCoupons));
    setCoupons(updatedCoupons);
  };

  // Add new coupon
  const handleAddCoupon = () => {
    const code = newCoupon.code.trim().toUpperCase();
    const discount = parseFloat(newCoupon.discount);
    const validUntil = newCoupon.validUntil;

    if (!code) {
      toast({
        variant: "destructive",
        title: "Invalid Coupon Code",
        description: "Please enter a coupon code.",
      });
      return;
    }

    if (isNaN(discount) || discount <= 0) {
      toast({
        variant: "destructive",
        title: "Invalid Discount",
        description: "Please enter a valid discount amount greater than 0.",
      });
      return;
    }

    if (newCoupon.discountType === "percentage" && discount > 100) {
      toast({
        variant: "destructive",
        title: "Invalid Percentage",
        description: "Percentage discount cannot exceed 100%.",
      });
      return;
    }

    if (!validUntil) {
      toast({
        variant: "destructive",
        title: "Invalid Expiry Date",
        description: "Please select an expiry date.",
      });
      return;
    }

    if (coupons.some(c => c.code === code)) {
      toast({
        variant: "destructive",
        title: "Duplicate Coupon",
        description: `Coupon code "${code}" already exists.`,
      });
      return;
    }

    if (newCoupon.type === "user_specific" && !newCoupon.allowed_phone.trim()) {
      toast({
        variant: "destructive",
        title: "Phone Required",
        description: "Please enter the customer's phone number for a user-specific coupon.",
      });
      return;
    }

    const updatedCoupons = [
      ...coupons,
      {
        code,
        discount,
        discountType: newCoupon.discountType,
        type: newCoupon.type,
        allowed_phone: newCoupon.type === "user_specific" ? newCoupon.allowed_phone.trim() : undefined,
        used_by: [],
        validUntil,
        firstTimeOnly: newCoupon.type === "welcome",
        usageLimit: newCoupon.usageLimit ? parseInt(newCoupon.usageLimit) : 0,
        minBookingAmount: newCoupon.minBookingAmount ? parseFloat(newCoupon.minBookingAmount) : 0,
        service_type: newCoupon.service_type || undefined,
        flight_type: newCoupon.service_type === "flight" && newCoupon.flight_type ? newCoupon.flight_type : undefined,
        airline: newCoupon.service_type === "flight" && newCoupon.airline.trim() ? newCoupon.airline.trim() : undefined,
        description: newCoupon.description.trim() || undefined,
      }
    ];

    saveCoupons(updatedCoupons);

    toast({
      title: "Coupon Added Successfully!",
      description: `Coupon "${code}" has been created.`,
    });

    setNewCoupon({
      code: "",
      discount: "",
      discountType: "fixed",
      type: "public",
      allowed_phone: "",
      validUntil: "",
      service_type: "",
      flight_type: "",
      airline: "",
      firstTimeOnly: false,
      usageLimit: "",
      minBookingAmount: "",
      description: "",
    });
  };

  // Delete coupon
  const handleDeleteCoupon = (code: string) => {
    setCouponToDelete(code);
    setShowDeleteDialog(true);
  };

  const confirmDeleteCoupon = () => {
    if (!couponToDelete) return;

    const updatedCoupons = coupons.filter(c => c.code !== couponToDelete);
    saveCoupons(updatedCoupons);

    toast({
      title: "Coupon Deleted",
      description: `Coupon "${couponToDelete}" has been removed.`,
    });

    setShowDeleteDialog(false);
    setCouponToDelete(null);
  };

  // Check if coupon is expired
  const isCouponExpired = (validUntil: string) => {
    const expiryDate = new Date(validUntil);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return expiryDate < today;
  };

  // Package Management Functions
  const handleAddPackage = () => {
    const name = newPackage.name.trim();
    const description = newPackage.description.trim();
    const price = parseFloat(newPackage.price);
    const duration = newPackage.duration.trim();
    const destination = newPackage.destination.trim();

    if (!name) {
      toast({
        variant: "destructive",
        title: "Invalid Package Name",
        description: "Please enter a package name.",
      });
      return;
    }

    if (!description) {
      toast({
        variant: "destructive",
        title: "Invalid Description",
        description: "Please enter a package description.",
      });
      return;
    }

    if (isNaN(price) || price <= 0) {
      toast({
        variant: "destructive",
        title: "Invalid Price",
        description: "Please enter a valid price greater than 0.",
      });
      return;
    }

    if (!duration) {
      toast({
        variant: "destructive",
        title: "Invalid Duration",
        description: "Please enter package duration (e.g., 5 Days 4 Nights).",
      });
      return;
    }

    if (!destination) {
      toast({
        variant: "destructive",
        title: "Invalid Destination",
        description: "Please enter a destination.",
      });
      return;
    }

    const newPackageData = {
      id: `PKG-${Date.now()}`,
      name,
      description,
      price,
      duration,
      destination
    };

    const updatedPackages = [...packages, newPackageData];
    setPackages(updatedPackages);
    localStorage.setItem("packages", JSON.stringify(updatedPackages));

    toast({
      title: "Package Added Successfully!",
      description: `Package "${name}" has been created.`,
    });

    setNewPackage({
      name: "",
      description: "",
      price: "",
      duration: "",
      destination: ""
    });
    setShowPackageDialog(false);
  };

  const handleDeletePackage = (id: string) => {
    setPackageToDelete(id);
    setShowDeletePackageDialog(true);
  };

  const confirmDeletePackage = () => {
    if (!packageToDelete) return;

    const updatedPackages = packages.filter(p => p.id !== packageToDelete);
    setPackages(updatedPackages);
    localStorage.setItem("packages", JSON.stringify(updatedPackages));

    const deletedPackage = packages.find(p => p.id === packageToDelete);
    toast({
      title: "Package Deleted",
      description: `Package "${deletedPackage?.name}" has been removed.`,
    });

    setShowDeletePackageDialog(false);
    setPackageToDelete(null);
  };

  // ── Admin Bookings ─────────────────────────────────────────────────────────
  const [adminBookings, setAdminBookings] = useState<any[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [bookingSearch, setBookingSearch] = useState("");
  const [bookingStatusFilter, setBookingStatusFilter] = useState("all");
  const [bookingTypeFilter, setBookingTypeFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo]   = useState("");

  // ── Holiday Leads & Enquiries ──────────────────────────────────────────────
  const [holidayLeads,     setHolidayLeads]     = useState<HolidayLead[]>([]);
  const [holidayEnquiries, setHolidayEnquiries] = useState<HolidayEnquiry[]>([]);
  const [leadsLoaded,      setLeadsLoaded]      = useState(false);
  const [enqLoaded,        setEnqLoaded]        = useState(false);

  // Follow-up state
  const [followupLogs,     setFollowupLogs]     = useState<Record<string, any[]>>({});
  const [expandedLead,     setExpandedLead]     = useState<string | null>(null);
  const [fuSettings,       setFuSettings]       = useState<{
    enabled: boolean; msg10min: string; msg2hr: string; msg24hr: string;
  } | null>(null);
  const [fuEditing,        setFuEditing]        = useState(false);
  const [fuDraft,          setFuDraft]          = useState<typeof fuSettings>(null);
  const [fuSaving,         setFuSaving]         = useState(false);

  function loadLeads() {
    setHolidayLeads(getLeads());
    setLeadsLoaded(true);
  }
  function loadEnquiries() {
    setHolidayEnquiries(getEnquiries());
    setEnqLoaded(true);
  }
  function changeEnqStatus(id: string, status: HolidayEnquiry["status"]) {
    updateEnquiryStatus(id, status);
    setHolidayEnquiries(getEnquiries());
  }

  async function changeLeadStatus(lead: HolidayLead, status: LeadStatus) {
    updateLeadStatus(lead.id, status);
    setHolidayLeads(getLeads());
    // Cancel follow-ups when lead moves to booked or contacted
    if (status === "booked" || status === "contacted") {
      fetch("/api/followup/cancel", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ leadId: lead.id }),
      }).catch(() => {});
    }
  }

  async function loadFollowupLog(leadId: string) {
    if (followupLogs[leadId]) { setExpandedLead(prev => prev === leadId ? null : leadId); return; }
    try {
      const res  = await fetch(`/api/followup/log?leadId=${encodeURIComponent(leadId)}`);
      const data = await res.json();
      setFollowupLogs(prev => ({ ...prev, [leadId]: Array.isArray(data) ? data : [] }));
      setExpandedLead(leadId);
    } catch { setFollowupLogs(prev => ({ ...prev, [leadId]: [] })); setExpandedLead(leadId); }
  }

  async function loadFuSettings() {
    try {
      const res  = await fetch("/api/followup/settings");
      const data = await res.json();
      setFuSettings(data);
    } catch { /* ignore */ }
  }

  async function saveFuSettings() {
    if (!fuDraft) return;
    setFuSaving(true);
    try {
      const res  = await fetch("/api/followup/settings", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(fuDraft),
      });
      const data = await res.json();
      setFuSettings(data.settings ?? fuDraft);
      setFuEditing(false);
      toast({ title: "Follow-up settings saved ✓" });
    } catch { toast({ title: "Save failed", variant: "destructive" }); }
    finally  { setFuSaving(false); }
  }

  const fetchAdminBookings = useCallback(async () => {
    setBookingsLoading(true);
    try {
      const res = await fetch("/api/bookings");
      if (res.ok) {
        const data = await res.json();
        setAdminBookings(Array.isArray(data) ? data : []);
      }
    } catch {
      /* silent */
    } finally {
      setBookingsLoading(false);
    }
  }, []);

  // Fetch on mount + poll every 30 seconds for real-time updates
  useEffect(() => {
    fetchAdminBookings();
    const interval = setInterval(fetchAdminBookings, 30_000);
    return () => clearInterval(interval);
  }, [fetchAdminBookings]);

  // Helper: extract raw API base (before markup) from a booking record
  const getRawBase = (b: any): number =>
    b.details?.rawBaseAmount ?? b.rawBaseAmount ?? 0;

  // Helper: extract hidden markup amount
  const getMarkupProfit = (b: any): number =>
    b.details?.markupAmount ?? b.markupAmount ?? 0;

  // Helper: extract visible convenience fee
  const getFeeProfit = (b: any): number =>
    b.details?.convenienceFee ?? b.convenienceFee ?? 0;

  // Total profit per booking = hidden markup + convenience fee
  const getFee = (b: any): number =>
    getMarkupProfit(b) + getFeeProfit(b);

  const getBaseAmt = (b: any): number =>
    b.details?.baseAmount ?? b.baseAmount ?? 0;

  const getAmount = (b: any): number =>
    b.amount ?? b.details?.amount ?? b.totalPrice ?? 0;

  const getBookingDate = (b: any): string =>
    b.details?.createdAt?.slice(0, 10) ?? b.createdAt?.slice(0, 10) ?? b.travelDate ?? "";

  // Today string
  const todayStr = new Date().toISOString().slice(0, 10);

  // Helper: extract agent commission from a booking
  const getAgentCommission = (b: any): number =>
    Number(b.commissionEarned) || Number(b.details?.commissionEarned) || 0;

  // Current month string e.g. "2025-04"
  const thisMonthStr = new Date().toISOString().slice(0, 7);

  // Helper: determine booking role ("agent" | "staff" | "customer")
  const getBookingRole = (b: any): "agent" | "staff" | "customer" => {
    const role = b.details?.bookedByRole;
    if (role === "agent" || b.details?.agentId) return "agent";
    if (role === "staff" || b.details?.staffId) return "staff";
    return "customer";
  };

  // Derived stats from real booking data
  const stats = useMemo(() => {
    const totalRevenue           = adminBookings.reduce((sum, b) => sum + getAmount(b), 0);
    const totalProfit            = adminBookings.reduce((sum, b) => sum + getFee(b), 0);
    const totalAgentCommission   = adminBookings.reduce((sum, b) => sum + getAgentCommission(b), 0);
    const todayBookings          = adminBookings.filter((b) => getBookingDate(b) === todayStr);
    const thisMonthBookings      = adminBookings.filter((b) => getBookingDate(b).startsWith(thisMonthStr));

    // Split by who made the booking
    const customerBks = adminBookings.filter((b) => getBookingRole(b) === "customer");
    const agentBks    = adminBookings.filter((b) => getBookingRole(b) === "agent");
    const staffBks    = adminBookings.filter((b) => getBookingRole(b) === "staff");

    // Admin profit from each segment
    // - Customer: keeps full customerMarkup + convFee (markupAmount stores customerMarkup)
    // - Agent: keeps only agentMarkup + convFee (markupAmount already stores the lower amount)
    // - Staff: keeps full customerMarkup + convFee (same as customer)
    const customerProfit   = customerBks.reduce((s, b) => s + getFee(b), 0);
    const agentAdminMargin = agentBks.reduce((s, b) => s + getFee(b), 0);
    const staffAdminProfit = staffBks.reduce((s, b) => s + getFee(b), 0);

    // Agent commission = what agents earn (they paid less than B2C, that gap is their margin)
    const agentCommission  = totalAgentCommission;

    // Staff incentive total = from staff_bookings records (paid out to staff)
    const allStaffBks      = getAllStaffBookings();
    const staffIncentiveTotal = allStaffBks.reduce((s, b) => s + b.incentive, 0);

    // Net admin profit = total collected markup/fee - staff incentives paid out
    // (agent commission is already excluded since agent bookings store lower markupAmount)
    const netProfit = totalProfit - staffIncentiveTotal;

    return {
      totalBookings:       adminBookings.length,
      todayBookings:       todayBookings.length,
      flightBookings:      adminBookings.filter((b) => (b.bookingType || b.type) === "flight").length,
      hotelBookings:       adminBookings.filter((b) => (b.bookingType || b.type) === "hotel").length,
      holidayBookings:     adminBookings.filter((b) => (b.bookingType || b.type) === "package").length,
      busBookings:         adminBookings.filter((b) => (b.bookingType || b.type) === "bus").length,
      totalRevenue,
      todayRevenue:        todayBookings.reduce((sum, b) => sum + getAmount(b), 0),
      thisMonthRevenue:    thisMonthBookings.reduce((sum, b) => sum + getAmount(b), 0),
      totalProfit,
      markupProfit:        adminBookings.reduce((sum, b) => sum + getMarkupProfit(b), 0),
      feeProfit:           adminBookings.reduce((sum, b) => sum + getFeeProfit(b), 0),
      totalAgentCommission,
      // Role-split profit breakdown
      customerBookings:    customerBks.length,
      agentBookings:       agentBks.length,
      staffBookings:       staffBks.length,
      customerProfit,
      agentAdminMargin,
      staffAdminProfit,
      agentCommission,
      staffIncentiveTotal,
      netProfit,
      profitByService: {
        flights:  adminBookings.filter((b) => (b.bookingType || b.type) === "flight").reduce((s, b) => s + getFee(b), 0),
        hotels:   adminBookings.filter((b) => (b.bookingType || b.type) === "hotel").reduce((s, b) => s + getFee(b), 0),
        buses:    adminBookings.filter((b) => (b.bookingType || b.type) === "bus").reduce((s, b) => s + getFee(b), 0),
        packages: adminBookings.filter((b) => (b.bookingType || b.type) === "package").reduce((s, b) => s + getFee(b), 0),
      },
      commissionByService: {
        flights:  adminBookings.filter((b) => (b.bookingType || b.type) === "flight").reduce((s, b) => s + getAgentCommission(b), 0),
        hotels:   adminBookings.filter((b) => (b.bookingType || b.type) === "hotel").reduce((s, b) => s + getAgentCommission(b), 0),
        buses:    adminBookings.filter((b) => (b.bookingType || b.type) === "bus").reduce((s, b) => s + getAgentCommission(b), 0),
        packages: adminBookings.filter((b) => (b.bookingType || b.type) === "package").reduce((s, b) => s + getAgentCommission(b), 0),
      },
    };
  }, [adminBookings]);

  // ── Chart data: last 14 days ────────────────────────────────────────────────
  const chartData = useMemo(() => {
    const days: { date: string; label: string; bookings: number; revenue: number; profit: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key   = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
      const dayBs = adminBookings.filter((b) => getBookingDate(b) === key);
      days.push({
        date:     key,
        label,
        bookings: dayBs.length,
        revenue:  dayBs.reduce((s, b) => s + getAmount(b), 0),
        profit:   dayBs.reduce((s, b) => s + getFee(b), 0),
      });
    }
    return days;
  }, [adminBookings]);

  // ── CSV Export ──────────────────────────────────────────────────────────────
  const handleExportCSV = () => {
    const rows = [
      ["Booking ID","Customer","Phone","Email","Type","Route","Date","Base Price","Conv. Fee","Total","Status"],
      ...filteredBookings.map((b) => {
        const fi = b.details?.flightInfo || {};
        const route = fi.from && fi.to ? `${fi.from} → ${fi.to}` : (b.bookingType || b.type || "");
        return [
          b.details?.bookingRef || b.bookingId || b.id,
          b.customerName || b.passengerName || "",
          b.customerPhone || b.passengerPhone || b.details?.customerPhone || "",
          b.customerEmail || b.passengerEmail || "",
          b.bookingType || b.type || "",
          route,
          getBookingDate(b),
          getBaseAmt(b),
          getFee(b),
          getAmount(b),
          b.status || b.details?.status || "paid",
        ];
      }),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `dream-fly-global-bookings-${todayStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "CSV exported!", description: `${filteredBookings.length} bookings downloaded.` });
  };

  // ── Filtered bookings for the table ────────────────────────────────────────
  const filteredBookings = useMemo(() => adminBookings.filter((b) => {
    const name    = (b.customerName || b.passengerName || "").toLowerCase();
    const email   = (b.customerEmail || b.passengerEmail || "").toLowerCase();
    const id      = (b.bookingId || b.id || "").toString().toLowerCase();
    const phone   = (b.customerPhone || b.passengerPhone || b.details?.customerPhone || "").toLowerCase();
    const q       = bookingSearch.toLowerCase();
    const matchQ  = !q || name.includes(q) || email.includes(q) || id.includes(q) || phone.includes(q);
    const status  = b.status || b.paymentStatus || "paid";
    const matchSt = bookingStatusFilter === "all" || status === bookingStatusFilter;
    const type    = b.bookingType || b.type || "flight";
    const matchTy = bookingTypeFilter === "all" || type === bookingTypeFilter;
    const bDate   = getBookingDate(b);
    const matchDf = !dateFrom || bDate >= dateFrom;
    const matchDt = !dateTo   || bDate <= dateTo;
    return matchQ && matchSt && matchTy && matchDf && matchDt;
  }), [adminBookings, bookingSearch, bookingStatusFilter, bookingTypeFilter, dateFrom, dateTo]);

  return (
    <AdminLayout>
      <div className="min-h-screen bg-muted/30">
        {/* Revenue Detail Modal */}
        <Dialog open={showRevenueModal} onOpenChange={setShowRevenueModal}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg">
                <TrendingUp className="w-5 h-5 text-orange-500" />
                Revenue Breakdown
              </DialogTitle>
              <DialogDescription>Gross revenue collected across all bookings</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="flex justify-between items-center p-4 bg-blue-50 rounded-xl border border-blue-100">
                <div>
                  <p className="text-sm font-medium text-blue-700">Today's Revenue</p>
                  <p className="text-xs text-blue-500">{new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
                </div>
                <p className="text-2xl font-bold text-blue-700">₹{stats.todayRevenue.toLocaleString("en-IN")}</p>
              </div>
              <div className="flex justify-between items-center p-4 bg-orange-50 rounded-xl border border-orange-100">
                <div>
                  <p className="text-sm font-medium text-orange-700">This Month's Revenue</p>
                  <p className="text-xs text-orange-500">{new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</p>
                </div>
                <p className="text-2xl font-bold text-orange-700">₹{stats.thisMonthRevenue.toLocaleString("en-IN")}</p>
              </div>
              <div className="flex justify-between items-center p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                <div>
                  <p className="text-sm font-medium text-emerald-700">Total Revenue (All Time)</p>
                  <p className="text-xs text-emerald-500">All bookings combined</p>
                </div>
                <p className="text-2xl font-bold text-emerald-700">₹{stats.totalRevenue.toLocaleString("en-IN")}</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowRevenueModal(false)}>Close</Button>
              <Button onClick={() => { setShowRevenueModal(false); setActiveTab("analytics"); }}>
                View Analytics
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Profit Detail Modal */}
        <Dialog open={showProfitModal} onOpenChange={setShowProfitModal}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg">
                <IndianRupee className="w-5 h-5 text-emerald-600" />
                Profit Breakdown by User Type
              </DialogTitle>
              <DialogDescription>How profit is split across customers, agents, and staff</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              {/* Customer segment */}
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 space-y-1.5">
                <p className="text-xs font-bold text-blue-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" /> Customer Bookings ({stats.customerBookings})
                </p>
                <div className="flex justify-between text-sm text-blue-600">
                  <span>Markup profit</span>
                  <span>₹{stats.customerProfit.toLocaleString("en-IN")}</span>
                </div>
                <p className="text-xs text-blue-400">Full customer markup + convenience fee kept by admin</p>
              </div>
              {/* Agent segment */}
              <div className="rounded-xl border border-orange-200 bg-orange-50 p-3 space-y-1.5">
                <p className="text-xs font-bold text-orange-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" /> Agent Bookings ({stats.agentBookings})
                </p>
                <div className="flex justify-between text-sm text-orange-700">
                  <span>Admin margin (lower markup kept)</span>
                  <span>₹{stats.agentAdminMargin.toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between text-sm text-orange-500">
                  <span>Agent commission (their earnings)</span>
                  <span>₹{stats.agentCommission.toLocaleString("en-IN")}</span>
                </div>
                <p className="text-xs text-orange-400">Admin earns agentMarkup; agent earns the difference from B2C price</p>
              </div>
              {/* Staff segment */}
              <div className="rounded-xl border border-purple-200 bg-purple-50 p-3 space-y-1.5">
                <p className="text-xs font-bold text-purple-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5" /> Staff Bookings ({stats.staffBookings})
                </p>
                <div className="flex justify-between text-sm text-purple-700">
                  <span>Admin profit (full markup)</span>
                  <span>₹{stats.staffAdminProfit.toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between text-sm text-purple-500">
                  <span>Staff incentive (paid out)</span>
                  <span>−₹{stats.staffIncentiveTotal.toLocaleString("en-IN")}</span>
                </div>
                <p className="text-xs text-purple-400">Staff earns fixed + % incentive; admin keeps the rest</p>
              </div>
              {/* Net */}
              <div className="flex justify-between items-center p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                <div>
                  <p className="text-sm font-semibold text-emerald-800">Net Admin Profit</p>
                  <p className="text-xs text-emerald-600">Total markup/fee collected − staff incentives</p>
                </div>
                <p className="text-2xl font-extrabold text-emerald-800">₹{stats.netProfit.toLocaleString("en-IN")}</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowProfitModal(false)}>Close</Button>
              <Button onClick={() => { setShowProfitModal(false); setLocation("/admin/profit"); }}>
                Full Report
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Header */}
        <div className="bg-primary text-primary-foreground py-6 px-6 shadow-lg">
          <div className="container mx-auto flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-primary-foreground/20 flex items-center justify-center shrink-0">
              <Settings className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">Admin Dashboard</h1>
              <p className="text-primary-foreground/80 text-sm">Manage bookings, coupons, and more</p>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-6 py-8">

          {/* ── Summary Cards Row 1: Bookings + Revenue ──────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <Card
              className="bg-gradient-to-br from-violet-600 to-purple-700 text-white border-0 shadow-lg cursor-pointer hover:shadow-xl hover:scale-[1.02] transition-all"
              onClick={() => setActiveTab("bookings")}
            >
              <CardContent className="p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                  <BookOpen className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs font-medium opacity-80 uppercase tracking-wider">Total Bookings</p>
                  <p className="text-3xl font-bold leading-tight">{stats.totalBookings}</p>
                  <p className="text-xs opacity-70">Click to view all</p>
                </div>
              </CardContent>
            </Card>

            <Card
              className="bg-gradient-to-br from-orange-500 to-red-500 text-white border-0 shadow-lg cursor-pointer hover:shadow-xl hover:scale-[1.02] transition-all"
              onClick={() => setShowRevenueModal(true)}
            >
              <CardContent className="p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                  <TrendingUp className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs font-medium opacity-80 uppercase tracking-wider">Total Revenue</p>
                  <p className="text-2xl font-bold leading-tight">₹{stats.totalRevenue.toLocaleString("en-IN")}</p>
                  <p className="text-xs opacity-70">Click for breakdown</p>
                </div>
              </CardContent>
            </Card>

            <Card
              className="bg-gradient-to-br from-emerald-500 to-green-600 text-white border-0 shadow-lg cursor-pointer hover:shadow-xl hover:scale-[1.02] transition-all"
              onClick={() => setLocation("/admin/profit")}
            >
              <CardContent className="p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                  <IndianRupee className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs font-medium opacity-80 uppercase tracking-wider">Total Profit</p>
                  <p className="text-2xl font-bold leading-tight">₹{stats.totalProfit.toLocaleString("en-IN")}</p>
                  <p className="text-xs opacity-70">Click for breakdown</p>
                </div>
              </CardContent>
            </Card>

            <Card
              className="bg-gradient-to-br from-blue-500 to-cyan-600 text-white border-0 shadow-lg cursor-pointer hover:shadow-xl hover:scale-[1.02] transition-all"
              onClick={() => setActiveTab("analytics")}
            >
              <CardContent className="p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                  <Calendar className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs font-medium opacity-80 uppercase tracking-wider">Today's Bookings</p>
                  <p className="text-3xl font-bold leading-tight">{stats.todayBookings}</p>
                  <p className="text-xs opacity-70">{new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── Summary Cards Row 2: Profit split by Customer / Agent / Staff ─── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <Card
              className="border-2 border-blue-200 bg-blue-50 cursor-pointer hover:shadow-md hover:scale-[1.01] transition-all"
              onClick={() => setShowProfitModal(true)}
            >
              <CardContent className="p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                  <Users className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs font-medium text-blue-600 uppercase tracking-wider">Customer Profit</p>
                  <p className="text-2xl font-bold text-blue-700">₹{stats.customerProfit.toLocaleString("en-IN")}</p>
                  <p className="text-xs text-blue-500">{stats.customerBookings} customer bookings</p>
                </div>
              </CardContent>
            </Card>

            <Card
              className="border-2 border-orange-200 bg-orange-50 cursor-pointer hover:shadow-md hover:scale-[1.01] transition-all"
              onClick={() => setShowProfitModal(true)}
            >
              <CardContent className="p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center shrink-0">
                  <Sparkles className="w-6 h-6 text-orange-600" />
                </div>
                <div>
                  <p className="text-xs font-medium text-orange-600 uppercase tracking-wider">Agent Commission</p>
                  <p className="text-2xl font-bold text-orange-700">₹{stats.agentCommission.toLocaleString("en-IN")}</p>
                  <p className="text-xs text-orange-500">{stats.agentBookings} agent bookings</p>
                </div>
              </CardContent>
            </Card>

            <Card
              className="border-2 border-purple-200 bg-purple-50 cursor-pointer hover:shadow-md hover:scale-[1.01] transition-all"
              onClick={() => setLocation("/master-admin/staff-incentives")}
            >
              <CardContent className="p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center shrink-0">
                  <Tag className="w-6 h-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-xs font-medium text-purple-600 uppercase tracking-wider">Staff Incentive</p>
                  <p className="text-2xl font-bold text-purple-700">₹{stats.staffIncentiveTotal.toLocaleString("en-IN")}</p>
                  <p className="text-xs text-purple-500">{stats.staffBookings} staff bookings</p>
                </div>
              </CardContent>
            </Card>

            <Card
              className="border-2 border-emerald-300 bg-emerald-50 cursor-pointer hover:shadow-md hover:scale-[1.01] transition-all"
              onClick={() => setLocation("/admin/profit")}
            >
              <CardContent className="p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                  <TrendingUp className="w-6 h-6 text-emerald-700" />
                </div>
                <div>
                  <p className="text-xs font-medium text-emerald-700 uppercase tracking-wider">Net Admin Profit</p>
                  <p className="text-2xl font-extrabold text-emerald-800">₹{stats.netProfit.toLocaleString("en-IN")}</p>
                  <p className="text-xs text-emerald-600">After staff incentives</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── Service Breakdown ───────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            {[
              { label: "Flights",  count: stats.flightBookings,  profit: stats.profitByService.flights,  icon: Plane,     color: "from-blue-500 to-blue-600",     type: "flight" },
              { label: "Hotels",   count: stats.hotelBookings,   profit: stats.profitByService.hotels,   icon: Building2, color: "from-green-500 to-green-600",    type: "hotel" },
              { label: "Bus",      count: stats.busBookings,     profit: stats.profitByService.buses,    icon: Bus,       color: "from-cyan-500 to-cyan-600",      type: "bus" },
              { label: "Packages", count: stats.holidayBookings, profit: stats.profitByService.packages, icon: Map,       color: "from-purple-500 to-purple-600",  type: "package" },
            ].map(({ label, count, profit, icon: Icon, color, type }) => (
              <Card
                key={label}
                className={`bg-gradient-to-br ${color} text-white border-0 shadow cursor-pointer hover:shadow-xl hover:scale-[1.03] transition-all`}
                onClick={() => { setBookingTypeFilter(type); setActiveTab("bookings"); }}
              >
                <CardContent className="p-4">
                  <div className="flex justify-between items-start mb-1">
                    <Icon className="w-6 h-6 opacity-80" />
                    <span className="text-2xl font-bold">{count}</span>
                  </div>
                  <p className="text-sm font-medium opacity-90">{label}</p>
                  <p className="text-xs opacity-70 mt-0.5">Profit: ₹{profit.toLocaleString("en-IN")}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Main Content Tabs */}
          <Tabs value={activeTab} onValueChange={(tab) => { if (tab === "packages") { setLocation("/master-admin/packages"); } else { setActiveTab(tab); } }} className="space-y-6">
            <TabsList className="bg-primary/10 p-1 flex-wrap h-auto">
              <TabsTrigger value="bookings" className="flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5" />
                All Bookings
                {adminBookings.length > 0 && (
                  <span className="ml-1 bg-primary text-primary-foreground text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
                    {adminBookings.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="analytics" className="flex items-center gap-1.5">
                <BarChart2 className="w-3.5 h-3.5" />
                Analytics
              </TabsTrigger>
              <TabsTrigger value="markup">Markup Settings</TabsTrigger>
              <TabsTrigger value="agents">
                Agent Management
                {agents.filter((a) => !a.isApproved).length > 0 && (
                  <span className="ml-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                    {agents.filter((a) => !a.isApproved).length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="agent-bookings" className="flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5" />
                Agent Bookings
              </TabsTrigger>
              <TabsTrigger value="coupons">Coupons</TabsTrigger>
              <TabsTrigger value="packages">Packages</TabsTrigger>
              <TabsTrigger value="holiday-leads" onClick={loadLeads} className="flex items-center gap-1">
                <Phone className="w-3.5 h-3.5" /> Leads
              </TabsTrigger>
              <TabsTrigger value="holiday-enquiries" onClick={loadEnquiries} className="flex items-center gap-1">
                <MessageSquare className="w-3.5 h-3.5" /> Enquiries
              </TabsTrigger>
              <TabsTrigger value="users">Users</TabsTrigger>
              <TabsTrigger value="push-notifications" className="flex items-center gap-1">
                <Bell className="w-3.5 h-3.5" /> Push
              </TabsTrigger>
              <a
                href="#"
                onClick={(e) => { e.preventDefault(); window.location.href = (import.meta as any).env.BASE_URL?.replace(/\/$/, "") + "/admin/crm"; }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md text-purple-700 bg-purple-50 hover:bg-purple-100 transition-colors"
              >
                🎯 CRM Leads
              </a>
            </TabsList>

            {/* ── Analytics Tab ──────────────────────────────────────── */}
            <TabsContent value="analytics" className="space-y-6">
              {/* Daily Bookings Bar Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <BarChart2 className="w-5 h-5 text-primary" />
                    Daily Bookings — Last 14 Days
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {chartData.every((d) => d.bookings === 0) ? (
                    <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
                      <BarChart2 className="w-10 h-10 opacity-20" />
                      <p className="text-sm">No booking data yet. Make some bookings to see charts!</p>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={30} />
                        <Tooltip
                          formatter={(v: number) => [v, "Bookings"]}
                          labelStyle={{ fontWeight: 600 }}
                          contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0" }}
                        />
                        <Bar dataKey="bookings" fill="#7c3aed" radius={[4, 4, 0, 0]} name="Bookings" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Revenue & Profit Line Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <TrendingUp className="w-5 h-5 text-primary" />
                    Revenue & Profit — Last 14 Days
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {chartData.every((d) => d.revenue === 0) ? (
                    <div className="flex flex-col items-center justify-center h-48 text-muted-foreground gap-2">
                      <TrendingUp className="w-10 h-10 opacity-20" />
                      <p className="text-sm">No revenue data yet.</p>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={260}>
                      <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} width={60}
                          tickFormatter={(v: number) => v >= 1000 ? `₹${(v / 1000).toFixed(0)}k` : `₹${v}`} />
                        <Tooltip
                          formatter={(v: number, name: string) => [`₹${v.toLocaleString("en-IN")}`, name === "revenue" ? "Revenue" : "Profit"]}
                          labelStyle={{ fontWeight: 600 }}
                          contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0" }}
                        />
                        <Legend formatter={(v) => v === "revenue" ? "Revenue" : "Profit"} />
                        <Line type="monotone" dataKey="revenue" stroke="#f97316" strokeWidth={2.5} dot={{ r: 3 }} name="revenue" />
                        <Line type="monotone" dataKey="profit"  stroke="#10b981" strokeWidth={2.5} dot={{ r: 3 }} name="profit" />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Service mix summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: "Flights", count: stats.flightBookings,  rev: stats.profitByService.flights,  color: "blue" },
                  { label: "Hotels",  count: stats.hotelBookings,   rev: stats.profitByService.hotels,   color: "green" },
                  { label: "Bus",     count: stats.busBookings,     rev: stats.profitByService.buses,    color: "cyan" },
                  { label: "Packages",count: stats.holidayBookings, rev: stats.profitByService.packages, color: "purple" },
                ].map(({ label, count, rev }) => (
                  <Card key={label} className="border shadow-sm">
                    <CardContent className="p-4 text-center">
                      <p className="text-2xl font-bold text-primary">{count}</p>
                      <p className="text-sm font-medium text-muted-foreground">{label}</p>
                      <p className="text-xs text-emerald-600 font-semibold mt-1">+₹{rev.toLocaleString("en-IN")} profit</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            {/* ── Convenience Fee / Markup Settings Tab ───────────────── */}
            <TabsContent value="markup" className="space-y-6">

              {/* ── Pricing Formula Summary ── */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
                <p className="font-semibold text-slate-700 mb-2">How pricing works per user type:</p>
                <div className="space-y-1.5 text-xs text-slate-600">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 inline-block w-20 shrink-0 font-bold text-blue-700 bg-blue-100 rounded px-1.5 py-0.5 text-center">Customer</span>
                    <span>Raw API price + <strong>Customer Markup</strong> + Convenience Fee — admin keeps everything</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 inline-block w-20 shrink-0 font-bold text-orange-700 bg-orange-100 rounded px-1.5 py-0.5 text-center">Agent</span>
                    <span>Raw API price + <strong>Agent Markup</strong> (lower) + Convenience Fee — agent earns the difference vs customer markup</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 inline-block w-20 shrink-0 font-bold text-purple-700 bg-purple-100 rounded px-1.5 py-0.5 text-center">Staff</span>
                    <span>Same as Customer price (no discount) — staff earns separate incentive from admin</span>
                  </div>
                </div>
              </div>

              {/* ── Customer Markup (Internal Profit) ── */}
              <Card className="border-2 border-blue-300">
                <CardHeader className="bg-blue-600 text-white rounded-t-lg">
                  <CardTitle className="flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    Customer Markup — Hidden from Customers
                  </CardTitle>
                  <p className="text-sm text-white/80 mt-1">
                    Silently added to the Base Price shown to customers (and staff). Admin keeps the full amount as profit.
                  </p>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {(["flights", "hotels", "buses", "packages"] as const).map((svc) => {
                      const icons: Record<string, any> = {
                        flights: Plane, hotels: Building2, buses: Bus, packages: Package,
                      };
                      const labels: Record<string, string> = {
                        flights: "Flights", hotels: "Hotels", buses: "Bus", packages: "Holiday Packages",
                      };
                      const Icon     = icons[svc];
                      const cfg      = hiddenMarkupDraft[svc] as MarkupConfig;
                      const savedCfg = hiddenMarkup[svc] as MarkupConfig;
                      const sampleBase  = 10000;
                      const markupAmt   = cfg.type === "percentage"
                        ? Math.round((sampleBase * cfg.value) / 100)
                        : Math.round(cfg.value);

                      return (
                        <div key={svc} className="border border-blue-200 rounded-xl p-4 space-y-3 bg-blue-50/40">
                          <Label className="flex items-center gap-2 font-semibold text-base">
                            <Icon className="w-4 h-4 text-blue-600" />
                            {labels[svc]}
                          </Label>

                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant={cfg.type === "flat" ? "default" : "outline"}
                              className="flex-1 h-8 text-xs"
                              onClick={() => setHiddenMarkupDraft((prev) => ({ ...prev, [svc]: { ...prev[svc], type: "flat" } }))}
                            >₹ Flat Amount</Button>
                            <Button
                              size="sm"
                              variant={cfg.type === "percentage" ? "default" : "outline"}
                              className="flex-1 h-8 text-xs"
                              onClick={() => setHiddenMarkupDraft((prev) => ({ ...prev, [svc]: { ...prev[svc], type: "percentage" } }))}
                            >% Percentage</Button>
                          </div>

                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold text-sm select-none">
                              {cfg.type === "flat" ? "₹" : "%"}
                            </span>
                            <Input
                              type="number" min="0"
                              max={cfg.type === "percentage" ? "100" : undefined}
                              step={cfg.type === "percentage" ? "0.1" : "1"}
                              placeholder="0"
                              value={cfg.value}
                              onChange={(e) => setHiddenMarkupDraft((prev) => ({ ...prev, [svc]: { ...prev[svc], value: parseFloat(e.target.value) || 0 } }))}
                              className="pl-8"
                            />
                          </div>

                          <div className="text-xs rounded-lg bg-blue-100 border border-blue-200 p-2.5 space-y-1">
                            <p className="font-semibold text-blue-700">Preview (₹10,000 base)</p>
                            <div className="flex justify-between text-blue-600">
                              <span>Raw API Price</span>
                              <span>₹{sampleBase.toLocaleString("en-IN")}</span>
                            </div>
                            <div className="flex justify-between text-blue-700 font-medium">
                              <span>Customer Markup (your profit)</span>
                              <span>+₹{markupAmt.toLocaleString("en-IN")}</span>
                            </div>
                            <div className="flex justify-between font-bold text-blue-800 border-t border-blue-300 pt-1">
                              <span>Customer pays (Base Price)</span>
                              <span>₹{(sampleBase + markupAmt).toLocaleString("en-IN")}</span>
                            </div>
                          </div>

                          <p className="text-xs text-muted-foreground">
                            Saved:{" "}
                            {savedCfg.type === "flat"
                              ? `₹${savedCfg.value} flat`
                              : `${savedCfg.value}% of base`}
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  <div className="pt-2 flex gap-3">
                    <Button onClick={handleSaveHiddenMarkup} className="bg-blue-600 hover:bg-blue-700">
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Save Customer Markup
                    </Button>
                    <Button variant="outline" onClick={() => setHiddenMarkupDraft(hiddenMarkup)}>
                      Reset Changes
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* ── Global Agent Markup (B2B — lower than customer) ── */}
              <Card className="border-2 border-orange-300">
                <CardHeader className="bg-orange-600 text-white rounded-t-lg">
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5" />
                    Agent Markup — Global Default for B2B Agents
                  </CardTitle>
                  <p className="text-sm text-white/80 mt-1">
                    Approved agents pay this lower markup instead of the full customer markup. Their commission = Customer Markup − Agent Markup. Individual agents can still have per-agent overrides set in Agent Management.
                  </p>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {(["flights", "hotels", "buses", "packages"] as const).map((svc) => {
                      const icons: Record<string, any> = {
                        flights: Plane, hotels: Building2, buses: Bus, packages: Package,
                      };
                      const labels: Record<string, string> = {
                        flights: "Flights", hotels: "Hotels", buses: "Bus", packages: "Holiday Packages",
                      };
                      const Icon         = icons[svc];
                      const cfg          = agentMarkupDraft[svc] as MarkupConfig;
                      const savedCfg     = agentMarkup[svc] as MarkupConfig;
                      const custCfg      = hiddenMarkup[svc] as MarkupConfig;
                      const sampleBase   = 10000;
                      const agentMkpAmt  = cfg.type === "percentage"
                        ? Math.round((sampleBase * cfg.value) / 100)
                        : Math.round(cfg.value);
                      const custMkpAmt   = custCfg.type === "percentage"
                        ? Math.round((sampleBase * custCfg.value) / 100)
                        : Math.round(custCfg.value);
                      const commission   = Math.max(0, custMkpAmt - agentMkpAmt);

                      return (
                        <div key={svc} className="border border-orange-200 rounded-xl p-4 space-y-3 bg-orange-50/40">
                          <Label className="flex items-center gap-2 font-semibold text-base">
                            <Icon className="w-4 h-4 text-orange-600" />
                            {labels[svc]}
                          </Label>

                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant={cfg.type === "flat" ? "default" : "outline"}
                              className="flex-1 h-8 text-xs"
                              onClick={() => setAgentMarkupDraft((prev) => ({ ...prev, [svc]: { ...prev[svc], type: "flat" } }))}
                            >₹ Flat Amount</Button>
                            <Button
                              size="sm"
                              variant={cfg.type === "percentage" ? "default" : "outline"}
                              className="flex-1 h-8 text-xs"
                              onClick={() => setAgentMarkupDraft((prev) => ({ ...prev, [svc]: { ...prev[svc], type: "percentage" } }))}
                            >% Percentage</Button>
                          </div>

                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold text-sm select-none">
                              {cfg.type === "flat" ? "₹" : "%"}
                            </span>
                            <Input
                              type="number" min="0"
                              max={cfg.type === "percentage" ? "100" : undefined}
                              step={cfg.type === "percentage" ? "0.1" : "1"}
                              placeholder="0"
                              value={cfg.value}
                              onChange={(e) => setAgentMarkupDraft((prev) => ({ ...prev, [svc]: { ...prev[svc], value: parseFloat(e.target.value) || 0 } }))}
                              className="pl-8"
                            />
                          </div>

                          <div className="text-xs rounded-lg bg-orange-100 border border-orange-200 p-2.5 space-y-1">
                            <p className="font-semibold text-orange-700">Preview (₹10,000 base vs customer)</p>
                            <div className="flex justify-between text-orange-600">
                              <span>Customer Markup</span>
                              <span>₹{custMkpAmt.toLocaleString("en-IN")}</span>
                            </div>
                            <div className="flex justify-between text-orange-700 font-medium">
                              <span>Agent Markup (admin keeps)</span>
                              <span>₹{agentMkpAmt.toLocaleString("en-IN")}</span>
                            </div>
                            <div className="flex justify-between font-bold text-emerald-700 border-t border-orange-300 pt-1">
                              <span>Agent Commission earned</span>
                              <span>₹{commission.toLocaleString("en-IN")}</span>
                            </div>
                          </div>

                          <p className="text-xs text-muted-foreground">
                            Saved:{" "}
                            {savedCfg.type === "flat"
                              ? `₹${savedCfg.value} flat`
                              : `${savedCfg.value}% of base`}
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  <div className="pt-2 flex gap-3">
                    <Button onClick={handleSaveAgentMarkup} className="bg-orange-600 hover:bg-orange-700">
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Save Agent Markup
                    </Button>
                    <Button variant="outline" onClick={() => setAgentMarkupDraft(agentMarkup)}>
                      Reset Changes
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* ── Convenience Fee (Visible to customers) ── */}
              <Card>
                <CardHeader className="bg-primary text-primary-foreground">
                  <CardTitle className="flex items-center gap-2">
                    <Percent className="w-5 h-5" />
                    Convenience Fee Settings — Shown to Customers
                  </CardTitle>
                  <p className="text-sm text-primary-foreground/80 mt-1">
                    This fee is displayed to customers as a separate "Convenience Fee" line item in the price breakdown.
                  </p>
                </CardHeader>
                <CardContent className="p-6 space-y-6">

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {(["flights", "hotels", "buses", "packages"] as const).map((svc) => {
                      const icons: Record<string, any> = {
                        flights: Plane, hotels: Building2, buses: Bus, packages: Package,
                      };
                      const labels: Record<string, string> = {
                        flights: "Flights", hotels: "Hotels", buses: "Bus", packages: "Holiday Packages",
                      };
                      const Icon  = icons[svc];
                      const cfg   = markupDraft[svc] as MarkupConfig;
                      const savedCfg = markup[svc] as MarkupConfig;
                      // Live preview with sample ₹10,000 base
                      const sampleBase = 10000;
                      const previewFee = cfg.type === "percentage"
                        ? Math.round((sampleBase * cfg.value) / 100)
                        : Math.round(cfg.value);
                      const previewTotal = sampleBase + previewFee;

                      return (
                        <div key={svc} className="border rounded-xl p-4 space-y-3 bg-muted/30">
                          <Label className="flex items-center gap-2 font-semibold text-base">
                            <Icon className="w-4 h-4 text-primary" />
                            {labels[svc]}
                          </Label>

                          {/* Type toggle */}
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant={cfg.type === "flat" ? "default" : "outline"}
                              className="flex-1 h-8 text-xs"
                              onClick={() =>
                                setMarkupDraft((prev) => ({
                                  ...prev,
                                  [svc]: { ...prev[svc], type: "flat" },
                                }))
                              }
                            >
                              ₹ Flat Amount
                            </Button>
                            <Button
                              size="sm"
                              variant={cfg.type === "percentage" ? "default" : "outline"}
                              className="flex-1 h-8 text-xs"
                              onClick={() =>
                                setMarkupDraft((prev) => ({
                                  ...prev,
                                  [svc]: { ...prev[svc], type: "percentage" },
                                }))
                              }
                            >
                              % Percentage
                            </Button>
                          </div>

                          {/* Value input */}
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-semibold text-sm select-none">
                              {cfg.type === "flat" ? "₹" : "%"}
                            </span>
                            <Input
                              type="number"
                              min="0"
                              max={cfg.type === "percentage" ? "100" : undefined}
                              step={cfg.type === "percentage" ? "0.1" : "1"}
                              placeholder="0"
                              value={cfg.value}
                              onChange={(e) =>
                                setMarkupDraft((prev) => ({
                                  ...prev,
                                  [svc]: { ...prev[svc], value: parseFloat(e.target.value) || 0 },
                                }))
                              }
                              className="pl-8"
                            />
                          </div>

                          {/* Live preview */}
                          <div className="text-xs rounded-lg bg-blue-50 border border-blue-100 p-2.5 space-y-1">
                            <p className="font-semibold text-blue-700">Preview (₹10,000 base)</p>
                            <div className="flex justify-between text-blue-600">
                              <span>Base Price</span>
                              <span>₹{sampleBase.toLocaleString("en-IN")}</span>
                            </div>
                            <div className="flex justify-between text-blue-600">
                              <span>Convenience Fee</span>
                              <span>+₹{previewFee.toLocaleString("en-IN")}</span>
                            </div>
                            <div className="flex justify-between font-bold text-blue-800 border-t border-blue-200 pt-1">
                              <span>Customer Pays</span>
                              <span>₹{previewTotal.toLocaleString("en-IN")}</span>
                            </div>
                          </div>

                          <p className="text-xs text-muted-foreground">
                            Saved:{" "}
                            {savedCfg.type === "flat"
                              ? `₹${savedCfg.value} flat`
                              : `${savedCfg.value}% of base`}
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  <div className="pt-2 flex gap-3">
                    <Button onClick={handleSaveMarkup} className="bg-green-600 hover:bg-green-700">
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Save Fee Settings
                    </Button>
                    <Button variant="outline" onClick={() => setMarkupDraft(markup)}>
                      Reset Changes
                    </Button>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-800">
                    <p className="font-semibold mb-2">Complete pricing formula by user type:</p>
                    <ul className="space-y-1.5 text-xs list-disc list-inside">
                      <li><strong>Customer / Staff:</strong> Raw API price + Customer Markup + <em>Convenience Fee</em> = Total paid</li>
                      <li><strong>Agent:</strong> Raw API price + Agent Markup + <em>Convenience Fee</em> = Total paid (lower than customer)</li>
                      <li>Agent commission = Customer Markup − Agent Markup (agent earns this difference)</li>
                      <li>Admin profit (customer) = Customer Markup + Convenience Fee</li>
                      <li>Admin profit (agent) = Agent Markup + Convenience Fee</li>
                      <li>Staff earns incentive separately (see Staff Incentives page)</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Agent Management Tab ────────────────────────────────────── */}
            <TabsContent value="agents">
              <Card>
                <CardHeader className="bg-primary text-primary-foreground">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Building2 className="w-5 h-5" />
                      Agent Management ({agents.length})
                    </CardTitle>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => { setShowCreateAgent(!showCreateAgent); setCreateAgentError(""); }}
                    >
                      {showCreateAgent ? "Cancel" : "+ Create Agent"}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  {/* ── Create Agent Form ── */}
                  {showCreateAgent && (
                    <div className="mb-6 p-4 border-2 border-primary/20 rounded-xl bg-primary/5 space-y-4">
                      <h3 className="font-semibold text-sm uppercase tracking-wide text-primary">New B2B Agent</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium mb-1 block">Contact Name *</label>
                          <Input placeholder="Agent contact name" value={newAgent.name} onChange={(e) => setNewAgent({ ...newAgent, name: e.target.value })} />
                        </div>
                        <div>
                          <label className="text-xs font-medium mb-1 block">Agency Name</label>
                          <Input placeholder="Travel agency name" value={newAgent.agencyName} onChange={(e) => setNewAgent({ ...newAgent, agencyName: e.target.value })} />
                        </div>
                        <div>
                          <label className="text-xs font-medium mb-1 block">Email *</label>
                          <Input type="email" placeholder="agent@example.com" value={newAgent.email} onChange={(e) => setNewAgent({ ...newAgent, email: e.target.value })} />
                        </div>
                        <div>
                          <label className="text-xs font-medium mb-1 block">Phone *</label>
                          <Input placeholder="10-digit mobile" value={newAgent.phone} onChange={(e) => setNewAgent({ ...newAgent, phone: e.target.value })} />
                        </div>
                        <div>
                          <label className="text-xs font-medium mb-1 block">Password *</label>
                          <Input type="password" placeholder="Login password" value={newAgent.password} onChange={(e) => setNewAgent({ ...newAgent, password: e.target.value })} />
                        </div>
                        <div>
                          <label className="text-xs font-medium mb-1 block">GST Number</label>
                          <Input placeholder="Optional GST number" value={newAgent.gstNumber} onChange={(e) => setNewAgent({ ...newAgent, gstNumber: e.target.value })} />
                        </div>
                      </div>
                      {createAgentError && <p className="text-sm text-red-600">{createAgentError}</p>}
                      <Button onClick={handleCreateAgent} className="bg-primary hover:bg-primary/90">
                        Create Agent Account
                      </Button>
                      <p className="text-xs text-muted-foreground">Agent will be created in Pending state — approve them below to activate login.</p>
                    </div>
                  )}

                  {agents.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                      <p className="font-medium">No agents registered yet</p>
                      <p className="text-sm mt-1">Create one above or agents can self-register at /signup → "Travel Agent"</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {agents.map((agent) => (
                        <div key={agent.id} className="border rounded-xl p-4 space-y-3">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-bold">{agent.agencyName || agent.name}</p>
                                {agent.isApproved ? (
                                  <Badge className="bg-green-100 text-green-700 border-green-200 border text-xs">Active</Badge>
                                ) : (
                                  <Badge className="bg-amber-100 text-amber-700 border-amber-200 border text-xs">Pending</Badge>
                                )}
                                <Badge variant="outline" className="text-xs">
                                  {countAgentBookings(agent.email)} bookings
                                </Badge>
                                {sumAgentCommission(agent.email) > 0 && (
                                  <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 border text-xs">
                                    ₹{sumAgentCommission(agent.email).toLocaleString("en-IN")} earned
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground">{agent.name} · {agent.email}</p>
                              <p className="text-xs text-muted-foreground font-mono mt-0.5">Code: {agent.agentCode}</p>
                            </div>
                            <div className="flex gap-2 shrink-0">
                              {agent.isApproved ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-red-600 border-red-200 hover:bg-red-50"
                                  onClick={() => handleApproveAgent(agent.id, false)}
                                >
                                  <ShieldOff className="w-3.5 h-3.5 mr-1" />
                                  Deactivate
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  className="bg-green-600 hover:bg-green-700"
                                  onClick={() => handleApproveAgent(agent.id, true)}
                                >
                                  <ShieldCheck className="w-3.5 h-3.5 mr-1" />
                                  Approve
                                </Button>
                              )}
                            </div>
                          </div>

                          {/* Wallet + Markup row */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t">
                            {/* Wallet */}
                            <div>
                              <p className="text-xs text-muted-foreground mb-1 font-semibold uppercase">Wallet Balance</p>
                              <p className="font-bold text-blue-700 text-lg mb-2">
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
                                  />
                                  <Button size="sm" className="h-8 bg-blue-600 hover:bg-blue-700" onClick={handleTopUp}>Add</Button>
                                  <Button size="sm" variant="ghost" className="h-8" onClick={() => setTopUpAgentId(null)}>✕</Button>
                                </div>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => { setTopUpAgentId(agent.id); setTopUpAmount(""); }}
                                >
                                  <Wallet className="w-3.5 h-3.5 mr-1" />
                                  Top Up
                                </Button>
                              )}
                            </div>

                            {/* Agent Markup (₹ per-agent override) */}
                            <div>
                              <p className="text-xs text-muted-foreground mb-1 font-semibold uppercase">Per-Agent Markup Override (₹)</p>
                              {(() => {
                                const agentMkp    = agent.agentMarkup;
                                const globalMkp   = getAgentMarkupSettings().flights;
                                const globalMkpAmt = globalMkp.type === "percentage" ? Math.round((5000 * globalMkp.value) / 100) : Math.round(globalMkp.value);
                                const normalMkp   = getHiddenMarkupAmount(5000, "flights"); // reference @ ₹5000
                                const effectiveMkp = agentMkp !== undefined ? agentMkp : globalMkpAmt;
                                const commission  = Math.max(0, normalMkp - effectiveMkp);
                                return (
                                  <>
                                    <div className="flex items-baseline gap-2 mb-1">
                                      <p className="font-bold text-emerald-700 text-lg">
                                        {agentMkp !== undefined ? `₹${agentMkp}` : <span className="text-orange-600">Global ({globalMkpAmt > 0 ? `₹${globalMkpAmt}` : "not set"})</span>}
                                      </p>
                                      <p className="text-xs text-slate-500">
                                        vs Customer ₹{normalMkp}
                                      </p>
                                    </div>
                                    {commission > 0 && (
                                      <p className="text-xs text-emerald-600 font-semibold mb-2">
                                        Commission: ₹{commission} per ₹5k booking
                                      </p>
                                    )}
                                    <div className="flex gap-2">
                                      <Input
                                        type="number"
                                        min="0"
                                        placeholder={`e.g. ${normalMkp > 0 ? Math.round(normalMkp * 0.7) : 200}`}
                                        value={markupEdits[agent.id] ?? ""}
                                        onChange={(e) =>
                                          setMarkupEdits((prev) => ({ ...prev, [agent.id]: e.target.value }))
                                        }
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
                                    <p className="text-[10px] text-muted-foreground mt-1">
                                      Override global default · Commission = ₹{normalMkp} − ₹{effectiveMkp} = ₹{commission}
                                    </p>
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Agent Bookings Tab ─────────────────────────────────────────── */}
            <TabsContent value="agent-bookings">
              <Card>
                <CardHeader className="bg-primary text-primary-foreground">
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="w-5 h-5" />
                    Agent Bookings
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  {/* Per-agent summary */}
                  {agents.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                      {agents.map((agent) => {
                        const agentBs = adminBookings.filter(
                          (b) =>
                            b.agentEmail === agent.email ||
                            b.details?.agentEmail === agent.email ||
                            b.passengerEmail === agent.email
                        );
                        const agentRevenue = agentBs.reduce((s, b) => s + getAmount(b), 0);
                        const agentCommission = agentBs.reduce(
                          (s, b) =>
                            s + (b.commissionEarned ? Number(b.commissionEarned) : b.details?.commissionEarned ?? 0),
                          0
                        );
                        return (
                          <div key={agent.id} className="border rounded-xl p-4 bg-muted/20">
                            <div className="flex items-center gap-2 mb-3">
                              <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                                <Building2 className="w-4 h-4 text-blue-600" />
                              </div>
                              <div>
                                <p className="font-semibold text-sm">{agent.agencyName || agent.name}</p>
                                <p className="text-xs text-muted-foreground font-mono">{agent.agentCode}</p>
                              </div>
                              {agent.isApproved ? (
                                <span className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">Active</span>
                              ) : (
                                <span className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">Pending</span>
                              )}
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-center">
                              <div className="bg-white rounded-lg p-2 border">
                                <p className="text-lg font-bold">{agentBs.length}</p>
                                <p className="text-[10px] text-muted-foreground">Bookings</p>
                              </div>
                              <div className="bg-white rounded-lg p-2 border">
                                <p className="text-sm font-bold text-blue-700">₹{agentRevenue.toLocaleString("en-IN")}</p>
                                <p className="text-[10px] text-muted-foreground">Revenue</p>
                              </div>
                              <div className="bg-white rounded-lg p-2 border">
                                <p className="text-sm font-bold text-emerald-700">₹{agentCommission.toLocaleString("en-IN")}</p>
                                <p className="text-[10px] text-muted-foreground">Commission</p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Agent bookings table */}
                  {(() => {
                    const agentBookings = adminBookings.filter(
                      (b) => b.agentId || b.agentEmail || b.agentCode || b.details?.agentId || b.details?.agentEmail
                    );
                    if (agentBookings.length === 0) {
                      return (
                        <div className="text-center py-12 text-muted-foreground">
                          <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                          <p className="font-medium">No agent bookings yet</p>
                          <p className="text-sm mt-1">Bookings made by approved B2B agents will appear here</p>
                        </div>
                      );
                    }
                    return (
                      <div className="overflow-x-auto rounded-xl border">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/50">
                            <tr>
                              <th className="text-left p-3 font-semibold">Booking</th>
                              <th className="text-left p-3 font-semibold">Agent</th>
                              <th className="text-left p-3 font-semibold">Passenger</th>
                              <th className="text-left p-3 font-semibold">Type</th>
                              <th className="text-right p-3 font-semibold">Total</th>
                              <th className="text-right p-3 font-semibold text-emerald-700">Commission</th>
                              <th className="text-center p-3 font-semibold">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {agentBookings.map((b, i) => {
                              const agentEmail = b.agentEmail || b.details?.agentEmail || "";
                              const agentCode  = b.agentCode  || b.details?.agentCode  || "";
                              const agent      = agents.find((a) => a.email === agentEmail);
                              const commission = b.commissionEarned
                                ? Number(b.commissionEarned)
                                : (b.details?.commissionEarned ?? 0);
                              const status = b.status || b.paymentStatus || "confirmed";
                              return (
                                <tr key={b.id ?? i} className="hover:bg-muted/20 transition-colors">
                                  <td className="p-3">
                                    <p className="font-mono text-xs text-muted-foreground">
                                      #{b.id || b.details?.bookingRef || "—"}
                                    </p>
                                    <p className="text-xs text-muted-foreground">{getBookingDate(b)}</p>
                                  </td>
                                  <td className="p-3">
                                    <p className="font-semibold text-xs">{agent?.agencyName || agent?.name || agentEmail}</p>
                                    <p className="text-xs font-mono text-blue-600">{agentCode}</p>
                                  </td>
                                  <td className="p-3">
                                    <p className="font-medium text-xs">{b.passengerName || b.customerName || b.details?.customerName}</p>
                                    <p className="text-xs text-muted-foreground">{b.passengerEmail || b.customerEmail}</p>
                                  </td>
                                  <td className="p-3">
                                    <span className="capitalize text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                                      {b.bookingType || b.type || "flight"}
                                    </span>
                                  </td>
                                  <td className="p-3 text-right font-bold">₹{getAmount(b).toLocaleString("en-IN")}</td>
                                  <td className="p-3 text-right font-bold text-emerald-600">
                                    {commission > 0 ? `₹${commission.toLocaleString("en-IN")}` : "—"}
                                  </td>
                                  <td className="p-3 text-center">
                                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                                      status === "confirmed" || status === "paid"
                                        ? "bg-green-50 text-green-700 border-green-200"
                                        : status === "cancelled"
                                        ? "bg-red-50 text-red-700 border-red-200"
                                        : "bg-amber-50 text-amber-700 border-amber-200"
                                    }`}>
                                      {status}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot className="bg-muted/30 border-t-2">
                            <tr>
                              <td colSpan={4} className="p-3 font-semibold">Totals</td>
                              <td className="p-3 text-right font-bold">
                                ₹{agentBookings.reduce((s, b) => s + getAmount(b), 0).toLocaleString("en-IN")}
                              </td>
                              <td className="p-3 text-right font-bold text-emerald-600">
                                ₹{agentBookings.reduce((s, b) => s + (b.commissionEarned ? Number(b.commissionEarned) : (b.details?.commissionEarned ?? 0)), 0).toLocaleString("en-IN")}
                              </td>
                              <td />
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            </TabsContent>


            {/* Coupons Tab */}
            <TabsContent value="coupons">
              <Card>
                <CardHeader className="bg-primary text-primary-foreground">
                  <CardTitle className="flex items-center gap-2">
                    <Tag className="w-5 h-5" />
                    Coupon Management
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                  {/* Add New Coupon Form */}
                  <div className="bg-muted/30 p-6 rounded-lg border-2 border-dashed border-primary/20">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      <Plus className="w-5 h-5" />
                      Create New Coupon
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="coupon-code">Coupon Code *</Label>
                        <Input
                          id="coupon-code"
                          placeholder="e.g., SUMMER50"
                          value={newCoupon.code}
                          onChange={(e) => setNewCoupon({ ...newCoupon, code: e.target.value.toUpperCase() })}
                          className="uppercase font-mono"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="coupon-type">Coupon Type *</Label>
                        <Select
                          value={newCoupon.type}
                          onValueChange={(value: "public" | "welcome" | "user_specific") =>
                            setNewCoupon({ ...newCoupon, type: value })
                          }
                        >
                          <SelectTrigger id="coupon-type">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="public">Public (anyone)</SelectItem>
                            <SelectItem value="welcome">Welcome (first booking)</SelectItem>
                            <SelectItem value="user_specific">User-Specific (by phone)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {newCoupon.type === "user_specific" && (
                        <div className="space-y-2">
                          <Label htmlFor="allowed-phone">Customer Phone *</Label>
                          <Input
                            id="allowed-phone"
                            type="tel"
                            placeholder="10-digit phone"
                            value={newCoupon.allowed_phone}
                            onChange={(e) => setNewCoupon({ ...newCoupon, allowed_phone: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                            maxLength={10}
                          />
                        </div>
                      )}

                      <div className="space-y-2">
                        <Label htmlFor="service-type">Applicable Service</Label>
                        <Select
                          value={newCoupon.service_type || "all"}
                          onValueChange={(value) =>
                            setNewCoupon({ ...newCoupon, service_type: value === "all" ? "" : value as any, flight_type: "", airline: "" })
                          }
                        >
                          <SelectTrigger id="service-type">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Services</SelectItem>
                            <SelectItem value="flight">Flights only</SelectItem>
                            <SelectItem value="bus">Bus only</SelectItem>
                            <SelectItem value="hotel">Hotels only</SelectItem>
                            <SelectItem value="holiday">Holiday Packages only</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {newCoupon.service_type === "flight" && (
                        <div className="space-y-2">
                          <Label htmlFor="flight-type">Flight Type</Label>
                          <Select
                            value={newCoupon.flight_type || "any"}
                            onValueChange={(value) =>
                              setNewCoupon({ ...newCoupon, flight_type: value === "any" ? "" : value as any })
                            }
                          >
                            <SelectTrigger id="flight-type">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="any">Any (domestic + international)</SelectItem>
                              <SelectItem value="domestic">Domestic only</SelectItem>
                              <SelectItem value="international">International only</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {newCoupon.service_type === "flight" && (
                        <div className="space-y-2">
                          <Label htmlFor="airline">Airline (optional)</Label>
                          <Input
                            id="airline"
                            placeholder="e.g. IndiGo, Air India"
                            value={newCoupon.airline}
                            onChange={(e) => setNewCoupon({ ...newCoupon, airline: e.target.value })}
                          />
                        </div>
                      )}

                      <div className="space-y-2">
                        <Label htmlFor="discount-type">Discount Type *</Label>
                        <Select
                          value={newCoupon.discountType}
                          onValueChange={(value: "fixed" | "percentage") =>
                            setNewCoupon({ ...newCoupon, discountType: value })
                          }
                        >
                          <SelectTrigger id="discount-type">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="fixed">Fixed Amount (₹)</SelectItem>
                            <SelectItem value="percentage">Percentage (%)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="discount-amount">
                          Discount {newCoupon.discountType === "fixed" ? "(₹)" : "(%)"} *
                        </Label>
                        <div className="relative">
                          <Input
                            id="discount-amount"
                            type="number"
                            placeholder={newCoupon.discountType === "fixed" ? "500" : "10"}
                            value={newCoupon.discount}
                            onChange={(e) => setNewCoupon({ ...newCoupon, discount: e.target.value })}
                            className="pr-8"
                            min="0"
                            max={newCoupon.discountType === "percentage" ? "100" : undefined}
                          />
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                            {newCoupon.discountType === "fixed" ? (
                              <IndianRupee className="w-4 h-4" />
                            ) : (
                              <Percent className="w-4 h-4" />
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="valid-until">Valid Until *</Label>
                        <div className="relative">
                          <Input
                            id="valid-until"
                            type="date"
                            value={newCoupon.validUntil}
                            onChange={(e) => setNewCoupon({ ...newCoupon, validUntil: e.target.value })}
                            min={new Date().toISOString().split('T')[0]}
                          />
                          <Calendar className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="min-booking">Min Booking Amount (₹)</Label>
                        <Input
                          id="min-booking"
                          type="number"
                          placeholder="0 = no minimum"
                          value={newCoupon.minBookingAmount}
                          onChange={(e) => setNewCoupon({ ...newCoupon, minBookingAmount: e.target.value })}
                          min="0"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="usage-limit">Usage Limit (total)</Label>
                        <Input
                          id="usage-limit"
                          type="number"
                          placeholder="0 = unlimited"
                          value={newCoupon.usageLimit}
                          onChange={(e) => setNewCoupon({ ...newCoupon, usageLimit: e.target.value })}
                          min="0"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="coupon-description">Coupon Description</Label>
                        <Input
                          id="coupon-description"
                          placeholder="Optional description"
                          value={newCoupon.description}
                          onChange={(e) => setNewCoupon({ ...newCoupon, description: e.target.value })}
                        />
                      </div>

                      <div className="flex items-end col-span-1 md:col-span-2 lg:col-span-1">
                        <div className={cn(
                          "w-full rounded-md px-3 py-2 text-xs leading-relaxed border",
                          newCoupon.type === "welcome" && "bg-amber-50 border-amber-200 text-amber-700",
                          newCoupon.type === "user_specific" && "bg-purple-50 border-purple-200 text-purple-700",
                          newCoupon.type === "public" && "bg-blue-50 border-blue-200 text-blue-700",
                        )}>
                          {newCoupon.type === "public" && "Anyone can use this coupon. Great for promotions."}
                          {newCoupon.type === "welcome" && "Only customers with 0 prior bookings can use this. Auto one-time per mobile."}
                          {newCoupon.type === "user_specific" && "Only the customer with the given phone number can redeem this. One-time use."}
                        </div>
                      </div>

                      <div className="flex items-end">
                        <Button
                          onClick={handleAddCoupon}
                          className="w-full"
                          size="lg"
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Add Coupon
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Active Coupons List */}
                  <div>
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                      <Tag className="w-5 h-5" />
                      Active Coupons ({coupons.length})
                    </h3>

                    {coupons.length === 0 ? (
                      <div className="text-center py-12 bg-muted/20 rounded-lg border-2 border-dashed">
                        <Tag className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                        <p className="text-muted-foreground text-lg font-medium">No coupons created yet</p>
                        <p className="text-sm text-muted-foreground mt-1">Create your first coupon to offer discounts to customers</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {coupons.map((coupon) => {
                          const expired = isCouponExpired(coupon.validUntil);
                          return (
                            <Card 
                              key={coupon.code} 
                              className={cn(
                                "relative overflow-hidden transition-all hover:shadow-lg",
                                expired && "opacity-60"
                              )}
                            >
                              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16" />
                              <div className="absolute bottom-0 left-0 w-24 h-24 bg-primary/5 rounded-full -ml-12 -mb-12" />
                              
                              <CardHeader className="pb-3">
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-2">
                                      <Badge 
                                        variant={expired ? "secondary" : "default"}
                                        className="font-mono text-lg px-3 py-1"
                                      >
                                        {coupon.code}
                                      </Badge>
                                      {expired && (
                                        <Badge variant="destructive" className="text-xs">
                                          Expired
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2 text-2xl font-bold text-primary">
                                      {coupon.discountType === "fixed" ? (
                                        <>
                                          <IndianRupee className="w-5 h-5" />
                                          {coupon.discount.toFixed(0)}
                                        </>
                                      ) : (
                                        <>
                                          {coupon.discount}
                                          <Percent className="w-5 h-5" />
                                        </>
                                      )}
                                      <span className="text-sm text-muted-foreground font-normal">
                                        OFF
                                      </span>
                                    </div>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDeleteCoupon(coupon.code)}
                                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </CardHeader>
                              <CardContent className="pt-0 space-y-2">
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <Calendar className="w-4 h-4" />
                                  <span>
                                    Expires: {new Date(coupon.validUntil).toLocaleDateString('en-IN', {
                                      day: 'numeric',
                                      month: 'short',
                                      year: 'numeric'
                                    })}
                                  </span>
                                </div>
                                {(() => {
                                  const t = coupon.type ?? (coupon.firstTimeOnly ? "welcome" : "public");
                                  if (t === "welcome") return (
                                    <div className="flex items-center gap-1 text-xs text-amber-600 font-medium">
                                      <ShieldAlert className="w-3 h-3" />
                                      <span>Welcome offer · first booking only</span>
                                    </div>
                                  );
                                  if (t === "user_specific") return (
                                    <div className="flex items-center gap-1 text-xs text-purple-600 font-medium">
                                      <ShieldAlert className="w-3 h-3" />
                                      <span>User-specific · {coupon.allowed_phone ?? "—"}</span>
                                    </div>
                                  );
                                  return (
                                    <div className="flex items-center gap-1 text-xs text-blue-600 font-medium">
                                      <ShieldAlert className="w-3 h-3" />
                                      <span>Public · anyone can use</span>
                                    </div>
                                  );
                                })()}
                                {coupon.service_type && (
                                  <div className="flex items-center gap-1 flex-wrap mt-1">
                                    <span className={cn(
                                      "text-xs font-medium px-2 py-0.5 rounded-full border",
                                      coupon.service_type === "flight"  && "bg-sky-100 text-sky-700 border-sky-200",
                                      coupon.service_type === "bus"     && "bg-orange-100 text-orange-700 border-orange-200",
                                      coupon.service_type === "hotel"   && "bg-green-100 text-green-700 border-green-200",
                                      coupon.service_type === "holiday" && "bg-rose-100 text-rose-700 border-rose-200",
                                    )}>
                                      {coupon.service_type === "flight" ? "Flights" :
                                       coupon.service_type === "bus" ? "Bus" :
                                       coupon.service_type === "hotel" ? "Hotels" : "Holidays"} only
                                    </span>
                                    {coupon.flight_type && (
                                      <span className="text-xs font-medium px-2 py-0.5 rounded-full border bg-indigo-100 text-indigo-700 border-indigo-200 capitalize">
                                        {coupon.flight_type}
                                      </span>
                                    )}
                                    {coupon.airline && (
                                      <span className="text-xs font-medium px-2 py-0.5 rounded-full border bg-slate-100 text-slate-700 border-slate-200">
                                        {coupon.airline}
                                      </span>
                                    )}
                                  </div>
                                )}
                                {(coupon.usageLimit ?? 0) > 0 && (
                                  <div className="text-xs text-muted-foreground">
                                    Max {coupon.usageLimit} total redemptions
                                  </div>
                                )}
                                {(coupon.minBookingAmount ?? 0) > 0 && (
                                  <div className="text-xs text-muted-foreground">
                                    Min booking ₹{(coupon.minBookingAmount ?? 0).toLocaleString("en-IN")}
                                  </div>
                                )}
                                {coupon.description && (
                                  <div className="text-xs text-muted-foreground italic">
                                    {coupon.description}
                                  </div>
                                )}
                                {expired && (
                                  <div className="flex items-center gap-1 text-xs text-destructive">
                                    <XCircle className="w-3 h-3" />
                                    <span>This coupon has expired</span>
                                  </div>
                                )}
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Delete Confirmation Dialog */}
              <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Delete Coupon</DialogTitle>
                    <DialogDescription>
                      Are you sure you want to delete coupon <strong className="font-mono">{couponToDelete}</strong>? 
                      This action cannot be undone.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
                      Cancel
                    </Button>
                    <Button variant="destructive" onClick={confirmDeleteCoupon}>
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete Coupon
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </TabsContent>

            {/* Packages Tab — navigates to /master-admin/packages on click */}
            <TabsContent value="packages" />

            {/* ── Holiday Leads Tab ─────────────────────────────────────────── */}
            <TabsContent value="holiday-leads">

              {/* Leads table card */}
              <Card className="mb-4">
                <CardHeader className="bg-primary text-primary-foreground">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Phone className="w-5 h-5" /> Holiday Leads ({holidayLeads.length})
                    </CardTitle>
                    <Button size="sm" variant="secondary" onClick={loadLeads} className="gap-1">
                      <RefreshCw className="w-3.5 h-3.5" /> Refresh
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  {!leadsLoaded ? (
                    <p className="text-muted-foreground text-center py-10 text-sm">
                      Click the <strong>Leads</strong> tab to load captured leads.
                    </p>
                  ) : holidayLeads.length === 0 ? (
                    <div className="text-center py-16">
                      <Phone className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                      <p className="font-semibold text-slate-700">No leads yet</p>
                      <p className="text-sm text-muted-foreground">When users search for holiday destinations, their details will appear here.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            <th className="text-left pb-3 pr-4">Name</th>
                            <th className="text-left pb-3 pr-4">Mobile</th>
                            <th className="text-left pb-3 pr-4">Destination</th>
                            <th className="text-left pb-3 pr-4">Date</th>
                            <th className="text-left pb-3 pr-4">People</th>
                            <th className="text-left pb-3 pr-4">Status</th>
                            <th className="text-left pb-3 pr-4">Captured</th>
                            <th className="text-left pb-3">Follow-ups</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {holidayLeads.map((lead) => {
                            const statusColors: Record<string, string> = {
                              new:        "bg-blue-50 text-blue-700 border-blue-200",
                              contacted:  "bg-amber-50 text-amber-700 border-amber-200",
                              interested: "bg-violet-50 text-violet-700 border-violet-200",
                              booked:     "bg-green-50 text-green-700 border-green-200",
                            };
                            const s = lead.status ?? "new";
                            return (
                              <>
                                <tr key={lead.id} className="hover:bg-muted/30 transition-colors">
                                  <td className="py-3 pr-4 font-semibold">{lead.name}</td>
                                  <td className="py-3 pr-4">
                                    <a href={`tel:${lead.phone}`} className="flex items-center gap-1 text-blue-600 hover:underline">
                                      <Phone className="w-3 h-3" />{lead.phone}
                                    </a>
                                  </td>
                                  <td className="py-3 pr-4">
                                    <Badge variant="outline" className="text-purple-700 border-purple-200 bg-purple-50">{lead.destination}</Badge>
                                  </td>
                                  <td className="py-3 pr-4 text-muted-foreground">{lead.date || "—"}</td>
                                  <td className="py-3 pr-4">
                                    <span className="flex items-center gap-1"><Users className="w-3 h-3" />{lead.people}</span>
                                  </td>
                                  <td className="py-3 pr-4">
                                    <select
                                      value={s}
                                      onChange={(e) => changeLeadStatus(lead, e.target.value as LeadStatus)}
                                      className={`text-xs font-semibold rounded-full border px-2.5 py-1 cursor-pointer outline-none ${statusColors[s]}`}
                                    >
                                      <option value="new">New</option>
                                      <option value="contacted">Contacted</option>
                                      <option value="interested">Interested</option>
                                      <option value="booked">Booked</option>
                                    </select>
                                  </td>
                                  <td className="py-3 pr-4 text-muted-foreground text-xs">
                                    {new Date(lead.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                                  </td>
                                  <td className="py-3">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
                                      onClick={() => loadFollowupLog(lead.id)}
                                    >
                                      <MessageSquare className="w-3 h-3" />
                                      {expandedLead === lead.id ? "Hide" : "Log"}
                                    </Button>
                                  </td>
                                </tr>
                                {/* ── Follow-up log row ── */}
                                {expandedLead === lead.id && (
                                  <tr key={`${lead.id}-log`}>
                                    <td colSpan={8} className="pb-4 pt-1 px-2">
                                      <div className="bg-slate-50 border rounded-xl p-4">
                                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                                          Follow-up messages for {lead.name}
                                        </p>
                                        {(followupLogs[lead.id] ?? []).length === 0 ? (
                                          <p className="text-sm text-muted-foreground italic">No follow-ups scheduled yet.</p>
                                        ) : (
                                          <div className="space-y-2">
                                            {(followupLogs[lead.id] ?? []).map((row: any) => {
                                              const stepLabel: Record<string, string> = { "10min": "After 10 min", "2hr": "After 2 hours", "24hr": "After 24 hours" };
                                              const stColor: Record<string, string>  = { pending: "bg-amber-100 text-amber-700", sent: "bg-green-100 text-green-700", cancelled: "bg-slate-100 text-slate-500", failed: "bg-red-100 text-red-700" };
                                              return (
                                                <div key={row.id} className="flex items-start gap-3 bg-white border rounded-lg p-3 text-sm">
                                                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 mt-0.5 ${stColor[row.status] ?? stColor.pending}`}>{row.status}</span>
                                                  <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                                      <span className="font-semibold text-xs text-primary">{stepLabel[row.step] ?? row.step}</span>
                                                      <span className="text-xs text-muted-foreground">· Scheduled {new Date(row.scheduledAt).toLocaleString("en-IN", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" })}</span>
                                                      {row.sentAt && <span className="text-xs text-green-600">· Sent {new Date(row.sentAt).toLocaleString("en-IN", { hour:"2-digit", minute:"2-digit" })}</span>}
                                                    </div>
                                                    <p className="text-xs text-slate-600 line-clamp-2 whitespace-pre-line">{row.message}</p>
                                                    {row.error && <p className="text-xs text-red-500 mt-0.5">⚠ {row.error}</p>}
                                                  </div>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* ── Auto Follow-up Settings Card ─────────────────────────────── */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Sparkles className="w-4 h-4 text-violet-500" /> Auto Follow-up Settings
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      {!fuSettings && (
                        <Button size="sm" variant="outline" onClick={loadFuSettings} className="gap-1">
                          <RefreshCw className="w-3.5 h-3.5" /> Load Settings
                        </Button>
                      )}
                      {fuSettings && !fuEditing && (
                        <Button size="sm" onClick={() => { setFuDraft({ ...fuSettings }); setFuEditing(true); }} className="gap-1">
                          <Settings className="w-3.5 h-3.5" /> Customize Messages
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {!fuSettings ? (
                    <p className="text-sm text-muted-foreground">Click "Load Settings" to view and configure auto follow-up messages.</p>
                  ) : (
                    <div className="space-y-5">
                      {/* Enable / Disable toggle */}
                      <div className="flex items-center justify-between bg-slate-50 border rounded-xl p-4">
                        <div>
                          <p className="font-semibold text-sm">Auto Follow-up</p>
                          <p className="text-xs text-muted-foreground">Automatically send 3 WhatsApp messages to every new lead</p>
                        </div>
                        <button
                          onClick={async () => {
                            const next = !fuSettings.enabled;
                            const updated = await (async () => {
                              await fetch("/api/followup/settings", {
                                method:  "PUT",
                                headers: { "Content-Type": "application/json" },
                                body:    JSON.stringify({ enabled: next }),
                              });
                              return { ...fuSettings, enabled: next };
                            })().catch(() => fuSettings);
                            setFuSettings(updated);
                            toast({ title: `Auto follow-up ${next ? "enabled ✓" : "disabled"}` });
                          }}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${fuSettings.enabled ? "bg-green-500" : "bg-slate-300"}`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${fuSettings.enabled ? "translate-x-6" : "translate-x-1"}`} />
                        </button>
                      </div>

                      {/* Message templates */}
                      {(fuEditing ? ["10min","2hr","24hr"] : ["10min","2hr","24hr"]).map((step) => {
                        const labels: Record<string, { title: string; icon: string; color: string }> = {
                          "10min": { title: "Message 1 — After 10 minutes",  icon: "🕐", color: "text-blue-600 bg-blue-50 border-blue-200" },
                          "2hr":   { title: "Message 2 — After 2 hours",      icon: "🕑", color: "text-violet-600 bg-violet-50 border-violet-200" },
                          "24hr":  { title: "Message 3 — After 24 hours",     icon: "🎁", color: "text-green-600 bg-green-50 border-green-200" },
                        };
                        const l    = labels[step];
                        const key  = `msg${step}` as "msg10min" | "msg2hr" | "msg24hr";
                        const val  = (fuEditing ? fuDraft : fuSettings)?.[key] ?? "";
                        return (
                          <div key={step} className={`border rounded-xl p-4 ${fuEditing ? "" : l.color}`}>
                            <p className={`text-xs font-bold mb-2 ${l.color.split(" ")[0]}`}>{l.icon} {l.title}</p>
                            {fuEditing ? (
                              <textarea
                                rows={3}
                                value={val}
                                onChange={(e) => setFuDraft(prev => prev ? { ...prev, [key]: e.target.value } : prev)}
                                placeholder="Use {name} and {destination} as placeholders"
                                className="w-full border rounded-lg p-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                              />
                            ) : (
                              <p className="text-sm whitespace-pre-line leading-relaxed">{val}</p>
                            )}
                          </div>
                        );
                      })}

                      {fuEditing && (
                        <div className="flex justify-end gap-2 pt-1">
                          <Button variant="outline" size="sm" onClick={() => setFuEditing(false)}>Cancel</Button>
                          <Button size="sm" onClick={saveFuSettings} disabled={fuSaving}>{fuSaving ? "Saving…" : "Save Changes"}</Button>
                        </div>
                      )}

                      <div className="text-xs text-muted-foreground bg-slate-50 rounded-lg px-4 py-3 border">
                        <strong>Note:</strong> Use <code className="font-mono bg-white border rounded px-1">{"{name}"}</code> and <code className="font-mono bg-white border rounded px-1">{"{destination}"}</code> as dynamic placeholders. Follow-ups stop automatically when a lead is marked as <em>Contacted</em> or <em>Booked</em>.
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

            </TabsContent>

            {/* ── Holiday Enquiries Tab ──────────────────────────────────────── */}
            <TabsContent value="holiday-enquiries">
              <Card>
                <CardHeader className="bg-primary text-primary-foreground">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <MessageSquare className="w-5 h-5" /> Holiday Enquiries ({holidayEnquiries.length})
                    </CardTitle>
                    <Button size="sm" variant="secondary" onClick={loadEnquiries} className="gap-1">
                      <RefreshCw className="w-3.5 h-3.5" /> Refresh
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  {!enqLoaded ? (
                    <p className="text-muted-foreground text-center py-10 text-sm">
                      Click the <strong>Enquiries</strong> tab to load package enquiries.
                    </p>
                  ) : holidayEnquiries.length === 0 ? (
                    <div className="text-center py-16">
                      <MessageSquare className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                      <p className="font-semibold text-slate-700">No enquiries yet</p>
                      <p className="text-sm text-muted-foreground">When users send package enquiries, they'll appear here for follow-up.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {holidayEnquiries.map((enq) => (
                        <div key={enq.id} className="border rounded-xl p-4 hover:shadow-sm transition-shadow">
                          <div className="flex items-start justify-between gap-4 flex-wrap">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <p className="font-bold text-slate-900">{enq.name}</p>
                                <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-semibold border",
                                  enq.status === "pending"   ? "bg-yellow-50 text-yellow-700 border-yellow-200" :
                                  enq.status === "contacted" ? "bg-blue-50 text-blue-700 border-blue-200" :
                                  "bg-green-50 text-green-700 border-green-200"
                                )}>
                                  {enq.status.charAt(0).toUpperCase() + enq.status.slice(1)}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                                <a href={`tel:${enq.phone}`} className="flex items-center gap-1 text-blue-600 hover:underline">
                                  <Phone className="w-3 h-3" />{enq.phone}
                                </a>
                                <span className="flex items-center gap-1"><Map className="w-3 h-3" />{enq.destination}</span>
                                <span className="flex items-center gap-1"><Users className="w-3 h-3" />{enq.people} people</span>
                                {enq.travelDate && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{enq.travelDate}</span>}
                              </div>
                              <p className="text-sm font-semibold text-purple-700">{enq.packageName}</p>
                              {enq.message && <p className="text-sm text-muted-foreground italic">"{enq.message}"</p>}
                              <p className="text-xs text-muted-foreground">
                                {new Date(enq.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                              </p>
                            </div>
                            <div className="flex gap-2 shrink-0">
                              {enq.status !== "contacted" && (
                                <Button size="sm" variant="outline" className="text-blue-600 border-blue-200 hover:bg-blue-50 gap-1 text-xs"
                                  onClick={() => changeEnqStatus(enq.id, "contacted")}>
                                  <Phone className="w-3 h-3" /> Mark Contacted
                                </Button>
                              )}
                              {enq.status !== "converted" && (
                                <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white gap-1 text-xs"
                                  onClick={() => changeEnqStatus(enq.id, "converted")}>
                                  <CheckCircle2 className="w-3 h-3" /> Converted
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Users Tab */}
            <TabsContent value="users">
              <Card>
                <CardHeader className="bg-primary text-primary-foreground">
                  <CardTitle className="flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    User Management
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <p className="text-muted-foreground text-center py-8">User management features coming soon...</p>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── All Bookings Tab ───────────────────────────────────────────── */}
            <TabsContent value="bookings">
              <Card>
                <CardHeader className="bg-primary text-primary-foreground">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <CardTitle className="flex items-center gap-2">
                      <BookOpen className="w-5 h-5" />
                      All Customer Bookings
                      <span className="text-sm font-normal opacity-80 ml-1">
                        ({filteredBookings.length} of {adminBookings.length})
                      </span>
                    </CardTitle>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={fetchAdminBookings}
                      disabled={bookingsLoading}
                      className="self-start sm:self-auto"
                    >
                      <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", bookingsLoading && "animate-spin")} />
                      {bookingsLoading ? "Refreshing…" : "Refresh"}
                    </Button>
                  </div>
                </CardHeader>

                <CardContent className="p-0">
                  {/* ── Filter bar ── */}
                  <div className="flex flex-col gap-3 p-4 border-b bg-muted/30">
                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          placeholder="Search by name, phone, email or booking ID…"
                          className="pl-9"
                          value={bookingSearch}
                          onChange={(e) => setBookingSearch(e.target.value)}
                        />
                      </div>

                      <Select value={bookingStatusFilter} onValueChange={setBookingStatusFilter}>
                        <SelectTrigger className="w-full sm:w-40">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Statuses</SelectItem>
                          <SelectItem value="paid">Paid</SelectItem>
                          <SelectItem value="confirmed">Confirmed</SelectItem>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>

                      <Select value={bookingTypeFilter} onValueChange={setBookingTypeFilter}>
                        <SelectTrigger className="w-full sm:w-36">
                          <SelectValue placeholder="Type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Types</SelectItem>
                          <SelectItem value="flight">Flight</SelectItem>
                          <SelectItem value="hotel">Hotel</SelectItem>
                          <SelectItem value="bus">Bus</SelectItem>
                          <SelectItem value="package">Package</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Date range row */}
                    <div className="flex flex-col sm:flex-row gap-3 items-center">
                      <div className="flex items-center gap-2 flex-1">
                        <Label className="text-xs whitespace-nowrap text-muted-foreground">From</Label>
                        <Input type="date" className="h-9 text-sm flex-1" value={dateFrom}
                          onChange={(e) => setDateFrom(e.target.value)} />
                        <Label className="text-xs whitespace-nowrap text-muted-foreground">To</Label>
                        <Input type="date" className="h-9 text-sm flex-1" value={dateTo}
                          onChange={(e) => setDateTo(e.target.value)} />
                        {(dateFrom || dateTo) && (
                          <Button size="sm" variant="ghost" className="h-9 px-2 text-xs text-muted-foreground"
                            onClick={() => { setDateFrom(""); setDateTo(""); }}>
                            Clear
                          </Button>
                        )}
                      </div>
                      <Button size="sm" className="h-9 bg-emerald-600 hover:bg-emerald-700 gap-1.5 whitespace-nowrap"
                        onClick={handleExportCSV} disabled={filteredBookings.length === 0}>
                        <Download className="w-3.5 h-3.5" />
                        Export CSV ({filteredBookings.length})
                      </Button>
                    </div>
                  </div>

                  {/* ── Table ── */}
                  {bookingsLoading && adminBookings.length === 0 ? (
                    <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Loading bookings…
                    </div>
                  ) : filteredBookings.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
                      <BookOpen className="w-12 h-12 opacity-20" />
                      <p className="font-medium">No bookings found</p>
                      <p className="text-sm">
                        {adminBookings.length === 0
                          ? "Bookings will appear here after customers make their first purchase."
                          : "Try adjusting your search or filters."}
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="text-left px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap text-xs">Booking ID</th>
                            <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs">Customer</th>
                            <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs">Phone</th>
                            <th className="text-left px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap text-xs">Route</th>
                            <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs">Date</th>
                            <th className="text-right px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap text-xs">Markup</th>
                            <th className="text-right px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap text-xs">Conv. Fee</th>
                            <th className="text-right px-4 py-3 font-semibold text-red-600 whitespace-nowrap text-xs">Agent Comm.</th>
                            <th className="text-right px-4 py-3 font-semibold text-emerald-700 whitespace-nowrap text-xs">Net Profit</th>
                            <th className="text-right px-4 py-3 font-semibold text-muted-foreground whitespace-nowrap text-xs">Total</th>
                            <th className="text-center px-4 py-3 font-semibold text-muted-foreground text-xs">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredBookings.map((booking, idx) => {
                            const bookingId = booking.details?.bookingRef || booking.bookingRef || booking.bookingId || `BKG-${booking.id}`;
                            const name      = booking.customerName  || booking.passengerName  || "—";
                            const phone     = booking.customerPhone || booking.passengerPhone || booking.details?.customerPhone || "—";
                            const type      = booking.bookingType   || booking.type || "flight";
                            const fi        = booking.details?.flightInfo || {};
                            const from      = fi.from || booking.from || "—";
                            const to        = fi.to   || booking.to   || "—";
                            const date      = getBookingDate(booking) || "—";
                            const markupAmt  = getMarkupProfit(booking);
                            const convFeeAmt = getFeeProfit(booking);
                            const agentComm  = getAgentCommission(booking);
                            const netProfit  = getFee(booking) - agentComm;
                            const total      = getAmount(booking);
                            const rawStatus = booking.status || booking.details?.status || "paid";
                            const status    = rawStatus === "paid" || rawStatus === "confirmed" ? "paid"
                                            : rawStatus === "cancelled" ? "cancelled"
                                            : "pending";

                            return (
                              <tr
                                key={booking.id || idx}
                                className={cn(
                                  "border-b last:border-0 hover:bg-primary/5 transition-colors",
                                  idx % 2 === 0 ? "bg-white" : "bg-muted/10"
                                )}
                              >
                                {/* Booking ID */}
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <span className="font-mono text-xs bg-primary/10 text-primary px-2 py-1 rounded font-semibold">
                                    {bookingId}
                                  </span>
                                </td>

                                {/* Customer — show agent badge if booked via B2B agent */}
                                <td className="px-4 py-3 font-medium whitespace-nowrap text-sm">
                                  <div className="flex flex-col gap-0.5">
                                    {name}
                                    {(booking.agentId || booking.agentCode || booking.details?.agentId) && (
                                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 w-fit">
                                        <Building2 className="w-2.5 h-2.5" />
                                        {booking.agentCode || booking.details?.agentCode || "Agent"}
                                      </span>
                                    )}
                                  </div>
                                </td>

                                {/* Phone */}
                                <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{phone}</td>

                                {/* Route */}
                                <td className="px-4 py-3 whitespace-nowrap">
                                  {type === "flight" ? (
                                    <span className="flex items-center gap-1 text-sm font-semibold text-primary">
                                      {from}<ArrowRight className="w-3 h-3 opacity-60" />{to}
                                    </span>
                                  ) : type === "hotel" ? (
                                    <span className="flex items-center gap-1 text-green-700 text-xs">
                                      <Building2 className="w-3.5 h-3.5" /> Hotel
                                    </span>
                                  ) : type === "bus" ? (
                                    <span className="flex items-center gap-1 text-cyan-700 text-xs">
                                      <Bus className="w-3.5 h-3.5" /> {from}<ArrowRight className="w-3 h-3" />{to}
                                    </span>
                                  ) : (
                                    <span className="flex items-center gap-1 text-purple-700 text-xs">
                                      <Map className="w-3.5 h-3.5" /> Package
                                    </span>
                                  )}
                                </td>

                                {/* Date */}
                                <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">{date}</td>

                                {/* Markup */}
                                <td className="px-4 py-3 text-right whitespace-nowrap text-xs text-muted-foreground">
                                  {markupAmt > 0 ? `₹${markupAmt.toLocaleString("en-IN")}` : "—"}
                                </td>

                                {/* Conv. Fee */}
                                <td className="px-4 py-3 text-right whitespace-nowrap text-xs text-muted-foreground">
                                  {convFeeAmt > 0 ? `₹${convFeeAmt.toLocaleString("en-IN")}` : "—"}
                                </td>

                                {/* Agent Commission */}
                                <td className="px-4 py-3 text-right whitespace-nowrap text-xs">
                                  {agentComm > 0 ? (
                                    <span className="text-red-600 font-semibold">
                                      ₹{agentComm.toLocaleString("en-IN")}
                                    </span>
                                  ) : <span className="text-muted-foreground">—</span>}
                                </td>

                                {/* Net Profit */}
                                <td className="px-4 py-3 text-right whitespace-nowrap text-xs">
                                  {netProfit > 0 ? (
                                    <span className="text-emerald-700 font-bold">
                                      ₹{netProfit.toLocaleString("en-IN")}
                                    </span>
                                  ) : netProfit < 0 ? (
                                    <span className="text-red-600 font-semibold">
                                      −₹{Math.abs(netProfit).toLocaleString("en-IN")}
                                    </span>
                                  ) : "—"}
                                </td>

                                {/* Total */}
                                <td className="px-4 py-3 text-right font-bold whitespace-nowrap text-sm">
                                  {total > 0 ? (
                                    <span className="text-orange-600">₹{total.toLocaleString("en-IN")}</span>
                                  ) : "—"}
                                </td>

                                {/* Status */}
                                <td className="px-4 py-3 text-center">
                                  {status === "paid" ? (
                                    <Badge className="bg-green-100 text-green-800 border-green-200 hover:bg-green-100 gap-1 text-[10px]">
                                      <CheckCircle className="w-3 h-3" /> Paid
                                    </Badge>
                                  ) : status === "cancelled" ? (
                                    <Badge className="bg-red-100 text-red-800 border-red-200 hover:bg-red-100 gap-1 text-[10px]">
                                      <XCircle className="w-3 h-3" /> Cancelled
                                    </Badge>
                                  ) : (
                                    <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 hover:bg-yellow-100 gap-1 text-[10px]">
                                      <Clock className="w-3 h-3" /> Pending
                                    </Badge>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* ── Summary footer ── */}
                  {filteredBookings.length > 0 && (
                    <div className="border-t px-4 py-3 bg-muted/20 flex flex-wrap gap-6 text-sm text-muted-foreground">
                      <span>
                        <span className="font-semibold text-foreground">{filteredBookings.length}</span> bookings
                      </span>
                      <span>
                        Revenue:{" "}
                        <span className="font-semibold text-orange-600">
                          ₹{filteredBookings.reduce((s, b) => s + getAmount(b), 0).toLocaleString("en-IN")}
                        </span>
                      </span>
                      <span>
                        Profit:{" "}
                        <span className="font-semibold text-emerald-600">
                          ₹{filteredBookings.reduce((s, b) => s + getFee(b), 0).toLocaleString("en-IN")}
                        </span>
                      </span>
                      <span>
                        Agent Comm.:{" "}
                        <span className="font-semibold text-red-600">
                          ₹{filteredBookings.reduce((s, b) => s + getAgentCommission(b), 0).toLocaleString("en-IN")}
                        </span>
                      </span>
                      <span className="font-semibold">
                        Net Profit:{" "}
                        <span className="text-emerald-800 font-extrabold">
                          ₹{(filteredBookings.reduce((s, b) => s + getFee(b), 0) - filteredBookings.reduce((s, b) => s + getAgentCommission(b), 0)).toLocaleString("en-IN")}
                        </span>
                      </span>
                      <span>
                        Paid:{" "}
                        <span className="font-semibold text-green-700">
                          {filteredBookings.filter((b) => {
                            const s = b.status || b.details?.status || "paid";
                            return s === "paid" || s === "confirmed";
                          }).length}
                        </span>
                      </span>
                      {bookingsLoading && (
                        <span className="flex items-center gap-1 text-xs">
                          <RefreshCw className="w-3 h-3 animate-spin" /> Syncing…
                        </span>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Push Notifications ─────────────────────────────────────── */}
            <TabsContent value="push-notifications" className="space-y-6">
              <PushNotificationsPanel />
            </TabsContent>

          </Tabs>
        </div>
      </div>
    </AdminLayout>
  );
}

// ── Push Notifications Admin Panel ────────────────────────────────────────────
function PushNotificationsPanel() {
  const { toast } = useToast();
  const [stats, setStats] = useState<{ totalTokens: number; activeTokens: number; notificationsByType: Record<string, number> } | null>(null);
  const [loading, setLoading] = useState(false);
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastBody,  setBroadcastBody]  = useState("");
  const [broadcastUrl,   setBroadcastUrl]   = useState("");
  const [sending, setSending] = useState(false);
  const base = (import.meta as any).env.BASE_URL?.replace(/\/$/, "") || "";

  const loadStats = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${base}/api/push/stats`);
      if (res.ok) setStats(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { loadStats(); }, []);

  const sendBroadcast = async () => {
    if (!broadcastTitle.trim() || !broadcastBody.trim()) {
      toast({ title: "Fill in title and message", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`${base}/api/push/broadcast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: broadcastTitle, body: broadcastBody, url: broadcastUrl || undefined }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: `Sent to ${data.sent} devices ✓`, description: `${data.failed} failed. ${data.expiredDeactivated} tokens cleaned up.` });
        setBroadcastTitle(""); setBroadcastBody(""); setBroadcastUrl("");
        loadStats();
      } else {
        toast({ title: "Broadcast failed", description: data.error, variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
    setSending(false);
  };

  const PRESET_MESSAGES = [
    { label: "Daily Deals", title: "Today's Best Travel Deals ✈️", body: "Flights from ₹999! Hotels at up to 40% off. Book now before they're gone." },
    { label: "Weekend Offer", title: "Weekend Getaway? 🌴", body: "Explore our curated holiday packages. Limited slots available — grab yours now!" },
    { label: "Flash Sale", title: "Flash Sale — 2 Hours Only! ⚡", body: "Special fares on top routes. Use code FLASH200 for extra ₹200 off." },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2"><Bell className="w-5 h-5 text-orange-500" /> Push Notifications</h2>
        <p className="text-sm text-muted-foreground mt-1">Send browser/app push notifications to all subscribed users.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Active Subscribers", value: stats?.activeTokens ?? "—", icon: <Smartphone className="w-4 h-4 text-blue-500" />, color: "bg-blue-50" },
          { label: "Total Registered", value: stats?.totalTokens ?? "—", icon: <Bell className="w-4 h-4 text-purple-500" />, color: "bg-purple-50" },
          { label: "Welcome Sent", value: stats?.notificationsByType?.["welcome"] ?? 0, icon: <CheckCircle2 className="w-4 h-4 text-green-500" />, color: "bg-green-50" },
          { label: "Broadcasts Sent", value: stats?.notificationsByType?.["broadcast"] ?? 0, icon: <Send className="w-4 h-4 text-orange-500" />, color: "bg-orange-50" },
        ].map((s) => (
          <Card key={s.label} className={`${s.color} border-0`}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm">{s.icon}</div>
              <div>
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-xl font-bold">{loading ? "…" : s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Broadcast Panel */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Send className="w-4 h-4" /> Send Broadcast Notification</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>Quick Presets</Label>
            <div className="flex flex-wrap gap-2">
              {PRESET_MESSAGES.map((p) => (
                <button key={p.label} onClick={() => { setBroadcastTitle(p.title); setBroadcastBody(p.body); }}
                  className="px-3 py-1.5 text-xs rounded-full border border-orange-200 text-orange-700 hover:bg-orange-50 transition-colors">
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="push-title">Title *</Label>
            <Input id="push-title" placeholder="e.g. Flash Sale — Limited Time!" value={broadcastTitle} onChange={(e) => setBroadcastTitle(e.target.value)} maxLength={65} />
            <p className="text-xs text-muted-foreground">{broadcastTitle.length}/65</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="push-body">Message *</Label>
            <textarea id="push-body" rows={3} placeholder="e.g. Book flights at ₹999 today only! Use code DEAL200 at checkout."
              value={broadcastBody} onChange={(e) => setBroadcastBody(e.target.value)} maxLength={200}
              className="w-full border rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-400" />
            <p className="text-xs text-muted-foreground">{broadcastBody.length}/200</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="push-url">Link URL (optional)</Label>
            <Input id="push-url" placeholder="e.g. /holidays or /flights" value={broadcastUrl} onChange={(e) => setBroadcastUrl(e.target.value)} />
          </div>
          <Button onClick={sendBroadcast} disabled={sending || !broadcastTitle || !broadcastBody}
            className="bg-orange-500 hover:bg-orange-600 text-white gap-2">
            <Send className="w-4 h-4" />
            {sending ? "Sending…" : `Broadcast to ${stats?.activeTokens ?? 0} Subscribers`}
          </Button>
          {stats?.activeTokens === 0 && (
            <p className="text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded p-3">
              No active subscribers yet. Users will be prompted to allow notifications when they visit the site.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Bell className="w-4 h-4" /> How Push Notifications Work</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>• <strong>Welcome:</strong> Sent automatically when a user grants permission for the first time.</p>
          <p>• <strong>Booking Confirmation:</strong> Sent immediately after a successful payment.</p>
          <p>• <strong>Daily Offers / Broadcasts:</strong> Use the panel above to send to all active subscribers.</p>
          <p>• <strong>Expired tokens</strong> are cleaned up automatically when a broadcast is sent.</p>
          <div className="mt-3 p-3 rounded bg-blue-50 border border-blue-100 text-blue-800 text-xs">
            <strong>Firebase Setup Required:</strong> Push notifications need Firebase credentials. Set VITE_FIREBASE_API_KEY, VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_MESSAGING_SENDER_ID, VITE_FIREBASE_APP_ID, VITE_FIREBASE_VAPID_KEY (frontend) and FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY (backend) in environment secrets.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
