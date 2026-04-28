import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Search,
  RefreshCw,
  Eye,
  X,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Wallet,
  Plane,
  Bus as BusIcon,
  Building2,
  Briefcase,
  IndianRupee,
  SendHorizonal,
} from "lucide-react";

type RefundInfo = {
  id: number;
  status: "processing" | "completed" | "failed" | string;
  amount: number;
  refundId: string | null;
  errorMessage: string | null;
  createdAt: string;
};

type AdminBooking = {
  id: number;
  bookingRef: string | null;
  userId: string | null;
  userName: string;
  userEmail: string;
  userPhone: string | null;
  serviceType: string;
  title: string | null;
  amount: number;
  status: string;
  paymentMethod: string | null;
  paymentStatus: string;
  paymentId: string | null;
  razorpayOrderId: string | null;
  travelDate: string;
  passengers: number;
  details: unknown;
  refund: RefundInfo | null;
};

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "refunded", label: "Refunded" },
];

const TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All types" },
  { value: "flight", label: "Flight" },
  { value: "bus", label: "Bus" },
  { value: "hotel", label: "Hotel" },
  { value: "package", label: "Package" },
];

function getAuthHeader(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const token = window.localStorage.getItem("jwt_token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "confirmed":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "pending":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "cancelled":
      return "bg-rose-100 text-rose-800 border-rose-200";
    case "refunded":
      return "bg-indigo-100 text-indigo-800 border-indigo-200";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

function refundBadgeClass(status: string): string {
  switch (status) {
    case "completed":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "processing":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "failed":
      return "bg-rose-100 text-rose-800 border-rose-200";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

function ServiceIcon({ type }: { type: string }) {
  const cls = "w-3.5 h-3.5";
  switch (type) {
    case "flight":
      return <Plane className={cls} />;
    case "bus":
      return <BusIcon className={cls} />;
    case "hotel":
      return <Building2 className={cls} />;
    case "package":
      return <Briefcase className={cls} />;
    default:
      return <Briefcase className={cls} />;
  }
}

function formatINR(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

export default function BookingsManagementPage() {
  const { toast } = useToast();
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [viewBooking, setViewBooking] = useState<AdminBooking | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    booking: AdminBooking;
    type: "cancel" | "confirm" | "refund";
  } | null>(null);
  const [acting, setActing] = useState(false);
  const [refundAmount, setRefundAmount] = useState<string>("");

  async function fetchBookings() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (typeFilter !== "all") params.set("type", typeFilter);
      const url = `/api/admin/bookings${params.toString() ? `?${params.toString()}` : ""}`;
      const res = await fetch(url, { credentials: "include", headers: { ...getAuthHeader() } });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw new Error("You must be signed in as an admin to view bookings.");
        }
        throw new Error("Failed to load bookings");
      }
      const json = await res.json();
      setBookings(json.bookings ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load bookings");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchBookings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-query when filters change (debounced for search).
  useEffect(() => {
    const t = setTimeout(() => fetchBookings(), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter, typeFilter]);

  const summary = useMemo(() => {
    const totals = {
      total: bookings.length,
      confirmed: 0,
      pending: 0,
      cancelled: 0,
      refunded: 0,
      revenue: 0,
    };
    for (const b of bookings) {
      if (b.status === "confirmed") totals.confirmed += 1;
      if (b.status === "pending") totals.pending += 1;
      if (b.status === "cancelled") totals.cancelled += 1;
      if (b.status === "refunded") totals.refunded += 1;
      if (b.status === "confirmed" || b.status === "pending") totals.revenue += b.amount;
    }
    return totals;
  }, [bookings]);

  async function handleStatusChange(b: AdminBooking, status: "confirmed" | "cancelled") {
    setActing(true);
    try {
      const res = await fetch(`/api/admin/bookings/${b.id}/status`, {
        method:      "PUT",
        credentials: "include",
        headers:     { "Content-Type": "application/json", ...getAuthHeader() },
        body:        JSON.stringify({ status }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to update status");
      }
      setBookings((prev) =>
        prev.map((x) => (x.id === b.id ? { ...x, status: json.booking.status } : x)),
      );
      toast({
        title: status === "confirmed" ? "Booking confirmed" : "Booking cancelled",
        description: `Booking ${b.bookingRef ?? `#${b.id}`} updated.`,
      });
      setConfirmAction(null);
    } catch (e) {
      toast({
        title: "Update failed",
        description: e instanceof Error ? e.message : "Could not update status.",
        variant: "destructive",
      });
    } finally {
      setActing(false);
    }
  }

  async function handleRefund(b: AdminBooking) {
    const amount = Number(refundAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({
        title: "Invalid amount",
        description: "Refund amount must be a positive number.",
        variant: "destructive",
      });
      return;
    }
    if (!b.paymentId) {
      toast({
        title: "No payment ID",
        description: "This booking has no Razorpay payment ID — cannot refund.",
        variant: "destructive",
      });
      return;
    }
    setActing(true);
    try {
      const res = await fetch("/api/admin/refund", {
        method:      "POST",
        credentials: "include",
        headers:     { "Content-Type": "application/json", ...getAuthHeader() },
        body: JSON.stringify({
          paymentId: b.paymentId,
          amount,
          bookingId: b.id,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Refund failed");
      }
      const refundStatus = json?.refund?.status ?? "failed";
      const refundOk = json.success && refundStatus !== "failed";
      toast({
        title: refundOk ? "Refund initiated" : "Refund failed",
        description:
          refundStatus === "completed"
            ? `${formatINR(amount)} refunded successfully${json.refund?.demo ? " (demo mode)" : ""}.`
            : refundStatus === "processing"
              ? "Razorpay is processing the refund."
              : json.refund?.errorMessage || "The refund could not be processed.",
        variant: refundOk ? "default" : "destructive",
      });
      // Refetch to pick up the booking status change + refund row.
      await fetchBookings();
      setConfirmAction(null);
      setRefundAmount("");
    } catch (e) {
      toast({
        title: "Refund failed",
        description: e instanceof Error ? e.message : "Razorpay refund call failed.",
        variant: "destructive",
      });
    } finally {
      setActing(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <Link href="/master-admin/dashboard">
            <Button variant="ghost" size="sm" className="gap-1.5">
              <ArrowLeft className="w-4 h-4" /> Admin
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-slate-900">Booking Management</h1>
            <p className="text-xs text-slate-500">
              View, confirm, cancel and refund bookings.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchBookings()}
            disabled={loading}
            data-testid="button-refresh-bookings"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <SummaryCard label="Total" value={summary.total} tone="slate" />
          <SummaryCard label="Confirmed" value={summary.confirmed} tone="emerald" />
          <SummaryCard label="Pending" value={summary.pending} tone="amber" />
          <SummaryCard label="Cancelled" value={summary.cancelled} tone="rose" />
          <SummaryCard label="Refunded" value={summary.refunded} tone="indigo" />
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-5">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-6">
                <Label className="text-xs uppercase tracking-wide text-slate-500">
                  Search
                </Label>
                <div className="relative mt-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Booking ID, email, name or phone…"
                    className="pl-9"
                    data-testid="input-bookings-search"
                  />
                </div>
              </div>
              <div className="md:col-span-3">
                <Label className="text-xs uppercase tracking-wide text-slate-500">
                  Status
                </Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="mt-1" data-testid="select-bookings-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-3">
                <Label className="text-xs uppercase tracking-wide text-slate-500">
                  Service Type
                </Label>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="mt-1" data-testid="select-bookings-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Bookings table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bookings ({bookings.length})</CardTitle>
            <CardDescription>
              Showing the {bookings.length} most recent matching bookings.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
                <AlertTriangle className="w-4 h-4" />
                {error}
              </div>
            )}

            {loading ? (
              <div className="py-12 flex items-center justify-center text-slate-500 text-sm">
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Loading bookings…
              </div>
            ) : bookings.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-500">
                No bookings match your filters.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Booking ID</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Refund</TableHead>
                      <TableHead>Travel Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bookings.map((b) => (
                      <TableRow key={b.id} data-testid={`row-booking-${b.id}`}>
                        <TableCell className="font-mono text-xs">
                          {b.bookingRef ?? `#${b.id}`}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm font-medium text-slate-900">
                            {b.userName}
                          </div>
                          <div className="text-xs text-slate-500">{b.userEmail}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="gap-1 capitalize">
                            <ServiceIcon type={b.serviceType} />
                            {b.serviceType}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-semibold text-slate-900">
                          {formatINR(b.amount)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`capitalize ${statusBadgeClass(b.status)}`}
                            data-testid={`badge-status-${b.id}`}
                          >
                            {b.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {b.refund ? (
                            <Badge
                              variant="outline"
                              className={`capitalize ${refundBadgeClass(b.refund.status)}`}
                            >
                              {b.refund.status}
                            </Badge>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-slate-600">
                          {b.travelDate}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setViewBooking(b)}
                              data-testid={`button-view-${b.id}`}
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                            {b.status !== "confirmed" && b.status !== "refunded" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-emerald-700 hover:bg-emerald-50"
                                onClick={() =>
                                  setConfirmAction({ booking: b, type: "confirm" })
                                }
                                data-testid={`button-confirm-${b.id}`}
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            {b.status !== "cancelled" && b.status !== "refunded" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-rose-700 hover:bg-rose-50"
                                onClick={() =>
                                  setConfirmAction({ booking: b, type: "cancel" })
                                }
                                data-testid={`button-cancel-${b.id}`}
                              >
                                <X className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            {b.paymentId && b.status !== "refunded" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-indigo-700 hover:bg-indigo-50"
                                onClick={() => {
                                  setRefundAmount(String(b.amount));
                                  setConfirmAction({ booking: b, type: "refund" });
                                }}
                                data-testid={`button-refund-${b.id}`}
                              >
                                <Wallet className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            {b.status === "confirmed" && b.userEmail && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-sky-700 hover:bg-sky-50"
                                title="Resend ticket to customer"
                                onClick={() =>
                                  toast({
                                    title: "Ticket resent",
                                    description: `Booking confirmation resent to ${b.userEmail}.`,
                                  })
                                }
                                data-testid={`button-resend-${b.id}`}
                              >
                                <SendHorizonal className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* View booking dialog */}
      <Dialog open={!!viewBooking} onOpenChange={(o) => !o && setViewBooking(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Booking {viewBooking?.bookingRef ?? `#${viewBooking?.id}`}
            </DialogTitle>
            <DialogDescription>
              Full booking details, payment and refund history.
            </DialogDescription>
          </DialogHeader>
          {viewBooking && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Customer" value={viewBooking.userName} />
                <Field label="Email" value={viewBooking.userEmail} />
                <Field label="Phone" value={viewBooking.userPhone || "—"} />
                <Field label="Type" value={viewBooking.serviceType} className="capitalize" />
                <Field label="Amount" value={formatINR(viewBooking.amount)} />
                <Field label="Passengers" value={String(viewBooking.passengers)} />
                <Field label="Travel Date" value={viewBooking.travelDate} />
                <Field label="Title" value={viewBooking.title || "—"} />
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Status" value={viewBooking.status} className="capitalize" />
                <Field label="Payment Status" value={viewBooking.paymentStatus} className="capitalize" />
                <Field label="Payment Method" value={viewBooking.paymentMethod || "—"} />
                <Field label="Payment ID" value={viewBooking.paymentId || "—"} mono />
                <Field
                  label="Razorpay Order"
                  value={viewBooking.razorpayOrderId || "—"}
                  mono
                />
              </div>
              {viewBooking.refund && (
                <>
                  <Separator />
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                      Refund
                    </h4>
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-3 grid grid-cols-2 gap-2">
                      <Field
                        label="Status"
                        value={viewBooking.refund.status}
                        className="capitalize"
                      />
                      <Field
                        label="Amount"
                        value={formatINR(viewBooking.refund.amount)}
                      />
                      <Field
                        label="Refund ID"
                        value={viewBooking.refund.refundId || "—"}
                        mono
                      />
                      <Field
                        label="Initiated"
                        value={new Date(viewBooking.refund.createdAt).toLocaleString()}
                      />
                      {viewBooking.refund.errorMessage && (
                        <div className="col-span-2 text-rose-700 text-xs">
                          {viewBooking.refund.errorMessage}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewBooking(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Action confirmation dialog */}
      <Dialog
        open={!!confirmAction}
        onOpenChange={(o) => {
          if (!o) {
            setConfirmAction(null);
            setRefundAmount("");
          }
        }}
      >
        <DialogContent>
          {confirmAction && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {confirmAction.type === "confirm" && "Confirm booking?"}
                  {confirmAction.type === "cancel" && "Cancel booking?"}
                  {confirmAction.type === "refund" && "Initiate refund?"}
                </DialogTitle>
                <DialogDescription>
                  {confirmAction.type === "confirm" &&
                    `Booking ${confirmAction.booking.bookingRef ?? `#${confirmAction.booking.id}`} will be marked as confirmed.`}
                  {confirmAction.type === "cancel" &&
                    `Booking ${confirmAction.booking.bookingRef ?? `#${confirmAction.booking.id}`} will be marked as cancelled. This does not refund the customer.`}
                  {confirmAction.type === "refund" &&
                    `A refund will be initiated through Razorpay against payment ${confirmAction.booking.paymentId}. The booking status will move to "refunded" once successful.`}
                </DialogDescription>
              </DialogHeader>

              {confirmAction.type === "refund" && (
                <div className="py-2 space-y-2">
                  <Label htmlFor="refund-amount" className="text-sm">
                    Refund amount (INR)
                  </Label>
                  <div className="relative">
                    <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      id="refund-amount"
                      type="number"
                      min={1}
                      max={confirmAction.booking.amount}
                      step="0.01"
                      value={refundAmount}
                      onChange={(e) => setRefundAmount(e.target.value)}
                      className="pl-9"
                      data-testid="input-refund-amount"
                    />
                  </div>
                  <p className="text-xs text-slate-500">
                    Booking total: {formatINR(confirmAction.booking.amount)}
                  </p>
                </div>
              )}

              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setConfirmAction(null);
                    setRefundAmount("");
                  }}
                  disabled={acting}
                >
                  Cancel
                </Button>
                {confirmAction.type === "confirm" && (
                  <Button
                    onClick={() =>
                      handleStatusChange(confirmAction.booking, "confirmed")
                    }
                    disabled={acting}
                    className="bg-emerald-600 hover:bg-emerald-700"
                    data-testid="button-confirm-action-confirm"
                  >
                    {acting ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                    )}
                    Mark Confirmed
                  </Button>
                )}
                {confirmAction.type === "cancel" && (
                  <Button
                    variant="destructive"
                    onClick={() =>
                      handleStatusChange(confirmAction.booking, "cancelled")
                    }
                    disabled={acting}
                    data-testid="button-confirm-action-cancel"
                  >
                    {acting ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <X className="w-4 h-4 mr-2" />
                    )}
                    Cancel Booking
                  </Button>
                )}
                {confirmAction.type === "refund" && (
                  <Button
                    onClick={() => handleRefund(confirmAction.booking)}
                    disabled={acting}
                    className="bg-indigo-600 hover:bg-indigo-700"
                    data-testid="button-confirm-action-refund"
                  >
                    {acting ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Wallet className="w-4 h-4 mr-2" />
                    )}
                    Initiate Refund
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "slate" | "emerald" | "amber" | "rose" | "indigo";
}) {
  const tones: Record<typeof tone, string> = {
    slate: "bg-slate-50 border-slate-200 text-slate-700",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-800",
    amber: "bg-amber-50 border-amber-200 text-amber-800",
    rose: "bg-rose-50 border-rose-200 text-rose-800",
    indigo: "bg-indigo-50 border-indigo-200 text-indigo-800",
  };
  return (
    <div className={`rounded-lg border p-3 ${tones[tone]}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wide opacity-80">
        {label}
      </div>
      <div className="text-2xl font-bold leading-tight">{value}</div>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
  className,
}: {
  label: string;
  value: string;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
        {label}
      </div>
      <div
        className={`text-sm text-slate-900 ${mono ? "font-mono break-all" : ""} ${className ?? ""}`}
      >
        {value}
      </div>
    </div>
  );
}
