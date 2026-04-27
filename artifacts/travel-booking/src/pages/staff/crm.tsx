import { APP_NAME } from "@/lib/app-config";
import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import {
  Phone, MessageCircle, StickyNote, RefreshCw, Search,
  ArrowLeft, Users, CheckCircle2, Clock, XCircle,
  TrendingUp, ChevronRight,
} from "lucide-react";
import {
  fetchLeads, updateLeadStatus, addLeadNotes,
  STATUS_META, TYPE_META,
  type CrmLead, type LeadStatus,
} from "@/lib/crm";

const STAFF_STATUSES: LeadStatus[] = ["new", "contacted", "interested", "booked", "lost"];

const STATUS_NEXT: Record<string, LeadStatus | null> = {
  new:        "contacted",
  contacted:  "interested",
  interested: "booked",
  booked:     null,
  lost:       null,
};

function statusIcon(status: string) {
  if (status === "booked")    return <CheckCircle2 className="w-3.5 h-3.5" />;
  if (status === "lost")      return <XCircle className="w-3.5 h-3.5" />;
  if (status === "contacted") return <Clock className="w-3.5 h-3.5" />;
  return null;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function StaffCRM() {
  const [, setLocation] = useLocation();
  const { user, isStaff } = useAuth();
  const { toast } = useToast();

  const [leads,        setLeads]        = useState<CrmLead[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [notesLead,    setNotesLead]    = useState<CrmLead | null>(null);
  const [notesText,    setNotesText]    = useState("");
  const [savingNotes,  setSavingNotes]  = useState(false);
  const [changingStatus, setChangingStatus] = useState<string | null>(null);

  const loadLeads = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const data = await fetchLeads({ assignedTo: user.id });
    setLeads(data);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!isStaff) { setLocation("/staff-login"); return; }
    loadLeads();
  }, [isStaff, loadLeads, setLocation]);

  if (!isStaff) return null;

  const filtered = leads.filter((l) => {
    if (statusFilter !== "all" && l.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!l.name.toLowerCase().includes(q) && !l.phone.includes(q)) return false;
    }
    return true;
  });

  async function handleStatusChange(lead: CrmLead, status: LeadStatus) {
    setChangingStatus(lead.leadId);
    await updateLeadStatus(lead.leadId, status);
    setLeads((prev) => prev.map((l) => l.leadId === lead.leadId ? { ...l, status } : l));
    setChangingStatus(null);
    toast({ title: `Status → ${STATUS_META[status]?.label ?? status}` });
  }

  async function handleSaveNotes() {
    if (!notesLead) return;
    setSavingNotes(true);
    await addLeadNotes(notesLead.leadId, notesText);
    setLeads((prev) => prev.map((l) =>
      l.leadId === notesLead.leadId ? { ...l, notes: notesText } : l
    ));
    setSavingNotes(false);
    setNotesLead(null);
    toast({ title: "Notes saved" });
  }

  const stats = {
    total:     leads.length,
    new:       leads.filter((l) => l.status === "new").length,
    contacted: leads.filter((l) => l.status === "contacted").length,
    booked:    leads.filter((l) => l.status === "booked").length,
  };

  return (
    <div className="min-h-screen bg-slate-50">

      {/* Header */}
      <div className="bg-white border-b shadow-sm px-4 py-3 flex items-center gap-3 sticky top-0 z-20">
        <Button
          variant="ghost" size="icon" className="h-8 w-8 shrink-0"
          onClick={() => setLocation("/staff/dashboard")}
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold text-slate-900 leading-tight">My Leads</h1>
          <p className="text-[11px] text-slate-400 leading-tight truncate">{user?.name} · assigned leads only</p>
        </div>
        <Button variant="outline" size="sm" className="h-8 px-2.5" onClick={loadLeads} disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="max-w-3xl mx-auto p-4 space-y-4">

        {/* Stats row */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "Total",     value: stats.total,     icon: Users,       color: "text-slate-700",  bg: "bg-slate-100" },
            { label: "New",       value: stats.new,       icon: TrendingUp,  color: "text-blue-600",   bg: "bg-blue-50" },
            { label: "Contacted", value: stats.contacted, icon: Clock,       color: "text-amber-600",  bg: "bg-amber-50" },
            { label: "Converted", value: stats.booked,    icon: CheckCircle2,color: "text-green-600",  bg: "bg-green-50" },
          ].map((s) => (
            <Card key={s.label} className="border-0 shadow-sm">
              <CardContent className="p-3 flex flex-col items-center text-center gap-1">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${s.bg}`}>
                  <s.icon className={`w-4 h-4 ${s.color}`} />
                </div>
                <p className={`text-lg font-extrabold ${s.color}`}>{s.value}</p>
                <p className="text-[10px] text-slate-400 leading-tight">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
            <Input
              className="pl-8 h-9 text-sm"
              placeholder="Search name or phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-36 text-sm shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STAFF_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{STATUS_META[s]?.label ?? s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Leads */}
        {loading ? (
          <div className="py-20 text-center text-slate-400 text-sm">Loading your leads…</div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center text-slate-400 text-sm">
            {leads.length === 0 ? "No leads assigned to you yet." : "No leads match the filter."}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((lead) => {
              const sm = STATUS_META[lead.status] ?? { label: lead.status, color: "bg-slate-100 text-slate-700" };
              const tm = TYPE_META[lead.type]     ?? { label: lead.type,   color: "bg-slate-100 text-slate-700" };
              const nextStatus = STATUS_NEXT[lead.status];
              const isChanging = changingStatus === lead.leadId;
              return (
                <Card key={lead.leadId} className="shadow-sm border-0 overflow-hidden">
                  <CardContent className="p-0">

                    {/* Top strip — status color indicator */}
                    <div className={`h-1 w-full ${
                      lead.status === "booked"    ? "bg-green-400"  :
                      lead.status === "lost"      ? "bg-red-400"    :
                      lead.status === "contacted" ? "bg-amber-400"  :
                      lead.status === "interested"? "bg-purple-400" :
                      "bg-blue-400"
                    }`} />

                    <div className="p-4 space-y-3">
                      {/* Row 1: name + badges */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 text-sm truncate">{lead.name}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{lead.phone}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${sm.color}`}>
                            {statusIcon(lead.status)}
                            {sm.label}
                          </span>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${tm.color}`}>
                            {tm.label}
                          </span>
                        </div>
                      </div>

                      {/* Notes preview */}
                      {lead.notes && (
                        <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2 line-clamp-2">
                          {lead.notes}
                        </p>
                      )}

                      {/* Time + package */}
                      <div className="flex items-center gap-2 text-[10px] text-slate-400 flex-wrap">
                        <span>{timeAgo(lead.createdAt)}</span>
                        {lead.packageName && (
                          <>
                            <span>·</span>
                            <span className="truncate max-w-[140px]">{lead.packageName}</span>
                          </>
                        )}
                      </div>

                      {/* Action row */}
                      <div className="flex flex-wrap gap-2 pt-1">
                        {/* Call */}
                        <a href={`tel:${lead.phone}`}>
                          <Button size="sm" className="h-8 px-3 bg-green-600 hover:bg-green-700 text-white text-xs gap-1">
                            <Phone className="w-3.5 h-3.5" /> Call
                          </Button>
                        </a>

                        {/* WhatsApp */}
                        <a
                          href={`https://wa.me/91${lead.phone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hi ${lead.name}, I'm calling from ${APP_NAME} regarding your ${lead.type} enquiry. How can I help you?`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Button size="sm" variant="outline" className="h-8 px-3 text-xs gap-1 border-green-500 text-green-700 hover:bg-green-50">
                            <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                          </Button>
                        </a>

                        {/* Notes */}
                        <Button
                          size="sm" variant="outline"
                          className="h-8 px-3 text-xs gap-1"
                          onClick={() => { setNotesLead(lead); setNotesText(lead.notes ?? ""); }}
                        >
                          <StickyNote className="w-3.5 h-3.5" /> Notes
                        </Button>

                        {/* Advance status */}
                        {nextStatus && (
                          <Button
                            size="sm" variant="outline"
                            className="h-8 px-3 text-xs gap-1 ml-auto border-purple-300 text-purple-700 hover:bg-purple-50"
                            disabled={isChanging}
                            onClick={() => handleStatusChange(lead, nextStatus)}
                          >
                            {isChanging ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5" />
                            )}
                            Mark {STATUS_META[nextStatus]?.label}
                          </Button>
                        )}

                        {/* Mark lost */}
                        {lead.status !== "lost" && lead.status !== "booked" && (
                          <Button
                            size="sm" variant="ghost"
                            className="h-8 px-3 text-xs gap-1 text-red-500 hover:text-red-700 hover:bg-red-50"
                            disabled={isChanging}
                            onClick={() => handleStatusChange(lead, "lost")}
                          >
                            <XCircle className="w-3.5 h-3.5" /> Lost
                          </Button>
                        )}
                      </div>

                      {/* Status selector */}
                      <div className="pt-1 border-t border-slate-100">
                        <Select
                          value={lead.status}
                          onValueChange={(val) => handleStatusChange(lead, val as LeadStatus)}
                          disabled={isChanging}
                        >
                          <SelectTrigger className="h-8 text-xs w-full">
                            <SelectValue placeholder="Change status…" />
                          </SelectTrigger>
                          <SelectContent>
                            {STAFF_STATUSES.map((s) => (
                              <SelectItem key={s} value={s} className="text-xs">
                                {STATUS_META[s]?.label ?? s}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Notes dialog */}
      <Dialog open={!!notesLead} onOpenChange={(open) => { if (!open) setNotesLead(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Notes — {notesLead?.name}</DialogTitle>
          </DialogHeader>
          <Textarea
            className="text-sm resize-none"
            rows={5}
            placeholder="Add notes about this lead…"
            value={notesText}
            onChange={(e) => setNotesText(e.target.value)}
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => setNotesLead(null)}>Cancel</Button>
            <Button size="sm" onClick={handleSaveNotes} disabled={savingNotes}>
              {savingNotes ? "Saving…" : "Save Notes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
