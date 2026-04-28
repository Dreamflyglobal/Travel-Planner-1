const BASE = () => (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");

export interface CrmLead {
  id: number;
  leadId: string;
  name: string;
  phone: string;
  email?: string | null;
  type: string;
  source: string;
  status: string;
  packageId?: number | null;
  packageName?: string | null;
  assignedTo?: string | null;
  assignedName?: string | null;
  bookingRef?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CrmEnquiry {
  id: number;
  enquiryId: string;
  packageId: number;
  packageName: string;
  destination: string;
  name: string;
  phone: string;
  email?: string | null;
  userId?: string | null;
  source: string;
  agentId?: string | null;
  agentName?: string | null;
  travelDate?: string | null;
  people?: number | null;
  notes?: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  duplicate?: boolean;
}

export type LeadStatus =
  | "viewed"
  | "guest_lead"
  | "abandoned"
  | "new"
  | "contacted"
  | "interested"
  | "booked"
  | "lost";

export type LeadSource = "auto" | "form" | "agent";

export const STATUS_META: Record<string, { label: string; color: string }> = {
  viewed:     { label: "Viewed",      color: "bg-slate-100 text-slate-700" },
  guest_lead: { label: "Guest Lead",  color: "bg-indigo-100 text-indigo-700" },
  abandoned:  { label: "Abandoned",   color: "bg-orange-100 text-orange-700" },
  new:        { label: "New",         color: "bg-blue-100 text-blue-800" },
  contacted:  { label: "Contacted",   color: "bg-yellow-100 text-yellow-800" },
  interested: { label: "Interested",  color: "bg-purple-100 text-purple-800" },
  booked:     { label: "Booked",      color: "bg-green-100 text-green-800" },
  lost:       { label: "Lost",        color: "bg-red-100 text-red-800" },
};

export const SOURCE_META: Record<string, { label: string; color: string }> = {
  auto:  { label: "Auto",   color: "bg-teal-100 text-teal-700" },
  form:  { label: "Form",   color: "bg-indigo-100 text-indigo-700" },
  agent: { label: "Agent",  color: "bg-orange-100 text-orange-700" },
};

export const TYPE_META: Record<string, { label: string; color: string }> = {
  flight:  { label: "Flight",  color: "bg-sky-100 text-sky-800" },
  bus:     { label: "Bus",     color: "bg-orange-100 text-orange-800" },
  hotel:   { label: "Hotel",   color: "bg-teal-100 text-teal-800" },
  holiday: { label: "Holiday", color: "bg-pink-100 text-pink-800" },
};

// ── Staff helpers (localStorage) ─────────────────────────────────────────────
export interface StaffMember {
  id: string;
  name: string;
  email: string;
  phone?: string;
}

export function getStaffUsers(): StaffMember[] {
  try {
    const users: any[] = JSON.parse(localStorage.getItem("users") ?? "[]");
    return users
      .filter((u) => u.role === "staff")
      .map((u) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone }));
  } catch { return []; }
}

export function createStaffUser(
  name: string,
  email: string,
  password: string,
  phone: string,
): StaffMember | null {
  const users: any[] = JSON.parse(localStorage.getItem("users") ?? "[]");
  if (users.find((u) => u.email === email)) return null;
  const newUser = {
    id: `staff_${Date.now()}`, name, email, phone, password,
    role: "staff", createdAt: new Date().toISOString(),
  };
  users.push(newUser);
  localStorage.setItem("users", JSON.stringify(users));
  return { id: newUser.id, name, email, phone };
}

export function deleteStaffUser(staffId: string): void {
  const users: any[] = JSON.parse(localStorage.getItem("users") ?? "[]");
  localStorage.setItem("users", JSON.stringify(users.filter((u) => u.id !== staffId)));
}

// ── Auto-assign a new lead to a random staff member ──────────────────────────
async function tryAutoAssign(leadId: string): Promise<void> {
  const staff = getStaffUsers();
  if (staff.length === 0) return;
  const s = staff[Math.floor(Math.random() * staff.length)];
  await assignLead(leadId, s.id, s.name);
}

// ── Core Lead API functions ───────────────────────────────────────────────────

export async function fetchLeads(filters?: {
  status?: string;
  type?: string;
  assignedTo?: string;
}): Promise<CrmLead[]> {
  const params = new URLSearchParams();
  if (filters?.status)     params.set("status", filters.status);
  if (filters?.type)       params.set("type", filters.type);
  if (filters?.assignedTo) params.set("assignedTo", filters.assignedTo);
  const qs = params.toString() ? `?${params}` : "";
  const res = await fetch(`${BASE()}/api/leads${qs}`);
  if (!res.ok) return [];
  return res.json();
}

/**
 * Save a lead. Duplicates within 1 hour are silently skipped by the API.
 * status defaults to "new"; pass "viewed", "guest_lead", "abandoned" etc. as needed.
 */
