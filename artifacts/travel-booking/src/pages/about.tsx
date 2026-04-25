import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  Plane, ShieldCheck, Headphones, Tag, Globe2,
  Star, Users, MapPin, ArrowRight, CheckCircle2,
} from "lucide-react";

const STATS = [
  { value: "50,000+", label: "Happy Travellers" },
  { value: "200+",    label: "Destinations" },
  { value: "98%",     label: "Satisfaction Rate" },
  { value: "24/7",    label: "Customer Support" },
];

const WHY = [
  {
    icon: Tag,
    color: "text-blue-600",
    bg: "bg-blue-50",
    title: "Best Price Guarantee",
    desc: "We compare prices across multiple providers so you always get the most competitive deal.",
  },
  {
    icon: ShieldCheck,
    color: "text-green-600",
    bg: "bg-green-50",
    title: "Secure Bookings",
    desc: "Your payments and personal data are protected with industry-standard encryption.",
  },
  {
    icon: Headphones,
    color: "text-purple-600",
    bg: "bg-purple-50",
    title: "24/7 Support",
    desc: "Our dedicated support team is available round the clock to assist with any travel query.",
  },
  {
    icon: Globe2,
    color: "text-orange-600",
    bg: "bg-orange-50",
    title: "200+ Destinations",
    desc: "Flights, hotels, buses, and holiday packages to over 200 destinations across India and beyond.",
  },
];

const VALUES = [
  "Transparency in pricing — no hidden surprises at checkout.",
  "Customer-first approach in every interaction.",
  "Reliable partners — only trusted airlines, hotels, and operators.",
  "Continuous improvement based on traveller feedback.",
];

export default function About() {
  return (
    <Layout>
      {/* Hero */}
      <section className="bg-gradient-to-br from-slate-900 to-slate-700 text-white py-16 md:py-24">
        <div className="container mx-auto px-4 md:px-6 text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 text-sm font-semibold mb-5">
            <Globe2 className="w-4 h-4" /> About Us
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold mb-5 leading-tight">
            Making Travel Simple,<br className="hidden md:block" /> Affordable &amp; Enjoyable
          </h1>
          <p className="text-white/70 text-base md:text-lg max-w-2xl mx-auto">
            Dream Fly Global is a one-stop travel booking platform that helps you discover, plan, and book your perfect trip — flights, hotels, buses, and holiday packages all in one place.
          </p>
        </div>
      </section>

      <div className="container mx-auto px-4 md:px-6 py-12 md:py-16 max-w-5xl space-y-16">

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
          {STATS.map(({ value, label }) => (
            <div key={label} className="text-center bg-slate-50 border border-slate-200 rounded-2xl py-6 px-4">
              <p className="text-2xl md:text-3xl font-extrabold text-primary mb-1">{value}</p>
              <p className="text-slate-500 text-sm">{label}</p>
            </div>
          ))}
        </div>

        {/* Our Story */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
          <div>
            <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 mb-4">Our Story</h2>
            <p className="text-slate-500 text-sm leading-relaxed mb-4">
              Dream Fly Global was born from a simple idea — travel booking should be effortless. We noticed that travellers were spending hours comparing prices across different platforms, dealing with hidden fees, and struggling to get timely support when things went wrong.
            </p>
            <p className="text-slate-500 text-sm leading-relaxed mb-4">
              We built Dream Fly Global to change that. Our platform brings together flights, hotels, buses, and curated holiday packages under one roof — with honest pricing, instant confirmations, and a support team that genuinely cares.
            </p>
            <p className="text-slate-500 text-sm leading-relaxed">
              Based in India, we serve travellers across the country and continue to grow our network of destinations, partners, and features — all with one goal: making your journey as enjoyable as the destination itself.
            </p>
          </div>
          <div className="bg-gradient-to-br from-primary/10 to-primary/5 rounded-2xl p-8 border border-primary/20">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
                <Plane className="w-5 h-5 text-white" />
              </div>
              <span className="text-lg font-bold text-slate-900">Our Mission</span>
            </div>
            <p className="text-slate-600 text-sm leading-relaxed mb-6">
              To empower every Indian traveller with easy access to the best travel options — at fair prices, backed by reliable support and a seamless booking experience.
            </p>
            <ul className="space-y-3">
              {VALUES.map((v) => (
                <li key={v} className="flex items-start gap-2.5 text-sm text-slate-600">
                  <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                  {v}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Why Choose Us */}
        <div>
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 mb-3">Why Choose Dream Fly Global?</h2>
            <p className="text-slate-500 text-sm max-w-xl mx-auto">
              We're not just a booking platform — we're your travel partner from first search to safe return.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {WHY.map(({ icon: Icon, color, bg, title, desc }) => (
              <Card key={title} className="border-0 shadow-md hover:shadow-lg transition-shadow">
                <CardContent className="p-6 flex gap-4">
                  <div className={`w-11 h-11 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
                    <Icon className={`w-5 h-5 ${color}`} />
                  </div>
                  <div>
                    <p className="font-bold text-slate-900 text-sm mb-1.5">{title}</p>
                    <p className="text-slate-500 text-xs leading-relaxed">{desc}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Where we operate */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8 flex flex-col md:flex-row items-center gap-6">
          <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center shrink-0">
            <MapPin className="w-7 h-7 text-primary" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-lg mb-1">Based in India. Built for Indian Travellers.</h3>
            <p className="text-slate-500 text-sm leading-relaxed">
              Dream Fly Global is operated by DreamFly Global, headquartered in India. We specialize in domestic and international travel, with deep expertise in routes, operators, and destinations most relevant to Indian travellers.
            </p>
          </div>
        </div>

        {/* CTA strip */}
        <div className="bg-slate-900 text-white rounded-2xl p-8 text-center">
          <Star className="w-8 h-8 text-yellow-400 mx-auto mb-3" />
          <h3 className="text-xl font-bold mb-2">Ready to Plan Your Next Trip?</h3>
          <p className="text-white/70 text-sm mb-6 max-w-md mx-auto">
            Join over 50,000 happy travellers who trust Dream Fly Global for their journeys.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/flights">
              <Button className="bg-white text-slate-900 hover:bg-white/90 font-bold gap-2 w-full sm:w-auto">
                <Plane className="w-4 h-4" /> Search Flights
              </Button>
            </Link>
            <Link href="/contact">
              <Button variant="outline" className="border-white/30 text-white hover:bg-white/10 font-bold gap-2 w-full sm:w-auto">
                <Users className="w-4 h-4" /> Talk to Us
              </Button>
            </Link>
          </div>
        </div>

        {/* Back */}
        <div className="text-center pb-4">
          <Link href="/">
            <Button variant="ghost" className="text-slate-500 hover:text-primary gap-1">
              Back to Home <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>

      </div>
    </Layout>
  );
}
