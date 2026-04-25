import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  RefreshCw, Clock, CreditCard, AlertTriangle,
  Info, PhoneCall, Mail, ArrowRight, BadgeCheck,
  CircleDollarSign, SplitSquareVertical,
} from "lucide-react";

const POINTS = [
  {
    icon: RefreshCw,
    color: "text-blue-600",
    bg: "bg-blue-50",
    title: "Provider-Based Refunds",
    desc: "Refunds are processed based on the respective airline, hotel, or bus operator's policies. Dream Fly Global initiates the refund once the provider approves it.",
  },
  {
    icon: Clock,
    color: "text-amber-600",
    bg: "bg-amber-50",
    title: "Refund Timeline",
    desc: "Approved refunds are typically credited within 5–10 working days from the date of approval. The exact timeline may vary depending on your bank or card issuer.",
  },
  {
    icon: CreditCard,
    color: "text-slate-600",
    bg: "bg-slate-100",
    title: "Original Payment Method",
    desc: "Refunds will always be credited back to the same payment method used at the time of booking — credit card, debit card, UPI, or net banking.",
  },
  {
    icon: CircleDollarSign,
    color: "text-red-600",
    bg: "bg-red-50",
    title: "Non-Refundable Fees",
    desc: "Convenience fees charged at the time of booking are strictly non-refundable, regardless of the reason for cancellation.",
  },
  {
    icon: SplitSquareVertical,
    color: "text-purple-600",
    bg: "bg-purple-50",
    title: "Partial Refunds",
    desc: "In certain cases — such as partial cancellations or bookings with mixed refundable and non-refundable components — a partial refund may be issued as per the provider's terms.",
  },
  {
    icon: BadgeCheck,
    color: "text-green-600",
    bg: "bg-green-50",
    title: "Confirmation & Updates",
    desc: "Once your refund is processed, you will receive a confirmation via email. You can also contact our support team to check the status of your refund at any time.",
  },
];

export default function RefundPolicy() {
  return (
    <Layout>
      {/* Hero */}
      <section className="bg-gradient-to-br from-slate-900 to-slate-700 text-white py-14 md:py-20">
        <div className="container mx-auto px-4 md:px-6 text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 text-sm font-semibold mb-5">
            <Info className="w-4 h-4" /> Policy Information
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold mb-4 leading-tight">Refund Policy</h1>
          <p className="text-white/70 text-base md:text-lg max-w-2xl mx-auto">
            Everything you need to know about how refunds are handled for bookings made through Dream Fly Global.
          </p>
        </div>
      </section>

      <div className="container mx-auto px-4 md:px-6 py-12 md:py-16 max-w-4xl space-y-10">

        {/* Important notice */}
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 md:p-5">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-900 text-sm">Please Note</p>
            <p className="text-amber-800 text-sm mt-0.5 leading-relaxed">
              Refund eligibility and timelines are governed by the airline, hotel, or bus operator's individual policies. Dream Fly Global will facilitate the refund process but is not responsible for delays caused by third-party providers or banks.
            </p>
          </div>
        </div>

        {/* Policy grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {POINTS.map(({ icon: Icon, color, bg, title, desc }) => (
            <Card key={title} className="border-0 shadow-md hover:shadow-lg transition-shadow">
              <CardContent className="p-6 flex gap-4">
                <div className={`w-11 h-11 rounded-xl ${bg} flex items-center justify-center shrink-0 mt-0.5`}>
                  <Icon className={`w-5 h-5 ${color}`} />
                </div>
                <div>
                  <p className="font-bold text-slate-900 text-sm mb-1.5">{title}</p>
                  <p className="text-slate-500 text-sm leading-relaxed">{desc}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Summary strip */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
          <h3 className="font-bold text-slate-900 text-base mb-4">Quick Summary</h3>
          <div className="space-y-3">
            {[
              ["Refund basis",       "Provider (airline / hotel / bus operator) policies"],
              ["Refund timeline",    "5–10 working days after approval"],
              ["Credited to",        "Original payment method only"],
              ["Convenience fee",    "Non-refundable in all cases"],
              ["Partial refunds",    "May apply on mixed or partial cancellations"],
            ].map(([label, value]) => (
              <div key={label} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-sm">
                <span className="font-semibold text-slate-700 sm:w-44 shrink-0">{label}</span>
                <span className="text-slate-500">{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Contact CTA */}
        <div className="bg-slate-900 text-white rounded-2xl p-8 text-center">
          <h3 className="text-xl font-bold mb-2">Questions About Your Refund?</h3>
          <p className="text-white/70 text-sm mb-6 max-w-md mx-auto">
            Our support team is ready to help. We respond within 24 hours on all refund queries.
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

        {/* Back link */}
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
