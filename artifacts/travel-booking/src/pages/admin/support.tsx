import { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/admin-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  MessageCircle, Search, RefreshCw, CheckCircle2, Clock, Eye, Inbox,
  Phone, Mail, Calendar, User,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const SUPPORT_KEY = "admin_support_queries_v1";

export interface SupportQuery {
  id: string;
  name: string;
  email: string;
  phone?: string;
  subject: string;
  message: string;
  status: "open" | "resolved";
  createdAt: string;
  resolvedAt?: string;
}

function loadQueries(): SupportQuery[] {
  try {
    const raw = localStorage.getItem(SUPPORT_KEY);
    return raw ? (JSON.parse(raw) as SupportQuery[]) : [];
  } catch { return []; }
}

function saveQueries(list: SupportQuery[]) {
  try { localStorage.setItem(SUPPORT_KEY, JSON.stringify(list)); } catch { /* noop */ }
}

function formatDate(iso?: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return "—"; }
}

function StatCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType; label: string; value: number; color: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-5">
        <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center shrink-0", color)}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-extrabold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function submitSupportQuery(query: Omit<SupportQuery, "id" | "status" | "createdAt">) {
  const list = loadQueries();
  const newQuery: SupportQuery = {
    ...query,
    id: `SQ-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    status: "open",
    createdAt: new Date().toISOString(),
  };
  list.unshift(newQuery);
  saveQueries(list);
  window.dispatchEvent(new StorageEvent("storage", { key: SUPPORT_KEY }));
  return newQuery;
}

export default function AdminSupport() {
  const { toast } = useToast();
  const [queries, setQueries] = useState<SupportQuery[]>(loadQueries);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "resolved">("all");
  const [viewQuery, setViewQuery] = useState<SupportQuery | null>(null);

  const reload = useCallback(() => setQueries(loadQueries()), []);

  useEffect(() => {
    reload();
    function handleStorage(e: StorageEvent) {
      if (e.key === SUPPORT_KEY) reload();
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [reload]);

  function resolveQuery(id: string) {
    setQueries((prev) => {
      const next = prev.map((q) =>
        q.id === id ? { ...q, status: "resolved" as const, resolvedAt: new Date().toISOString() } : q
      );
      saveQueries(next);
      return next;
    });
    if (viewQuery?.id === id) {
      setViewQuery((v) => v ? { ...v, status: "resolved", resolvedAt: new Date().toISOString() } : v);
    }
    toast({ title: "Query marked as resolved", description: "The support query has been closed." });
  }

  function reopenQuery(id: string) {
    setQueries((prev) => {
      const next = prev.map((q) =>
        q.id === id ? { ...q, status: "open" as const, resolvedAt: undefined } : q
      );
      saveQueries(next);
      return next;
    });
    if (viewQuery?.id === id) {
      setViewQuery((v) => v ? { ...v, status: "open", resolvedAt: undefined } : v);
    }
    toast({ title: "Query reopened", description: "The support query is now open again." });
  }

  function deleteQuery(id: string) {
    setQueries((prev) => {
      const next = prev.filter((q) => q.id !== id);
      saveQueries(next);
      return next;
    });
    setViewQuery(null);
    toast({ title: "Query deleted" });
  }

  const filtered = queries.filter((q) => {
    const matchStatus = statusFilter === "all" || q.status === statusFilter;
    const term = search.toLowerCase();
    const matchSearch = !term || [q.name, q.email, q.subject, q.message, q.id]
      .some((f) => f?.toLowerCase().includes(term));
    return matchStatus && matchSearch;
  });

  const openCount = queries.filter((q) => q.status === "open").length;
  const resolvedCount = queries.filter((q) => q.status === "resolved").length;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold flex items-center gap-2">
              <MessageCircle className="w-6 h-6 text-primary" /> Support Management
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              View and manage customer queries and support messages
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={reload} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Refresh
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <StatCard icon={Inbox}        label="Total Queries" value={queries.length}  color="bg-blue-100 text-blue-700" />
          <StatCard icon={Clock}        label="Open"          value={openCount}        color="bg-amber-100 text-amber-700" />
          <StatCard icon={CheckCircle2} label="Resolved"      value={resolvedCount}    color="bg-emerald-100 text-emerald-700" />
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search by name, email, subject…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            {(["all", "open", "resolved"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors capitalize",
                  statusFilter === s
                    ? "bg-foreground text-background border-foreground"
                    : "bg-background text-muted-foreground border-input hover:border-foreground hover:text-foreground"
                )}
              >
                {s === "all" ? "All" : s}
              </button>
            ))}
          </div>
        </div>

        {/* Query list */}
        {filtered.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <MessageCircle className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium text-muted-foreground">
                {queries.length === 0 ? "No support queries yet" : "No queries match your filters"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {queries.length === 0
                  ? "When customers submit support queries via the contact form, they will appear here."
                  : "Try adjusting your search or status filter."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map((q) => (
              <Card
                key={q.id}
                className={cn(
                  "transition-colors",
                  q.status === "open" && "border-amber-200 bg-amber-50/20"
                )}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-white font-bold text-sm",
                      q.status === "open" ? "bg-amber-500" : "bg-emerald-500"
                    )}>
                      {q.name?.charAt(0)?.toUpperCase() || "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-semibold text-sm">{q.name}</span>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] capitalize",
                            q.status === "open"
                              ? "border-amber-300 text-amber-700"
                              : "border-emerald-300 text-emerald-700"
                          )}
                        >
                          {q.status === "open" ? <Clock className="w-2.5 h-2.5 mr-1" /> : <CheckCircle2 className="w-2.5 h-2.5 mr-1" />}
                          {q.status}
                        </Badge>
                        <span className="text-[10px] font-mono text-muted-foreground">{q.id}</span>
                      </div>
                      <p className="text-sm font-medium text-foreground truncate">{q.subject}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{q.message}</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-2">
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Mail className="w-3 h-3" />{q.email}
                        </span>
                        {q.phone && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Phone className="w-3 h-3" />{q.phone}
                          </span>
                        )}
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="w-3 h-3" />{formatDate(q.createdAt)}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setViewQuery(q)}
                        className="gap-1.5"
                      >
                        <Eye className="w-3.5 h-3.5" /> View
                      </Button>
                      {q.status === "open" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => resolveQuery(q.id)}
                          className="gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Resolve
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => reopenQuery(q.id)}
                          className="gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50"
                        >
                          <Clock className="w-3.5 h-3.5" /> Reopen
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* View dialog */}
        {viewQuery && (
          <Dialog open={!!viewQuery} onOpenChange={() => setViewQuery(null)}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <MessageCircle className="w-5 h-5 text-primary" />
                  Support Query
                </DialogTitle>
                <DialogDescription className="font-mono text-xs">{viewQuery.id}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-0.5">
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><User className="w-3 h-3" /> Name</p>
                    <p className="text-sm font-semibold">{viewQuery.name}</p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="w-3 h-3" /> Email</p>
                    <p className="text-sm">{viewQuery.email}</p>
                  </div>
                  {viewQuery.phone && (
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" /> Phone</p>
                      <p className="text-sm">{viewQuery.phone}</p>
                    </div>
                  )}
                  <div className="space-y-0.5">
                    <p className="text-xs text-muted-foreground">Status</p>
                    <Badge variant="outline" className={cn(
                      "capitalize text-xs",
                      viewQuery.status === "open" ? "border-amber-300 text-amber-700" : "border-emerald-300 text-emerald-700"
                    )}>
                      {viewQuery.status}
                    </Badge>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" /> Received</p>
                    <p className="text-sm">{formatDate(viewQuery.createdAt)}</p>
                  </div>
                  {viewQuery.resolvedAt && (
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground">Resolved</p>
                      <p className="text-sm">{formatDate(viewQuery.resolvedAt)}</p>
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Subject</p>
                  <p className="text-sm font-medium">{viewQuery.subject}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Message</p>
                  <div className="rounded-lg bg-muted/40 border p-3 text-sm whitespace-pre-wrap">{viewQuery.message}</div>
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-rose-600 hover:bg-rose-50 border-rose-200"
                  onClick={() => deleteQuery(viewQuery.id)}
                >
                  Delete
                </Button>
                {viewQuery.status === "open" ? (
                  <Button
                    size="sm"
                    className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => resolveQuery(viewQuery.id)}
                  >
                    <CheckCircle2 className="w-4 h-4" /> Mark as Resolved
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50"
                    onClick={() => reopenQuery(viewQuery.id)}
                  >
                    <Clock className="w-4 h-4" /> Reopen
                  </Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </AdminLayout>
  );
}
