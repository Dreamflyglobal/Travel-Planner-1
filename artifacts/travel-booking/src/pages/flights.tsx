import { Layout } from "@/components/layout";
import { Link, useSearch, useLocation } from "wouter";
import { SearchTabs } from "@/components/search-tabs";
import { Plane } from "lucide-react";

const TAB_ROUTES: Record<string, string> = {
  hotels: "/hotels",
  buses: "/buses",
  packages: "/packages",
};

export default function Flights() {
  const searchString = useSearch();
  const [, setLocation] = useLocation();

  const initParams = new URLSearchParams(searchString);
  const initialFrom = initParams.get("from") || "";
  const initialTo   = initParams.get("to")   || "";
  const initialDate = initParams.get("date") || "";

  const popularRoutes = [
    { from: "Delhi",     to: "Mumbai"    },
    { from: "Mumbai",    to: "Goa"       },
    { from: "Bangalore", to: "Delhi"     },
    { from: "Chennai",   to: "Hyderabad" },
    { from: "Kolkata",   to: "Delhi"     },
    { from: "Mumbai",    to: "Chennai"   },
  ];

  return (
    <Layout>
      {/* ── Hero ── */}
      <section className="relative w-full overflow-hidden min-h-[480px] sm:min-h-[540px] flex items-center pt-8 pb-16 sm:pt-14 sm:pb-24">
        <div className="absolute inset-0 z-0">
          <img
            src="/images/hero-flights.webp"
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/40 to-black/70" />
        </div>

        <div className="container relative z-10 mx-auto px-4 md:px-6 mt-4 sm:mt-6">
          <div className="max-w-3xl mb-6 sm:mb-8 text-white">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight mb-3 leading-tight drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]"
              style={{ textShadow: "0 2px 12px rgba(0,0,0,0.5)" }}>
              Fly to your Dream Destinations ✈️
            </h1>
            <p className="text-base sm:text-lg text-white/90 font-medium max-w-2xl"
              style={{ textShadow: "0 1px 6px rgba(0,0,0,0.5)" }}>
              Search hundreds of airlines. Find the best fares in seconds.
            </p>
          </div>

          <SearchTabs
            defaultTab="flights"
            initialFrom={initialFrom}
            initialTo={initialTo}
            initialDate={initialDate}
            onTabChange={(tab) => {
              if (TAB_ROUTES[tab]) setLocation(TAB_ROUTES[tab]);
            }}
          />
        </div>
      </section>

      {/* ── Popular Routes ── */}
      <div className="container mx-auto px-4 py-10">
        <h2 className="text-lg font-bold mb-5 text-foreground">Popular Routes</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {popularRoutes.map((r) => (
            <Link
              key={`${r.from}-${r.to}`}
              href={`/flights/results?from=${encodeURIComponent(r.from)}&to=${encodeURIComponent(r.to)}&travelers=1`}
              className="flex flex-col items-start p-3 rounded-xl border bg-background hover:border-primary/40 hover:bg-primary/5 transition-all group"
            >
              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                <Plane className="w-3 h-3 group-hover:text-primary transition-colors" />
                <span>One Way</span>
              </div>
              <p className="font-semibold text-sm text-foreground">
                {r.from} <span className="text-muted-foreground font-normal">→</span> {r.to}
              </p>
            </Link>
          ))}
        </div>
      </div>

      {/* ── Feature Highlights ── */}
      <div className="container mx-auto px-4 pb-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { icon: "✈️", title: "500+ Airlines",         desc: "Compare prices from all major airlines" },
            { icon: "💸", title: "Best Price Guarantee",  desc: "We match the lowest prices always"      },
            { icon: "🔒", title: "Secure Booking",         desc: "Your data and payment are protected"    },
          ].map((f) => (
            <div key={f.title} className="flex items-start gap-4 p-5 rounded-2xl bg-muted/40 border">
              <div className="text-3xl">{f.icon}</div>
              <div>
                <h3 className="font-bold text-sm mb-1">{f.title}</h3>
                <p className="text-muted-foreground text-xs">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
