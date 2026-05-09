import { Layout } from "@/components/layout";
import { Link, useParams, useLocation } from "wouter";
import { useMarkupContext } from "@/contexts/markup-context";
import { useBusDetailWithFallback } from "@/lib/use-data-with-fallback";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  Bus as BusIcon,
  Clock,
  CheckCircle2,
  ShieldCheck,
  MapPin,
  ArrowRight,
  Wind,
  Wifi,
  BatteryCharging,
  Moon,
  Droplets,
  MonitorPlay,
  Star,
  Users,
  XCircle,
  AlertTriangle,
  Coffee,
  Utensils,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// ── Amenity icon + color mapping ──────────────────────────────────────────────
type AmenityInfo = { icon: React.ComponentType<{ className?: string }>; label: string; color: string; bg: string };
const AMENITY_MAP: Record<string, AmenityInfo> = {
  AC:            { icon: Wind,         label: "Air Conditioned",  color: "text-blue-600",   bg: "bg-blue-50 border-blue-100" },
  Wifi:          { icon: Wifi,         label: "Free WiFi",        color: "text-purple-600", bg: "bg-purple-50 border-purple-100" },
  Charging:      { icon: BatteryCharging, label: "Charging Point",color: "text-green-600",  bg: "bg-green-50 border-green-100" },
  Blanket:       { icon: Moon,         label: "Blanket Provided", color: "text-indigo-600", bg: "bg-indigo-50 border-indigo-100" },
  "Water Bottle":{ icon: Droplets,     label: "Water Bottle",     color: "text-cyan-600",   bg: "bg-cyan-50 border-cyan-100" },
  Entertainment: { icon: MonitorPlay,  label: "Entertainment",    color: "text-pink-600",   bg: "bg-pink-50 border-pink-100" },
  Coffee:        { icon: Coffee,       label: "Coffee",           color: "text-amber-700",  bg: "bg-amber-50 border-amber-100" },
  Snacks:        { icon: Utensils,     label: "Snacks",           color: "text-orange-600", bg: "bg-orange-50 border-orange-100" },
};

function getAmenityInfo(amenity: string): AmenityInfo {
  return (
    AMENITY_MAP[amenity] || {
      icon: CheckCircle2,
      label: amenity,
      color: "text-slate-600",
      bg: "bg-slate-50 border-slate-100",
    }
  );
}

// ── Bus type badge colour ─────────────────────────────────────────────────────
function busTypeBadge(busType: string) {
  const t = busType.toLowerCase();
  if (t.includes("premium"))
    return "bg-violet-100 text-violet-700 border-violet-200";
  if (t.includes("sleeper"))
    return "bg-blue-100 text-blue-700 border-blue-200";
  if (t.includes("semi-sleeper") || t.includes("semi sleeper"))
    return "bg-sky-100 text-sky-700 border-sky-200";
  if (t.includes("ac") && t.includes("seater"))
    return "bg-teal-100 text-teal-700 border-teal-200";
  if (t.includes("non-ac") || t.includes("non ac"))
    return "bg-slate-100 text-slate-600 border-slate-200";
  return "bg-orange-100 text-orange-700 border-orange-200";
}

// ── Cancellation policy rows ──────────────────────────────────────────────────
const CANCEL_POLICY = [
  { timing: "More than 24 hours before",  refund: "75% refund", color: "text-green-600",  icon: CheckCircle2 },
  { timing: "4 – 24 hours before",        refund: "25% refund", color: "text-amber-600",  icon: AlertTriangle },
  { timing: "Less than 4 hours before",   refund: "No refund",  color: "text-red-500",    icon: XCircle },
];

