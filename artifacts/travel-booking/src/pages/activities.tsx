import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Compass, MapPin, IndianRupee, Search, ImageOff, ArrowRight } from "lucide-react";

interface Activity {
  id: string;
  title: string;
  description: string;
  price: number;
  imageUrl: string;
  location: string;
  category: string;
  includes?: string[];
  excludes?: string[];
  highlights?: string[];
  gallery?: string[];
}

const DEMO_ACTIVITIES: Activity[] = [
  {
    id: "demo-sky-celebration",
    title: "Sky Celebration Private Jet Experience",
    description:
      "Private jet celebration experience for birthdays, anniversaries, and special occasions. Includes decoration, cake cutting, snacks, and premium service.",
    price: 650000,
    imageUrl: "https://images.unsplash.com/photo-1540962351504-03099e0a754b?w=800&q=80",
    location: "Delhi / Hyderabad / Bangalore",
    category: "Luxury",
    includes: [
      "Private jet access",
      "In-flight decoration",
      "Cake cutting ceremony",
      "Premium snacks & beverages",
      "Professional photography",
      "Personalized cabin crew service",
    ],
    excludes: [
      "Airport transfers",
      "Additional food orders",
      "Extra guests beyond package limit",
      "Personal expenses",
    ],
    highlights: [
      "Up to 2 hours of flying time",
      "Available in Delhi, Hyderabad & Bangalore",
      "Ideal for birthdays, anniversaries & proposals",
      "Luxury interior setup",
      "Dedicated cabin crew",
    ],
    gallery: [
      "https://images.unsplash.com/photo-1566801440738-25a0d7a76c08?w=800&q=80",
      "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=800&q=80",
      "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=800&q=80",
      "https://images.unsplash.com/photo-1464207687429-7505649dae38?w=800&q=80",
    ],
  },
];

function loadActivities(): Activity[] {
  try {
    const stored = localStorage.getItem("activities");
    if (stored === null) {
      localStorage.setItem("activities", JSON.stringify(DEMO_ACTIVITIES));
      return DEMO_ACTIVITIES;
    }
    const parsed: Activity[] = JSON.parse(stored);
    let patched = false;
    const updated = parsed.map((a) => {
      const demo = DEMO_ACTIVITIES.find((d) => d.id === a.id);
      if (demo && !a.gallery?.length && demo.gallery?.length) {
        patched = true;
        return { ...a, gallery: demo.gallery };
      }
      return a;
    });
    if (patched) {
      localStorage.setItem("activities", JSON.stringify(updated));
      return updated;
    }
    return parsed;
  } catch {
    return DEMO_ACTIVITIES;
  }
}

export default function Activities() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  useEffect(() => { setActivities(loadActivities()); }, []);

  const categories = Array.from(new Set(activities.map((a) => a.category).filter(Boolean)));

  const filtered = activities.filter((a) => {
    const matchSearch =
      a.title.toLowerCase().includes(search.toLowerCase()) ||
      a.location.toLowerCase().includes(search.toLowerCase()) ||
      a.description.toLowerCase().includes(search.toLowerCase());
    const matchCat = !categoryFilter || a.category === categoryFilter;
    return matchSearch && matchCat;
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      {/* Hero */}
      <div className="bg-gradient-to-br from-teal-600 to-teal-800 text-white py-14 px-4">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-white/20 rounded-full px-4 py-1.5 text-sm font-medium mb-4">
            <Compass className="w-4 h-4" /> Experiences &amp; Activities
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-3">Discover Amazing Activities</h1>
          <p className="text-teal-100 text-lg max-w-xl mx-auto">
            From adventure sports to cultural tours — find experiences that make every trip unforgettable.
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {/* Search + Filter bar */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search activities, locations…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-white"
            />
          </div>
          {categories.length > 0 && (
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-md border border-input bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-w-[160px]"
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}
        </div>

        {/* Results count */}
        {activities.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Showing <span className="font-semibold text-foreground">{filtered.length}</span> activit{filtered.length === 1 ? "y" : "ies"}
          </p>
        )}

        {/* Empty state */}
        {activities.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-20 h-20 rounded-full bg-teal-50 flex items-center justify-center mb-5">
              <Compass className="w-10 h-10 text-teal-400" />
            </div>
            <h2 className="text-xl font-semibold text-gray-700 mb-2">No Activities Yet</h2>
            <p className="text-muted-foreground max-w-sm">
              We're adding exciting experiences soon. Check back shortly!
            </p>
          </div>
        )}

        {/* No results from filter */}
        {activities.length > 0 && filtered.length === 0 && (
          <div className="text-center py-16">
            <p className="text-muted-foreground text-lg">No activities match your search.</p>
            <Button variant="ghost" className="mt-3" onClick={() => { setSearch(""); setCategoryFilter(""); }}>
              Clear filters
            </Button>
          </div>
        )}

        {/* Activity cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((activity) => (
            <Link key={activity.id} href={`/activities/${activity.id}`}>
              <div className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-all border border-gray-100 flex flex-col cursor-pointer group">
                {/* Image */}
                <div className="relative h-48 bg-gray-100 overflow-hidden">
                  {activity.imageUrl ? (
                    <img
                      src={activity.imageUrl}
                      alt={activity.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageOff className="w-8 h-8 text-muted-foreground/30" />
                    </div>
                  )}
                  {activity.category && (
                    <Badge className="absolute top-3 left-3 bg-teal-600 text-white text-xs font-medium">
                      {activity.category}
                    </Badge>
                  )}
                </div>

                {/* Content */}
                <div className="flex flex-col flex-1 p-4 gap-2">
                  <h3 className="font-bold text-base leading-snug group-hover:text-teal-700 transition-colors">
                    {activity.title}
                  </h3>

                  {activity.location && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="w-3 h-3 shrink-0 text-teal-500" />
                      {activity.location}
                    </p>
                  )}

                  {activity.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2 flex-1">
                      {activity.description}
                    </p>
                  )}

                  <div className="flex items-center justify-between mt-auto pt-3 border-t border-gray-100">
                    <div className="flex items-center gap-0.5 text-primary font-bold text-lg">
                      <IndianRupee className="w-4 h-4" />
                      {activity.price.toLocaleString("en-IN")}
                      <span className="text-xs font-normal text-muted-foreground ml-1">/ person</span>
                    </div>
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-teal-600 group-hover:gap-2 transition-all">
                      View Details <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
