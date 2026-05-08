import { useState, useEffect, useCallback, useMemo } from "react";
import { AdminLayout } from "@/components/admin-layout";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  Users, Search, Phone, Mail, Calendar, Wallet,
  ChevronDown, ChevronUp, Plane, Building2, Bus,
  UserCheck, UserPlus, BadgeCheck, Ban, CheckCircle2,
  RefreshCw, AlertCircle, IndianRupee, MessageCircle,
  Pencil, ShieldOff, ShieldCheck, Package, Eye, Send,
  RotateCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { openWhatsAppConfirmation, openEmailConfirmation } from "@/lib/invoice";

// ── Types ─────────────────────────────────────────────────────────────────────

interface UserBooking {
  id: number;
  bookingRef: string;
  bookingType: string;
  title?: string;
  totalPrice: number;
  status: string;
  paymentStatus: string;
  travelDate?: string;
  createdAt: string;
}

interface ApiUser {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  isApproved: boolean | null;
  walletBalance: number;
  agentCode: string | null;
  agencyName: string | null;
  referralCode: string | null;
  otpUser: boolean | null;
  createdAt: string;
  updatedAt: string;
  // booking stats
  totalBookings: number;
  totalSpend: number;
  lastBooking: string | null;
  bookingTypes: string[];
  recentBookings: UserBooking[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const BLOCKED_KEY = "blocked_users_v1";

function loadBlocked(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(BLOCKED_KEY) || "[]")); }
  catch { return new Set(); }
}
function saveBlocked(s: Set<string>) {
  try { localStorage.setItem(BLOCKED_KEY, JSON.stringify([...s])); } catch { /**/ }
}

const TYPE_META: Record<string, { Icon: React.ElementType; color: string; bg: string }> = {
  flight:  { Icon: Plane,     color: "text-sky-700",    bg: "bg-sky-100" },
  hotel:   { Icon: Building2, color: "text-teal-700",   bg: "bg-teal-100" },
  bus:     { Icon: Bus,       color: "text-orange-700", bg: "bg-orange-100" },
  package: { Icon: Package,   color: "text-purple-700", bg: "bg-purple-100" },
};

const ROLE_STYLE: Record<string, string> = {
  admin:  "bg-purple-100 text-purple-700 border-purple-200",
  agent:  "bg-blue-100 text-blue-700 border-blue-200",
  staff:  "bg-orange-100 text-orange-700 border-orange-200",
  user:   "bg-green-100 text-green-700 border-green-200",
};