export default function BusDetail() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const busId = parseInt(id || "0", 10);

  const { data: bus, isLoading } = useBusDetailWithFallback(busId);
  const { simpleMarkup } = useMarkupContext();

  const handleBookNow = () => {
    if (!bus) return;
    const params = new URLSearchParams({
      price: bus.price.toString(),
      title: `${bus.origin} to ${bus.destination}`,
    });
    setLocation(`/booking/seat-selection/bus/${bus.id}?${params.toString()}`);
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-12">
          <Skeleton className="h-8 w-32 mb-8" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <Skeleton className="h-64 w-full rounded-xl" />
              <Skeleton className="h-96 w-full rounded-xl" />
            </div>
            <div>
              <Skeleton className="h-96 w-full rounded-xl" />
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (!bus) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-24 text-center">
          <h2 className="text-2xl font-bold mb-4">Bus not found</h2>
          <Button asChild><Link href="/buses">Back to buses</Link></Button>
        </div>
      </Layout>
    );
  }

  const amenities: string[] = bus.amenities || [];
  const boardingPoints: string[] = bus.boardingPoints || [];
  const droppingPoints: string[] = bus.droppingPoints || [];
  const markup = simpleMarkup;
  const displayPrice = bus.price + markup;

  return (
    <Layout>
      {/* ── Hero bar ── */}
      <div className="bg-muted/30 border-b">
        <div className="container mx-auto px-4 py-6">
          <Button variant="ghost" asChild className="mb-4 pl-0 hover:bg-transparent">
            <Link href="/buses" className="text-muted-foreground flex items-center">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to search results
            </Link>
          </Button>

          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <Badge variant="outline" className="bg-background font-bold text-base">{bus.operator}</Badge>
                <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${busTypeBadge(bus.busType)}`}>
                  {bus.busType}
                </span>
                {bus.rating && (
                  <span className="flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full">
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" /> {bus.rating}
                  </span>
                )}
              </div>
              <h1 className="text-3xl md:text-4xl font-extrabold flex items-center flex-wrap gap-3">
                {bus.origin} <BusIcon className="w-6 h-6 text-primary" /> {bus.destination}
              </h1>
              <p className="text-muted-foreground mt-1 text-sm">
                {bus.departureTime} → {bus.arrivalTime} &nbsp;·&nbsp; {bus.duration} journey
              </p>
            </div>
            <div className="text-left md:text-right">
              <p className="text-sm text-muted-foreground font-medium mb-1">Price per seat</p>
              <p className="text-4xl font-extrabold text-primary">₹{displayPrice.toLocaleString("en-IN")}</p>
              <p className="text-xs text-muted-foreground">Taxes &amp; fees included</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* ── Left column ── */}
          <div className="lg:col-span-2 space-y-6">

            {/* Journey Timeline */}
            <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
              <div className="bg-muted/50 px-5 py-3 border-b font-bold flex items-center justify-between text-sm">
                <span>Journey Details</span>
                <span className="text-muted-foreground flex items-center gap-1 font-normal">
                  <Clock className="w-4 h-4" /> {bus.duration} total
                </span>
              </div>
              <div className="p-6 md:p-8">
                <div className="relative flex flex-col justify-between pl-8 border-l-2 border-border ml-4 space-y-12">
                  {/* Departure */}
                  <div className="relative z-10">
                    <div className="absolute -left-[41px] w-6 h-6 rounded-full bg-primary flex items-center justify-center border-4 border-card" />
                    <div>
                      <p className="text-2xl font-bold">{bus.departureTime}</p>
                      <p className="font-semibold text-base flex items-center mt-1">
                        <MapPin className="w-4 h-4 mr-1 text-muted-foreground" /> {bus.origin}
                      </p>
                      {boardingPoints.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {boardingPoints.map((pt) => (
                            <span key={pt} className="text-xs bg-green-50 border border-green-200 text-green-700 px-2 py-0.5 rounded-full font-medium">
                              {pt}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground mt-1.5 italic">Pick one as boarding point at checkout</p>
                    </div>
                  </div>

                  {/* Arrival */}
                  <div className="relative z-10">
                    <div className="absolute -left-[41px] w-6 h-6 rounded-full bg-primary flex items-center justify-center border-4 border-card" />
                    <div>
                      <p className="text-2xl font-bold">{bus.arrivalTime}</p>
                      <p className="font-semibold text-base flex items-center mt-1">
                        <MapPin className="w-4 h-4 mr-1 text-muted-foreground" /> {bus.destination}
                      </p>
                      {droppingPoints.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {droppingPoints.map((pt) => (
                            <span key={pt} className="text-xs bg-red-50 border border-red-200 text-red-700 px-2 py-0.5 rounded-full font-medium">
                              {pt}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground mt-1.5 italic">Pick one as dropping point at checkout</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Boarding Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-card rounded-xl border shadow-sm p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                    <MapPin className="w-4 h-4 text-green-600" />
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase text-green-600 tracking-wide">Boarding Points</p>
                    <p className="text-xs text-muted-foreground">Departure: {bus.departureTime}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {boardingPoints.length > 0 ? boardingPoints.map((pt) => (
                    <div key={pt} className="flex items-center gap-2 text-sm">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                      <span className="font-medium text-slate-800">{pt}</span>
                      <span className="text-muted-foreground text-xs ml-auto">{bus.departureTime}</span>
                    </div>
                  )) : <p className="text-sm text-muted-foreground">Contact operator for boarding points</p>}
                </div>
              </div>

              <div className="bg-card rounded-xl border shadow-sm p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
                    <MapPin className="w-4 h-4 text-red-600" />
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase text-red-600 tracking-wide">Dropping Points</p>
                    <p className="text-xs text-muted-foreground">Arrival: {bus.arrivalTime}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {droppingPoints.length > 0 ? droppingPoints.map((pt) => (
                    <div key={pt} className="flex items-center gap-2 text-sm">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                      <span className="font-medium text-slate-800">{pt}</span>
                      <span className="text-muted-foreground text-xs ml-auto">{bus.arrivalTime}</span>
                    </div>
                  )) : <p className="text-sm text-muted-foreground">Contact operator for dropping points</p>}
                </div>
              </div>
            </div>

            {/* Amenities */}
            <div className="bg-card rounded-xl border shadow-sm p-6">
              <h3 className="font-bold text-lg mb-5 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-primary" /> Bus Amenities
              </h3>
              {amenities.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {amenities.map((amenity) => {
                    const info = getAmenityInfo(amenity);
                    const Icon = info.icon;
                    return (
                      <div key={amenity} className={`flex items-center gap-3 p-3 rounded-lg border ${info.bg}`}>
                        <Icon className={`w-5 h-5 shrink-0 ${info.color}`} />
                        <span className="text-sm font-semibold text-slate-800">{info.label}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">Standard amenities included.</p>
              )}
            </div>

            {/* Cancellation Policy */}
            <div className="bg-card rounded-xl border shadow-sm p-6">
              <h3 className="font-bold text-lg mb-5 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" /> Cancellation Policy
              </h3>
              <div className="divide-y divide-border rounded-lg border overflow-hidden">
                <div className="grid grid-cols-2 bg-muted/50 px-4 py-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  <span>Time Before Departure</span>
                  <span className="text-right">Refund Amount</span>
                </div>
                {CANCEL_POLICY.map(({ timing, refund, color, icon: Icon }) => (
                  <div key={timing} className="grid grid-cols-2 px-4 py-3 text-sm items-center">
                    <span className="text-slate-700">{timing}</span>
                    <div className={`flex items-center gap-1.5 justify-end font-bold ${color}`}>
                      <Icon className="w-4 h-4" /> {refund}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                * Cancellation charges apply as per operator policy. Processing fee (if any) is non-refundable.
              </p>
            </div>

            {/* Rest Stops */}
            {bus.duration && (() => {
              const hrs = parseFloat(bus.duration.replace(/[^0-9.]/g, "")) || 0;
              if (hrs < 6) return null;
              const stops = hrs >= 10 ? 2 : 1;
              return (
                <div className="bg-card rounded-xl border shadow-sm p-6">
                  <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
                    <Coffee className="w-5 h-5 text-amber-600" /> Rest Stops
                  </h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    This is a {bus.duration} journey with approximately {stops} rest stop{stops > 1 ? "s" : ""} for refreshments.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {Array.from({ length: stops }).map((_, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                        <Coffee className="w-4 h-4 text-amber-600" />
                        <span className="font-medium text-amber-800">
                          Rest Stop {stops > 1 ? i + 1 : ""} — ~{Math.round((hrs / (stops + 1)) * (i + 1))} hrs into journey
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Safety note */}
            <div className="bg-muted/30 p-4 rounded-xl flex items-start gap-4">
              <ShieldCheck className="w-6 h-6 text-primary shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-sm mb-1">Safe and Secure Travel</h4>
                <p className="text-sm text-muted-foreground">All our partner operators follow strict safety and hygiene protocols. GPS tracking enabled on all buses.</p>
              </div>
            </div>
          </div>

          {/* ── Right: Book card ── */}
          <div className="lg:col-span-1">
            <div className="sticky top-24">
              <Card>
                <CardHeader>
                  <CardTitle>Book This Bus</CardTitle>
                  <CardDescription>{`${bus.origin} → ${bus.destination}`}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  {/* Price */}
                  <div className="border-t border-b py-4">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm text-muted-foreground">Price per seat</span>
                      <span className="text-2xl font-bold text-primary">₹{displayPrice.toLocaleString("en-IN")}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Taxes and fees included</p>
                  </div>

                  {/* Bus info summary */}
                  <div className="space-y-2.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Operator</span>
                      <span className="font-semibold">{bus.operator}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Bus Type</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${busTypeBadge(bus.busType)}`}>{bus.busType}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Departure</span>
                      <span className="font-semibold">{bus.departureTime}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Arrival</span>
                      <span className="font-semibold">{bus.arrivalTime}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Duration</span>
                      <span className="font-semibold">{bus.duration}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Available Seats</span>
                      <span className="font-semibold text-green-600">{bus.seatsAvailable || 40} seats</span>
                    </div>
                    {bus.rating && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Rating</span>
                        <span className="flex items-center gap-1 font-semibold text-amber-600">
                          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" /> {bus.rating} / 5
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Amenity chips */}
                  {amenities.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {amenities.map((a) => {
                        const info = getAmenityInfo(a);
                        const Icon = info.icon;
                        return (
                          <span key={a} className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${info.bg} ${info.color}`}>
                            <Icon className="w-3 h-3" /> {a}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {/* Book button */}
                  <Button onClick={handleBookNow} className="w-full" size="lg">
                    Select Seats &amp; Book
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>

                  {/* Trust */}
                  <div className="space-y-2 pt-3 border-t">
                    <div className="flex items-center text-xs text-muted-foreground gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                      <span>Instant booking confirmation</span>
                    </div>
                    <div className="flex items-center text-xs text-muted-foreground gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                      <span>Free cancellation up to 24 hrs</span>
                    </div>
                    <div className="flex items-center text-xs text-muted-foreground gap-2">
                      <Users className="w-4 h-4 text-green-500" />
                      <span>24/7 customer support</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

        </div>
      </div>
    </Layout>
  );
}
