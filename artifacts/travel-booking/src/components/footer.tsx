import { Link } from "wouter";
import { Phone, Mail, MapPin } from "lucide-react";
import { FooterSocialLinks } from "@/components/footer-social-links";
import { APP_NAME, APP_SUPPORT_PHONE, APP_SUPPORT_EMAIL } from "@/lib/app-config";

export function Footer() {
  return (
    <footer className="border-t bg-card mt-auto">
      <div className="container py-12 md:py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-8">

          {/* Brand — spans wider on md */}
          <div className="sm:col-span-2 md:col-span-1 space-y-4">
            <h3 className="text-xl font-bold text-primary font-sans">{APP_NAME}</h3>
            <p className="text-sm text-muted-foreground">
              Your ultimate travel companion. Book flights, buses, hotels, and holiday packages all in one place.
            </p>
            <div className="space-y-2 text-sm text-muted-foreground">
              <a href="tel:+919000978856" className="flex items-center gap-2 hover:text-primary transition-colors">
                <Phone className="w-4 h-4 shrink-0" /> +91 9000978856
              </a>
              <a href="mailto:support@dreamflyglobal.com" className="flex items-center gap-2 hover:text-primary transition-colors">
                <Mail className="w-4 h-4 shrink-0" /> support@dreamflyglobal.com
              </a>
              <span className="flex items-center gap-2">
                <MapPin className="w-4 h-4 shrink-0" /> India
              </span>
            </div>
            <FooterSocialLinks />
          </div>

          {/* Book */}
          <div>
            <h4 className="font-semibold mb-4">Book</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/flights"  className="hover:text-primary transition-colors">Flights</Link></li>
              <li><Link href="/buses"    className="hover:text-primary transition-colors">Buses</Link></li>
              <li><Link href="/hotels"   className="hover:text-primary transition-colors">Hotels</Link></li>
              <li><Link href="/packages" className="hover:text-primary transition-colors">Holiday Packages</Link></li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="font-semibold mb-4">Company</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/about"   className="hover:text-primary transition-colors">About Us</Link></li>
              <li><Link href="/contact" className="hover:text-primary transition-colors">Contact Us</Link></li>
              <li><Link href="/bookings" className="hover:text-primary transition-colors">Manage Bookings</Link></li>
              <li><a href="https://wa.me/919000978856?text=Hi%20Dream%20Fly%20Global%2C%20I%20need%20help." target="_blank" rel="noreferrer" className="hover:text-primary transition-colors">WhatsApp Us</a></li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="font-semibold mb-4">Support</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><a href="tel:+919000978856"                    className="hover:text-primary transition-colors">Call Support</a></li>
              <li><a href="mailto:support@dreamflyglobal.com"    className="hover:text-primary transition-colors">Email Support</a></li>
              <li><Link href="/cancellation-policy"              className="hover:text-primary transition-colors">Cancellation Policy</Link></li>
              <li><Link href="/refund-policy"                    className="hover:text-primary transition-colors">Refund Policy</Link></li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="font-semibold mb-4">Legal</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link href="/terms"          className="hover:text-primary transition-colors">Terms &amp; Conditions</Link></li>
              <li><Link href="/privacy-policy" className="hover:text-primary transition-colors">Privacy Policy</Link></li>
              <li><Link href="/refund-policy"  className="hover:text-primary transition-colors">Refund Policy</Link></li>
              <li><Link href="/cancellation-policy" className="hover:text-primary transition-colors">Cancellation Policy</Link></li>
            </ul>
          </div>

        </div>

        <div className="mt-12 pt-8 border-t flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} {APP_NAME}. All rights reserved.</p>
          <p>Response time: Within 24 hours &nbsp;·&nbsp; {APP_SUPPORT_EMAIL}</p>
        </div>
      </div>
    </footer>
  );
}