function formatINR(n: number) { return "₹" + n.toLocaleString("en-IN"); }
function formatDate(iso?: string | null) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return "—"; }
}
function timeAgo(iso?: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 30)  return `${d}d ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

// ── User Row ──────────────────────────────────────────────────────────────────

function UserRow({
  user,
  blocked,
  onToggleBlock,
  onEmail,
  onWhatsApp,
}: {
  user: ApiUser;
  blocked: boolean;
  onToggleBlock: (id: string) => void;
  onEmail: (u: ApiUser) => void;
  onWhatsApp: (u: ApiUser) => void;
}) {
  const [open, setOpen] = useState(false);

  const initials = (user.name || "?").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  const statusColor = blocked
    ? "bg-red-400"
    : user.role === "admin"   ? "bg-purple-500"
    : user.role === "agent"   ? "bg-blue-500"
    : user.role === "staff"   ? "bg-orange-500"
    : "bg-gradient-to-br from-emerald-500 to-teal-600";

  return (
    <div className={cn(
      "border rounded-xl overflow-hidden transition-shadow hover:shadow-md",
      blocked && "border-red-200 bg-red-50/20"
    )}>
      {/* Header row */}
      <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <button
          className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1 text-left hover:bg-muted/10 -m-2 p-2 rounded-lg transition-colors"
          onClick={() => setOpen((o) => !o)}
        >
          {/* Avatar */}
          <div className={cn("w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0", statusColor)}>
            {blocked ? <Ban className="w-4 h-4" /> : initials}
          </div>

          {/* Name + contact */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
              <span className="font-semibold text-sm">{user.name || "—"}</span>
              <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize", ROLE_STYLE[user.role] ?? "bg-gray-100 text-gray-600 border-gray-200")}>
                {user.role}
              </span>
              {blocked && (
                <span className="text-[10px] bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded-full font-semibold">blocked</span>
              )}
              {user.otpUser && (
                <span className="text-[10px] bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">OTP account</span>
              )}
              {user.bookingTypes.map((t) => {
                const m = TYPE_META[t];
                if (!m) return null;
                return (
                  <span key={t} className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", m.bg, m.color)}>
                    {t}
                  </span>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5">
              {user.email && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Mail className="w-3 h-3" />{user.email}
                </span>
              )}
              {user.phone && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Phone className="w-3 h-3" />{user.phone}
                </span>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="flex gap-3 sm:gap-5 shrink-0 text-right items-center">
            <div>
              <p className="text-[10px] text-muted-foreground">Bookings</p>
              <p className="font-bold text-sm">{user.totalBookings}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Spend</p>
              <p className="font-bold text-sm">{formatINR(user.totalSpend)}</p>
            </div>
            <div className="hidden sm:block">
              <p className="text-[10px] text-muted-foreground">Last Booking</p>
              <p className="font-semibold text-xs">{timeAgo(user.lastBooking)}</p>
            </div>
            <div className="hidden sm:block">
              <p className="text-[10px] text-muted-foreground">Joined</p>
              <p className="font-semibold text-xs">{formatDate(user.createdAt)}</p>
            </div>
            <div className="hidden sm:block">
              <p className="text-[10px] text-muted-foreground">Wallet</p>
              <p className="font-semibold text-xs">{formatINR(user.walletBalance)}</p>
            </div>
            {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
        </button>

        {/* Action buttons */}
        <div className="flex gap-1.5 shrink-0 flex-wrap">
          {user.email && (
            <Button size="sm" variant="outline" className="gap-1 text-xs h-7 px-2 text-blue-700 border-blue-200 hover:bg-blue-50"
              onClick={(e) => { e.stopPropagation(); onEmail(user); }}>
              <Send className="w-3 h-3" /> Email
            </Button>
          )}
          {user.phone && (
            <Button size="sm" variant="outline" className="gap-1 text-xs h-7 px-2 text-green-700 border-green-200 hover:bg-green-50"
              onClick={(e) => { e.stopPropagation(); onWhatsApp(user); }}>
              <MessageCircle className="w-3 h-3" /> WA
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className={cn("gap-1 text-xs h-7 px-2 shrink-0",
              blocked
                ? "border-green-300 text-green-700 hover:bg-green-50"
                : "border-red-200 text-red-600 hover:bg-red-50"
            )}
            onClick={(e) => { e.stopPropagation(); onToggleBlock(String(user.id)); }}
          >
            {blocked ? <><ShieldCheck className="w-3 h-3" />Unblock</> : <><ShieldOff className="w-3 h-3" />Block</>}
          </Button>
        </div>
      </div>

      {/* Expanded profile */}
      {open && (
        <div className="border-t bg-slate-50 p-4 space-y-4">

          {/* Personal details grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {[
              { label: "User ID",    value: `#${user.id}` },
              { label: "Joined",     value: formatDate(user.createdAt) },
              { label: "Last Seen",  value: timeAgo(user.lastBooking) },
              { label: "Wallet",     value: formatINR(user.walletBalance) },
              { label: "Email",      value: user.email || "—" },
              { label: "Phone",      value: user.phone || "—" },
              { label: "Role",       value: user.role },
              { label: "Auth Type",  value: user.otpUser ? "OTP / Mobile" : "Email / Password" },
              ...(user.agentCode   ? [{ label: "Agent Code",  value: user.agentCode   }] : []),
              ...(user.agencyName  ? [{ label: "Agency",      value: user.agencyName  }] : []),
              ...(user.referralCode? [{ label: "Referral",    value: user.referralCode}] : []),
              { label: "Total Bookings", value: String(user.totalBookings) },
              { label: "Total Spend",    value: formatINR(user.totalSpend) },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white rounded-lg border p-2.5">
                <p className="text-[10px] text-muted-foreground uppercase font-semibold mb-0.5">{label}</p>
                <p className="text-xs font-semibold text-foreground truncate">{value}</p>
              </div>
            ))}
          </div>

          {/* Booking history */}
          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2.5 flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5" />
              Booking History ({user.totalBookings})
            </p>
            {user.recentBookings.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4 bg-white rounded-lg border">No bookings found for this user.</p>
            ) : (
              <div className="space-y-1.5">
                {user.recentBookings.map((b) => {
                  const meta = TYPE_META[b.bookingType] || TYPE_META.flight;
                  const { Icon } = meta;
                  const st = (b.status || b.paymentStatus || "").toLowerCase();
                  const isPaid = st === "paid" || st === "confirmed";
                  const isCancelled = st === "cancelled";
                  return (
                    <div key={b.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-white border text-sm">
                      <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0", meta.bg, meta.color)}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-xs truncate">{b.title || `${b.bookingType} booking`}</p>
                        <p className="text-[10px] text-muted-foreground">{b.bookingRef} · {formatDate(b.createdAt)}</p>
                      </div>
                      <Badge variant="outline" className={cn("text-[10px] capitalize shrink-0",
                        isPaid      ? "border-green-300 text-green-700 bg-green-50" :
                        isCancelled ? "border-red-300 text-red-700 bg-red-50" :
                        "border-yellow-300 text-yellow-700 bg-yellow-50"
                      )}>
                        {isPaid ? "Paid" : isCancelled ? "Cancelled" : "Pending"}
                      </Badge>
                      <span className="font-bold text-xs shrink-0">{formatINR(b.totalPrice)}</span>
                    </div>
                  );
                })}
                {user.totalBookings > user.recentBookings.length && (
                  <p className="text-xs text-muted-foreground text-center py-1">
                    + {user.totalBookings - user.recentBookings.length} more bookings
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Action strip */}
          <div className="flex flex-wrap gap-2 pt-2 border-t">
            {user.email && (
              <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8 text-blue-700 border-blue-200 hover:bg-blue-50"
                onClick={() => onEmail(user)}>
                <Mail className="w-3.5 h-3.5" /> Send Email
              </Button>
            )}
            {user.phone && (
              <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8 text-green-700 border-green-200 hover:bg-green-50"
                onClick={() => onWhatsApp(user)}>
                <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
              </Button>
            )}
            <Button size="sm" variant="outline"
              className={cn("gap-1.5 text-xs h-8", blocked ? "text-green-700 border-green-300" : "text-red-600 border-red-200")}
              onClick={() => onToggleBlock(String(user.id))}>
              {blocked ? <><ShieldCheck className="w-3.5 h-3.5" /> Unblock User</> : <><ShieldOff className="w-3.5 h-3.5" /> Block User</>}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminUsers() {
  const [users, setUsers]     = useState<ApiUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [search, setSearch]   = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [blocked, setBlocked] = useState<Set<string>>(loadBlocked);
  const { toast } = useToast();

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/users");
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e.message ?? "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // ── Sync existing bookings → users ────────────────────────────────────────
  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/users/sync-from-bookings", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        toast({
          title: "Sync complete",
          description: `${data.created} created · ${data.linked} linked · ${data.skipped} skipped`,
        });
        await fetchUsers();
      } else {
        throw new Error(data.error);
      }
    } catch (e: any) {
      toast({ title: "Sync failed", description: e.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  }, [fetchUsers, toast]);

  // ── Block / Unblock (local for now) ──────────────────────────────────────
  const toggleBlock = useCallback((id: string) => {
    setBlocked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      saveBlocked(next);
      return next;
    });
  }, []);

  // ── Email / WhatsApp helpers ───────────────────────────────────────────────
  const handleEmail = useCallback((u: ApiUser) => {
    const subject = encodeURIComponent(`Hello from Dream Fly Global`);
    const body    = encodeURIComponent(`Dear ${u.name},\n\nThank you for choosing Dream Fly Global.\n\nBest regards,\nDream Fly Global Team`);
    window.location.href = `mailto:${u.email}?subject=${subject}&body=${body}`;
  }, []);

  const handleWhatsApp = useCallback((u: ApiUser) => {
    if (!u.phone) return;
    const msg = encodeURIComponent(
      `Hi ${u.name.split(" ")[0]}! 👋\n\nThis is Dream Fly Global. We'd love to help you with your next travel plan!\n\nFor bookings & support, reply here.\n\nTeam Dream Fly Global ✈️`
    );
    window.open(`https://wa.me/${u.phone.replace(/\D/g, "")}?text=${msg}`, "_blank");
  }, []);

  // ── Filter + sort ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return users.filter((u) => {
      const matchSearch =
        !q ||
        (u.name || "").toLowerCase().includes(q) ||
        (u.email || "").toLowerCase().includes(q) ||
        (u.phone || "").includes(q) ||
        String(u.id).includes(q);
      const matchRole = roleFilter === "all" || u.role === roleFilter;
      return matchSearch && matchRole;
    });
  }, [users, search, roleFilter]);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const customers    = users.filter((u) => u.role === "user");
  const newThisMonth = users.filter((u) => u.createdAt >= thisMonthStart);
  const withBookings = users.filter((u) => u.totalBookings > 0);

  return (
    <AdminLayout>
      <div className="p-4 sm:p-6 space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Users className="w-6 h-6 text-primary" /> All Users
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Live database · every registered customer, agent, and staff account
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSync}
              disabled={syncing || loading}
              className="gap-1.5 text-xs"
            >
              <RotateCw className={cn("w-3.5 h-3.5", syncing && "animate-spin")} />
              {syncing ? "Syncing…" : "Sync from Bookings"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchUsers}
              disabled={loading}
              className="gap-1.5"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
              {loading ? "Loading…" : "Refresh"}
            </Button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
            <Button size="sm" variant="ghost" className="ml-auto h-7 text-red-700" onClick={fetchUsers}>Retry</Button>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            { Icon: Users,      label: "Total Users",      value: users.length,         color: "bg-blue-100   text-blue-700"   },
            { Icon: UserCheck,  label: "Customers",        value: customers.length,      color: "bg-green-100  text-green-700"  },
            { Icon: UserPlus,   label: "New This Month",   value: newThisMonth.length,   color: "bg-purple-100 text-purple-700" },
            { Icon: BadgeCheck, label: "Active Bookers",   value: withBookings.length,   color: "bg-teal-100   text-teal-700"   },
            { Icon: Ban,        label: "Blocked",          value: blocked.size,          color: "bg-red-100    text-red-700"    },
          ].map(({ Icon, label, value, color }) => (
            <Card key={label}>
              <CardContent className="flex items-center gap-4 p-4">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", color)}>
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-2xl font-bold">{value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search name, email, phone, or user ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {(["all", "user", "agent", "staff", "admin"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRoleFilter(r)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors capitalize",
                  roleFilter === r
                    ? "bg-foreground text-background border-foreground"
                    : "bg-background text-muted-foreground border-input hover:border-foreground hover:text-foreground"
                )}
              >
                {r === "all" ? "All Roles" : r}
              </button>
            ))}
          </div>
        </div>

        {/* Count */}
        {!loading && (
          <p className="text-xs text-muted-foreground px-1">
            Showing <strong>{filtered.length}</strong> of <strong>{users.length}</strong> users
            {filtered.length > 0 && (
              <span> · Total spend: <strong className="text-green-700">
                {formatINR(filtered.reduce((s, u) => s + u.totalSpend, 0))}
              </strong></span>
            )}
          </p>
        )}

        {/* Loading */}
        {loading && users.length === 0 && (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="border rounded-xl p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-muted animate-pulse shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted animate-pulse rounded w-1/4" />
                  <div className="h-3 bg-muted animate-pulse rounded w-1/3" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* User list */}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-20">
            <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-30" />
            <p className="text-muted-foreground font-semibold text-base">
              {users.length === 0 ? "No users in the database yet" : "No users match your filters"}
            </p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
              {users.length === 0
                ? "Click \u2018Sync from Bookings\u2019 to auto-create user accounts from all existing bookings."
                : "Try adjusting your search or role filter."}
            </p>
            {users.length === 0 && (
              <Button className="mt-4 gap-2" size="sm" onClick={handleSync} disabled={syncing}>
                <RotateCw className={cn("w-3.5 h-3.5", syncing && "animate-spin")} />
                Sync from Bookings
              </Button>
            )}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="space-y-2">
            {[...filtered]
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
              .map((u) => (
                <UserRow
                  key={u.id}
                  user={u}
                  blocked={blocked.has(String(u.id))}
                  onToggleBlock={toggleBlock}
                  onEmail={handleEmail}
                  onWhatsApp={handleWhatsApp}
                />
              ))}
          </div>
        )}

        {/* Sync note */}
        {!loading && users.length > 0 && (
          <p className="text-xs text-muted-foreground text-center pt-2">
            User accounts are auto-created for every booking. Use "Sync from Bookings" to link any historical bookings made before the account system was active.
          </p>
        )}

      </div>
    </AdminLayout>
  );
}
