import { APP_NAME } from "@/lib/app-config";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  Plane, Building2, Bus, AlertTriangle, Info,
  PhoneCall, Mail, ArrowRight, ShieldCheck, XCircle, CircleDollarSign,
} from "lucide-react";

const SECTIONS = [
  {
    icon: Plane,
    color: "text-sky-600",
    bg: "bg-sky-50",
    title: "Flight Cancellations",
    rules: [
      "Cancellation terms depend on the airline's fare rules at the time of booking.",
      "Some fares (e.g. Basic Economy, Saver) are non-refundable and non-changeable.",
      "Refundable tickets may attract a cancellation fee as per the airline's policy.",
      "Cancellations requested within 24 hours of booking may be eligible for a full refund on select airlines.",
      "Government taxes and surcharges may be refundable even on non-refundable fares — subject to airline discretion.",
    ],
  },
  {
    icon: Building2,
    color: "text-teal-600",
    bg: "bg-teal-50",
    title: "Hotel Cancellations",
    rules: [
      "Free cancellation is available on most hotel bookings if cancelled before the property's stated deadline.",
      "Non-refundable or 'Pay Now' rates cannot be cancelled or modified once confirmed.",
      "Late cancellations (after the free cancellation window) may incur a charge of 1 or more night's stay.",
      "No-shows are generally treated as late cancellations and charged accordingly.",
      "Please review the specific cancellation policy displayed on the hotel listing before completing your booking.",
    ],
  },
  {
    icon: Bus,
    color: "text-orange-600",
    bg: "bg-orange-50",
    title: "Bus Cancellations",
    rules: [
      "Cancellation charges vary by operator and how far in advance the cancellation is made.",
      "Cancellations made more than 48 hours before departure are typically eligible for a partial refund.",
      "Cancellations within 24 hours of departure may attract higher charges or be non-refundable.",
      "Some operators do not permit cancellations within 4–6 hours of scheduled departure.",
      "Seat reservation fees, if any, are generally non-refundable.",
    ],
  },
];

const GENERAL = [
  {
    icon: CircleDollarSign,
    color: "text-purple-600",
    bg: "bg-purple-50",
    title: "Refund Processing",
    desc: "Approved refunds are processed back to the original payment method within 7–14 business days, depending on your bank or card issuer.",
  },
  {
    icon: XCircle,
    color: "text-red-600",
    bg: "bg-red-50",
    title: "Non-Refundable Bookings",
    desc: "Some bookings are explicitly marked non-refundable. These cannot be cancelled for a refund under any circumstance. Please check before confirming.",
  },
  {
    icon: ShieldCheck,
    color: "text-green-600",
    bg: "bg-green-50",
    title: "Our Recommendation",
    desc: "We strongly advise all customers to read the cancellation terms on the booking summary page before making payment. Terms are displayed clearly at checkout.",
  },
];

export default function CancellationPolicy() {
  return (
    <Layout>
      {/* Hero */}
      <section className="bg-gradient-to-br from-slate-900 to-slate-700 text-white py-14 md:py-20">
        <div className="container mx-auto px-4 md:px-6 text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 text-sm font-semibold mb-5">
            <Info className="w-4 h-4" /> Policy Information
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold mb-4 leading-tight">Cancellation Policy</h1>
          <p className="text-white/70 text-base md:text-lg max-w-2xl mx-auto">
            Understand the cancellation and refund rules for flights, hotels, and buses booked through {APP_NAME}.
          </p>
        </div>
      </section>

      <div className="container mx-auto px-4 md:px-6 py-12 md:py-16 max-w-4xl space-y-10">

        {/* Important notice */}
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 md:p-5">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-900 text-sm">Important Notice</p>
            <p className="text-amber-800 text-sm mt-0.5 leading-relaxed">
              Cancellation charges and refund eligibility depend on the airline, hotel, or bus operator's individual rules — not {APP_NAME}'s. Customers are advised to <strong>review cancellation terms carefully before confirming a booking</strong>.
            </p>
          </div>
        </div>

        {/* Per-service sections */}
        {SECTIONS.map(({ icon: Icon, color, bg, title, rules }) => (
          <Card key={title} className="border-0 shadow-md overflow-hidden">
            <div className="flex items-center gap-3 px-6 py-4 border-b bg-slate-50">
              <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <h2 className="text-lg font-bold text-slate-900">{title}</h2>
            </div>
            <CardContent className="p-6">
              <ul className="space-y-3">
                {rules.map((rule, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-slate-600 leading-relaxed">
                    <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${color.replace("text-", "bg-")}`} />
                    {rule}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}

        {/* General policy cards */}
        <div>
          <h2 className="text-xl font-bold text-slate-900 mb-5">General Terms</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {GENERAL.map(({ icon: Icon, color, bg, title, desc }) => (
              <Card key={title} className="border-0 shadow-md">
                <CardContent className="p-5">
                  <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center mb-3`}>
                    <Icon className={`w-5 h-5 ${color}`} />
                  </div>
                  <p className="font-semibold text-slate-900 text-sm mb-1.5">{title}</p>
                  <p className="text-slate-500 text-xs leading-relaxed">{desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Holiday packages note */}
        <Card className="border-0 shadow-md bg-pink-50 border-pink-100">
          <CardContent className="p-5 flex items-start gap-3">
            <Info className="w-5 h-5 text-pink-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-pink-900 text-sm">Holiday Packages</p>
              <p className="text-pink-800 text-sm mt-0.5 leading-relaxed">
                For holiday packages, cancellation charges are as per the package operator's terms. Free cancellation is available within 24 hours of booking on most packages. After that, partial or full charges may apply. Please check the package detail page for specific terms.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Contact CTA */}
        <div className="bg-slate-900 text-white rounded-2xl p-8 text-center">
          <h3 className="text-xl font-bold mb-2">Need Help with a Cancellation?</h3>
          <p className="text-white/70 text-sm mb-6 max-w-md mx-auto">
            Our support team is here to assist you. Reach out and we'll respond within 24 hours.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <a href="tel:+919000978856">
              <Button className="bg-white text-slate-900 hover:bg-white/90 font-bold gap-2 w-full sm:w-auto">
                <PhoneCall className="w-4 h-4" /> +91 9000978856
              </Button>
            </a>
            <a href="mailto:support@dreamflyglobal.com">
              <Button variant="outline" className="border-white/30 text-white hover:bg-white/10 font-bold gap-2 w-full sm:w-auto">
                <Mail className="w-4 h-4" /> support@dreamflyglobal.com
              </Button>
            </a>
          </div>
        </div>

        {/* Back to home */}
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
