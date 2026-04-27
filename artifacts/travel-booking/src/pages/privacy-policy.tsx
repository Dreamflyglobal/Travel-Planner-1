import { APP_NAME } from "@/lib/app-config";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  Info, AlertTriangle, PhoneCall, Mail, ArrowRight,
  UserRound, Lock, Megaphone, ShieldCheck,
} from "lucide-react";

const POINTS = [
  {
    icon: UserRound,
    color: "text-blue-600",
    bg: "bg-blue-50",
    title: "Data We Collect",
    body: "When you create an account or make a booking, we collect personal information including your name, phone number, and email address. This information is used solely to process and manage your bookings.",
  },
  {
    icon: Lock,
    color: "text-green-600",
    bg: "bg-green-50",
    title: "Data Security",
    body: "Your personal data is stored securely and is not shared with any unauthorized third parties. We use industry-standard security measures to protect your information from unauthorized access, disclosure, or misuse.",
  },
  {
    icon: Megaphone,
    color: "text-purple-600",
    bg: "bg-purple-50",
    title: "Use of Data",
    body: `Your data may be used to send booking confirmations, travel updates, and occasional promotional offers from ${APP_NAME}. You can opt out of marketing communications at any time by contacting our support team.`,
  },
  {
    icon: ShieldCheck,
    color: "text-teal-600",
    bg: "bg-teal-50",
    title: "Your Agreement",
    body: `By using the ${APP_NAME} platform, you acknowledge and agree to the collection and use of your data as described in this Privacy Policy. Continued use of our services implies ongoing consent.`,
  },
];

export default function PrivacyPolicy() {
  return (
    <Layout>
      {/* Hero */}
      <section className="bg-gradient-to-br from-slate-900 to-slate-700 text-white py-14 md:py-20">
        <div className="container mx-auto px-4 md:px-6 text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 text-sm font-semibold mb-5">
            <Info className="w-4 h-4" /> Legal
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold mb-4 leading-tight">Privacy Policy</h1>
          <p className="text-white/70 text-base md:text-lg max-w-2xl mx-auto">
            We respect your privacy. Here's how we collect, use, and protect your personal information.
          </p>
        </div>
      </section>

      <div className="container mx-auto px-4 md:px-6 py-12 md:py-16 max-w-4xl space-y-10">

        {/* Notice */}
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 md:p-5">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-900 text-sm">Your Consent</p>
            <p className="text-amber-800 text-sm mt-0.5 leading-relaxed">
              By using {APP_NAME}, you consent to the collection and use of your information as described in this policy. Please read it carefully before proceeding.
            </p>
          </div>
        </div>

        {/* Policy cards */}
        <div className="space-y-5">
          {POINTS.map(({ icon: Icon, color, bg, title, body }, index) => (
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
              ["Data collected",     "Name, phone number, email address"],
              ["Purpose",           "Booking processing, communication, offers"],
              ["Data sharing",      "Not shared with unauthorized parties"],
              ["Security",          "Industry-standard protection measures"],
              ["Your right",        "Opt out of marketing at any time"],
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
            <Link href="/terms">
              <div className="group border border-slate-200 rounded-xl p-4 hover:border-primary hover:shadow-md transition-all cursor-pointer flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-900 text-sm group-hover:text-primary transition-colors">Terms &amp; Conditions</p>
                  <p className="text-slate-400 text-xs mt-0.5">Platform usage rules and limitations</p>
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
          <h3 className="text-xl font-bold mb-2">Privacy Concerns?</h3>
          <p className="text-white/70 text-sm mb-6 max-w-md mx-auto">
            If you have any questions about how your data is handled, reach out to our support team.
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