export async function autoSaveLead(
  name: string,
  phone: string,
  type: "flight" | "bus" | "hotel" | "holiday",
  email?: string,
  notes?: string,
  source: LeadSource = "form",
  status = "new",
  packageId?: number,
  packageName?: string,
): Promise<CrmLead | null> {
  if (!name.trim() || !phone.trim()) return null;
  try {
    const res = await fetch(`${BASE()}/api/leads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name:  name.trim(),
        phone: phone.trim(),
        email,
        type,
        source,
        status,
        ...(packageId   ? { packageId }   : {}),
        ...(packageName ? { packageName } : {}),
        ...(notes       ? { notes }       : {}),
      }),
    });
    if (!res.ok) return null;
    const lead: CrmLead = await res.json();
    if (!lead.assignedTo && status === "new") {
      tryAutoAssign(lead.leadId).catch(() => {});
    }
    return lead;
  } catch {
    return null;
  }
}

export async function updateLeadStatus(leadId: string, status: string): Promise<CrmLead | null> {
  try {
    const res = await fetch(`${BASE()}/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    return res.ok ? res.json() : null;
  } catch { return null; }
}

export async function assignLead(leadId: string, staffId: string, staffName: string): Promise<CrmLead | null> {
  try {
    const res = await fetch(`${BASE()}/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignedTo: staffId, assignedName: staffName }),
    });
    return res.ok ? res.json() : null;
  } catch { return null; }
}

export async function addLeadNotes(leadId: string, notes: string): Promise<CrmLead | null> {
  try {
    const res = await fetch(`${BASE()}/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes }),
    });
    return res.ok ? res.json() : null;
  } catch { return null; }
}

export async function saveAbandonedLead(
  name: string,
  phone: string,
  type: "flight" | "hotel" | "bus",
  email?: string,
  notes?: string,
): Promise<void> {
  if (!name.trim() || !phone.trim()) return;
  try {
    await fetch(`${BASE()}/api/leads/abandoned`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), phone: phone.trim(), type, email, notes }),
    });
  } catch {
    // non-blocking
  }
}

export async function convertLeadToBooked(
  phone: string,
  type: string,
  bookingRef?: string,
): Promise<void> {
  try {
    await fetch(`${BASE()}/api/leads/convert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, type, bookingRef }),
    });
  } catch {
    // non-blocking
  }
  // ── Trigger referral reward on first booking ──────────────────────────────
  try {
    const { tryProcessReferralByPhone } = await import("./referral");
    tryProcessReferralByPhone(phone);
  } catch { /* non-blocking */ }
}

// ── Enquiry API functions ─────────────────────────────────────────────────────

export async function fetchEnquiries(filters?: { packageId?: number; userId?: string; phone?: string }): Promise<CrmEnquiry[]> {
  const params = new URLSearchParams();
  if (filters?.packageId) params.set("packageId", String(filters.packageId));
  if (filters?.userId)    params.set("userId",    filters.userId);
  if (filters?.phone)     params.set("phone",     filters.phone);
  const qs = params.toString() ? `?${params}` : "";
  const res = await fetch(`${BASE()}/api/enquiries${qs}`);
  if (!res.ok) return [];
  return res.json();
}

export async function checkEnquiryExists(packageId: number, userId?: string, phone?: string): Promise<boolean> {
  try {
    const params = new URLSearchParams({ packageId: String(packageId) });
    if (userId) params.set("userId", userId);
    if (phone)  params.set("phone",  phone);
    const res = await fetch(`${BASE()}/api/enquiries/check?${params}`);
    if (!res.ok) return false;
    const data = await res.json();
    return data.exists === true;
  } catch {
    return false;
  }
}

export async function savePackageEnquiry(opts: {
  packageId: number;
  packageName: string;
  destination: string;
  name: string;
  phone: string;
  email?: string;
  userId?: string;
  source: "guest" | "customer" | "agent";
  agentId?: string;
  agentName?: string;
  travelDate?: string;
  people?: number;
  notes?: string;
}): Promise<CrmEnquiry | null> {
  try {
    const res = await fetch(`${BASE()}/api/enquiries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function saveAgentCustomerEnquiry(
  agentId: string,
  agentName: string,
  customerName: string,
  customerPhone: string,
  packageId: number,
  packageName: string,
  destination: string,
  travelDate?: string,
  people?: number,
): Promise<void> {
  const notes = [
    `Via Agent: ${agentName} (${agentId})`,
    travelDate ? `Travel date: ${travelDate}` : "",
    people     ? `People: ${people}`           : "",
  ].filter(Boolean).join(" | ");

  await savePackageEnquiry({
    packageId, packageName, destination,
    name: customerName, phone: customerPhone,
    source: "agent", agentId, agentName,
    travelDate, people,
    notes,
  });

  // Also create a CRM lead (agent-sourced)
  await autoSaveLead(
    customerName, customerPhone, "holiday", undefined,
    `Agent enquiry: ${packageName} (${destination}) | ${notes}`,
    "agent", "new", packageId, packageName,
  );
}

/**
 * Auto-save a lead for a logged-in customer who opened a holiday package page.
 * status = "viewed"
 * Dedup: same phone + packageId within 1 hour → skipped by API.
 */
export async function autoSaveCustomerHolidayLead(
  _userId: string,
  name: string,
  phone: string,
  email: string | undefined,
  destination: string,
  packageId: number,
  packageName: string,
): Promise<boolean> {
  if (!phone?.trim() || !name?.trim()) return false;

  const lead = await autoSaveLead(
    name, phone, "holiday", email,
    `Opened itinerary: ${packageName} (${destination})`,
    "auto", "viewed", packageId, packageName,
  );
  return !!lead;
}
