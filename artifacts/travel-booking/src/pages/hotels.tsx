import { APP_NAME } from "@/lib/app-config";
import { useState } from "react";
import { useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AutocompleteInput } from "@/components/autocomplete-input";
import { hotelCitySuggestions } from "@/lib/city-suggestions";
import { PageHero } from "@/components/page-hero";
import { Building2, Calendar, Users, Search, MapPin, Star, Wifi, Car, Utensils, Waves } from "lucide-react";

const POPULAR_CITIES = [
  { name: "Goa", image: "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=400&q=80", hotels: "240+ hotels" },
  { name: "Mumbai", image: "https://images.unsplash.com/photo-1566552881560-0be862a7c445?w=400&q=80", hotels: "530+ hotels" },
  { name: "Delhi", image: "https://images.unsplash.com/photo-1545569341-9eb8b30979d9?w=400&q=80", hotels: "620+ hotels" },
  { name: "Hyderabad", image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&q=80", hotels: "380+ hotels" },
  { name: "Bangalore", image: "https://images.unsplash.com/photo-1596176530529-78163a4f7af2?w=400&q=80", hotels: "450+ hotels" },
  { name: "Chennai", image: "https://images.unsplash.com/photo-1582510003544-4d00b7f74220?w=400&q=80", hotels: "290+ hotels" },
];

export default function Hotels() {
  const [, setLocation] = useLocation();
  const today = new Date().toISOString().split("T")[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];

  const [city,     setCity]     = useState("");
  const [checkin,  setCheckin]  = useState(today);
  const [checkout, setCheckout] = useState(tomorrow);
  const [guests,   setGuests]   = useState("1");
  const [error,    setError]    = useState("");

  function handleSearch() {
    if (!city.trim()) { setError("Please enter a city"); return; }
    if (!checkin)     { setError("Please select check-in date"); return; }
    if (!checkout)    { setError("Please select check-out date"); return; }
    if (checkout <= checkin) { setError("Check-out must be after check-in"); return; }
    setError("");
    setLocation(`/hotels/results?city=${encodeURIComponent(city)}&checkin=${checkin}&checkout=${checkout}&guests=${guests}`);
  }

  function quickSearch(city: string) {
    setCity(city);
    setLocation(`/hotels/results?city=${encodeURIComponent(city)}&checkin=${checkin}&checkout=${checkout}&guests=${guests}`);
  }

  return (
    <Layout>
      <PageHero
        tab="hotels"
        centered
        badge={
          <div className="inline-flex items-center gap-2 bg-white/15 border border-white/25 rounded-full px-4 py-1.5 text-sm font-medium backdrop-blur-sm">
            <Building2 className="w-4 h-4" /> 10,000+ Hotels across India
          </div>
        }
        headline={<>Find Your Perfect<br /><span className="text-yellow-300">Hotel Stay</span></>}
        sub="Best prices guaranteed · Free cancellation on most hotels"
      >
        <Card className="max-w-4xl mx-auto shadow-2xl border-0 bg-white/95 backdrop-blur-md supports-[backdrop-filter]:bg-white/88">
          <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="lg:col-span-1">
                  <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">CITY / LOCATION</Label>
                  <div className="flex items-center gap-2 border rounded-xl px-3 h-12 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-all">
                    <MapPin className="w-4 h-4 text-blue-600 shrink-0" />
                    <AutocompleteInput
                      placeholder="Where are you going?"
                      suggestions={hotelCitySuggestions}
                      value={city}
                      onChange={setCity}
                      className="border-0 p-0 h-8 font-semibold text-slate-800 focus-visible:ring-0 flex-1"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">CHECK-IN</Label>
                  <div className="flex items-center gap-2 border rounded-xl px-3 h-12 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-all">
                    <Calendar className="w-4 h-4 text-blue-600 shrink-0" />
                    <Input
                      type="date" value={checkin} min={today}
                      onChange={(e) => setCheckin(e.target.value)}
                      className="border-0 p-0 h-8 font-semibold text-slate-800 focus-visible:ring-0"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">CHECK-OUT</Label>
                  <div className="flex items-center gap-2 border rounded-xl px-3 h-12 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-all">
                    <Calendar className="w-4 h-4 text-blue-600 shrink-0" />
                    <Input
                      type="date" value={checkout} min={checkin || today}
                      onChange={(e) => setCheckout(e.target.value)}
                      className="border-0 p-0 h-8 font-semibold text-slate-800 focus-visible:ring-0"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">GUESTS</Label>
                  <div className="flex items-center gap-2 border rounded-xl px-3 h-12 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500 transition-all">
                    <Users className="w-4 h-4 text-blue-600 shrink-0" />
                    <select
                      value={guests}
                      onChange={(e) => setGuests(e.target.value)}
                      className="border-0 p-0 h-8 font-semibold text-slate-800 bg-transparent focus:outline-none flex-1"
                    >
                      {[1,2,3,4,5,6].map((n) => (
                        <option key={n} value={String(n)}>{n} Guest{n > 1 ? "s" : ""}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {error && <p className="text-red-500 text-sm mt-3">{error}</p>}

              <Button
                onClick={handleSearch}
                className="w-full mt-4 h-12 bg-blue-600 hover:bg-blue-700 text-white font-bold text-base rounded-xl gap-2"
              >
                <Search className="w-5 h-5" /> SEARCH HOTELS
              </Button>
          </CardContent>
        </Card>
      </PageHero>

      {/* Popular Cities */}
      <section className="container mx-auto px-4 py-14">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-extrabold text-slate-900 mb-1">Popular Destinations</h2>
          <p className="text-muted-foreground text-sm">Top cities picked by travellers this season</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {POPULAR_CITIES.map((c) => (
            <button
              key={c.name}
              onClick={() => quickSearch(c.name)}
              className="group relative overflow-hidden rounded-2xl aspect-[3/4] shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
            >
              <img
                src={c.image}
                alt={c.name}
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                onError={(e) => { (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=400&q=80"; }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-3 text-left">
                <p className="text-white font-bold text-sm">{c.name}</p>
                <p className="text-white/70 text-[11px]">{c.hotels}</p>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Why Dream Fly Global */}
      <section className="bg-blue-50 border-y">
        <div className="container mx-auto px-4 py-12">
          <h2 className="text-2xl font-extrabold text-slate-900 text-center mb-8">Why Book with {APP_NAME}?</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: Star,     title: "Best Price Guarantee",  desc: "Find a lower price? We'll match it." },
              { icon: Wifi,     title: "Free WiFi Included",    desc: "Most hotels offer complimentary WiFi." },
              { icon: Waves,    title: "Pool & Spa Hotels",     desc: "Filter for luxury amenities instantly." },
              { icon: Car,      title: "Free Parking",          desc: "Hundreds of hotels with free parking." },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-4 bg-white rounded-2xl p-5 shadow-sm">
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-bold text-slate-900 text-sm">{title}</p>
                  <p className="text-muted-foreground text-xs mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </Layout>
  );
}
