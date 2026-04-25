import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import {
  Phone, MessageCircle, Users, UserCheck,
  RefreshCw, Filter, Search, StickyNote, Plus, Trash2,
} from "lucide-react";
import { AdminLayout } from "@/components/admin-layout";
import {
  fetchLeads, updateLeadStatus, assignLead, addLeadNotes,
  getStaffUsers, createStaffUser, deleteStaffUser,
  STATUS_META, TYPE_META, SOURCE_META,
  type CrmLead, type LeadStatus, type StaffMember,
} from "@/lib/crm";
import { getAllStaffBookings, INCENTIVE_PER_BOOKING } from "@/lib/staff-data";

const ALL_STATUSES: LeadStatus[] = ["new", "contacted", "interested", "booked", "lost"];
const ALL_TYPES   = ["flight", "bus", "hotel", "holiday"];
const ALL_SOURCES = ["auto", "form", "agent"];

export default function AdminCRM() {
  const [, setLocation] = useLocation();
  const { isAdmin }     = useAuth();
  const { toast }       = useToast();

  const [leads,        setLeads]       = useState<CrmLead[]>([]);
  const [loading,      setLoading]     = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter,   setTypeFilter]  = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [search,       setSearch]      = useState("");
  const [staffList,    setStaffList]   = useState<StaffMember[]>([]);
  const [activeTab,    setActiveTab]   = useState<"leads" | "staff">("leads");

  const [notesLead,   setNotesLead]   = useState<CrmLead | null>(null);
  const [notesText,   setNotesText]   = useState("");
  const [assignTarget, setAssignTarget] = useState<CrmLead | null>(null);
  const [selectedStaff, setSelectedStaff] = useState("");

  const [showCreateStaff, setShowCreateStaff] = useState(false);
  const [staffForm, setStaffForm] = useState({ name: "", email: "", phone: "", password: "" });
  const [staffErrors, setStaffErrors] = useState<Record<string, string>>({});

  const loadLeads = useCallback(async () => {
    setLoading(true);
    const data = await fetchLeads();
    setLeads(data);
    setLoading(false);
  }, []);

  const refreshStaff = () => setStaffList(getStaffUsers());

  useEffect(() => { loadLeads(); refreshStaff(); }, [loadLeads]);

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-500">Admin access required.</p>
      </div>
    );
  }

  const filtered = leads.filter((l) => {
    if (statusFilter !== "all" && l.status !== statusFilter) return false;
    if (typeFilter   !== "all" && l.type   !== typeFilter)   return false;
    if (sourceFilter !== "all" && l.source !== sourceFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!l.name.toLowerCase().includes(q) && !l.phone.includes(q)) return false;
    }
    return true;
  });

  async function handleStatusChange(lead: CrmLead, status: LeadStatus) {
    await updateLeadStatus(lead.leadId, status);
    setLeads((prev) => prev.map((l) => l.leadId === lead.leadId ? { ...l, status } : l));
    toast({ title: `Status updated to "${STATUS_META[status].label}"` });
  }

  async function handleAssign() {
    if (!assignTarget || !selectedStaff) return;
    const staff = staffList.find((s) => s.id === selectedStaff);
    if (!staff) return;
    await assignLead(assignTarget.leadId, staff.id, staff.name);
    setLeads((prev) => prev.map((l) =>
      l.leadId === assignTarget.leadId ? { ...l, assignedTo: staff.id, assignedName: staff.name } : l
    ));
    setAssignTarget(null);
    setSelectedStaff("");
    toast({ title: `Lead assigned to ${staff.name}` });
  }

  async function handleSaveNotes() {
    if (!notesLead) return;
    await addLeadNotes(notesLead.leadId, notesText);
    setLeads((prev) => prev.map((l) =>
      l.leadId === notesLead.leadId ? { ...l, notes: notesText } : l
    ));
    setNotesLead(null);
    toast({ title: "Notes saved" });
  }

  function handleCreateStaff() {
    const errs: Record<string, string> = {};
    if (!staffForm.name.trim())     errs.name     = "Name is required";
    if (!staffForm.email.trim())    errs.email    = "Email is required";
    if (!staffForm.password.trim()) errs.password = "Password is required";
    if (Object.keys(errs).length > 0) { setStaffErrors(errs); return; }

    const created = createStaffUser(
      staffForm.name.trim(), staffForm.email.trim(),
      staffForm.password.trim(), staffForm.phone.trim(),
    );
    if (!created) {
      toast({ title: "Email already in use", variant: "destructive" }); return;
    }
    refreshStaff();
    setStaffForm({ name: "", email: "", phone: "", password: "" });
    setStaffErrors({});
    setShowCreateStaff(false);
    toast({ title: `Staff "${created.name}" created`, description: `Login: ${created.email}` });
  }

  function handleDeleteStaff(s: StaffMember) {
    deleteStaffUser(s.id);
    refreshStaff();
    toast({ title: `Removed ${s.name}` });
  }

  const stats = {
    total:     leads.length,
    new:       leads.filter((l) => l.status === "new").length,
    contacted: leads.filter((l) => l.status === "contacted").length,
    booked:    leads.filter((l) => l.status === "booked").length,
    staff:     staffList.length,
  };

  return (
    <AdminLayout>
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">CRM — Lead Tracker</h1>
          <p className="text-xs text-slate-500">All booking leads · abandoned + enquiries</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadLeads} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button size="sm" onClick={() => { setActiveTab("staff"); setShowCreateStaff(true); }}>
            <Plus className="w-4 h-4 mr-1" /> Add Staff
          </Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: "Total Leads",  value: stats.total,     color: "text-slate-700" },
            { label: "New",          value: stats.new,        color: "text-blue-600" },
            { label: "Contacted",    value: stats.contacted,  color: "text-yellow-600" },
            { label: "Booked",       value: stats.booked,     color: "text-green-600" },
            { label: "Staff",        value: stats.staff,      color: "text-purple-600" },
          ].map((s) => (
            <Card key={s.label} className="p-4">
              <p className="text-xs text-slate-500">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            </Card>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white border rounded-xl p-1 w-fit">
          {(["leads", "staff"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-1.5 rounded-lg text-sm font-semibold transition-all capitalize ${
                activeTab === tab
                  ? "bg-purple-600 text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab === "leads" ? `Leads (${leads.length})` : `Staff (${staffList.length})`}
            </button>
          ))}
        </div>

        {/* ── Leads Tab ── */}
        {activeTab === "leads" && (
          <>
            {/* Filters */}
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-wrap gap-3 items-end">
                  <div className="flex-1 min-w-[180px]">
                    <Label className="text-xs mb-1 block">Search name / phone</Label>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
                      <Input className="pl-8 h-9 text-sm" placeholder="Search…"
                        value={search} onChange={(e) => setSearch(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs mb-1 block">Status</Label>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="h-9 w-36 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        {ALL_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs mb-1 block">Type</Label>
                    <Select value={typeFilter} onValueChange={setTypeFilter}>
                      <SelectTrigger className="h-9 w-32 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All types</SelectItem>
                        {ALL_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>{TYPE_META[t]?.label ?? t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs mb-1 block">Source</Label>
                    <Select value={sourceFilter} onValueChange={setSourceFilter}>
                      <SelectTrigger className="h-9 w-28 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All sources</SelectItem>
                        {ALL_SOURCES.map((s) => (
                          <SelectItem key={s} value={s}>{SOURCE_META[s]?.label ?? s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button variant="outline" size="sm" className="h-9"
                    onClick={() => { setStatusFilter("all"); setTypeFilter("all"); setSourceFilter("all"); setSearch(""); }}>
                    <Filter className="w-4 h-4 mr-1" /> Clear
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Leads Table */}
            <Card>
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm font-semibold text-slate-700">
                  {filtered.length} lead{filtered.length !== 1 ? "s" : ""}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                {loading ? (
                  <div className="py-16 text-center text-slate-400 text-sm">Loading leads…</div>
                ) : filtered.length === 0 ? (
                  <div className="py-16 text-center text-slate-400 text-sm">No leads found</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-slate-50 text-xs text-slate-500 uppercase tracking-wider">
                        <th className="text-left px-4 py-3 font-medium">Name / Phone</th>
                        <th className="text-left px-4 py-3 font-medium">Type</th>
                        <th className="text-left px-4 py-3 font-medium">Source</th>
                        <th className="text-left px-4 py-3 font-medium">Status</th>
                        <th className="text-left px-4 py-3 font-medium">Assigned To</th>
                        <th className="text-left px-4 py-3 font-medium">Date</th>
                        <th className="text-left px-4 py-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filtered.map((lead) => {
                        const sm = STATUS_META[lead.status as LeadStatus] ?? { label: lead.status, color: "bg-slate-100 text-slate-700" };
                        const tm = TYPE_META[lead.type]     ?? { label: lead.type,   color: "bg-slate-100 text-slate-700" };
                        const src = SOURCE_META[lead.source] ?? { label: lead.source, color: "bg-slate-100 text-slate-700" };
                        return (
                          <tr key={lead.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3">
                              <p className="font-medium text-slate-900">{lead.name}</p>
                              <p className="text-xs text-slate-500">{lead.phone}</p>
                              {lead.email && <p className="text-xs text-slate-400">{lead.email}</p>}
                              {lead.notes && (
                                <p className="text-xs text-amber-600 mt-0.5 line-clamp-1 max-w-[200px]">{lead.notes}</p>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tm.color}`}>
                                {tm.label}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${src.color}`}>
                                {src.label}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <Select
                                value={lead.status}
                                onValueChange={(v) => handleStatusChange(lead, v as LeadStatus)}
                              >
                                <SelectTrigger className={`h-7 w-32 text-xs border-0 shadow-none px-2 font-medium ${sm.color} rounded-full`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {ALL_STATUSES.map((s) => (
                                    <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-4 py-3">
                              {lead.assignedName ? (
                                <button
                                  className="text-xs text-purple-600 font-medium hover:underline"
                                  onClick={() => { setAssignTarget(lead); setSelectedStaff(lead.assignedTo ?? ""); }}
                                >
                                  {lead.assignedName}
                                </button>
                              ) : (
                                <button
                                  className="text-xs text-slate-400 hover:text-purple-600 font-medium"
                                  onClick={() => { setAssignTarget(lead); setSelectedStaff(""); }}
                                >
                                  Assign staff
                                </button>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                              {new Date(lead.createdAt).toLocaleString("en-IN", {
                                day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                              })}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1">
                                <a href={`tel:${lead.phone}`}
                                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-green-600 transition-colors"
                                  title="Call">
                                  <Phone className="w-4 h-4" />
                                </a>
                                <a href={`https://wa.me/${lead.phone.replace(/\D/g, "")}`}
                                  target="_blank" rel="noreferrer"
                                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-green-500 transition-colors"
                                  title="WhatsApp">
                                  <MessageCircle className="w-4 h-4" />
                                </a>
                                <button
                                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-amber-600 transition-colors"
                                  title="Add notes"
                                  onClick={() => { setNotesLead(lead); setNotesText(lead.notes ?? ""); }}
                                >
                                  <StickyNote className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* ── Staff Tab ── */}
        {activeTab === "staff" && (
          <Card>
            <CardHeader className="pb-2 pt-4 px-5 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <UserCheck className="w-4 h-4" /> Staff Members ({staffList.length})
              </CardTitle>
              <Button size="sm" onClick={() => setShowCreateStaff(true)}>
                <Plus className="w-4 h-4 mr-1" /> Add Staff
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {staffList.length === 0 ? (
                <div className="py-16 text-center text-slate-400 text-sm">
                  <Users className="w-10 h-10 mx-auto mb-3 text-slate-200" />
                  <p>No staff members yet.</p>
                  <p className="text-xs mt-1">Click "Add Staff" to create your first staff account.</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50 text-xs text-slate-500 uppercase tracking-wider">
                      <th className="text-left px-5 py-3 font-medium">Name</th>
                      <th className="text-left px-5 py-3 font-medium">Email</th>
                      <th className="text-left px-5 py-3 font-medium">Phone</th>
                      <th className="text-left px-5 py-3 font-medium">Assigned</th>
                      <th className="text-left px-5 py-3 font-medium">Conversions</th>
                      <th className="text-left px-5 py-3 font-medium">Bookings</th>
                      <th className="text-left px-5 py-3 font-medium">Incentive</th>
                      <th className="text-left px-5 py-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {staffList.map((s) => {
                      const assignedCount   = leads.filter((l) => l.assignedTo === s.id).length;
                      const conversions     = leads.filter((l) => l.assignedTo === s.id && l.status === "booked").length;
                      const allBks          = getAllStaffBookings().filter((b) => b.staffId === s.id);
                      const totalIncentive  = allBks.reduce((acc, b) => acc + b.incentive, 0);
                      return (
                        <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center text-xs font-bold text-purple-700">
                                {s.name.charAt(0).toUpperCase()}
                              </div>
                              <span className="font-medium text-slate-900">{s.name}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3 text-slate-500 text-xs">{s.email}</td>
                          <td className="px-5 py-3 text-slate-500 text-xs">{s.phone || "—"}</td>
                          <td className="px-5 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                              assignedCount > 0 ? "bg-purple-100 text-purple-700" : "bg-slate-100 text-slate-500"
                            }`}>
                              {assignedCount}
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                              conversions > 0 ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"
                            }`}>
                              {conversions}
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                              allBks.length > 0 ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"
                            }`}>
                              {allBks.length}
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                              totalIncentive > 0 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"
                            }`}>
                              ₹{totalIncentive.toLocaleString("en-IN")}
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex gap-1">
                              <a href={`tel:${s.phone}`}
                                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-green-600 transition-colors"
                                title="Call">
                                <Phone className="w-3.5 h-3.5" />
                              </a>
                              <button
                                className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                                title="Remove staff"
                                onClick={() => handleDeleteStaff(s)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Assign Lead dialog */}
      <Dialog open={!!assignTarget} onOpenChange={(o) => !o && setAssignTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Assign Lead to Staff</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <p className="text-sm text-slate-600">Lead: <strong>{assignTarget?.name}</strong></p>
            {staffList.length === 0 ? (
              <p className="text-sm text-slate-500">No staff yet. Create one in the Staff tab first.</p>
            ) : (
              <Select value={selectedStaff} onValueChange={setSelectedStaff}>
                <SelectTrigger><SelectValue placeholder="Select staff member" /></SelectTrigger>
                <SelectContent>
                  {staffList.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name} — {s.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setAssignTarget(null)}>Cancel</Button>
              <Button className="flex-1" onClick={handleAssign} disabled={!selectedStaff}>Assign</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Notes dialog */}
      <Dialog open={!!notesLead} onOpenChange={(o) => !o && setNotesLead(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Notes — {notesLead?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <Textarea
              rows={4}
              placeholder="Add notes about this lead…"
              value={notesText}
              onChange={(e) => setNotesText(e.target.value)}
            />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setNotesLead(null)}>Cancel</Button>
              <Button className="flex-1" onClick={handleSaveNotes}>Save Notes</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Staff dialog */}
      <Dialog open={showCreateStaff} onOpenChange={setShowCreateStaff}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-4 h-4" /> Add Staff Member
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            {(["name", "email", "phone", "password"] as const).map((field) => (
              <div key={field}>
                <Label className="text-xs capitalize mb-1 block">{field} {field !== "phone" ? <span className="text-red-500">*</span> : <span className="text-slate-400 font-normal">(optional)</span>}</Label>
                <Input
                  type={field === "password" ? "password" : "text"}
                  placeholder={
                    field === "email"    ? "staff@dreamflyglobal.com" :
                    field === "phone"    ? "9876543210" :
                    field === "name"     ? "Full name" :
                    "Create a password"
                  }
                  value={staffForm[field]}
                  onChange={(e) => { setStaffForm((f) => ({ ...f, [field]: e.target.value })); setStaffErrors((e2) => ({ ...e2, [field]: "" })); }}
                  className={staffErrors[field] ? "border-red-400" : ""}
                />
                {staffErrors[field] && <p className="text-xs text-red-500 mt-1">{staffErrors[field]}</p>}
              </div>
            ))}
            <p className="text-xs text-slate-500">The staff member can log in at <strong>/staff-login</strong> using these credentials.</p>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => { setShowCreateStaff(false); setStaffErrors({}); }}>Cancel</Button>
              <Button className="flex-1" onClick={handleCreateStaff}>Create Staff</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </AdminLayout>
  );
}
