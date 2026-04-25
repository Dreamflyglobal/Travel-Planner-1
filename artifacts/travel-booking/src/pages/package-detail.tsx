import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";
import {
  autoSaveCustomerHolidayLead,
  saveAgentCustomerEnquiry,
  savePackageEnquiry,
  autoSaveLead,
} from "@/lib/crm";
import { Shield } from "lucide-react";
import {
  ArrowLeft, Star, Clock, Users, CheckCircle2, XCircle, ChevronRight,
  MapPin, Utensils, Hotel, MessageSquare, Calendar, Phone,
  ArrowRight, Briefcase, Plus, X, SlidersHorizontal, Loader2,
} from "lucide-react";
import { PACKAGE_TYPE_LABELS, type ItineraryDay } from "@/lib/holiday-data";
import { getMarkupSettings, getHiddenMarkupAmount, getConvenienceFee, getAgentEffectiveMarkup } from "@/lib/pricing";

interface PricingBreakdown {
  basePrice:     number;
  typeMarkupPct: number;
  typeMarkupAmt: number;
  dateMarkupPct: number;
  dateMarkupAmt: number;
  dateLabel:     string;
  dateKind:      string;
}

interface DbPackage {
  id: number;
  name: string;
  destination: string;
  type: string;
  duration: number;
  nights: number;
  durationLabel: string;
  pricePerPerson: number;
  originalPrice: number;
  pricingBreakdown: PricingBreakdown;
  rating: number;
  ratingCount: number;
  images: string[];
  highlights: string[];
  description: string;
  inclusions: string[];
  exclusions: string[];
  itinerary: ItineraryDay[] | null;
  featured: boolean;
  createdBy: string;
}

