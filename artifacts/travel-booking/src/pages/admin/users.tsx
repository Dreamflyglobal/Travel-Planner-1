import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/admin-layout";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Users, Search, Phone, Mail, Calendar, Wallet,
  ChevronDown, ChevronUp, Plane, Building2, Bus, Map,
  UserCheck, UserPlus, ShieldCheck, BadgeCheck, Ban, CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BLOCKED_USERS_KEY = "blocked_users_v1";

function loadBlockedSet(): Set<string> {
  try {
    const raw = localStorage.getItem(BLOCKED_USERS_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch { return new Set(); }
}

function saveBlockedSet(set: Set<string>) {
  try {
    localStorage.setItem(BLOCKED_USERS_KEY, JSON.stringify([...set]));
  } catch { /* noop */ }
}

interface StoredUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  createdAt: string;
  walletBalance?: number;
  autoCreated?: boolean;
  referralCode?: string;
  agencyName?: string;
  isApproved?: boolean;
}

interface StoredBooking {
  id?: string;
  bookingId?: string;
  userId?: string;
  customerEmail?: string;
  passengerEmail?: string;
  customerPhone?: string;
  passengerPhone?: string;
  type?: string;
  bookingType?: string;
  status?: string;
  paymentStatus?: string;
  amount?: number;
  totalAmount?: number;
  title?: string;
  customerName?: string;
  passengerName?: string;
  bookingDate?: string;
  createdAt?: string;
  travelDate?: string;
}

const TYPE_ICON: Record<string, React.ElementType> = {
  flight: Plane,
  hotel: Building2,
  bus: Bus,
  package: Map,
};

const TYPE_COLOR: Record<string, string> = {
  flight: "bg-sky-100 text-sky-700",
  hotel: "bg-teal-100 text-teal-700",
  bus: "bg-orange-100 text-orange-700",
  package: "bg-purple-100 text-purple-700",
};

function formatDate(iso?: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch {
    return "—";
  }
}

function normalisePhone(p?: string) {
  return (p || "").replace(/\D/g, "").slice(-10);
}

function getUserBookings(user: StoredUser, allBookings: StoredBooking[]): StoredBooking[] {
  return allBookings.filter((b) => {
    if (b.userId && b.userId === user.id) return true;
    const bEmail = (b.customerEmail || b.passengerEmail || "").toLowerCase();
    const uEmail = user.email.toLowerCase();
    if (bEmail && bEmail === uEmail) return true;
    const bPhone = normalisePhone(b.customerPhone || b.passengerPhone);
    const uPhone = normalisePhone(user.phone);
    if (bPhone && uPhone && bPhone === uPhone) return true;
    return false;
  });
}

function StatCard({
  icon: Icon, label, value, color,
}: { icon: React.ElementType; label: string; value: number | string; color: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center shrink-0", color)}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function UserRow({
  user, bookings, isBlocked, onToggleBlock,
}: {
  user: StoredUser;
  bookings: StoredBooking[];
  isBlocked: boolean;
  onToggleBlock: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const userBookings = getUserBookings(user, bookings);
  const totalSpend = userBookings.reduce((s, b) => s + (b.amount || b.totalAmount || 0), 0);

  const roleBadge = {
    admin: "bg-purple-100 text-purple-700 border-purple-200",
    agent: "bg-blue-100 text-blue-700 border-blue-200",
    staff: "bg-orange-100 text-orange-700 border-orange-200",
    user: "bg-green-100 text-green-700 border-green-200",
  }[user.role] ?? "bg-gray-100 text-gray-600";

  return (
    <div className={cn("border rounded-xl overflow-hidden", isBlocked && "border-red-200 bg-red-50/30")}>
      {/* User header row */}
      <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        {/* Clickable area (expand) */}
        <button
          className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1 text-left hover:bg-muted/20 -m-2 p-2 rounded-lg transition-colors"
          onClick={() => setOpen((o) => !o)}
        >
          {/* Avatar */}
          <div className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0",
            isBlocked ? "bg-red-400" : "bg-gradient-to-br from-blue-500 to-purple-600"
          )}>
            {isBlocked ? <Ban className="w-4 h-4" /> : (user.name?.charAt(0)?.toUpperCase() || "?")}
          </div>

          {/* Name + contact */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-sm truncate">{user.name || "—"}</span>
              <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full border", roleBadge)}>
                {user.role}
              </span>
              {isBlocked && (
                <span className="text-[10px] bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded-full font-semibold">
                  blocked
                </span>
              )}
              {user.autoCreated && (
                <span className="text-[10px] bg-amber-100 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">
                  auto-created
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
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
          <div className="flex gap-4 sm:gap-6 shrink-0 text-right">
            <div>
              <p className="text-xs text-muted-foreground">Bookings</p>
              <p className="font-bold text-sm">{userBookings.length}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Spend</p>
              <p className="font-bold text-sm">₹{totalSpend.toLocaleString("en-IN")}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Wallet</p>
              <p className="font-bold text-sm">₹{(user.walletBalance || 0).toLocaleString("en-IN")}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Joined</p>
              <p className="font-bold text-sm">{formatDate(user.createdAt)}</p>
            </div>
            <div className="flex items-center">
              {open
                ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </div>
          </div>
        </button>

        {/* Block / Unblock button */}
        <Button
          size="sm"
          variant={isBlocked ? "outline" : "outline"}
          className={cn(
            "shrink-0 gap-1.5 text-xs",
            isBlocked
              ? "border-green-300 text-green-700 hover:bg-green-50"
              : "border-red-200 text-red-600 hover:bg-red-50"
          )}
          onClick={(e) => { e.stopPropagation(); onToggleBlock(user.id); }}
        >
          {isBlocked
            ? <><CheckCircle2 className="w-3.5 h-3.5" /> Unblock</>
            : <><Ban className="w-3.5 h-3.5" /> Block</>}
        </Button>
      </div>

      {/* Expanded: bookings */}
      {open && (
        <div className="border-t bg-muted/20 p-4">
          {userBookings.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No bookings found for this user.</p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Bookings ({userBookings.length})
              </p>
              {userBookings.map((b, idx) => {
                const bType = b.type || b.bookingType || "flight";
                const Icon = TYPE_ICON[bType] || Plane;
                const bId = b.id || b.bookingId || `bk-${idx}`;
                const bStatus = b.status || b.paymentStatus || "confirmed";
                const bAmount = b.amount || b.totalAmount || 0;
                const bName = b.title || b.customerName || b.passengerName || "Booking";
                const bDate = b.bookingDate || b.createdAt || b.travelDate;
                return (
                  <div key={bId} className="flex items-center gap-3 p-3 rounded-lg bg-background border text-sm">
                    <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", TYPE_COLOR[bType] || "bg-gray-100 text-gray-600")}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{bName}</p>
                      <p className="text-xs text-muted-foreground">{bId} · {formatDate(bDate)}</p>
                    </div>
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
                    <span className="font-semibold shrink-0">₹{bAmount.toLocaleString("en-IN")}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Extra user meta */}
          <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground border-t pt-3">
            <span>User ID: <strong className="text-foreground">{user.id}</strong></span>
            {user.referralCode && <span>Referral Code: <strong className="text-foreground">{user.referralCode}</strong></span>}
            {user.agencyName && <span>Agency: <strong className="text-foreground">{user.agencyName}</strong></span>}
            {user.role === "agent" && (
              <span>
                Approved:{" "}
                <strong className={user.isApproved ? "text-green-600" : "text-red-600"}>
                  {user.isApproved ? "Yes" : "No"}
                </strong>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminUsers() {
  const [users, setUsers] = useState<StoredUser[]>([]);
  const [bookings, setBookings] = useState<StoredBooking[]>([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [blockedSet, setBlockedSet] = useState<Set<string>>(loadBlockedSet);

  function load() {
    try {
      const raw = localStorage.getItem("users");
      setUsers(raw ? JSON.parse(raw) : []);
    } catch {
      setUsers([]);
    }
    try {
      const raw = localStorage.getItem("travel_bookings");
      setBookings(raw ? JSON.parse(raw) : []);
    } catch {
      setBookings([]);
    }
    setBlockedSet(loadBlockedSet());
  }

  const toggleBlock = useCallback((userId: string) => {
    setBlockedSet((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      saveBlockedSet(next);
      return next;
    });
  }, []);

  useEffect(() => { load(); }, []);

  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const customers = users.filter((u) => u.role === "user");
  const autoCreated = customers.filter((u) => u.autoCreated);
  const newThisMonth = users.filter((u) => u.createdAt && u.createdAt >= thisMonthStart);

  const roles = ["all", "user", "agent", "staff", "admin"];

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      (u.name || "").toLowerCase().includes(q) ||
      (u.email || "").toLowerCase().includes(q) ||
      (u.phone || "").includes(q) ||
      (u.id || "").toLowerCase().includes(q);
    const matchRole = roleFilter === "all" || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  // sort newest first
  const sorted = [...filtered].sort(
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">All Users</h1>
            <p className="text-muted-foreground text-sm">Every registered customer, agent, and staff account</p>
          </div>
          <Button variant="outline" size="sm" onClick={load} className="gap-2">
            <Users className="w-4 h-4" /> Refresh
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard icon={Users}      label="Total Users"     value={users.length}          color="bg-blue-100 text-blue-600" />
          <StatCard icon={UserCheck}  label="Customers"       value={customers.length}       color="bg-green-100 text-green-600" />
          <StatCard icon={UserPlus}   label="Auto-Created"    value={autoCreated.length}     color="bg-amber-100 text-amber-600" />
          <StatCard icon={BadgeCheck} label="New This Month"  value={newThisMonth.length}    color="bg-purple-100 text-purple-600" />
          <StatCard icon={Ban}        label="Blocked"         value={blockedSet.size}        color="bg-red-100 text-red-600" />
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search by name, email, phone, or ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {roles.map((r) => (
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

        {/* Results count */}
        <p className="text-xs text-muted-foreground">
          Showing <strong>{sorted.length}</strong> of <strong>{users.length}</strong> users
        </p>

        {/* User list */}
        {sorted.length === 0 ? (
          <div className="text-center py-20">
            <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-40" />
            <p className="text-muted-foreground font-medium">No users found</p>
            <p className="text-xs text-muted-foreground mt-1">
              Users are created automatically when customers sign up or complete a booking.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {sorted.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                bookings={bookings}
                isBlocked={blockedSet.has(u.id)}
                onToggleBlock={toggleBlock}
              />
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
