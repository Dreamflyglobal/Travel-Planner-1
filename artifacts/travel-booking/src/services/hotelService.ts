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
  imageUrl?: string;
  images?: string[];
  photos?: string[];
  description: string;
  source?: string;
  rateKey?: string | null;
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

export async function fetchHotels(
  city?: string,
  checkin?: string,
  checkout?: string,
): Promise<Hotel[]> {
  const params = new URLSearchParams();
  if (city)     params.set("city",     city);
  if (checkin)  params.set("checkin",  checkin);
  if (checkout) params.set("checkout", checkout);

  const url = `${API_BASE}/api/hotels/live-search?${params.toString()}`;

  const { data } = await axios.get<{ hotels: Hotel[]; total: number; source: string; city: string }>(url);

  if (!data || !Array.isArray(data.hotels)) {
    throw new Error("Unexpected hotels response shape");
  }

  return data.hotels;
}
