import { Layout } from "@/components/layout";
import { Link } from "wouter";
import { useDestinationsWithFallback, useDealsWithFallback } from "@/lib/use-data-with-fallback";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plane, Bus, Building2, Map, ArrowRight, Star, ShieldCheck, Headphones, Tag, Gift, Zap, BadgeCheck, Compass, CreditCard, Users, Phone, Mail, MapPin, Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchTabs } from "@/components/search-tabs";
import { HomepageBanner } from "@/components/homepage-banner";
import { useState, useEffect } from "react";

const TAB_META: Record<string, { image: string; headline: string; sub: string }> = {
  flights: {
    image: "/images/hero-flights.webp",
    headline: "Take off to your next adventure.",
    sub: "Search hundreds of airlines. Find the best fares in seconds.",
  },
  hotels: {
    image: "/images/hero-hotels.webp",
    headline: "Sleep in luxury, anywhere.",
    sub: "Curated hotels and resorts — from boutique escapes to 5-star palaces.",
  },
  buses: {
    image: "/images/hero-buses.webp",
    headline: "Travel smart, travel comfortable.",
    sub: "Premium buses across India. Book your seat in seconds.",
  },
  packages: {
    image: "/images/hero-holidays.webp",
    headline: "Your dream holiday awaits.",
    sub: "Tailor-made holiday packages to the world's most stunning destinations.",
  },
};

const PROMO_BANNERS = [
  {
    title: "Flight Deals",
    sub: "Up to 40% off on domestic routes",
    badge: "LIMITED TIME",
    gradient: "from-blue-600 to-indigo-700",
    icon: Plane,
    cta: "Book Flights",
    href: "/flights",
    code: "FLY40",
  },
  {
    title: "Hotel Stays",
    sub: "3 nights for the price of 2 at 5-star hotels",
    badge: "EXCLUSIVE",
    gradient: "from-violet-600 to-purple-800",
    icon: Building2,
    cta: "Book Hotels",
    href: "/hotels",
    code: "STAY3",
  },
  {
    title: "Holiday Packages",
    sub: "All-inclusive packages starting ₹12,999",
    badge: "BEST VALUE",
    gradient: "from-orange-500 to-rose-600",
    icon: Map,
    cta: "Explore Packages",
    href: "/packages",
    code: null,
  },
];


