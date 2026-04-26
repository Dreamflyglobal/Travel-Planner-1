import axios from "axios";

export interface Hotel {
  id: number;
  name: string;
  city: string;
  location: string;
  stars: number;
  rating: number;
  ratingCount: number;
  ratingLabel: string;
  pricePerNight: number;
  amenities: string[];
  images: string[];
  description: string;
}

const HOTEL_API_URL = "https://jsonplaceholder.typicode.com/users";

const FALLBACK_IMAGES = [
  "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80",
  "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=800&q=80",
  "https://images.unsplash.com/photo-1455587734955-081b22074882?w=800&q=80",
  "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800&q=80",
  "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800&q=80",
  "https://images.unsplash.com/photo-1444201983204-c43cbd584d93?w=800&q=80",
];

const AMENITY_POOL = [
  "AC", "WiFi", "Parking", "TV", "Restaurant",
  "Room Service", "Gym", "Pool", "Spa", "Bar",
];

const RATING_LABELS: Record<number, string> = {
  3: "Good",
  4: "Very Good",
  5: "Excellent",
};

function pickAmenities(seed: number): string[] {
  const count = 4 + (seed % 4);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(AMENITY_POOL[(seed + i) % AMENITY_POOL.length]);
  }
  return Array.from(new Set(out));
}

function mapToHotel(user: any): Hotel {
  const id = Number(user.id) || 0;
  const stars = 3 + (id % 3);
  const pricePerNight = 1500 + (id * 350) % 8500;
  const ratingCount = 100 + (id * 137) % 2500;
  const rating = Math.round((3.5 + (id % 15) / 10) * 10) / 10;

  return {
    id,
    name: user.company?.name ?? user.name ?? `Hotel ${id}`,
    city: user.address?.city ?? "Unknown",
    location: user.address?.street ?? "City Centre",
    stars,
    rating,
    ratingCount,
    ratingLabel: RATING_LABELS[stars] ?? "Good",
    pricePerNight,
    amenities: pickAmenities(id),
    images: [
      FALLBACK_IMAGES[id % FALLBACK_IMAGES.length],
      FALLBACK_IMAGES[(id + 1) % FALLBACK_IMAGES.length],
      FALLBACK_IMAGES[(id + 2) % FALLBACK_IMAGES.length],
    ],
    description:
      user.company?.catchPhrase ??
      `Comfortable stay at ${user.company?.name ?? user.name ?? "this property"}.`,
  };
}

export async function fetchHotels(): Promise<Hotel[]> {
  const { data } = await axios.get(HOTEL_API_URL);
  if (!Array.isArray(data)) {
    throw new Error("Unexpected hotels response");
  }
  return data.map(mapToHotel);
}
