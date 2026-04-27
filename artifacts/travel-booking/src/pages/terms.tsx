import { APP_NAME } from "@/lib/app-config";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  Info, AlertTriangle, PhoneCall, Mail, ArrowRight,
  CalendarCheck, TrendingUp, UserCheck, Store, ShieldOff,
} from "lucide-react";

const TERMS = [
  {
    icon: CalendarCheck,
    color: "text-blue-600",
    bg: "bg-blue-50",
    title: "Availability",
    body: `All bookings made through ${APP_NAME} are subject to availability at the time of confirmation. We do not guarantee the availability of any specific flight, hotel, bus, or holiday package until the booking is fully confirmed.`,
  },
  {
    icon: TrendingUp,
    color: "text-amber-600",
    bg: "bg-amber-50",
    title: "Pricing",
    body: `Prices displayed on ${APP_NAME} are indicative and may change without prior notice due to dynamic pricing by airlines, hotels, and operators. The final price is confirmed only at the time of booking completion.`,
  },
  {
    icon: UserCheck,
    color: "text-green-600",
    bg: "bg-green-50",
    title: "User Responsibility",
    body: `Users must provide accurate personal and payment information when making a booking. ${APP_NAME} is not liable for any issues arising from incorrect details provided at the time of booking, including name mismatches, date errors, or wrong contact information.`,
  },
  {
    icon: Store,
    color: "text-purple-600",
    bg: "bg-purple-50",
    title: "Platform Role",
    body: `${APP_NAME} operates solely as a travel booking platform and aggregator. We are not the airline, hotel, bus operator, or holiday package provider. The actual service is rendered by the respective third-party providers.`,
  },
  {
    icon: ShieldOff,
    color: "text-red-600",
    bg: "bg-red-50",
    title: "Limitation of Liability",
    body: `${APP_NAME} is not responsible for any delays, cancellations, rescheduling, service disruptions, or quality issues caused by airlines, hotels, bus operators, or any third-party service provider. Any disputes regarding the service must be raised directly with the provider.`,
  },
];

export default function Terms() {
  return (
    <Layout>
      {/* Hero */}
      <section className="bg-gradient-to-br from-slate-900 to-slate-700 text-white py-14 md:py-20">
        <div className="container mx-auto px-4 md:px-6 text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 text-sm font-semibold mb-5">
            <Info className="w-4 h-4" /> Legal
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold mb-4 leading-tight">Terms &amp; Conditions</h1>
          <p className="text-white/70 text-base md:text-lg max-w-2xl mx-auto">
            By using {APP_NAME}, you agree to the following terms. Please read them carefully before making a booking.
          </p>
        </div>
      </section>

      <div className="container mx-auto px-4 md:px-6 py-12 md:py-16 max-w-4xl space-y-10">

        {/* Notice */}
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 md:p-5">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-900 text-sm">Agreement to Terms</p>
            <p className="text-amber-800 text-sm mt-0.5 leading-relaxed">
              Accessing or using {APP_NAME}'s platform constitutes your acceptance of these Terms &amp; Conditions. If you do not agree, please refrain from using our services.
            </p>
          </div>
        </div>

        {/* Terms cards */}
        <div className="space-y-5">
          {TERMS.map(({ icon: Icon, color, bg, title, body }, index) => (
            <Card key={title} className="border-0 shadow-md hover:shadow-lg transition-shadow">
              <CardContent className="p-6 flex gap-4">
                <div className="flex flex-col items-center gap-2 shrink-0">
                  <div className={`w-11 h-11 rounded-xl ${bg} flex items-center justify-center`}>
                    <Icon className={`w-5 h-5 ${color}`} />
                  </div>
                  <span className="text-xs font-bold text-slate-400">0{index + 1}</span>
                </div>
                <div className="pt-1">
                  <p className="font-bold text-slate-900 text-base mb-2">{title}</p>
                  <p className="text-slate-500 text-sm leading-relaxed">{body}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Summary strip */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
          <h3 className="font-bold text-slate-900 text-base mb-4">Key Points at a Glance</h3>
          <div className="space-y-3">
            {[
              ["Bookings",         "Subject to availability at time of confirmation"],
              ["Prices",           "May change without prior notice"],
              ["User information", "Must be accurate — user's responsibility"],
              [`${APP_NAME}'s role`, "Booking platform only, not the service provider"],
              ["Liability",        "Not responsible for third-party provider issues"],
            ].map(([label, value]) => (
              <div key={label} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-sm">
                <span className="font-semibold text-slate-700 sm:w-48 shrink-0">{label}</span>
                <span className="text-slate-500">{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Related policies */}
        <div>
          <h3 className="font-bold text-slate-900 text-base mb-4">Related Policies</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Link href="/cancellation-policy">
              <div className="group border border-slate-200 rounded-xl p-4 hover:border-primary hover:shadow-md transition-all cursor-pointer flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-900 text-sm group-hover:text-primary transition-colors">Cancellation Policy</p>
                  <p className="text-slate-400 text-xs mt-0.5">Rules for cancelling flights, hotels &amp; buses</p>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-primary transition-colors" />
              </div>
            </Link>
            <Link href="/refund-policy">
              <div className="group border border-slate-200 rounded-xl p-4 hover:border-primary hover:shadow-md transition-all cursor-pointer flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-900 text-sm group-hover:text-primary transition-colors">Refund Policy</p>
                  <p className="text-slate-400 text-xs mt-0.5">How and when refunds are processed</p>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-primary transition-colors" />
              </div>
            </Link>
          </div>
        </div>

        {/* Contact CTA */}
        <div className="bg-slate-900 text-white rounded-2xl p-8 text-center">
          <h3 className="text-xl font-bold mb-2">Have a Question?</h3>
          <p className="text-white/70 text-sm mb-6 max-w-md mx-auto">
            Our support team can clarify any aspect of these terms. We're available 7 days a week.
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