export default function Home() {
  const { data: destinations, isLoading: destinationsLoading } = useDestinationsWithFallback();
  const { data: deals, isLoading: dealsLoading } = useDealsWithFallback();

  const today    = new Date().toISOString().split("T")[0];
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().split("T")[0];

  const [activeTab, setActiveTab] = useState<string>("flights");

  const [promoIndex, setPromoIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setPromoIndex((i) => (i + 1) % PROMO_BANNERS.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  const meta = TAB_META[activeTab] ?? TAB_META.flights;

  return (
    <Layout>
      <HomepageBanner />
      {/* ── Hero Section ── */}
      <section className="relative w-full overflow-hidden min-h-[520px] sm:min-h-[600px] flex items-center pt-8 pb-16 sm:pt-16 sm:pb-32">
        <div className="absolute inset-0 z-0">
          {Object.entries(TAB_META).map(([key, { image }]) => (
            <img key={key} src={image} alt="" aria-hidden="true"
              loading={key === "flights" ? "eager" : "lazy"} decoding="async"
              className={[
                "absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-700",
                activeTab === key ? "opacity-100" : "opacity-0",
              ].join(" ")}
            />
          ))}
          <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/40 to-black/70" />
        </div>

        <div className="container relative z-10 mx-auto px-4 md:px-6 mt-4 sm:mt-10">
          <div className="max-w-3xl mb-6 sm:mb-10 text-white">
            <h1 key={activeTab}
              className="text-3xl sm:text-4xl md:text-6xl font-extrabold tracking-tight mb-3 sm:mb-4 leading-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]"
              style={{ textShadow: "0 2px 12px rgba(0,0,0,0.5)" }}
            >
              {meta.headline}
            </h1>
            <p className="text-base sm:text-lg md:text-xl text-white/90 font-medium max-w-2xl" style={{ textShadow: "0 1px 6px rgba(0,0,0,0.5)" }}>
              {meta.sub}
            </p>
          </div>

          <SearchTabs onTabChange={setActiveTab} />
        </div>
      </section>

      {/* ── Promotional Banners Slider ── */}
      <section className="py-10 bg-slate-50">
        <div className="container mx-auto px-4 md:px-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight mb-1">Today's Best Deals</h2>
              <p className="text-muted-foreground text-sm">Hand-picked offers for smart travelers</p>
            </div>
            <Tag className="w-6 h-6 text-orange-500" />
          </div>

          {/* Mobile / auto-advance slider */}
          <div className="relative overflow-hidden rounded-2xl mb-3 md:hidden">
            {PROMO_BANNERS.map(({ title, sub, badge, gradient, icon: Icon, cta, href, code }, idx) => (
              <div
                key={title}
                className={`transition-all duration-500 ${idx === promoIndex ? "block" : "hidden"}`}
              >
                <Link href={href}>
                  <div className={`relative rounded-2xl bg-gradient-to-br ${gradient} text-white p-6 overflow-hidden cursor-pointer group`}>
                    <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/10 -translate-y-8 translate-x-8" />
                    <div className="absolute bottom-0 right-4 opacity-10"><Icon className="w-20 h-20" /></div>
                    <span className="inline-block text-[10px] font-extrabold tracking-widest uppercase bg-white/20 px-2 py-0.5 rounded-full mb-3">{badge}</span>
                    <h3 className="text-xl font-extrabold mb-1">{title}</h3>
                    <p className="text-white/80 text-sm mb-4">{sub}</p>
                    {code && (
                      <div className="inline-flex items-center gap-1.5 bg-white/20 backdrop-blur px-3 py-1 rounded-lg text-xs font-bold mb-4">
                        <Gift className="w-3 h-3" /> Use code: {code}
                      </div>
                    )}
                    <div className="flex items-center gap-1 text-sm font-bold group-hover:gap-2 transition-all">{cta} <ArrowRight className="w-4 h-4" /></div>
                  </div>
                </Link>
              </div>
            ))}
          </div>
          {/* Slide dots (mobile) */}
          <div className="flex justify-center gap-1.5 mb-5 md:hidden">
            {PROMO_BANNERS.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setPromoIndex(idx)}
                className={`rounded-full transition-all ${idx === promoIndex ? "w-6 h-2 bg-orange-500" : "w-2 h-2 bg-slate-300 hover:bg-orange-300"}`}
              />
            ))}
          </div>

          {/* Desktop: 3-column grid */}
          <div className="hidden md:grid grid-cols-3 gap-5">
            {PROMO_BANNERS.map(({ title, sub, badge, gradient, icon: Icon, cta, href, code }) => (
              <Link key={title} href={href}>
                <div className={`relative rounded-2xl bg-gradient-to-br ${gradient} text-white p-6 overflow-hidden cursor-pointer hover:shadow-xl transition-all hover:-translate-y-1 group`}>
                  <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/10 -translate-y-8 translate-x-8" />
                  <div className="absolute bottom-0 right-4 opacity-10"><Icon className="w-20 h-20" /></div>
                  <span className="inline-block text-[10px] font-extrabold tracking-widest uppercase bg-white/20 px-2 py-0.5 rounded-full mb-3">{badge}</span>
                  <h3 className="text-xl font-extrabold mb-1">{title}</h3>
                  <p className="text-white/80 text-sm mb-4">{sub}</p>
                  {code && (
                    <div className="inline-flex items-center gap-1.5 bg-white/20 backdrop-blur px-3 py-1 rounded-lg text-xs font-bold mb-4">
                      <Gift className="w-3 h-3" /> Use code: {code}
                    </div>
                  )}
                  <div className="flex items-center gap-1 text-sm font-bold group-hover:gap-2 transition-all">{cta} <ArrowRight className="w-4 h-4" /></div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Trust Indicators ── */}
      <section className="py-12 bg-white border-b">
        <div className="container mx-auto px-4 md:px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
            {[
              { icon: ShieldCheck, title: "Secure Booking",      desc: "Bank-level security for all transactions and personal data." },
              { icon: Star,        title: "Premium Experience",  desc: "Handpicked selections ensuring highest quality for every journey." },
              { icon: Headphones,  title: "24/7 Support",        desc: "Our travel experts are always available to help you, anywhere." },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex flex-col items-center p-6">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-4">
                  <Icon className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-bold mb-2">{title}</h3>
                <p className="text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Popular Destinations ── */}
      <section className="py-10 md:py-20">
        <div className="container mx-auto px-4 md:px-6">
          <div className="flex justify-between items-end mb-6 md:mb-10">
            <div>
              <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight mb-1 md:mb-2">Trending Destinations</h2>
              <p className="text-muted-foreground text-sm md:text-lg">Discover the most sought-after places this season.</p>
            </div>
            <Button variant="ghost" asChild className="hidden sm:flex">
              <Link href="/packages">Explore all <ArrowRight className="w-4 h-4 ml-2" /></Link>
            </Button>
          </div>

          {destinationsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-80 w-full rounded-2xl" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {Array.isArray(destinations) && destinations.slice(0, 4).map((dest) => (
                <Link key={dest.id} href={`/packages?destination=${dest.name}`}>
                  <div className="group relative h-80 rounded-2xl overflow-hidden cursor-pointer">
                    <img src={dest.imageUrl || "https://placehold.co/400x600/e2e8f0/64748b"} alt={dest.name}
                      loading="lazy" decoding="async"
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                    <div className="absolute bottom-0 left-0 w-full p-6 text-white">
                      <h3 className="text-xl font-bold mb-1">{dest.name}</h3>
                      <p className="text-sm text-white/80 font-medium mb-3">{dest.country}</p>
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-semibold bg-white/20 backdrop-blur-md px-3 py-1 rounded-full">{dest.packageCount} Packages</span>
                        <span className="font-bold">From ₹{dest.startingPrice}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Offers Section ── */}
      <section className="py-10 md:py-16 bg-gradient-to-r from-primary to-primary/80 text-white">
        <div className="container mx-auto px-4 md:px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 md:gap-8">
            <div>
              <div className="flex items-center gap-2 mb-2 md:mb-3">
                <Zap className="w-5 h-5 text-yellow-300" />
                <span className="text-yellow-300 font-bold text-sm uppercase tracking-wider">Special Offer</span>
              </div>
              <h2 className="text-2xl md:text-3xl font-extrabold mb-2">First Booking? Save ₹500!</h2>
              <p className="text-white/80 text-sm md:text-lg">Use code <span className="font-extrabold text-yellow-300">WELCOME500</span> on your first booking across any service.</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 shrink-0">
              <Button asChild size="lg" variant="secondary" className="font-bold">
                <Link href="/flights">Book Flights</Link>
              </Button>
              <Button asChild size="lg" className="bg-white text-primary hover:bg-white/90 font-bold border-0">
                <Link href="/packages">Holiday Packages</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Featured Deals ── */}
      <section className="py-10 md:py-20 bg-muted/30">
        <div className="container mx-auto px-4 md:px-6">
          <div className="text-center max-w-2xl mx-auto mb-8 md:mb-12">
            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight mb-2 md:mb-4">Unbeatable Offers</h2>
            <p className="text-muted-foreground text-sm md:text-lg">Exclusive deals handpicked for the modern traveler. Limited time only.</p>
          </div>

          {dealsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-64 w-full rounded-xl" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {Array.isArray(deals) && deals.slice(0, 3).map((deal) => (
                <Card key={deal.id} className="overflow-hidden border-0 shadow-lg group hover:shadow-xl transition-all">
                  <div className="relative h-48 overflow-hidden">
                    <img src={deal.imageUrl || "https://placehold.co/600x400/e2e8f0/64748b"} alt={deal.title}
                      loading="lazy" decoding="async"
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    <div className="absolute top-4 right-4 bg-destructive text-destructive-foreground font-bold px-3 py-1 rounded-full text-sm shadow-md">
                      {deal.discountPercent}% OFF
                    </div>
                    <div className="absolute top-4 left-4 bg-primary text-primary-foreground font-semibold px-3 py-1 rounded-full text-xs shadow-md uppercase tracking-wider">
                      {deal.type}
                    </div>
                  </div>
                  <CardContent className="p-6">
                    <h3 className="text-xl font-bold mb-2 group-hover:text-primary transition-colors line-clamp-1">{deal.title}</h3>
                    <p className="text-muted-foreground text-sm mb-4 line-clamp-2">{deal.description}</p>
                    <div className="flex items-end justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground line-through">₹{deal.originalPrice}</p>
                        <p className="text-2xl font-bold text-foreground">₹{deal.discountedPrice}</p>
                      </div>
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/${deal.type}s/${deal.referenceId}`}>View Deal</Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </section>
      {/* ── Contact Us ── */}
      <section id="contact" className="py-16 md:py-20 bg-slate-50 border-t">
        <div className="container mx-auto px-4 md:px-6">
          <div className="text-center max-w-xl mx-auto mb-12">
            <div className="flex items-center justify-center gap-2 mb-3">
              <div className="w-8 h-1 rounded-full bg-primary" />
              <span className="text-primary text-sm font-bold uppercase tracking-widest">Contact Us</span>
              <div className="w-8 h-1 rounded-full bg-primary" />
            </div>
            <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-3">Have Questions or Need Help?</h2>
            <p className="text-slate-500 text-base">Our support team is available to assist you with bookings, cancellations, and travel queries.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {/* Phone */}
            <Card className="border-0 shadow-md hover:shadow-xl transition-all hover:-translate-y-1 group">
              <CardContent className="p-6 flex flex-col items-center text-center">
                <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Phone className="w-6 h-6 text-green-600" />
                </div>
                <p className="font-bold text-slate-900 text-sm mb-1">Phone</p>
                <a
                  href="tel:+919000978856"
                  className="text-green-600 font-semibold text-base hover:underline"
                >
                  +91 9000978856
                </a>
                <p className="text-xs text-slate-400 mt-2">Tap to call us directly</p>
              </CardContent>
            </Card>

            {/* Email */}
            <Card className="border-0 shadow-md hover:shadow-xl transition-all hover:-translate-y-1 group">
              <CardContent className="p-6 flex flex-col items-center text-center">
                <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Mail className="w-6 h-6 text-blue-600" />
                </div>
                <p className="font-bold text-slate-900 text-sm mb-1">Email</p>
                <a
                  href="mailto:support@dreamflyglobal.com"
                  className="text-blue-600 font-semibold text-sm hover:underline break-all"
                >
                  support@dreamflyglobal.com
                </a>
                <p className="text-xs text-slate-400 mt-2">We reply within 24 hours</p>
              </CardContent>
            </Card>

            {/* Location */}
            <Card className="border-0 shadow-md hover:shadow-xl transition-all hover:-translate-y-1 group">
              <CardContent className="p-6 flex flex-col items-center text-center">
                <div className="w-14 h-14 rounded-2xl bg-orange-50 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <MapPin className="w-6 h-6 text-orange-500" />
                </div>
                <p className="font-bold text-slate-900 text-sm mb-1">Location</p>
                <p className="text-orange-600 font-semibold text-base">India</p>
                <p className="text-xs text-slate-400 mt-2">Serving customers nationwide</p>
              </CardContent>
            </Card>

            {/* Response Time */}
            <Card className="border-0 shadow-md hover:shadow-xl transition-all hover:-translate-y-1 group">
              <CardContent className="p-6 flex flex-col items-center text-center">
                <div className="w-14 h-14 rounded-2xl bg-purple-50 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Clock className="w-6 h-6 text-purple-600" />
                </div>
                <p className="font-bold text-slate-900 text-sm mb-1">Response Time</p>
                <p className="text-purple-600 font-semibold text-base">Within 24 Hours</p>
                <p className="text-xs text-slate-400 mt-2">For all bookings &amp; queries</p>
              </CardContent>
            </Card>
          </div>

          {/* Quick action bar */}
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <a href="tel:+919000978856">
              <Button size="lg" className="bg-green-600 hover:bg-green-700 text-white font-bold gap-2 w-full sm:w-auto">
                <Phone className="w-4 h-4" /> Call Now
              </Button>
            </a>
            <a href="mailto:support@dreamflyglobal.com">
              <Button size="lg" variant="outline" className="font-bold gap-2 w-full sm:w-auto border-blue-300 text-blue-700 hover:bg-blue-50">
                <Mail className="w-4 h-4" /> Send Email
              </Button>
            </a>
            <a
              href={`https://wa.me/919000978856?text=${encodeURIComponent("Hi, I need help with my Dream Fly Global booking.")}`}
              target="_blank" rel="noopener noreferrer"
            >
              <Button size="lg" variant="outline" className="font-bold gap-2 w-full sm:w-auto border-green-300 text-green-700 hover:bg-green-50">
                <Phone className="w-4 h-4" /> WhatsApp
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* ── About Dream Fly Global ── */}
      <section className="py-16 md:py-24 bg-white border-t">
        <div className="container mx-auto px-4 md:px-6">

          {/* Two-column layout: text left, visual right */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center mb-16">

            {/* Left: text */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-1 rounded-full bg-primary" />
                <span className="text-primary text-sm font-bold uppercase tracking-widest">About Us</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-900 mb-5 leading-tight">
                Welcome to Dream Fly Global –<br className="hidden sm:block" />
                <span className="text-primary">Your Trusted Travel Partner</span>
              </h2>
              <p className="text-slate-600 text-base md:text-lg leading-relaxed mb-5">
                At Dream Fly Global, we believe travel should be easy, affordable, and memorable. Whether you're booking flights, hotels, buses, or holiday packages, we provide a seamless experience with the best prices.
              </p>
              <p className="text-slate-500 text-base leading-relaxed mb-8">
                Our mission is to simplify travel planning and help customers explore destinations without stress. With smart technology and dedicated support, we ensure a smooth booking journey from start to finish.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button asChild size="lg" className="font-bold">
                  <Link href="/packages"><Compass className="w-4 h-4 mr-2" /> Explore Packages</Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="font-bold">
                  <Link href="/flights"><Plane className="w-4 h-4 mr-2" /> Book Flights</Link>
                </Button>
              </div>
            </div>

            {/* Right: mission card */}
            <div className="relative">
              <div className="absolute -inset-4 bg-gradient-to-br from-primary/10 to-primary/5 rounded-3xl" />
              <div className="relative bg-white rounded-2xl shadow-lg border border-slate-100 p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <Compass className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-900 text-lg">Our Mission</p>
                    <p className="text-slate-500 text-sm">What drives us every day</p>
                  </div>
                </div>
                <p className="text-slate-600 text-base leading-relaxed italic border-l-4 border-primary/30 pl-4">
                  "Dream Fly Global is not just a booking platform — it's your travel companion. We're here to make every journey unforgettable, from the first search to the final destination."
                </p>
                <div className="mt-6 pt-6 border-t border-slate-100 grid grid-cols-3 gap-4 text-center">
                  {[
                    { value: "50K+", label: "Happy Travellers" },
                    { value: "200+", label: "Destinations" },
                    { value: "24/7", label: "Support" },
                  ].map((s) => (
                    <div key={s.label}>
                      <p className="text-2xl font-extrabold text-primary">{s.value}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Why Choose Us */}
          <div className="text-center mb-10">
            <h3 className="text-2xl md:text-3xl font-extrabold text-slate-900 mb-2">Why Choose Dream Fly Global?</h3>
            <p className="text-slate-500 text-base">Everything you need for a perfect trip, all in one place.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                icon: BadgeCheck,
                title: "Best Price Guarantee",
                desc: "We match and beat competitor prices. Book with confidence knowing you're always getting the best deal.",
                color: "text-green-600",
                bg: "bg-green-50",
              },
              {
                icon: Zap,
                title: "Easy Booking Process",
                desc: "From search to confirmation in minutes. Our streamlined flow makes booking flights, hotels, and packages effortless.",
                color: "text-amber-600",
                bg: "bg-amber-50",
              },
              {
                icon: CreditCard,
                title: "Secure Payments",
                desc: "Bank-level encryption on every transaction. Your financial data is always protected with industry-leading security.",
                color: "text-blue-600",
                bg: "bg-blue-50",
              },
              {
                icon: Users,
                title: "Dedicated Support Team",
                desc: "Our travel experts are available 24/7 to assist you before, during, and after your journey — whenever you need us.",
                color: "text-purple-600",
                bg: "bg-purple-50",
              },
            ].map(({ icon: Icon, title, desc, color, bg }) => (
              <Card key={title} className="border-0 shadow-md hover:shadow-xl transition-all hover:-translate-y-1 group">
                <CardContent className="p-6">
                  <div className={`w-12 h-12 rounded-2xl ${bg} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                    <Icon className={`w-6 h-6 ${color}`} />
                  </div>
                  <h4 className="font-bold text-slate-900 text-base mb-2">{title}</h4>
                  <p className="text-slate-500 text-sm leading-relaxed">{desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>

        </div>
      </section>
    </Layout>
  );
}
