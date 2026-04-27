import { APP_NAME } from "@/lib/app-config";
import { useState, useRef, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { Layout } from "@/components/layout";
import { PageHero } from "@/components/page-hero";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Map, Search, Star, Clock, ChevronRight, Sparkles, Filter, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PACKAGE_TYPE_LABELS, PACKAGE_AUDIENCE_LABELS } from "@/lib/holiday-data";
import { useAuth } from "@/contexts/auth-context";
import { getHiddenMarkupAmount, getAgentEffectiveMarkup } from "@/lib/pricing";

const CATEGORY_TYPES = ["beach", "adventure", "cultural", "luxury", "family", "honeymoon", "hill", "wildlife"];

const FEATURED_DESTINATIONS = [
  { name: "Goa",       img: "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=500&q=80", tagline: "Sun & Sand" },
  { name: "Kashmir",   img: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=500&q=80", tagline: "Paradise on Earth" },
  { name: "Kerala",    img: "https://images.unsplash.com/photo-1558618047-3c8c76ca7d13?w=500&q=80", tagline: "God's Own Country" },
  { name: "Rajasthan", img: "https://images.unsplash.com/photo-1568084680786-a84f91d1153c?w=500&q=80", tagline: "Land of Royals" },
  { name: "Manali",    img: "https://images.unsplash.com/photo-1587213811864-49e7b31bb862?w=500&q=80", tagline: "Himalayan Escape" },
  { name: "Andaman",   img: "https://images.unsplash.com/photo-1562973597-2c63e0c1b1ad?w=500&q=80", tagline: "Island Bliss" },
];

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
  packageType: string | null;
  category: string | null;
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
  itinerary: object[] | null;
  featured: boolean;
  createdBy: string;
}

const AUDIENCE_OPTIONS = [
  { value: "honeymoon", label: "💑 Couples" },
  { value: "family",    label: "👨‍👩‍👧‍👦 Family" },
  { value: "friends",   label: "👥 Friends" },
  { value: "budget",    label: "💰 Budget" },
  { value: "luxury",    label: "👑 Luxury" },
];

