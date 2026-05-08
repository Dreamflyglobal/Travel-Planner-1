export interface Bus {
  id: number;
  name: string;
  operator: string;
  from: string;
  to: string;
  departure: string;
  arrival: string;
  duration: string;
  price: number;
  busType: string;
  totalSeats: number;
  seatsAvailable: number;
  amenities: string[];
  rating: number;
  boardingPoints: string[];
  droppingPoints: string[];
}

// City-name aliases — maps display names / abbreviations to the canonical
// lowercase key used by the backend live-search generator.
const CITY_ALIASES: Record<string, string> = {
  bengaluru:   "bangalore",
  blr:         "bangalore",
  bombay:      "mumbai",
  bom:         "mumbai",
  hyd:         "hyderabad",
  del:         "delhi",
  "new delhi": "delhi",
  calcutta:    "kolkata",
  ccu:         "kolkata",
  madras:      "chennai",
  maa:         "chennai",
  cochin:      "kochi",
  cok:         "kochi",
};

function normaliseCity(raw: string): string {
  const key = raw.split(",")[0].trim().toLowerCase();
  return CITY_ALIASES[key] ?? key;
}

export async function fetchBuses(from: string, to: string): Promise<Bus[]> {
  const normFrom = normaliseCity(from);
  const normTo   = normaliseCity(to);

  if (!normFrom || !normTo) {
    throw new Error("Both 'from' and 'to' cities are required");
  }

  const url = `/api/buses/live-search?from=${encodeURIComponent(normFrom)}&to=${encodeURIComponent(normTo)}`;
  const res = await fetch(url);

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any)?.error || `Bus search failed (${res.status})`);
  }

  const data = await res.json();

  if (!Array.isArray(data?.buses)) {
    throw new Error("Unexpected response format from bus search API");
  }

  // Strict route validation — only keep buses that exactly match the searched route.
  // The backend already guarantees this, but we double-check on the frontend
  // to prevent any stale data or edge-case mismatches from leaking through.
  const filtered = (data.buses as Bus[]).filter((b) => {
    const bFrom = normaliseCity(b.from);
    const bTo   = normaliseCity(b.to);
    return bFrom === normFrom && bTo === normTo;
  });

  return filtered;
}
