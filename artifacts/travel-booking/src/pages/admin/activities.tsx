import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/admin-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Search, Compass, IndianRupee, MapPin, ImageOff } from "lucide-react";

const CATEGORIES = [
  "Adventure", "Cultural", "Nature", "Water Sports", "Food & Drink",
  "Wellness", "Sightseeing", "Entertainment", "Luxury",
];

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

const EMPTY_FORM = {
  title: "",
  description: "",
  price: "",
  imageUrl: "",
  location: "",
  category: "",
  includes: "",
  excludes: "",
  highlights: "",
  gallery: "",
};

function loadActivities(): Activity[] {
  try {
    return JSON.parse(localStorage.getItem("activities") ?? "[]");
  } catch {
    return [];
  }
}

function saveActivities(list: Activity[]) {
  localStorage.setItem("activities", JSON.stringify(list));
}

function toArray(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function fromArray(arr: string[] | undefined): string {
  return (arr ?? []).join(", ");
}

export default function AdminActivities() {
  const { toast } = useToast();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Activity | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});

  useEffect(() => { setActivities(loadActivities()); }, []);

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setShowForm(true);
  }

  function openEdit(a: Activity) {
    setEditing(a);
    setForm({
      title: a.title,
      description: a.description,
      price: String(a.price),
      imageUrl: a.imageUrl,
      location: a.location,
      category: a.category,
      includes: fromArray(a.includes),
      excludes: fromArray(a.excludes),
      highlights: fromArray(a.highlights),
      gallery: fromArray(a.gallery),
    });
    setShowForm(true);
  }

  function handleSave() {
    if (!form.title.trim()) {
      toast({ variant: "destructive", title: "Title is required" });
      return;
    }
    const price = parseFloat(form.price);
    if (isNaN(price) || price < 0) {
      toast({ variant: "destructive", title: "Enter a valid price" });
      return;
    }

    const fields = {
      title: form.title.trim(),
      description: form.description.trim(),
      price,
      imageUrl: form.imageUrl.trim(),
      location: form.location.trim(),
      category: form.category,
      includes: toArray(form.includes),
      excludes: toArray(form.excludes),
      highlights: toArray(form.highlights),
      gallery: toArray(form.gallery),
    };

    const next = editing
      ? activities.map((a) => a.id === editing.id ? { ...a, ...fields } : a)
      : [...activities, { id: Date.now().toString(), ...fields }];

    saveActivities(next);
    setActivities(next);
    setShowForm(false);
    toast({ title: editing ? "Activity updated!" : "Activity created!", description: fields.title });
  }

  function confirmDelete() {
    if (!deleting) return;
    const next = activities.filter((a) => a.id !== deleting);
    saveActivities(next);
    setActivities(next);
    setDeleting(null);
    toast({ title: "Activity deleted" });
  }

  const filtered = activities.filter(
    (a) =>
      a.title.toLowerCase().includes(search.toLowerCase()) ||
      a.location.toLowerCase().includes(search.toLowerCase()) ||
      a.category.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <AdminLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Compass className="w-6 h-6 text-teal-600" /> Activities
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Manage activity listings shown on the public Activities page.
            </p>
          </div>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="w-4 h-4" /> Add Activity
          </Button>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search activities…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* List */}
        {filtered.length === 0 ? (
          <div className="text-center py-20 border-2 border-dashed rounded-xl">
            <Compass className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-lg font-medium text-muted-foreground">
              {search ? "No activities match your search" : "No activities yet"}
            </p>
            {!search && (
              <p className="text-sm text-muted-foreground mt-1">Click "Add Activity" to create your first one.</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((a) => (
              <Card key={a.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                <div className="relative h-44 bg-gray-100">
                  {a.imageUrl && !imgErrors[a.id] ? (
                    <img
                      src={a.imageUrl}
                      alt={a.title}
                      className="w-full h-full object-cover"
                      onError={() => setImgErrors((prev) => ({ ...prev, [a.id]: true }))}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageOff className="w-8 h-8 text-muted-foreground/40" />
                    </div>
                  )}
                  {a.category && (
                    <Badge className="absolute top-2 left-2 bg-teal-600 text-white text-xs">
                      {a.category}
                    </Badge>
                  )}
                </div>
                <CardHeader className="pb-2 pt-3 px-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-base leading-tight">{a.title}</h3>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(a)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setDeleting(a.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-1.5">
                  {a.location && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="w-3 h-3 shrink-0" /> {a.location}
                    </p>
                  )}
                  {a.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{a.description}</p>
                  )}
                  <div className="flex items-center gap-1 text-primary font-bold mt-1">
                    <IndianRupee className="w-3.5 h-3.5" />
                    {a.price.toLocaleString("en-IN")}
                    <span className="text-xs font-normal text-muted-foreground">/ person</span>
                  </div>
                  {((a.includes?.length ?? 0) > 0 || (a.highlights?.length ?? 0) > 0) && (
                    <div className="flex gap-2 flex-wrap pt-1">
                      {(a.includes?.length ?? 0) > 0 && (
                        <span className="text-xs bg-green-50 text-green-700 rounded px-1.5 py-0.5">
                          {a.includes!.length} included
                        </span>
                      )}
                      {(a.highlights?.length ?? 0) > 0 && (
                        <span className="text-xs bg-amber-50 text-amber-700 rounded px-1.5 py-0.5">
                          {a.highlights!.length} highlights
                        </span>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Create / Edit Dialog */}
        <Dialog open={showForm} onOpenChange={setShowForm}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Activity" : "Add New Activity"}</DialogTitle>
              <DialogDescription>
                Fill in the details below. Only Title is required. For lists, enter items separated by commas.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="act-title">Title *</Label>
                <Input
                  id="act-title"
                  placeholder="e.g. Bungee Jumping, City Food Tour"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="act-desc">Description</Label>
                <textarea
                  id="act-desc"
                  placeholder="Short description of the activity"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="act-price">Price (₹ per person)</Label>
                  <Input
                    id="act-price"
                    type="number"
                    placeholder="0"
                    min="0"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="act-location">Location</Label>
                  <Input
                    id="act-location"
                    placeholder="e.g. Goa, Manali"
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="act-image">Image URL</Label>
                <Input
                  id="act-image"
                  placeholder="https://example.com/image.jpg"
                  value={form.imageUrl}
                  onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="act-category">Category</Label>
                <select
                  id="act-category"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">— Select Category —</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* Divider */}
              <div className="border-t pt-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                  Detail Page Sections (comma-separated)
                </p>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="act-highlights">Highlights</Label>
                    <textarea
                      id="act-highlights"
                      placeholder="e.g. Luxury interior, Up to 2 hrs flying, Professional photography"
                      value={form.highlights}
                      onChange={(e) => setForm({ ...form, highlights: e.target.value })}
                      className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="act-includes">What's Included</Label>
                    <textarea
                      id="act-includes"
                      placeholder="e.g. Decoration, Cake cutting, Snacks, Photography"
                      value={form.includes}
                      onChange={(e) => setForm({ ...form, includes: e.target.value })}
                      className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="act-excludes">What's Not Included</Label>
                    <textarea
                      id="act-excludes"
                      placeholder="e.g. Airport transfers, Extra food orders, Personal expenses"
                      value={form.excludes}
                      onChange={(e) => setForm({ ...form, excludes: e.target.value })}
                      className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="act-gallery">Gallery Image URLs</Label>
                    <textarea
                      id="act-gallery"
                      placeholder="e.g. https://example.com/img1.jpg, https://example.com/img2.jpg"
                      value={form.gallery}
                      onChange={(e) => setForm({ ...form, gallery: e.target.value })}
                      className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                    />
                    <p className="text-xs text-muted-foreground">Separate multiple URLs with commas. These appear as a photo gallery on the detail page.</p>
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button onClick={handleSave}>{editing ? "Save Changes" : "Create Activity"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <Dialog open={!!deleting} onOpenChange={() => setDeleting(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Activity</DialogTitle>
              <DialogDescription>
                Are you sure? This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
              <Button variant="destructive" onClick={confirmDelete}>Delete</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
