import { Link } from "wouter";
import { Phone, Mail, MapPin } from "lucide-react";
import { FooterSocialLinks } from "@/components/footer-social-links";
import { APP_NAME, APP_SUPPORT_PHONE, APP_SUPPORT_EMAIL } from "@/lib/app-config";

export function Footer() {
  return (
    <footer className="border-t bg-card mt-auto overflow-x-hidden">
      <div className="w-full box-border px-5 sm:px-6 md:container md:mx-auto py-10 md:py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-8 md:gap-8">

          {/* Brand — full-width on mobile, spans 2 cols on sm, 1 col on md */}
          <div className="col-span-1 sm:col-span-2 md:col-span-1 space-y-4">
            <h3 className="text-xl font-bold text-primary font-sans">{APP_NAME}</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Your ultimate travel companion. Book flights, buses, hotels, and holiday packages all in one place.
            </p>
            <div className="space-y-2.5 text-sm text-slate-600">
              <a href="tel:+919000978856" className="flex items-center gap-2 hover:text-primary transition-colors">
                <Phone className="w-4 h-4 shrink-0" /> +91 9000978856
              </a>
              <a href="mailto:support@dreamflyglobal.com" className="flex items-center gap-2 hover:text-primary transition-colors break-all">
                <Mail className="w-4 h-4 shrink-0" /> support@dreamflyglobal.com
              </a>
              <span className="flex items-center gap-2">
                <MapPin className="w-4 h-4 shrink-0" /> India
              </span>
            </div>
            <FooterSocialLinks />
          </div>

          {/* Book */}
          <div className="min-w-0">
            <h4 className="font-semibold mb-4 text-slate-800">Book</h4>
            <ul className="space-y-3 text-sm text-slate-600">
              <li><Link href="/flights"  className="hover:text-primary transition-colors">Flights</Link></li>
              <li><Link href="/buses"    className="hover:text-primary transition-colors">Buses</Link></li>
              <li><Link href="/hotels"   className="hover:text-primary transition-colors">Hotels</Link></li>
              <li><Link href="/packages" className="hover:text-primary transition-colors">Holiday Packages</Link></li>
            </ul>
          </div>

          {/* Company */}
          <div className="min-w-0">
            <h4 className="font-semibold mb-4 text-slate-800">Company</h4>
            <ul className="space-y-3 text-sm text-slate-600">
              <li><Link href="/about"    className="hover:text-primary transition-colors">About Us</Link></li>
              <li><Link href="/contact"  className="hover:text-primary transition-colors">Contact Us</Link></li>
              <li><Link href="/bookings" className="hover:text-primary transition-colors">Manage Bookings</Link></li>
              <li>
                <a
                  href="https://wa.me/919000978856?text=Hi%20Dream%20Fly%20Global%2C%20I%20need%20help."
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-primary transition-colors"
                >
                  WhatsApp Us
                </a>
              </li>
            </ul>
          </div>

          {/* Support */}
          <div className="min-w-0">
            <h4 className="font-semibold mb-4 text-slate-800">Support</h4>
            <ul className="space-y-3 text-sm text-slate-600">
              <li><a href="tel:+919000978856"                 className="hover:text-primary transition-colors">Call Support</a></li>
              <li><a href="mailto:support@dreamflyglobal.com" className="hover:text-primary transition-colors">Email Support</a></li>
              <li><Link href="/cancellation-policy"           className="hover:text-primary transition-colors">Cancellation Policy</Link></li>
              <li><Link href="/refund-policy"                 className="hover:text-primary transition-colors">Refund Policy</Link></li>
            </ul>
          </div>

          {/* Legal */}
          <div className="min-w-0">
            <h4 className="font-semibold mb-4 text-slate-800">Legal</h4>
            <ul className="space-y-3 text-sm text-slate-600">
              <li><Link href="/terms"               className="hover:text-primary transition-colors">Terms &amp; Conditions</Link></li>
              <li><Link href="/privacy-policy"      className="hover:text-primary transition-colors">Privacy Policy</Link></li>
              <li><Link href="/refund-policy"       className="hover:text-primary transition-colors">Refund Policy</Link></li>
              <li><Link href="/cancellation-policy" className="hover:text-primary transition-colors">Cancellation Policy</Link></li>
            </ul>
          </div>

        </div>

        <div className="mt-10 pt-8 border-t flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-slate-500">
          <p className="text-center sm:text-left">&copy; {new Date().getFullYear()} {APP_NAME}. All rights reserved.</p>
          <p className="text-center sm:text-right">Response time: Within 24 hours &nbsp;·&nbsp; {APP_SUPPORT_EMAIL}</p>
        </div>
      </div>
    </footer>
  );
}