export default function Packages() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const initDest = new URLSearchParams(searchString).get("destination") || "";

  const [allPackages, setAllPackages] = useState<DbPackage[]>([]);
  const [loading, setLoading]         = useState(true);
  const [searchTerm, setSearchTerm]   = useState(initDest);
  const [typeFilter, setTypeFilter]       = useState("");
  const [audienceFilter, setAudienceFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [travelDate, setTravelDate]       = useState("");
  const packagesRef = useRef<HTMLElement>(null);

  const fetchPackages = (date?: string) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (date) params.set("travelDate", date);
    fetch(`/api/holiday-packages${params.size > 0 ? `?${params}` : ""}`)
      .then((r) => r.json())
      .then((data) => setAllPackages(Array.isArray(data) ? data : []))
      .catch(() => setAllPackages([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchPackages(); }, []);

  function handleDateChange(date: string) {
    setTravelDate(date);
    fetchPackages(date || undefined);
  }

  function applySearch(term: string) {
    setSearchTerm(term);
    setTimeout(() => {
      packagesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  const filteredPackages = allPackages.filter((pkg) => {
    const matchSearch = !searchTerm ||
      pkg.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      pkg.destination.toLowerCase().includes(searchTerm.toLowerCase());
    const matchType     = !typeFilter     || pkg.type === typeFilter;
    const matchAudience = !audienceFilter || pkg.packageType === audienceFilter;
    const matchCategory = !categoryFilter || pkg.category === categoryFilter;
    return matchSearch && matchType && matchAudience && matchCategory;
  });

  // Group filtered packages by packageType when audience filter is off and search is active
  const shouldGroup = !audienceFilter && (searchTerm || typeFilter);
  const groupedByAudience: Record<string, DbPackage[]> = {};
  if (shouldGroup) {
    const withAudience = filteredPackages.filter((p) => p.packageType);
    const withoutAudience = filteredPackages.filter((p) => !p.packageType);
    for (const pkg of withAudience) {
      const key = pkg.packageType!;
      if (!groupedByAudience[key]) groupedByAudience[key] = [];
      groupedByAudience[key].push(pkg);
    }
    if (withoutAudience.length > 0) groupedByAudience["_general"] = withoutAudience;
  }

  const audienceKeys = Object.keys(groupedByAudience).filter((k) => k !== "_general");
  const hasGroups = shouldGroup && (audienceKeys.length > 1 || groupedByAudience["_general"]);

  return (
    <Layout>
      {/* ── Hero ── */}
      <PageHero
        tab="packages"
        centered
        badge={
          <div className="inline-flex items-center gap-2 bg-white/15 border border-white/25 rounded-full px-4 py-1.5 text-sm font-medium backdrop-blur-sm">
            <Sparkles className="w-4 h-4 text-yellow-300" /> Packages for every traveller
          </div>
        }
        headline={<>Plan Your Dream<br /><span className="text-yellow-300">Holiday</span></>}
        sub="Honeymoon, family, friends or solo — find a package built for you"
        extraContent={
          <div className="flex flex-wrap justify-center gap-2 mt-6">
            {AUDIENCE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => { setAudienceFilter(audienceFilter === opt.value ? "" : opt.value); setTimeout(() => packagesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); }}
                className={cn(
                  "px-4 py-2 rounded-full text-sm font-semibold border-2 transition-all",
                  audienceFilter === opt.value
                    ? "bg-white text-purple-700 border-white"
                    : "bg-white/10 text-white border-white/30 hover:bg-white/20"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        }
      >
        <div className="max-w-2xl mx-auto bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl flex items-center overflow-hidden p-2 gap-2">
          <div className="flex-1 flex items-center gap-2 px-3">
            <Map className="w-5 h-5 text-purple-500 shrink-0" />
            <Input
              placeholder="Where do you want to go? (Goa, Kashmir, Manali…)"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applySearch(searchTerm.trim())}
              className="border-0 p-0 h-11 text-slate-800 font-semibold text-base focus-visible:ring-0 placeholder:font-normal"
            />
          </div>
          <Button
            onClick={() => applySearch(searchTerm.trim())}
            className="h-11 px-6 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl shrink-0 gap-2"
          >
            <Search className="w-4 h-4" /> Search
          </Button>
        </div>
      </PageHero>

      {/* ── Featured Destinations ── */}
      <section className="container mx-auto px-4 py-14">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-extrabold text-slate-900 mb-1">Popular Destinations</h2>
          <p className="text-muted-foreground text-sm">Click a destination to browse its packages</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {FEATURED_DESTINATIONS.map((dest) => (
            <button
              key={dest.name}
              onClick={() => applySearch(dest.name)}
              className="group relative overflow-hidden rounded-2xl aspect-[3/4] shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-1 cursor-pointer"
            >
              <img
                src={dest.img}
                alt={dest.name}
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                onError={(e) => { (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1488085061387-422e29b40080?w=400&q=80"; }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-3 text-left">
                <p className="text-white font-bold text-sm">{dest.name}</p>
                <p className="text-white/70 text-[11px]">{dest.tagline}</p>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* ── Package Filters + Grid ── */}
      <section ref={packagesRef} className="bg-slate-50 border-t">
        <div className="container mx-auto px-4 py-10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-xl font-extrabold text-slate-900">
                {loading ? "Loading packages…" : (
                  <>
                    {filteredPackages.length} Package{filteredPackages.length !== 1 ? "s" : ""} Available
                    {searchTerm && <span className="text-muted-foreground font-normal text-sm ml-2">· "{searchTerm}"</span>}
                    {audienceFilter && <span className="text-muted-foreground font-normal text-sm ml-2">· {PACKAGE_AUDIENCE_LABELS[audienceFilter]?.label}</span>}
                    {typeFilter && <span className="text-muted-foreground font-normal text-sm ml-2">· {typeFilter}</span>}
                  </>
                )}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">All-inclusive · Expert-curated · Open any package for a full itinerary</p>
            </div>
            {(searchTerm || typeFilter || audienceFilter || categoryFilter) && (
              <Button variant="outline" size="sm" onClick={() => { setSearchTerm(""); setTypeFilter(""); setAudienceFilter(""); setCategoryFilter(""); }}>
                Clear Filters
              </Button>
            )}
          </div>

          {/* ── Category tabs: Domestic / International / Devotional ── */}
          <div className="flex gap-2 mb-6 border-b border-slate-200 overflow-x-auto scrollbar-hide pb-px">
            {[
              { value: "",              label: "All",           icon: "🌍" },
              { value: "domestic",     label: "Domestic",      icon: "🇮🇳" },
              { value: "international", label: "International", icon: "✈️" },
              { value: "devotional",   label: "Devotional",    icon: "🛕" },
            ].map((tab) => (
              <button
                key={tab.value}
                onClick={() => { setCategoryFilter(tab.value); setTimeout(() => packagesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); }}
                className={cn(
                  "flex items-center gap-1.5 px-5 py-3 text-sm font-semibold border-b-2 -mb-px transition-all whitespace-nowrap",
                  categoryFilter === tab.value
                    ? "border-purple-600 text-purple-700"
                    : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
                )}
              >
                <span>{tab.icon}</span> {tab.label}
              </button>
            ))}
          </div>

          {/* Travel date picker */}
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Travel Date:</span>
            <div className="relative flex items-center gap-2">
              <input
                type="date"
                value={travelDate}
                min={new Date().toISOString().split("T")[0]}
                onChange={(e) => handleDateChange(e.target.value)}
                className="h-9 border rounded-lg px-3 text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              {travelDate && (
                <button onClick={() => handleDateChange("")} className="text-xs text-muted-foreground hover:text-slate-800 underline">
                  Clear date
                </button>
              )}
            </div>
            {travelDate && (() => {
              const d = new Date(travelDate);
              const month = d.getMonth() + 1;
              const isWeekend = d.getDay() === 0 || d.getDay() === 6;
              const isPeak = [4,5,6,10,11,12].includes(month);
              const isOff  = [7,8,9].includes(month);
              if (isPeak) return <span className="text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-1 rounded-full">🔥 Peak Season {isWeekend ? "(+30%)" : "(+20%)"}</span>;
              if (isOff && !isWeekend)  return <span className="text-xs font-bold text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded-full">✅ Off-Season Deal (-10%)</span>;
              if (isWeekend) return <span className="text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200 px-2 py-1 rounded-full">📅 Weekend (+10%)</span>;
              return <span className="text-xs text-muted-foreground bg-slate-100 px-2 py-1 rounded-full">Regular Pricing</span>;
            })()}
          </div>

          {/* Audience filter pills */}
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Audience:</span>
            <button
              onClick={() => setAudienceFilter("")}
              className={cn("px-3 py-1.5 rounded-full text-xs font-semibold border transition-all",
                !audienceFilter ? "bg-purple-600 text-white border-purple-600" : "bg-white hover:bg-purple-50 hover:border-purple-300"
              )}
            >All</button>
            {AUDIENCE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setAudienceFilter(audienceFilter === opt.value ? "" : opt.value)}
                className={cn("px-3 py-1.5 rounded-full text-xs font-semibold border transition-all",
                  audienceFilter === opt.value ? "bg-purple-600 text-white border-purple-600" : "bg-white hover:bg-purple-50 hover:border-purple-300"
                )}
              >{opt.label}</button>
            ))}
          </div>

          {/* Category filter pills */}
          <div className="flex items-center gap-2 flex-wrap mb-6">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <button
              onClick={() => setTypeFilter("")}
              className={cn("px-3 py-1.5 rounded-full text-xs font-semibold border transition-all",
                !typeFilter ? "bg-slate-700 text-white border-slate-700" : "bg-white hover:bg-slate-50 hover:border-slate-300"
              )}
            >All Themes</button>
            {CATEGORY_TYPES.map((t) => {
              const { label } = PACKAGE_TYPE_LABELS[t] ?? { label: t };
              return (
                <button
                  key={t}
                  onClick={() => setTypeFilter(typeFilter === t ? "" : t)}
                  className={cn("px-3 py-1.5 rounded-full text-xs font-semibold border transition-all",
                    typeFilter === t ? "bg-purple-600 text-white border-purple-600" : "bg-white hover:bg-purple-50 hover:border-purple-300"
                  )}
                >{label}</button>
              );
            })}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
            </div>
          ) : filteredPackages.length === 0 ? (
            <div className="text-center py-20">
              <Map className="w-12 h-12 text-purple-200 mx-auto mb-4" />
              <h3 className="font-bold text-xl mb-2">No packages found</h3>
              <p className="text-muted-foreground text-sm mb-4">Try a different destination or clear filters</p>
              <Button onClick={() => { setSearchTerm(""); setTypeFilter(""); setAudienceFilter(""); }} variant="outline">Clear Filters</Button>
            </div>
          ) : hasGroups ? (
            /* ── Grouped by audience ── */
            <div className="space-y-10">
              {audienceKeys.map((key) => {
                const info = PACKAGE_AUDIENCE_LABELS[key];
                return (
                  <div key={key}>
                    <div className="flex items-center gap-3 mb-4">
                      <span className="text-2xl">{info?.icon}</span>
                      <div>
                        <h3 className="text-lg font-extrabold text-slate-900">{info?.badge ?? key}</h3>
                        <p className="text-xs text-muted-foreground">{groupedByAudience[key].length} package{groupedByAudience[key].length !== 1 ? "s" : ""}</p>
                      </div>
                      <button
                        onClick={() => setAudienceFilter(key)}
                        className="ml-auto text-xs text-purple-600 hover:underline font-semibold"
                      >
                        View all →
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {groupedByAudience[key].map((pkg) => (
                        <PackageCard key={pkg.id} pkg={pkg} setLocation={setLocation} />
                      ))}
                    </div>
                  </div>
                );
              })}
              {groupedByAudience["_general"] && (
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-2xl">🌍</span>
                    <div>
                      <h3 className="text-lg font-extrabold text-slate-900">All Travellers</h3>
                      <p className="text-xs text-muted-foreground">{groupedByAudience["_general"].length} package{groupedByAudience["_general"].length !== 1 ? "s" : ""}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {groupedByAudience["_general"].map((pkg) => (
                      <PackageCard key={pkg.id} pkg={pkg} setLocation={setLocation} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ── Flat grid ── */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredPackages.map((pkg) => (
                <PackageCard key={pkg.id} pkg={pkg} setLocation={setLocation} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Why Dream Fly Global ── */}
      <section className="container mx-auto px-4 py-14">
        <h2 className="text-2xl font-extrabold text-slate-900 text-center mb-8">The {APP_NAME} Advantage</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {[
            { icon: "🧳", title: "All-Inclusive Packages", desc: "Hotels, transfers, and sightseeing — all bundled." },
            { icon: "🤖", title: "AI-Powered Itineraries", desc: "Smart day-plans tailored to your destination." },
            { icon: "📞", title: "Expert Travel Advisors", desc: "Real humans to help you plan every detail." },
            { icon: "💰", title: "Best Price Guarantee", desc: "We beat any comparable offer — guaranteed." },
          ].map(({ icon, title, desc }) => (
            <div key={title} className="bg-white border rounded-2xl p-5 shadow-sm text-center hover:shadow-md transition-all">
              <div className="text-3xl mb-3">{icon}</div>
              <h3 className="font-bold text-slate-900 text-sm mb-1">{title}</h3>
              <p className="text-xs text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </section>
    </Layout>
  );
}

function PackageCard({ pkg, setLocation }: { pkg: DbPackage; setLocation: (p: string) => void }) {
  const { label: typeLabel, color: typeColor } = PACKAGE_TYPE_LABELS[pkg.type] ?? { label: pkg.type, color: "bg-slate-100 text-slate-700 border-slate-200" };
  const audienceInfo = pkg.packageType ? PACKAGE_AUDIENCE_LABELS[pkg.packageType] : null;
  const thumb = pkg.images[0] ?? "https://images.unsplash.com/photo-1488085061387-422e29b40080?w=600&q=80";

  // Apply admin hidden markup + agent discount on top of API smart price
  const { user, isAgent } = useAuth();
  const agentMarkupFlat = isAgent && user?.agentMarkup != null ? user.agentMarkup : null;
  const effectiveMarkupPP = agentMarkupFlat != null
    ? getAgentEffectiveMarkup(pkg.pricePerPerson, "packages", agentMarkupFlat)
    : getHiddenMarkupAmount(pkg.pricePerPerson, "packages");
  const displayedPPP        = pkg.pricePerPerson + effectiveMarkupPP;
  const displayedOriginalPPP = (pkg.originalPrice ?? 0) > 0
    ? pkg.originalPrice + effectiveMarkupPP
    : null;

  return (
    <Card
      className="overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 bg-white border group cursor-pointer"
      onClick={() => setLocation(`/packages/${pkg.id}`)}
    >
      <div className="relative overflow-hidden h-52">
        <img
          src={thumb}
          alt={pkg.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          onError={(e) => { (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1488085061387-422e29b40080?w=600&q=80"; }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

        {/* Badges row */}
        <div className="absolute top-3 left-3 flex gap-1.5 flex-wrap">
          {audienceInfo ? (
            <Badge className={cn("text-[11px] font-bold border", audienceInfo.color)}>
              {audienceInfo.icon} {audienceInfo.badge}
            </Badge>
          ) : (
            <Badge className={cn("text-[11px] font-bold border", typeColor)}>{typeLabel}</Badge>
          )}
        </div>

        <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between">
          <div>
            <p className="text-white font-extrabold text-lg leading-tight drop-shadow-md">{pkg.destination}</p>
            <p className="text-white/80 text-xs flex items-center gap-1">
              <Clock className="w-3 h-3" />{pkg.durationLabel}
            </p>
          </div>
          <div className="flex items-center gap-1 bg-green-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
            <Star className="w-3 h-3 fill-white" />{pkg.rating}
          </div>
        </div>
      </div>

      <CardContent className="p-4 space-y-3">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="font-bold text-slate-900 text-sm leading-tight">{pkg.name}</h3>
            {/* Show theme badge next to name when audience badge is already in the image */}
            {audienceInfo && (
              <Badge className={cn("text-[10px] font-semibold border shrink-0", typeColor)}>{typeLabel}</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{pkg.description}</p>
        </div>

        <div className="flex flex-wrap gap-1">
          {pkg.highlights.slice(0, 3).map((h) => (
            <span key={h} className="text-[10px] px-1.5 py-0.5 bg-purple-50 text-purple-700 border border-purple-100 rounded-full font-medium">{h}</span>
          ))}
          {pkg.highlights.length > 3 && (
            <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-full font-medium">+{pkg.highlights.length - 3} more</span>
          )}
        </div>

        <div className="flex items-center justify-between pt-2 border-t">
          <div>
            {/* Smart pricing: strikethrough original, highlight offer */}
            {(pkg.pricingBreakdown?.dateMarkupPct ?? 0) !== 0 && displayedOriginalPPP != null && displayedOriginalPPP !== displayedPPP ? (
              <div>
                <p className="text-sm text-muted-foreground line-through">₹{displayedOriginalPPP.toLocaleString()}</p>
                <div className="flex items-center gap-1.5">
                  <p className={cn("text-2xl font-extrabold",
                    (pkg.pricingBreakdown?.dateMarkupPct ?? 0) < 0 ? "text-green-700" : "text-slate-900"
                  )}>₹{displayedPPP.toLocaleString()}</p>
                  {(pkg.pricingBreakdown?.dateMarkupPct ?? 0) < 0 && (
                    <span className="text-[10px] font-bold text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded-full">
                      SAVE {Math.abs(pkg.pricingBreakdown?.dateMarkupPct ?? 0)}%
                    </span>
                  )}
                  {(pkg.pricingBreakdown?.dateMarkupPct ?? 0) > 0 && (
                    <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-full">
                      {pkg.pricingBreakdown?.dateKind === "peak" ? "🔥 Peak" : "📅 Wknd"}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div>
                <p className="text-2xl font-extrabold text-slate-900">₹{displayedPPP.toLocaleString()}</p>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">per person</p>
          </div>
          <Button
            size="sm"
            className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs gap-1"
            onClick={(e) => { e.stopPropagation(); setLocation(`/packages/${pkg.id}`); }}
          >
            View Package <ChevronRight className="w-3 h-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
