import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { apiFetchCoupons, apiFetchCouponUsageCounts, apiCreateCoupon, apiDeleteCoupon } from "@/lib/coupon";
import { useLocation } from "wouter";
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
  ShieldCheck,
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
  Mail,
  Copy,
  Loader2,
  StickyNote,
  User,
  Hash,
  Eye,
  Hotel,
} from "lucide-react";
import { getMarkupSettings, getHiddenMarkupSettings, getHiddenMarkupAmount, getAgentMarkupSettings, type MarkupSettings, type MarkupConfig } from "@/lib/pricing";
import { useMarkupContext } from "@/contexts/markup-context";
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
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export default function AdminDashboard() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const {
    convenienceFee: convFeeFromDB,
    hiddenMarkup: hiddenMarkupFromDB,
    agentMarkup: agentMarkupFromDB,
    isLoading: markupLoading,
    saveConvenienceFee: saveConvenienceFeeCtx,
    saveHiddenMarkup: saveHiddenMarkupCtx,
    saveAgentMarkup: saveAgentMarkupCtx,
  } = useMarkupContext();
  const [activeTab, setActiveTab] = useState("bookings");
  const [showRevenueModal, setShowRevenueModal] = useState(false);
  const [showProfitModal, setShowProfitModal] = useState(false);

  // ── Convenience Fee settings state (VISIBLE to customers) ─────────────────
  const [markup, setMarkup] = useState<MarkupSettings>(() => getMarkupSettings());
  const [markupDraft, setMarkupDraft] = useState<MarkupSettings>(() => getMarkupSettings());

  const handleSaveMarkup = async () => {
    await saveConvenienceFeeCtx(markupDraft);
    setMarkup(markupDraft);
    toast({ title: "Convenience Fee settings saved!", description: "Visible fee updated across all services." });
  };

  // ── Customer Markup settings state (INTERNAL profit — never shown to customers)
  const [hiddenMarkup, setHiddenMarkup] = useState<MarkupSettings>(() => getHiddenMarkupSettings());
  const [hiddenMarkupDraft, setHiddenMarkupDraft] = useState<MarkupSettings>(() => getHiddenMarkupSettings());

  const handleSaveHiddenMarkup = async () => {
    await saveHiddenMarkupCtx(hiddenMarkupDraft);
    setHiddenMarkup(hiddenMarkupDraft);
    toast({ title: "Customer markup saved!", description: "Customer pricing updated across all services." });
  };

  // ── Global Agent Markup settings state (B2B — lower than customer markup)
  const [agentMarkup, setAgentMarkup] = useState<MarkupSettings>(() => getAgentMarkupSettings());
  const [agentMarkupDraft, setAgentMarkupDraft] = useState<MarkupSettings>(() => getAgentMarkupSettings());

  const handleSaveAgentMarkup = async () => {
    await saveAgentMarkupCtx(agentMarkupDraft);
    setAgentMarkup(agentMarkupDraft);
    toast({ title: "Agent markup saved!", description: "Global agent pricing updated across all services." });
  };

  // Sync markup state from DB when MarkupProvider finishes loading
  useEffect(() => {
    if (!markupLoading) {
      setMarkup(convFeeFromDB);
      setMarkupDraft(convFeeFromDB);
      setHiddenMarkup(hiddenMarkupFromDB);
      setHiddenMarkupDraft(hiddenMarkupFromDB);
      setAgentMarkup(agentMarkupFromDB);
      setAgentMarkupDraft(agentMarkupFromDB);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markupLoading]);

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
  const [couponUsageCounts, setCouponUsageCounts] = useState<Record<string, number>>({});
  const [couponLoading, setCouponLoading] = useState(false);

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

  // Load coupons from API (server-backed, cross-device)
  const loadCouponsFromApi = useCallback(async () => {
    setCouponLoading(true);
    try {
      const [couponsData, usageCounts] = await Promise.all([
        apiFetchCoupons(),
        apiFetchCouponUsageCounts(),
      ]);
      setCoupons(couponsData as any);
      setCouponUsageCounts(usageCounts);
    } catch (e) {
      console.error("Failed to load coupons from API:", e);
    } finally {
      setCouponLoading(false);
    }
  }, []);

  // Load coupons and packages on mount
  useEffect(() => {
    loadCouponsFromApi();

    const savedPackages = localStorage.getItem("packages");
    if (savedPackages) {
      try {
        setPackages(JSON.parse(savedPackages));
      } catch (e) {
        console.error("Error loading packages:", e);
        setPackages([]);
      }
    }
  }, []);


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

    // Save to server via API
    apiCreateCoupon({
      code,
      discount,
      discountType: newCoupon.discountType,
      type: newCoupon.type,
      allowed_phone: newCoupon.type === "user_specific" ? newCoupon.allowed_phone.trim() : undefined,
      validUntil,
      firstTimeOnly: newCoupon.type === "welcome",
      usageLimit: newCoupon.usageLimit ? parseInt(newCoupon.usageLimit) : 0,
      minBookingAmount: newCoupon.minBookingAmount ? parseFloat(newCoupon.minBookingAmount) : 0,
      service_type: (newCoupon.service_type || undefined) as any,
      flight_type: (newCoupon.service_type === "flight" && newCoupon.flight_type ? newCoupon.flight_type : undefined) as any,
      airline: newCoupon.service_type === "flight" && newCoupon.airline.trim() ? newCoupon.airline.trim() : undefined,
      description: newCoupon.description.trim() || undefined,
    }).then(() => {
      toast({ title: "Coupon Added Successfully!", description: `Coupon "${code}" has been created.` });
      loadCouponsFromApi(); // refresh list from server
    }).catch((err) => {
      toast({ variant: "destructive", title: "Failed to create coupon", description: err?.message ?? "Server error" });
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
    const code = couponToDelete;
    setShowDeleteDialog(false);
    setCouponToDelete(null);

    apiDeleteCoupon(code).then(() => {
      toast({ title: "Coupon Deleted", description: `Coupon "${code}" has been removed.` });
      loadCouponsFromApi(); // refresh list from server
    }).catch((err) => {
      toast({ variant: "destructive", title: "Failed to delete coupon", description: err?.message ?? "Server error" });
    });
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
  const [viewBooking, setViewBooking] = useState<any>(null);

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

  // Booking passes this check only when it is Confirmed or Completed.
  // Pending, Failed, Cancelled, and Abandoned bookings contribute ₹0 to revenue/profit.
  const isPaidConfirmed = (b: any): boolean => {
    const s = (b.status || "").toLowerCase();
    return s === "confirmed" || s === "completed";
  };

  // Derived stats from real booking data
  const stats = useMemo(() => {
    // Revenue and profit: ONLY from paid bookings
    const paidBookings           = adminBookings.filter(isPaidConfirmed);
    const totalRevenue           = paidBookings.reduce((sum, b) => sum + getAmount(b), 0);
    const totalProfit            = paidBookings.reduce((sum, b) => sum + getFee(b), 0);
    const totalAgentCommission   = paidBookings.reduce((sum, b) => sum + getAgentCommission(b), 0);
    const todayBookings          = paidBookings.filter((b) => getBookingDate(b) === todayStr);
    const thisMonthBookings      = paidBookings.filter((b) => getBookingDate(b).startsWith(thisMonthStr));

    // Status counters (over all bookings, not just paid)
    const successfulBookings = paidBookings.filter((b) => {
      const s  = (b.status        || "").toLowerCase();
      const bs = (b.bookingStatus || "").toLowerCase();
      return s === "confirmed" || bs === "confirmed";
    }).length;
    const pendingLeads = adminBookings.filter((b) => {
      const ps = (b.paymentStatus || "").toLowerCase();
      const bs = (b.bookingStatus || "").toLowerCase();
      return ps === "pending" || bs === "pending";
    }).length;
    const failedPayments = adminBookings.filter((b) => {
      const ps = (b.paymentStatus || "").toLowerCase();
      const s  = (b.status        || "").toLowerCase();
      return ps === "failed" || s === "booking_failed";
    }).length;
    const cancelledBookings = adminBookings.filter((b) => {
      const s = (b.status || "").toLowerCase();
      return s === "cancelled" || s === "refunded";
    }).length;

    // Split by who made the booking (only paid bookings for revenue/profit splits)
    const customerBks = paidBookings.filter((b) => getBookingRole(b) === "customer");
    const agentBks    = paidBookings.filter((b) => getBookingRole(b) === "agent");
    const staffBks    = paidBookings.filter((b) => getBookingRole(b) === "staff");

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

    // Lead metrics (pending + failed = unconverted leads)
    const pendingBookings = adminBookings.filter((b) => {
      const ps = (b.paymentStatus || "").toLowerCase();
      const s  = (b.status        || "").toLowerCase();
      return ps === "pending" || s === "pending";
    }).length;
    const failedBookings = adminBookings.filter((b) => {
      const ps = (b.paymentStatus || "").toLowerCase();
      const s  = (b.status        || "").toLowerCase();
      return ps === "failed" || s === "booking_failed";
    }).length;
    const totalLeads = adminBookings.filter((b) => {
      const ps = (b.paymentStatus || "").toLowerCase();
      const s  = (b.status        || "").toLowerCase();
      return ps === "pending" || ps === "failed" || s === "pending" || s === "booking_failed";
    }).length;

    return {
      totalBookings:       adminBookings.length,
      todayBookings:       todayBookings.length,
      flightBookings:      adminBookings.filter((b) => (b.bookingType || b.type) === "flight").length,
      hotelBookings:       adminBookings.filter((b) => (b.bookingType || b.type) === "hotel").length,
      holidayBookings:     adminBookings.filter((b) => (b.bookingType || b.type) === "package").length,
      busBookings:         adminBookings.filter((b) => (b.bookingType || b.type) === "bus").length,
      // Financial figures — confirmed/completed bookings only
      totalRevenue,
      confirmedRevenue:    totalRevenue,
      todayRevenue:        todayBookings.reduce((sum, b) => sum + getAmount(b), 0),
      thisMonthRevenue:    thisMonthBookings.reduce((sum, b) => sum + getAmount(b), 0),
      totalProfit,
      markupProfit:        paidBookings.reduce((sum, b) => sum + getMarkupProfit(b), 0),
      feeProfit:           paidBookings.reduce((sum, b) => sum + getFeeProfit(b), 0),
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
        flights:  paidBookings.filter((b) => (b.bookingType || b.type) === "flight").reduce((s, b) => s + getFee(b), 0),
        hotels:   paidBookings.filter((b) => (b.bookingType || b.type) === "hotel").reduce((s, b) => s + getFee(b), 0),
        buses:    paidBookings.filter((b) => (b.bookingType || b.type) === "bus").reduce((s, b) => s + getFee(b), 0),
        packages: paidBookings.filter((b) => (b.bookingType || b.type) === "package").reduce((s, b) => s + getFee(b), 0),
      },
      commissionByService: {
        flights:  paidBookings.filter((b) => (b.bookingType || b.type) === "flight").reduce((s, b) => s + getAgentCommission(b), 0),
        hotels:   paidBookings.filter((b) => (b.bookingType || b.type) === "hotel").reduce((s, b) => s + getAgentCommission(b), 0),
        buses:    paidBookings.filter((b) => (b.bookingType || b.type) === "bus").reduce((s, b) => s + getAgentCommission(b), 0),
        packages: paidBookings.filter((b) => (b.bookingType || b.type) === "package").reduce((s, b) => s + getAgentCommission(b), 0),
      },
      // Status counters
      successfulBookings,
      pendingLeads,
      failedPayments,
      cancelledBookings,
      // Lead metrics
      totalLeads,
      pendingBookings,
      failedBookings,
    };
  }, [adminBookings]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Chart data: last 14 days ────────────────────────────────────────────────
  const chartData = useMemo(() => {
    const days: { date: string; label: string; bookings: number; revenue: number; profit: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key   = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
      const dayBs = adminBookings.filter((b) => getBookingDate(b) === key);
      // Revenue only from confirmed/completed bookings
      const confirmedDayBs = dayBs.filter((b) => {
        const s = (b.status || "").toLowerCase();
        return s === "confirmed" || s === "completed";
      });
      days.push({
        date:     key,
        label,
        bookings: dayBs.length,
        revenue:  confirmedDayBs.reduce((s, b) => s + getAmount(b), 0),
        profit:   confirmedDayBs.reduce((s, b) => s + getFee(b), 0),
      });
    }
    return days;
  }, [adminBookings]);

  // ── CSV Export ──────────────────────────────────────────────────────────────
  const handleExportCSV = () => {
    const rows = [
      ["Booking ID","Customer","Phone","Email","Type","Route","Date","Base Price","Conv. Fee","Total","Booking Status","Payment Status","In Revenue"],
      ...filteredBookings.map((b) => {
        const fi = b.details?.flightInfo || {};
        const route = fi.from && fi.to ? `${fi.from} → ${fi.to}` : (b.bookingType || b.type || "");
        const bStatus = (b.status || "").toLowerCase();
        const inRevenue = bStatus === "confirmed" || bStatus === "completed" ? "Yes" : "No";
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
          b.status || b.details?.status || "",
          b.paymentStatus || "",
          inRevenue,
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

          {/* ── Summary Cards Row 2: Lead / Pipeline Metrics ─────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <Card className="border-2 border-indigo-200 bg-indigo-50">
              <CardContent className="p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                  <BookOpen className="w-6 h-6 text-indigo-600" />
                </div>
                <div>
                  <p className="text-xs font-medium text-indigo-600 uppercase tracking-wider">Total Leads</p>
                  <p className="text-3xl font-bold text-indigo-700">{stats.totalLeads}</p>
                  <p className="text-xs text-indigo-500">Pending + Failed</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-2 border-amber-200 bg-amber-50">
              <CardContent className="p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                  <Clock className="w-6 h-6 text-amber-600" />
                </div>
                <div>
                  <p className="text-xs font-medium text-amber-600 uppercase tracking-wider">Pending Bookings</p>
                  <p className="text-3xl font-bold text-amber-700">{stats.pendingBookings}</p>
                  <p className="text-xs text-amber-500">Awaiting payment</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-2 border-red-200 bg-red-50">
              <CardContent className="p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                  <XCircle className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <p className="text-xs font-medium text-red-600 uppercase tracking-wider">Failed Bookings</p>
                  <p className="text-3xl font-bold text-red-700">{stats.failedBookings}</p>
                  <p className="text-xs text-red-500">Payment / booking failed</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-2 border-emerald-300 bg-emerald-50">
              <CardContent className="p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs font-medium text-emerald-600 uppercase tracking-wider">Confirmed Revenue</p>
                  <p className="text-xl font-bold text-emerald-700">₹{stats.confirmedRevenue.toLocaleString("en-IN")}</p>
                  <p className="text-xs text-emerald-500">Confirmed + Completed only</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ── Summary Cards Row 3: Profit split by Customer / Agent / Staff ─── */}
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
                                  const t = coupon.type === "welcome" ? "welcome"
                                          : coupon.type === "user_specific" ? "user_specific"
                                          : (coupon as any).firstTimeOnly ? "welcome" : "public";
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
                                {/* Usage count */}
                                {(() => {
                                  const count = couponUsageCounts[coupon.code] ?? 0;
                                  const limit = coupon.usageLimit ?? 0;
                                  return (
                                    <div className="flex items-center gap-1 text-xs font-medium mt-1">
                                      {count > 0 ? (
                                        <span className="flex items-center gap-1 text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
                                          <CheckCircle className="w-3 h-3" />
                                          {count} redemption{count !== 1 ? "s" : ""}
                                          {limit > 0 && ` / ${limit}`}
                                        </span>
                                      ) : (
                                        <span className="text-slate-400 italic">Not used yet</span>
                                      )}
                                    </div>
                                  );
                                })()}
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
                                  "border-b last:border-0 hover:bg-primary/5 transition-colors cursor-pointer",
                                  idx % 2 === 0 ? "bg-white" : "bg-muted/10"
                                )}
                                onClick={() => setViewBooking(booking)}
                              >
                                {/* Booking ID */}
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <button
                                    className="font-mono text-xs bg-primary/10 text-primary px-2 py-1 rounded font-semibold hover:bg-primary/20 transition-colors"
                                    onClick={(e) => { e.stopPropagation(); setViewBooking(booking); }}
                                  >
                                    {bookingId}
                                  </button>
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

              {/* ── Booking Detail Sheet ── */}
              <AdminBookingDetailSheet
                booking={viewBooking}
                open={!!viewBooking}
                onOpenChange={(open) => { if (!open) setViewBooking(null); }}
                onRefresh={fetchAdminBookings}
              />
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

// ── Admin Booking Detail Sheet ────────────────────────────────────────────────
function AdminBookingDetailSheet({
  booking,
  open,
  onOpenChange,
  onRefresh,
}: {
  booking: any;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onRefresh?: () => void;
}) {
  const { toast } = useToast();
  const [detailTab, setDetailTab] = useState("overview");
  const [resending, setResending] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [localNotes, setLocalNotes] = useState<any[]>([]);
  const [localStatus, setLocalStatus] = useState<string | null>(null);

  useEffect(() => {
    if (booking) {
      setLocalNotes(booking.details?.adminNotes || []);
      setLocalStatus(null);
      setDetailTab("overview");
      setNoteText("");
    }
  }, [booking?.id]);

  if (!booking) return null;

  function getAuthHeader(): Record<string, string> {
    const token =
      localStorage.getItem("admin_token") ||
      localStorage.getItem("admin_jwt") ||
      localStorage.getItem("jwt_token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  const bookingDbId = booking.id;
  const bookingRef =
    booking.details?.bookingRef ||
    booking.bookingRef ||
    booking.bookingId ||
    `#${booking.id}`;
  const name = booking.customerName || booking.passengerName || "—";
  const email = booking.customerEmail || booking.passengerEmail || "—";
  const phone =
    booking.customerPhone ||
    booking.passengerPhone ||
    booking.details?.customerPhone ||
    "—";
  const type = booking.bookingType || booking.type || "flight";
  const amount =
    booking.amount ?? booking.details?.amount ?? booking.totalPrice ?? 0;
  const currentStatus =
    localStatus ?? booking.status ?? booking.details?.status ?? "paid";
  const paymentId =
    booking.paymentId || booking.details?.paymentId || "—";
  const paymentMethod =
    booking.paymentMethod || booking.details?.paymentMethod || "—";
  const travelDate =
    booking.travelDate ||
    booking.details?.travelDate ||
    booking.details?.checkIn ||
    "—";
  const createdAt = booking.createdAt || booking.details?.createdAt || "—";
  const d = booking.details || {};
  const fi = d.flightInfo || {};

  const typeBadgeCls: Record<string, string> = {
    flight: "bg-blue-100 text-blue-700 border-blue-200",
    hotel: "bg-green-100 text-green-700 border-green-200",
    bus: "bg-cyan-100 text-cyan-700 border-cyan-200",
    package: "bg-purple-100 text-purple-700 border-purple-200",
  };
  const statusBadgeCls =
    currentStatus === "confirmed" || currentStatus === "paid"
      ? "bg-green-100 text-green-800 border-green-200"
      : currentStatus === "cancelled"
      ? "bg-red-100 text-red-800 border-red-200"
      : "bg-yellow-100 text-yellow-800 border-yellow-200";

  async function resend(channel: string) {
    setResending(channel);
    try {
      const res = await fetch(`/api/admin/bookings/${bookingDbId}/resend`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
        body: JSON.stringify({ channel }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: `Notification resent via ${channel} ✓` });
      } else {
        toast({
          title: "Resend failed",
          description: data.error || "Unknown error",
          variant: "destructive",
        });
      }
    } catch (e: any) {
      toast({
        title: "Network error",
        description: e.message,
        variant: "destructive",
      });
    }
    setResending(null);
  }

  async function changeStatus(status: string) {
    setActing(true);
    try {
      const res = await fetch(
        `/api/admin/bookings/${bookingDbId}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeader(),
          },
          body: JSON.stringify({ status }),
        }
      );
      if (res.ok) {
        setLocalStatus(status);
        toast({ title: `Booking marked as ${status} ✓` });
        onRefresh?.();
      } else {
        const data = await res.json();
        toast({
          title: "Status update failed",
          description: data.error,
          variant: "destructive",
        });
      }
    } catch (e: any) {
      toast({
        title: "Network error",
        description: e.message,
        variant: "destructive",
      });
    }
    setActing(false);
  }

  async function addNote() {
    if (!noteText.trim()) return;
    setAddingNote(true);
    try {
      const res = await fetch(
        `/api/admin/bookings/${bookingDbId}/notes`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeader(),
          },
          body: JSON.stringify({ note: noteText.trim() }),
        }
      );
      if (res.ok) {
        const newNote = {
          note: noteText.trim(),
          addedAt: new Date().toISOString(),
          addedBy: "admin",
        };
        setLocalNotes((prev) => [...prev, newNote]);
        setNoteText("");
        toast({ title: "Note added ✓" });
      }
    } catch {}
    setAddingNote(false);
  }

  function copyBooking() {
    const text = [
      `Booking ID: ${bookingRef}`,
      `Customer: ${name}`,
      `Email: ${email}`,
      `Phone: ${phone}`,
      `Type: ${type}`,
      `Amount: ₹${amount.toLocaleString("en-IN")}`,
      `Status: ${currentStatus}`,
      `Payment ID: ${paymentId}`,
      `Travel Date: ${travelDate}`,
      `Booked At: ${createdAt !== "—" ? new Date(createdAt).toLocaleString("en-IN") : "—"}`,
    ].join("\n");
    navigator.clipboard
      .writeText(text)
      .then(() => toast({ title: "Booking details copied ✓" }));
  }

  const timeline = [
    createdAt !== "—"
      ? { label: "Booking Created", time: createdAt, color: "bg-blue-500" }
      : null,
    paymentId !== "—"
      ? {
          label: "Payment Received",
          time: createdAt,
          color: "bg-green-500",
          sub: paymentId,
        }
      : null,
    currentStatus === "confirmed" || currentStatus === "paid"
      ? {
          label: "Booking Confirmed",
          time: createdAt,
          color: "bg-emerald-600",
        }
      : null,
    currentStatus === "cancelled"
      ? { label: "Booking Cancelled", time: travelDate, color: "bg-red-500" }
      : null,
  ].filter(Boolean) as { label: string; time: string; color: string; sub?: string }[];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl overflow-y-auto p-0 flex flex-col"
      >
        {/* ── Header ── */}
        <div className="sticky top-0 z-10 bg-white border-b px-5 py-4 flex-shrink-0">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-sm font-bold text-primary">
                  {bookingRef}
                </span>
                <Badge
                  className={cn(
                    "text-[10px] border capitalize",
                    typeBadgeCls[type] || "bg-gray-100 text-gray-700"
                  )}
                >
                  {type}
                </Badge>
                <Badge
                  className={cn(
                    "text-[10px] border capitalize",
                    statusBadgeCls
                  )}
                >
                  {currentStatus}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5 truncate">
                {name} · {phone}
              </p>
            </div>
          </div>

          {/* Quick action buttons */}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1.5"
              onClick={() => resend("email")}
              disabled={!!resending}
            >
              {resending === "email" ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Mail className="w-3 h-3" />
              )}{" "}
              Email
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1.5"
              onClick={() => resend("sms")}
              disabled={!!resending}
            >
              {resending === "sms" ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Phone className="w-3 h-3" />
              )}{" "}
              SMS
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1.5"
              onClick={() => resend("whatsapp")}
              disabled={!!resending}
            >
              {resending === "whatsapp" ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <MessageSquare className="w-3 h-3" />
              )}{" "}
              WhatsApp
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1.5"
              onClick={() => resend("all")}
              disabled={!!resending}
            >
              {resending === "all" ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Send className="w-3 h-3" />
              )}{" "}
              Resend All
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1.5"
              onClick={copyBooking}
            >
              <Copy className="w-3 h-3" /> Copy
            </Button>
            {bookingDbId && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1.5"
                onClick={() =>
                  window.open(`/api/tickets/${bookingDbId}`, "_blank")
                }
              >
                <Eye className="w-3 h-3" /> View Ticket
              </Button>
            )}
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="p-4 flex-1 overflow-y-auto">
          <Tabs value={detailTab} onValueChange={setDetailTab}>
            <TabsList className="w-full grid grid-cols-4 mb-4">
              <TabsTrigger value="overview" className="text-xs">
                Overview
              </TabsTrigger>
              <TabsTrigger value="details" className="text-xs">
                Details
              </TabsTrigger>
              <TabsTrigger value="timeline" className="text-xs">
                Timeline
              </TabsTrigger>
              <TabsTrigger value="notes" className="text-xs">
                Notes
                {localNotes.length > 0 && (
                  <span className="ml-1 bg-amber-500 text-white text-[9px] rounded-full px-1.5 py-0.5">
                    {localNotes.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            {/* ── Overview Tab ── */}
            <TabsContent value="overview" className="space-y-4 mt-0">
              {/* Customer card */}
              <div className="rounded-xl border bg-blue-50/50 p-4 space-y-3">
                <p className="text-xs font-bold text-blue-700 uppercase tracking-wider flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" /> Customer Information
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Name</p>
                    <p className="font-medium">{name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Phone</p>
                    <p className="font-medium">{phone}</p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-xs text-muted-foreground">Email</p>
                    <p className="font-medium break-all">{email}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Travel Date</p>
                    <p className="font-medium">{travelDate}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Passengers</p>
                    <p className="font-medium">
                      {d.passengers?.length || d.guests?.length || 1}
                    </p>
                  </div>
                  {(booking.userId || d.userId) && (
                    <div>
                      <p className="text-xs text-muted-foreground">User ID</p>
                      <p className="font-medium text-muted-foreground text-xs">
                        {booking.userId || d.userId}
                      </p>
                    </div>
                  )}
                  {(booking.agentCode || d.agentCode) && (
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Agent Code
                      </p>
                      <p className="font-medium text-blue-700">
                        {booking.agentCode || d.agentCode}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Payment card */}
              <div className="rounded-xl border bg-emerald-50/50 p-4 space-y-3">
                <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
                  <IndianRupee className="w-3.5 h-3.5" /> Payment Information
                </p>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">Total Amount</p>
                  <p className="text-2xl font-extrabold text-emerald-700">
                    ₹{amount.toLocaleString("en-IN")}
                  </p>
                </div>
                <Separator />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Payment Status
                    </p>
                    <Badge
                      className={cn(
                        "text-[10px] border capitalize mt-0.5",
                        statusBadgeCls
                      )}
                    >
                      {currentStatus}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Method</p>
                    <p className="font-medium capitalize">{paymentMethod}</p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-xs text-muted-foreground">
                      Razorpay Payment ID
                    </p>
                    <p className="font-mono text-xs break-all">{paymentId}</p>
                  </div>
                  {(d.orderId || booking.orderId) && (
                    <div className="sm:col-span-2">
                      <p className="text-xs text-muted-foreground">Order ID</p>
                      <p className="font-mono text-xs break-all">
                        {d.orderId || booking.orderId}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Support actions */}
              <div className="rounded-xl border p-4 space-y-3">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Support Actions
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 gap-1.5 text-xs"
                    onClick={() => changeStatus("confirmed")}
                    disabled={
                      acting || currentStatus === "confirmed"
                    }
                  >
                    {acting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle className="w-3.5 h-3.5" />
                    )}{" "}
                    Mark Confirmed
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="gap-1.5 text-xs"
                    onClick={() => changeStatus("cancelled")}
                    disabled={
                      acting || currentStatus === "cancelled"
                    }
                  >
                    {acting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5" />
                    )}{" "}
                    Cancel Booking
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-xs"
                    onClick={() => setDetailTab("notes")}
                  >
                    <StickyNote className="w-3.5 h-3.5" /> Add Note
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* ── Details Tab ── */}
            <TabsContent value="details" className="space-y-4 mt-0">
              {/* Flight */}
              {type === "flight" && (
                <div className="rounded-xl border bg-blue-50/50 p-4 space-y-3">
                  <p className="text-xs font-bold text-blue-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Plane className="w-3.5 h-3.5" /> Flight Information
                  </p>
                  <div className="flex items-center gap-3 justify-center py-3 bg-blue-100 rounded-lg">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-blue-800">
                        {fi.from || d.from || "—"}
                      </p>
                      <p className="text-xs text-blue-600">
                        {fi.departureTime || d.departureTime || ""}
                      </p>
                    </div>
                    <div className="flex flex-col items-center px-2">
                      <ArrowRight className="w-5 h-5 text-blue-500" />
                      <p className="text-[10px] text-blue-500 mt-0.5">
                        {fi.duration || d.duration || ""}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-blue-800">
                        {fi.to || d.to || "—"}
                      </p>
                      <p className="text-xs text-blue-600">
                        {fi.arrivalTime || d.arrivalTime || ""}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Airline</p>
                      <p className="font-medium">
                        {fi.airline || d.airline || "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Flight No.
                      </p>
                      <p className="font-medium">
                        {fi.flightNumber || d.flightNumber || "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Cabin</p>
                      <p className="font-medium capitalize">
                        {fi.cabinClass || d.cabinClass || "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">PNR</p>
                      <p className="font-mono font-bold text-primary">
                        {d.pnr || fi.pnr || "PNR Pending"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Ticket No.
                      </p>
                      <p className="font-mono text-xs">
                        {d.ticketNumber || fi.ticketNumber || "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Airline PNR
                      </p>
                      <p className="font-mono text-xs">
                        {d.airlinePnr || fi.airlinePnr || "—"}
                      </p>
                    </div>
                  </div>
                  {(d.passengers || []).length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-2">
                        Passengers
                      </p>
                      <div className="space-y-1.5">
                        {d.passengers.map((p: any, i: number) => (
                          <div
                            key={i}
                            className="flex items-center justify-between bg-white rounded-lg px-3 py-2 text-sm border"
                          >
                            <span className="font-medium">
                              {p.firstName || p.name || `Passenger ${i + 1}`}{" "}
                              {p.lastName || ""}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {p.seat || ""}{" "}
                              {p.type || p.passengerType || ""}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Hotel */}
              {type === "hotel" && (
                <div className="rounded-xl border bg-green-50/50 p-4 space-y-3">
                  <p className="text-xs font-bold text-green-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5" /> Hotel Information
                  </p>
                  <div className="bg-green-100 rounded-lg px-4 py-3 text-center">
                    <p className="text-lg font-bold text-green-800">
                      {d.hotelName || d.hotel?.name || "—"}
                    </p>
                    <p className="text-xs text-green-600">
                      {d.city || d.hotel?.city || "—"}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Check-in</p>
                      <p className="font-medium">{d.checkIn || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Check-out
                      </p>
                      <p className="font-medium">{d.checkOut || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Nights</p>
                      <p className="font-medium">{d.nights || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Rooms</p>
                      <p className="font-medium">{d.rooms || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Room Type
                      </p>
                      <p className="font-medium">{d.roomType || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Board</p>
                      <p className="font-medium">
                        {d.boardBasis || d.board || "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Booking Code
                      </p>
                      <p className="font-mono font-bold text-primary">
                        {d.bookingCode || d.confirmationCode || "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Confirmation
                      </p>
                      <p className="font-mono text-xs">
                        {d.confirmationNumber || "—"}
                      </p>
                    </div>
                  </div>
                  {(d.guests || []).length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-2">
                        Guests
                      </p>
                      <div className="space-y-1.5">
                        {d.guests.map((g: any, i: number) => (
                          <div
                            key={i}
                            className="flex items-center justify-between bg-white rounded-lg px-3 py-2 text-sm border"
                          >
                            <span className="font-medium">
                              {g.name || g.firstName || `Guest ${i + 1}`}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {g.type || ""}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Bus */}
              {type === "bus" && (
                <div className="rounded-xl border bg-cyan-50/50 p-4 space-y-3">
                  <p className="text-xs font-bold text-cyan-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Bus className="w-3.5 h-3.5" /> Bus Information
                  </p>
                  <div className="flex items-center gap-3 justify-center py-3 bg-cyan-100 rounded-lg">
                    <div className="text-center">
                      <p className="text-xl font-bold text-cyan-800">
                        {d.from || fi.from || "—"}
                      </p>
                      <p className="text-xs text-cyan-600">
                        {d.departureTime || ""}
                      </p>
                    </div>
                    <ArrowRight className="w-5 h-5 text-cyan-500" />
                    <div className="text-center">
                      <p className="text-xl font-bold text-cyan-800">
                        {d.to || fi.to || "—"}
                      </p>
                      <p className="text-xs text-cyan-600">
                        {d.arrivalTime || ""}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Operator</p>
                      <p className="font-medium">
                        {d.busOperator || d.operator || "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Bus Type</p>
                      <p className="font-medium">{d.busType || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Seat(s)</p>
                      <p className="font-medium">
                        {(d.seatNumbers || []).join(", ") ||
                          d.seatNumber ||
                          "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Ticket No.
                      </p>
                      <p className="font-mono font-bold text-primary">
                        {d.ticketNumber || d.pnr || "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Boarding Point
                      </p>
                      <p className="font-medium text-xs">
                        {d.boardingPoint || "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Dropping Point
                      </p>
                      <p className="font-medium text-xs">
                        {d.droppingPoint || "—"}
                      </p>
                    </div>
                  </div>
                  {(d.passengers || []).length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-2">
                        Passengers
                      </p>
                      <div className="space-y-1.5">
                        {d.passengers.map((p: any, i: number) => (
                          <div
                            key={i}
                            className="flex items-center justify-between bg-white rounded-lg px-3 py-2 text-sm border"
                          >
                            <span className="font-medium">
                              {p.name || p.firstName || `Passenger ${i + 1}`}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              Seat {p.seat || "—"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Package */}
              {type === "package" && (
                <div className="rounded-xl border bg-purple-50/50 p-4 space-y-3">
                  <p className="text-xs font-bold text-purple-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Map className="w-3.5 h-3.5" /> Package Information
                  </p>
                  <div className="bg-purple-100 rounded-lg px-4 py-3 text-center">
                    <p className="text-lg font-bold text-purple-800">
                      {d.packageName || d.destination || "—"}
                    </p>
                    <p className="text-xs text-purple-600">
                      {d.nights || "—"} nights · {d.days || "—"} days
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Check-in</p>
                      <p className="font-medium">{d.checkIn || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Check-out
                      </p>
                      <p className="font-medium">{d.checkOut || "—"}</p>
                    </div>
                  </div>
                  {(d.inclusions || []).length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-2">
                        Inclusions
                      </p>
                      <ul className="space-y-1">
                        {d.inclusions.map((inc: string, i: number) => (
                          <li
                            key={i}
                            className="flex items-center gap-1.5 text-sm text-purple-700"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />{" "}
                            {inc}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Timestamps */}
              <div className="rounded-xl border p-4 space-y-2">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Timestamps
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Booking Created
                    </p>
                    <p className="font-medium text-xs">
                      {createdAt !== "—"
                        ? new Date(createdAt).toLocaleString("en-IN")
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Travel Date
                    </p>
                    <p className="font-medium text-xs">{travelDate}</p>
                  </div>
                </div>
              </div>

              {/* Raw API Response */}
              <details className="rounded-xl border p-4">
                <summary className="cursor-pointer text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5" /> Raw API Response (Debug)
                </summary>
                <pre className="mt-3 text-[10px] bg-slate-50 rounded p-3 overflow-x-auto max-h-64 leading-relaxed whitespace-pre-wrap break-all">
                  {JSON.stringify(d, null, 2)}
                </pre>
              </details>
            </TabsContent>

            {/* ── Timeline Tab ── */}
            <TabsContent value="timeline" className="mt-0">
              <div className="relative pl-6 border-l-2 border-muted space-y-6 py-2 ml-2">
                {timeline.length === 0 && localNotes.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No timeline events yet.
                  </p>
                )}
                {timeline.map((ev, i) => (
                  <div key={i} className="relative">
                    <div
                      className={cn(
                        "absolute -left-[29px] w-4 h-4 rounded-full border-2 border-white",
                        ev.color
                      )}
                    />
                    <p className="text-sm font-semibold">{ev.label}</p>
                    {ev.sub && (
                      <p className="text-xs text-muted-foreground font-mono">
                        {ev.sub}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {ev.time && ev.time !== "—"
                        ? new Date(ev.time).toLocaleString("en-IN")
                        : ev.time}
                    </p>
                  </div>
                ))}
                {localNotes.map((note: any, i: number) => (
                  <div key={`note-${i}`} className="relative">
                    <div className="absolute -left-[29px] w-4 h-4 rounded-full border-2 border-white bg-amber-400" />
                    <p className="text-sm font-semibold text-amber-700">
                      Admin Note
                    </p>
                    <p className="text-xs bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-0.5">
                      {note.note}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {note.addedBy} ·{" "}
                      {note.addedAt
                        ? new Date(note.addedAt).toLocaleString("en-IN")
                        : ""}
                    </p>
                  </div>
                ))}
              </div>
            </TabsContent>

            {/* ── Notes Tab ── */}
            <TabsContent value="notes" className="mt-0 space-y-4">
              {localNotes.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <StickyNote className="w-10 h-10 mx-auto opacity-20 mb-2" />
                  <p className="text-sm">No admin notes yet.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {localNotes.map((note: any, i: number) => (
                    <div
                      key={i}
                      className="rounded-lg border border-amber-200 bg-amber-50 p-3"
                    >
                      <p className="text-sm">{note.note}</p>
                      <p className="text-xs text-muted-foreground mt-1.5">
                        {note.addedBy} ·{" "}
                        {note.addedAt
                          ? new Date(note.addedAt).toLocaleString("en-IN")
                          : ""}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              <div className="space-y-2 pt-2 border-t">
                <Label className="text-xs font-semibold">Add Admin Note</Label>
                <Textarea
                  placeholder="Type a note for this booking…"
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  className="text-sm min-h-[80px]"
                />
                <Button
                  size="sm"
                  onClick={addNote}
                  disabled={addingNote || !noteText.trim()}
                  className="gap-1.5"
                >
                  {addingNote ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <StickyNote className="w-3.5 h-3.5" />
                  )}{" "}
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
