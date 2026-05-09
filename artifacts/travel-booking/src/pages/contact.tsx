import { APP_NAME } from "@/lib/app-config";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  Phone, Mail, MapPin, Clock, MessageCircle,
  Info, ArrowRight, Send,
} from "lucide-react";

const CARDS = [
  {
    icon: Phone,
    color: "text-green-600",
    bg: "bg-green-50",
    title: "Call Us",
    value: "+91 9000978856",
    sub: "Mon – Sun, 9 AM – 8 PM",
    href: "tel:+919000978856",
    cta: "Call Now",
  },
  {
    icon: Mail,
    color: "text-blue-600",
    bg: "bg-blue-50",
    title: "Email Us",
    value: "support@dreamflyglobal.com",
    sub: "We respond within 24 hours",
    href: "mailto:support@dreamflyglobal.com",
    cta: "Send Email",
  },
  {
    icon: MessageCircle,
    color: "text-teal-600",
    bg: "bg-teal-50",
    title: "WhatsApp",
    value: "+91 9000978856",
    sub: "Quick replies on WhatsApp",
    href: "https://wa.me/919000978856?text=Hi%20Dream%20Fly%20Global%2C%20I%20need%20help%20with%20my%20booking.",
    cta: "Chat on WhatsApp",
  },
  {
    icon: MapPin,
    color: "text-orange-600",
    bg: "bg-orange-50",
    title: "Location",
    value: "India",
    sub: "DreamFly Global",
    href: null,
    cta: null,
  },
];

export default function Contact() {
  return (
    <Layout>
      {/* Hero */}
      <section className="bg-gradient-to-br from-slate-900 to-slate-700 text-white py-16 md:py-24">
        <div className="container mx-auto px-4 md:px-6 text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 text-sm font-semibold mb-5">
            <Info className="w-4 h-4" /> Get in Touch
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold mb-4 leading-tight">Contact Us</h1>
          <p className="text-white/70 text-base md:text-lg max-w-xl mx-auto">
            Have a question about your booking, a travel query, or just want to say hello? We're here to help — reach out any time.
          </p>
        </div>
      </section>

      <div className="container mx-auto px-4 md:px-6 py-12 md:py-16 max-w-5xl space-y-12">

        {/* Contact cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {CARDS.map(({ icon: Icon, color, bg, title, value, sub, href, cta }) => (
            <Card key={title} className="border-0 shadow-md hover:shadow-lg transition-shadow text-center">
              <CardContent className="p-6 flex flex-col items-center">
                <div className={`w-12 h-12 rounded-2xl ${bg} flex items-center justify-center mb-4`}>
                  <Icon className={`w-6 h-6 ${color}`} />
                </div>
                <p className="font-bold text-slate-900 text-sm mb-1">{title}</p>
                <p className="text-slate-700 text-sm font-medium mb-1 break-all">{value}</p>
                <p className="text-slate-400 text-xs mb-4">{sub}</p>
                {href && cta && (
                  <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="w-full">
                    <Button size="sm" variant="outline" className="w-full text-xs font-semibold">
                      {cta}
                    </Button>
                  </a>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Response time strip */}
        <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4 md:p-5">
          <Clock className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-blue-900 text-sm">Response Time</p>
            <p className="text-blue-800 text-sm mt-0.5 leading-relaxed">
              We aim to respond to all queries within <strong>24 hours</strong>. For urgent booking issues, calling or WhatsApp is the fastest way to reach us.
            </p>
          </div>
        </div>

        {/* What we can help with */}
        <div>
          <h2 className="text-xl font-bold text-slate-900 mb-6 text-center">What Can We Help You With?</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {[
              { emoji: "✈️", title: "Flight Bookings",     desc: "Assistance with search, booking, changes, and cancellations." },
              { emoji: "🏨", title: "Hotel Reservations",  desc: "Help with hotel availability, booking modifications, and refunds." },
              { emoji: "🚌", title: "Bus Tickets",         desc: "Support for bus ticket bookings, seat selection, and cancellations." },
              { emoji: "🌴", title: "Holiday Packages",    desc: "Queries on packages, itineraries, pricing, and customisation." },
              { emoji: "💳", title: "Payments & Refunds",  desc: "Issues with payments, failed transactions, and refund status." },
              { emoji: "📋", title: "General Enquiries",   desc: "Any other travel-related questions or feedback for our team." },
            ].map(({ emoji, title, desc }) => (
              <div key={title} className="border border-slate-200 rounded-xl p-4 hover:border-primary hover:shadow-sm transition-all">
                <p className="text-2xl mb-2">{emoji}</p>
                <p className="font-semibold text-slate-900 text-sm mb-1">{title}</p>
                <p className="text-slate-400 text-xs leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Enquiry form */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 md:p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
              <Send className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">Send Us a Message</h3>
              <p className="text-slate-400 text-xs">We'll get back to you within 24 hours</p>
            </div>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const name = (form.elements.namedItem("name") as HTMLInputElement).value;
              const phone = (form.elements.namedItem("phone") as HTMLInputElement).value;
              const message = (form.elements.namedItem("message") as HTMLTextAreaElement).value;
              const text = `Hi ${APP_NAME}, I'm ${name} (${phone}). ${message}`;
              window.open(`https://wa.me/919000978856?text=${encodeURIComponent(text)}`, "_blank");
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Your Name</label>
                <input
                  name="name"
                  required
                  placeholder="Enter your name"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Phone Number</label>
                <input
                  name="phone"
                  required
                  placeholder="+91 XXXXX XXXXX"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary bg-white"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Email Address</label>
              <input
                name="email"
                type="email"
                placeholder="Enter email address"
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Message</label>
              <textarea
                name="message"
                required
                rows={4}
                placeholder="Describe your query or issue..."
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary bg-white resize-none"
              />
            </div>
            <Button type="submit" className="w-full sm:w-auto font-bold gap-2">
              <MessageCircle className="w-4 h-4" /> Send via WhatsApp
            </Button>
          </form>
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
