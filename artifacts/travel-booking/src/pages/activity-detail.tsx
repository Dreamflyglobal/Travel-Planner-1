import { useEffect, useState } from "react";
import { useRoute, Link } from "wouter";
import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  MapPin, IndianRupee, ArrowLeft, CheckCircle2, XCircle,
  Sparkles, ImageOff, Compass, Star, Images,
} from "lucide-react";

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

const DEMO_GALLERY: Record<string, string[]> = {
  "demo-sky-celebration": [
    "https://images.unsplash.com/photo-1566801440738-25a0d7a76c08?w=800&q=80",
    "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=800&q=80",
    "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=800&q=80",
    "https://images.unsplash.com/photo-1464207687429-7505649dae38?w=800&q=80",
  ],
};

function loadActivities(): Activity[] {
  try {
    const raw = JSON.parse(localStorage.getItem("activities") ?? "[]") as Activity[];
    let patched = false;
    const updated = raw.map((a) => {
      if (!a.gallery?.length && DEMO_GALLERY[a.id]) {
        patched = true;
        return { ...a, gallery: DEMO_GALLERY[a.id] };
      }
      return a;
    });
    if (patched) localStorage.setItem("activities", JSON.stringify(updated));
    return updated;
  } catch {
    return [];
  }
}

export default function ActivityDetail() {
  const { toast } = useToast();
  const [, params] = useRoute("/activities/:id");
  const [activity, setActivity] = useState<Activity | null | undefined>(undefined);
  const [selectedImage, setSelectedImage] = useState<string>("");

  useEffect(() => {
    const all = loadActivities();
    const found = all.find((a) => a.id === params?.id);
    setActivity(found ?? null);
    if (found) setSelectedImage(found.imageUrl || "");
  }, [params?.id]);

  function handleBookNow() {
    if (!activity) return;
    toast({
      title: "Booking Confirmed!",
      description: `Your booking for "${activity.title}" has been received. Our team will contact you shortly.`,
      duration: 5000,
    });
  }

  if (activity === undefined) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="flex items-center justify-center py-32 text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (activity === null) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="flex flex-col items-center justify-center py-32 text-center px-4">
          <Compass className="w-14 h-14 text-muted-foreground/30 mb-4" />
          <h2 className="text-2xl font-bold mb-2">Activity Not Found</h2>
          <p className="text-muted-foreground mb-6">This activity may have been removed or the link is incorrect.</p>
          <Link href="/activities">
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="w-4 h-4" /> Back to Activities
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const includes   = activity.includes   ?? [];
  const excludes   = activity.excludes   ?? [];
  const highlights = activity.highlights ?? [];
  const gallery    = activity.gallery    ?? [];

  const allImages = [activity.imageUrl, ...gallery].filter(Boolean);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      {/* Back nav */}
      <div className="max-w-6xl mx-auto px-4 pt-5">
        <Link href="/activities">
          <button className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Activities
          </button>
        </Link>
      </div>

      {/* Hero image */}
      <div className="max-w-6xl mx-auto px-4 mt-4">
        <div className="relative w-full h-64 sm:h-80 md:h-[420px] rounded-2xl overflow-hidden bg-gray-200 shadow-md">
          {selectedImage ? (
            <img
              key={selectedImage}
              src={selectedImage}
              alt={activity.title}
              className="w-full h-full object-cover transition-opacity duration-300"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ImageOff className="w-12 h-12 text-muted-foreground/30" />
            </div>
          )}
          {activity.category && (
            <Badge className="absolute top-4 left-4 bg-teal-600 text-white text-sm font-medium px-3 py-1">
              {activity.category}
            </Badge>
          )}
          {allImages.length > 1 && (
            <div className="absolute bottom-3 right-4 bg-black/50 text-white text-xs font-medium rounded-full px-2.5 py-1 flex items-center gap-1">
              <Images className="w-3 h-3" /> {allImages.length} photos
            </div>
          )}
        </div>

        {/* Thumbnail strip */}
        {allImages.length > 1 && (
          <div className="flex gap-2 mt-3 overflow-x-auto pb-1 scrollbar-thin">
            {allImages.map((img, i) => (
              <button
                key={i}
                onClick={() => setSelectedImage(img)}
                className={`shrink-0 w-20 h-14 sm:w-24 sm:h-16 rounded-lg overflow-hidden border-2 transition-all ${
                  selectedImage === img
                    ? "border-teal-500 ring-2 ring-teal-300 opacity-100"
                    : "border-transparent opacity-70 hover:opacity-100"
                }`}
              >
                <img
                  src={img}
                  alt={`Photo ${i + 1}`}
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main content */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Left — details */}
          <div className="lg:col-span-2 space-y-8">

            {/* Title + location */}
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold leading-tight mb-2">{activity.title}</h1>
              {activity.location && (
                <p className="flex items-center gap-1.5 text-muted-foreground">
                  <MapPin className="w-4 h-4 text-teal-500 shrink-0" />
                  {activity.location}
                </p>
              )}
            </div>

            {/* Highlights */}
            {highlights.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Star className="w-5 h-5 text-amber-500" /> Highlights
                </h2>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {highlights.map((h, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-700 bg-amber-50 rounded-lg px-3 py-2">
                      <Sparkles className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      {h}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Description */}
            {activity.description && (
              <section>
                <h2 className="text-lg font-semibold mb-2">About this Experience</h2>
                <p className="text-gray-600 leading-relaxed whitespace-pre-line">{activity.description}</p>
              </section>
            )}

            {/* Includes / Excludes */}
            {(includes.length > 0 || excludes.length > 0) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {includes.length > 0 && (
                  <section className="bg-green-50 rounded-xl p-4">
                    <h2 className="text-base font-semibold mb-3 flex items-center gap-2 text-green-800">
                      <CheckCircle2 className="w-5 h-5" /> What's Included
                    </h2>
                    <ul className="space-y-2">
                      {includes.map((item, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                          <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                {excludes.length > 0 && (
                  <section className="bg-red-50 rounded-xl p-4">
                    <h2 className="text-base font-semibold mb-3 flex items-center gap-2 text-red-800">
                      <XCircle className="w-5 h-5" /> Not Included
                    </h2>
                    <ul className="space-y-2">
                      {excludes.map((item, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                          <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            )}

            {/* Gallery grid */}
            {gallery.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Images className="w-5 h-5 text-teal-600" /> Photo Gallery
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {gallery.map((img, i) => (
                    <button
                      key={i}
                      onClick={() => { setSelectedImage(img); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                      className="aspect-video rounded-xl overflow-hidden bg-gray-100 group relative"
                    >
                      <img
                        src={img}
                        alt={`Gallery ${i + 1}`}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors rounded-xl" />
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Right — sticky booking card */}
          <div className="lg:col-span-1">
            <div className="sticky top-6 bg-white rounded-2xl shadow-lg border border-gray-100 p-6 space-y-5">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Price per person</p>
                <div className="flex items-end gap-1">
                  <IndianRupee className="w-6 h-6 text-primary mb-0.5" />
                  <span className="text-3xl font-bold text-primary">
                    {activity.price.toLocaleString("en-IN")}
                  </span>
                </div>
              </div>

              {activity.location && (
                <div className="flex items-start gap-2 text-sm text-muted-foreground border-t pt-4">
                  <MapPin className="w-4 h-4 text-teal-500 shrink-0 mt-0.5" />
                  <span>{activity.location}</span>
                </div>
              )}

              {highlights.length > 0 && (
                <ul className="space-y-1.5 border-t pt-4">
                  {highlights.slice(0, 3).map((h, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                      {h}
                    </li>
                  ))}
                </ul>
              )}

              <Button
                className="w-full bg-teal-600 hover:bg-teal-700 text-white text-base py-5 rounded-xl"
                onClick={handleBookNow}
              >
                Book Now
              </Button>

              <p className="text-xs text-center text-muted-foreground">
                No payment now — our team will reach out to confirm your booking.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