export default function PackageDetail() {
  const { id }           = useParams<{ id: string }>();
  const [, setLocation]  = useLocation();
  const { toast }        = useToast();
  const { user, signup } = useAuth();

  const isGuest    = !user;
  const isAgent    = user?.role === "agent";
  const isCustomer = user && !isAgent;

  const [pkg, setPkg]             = useState<DbPackage | null>(null);
  const [loading, setLoading]     = useState(true);
  const [notFound, setNotFound]   = useState(false);
  const [travelDate, setTravelDate] = useState("");

  const [activeImg,   setActiveImg]   = useState(0);
  const [people,      setPeople]      = useState(2);
  const [itinerary,   setItinerary]   = useState<ItineraryDay[]>([]);
  const [expandedDay, setExpandedDay] = useState<number | null>(0);

  // Track whether lead has been handled for this page visit
  const leadHandledRef = useRef(false);

  // ── Lead capture popup (auto-shown after 700ms for guests only) ─────────────
  const [showLeadCapture,  setShowLeadCapture]  = useState(false);
  const [lcName,           setLcName]           = useState("");
  const [lcPhone,          setLcPhone]          = useState("");
  const [lcErrors,         setLcErrors]         = useState<Record<string, string>>({});
  const [lcSubmitting,     setLcSubmitting]     = useState(false);
  const [lcSubmitted,      setLcSubmitted]      = useState(false);

  // ── Guest enquiry modal (shown when guest clicks "Send Enquiry" button) ───────
  const [showEnquiry,  setShowEnquiry]  = useState(false);
  const [eqName,       setEqName]       = useState("");
  const [eqPhone,      setEqPhone]      = useState("");
  const [eqDate,       setEqDate]       = useState("");
  const [eqErrors,     setEqErrors]     = useState<Record<string, string>>({});
  const [eqSubmitting, setEqSubmitting] = useState(false);
  const [eqSubmitted,  setEqSubmitted]  = useState(false);

  // ── Customer enquiry modal ────────────────────────────────────────────────────
  const [showCustEnquiry,  setShowCustEnquiry]  = useState(false);
  const [ceDate,           setCeDate]           = useState("");
  const [cePhone,          setCePhone]          = useState("");
  const [cePhoneError,     setCePhoneError]     = useState("");
  const [ceSubmitting,     setCeSubmitting]     = useState(false);
  const [ceSubmitted,      setCeSubmitted]      = useState(false);

  // ── Agent enquiry modal ──────────────────────────────────────────────────────
  const [showAgentModal, setShowAgentModal] = useState(false);
  const [aqName,         setAqName]         = useState("");
  const [aqPhone,        setAqPhone]        = useState("");
  const [aqDate,         setAqDate]         = useState("");
  const [aqErrors,       setAqErrors]       = useState<Record<string, string>>({});
  const [aqSubmitting,   setAqSubmitting]   = useState(false);
  const [aqSubmitted,    setAqSubmitted]    = useState(false);

  // ── Customize Package modal ──────────────────────────────────────────────────
  const [showCustomize, setShowCustomize] = useState(false);
  const [addedPlaces,   setAddedPlaces]   = useState<string[]>([]);
  const [placeInput,    setPlaceInput]    = useState("");
  const [removedDays,   setRemovedDays]   = useState<number[]>([]);
  const [customNotes,   setCustomNotes]   = useState("");
  const [cxName,        setCxName]        = useState("");
  const [cxPhone,       setCxPhone]       = useState("");
  const [cxErrors,      setCxErrors]      = useState<Record<string, string>>({});
  const [cxSubmitted,   setCxSubmitted]   = useState(false);

  const itineraryLoadedRef = useRef(false);

  // ── Fetch package from API ────────────────────────────────────────────────────
  function fetchPkg(date?: string) {
    if (!id) return;
    setLoading(true);
    const params = date ? `?travelDate=${date}` : "";
    fetch(`/api/holiday-packages/${id}${params}`)
      .then((r) => {
        if (!r.ok) { setNotFound(true); return null; }
        return r.json();
      })
      .then((data: DbPackage | null) => {
        if (!data) return;
        setPkg(data);
        // Only load itinerary once (it doesn't change with travel date)
        if (!itineraryLoadedRef.current && data.itinerary && Array.isArray(data.itinerary) && data.itinerary.length > 0) {
          setItinerary(data.itinerary as ItineraryDay[]);
          itineraryLoadedRef.current = true;
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetchPkg(); }, [id]);

  // ── Lead / interest logic on page load ────────────────────────────────────────
  useEffect(() => {
    if (!pkg || leadHandledRef.current) return;

    if (isGuest) {
      // Guests: show lead capture popup after 700ms
      const t = setTimeout(() => setShowLeadCapture(true), 700);
      return () => clearTimeout(t);
    }

    if (isCustomer) {
      // Logged-in customer: silently create lead with status="viewed"
      leadHandledRef.current = true;
      autoSaveCustomerHolidayLead(
        user!.id, user!.name, user!.phone || "", user!.email,
        pkg.destination, pkg.id, pkg.name,
      );
    }
    // Agents: no auto lead on page open
    return;
  }, [pkg?.id]);

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-10 h-10 animate-spin text-purple-500" />
        </div>
      </Layout>
    );
  }

  if (notFound || !pkg) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-24 text-center">
          <h2 className="text-2xl font-bold mb-4">Package not found</h2>
          <Button onClick={() => setLocation("/packages")}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Packages
          </Button>
        </div>
      </Layout>
    );
  }

  // Smart pricing: API returns pricePerPerson (type + date smart markup).
  // On top, apply admin hidden markup (absorbed into displayed price) + convenience fee (shown at booking).
  const pricePerPerson  = pkg.pricePerPerson;
  const originalPPP     = pkg.originalPrice;
  const breakdown       = pkg.pricingBreakdown;
  const hasDateDiscount = breakdown?.dateMarkupPct < 0;
  const hasDatePremium  = breakdown?.dateMarkupPct > 0;

  // Hidden markup (agent gets lower markup if agentMarkup is set)
  const agentMarkupFlat = isAgent && user?.agentMarkup != null ? user.agentMarkup : null;
  const hiddenMarkupPP  = getHiddenMarkupAmount(pricePerPerson, "packages");
  const effectiveMarkupPP = agentMarkupFlat != null
    ? getAgentEffectiveMarkup(pricePerPerson, "packages", agentMarkupFlat)
    : hiddenMarkupPP;
  const displayedPPP      = pricePerPerson + effectiveMarkupPP;
  const displayedOrigPPP  = (originalPPP ?? 0) > 0 ? originalPPP + effectiveMarkupPP : null;

  // Commission for agents
  const commissionPP = isAgent && agentMarkupFlat != null
    ? Math.max(0, hiddenMarkupPP - agentMarkupFlat)
    : 0;

  const baseTotal    = displayedPPP * people;
  const convFeeTotal = getConvenienceFee(pricePerPerson, "packages") * people;
  const grandTotal   = baseTotal + convFeeTotal;

  const { label, color } = PACKAGE_TYPE_LABELS[pkg.type] ?? { label: pkg.type, color: "" };

  function handleBookNow() {
    const params = new URLSearchParams({
      pkgId: String(pkg!.id), name: pkg!.name, dest: pkg!.destination,
      duration: pkg!.durationLabel, img: (pkg!.images[0] ?? ""),
      price: String(pricePerPerson), people: String(people),
    });
    if (travelDate) params.set("travelDate", travelDate);
    setLocation(`/packages/booking?${params.toString()}`);
  }

  // ── Guest lead capture submit (auto-popup) → create account + auto-login + save lead ──
  async function submitLeadCapture(): Promise<void> {
    const errs: Record<string, string> = {};
    if (!lcName.trim()) errs.name = "Name is required";
    const cleanPhone = lcPhone.replace(/\D/g, "");
    if (cleanPhone.length !== 10) errs.phone = "Enter a valid 10-digit mobile number";
    if (Object.keys(errs).length > 0) { setLcErrors(errs); return; }

    setLcSubmitting(true);
    try {
      const email    = `guest_${cleanPhone}@dreamflyglobal.in`;
      const password = `ww_${Date.now()}`;
      await signup(lcName.trim(), email, cleanPhone, password);
      await autoSaveLead(
        lcName.trim(), cleanPhone, "holiday", email,
        `Guest opened: ${pkg!.name} (${pkg!.destination})`,
        "form", "guest_lead", pkg!.id, pkg!.name,
      );
      setLcSubmitted(true);
    } catch {
      toast({ title: "Error", description: "Could not save details. Please try again.", variant: "destructive" });
    } finally {
      setLcSubmitting(false);
    }
  }

  // ── Guest enquiry submit → enquiries table ONLY (no lead) ────────────────────
  async function submitGuestEnquiry(): Promise<void> {
    const errs: Record<string, string> = {};
    if (!eqName.trim()) errs.name = "Name is required";
    if (!/^\d{10}$/.test(eqPhone.replace(/\D/g, ""))) errs.phone = "Enter a valid 10-digit mobile number";
    if (Object.keys(errs).length > 0) { setEqErrors(errs); return; }

    setEqSubmitting(true);
    try {
      await savePackageEnquiry({
        packageId:   pkg!.id,
        packageName: pkg!.name,
        destination: pkg!.destination,
        name:        eqName.trim(),
        phone:       eqPhone.trim(),
        source:      "guest",
        travelDate:  eqDate || undefined,
        people,
      });
      setEqSubmitted(true);
      toast({ title: "Enquiry sent!", description: "Our team will contact you within 24 hours." });

      // CRM lead (triggers admin WhatsApp alert + customer confirmation)
      autoSaveLead(eqName.trim(), eqPhone.trim(), "holiday", undefined,
        `Holiday enquiry: ${pkg!.name} (${pkg!.destination})`, "form", "new", pkg!.id, pkg!.name,
      ).catch(() => {});
      // Holiday itinerary PDF via WhatsApp
      fetch("/api/holiday-whatsapp", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: eqName.trim(), phone: eqPhone.trim(),
          destination: pkg!.destination, duration: (pkg as any).duration || "4D/3N",
          people, travelDate: eqDate || undefined, packageName: pkg!.name, trigger: "lead",
        }),
      }).catch(() => {});
    } catch {
      toast({ title: "Error", description: "Could not send enquiry. Please try again.", variant: "destructive" });
    } finally {
      setEqSubmitting(false);
    }
  }

  // ── Customer enquiry submit → enquiries table ONLY (no lead) ─────────────────
  async function submitCustomerEnquiry(): Promise<void> {
    const phone = user!.phone?.trim() || cePhone.trim();
    if (!user!.phone?.trim()) {
      if (!phone || !/^\d{10}$/.test(phone.replace(/\D/g, ""))) {
        setCePhoneError("Enter a valid 10-digit mobile number");
        return;
      }
    }
    setCePhoneError("");
    setCeSubmitting(true);
    try {
      await savePackageEnquiry({
        packageId:   pkg!.id,
        packageName: pkg!.name,
        destination: pkg!.destination,
        name:        user!.name,
        phone,
        email:       user!.email,
        userId:      user!.id,
        source:      "customer",
        travelDate:  ceDate || undefined,
        people,
      });
      setCeSubmitted(true);
      toast({ title: "Enquiry sent!", description: "Our team will be in touch shortly." });

      // CRM lead (triggers admin WhatsApp alert + customer confirmation)
      autoSaveLead(user!.name, phone, "holiday", user!.email,
        `Holiday enquiry: ${pkg!.name} (${pkg!.destination})`, "form", "new", pkg!.id, pkg!.name,
      ).catch(() => {});
      // Holiday itinerary PDF via WhatsApp
      fetch("/api/holiday-whatsapp", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: user!.name, phone,
          destination: pkg!.destination, duration: (pkg as any).duration || "4D/3N",
          people, travelDate: ceDate || undefined, packageName: pkg!.name, trigger: "lead",
        }),
      }).catch(() => {});
    } catch {
      toast({ title: "Error", description: "Could not send enquiry. Please try again.", variant: "destructive" });
    } finally {
      setCeSubmitting(false);
    }
  }

  // ── Agent enquiry submit → enquiries table + CRM lead (agent-sourced) ────────
  async function submitAgentEnquiry() {
    const errs: Record<string, string> = {};
    if (!aqName.trim() || aqName.trim().length < 2) errs.name  = "Customer name is required";
    if (!aqPhone.trim() || !/^\d{10}$/.test(aqPhone.replace(/\D/g, ""))) errs.phone = "Enter a valid 10-digit number";
    if (Object.keys(errs).length > 0) { setAqErrors(errs); return; }

    setAqSubmitting(true);
    try {
      await saveAgentCustomerEnquiry(
        user!.id, user!.name,
        aqName.trim(), aqPhone.trim(),
        pkg!.id, pkg!.name, pkg!.destination,
        aqDate || undefined, people,
      );
      setAqSubmitted(true);
      toast({ title: "Enquiry created!", description: `Saved for ${aqName.trim()}.` });
    } catch {
      toast({ title: "Error", description: "Could not create enquiry.", variant: "destructive" });
    } finally {
      setAqSubmitting(false);
    }
  }

  // ── Customize submit → lead with customization notes ─────────────────────────
  async function submitCustomize() {
    if (isGuest) {
      const errs: Record<string, string> = {};
      if (!cxName.trim()) errs.name = "Name is required";
      if (!cxPhone.trim() || !/^\d{10}$/.test(cxPhone.replace(/\D/g, ""))) errs.phone = "Valid 10-digit number required";
      if (Object.keys(errs).length > 0) { setCxErrors(errs); return; }
    }

    const removed = itinerary.filter((_, i) =>  removedDays.includes(i)).map((d) => d.title);
    const kept    = itinerary.filter((_, i) => !removedDays.includes(i)).map((d) => d.title);

    const notesParts = [
      `Customize: ${pkg!.name} (${pkg!.destination})`,
      addedPlaces.length > 0 ? `Add places: ${addedPlaces.join(", ")}` : "",
      removed.length     > 0 ? `Remove days: ${removed.join(", ")}`    : "",
      kept.length        > 0 ? `Keep days: ${kept.join(", ")}`         : "",
      customNotes.trim()      ? `Notes: ${customNotes.trim()}`          : "",
    ].filter(Boolean).join(" | ");

    if (isGuest) {
      await autoSaveLead(cxName.trim(), cxPhone.trim(), "holiday", undefined, notesParts, "form");
    } else {
      await autoSaveLead(user!.name, user!.phone || "", "holiday", user!.email, notesParts, "auto");
    }

    setCxSubmitted(true);
    toast({ title: "Customization request sent!", description: "Our team will prepare your personalised package." });
  }

  function addPlace() {
    const t = placeInput.trim();
    if (t && !addedPlaces.includes(t)) setAddedPlaces((p) => [...p, t]);
    setPlaceInput("");
  }

  function toggleRemoveDay(idx: number) {
    setRemovedDays((prev) => prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]);
  }

  // ── Sidebar CTAs ──────────────────────────────────────────────────────────────
  function renderSidebarActions() {
    const customizeBtn = (
      <Button
        variant="outline"
        className="w-full h-11 border-slate-200 text-slate-700 hover:bg-slate-50 font-bold gap-2"
        onClick={() => { setShowCustomize(true); setCxSubmitted(false); setCxErrors({}); setAddedPlaces([]); setRemovedDays([]); setCustomNotes(""); setCxName(""); setCxPhone(""); }}
      >
        <SlidersHorizontal className="w-4 h-4" /> Customize Package
      </Button>
    );

    if (isAgent) {
      return (
        <>
          <Button
            variant="outline"
            className="w-full h-11 border-blue-200 text-blue-700 hover:bg-blue-50 font-bold gap-2"
            onClick={() => { setShowAgentModal(true); setAqSubmitted(false); setAqErrors({}); setAqName(""); setAqPhone(""); setAqDate(""); }}
          >
            <Briefcase className="w-4 h-4" /> Create Customer Enquiry
          </Button>
          {customizeBtn}
        </>
      );
    }

    if (isCustomer) {
      return (
        <>
          <Button
            variant="outline"
            className="w-full h-11 border-purple-200 text-purple-700 hover:bg-purple-50 font-bold gap-2"
            onClick={() => { setShowCustEnquiry(true); setCeSubmitted(false); setCeDate(""); }}
          >
            <MessageSquare className="w-4 h-4" /> Send Enquiry
          </Button>
          {customizeBtn}
        </>
      );
    }

    // Guest
    return (
      <>
        <Button
          variant="outline"
          className="w-full h-11 border-purple-200 text-purple-700 hover:bg-purple-50 font-bold gap-2"
          onClick={() => { setShowEnquiry(true); setEqSubmitted(false); setEqErrors({}); setEqName(""); setEqPhone(""); setEqDate(""); }}
        >
          <MessageSquare className="w-4 h-4" /> Send Enquiry
        </Button>
        {customizeBtn}
      </>
    );
  }

  return (
    <Layout>
      {/* ── Hero Gallery ── */}
      <div className="bg-black">
        <div className="relative h-[55vh] min-h-[400px] overflow-hidden">
          <img
            src={pkg.images[activeImg] ?? "https://images.unsplash.com/photo-1488085061387-422e29b40080?w=1200&q=80"}
            alt={pkg.name}
            className="w-full h-full object-cover opacity-90 transition-all duration-700"
            onError={(e) => { (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1488085061387-422e29b40080?w=1200&q=80"; }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/10" />
          <div className="absolute top-4 left-4">
            <Button variant="outline" size="sm" className="bg-black/50 border-white/20 text-white hover:bg-black/70 gap-1"
              onClick={() => setLocation("/packages")}>
              <ArrowLeft className="w-4 h-4" /> Back
            </Button>
          </div>
          {pkg.images.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
              {pkg.images.map((img, i) => (
                <button key={i} onClick={() => setActiveImg(i)}
                  className={cn("w-16 h-11 rounded-lg overflow-hidden border-2 transition-all",
                    i === activeImg ? "border-white scale-110 shadow-lg" : "border-white/30 hover:border-white/60"
                  )}>
                  <img src={img} alt="" className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1488085061387-422e29b40080?w=200&q=80"; }} />
                </button>
              ))}
            </div>
          )}
          <div className="absolute bottom-12 left-6 text-white">
            <div className="flex items-center gap-2 mb-1">
              <Badge className={cn("text-xs font-bold border", color)}>{label}</Badge>
              <span className="flex items-center gap-1 bg-green-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                <Star className="w-3 h-3 fill-white" />{pkg.rating} ({pkg.ratingCount.toLocaleString()} reviews)
              </span>
            </div>
            <h1 className="text-3xl md:text-4xl font-extrabold drop-shadow-lg">{pkg.name}</h1>
            <div className="flex items-center gap-4 mt-2 text-white/80 text-sm">
              <span className="flex items-center gap-1"><MapPin className="w-4 h-4" />{pkg.destination}</span>
              <span className="flex items-center gap-1"><Clock className="w-4 h-4" />{pkg.durationLabel}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* ── Left: Details ── */}
          <div className="lg:col-span-2 space-y-8">
            {/* Description */}
            <div className="bg-white border rounded-2xl p-6 shadow-sm">
              <h2 className="font-extrabold text-xl text-slate-900 mb-3">About This Package</h2>
              <p className="text-muted-foreground leading-relaxed">{pkg.description}</p>
              <div className="flex flex-wrap gap-2 mt-4">
                {pkg.highlights.map((h) => (
                  <span key={h} className="text-xs px-2.5 py-1 bg-purple-50 text-purple-700 border border-purple-100 rounded-full font-semibold">{h}</span>
                ))}
              </div>
            </div>

            {/* Itinerary */}
            <div className="bg-white border rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="font-extrabold text-xl text-slate-900">Day-wise Itinerary</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">{pkg.destination} · {pkg.durationLabel}</p>
                </div>
              </div>

              {itinerary.length > 0 ? (
                <div className="space-y-3">
                  {itinerary.map((day, idx) => (
                    <div key={day.day} className="border rounded-xl overflow-hidden">
                      <button
                        className={cn("w-full flex items-center justify-between px-4 py-3.5 text-left transition-colors",
                          expandedDay === idx ? "bg-purple-50 border-b border-purple-100" : "hover:bg-slate-50"
                        )}
                        onClick={() => setExpandedDay(expandedDay === idx ? null : idx)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-purple-600 text-white rounded-full flex items-center justify-center text-xs font-black shrink-0">
                            {day.day}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 text-sm">{day.title}</p>
                            <p className="text-xs text-muted-foreground truncate max-w-[200px]">{day.description}</p>
                          </div>
                        </div>
                        <ChevronRight className={cn("w-4 h-4 text-muted-foreground transition-transform", expandedDay === idx && "rotate-90")} />
                      </button>
                      {expandedDay === idx && (
                        <div className="px-4 pb-4 pt-3 bg-white space-y-3">
                          {day.description && (
                            <p className="text-sm text-slate-700 leading-relaxed">{day.description}</p>
                          )}
                          <div className="flex gap-4 pt-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1"><Utensils className="w-3 h-3" />{day.meals}</span>
                            <span className="flex items-center gap-1"><Hotel className="w-3 h-3" />{day.hotel}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-10 text-slate-400">
                  <Calendar className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm font-medium">Itinerary coming soon</p>
                  <p className="text-xs mt-1">Please contact us for the detailed day-by-day plan</p>
                </div>
              )}
            </div>

            {/* Inclusions / Exclusions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="bg-green-50 border border-green-100 rounded-2xl p-5">
                <h3 className="font-extrabold text-green-800 mb-3 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" /> What's Included
                </h3>
                <ul className="space-y-2">
                  {pkg.inclusions.map((inc) => (
                    <li key={inc} className="flex items-start gap-2 text-sm text-green-800">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5 text-green-600" />{inc}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-red-50 border border-red-100 rounded-2xl p-5">
                <h3 className="font-extrabold text-red-800 mb-3 flex items-center gap-2">
                  <XCircle className="w-4 h-4" /> What's Excluded
                </h3>
                <ul className="space-y-2">
                  {pkg.exclusions.map((exc) => (
                    <li key={exc} className="flex items-start gap-2 text-sm text-red-800">
                      <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-red-500" />{exc}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* ── Right: Booking Sidebar ── */}
          <div className="space-y-4">
            <div className="bg-white border rounded-2xl p-5 shadow-sm sticky top-20">

              {/* Travel date + season badge */}
              <div className="mb-4">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wide flex items-center gap-1 mb-1.5">
                  <Calendar className="w-3 h-3" /> Travel Date
                  <span className="font-normal normal-case text-muted-foreground">(optional — affects pricing)</span>
                </label>
                <input
                  type="date"
                  value={travelDate}
                  min={new Date().toISOString().split("T")[0]}
                  onChange={(e) => {
                    const d = e.target.value;
                    setTravelDate(d);
                    fetchPkg(d || undefined);
                  }}
                  className="w-full h-10 border rounded-xl px-3 text-sm font-medium bg-background focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                {breakdown?.dateLabel && (
                  <div className={cn("mt-1.5 text-xs font-bold px-2 py-1 rounded-lg inline-flex items-center gap-1",
                    hasDateDiscount ? "bg-green-50 text-green-700 border border-green-200" :
                    hasDatePremium  ? "bg-red-50 text-red-600 border border-red-100" :
                    "bg-blue-50 text-blue-600 border border-blue-100"
                  )}>
                    {hasDateDiscount ? "✅" : hasDatePremium ? "🔥" : "📅"} {breakdown.dateLabel}
                  </div>
                )}
              </div>

              {/* Price display */}
              <div className="mb-4">
                {travelDate && displayedOrigPPP != null && displayedOrigPPP !== displayedPPP ? (
                  <div>
                    <p className="text-lg text-muted-foreground line-through font-medium">₹{displayedOrigPPP.toLocaleString()}</p>
                    <p className={cn("text-3xl font-extrabold", hasDateDiscount ? "text-green-700" : "text-slate-900")}>
                      ₹{displayedPPP.toLocaleString()}
                    </p>
                  </div>
                ) : (
                  <p className="text-3xl font-extrabold text-slate-900">₹{displayedPPP.toLocaleString()}</p>
                )}
                <p className="text-sm text-muted-foreground">per person · {pkg.durationLabel}</p>
                {isAgent && commissionPP > 0 && (
                  <p className="text-xs text-green-700 font-semibold mt-0.5">
                    Commission: ₹{(commissionPP * people).toLocaleString()} total
                  </p>
                )}
              </div>

              <div className="mb-4">
                <label className="text-sm font-semibold text-slate-700 block mb-1.5">
                  <Users className="w-3.5 h-3.5 inline mr-1" />Number of People
                </label>
                <select value={people} onChange={(e) => setPeople(Number(e.target.value))}
                  className="w-full h-11 border rounded-xl px-3 text-sm font-semibold bg-background">
                  {[1,2,3,4,5,6,7,8,9,10].map((n) => (
                    <option key={n} value={n}>{n} Person{n > 1 ? "s" : ""}</option>
                  ))}
                </select>
              </div>

              {/* Pricing breakdown */}
              <div className="bg-slate-50 rounded-xl p-3 mb-4 text-sm space-y-1.5">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Price Breakdown</p>
                {breakdown?.dateMarkupPct !== 0 && (
                  <div className={cn("flex justify-between text-xs font-semibold",
                    hasDateDiscount ? "text-green-600" : "text-red-600"
                  )}>
                    <span>{breakdown.dateLabel || `Date Adj. (${breakdown.dateMarkupPct > 0 ? "+" : ""}${breakdown.dateMarkupPct}%)`}</span>
                    <span>{breakdown.dateMarkupAmt >= 0 ? "+" : ""}₹{(breakdown.dateMarkupAmt * people).toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs font-bold text-slate-900">
                  <span>₹{displayedPPP.toLocaleString()} × {people} person{people > 1 ? "s" : ""}</span>
                  <span>₹{baseTotal.toLocaleString()}</span>
                </div>
                {convFeeTotal > 0 && (
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Convenience Fee</span>
                    <span>+₹{convFeeTotal.toLocaleString()}</span>
                  </div>
                )}
                <Separator className="my-1" />
                <div className="flex justify-between font-bold text-slate-900">
                  <span>Total</span>
                  <span>₹{grandTotal.toLocaleString()}</span>
                </div>
              </div>

              <Button
                className="w-full h-12 bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-base gap-2 mb-3"
                onClick={handleBookNow}
              >
                Book Now <ArrowRight className="w-4 h-4" />
              </Button>

              <div className="space-y-2">{renderSidebarActions()}</div>

              <p className="text-[11px] text-center text-muted-foreground mt-3">
                Free cancellation within 24 hrs · No booking fee
              </p>
            </div>

            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
              <h3 className="font-bold text-amber-900 text-sm mb-2">Travel Tips</h3>
              <ul className="space-y-1 text-xs text-amber-800">
                <li>• Best time to visit: Check seasonal weather</li>
                <li>• Book 30+ days early for best prices</li>
                <li>• Carry valid photo ID at all times</li>
                <li>• Pack light — most hotels have laundry</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* ── Guest Lead Capture Popup (auto-shown after 700ms) ── */}
      <Dialog open={showLeadCapture} onOpenChange={setShowLeadCapture}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-extrabold">
              <MapPin className="w-5 h-5 text-purple-600" /> Plan Your Trip to {pkg.destination}
            </DialogTitle>
            <DialogDescription>
              Enter your details and our travel expert will help you plan the perfect trip.
            </DialogDescription>
          </DialogHeader>

          {!lcSubmitted ? (
            <div className="space-y-4 py-1">
              <div>
                <label className="text-sm font-semibold text-slate-700 block mb-1.5">Full Name <span className="text-red-500">*</span></label>
                <Input
                  placeholder="Your full name"
                  value={lcName}
                  onChange={(e) => { setLcName(e.target.value); setLcErrors((p) => ({ ...p, name: "" })); }}
                  className={cn("h-10", lcErrors.name && "border-red-400")}
                />
                {lcErrors.name && <p className="text-xs text-red-500 mt-1">{lcErrors.name}</p>}
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-700 block mb-1.5">
                  <Phone className="w-3 h-3 inline mr-1" />Mobile Number <span className="text-red-500">*</span>
                </label>
                <Input
                  type="tel"
                  placeholder="10-digit mobile number"
                  value={lcPhone}
                  onChange={(e) => { setLcPhone(e.target.value); setLcErrors((p) => ({ ...p, phone: "" })); }}
                  className={cn("h-10", lcErrors.phone && "border-red-400")}
                  maxLength={10}
                />
                {lcErrors.phone && <p className="text-xs text-red-500 mt-1">{lcErrors.phone}</p>}
              </div>
              <Button
                onClick={submitLeadCapture}
                disabled={lcSubmitting}
                className="w-full h-11 bg-purple-600 hover:bg-purple-700 text-white font-bold gap-2"
              >
                {lcSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                Get Travel Guidance
              </Button>
              <p className="text-[11px] text-center text-muted-foreground flex items-center justify-center gap-1">
                <Shield className="w-3 h-3" /> No spam. Our travel team will call you once.
              </p>
            </div>
          ) : (
            <div className="py-6 text-center space-y-4">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7 text-green-600" />
              </div>
              <h3 className="font-bold text-lg text-slate-900">You're all set!</h3>
              <p className="text-muted-foreground text-sm">Our travel expert will call you soon about <strong>{pkg.destination}</strong>.</p>
              <Button className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold" onClick={() => { setShowLeadCapture(false); handleBookNow(); }}>
                Book Now <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
              <Button variant="outline" className="w-full" onClick={() => setShowLeadCapture(false)}>Continue Browsing</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Guest Enquiry Modal (manual — when guest clicks "Send Enquiry") ── */}
      <Dialog open={showEnquiry} onOpenChange={setShowEnquiry}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-extrabold">
              <MessageSquare className="w-5 h-5 text-purple-600" /> Send Enquiry
            </DialogTitle>
            <DialogDescription>
              Interested in <strong>{pkg.name}</strong>? Share your details and our team will call you within 24 hours.
            </DialogDescription>
          </DialogHeader>

          {!eqSubmitted ? (
            <div className="space-y-4 py-1">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-semibold text-slate-700 block mb-1.5">Name <span className="text-red-500">*</span></label>
                  <Input placeholder="Your name" value={eqName}
                    onChange={(e) => { setEqName(e.target.value); setEqErrors((p) => ({ ...p, name: "" })); }}
                    className={cn("h-10", eqErrors.name && "border-red-400")} />
                  {eqErrors.name && <p className="text-xs text-red-500 mt-1">{eqErrors.name}</p>}
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700 block mb-1.5">
                    <Phone className="w-3 h-3 inline mr-1" />Mobile <span className="text-red-500">*</span>
                  </label>
                  <Input type="tel" placeholder="10-digit mobile" value={eqPhone}
                    onChange={(e) => { setEqPhone(e.target.value); setEqErrors((p) => ({ ...p, phone: "" })); }}
                    className={cn("h-10", eqErrors.phone && "border-red-400")} />
                  {eqErrors.phone && <p className="text-xs text-red-500 mt-1">{eqErrors.phone}</p>}
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-700 block mb-1.5">
                  <Calendar className="w-3 h-3 inline mr-1" />Travel Date <span className="text-muted-foreground text-xs font-normal">(optional)</span>
                </label>
                <Input type="date" value={eqDate} onChange={(e) => setEqDate(e.target.value)} className="h-10" />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-700 block mb-1.5"><Users className="w-3 h-3 inline mr-1" />People</label>
                <select value={people} onChange={(e) => setPeople(Number(e.target.value))}
                  className="w-full h-10 border rounded-md px-3 text-sm font-medium bg-background">
                  {[1,2,3,4,5,6,7,8,9,10].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>

              <Button
                onClick={submitGuestEnquiry}
                disabled={eqSubmitting}
                className="w-full h-11 bg-purple-600 hover:bg-purple-700 text-white font-bold gap-2"
              >
                {eqSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                Send Enquiry
              </Button>
              <p className="text-[11px] text-center text-muted-foreground">
                Your enquiry goes to our travel team — no spam, no automated calls.
              </p>
            </div>
          ) : (
            <div className="py-8 text-center space-y-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="font-bold text-lg text-slate-900">Enquiry Sent!</h3>
              <p className="text-muted-foreground text-sm">Our team will contact you within 24 hours about <strong>{pkg.name}</strong>.</p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowEnquiry(false)}>Close</Button>
                <Button className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-bold" onClick={handleBookNow}>Book Now</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Customer Enquiry Modal ── */}
      <Dialog open={showCustEnquiry} onOpenChange={setShowCustEnquiry}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-extrabold">
              <MessageSquare className="w-5 h-5 text-purple-600" /> Send Enquiry
            </DialogTitle>
            <DialogDescription>
              Enquiring about <strong>{pkg.name}</strong>. Our team will call you within 24 hours.
            </DialogDescription>
          </DialogHeader>

          {!ceSubmitted ? (
            <div className="space-y-4 py-1">
              <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 border border-purple-100 rounded-xl">
                <CheckCircle2 className="w-4 h-4 text-purple-600 shrink-0" />
                <span className="text-sm text-purple-700 font-medium">Sending as <strong>{user?.name}</strong></span>
              </div>

              {/* Show phone input only if customer hasn't set their phone */}
              {!user?.phone?.trim() && (
                <div>
                  <label className="text-sm font-semibold text-slate-700 block mb-1.5">
                    <Phone className="w-3 h-3 inline mr-1" />Mobile <span className="text-red-500">*</span>
                  </label>
                  <Input
                    type="tel"
                    placeholder="10-digit mobile number"
                    value={cePhone}
                    onChange={(e) => { setCePhone(e.target.value); setCePhoneError(""); }}
                    className={cn("h-10", cePhoneError && "border-red-400")}
                  />
                  {cePhoneError && <p className="text-xs text-red-500 mt-1">{cePhoneError}</p>}
                </div>
              )}

              <div>
                <label className="text-sm font-semibold text-slate-700 block mb-1.5">
                  <Calendar className="w-3 h-3 inline mr-1" />Travel Date <span className="text-muted-foreground text-xs font-normal">(optional)</span>
                </label>
                <Input type="date" value={ceDate} onChange={(e) => setCeDate(e.target.value)} className="h-10" />
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-700 block mb-1.5"><Users className="w-3 h-3 inline mr-1" />People</label>
                <select value={people} onChange={(e) => setPeople(Number(e.target.value))}
                  className="w-full h-10 border rounded-md px-3 text-sm font-medium bg-background">
                  {[1,2,3,4,5,6,7,8,9,10].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>

              <Button
                onClick={submitCustomerEnquiry}
                disabled={ceSubmitting}
                className="w-full h-11 bg-purple-600 hover:bg-purple-700 text-white font-bold gap-2"
              >
                {ceSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                Send Enquiry
              </Button>
            </div>
          ) : (
            <div className="py-8 text-center space-y-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="font-bold text-lg text-slate-900">Enquiry Sent!</h3>
              <p className="text-muted-foreground text-sm">Our team will be in touch about <strong>{pkg.name}</strong>.</p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowCustEnquiry(false)}>Close</Button>
                <Button className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-bold" onClick={handleBookNow}>Book Now</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Agent Customer Enquiry Modal ── */}
      <Dialog open={showAgentModal} onOpenChange={setShowAgentModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-extrabold">
              <Briefcase className="w-5 h-5 text-blue-600" /> Create Customer Enquiry
            </DialogTitle>
            <DialogDescription>Package: <strong>{pkg.name}</strong>. Enter your customer's details.</DialogDescription>
          </DialogHeader>
          {!aqSubmitted ? (
            <div className="space-y-4 py-1">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-semibold text-slate-700 block mb-1.5">Customer Name <span className="text-red-500">*</span></label>
                  <Input placeholder="Customer's name" value={aqName}
                    onChange={(e) => { setAqName(e.target.value); setAqErrors((p) => ({ ...p, name: "" })); }}
                    className={cn("h-10", aqErrors.name && "border-red-400")} />
                  {aqErrors.name && <p className="text-xs text-red-500 mt-1">{aqErrors.name}</p>}
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700 block mb-1.5"><Phone className="w-3 h-3 inline mr-1" />Mobile <span className="text-red-500">*</span></label>
                  <Input type="tel" placeholder="10-digit mobile" value={aqPhone}
                    onChange={(e) => { setAqPhone(e.target.value); setAqErrors((p) => ({ ...p, phone: "" })); }}
                    className={cn("h-10", aqErrors.phone && "border-red-400")} />
                  {aqErrors.phone && <p className="text-xs text-red-500 mt-1">{aqErrors.phone}</p>}
                </div>
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-700 block mb-1.5"><Calendar className="w-3 h-3 inline mr-1" />Travel Date</label>
                <Input type="date" value={aqDate} onChange={(e) => setAqDate(e.target.value)} className="h-10" />
              </div>
              <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-700">
                Saved under agent: <strong>{user?.name}</strong> · Also creates a CRM lead
              </div>
              <Button onClick={submitAgentEnquiry} disabled={aqSubmitting} className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold gap-2">
                {aqSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                Save Customer Enquiry
              </Button>
            </div>
          ) : (
            <div className="py-8 text-center space-y-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="font-bold text-lg text-slate-900">Enquiry Created!</h3>
              <p className="text-muted-foreground text-sm">Saved for <strong>{aqName}</strong> in enquiries and CRM leads.</p>
              <Button variant="outline" className="w-full" onClick={() => setShowAgentModal(false)}>Close</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Customize Package Modal ── */}
      <Dialog open={showCustomize} onOpenChange={setShowCustomize}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-extrabold">
              <SlidersHorizontal className="w-5 h-5 text-purple-600" /> Customize Package
            </DialogTitle>
            <DialogDescription>
              Tell us what you'd like to change in <strong>{pkg.name}</strong> and we'll prepare a tailored quote.
            </DialogDescription>
          </DialogHeader>

          {!cxSubmitted ? (
            <div className="space-y-5 py-1">
              {isGuest && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-semibold text-slate-700 block mb-1.5">Your Name <span className="text-red-500">*</span></label>
                    <Input placeholder="Full name" value={cxName}
                      onChange={(e) => { setCxName(e.target.value); setCxErrors((p) => ({ ...p, name: "" })); }}
                      className={cn("h-10", cxErrors.name && "border-red-400")} />
                    {cxErrors.name && <p className="text-xs text-red-500 mt-1">{cxErrors.name}</p>}
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-slate-700 block mb-1.5">Mobile <span className="text-red-500">*</span></label>
                    <Input type="tel" placeholder="10-digit number" value={cxPhone}
                      onChange={(e) => { setCxPhone(e.target.value); setCxErrors((p) => ({ ...p, phone: "" })); }}
                      className={cn("h-10", cxErrors.phone && "border-red-400")} />
                    {cxErrors.phone && <p className="text-xs text-red-500 mt-1">{cxErrors.phone}</p>}
                  </div>
                </div>
              )}

              <div>
                <label className="text-sm font-semibold text-slate-700 block mb-2">
                  <Plus className="w-3.5 h-3.5 inline mr-1 text-green-600" />Add Places / Activities
                </label>
                <div className="flex gap-2">
                  <Input placeholder="e.g. Dudhsagar Falls, Spice Plantation…" value={placeInput}
                    onChange={(e) => setPlaceInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addPlace()}
                    className="h-10 flex-1" />
                  <Button size="sm" variant="outline" onClick={addPlace} className="h-10 px-4 shrink-0">Add</Button>
                </div>
                {addedPlaces.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {addedPlaces.map((p) => (
                      <span key={p} className="flex items-center gap-1 px-2.5 py-1 bg-green-50 border border-green-200 rounded-full text-xs text-green-700 font-medium">
                        {p}
                        <button onClick={() => setAddedPlaces((prev) => prev.filter((x) => x !== p))}>
                          <X className="w-3 h-3 text-green-500 hover:text-green-700" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {itinerary.length > 0 && (
                <div>
                  <label className="text-sm font-semibold text-slate-700 block mb-2">
                    <X className="w-3.5 h-3.5 inline mr-1 text-red-500" />Remove Days / Places
                    <span className="text-muted-foreground font-normal text-xs ml-1">(tick to remove)</span>
                  </label>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                    {itinerary.map((day, idx) => (
                      <label key={idx} className={cn(
                        "flex items-center gap-2.5 px-3 py-2 rounded-xl border cursor-pointer transition-colors text-sm",
                        removedDays.includes(idx) ? "bg-red-50 border-red-200 text-red-700" : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                      )}>
                        <input type="checkbox" checked={removedDays.includes(idx)} onChange={() => toggleRemoveDay(idx)} className="accent-red-500" />
                        <span className="w-6 h-6 bg-purple-100 text-purple-700 rounded-full flex items-center justify-center text-xs font-bold shrink-0">{day.day}</span>
                        <span className="font-medium truncate">{day.title}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="text-sm font-semibold text-slate-700 block mb-2">Special Notes / Requests</label>
                <textarea
                  placeholder="e.g. Need vegetarian meals, prefer sea-facing rooms…"
                  value={customNotes} onChange={(e) => setCustomNotes(e.target.value)}
                  rows={3} className="w-full border rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <Button onClick={submitCustomize} className="w-full h-11 bg-purple-600 hover:bg-purple-700 text-white font-bold gap-2">
                Send Customization Request <ArrowRight className="w-4 h-4" />
              </Button>
              <p className="text-[11px] text-center text-muted-foreground">
                Our travel expert will prepare a tailored quote and call you within 24 hours.
              </p>
            </div>
          ) : (
            <div className="py-8 text-center space-y-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="font-bold text-lg text-slate-900">Request Sent!</h3>
              <p className="text-muted-foreground text-sm">
                Our team will prepare your <strong>customised {pkg.destination} package</strong> and get back to you within 24 hours.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowCustomize(false)}>Close</Button>
                <Button className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-bold" onClick={handleBookNow}>Book Standard</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
