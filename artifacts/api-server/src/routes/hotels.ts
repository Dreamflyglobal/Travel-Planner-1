import { Router, type IRouter } from "express";
import { ilike, eq } from "drizzle-orm";
import { createHash } from "crypto";
import { db, hotelsTable, apiKeysTable } from "@workspace/db";
import {
  SearchHotelsQueryParams,
  SearchHotelsResponse,
  ListHotelsResponse,
  GetHotelParams,
  GetHotelResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

// ── Curated synthetic hotel data per city ─────────────────────────────────
const CITY_HOTELS: Record<string, any[]> = {
  mumbai: [
    { name: "Taj Mahal Palace", location: "Colaba", stars: 5, rating: 4.8, ratingCount: 4120, pricePerNight: 18000, amenities: ["WiFi", "Pool", "Spa", "Restaurant", "Bar", "Gym", "Parking"], imageUrl: "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80", description: "Iconic 5-star heritage hotel overlooking the Gateway of India and Arabian Sea." },
    { name: "The Oberoi Mumbai", location: "Nariman Point", stars: 5, rating: 4.7, ratingCount: 2890, pricePerNight: 14000, amenities: ["WiFi", "Pool", "Spa", "Restaurant", "Gym"], imageUrl: "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=800&q=80", description: "Luxury high-rise hotel with panoramic sea views and world-class dining." },
    { name: "ITC Grand Central", location: "Parel", stars: 5, rating: 4.5, ratingCount: 1750, pricePerNight: 9500, amenities: ["WiFi", "Pool", "Spa", "Restaurant", "Bar", "Gym", "Parking"], imageUrl: "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800&q=80", description: "Elegant 5-star hotel blending Indian heritage with modern luxury." },
    { name: "Trident Mumbai BKC", location: "Bandra Kurla Complex", stars: 5, rating: 4.4, ratingCount: 1320, pricePerNight: 8000, amenities: ["WiFi", "Pool", "Restaurant", "Gym"], imageUrl: "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800&q=80", description: "Contemporary luxury hotel in Mumbai's business district." },
    { name: "Novotel Juhu Beach", location: "Juhu", stars: 4, rating: 4.2, ratingCount: 980, pricePerNight: 5500, amenities: ["WiFi", "Pool", "Restaurant", "Bar", "Gym", "Parking"], imageUrl: "https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=800&q=80", description: "Beachfront 4-star hotel steps from the Arabian Sea." },
    { name: "Fortune Select Exotica", location: "Navi Mumbai", stars: 4, rating: 4.0, ratingCount: 720, pricePerNight: 3800, amenities: ["WiFi", "Pool", "Restaurant", "Gym", "Parking"], imageUrl: "https://images.unsplash.com/photo-1444201983204-c43cbd584d93?w=800&q=80", description: "Modern 4-star property with excellent connectivity to the city." },
    { name: "Hotel Suba Palace", location: "Colaba", stars: 3, rating: 3.9, ratingCount: 540, pricePerNight: 2800, amenities: ["WiFi", "Restaurant", "Parking"], imageUrl: "https://images.unsplash.com/photo-1455587734955-081b22074882?w=800&q=80", description: "Comfortable 3-star hotel in a prime Mumbai location." },
    { name: "The Fern Residency", location: "Andheri East", stars: 3, rating: 3.7, ratingCount: 410, pricePerNight: 2200, amenities: ["WiFi", "Restaurant", "Parking"], imageUrl: "https://images.unsplash.com/photo-1568084680786-a84f91d1153c?w=800&q=80", description: "Eco-certified 3-star hotel near the international airport." },
  ],
  delhi: [
    { name: "The Imperial New Delhi", location: "Janpath, Connaught Place", stars: 5, rating: 4.8, ratingCount: 3650, pricePerNight: 16000, amenities: ["WiFi", "Pool", "Spa", "Restaurant", "Bar", "Gym", "Parking"], imageUrl: "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80", description: "Legendary heritage hotel on Janpath with world-class facilities and colonial grandeur." },
    { name: "Taj Palace New Delhi", location: "Diplomatic Enclave", stars: 5, rating: 4.7, ratingCount: 2900, pricePerNight: 13500, amenities: ["WiFi", "Pool", "Spa", "Restaurant", "Bar", "Gym"], imageUrl: "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=800&q=80", description: "Flagship Taj hotel in Delhi's diplomatic area with extensive gardens." },
    { name: "Leela Palace Chanakyapuri", location: "Chanakyapuri", stars: 5, rating: 4.6, ratingCount: 2100, pricePerNight: 12000, amenities: ["WiFi", "Pool", "Spa", "Restaurant", "Gym", "Parking"], imageUrl: "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800&q=80", description: "Palatial 5-star hotel with Mughal-inspired architecture." },
    { name: "Hyatt Regency Delhi", location: "Bhikaji Cama Place", stars: 5, rating: 4.5, ratingCount: 1780, pricePerNight: 8500, amenities: ["WiFi", "Pool", "Spa", "Restaurant", "Bar", "Gym"], imageUrl: "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800&q=80", description: "Premium 5-star hotel with convention facilities in South Delhi." },
    { name: "Sheraton New Delhi", location: "Saket District Centre", stars: 5, rating: 4.3, ratingCount: 1560, pricePerNight: 7200, amenities: ["WiFi", "Pool", "Restaurant", "Gym", "Parking"], imageUrl: "https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=800&q=80", description: "Modern 5-star hotel with business and leisure facilities." },
    { name: "Radisson Blu Paschim Vihar", location: "Paschim Vihar", stars: 4, rating: 4.2, ratingCount: 1020, pricePerNight: 4500, amenities: ["WiFi", "Pool", "Restaurant", "Bar", "Gym", "Parking"], imageUrl: "https://images.unsplash.com/photo-1444201983204-c43cbd584d93?w=800&q=80", description: "Contemporary 4-star hotel near the metro." },
    { name: "Bloom Hotel Sunder Nagar", location: "Sunder Nagar", stars: 3, rating: 4.0, ratingCount: 680, pricePerNight: 2600, amenities: ["WiFi", "Restaurant"], imageUrl: "https://images.unsplash.com/photo-1455587734955-081b22074882?w=800&q=80", description: "Boutique 3-star hotel in a leafy Delhi neighbourhood." },
    { name: "Hotel Broadway", location: "Daryaganj", stars: 3, rating: 3.6, ratingCount: 420, pricePerNight: 1800, amenities: ["WiFi", "Restaurant", "Parking"], imageUrl: "https://images.unsplash.com/photo-1568084680786-a84f91d1153c?w=800&q=80", description: "Budget-friendly 3-star hotel near Old Delhi attractions." },
  ],
  bangalore: [
    { name: "The Leela Palace Bengaluru", location: "Old Airport Road", stars: 5, rating: 4.7, ratingCount: 2750, pricePerNight: 12000, amenities: ["WiFi", "Pool", "Spa", "Restaurant", "Bar", "Gym", "Parking"], imageUrl: "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80", description: "Bangalore's finest 5-star palace hotel with opulent décor and lush gardens." },
    { name: "JW Marriott Bengaluru", location: "Vittal Mallya Road", stars: 5, rating: 4.6, ratingCount: 2100, pricePerNight: 10000, amenities: ["WiFi", "Pool", "Spa", "Restaurant", "Bar", "Gym"], imageUrl: "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=800&q=80", description: "Elegant urban retreat in the heart of Bangalore's upscale district." },
    { name: "ITC Windsor Bengaluru", location: "Golf Course Road", stars: 5, rating: 4.5, ratingCount: 1680, pricePerNight: 8500, amenities: ["WiFi", "Pool", "Spa", "Restaurant", "Gym"], imageUrl: "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800&q=80", description: "Royal 5-star manor with impeccable service and heritage charm." },
    { name: "Novotel Bengaluru Techpark", location: "Whitefield", stars: 4, rating: 4.3, ratingCount: 1240, pricePerNight: 5200, amenities: ["WiFi", "Pool", "Restaurant", "Gym", "Parking"], imageUrl: "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800&q=80", description: "Contemporary 4-star hotel next to the tech corridor." },
    { name: "Radisson Blu Atria Bengaluru", location: "Palace Road", stars: 4, rating: 4.2, ratingCount: 980, pricePerNight: 4200, amenities: ["WiFi", "Pool", "Restaurant", "Bar", "Gym"], imageUrl: "https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=800&q=80", description: "Upscale 4-star hotel offering stunning city views." },
    { name: "Ibis Bengaluru City Centre", location: "Hosur Road", stars: 3, rating: 3.9, ratingCount: 720, pricePerNight: 2400, amenities: ["WiFi", "Restaurant", "Parking"], imageUrl: "https://images.unsplash.com/photo-1444201983204-c43cbd584d93?w=800&q=80", description: "Smart 3-star hotel with great connectivity." },
  ],
  goa: [
    { name: "Taj Exotica Resort & Spa", location: "Benaulim Beach, South Goa", stars: 5, rating: 4.8, ratingCount: 3100, pricePerNight: 22000, amenities: ["WiFi", "Pool", "Spa", "Restaurant", "Bar", "Gym", "Beach Access"], imageUrl: "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800&q=80", description: "Sprawling beachfront resort with private villas, a lagoon pool, and Goan charm." },
    { name: "Park Hyatt Goa Resort", location: "Arossim Beach, South Goa", stars: 5, rating: 4.7, ratingCount: 2560, pricePerNight: 18000, amenities: ["WiFi", "Pool", "Spa", "Restaurant", "Bar", "Gym", "Beach Access"], imageUrl: "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80", description: "Portuguese colonial architecture meets contemporary luxury on a pristine beach." },
    { name: "Grand Hyatt Goa", location: "Bambolim Beach, North Goa", stars: 5, rating: 4.6, ratingCount: 1980, pricePerNight: 14000, amenities: ["WiFi", "Pool", "Spa", "Restaurant", "Bar", "Gym"], imageUrl: "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=800&q=80", description: "Sprawling resort with an immense free-form pool and panoramic sea views." },
    { name: "Aloft Goa Candolim", location: "Candolim, North Goa", stars: 4, rating: 4.3, ratingCount: 1120, pricePerNight: 6500, amenities: ["WiFi", "Pool", "Restaurant", "Bar"], imageUrl: "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800&q=80", description: "Trendy 4-star hotel steps from North Goa's most popular beach." },
    { name: "Leoney Resort Goa", location: "Candolim, North Goa", stars: 4, rating: 4.1, ratingCount: 820, pricePerNight: 4800, amenities: ["WiFi", "Pool", "Restaurant", "Bar", "Beach Access"], imageUrl: "https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=800&q=80", description: "Cosy resort-style property near the beach with all essentials." },
    { name: "Varca Le Palms Beach Resort", location: "Varca Beach, South Goa", stars: 4, rating: 4.0, ratingCount: 640, pricePerNight: 3500, amenities: ["WiFi", "Pool", "Restaurant", "Beach Access"], imageUrl: "https://images.unsplash.com/photo-1444201983204-c43cbd584d93?w=800&q=80", description: "Affordable beach resort with excellent amenities in quiet South Goa." },
    { name: "Sea Shell Goa Hotel", location: "Calangute, North Goa", stars: 3, rating: 3.8, ratingCount: 450, pricePerNight: 2000, amenities: ["WiFi", "Restaurant", "Parking"], imageUrl: "https://images.unsplash.com/photo-1455587734955-081b22074882?w=800&q=80", description: "Clean, comfortable budget hotel in the heart of Calangute." },
  ],
  hyderabad: [
    { name: "Park Hyatt Hyderabad", location: "Banjara Hills", stars: 5, rating: 4.7, ratingCount: 2450, pricePerNight: 11000, amenities: ["WiFi", "Pool", "Spa", "Restaurant", "Bar", "Gym", "Parking"], imageUrl: "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80", description: "Stunning 5-star hotel with panoramic views of Banjara Hills." },
    { name: "Taj Falaknuma Palace", location: "Engine Bowli", stars: 5, rating: 4.9, ratingCount: 1820, pricePerNight: 28000, amenities: ["WiFi", "Pool", "Spa", "Restaurant", "Bar", "Gym"], imageUrl: "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=800&q=80", description: "A fairy-tale palace perched atop a hill — one of India's most iconic heritage hotels." },
    { name: "ITC Kohenur Hyderabad", location: "Madhapur, HITEC City", stars: 5, rating: 4.6, ratingCount: 1560, pricePerNight: 9500, amenities: ["WiFi", "Pool", "Spa", "Restaurant", "Bar", "Gym"], imageUrl: "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800&q=80", description: "Luxury landmark hotel in the heart of Hyderabad's tech hub." },
    { name: "Novotel Hyderabad Convention Centre", location: "HITEC City", stars: 5, rating: 4.4, ratingCount: 1230, pricePerNight: 7200, amenities: ["WiFi", "Pool", "Restaurant", "Gym", "Parking"], imageUrl: "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800&q=80", description: "5-star hotel adjoining the city's largest convention centre." },
    { name: "Mercure Hyderabad KCP", location: "Begumpet", stars: 4, rating: 4.1, ratingCount: 890, pricePerNight: 4500, amenities: ["WiFi", "Restaurant", "Bar", "Parking"], imageUrl: "https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=800&q=80", description: "Contemporary 4-star hotel centrally located for business and leisure." },
    { name: "Golkonda Hotel", location: "Masab Tank", stars: 4, rating: 4.0, ratingCount: 720, pricePerNight: 3200, amenities: ["WiFi", "Pool", "Restaurant", "Parking"], imageUrl: "https://images.unsplash.com/photo-1444201983204-c43cbd584d93?w=800&q=80", description: "Well-established hotel with a heritage swimming pool and great Hyderabadi cuisine." },
  ],
  chennai: [
    { name: "ITC Grand Chola Chennai", location: "Mount Road", stars: 5, rating: 4.7, ratingCount: 2680, pricePerNight: 13000, amenities: ["WiFi", "Pool", "Spa", "Restaurant", "Bar", "Gym", "Parking"], imageUrl: "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80", description: "India's largest luxury hotel inspired by the grandeur of the Chola dynasty." },
    { name: "The Leela Palace Chennai", location: "MRC Nagar", stars: 5, rating: 4.6, ratingCount: 1940, pricePerNight: 11000, amenities: ["WiFi", "Pool", "Spa", "Restaurant", "Gym"], imageUrl: "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=800&q=80", description: "Luxurious beachside hotel with stunning Bay of Bengal views." },
    { name: "Radisson Blu Chennai City Centre", location: "Nelson Manickam Road", stars: 5, rating: 4.4, ratingCount: 1450, pricePerNight: 7500, amenities: ["WiFi", "Pool", "Restaurant", "Bar", "Gym", "Parking"], imageUrl: "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800&q=80", description: "Premium 5-star hotel in central Chennai with versatile event spaces." },
    { name: "The Raintree Anna Salai", location: "Anna Salai", stars: 4, rating: 4.2, ratingCount: 980, pricePerNight: 5000, amenities: ["WiFi", "Pool", "Restaurant", "Gym", "Parking"], imageUrl: "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800&q=80", description: "Eco-certified 4-star hotel on Chennai's arterial road." },
    { name: "Lemon Tree Premier Chennai", location: "Ulsoor", stars: 4, rating: 4.0, ratingCount: 720, pricePerNight: 3800, amenities: ["WiFi", "Pool", "Restaurant", "Bar", "Gym"], imageUrl: "https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=800&q=80", description: "Vibrant 4-star hotel with a rooftop pool." },
  ],
  kolkata: [
    { name: "ITC Royal Bengal", location: "Park Circus", stars: 5, rating: 4.7, ratingCount: 2120, pricePerNight: 12000, amenities: ["WiFi", "Pool", "Spa", "Restaurant", "Bar", "Gym", "Parking"], imageUrl: "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80", description: "The tallest hotel in India, offering spectacular city panoramas and luxury facilities." },
    { name: "The Oberoi Grand Kolkata", location: "Jawaharlal Nehru Road", stars: 5, rating: 4.8, ratingCount: 1980, pricePerNight: 14000, amenities: ["WiFi", "Pool", "Spa", "Restaurant", "Bar", "Gym"], imageUrl: "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=800&q=80", description: "Iconic Victorian-era hotel at the heart of Kolkata's heritage district." },
    { name: "Taj Bengal Kolkata", location: "Alipore", stars: 5, rating: 4.6, ratingCount: 1560, pricePerNight: 10500, amenities: ["WiFi", "Pool", "Spa", "Restaurant", "Gym"], imageUrl: "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800&q=80", description: "Iconic Taj property in leafy Alipore offering authentic Bengal charm." },
    { name: "Hyatt Regency Kolkata", location: "Salt Lake City", stars: 5, rating: 4.4, ratingCount: 1120, pricePerNight: 7000, amenities: ["WiFi", "Pool", "Restaurant", "Gym", "Parking"], imageUrl: "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800&q=80", description: "Contemporary luxury hotel near Kolkata's IT district." },
    { name: "Lemon Tree Hotel New Town", location: "Rajarhat, New Town", stars: 4, rating: 4.1, ratingCount: 780, pricePerNight: 3500, amenities: ["WiFi", "Pool", "Restaurant", "Gym", "Parking"], imageUrl: "https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=800&q=80", description: "Modern 4-star hotel near the airport and tech parks." },
  ],
  jaipur: [
    { name: "Rambagh Palace", location: "Bhawani Singh Road", stars: 5, rating: 4.9, ratingCount: 3200, pricePerNight: 35000, amenities: ["WiFi", "Pool", "Spa", "Restaurant", "Bar", "Gym", "Parking"], imageUrl: "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80", description: "The jewel of Jaipur — a former maharaja's palace turned iconic luxury hotel." },
    { name: "The Oberoi Rajvilas", location: "Babaji Ki Kothi", stars: 5, rating: 4.8, ratingCount: 2100, pricePerNight: 28000, amenities: ["WiFi", "Pool", "Spa", "Restaurant", "Gym"], imageUrl: "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=800&q=80", description: "Lavish tented and villa resort set within 32 acres of lush gardens." },
    { name: "ITC Rajputana Jaipur", location: "Palace Road", stars: 5, rating: 4.6, ratingCount: 1650, pricePerNight: 10000, amenities: ["WiFi", "Pool", "Spa", "Restaurant", "Bar", "Gym", "Parking"], imageUrl: "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800&q=80", description: "Rajputana-style luxury hotel celebrating the heritage of Rajasthan." },
    { name: "Trident Jaipur", location: "Amber Fort Road", stars: 5, rating: 4.4, ratingCount: 1200, pricePerNight: 7500, amenities: ["WiFi", "Pool", "Restaurant", "Gym", "Parking"], imageUrl: "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800&q=80", description: "Serene hotel with views of Jal Mahal on Man Sagar Lake." },
    { name: "Samode Haveli", location: "Gangapole", stars: 4, rating: 4.5, ratingCount: 890, pricePerNight: 6000, amenities: ["WiFi", "Pool", "Restaurant", "Spa"], imageUrl: "https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=800&q=80", description: "250-year-old haveli transformed into a boutique heritage hotel." },
    { name: "Pearl Palace Heritage", location: "Hathroi Fort", stars: 3, rating: 4.3, ratingCount: 2100, pricePerNight: 2800, amenities: ["WiFi", "Restaurant"], imageUrl: "https://images.unsplash.com/photo-1444201983204-c43cbd584d93?w=800&q=80", description: "Award-winning budget boutique hotel with rooftop dining." },
  ],
  kochi: [
    { name: "Taj Malabar Resort & Spa", location: "Willingdon Island", stars: 5, rating: 4.7, ratingCount: 1980, pricePerNight: 13000, amenities: ["WiFi", "Pool", "Spa", "Restaurant", "Bar", "Gym"], imageUrl: "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80", description: "Iconic resort on Willingdon Island with spectacular backwater views." },
    { name: "Le Meridien Kochi", location: "NH 47 Bypass, Maradu", stars: 5, rating: 4.5, ratingCount: 1450, pricePerNight: 8500, amenities: ["WiFi", "Pool", "Spa", "Restaurant", "Gym", "Parking"], imageUrl: "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=800&q=80", description: "Sophisticated hotel with panoramic backwater and lagoon views." },
    { name: "Holiday Inn Kochi Airport", location: "Nedumbassery", stars: 4, rating: 4.2, ratingCount: 980, pricePerNight: 4500, amenities: ["WiFi", "Pool", "Restaurant", "Gym", "Parking"], imageUrl: "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800&q=80", description: "Convenient 4-star hotel adjacent to Cochin International Airport." },
  ],
  pune: [
    { name: "JW Marriott Pune", location: "Senapati Bapat Road", stars: 5, rating: 4.7, ratingCount: 2300, pricePerNight: 11000, amenities: ["WiFi", "Pool", "Spa", "Restaurant", "Bar", "Gym", "Parking"], imageUrl: "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80", description: "Sophisticated 5-star hotel in central Pune with award-winning dining." },
    { name: "Conrad Pune", location: "Mangaldas Road", stars: 5, rating: 4.6, ratingCount: 1780, pricePerNight: 9500, amenities: ["WiFi", "Pool", "Spa", "Restaurant", "Bar", "Gym"], imageUrl: "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=800&q=80", description: "Premium 5-star hotel steps from heritage Pune." },
    { name: "The Westin Pune Koregaon Park", location: "Koregaon Park", stars: 5, rating: 4.5, ratingCount: 1520, pricePerNight: 8200, amenities: ["WiFi", "Pool", "Spa", "Restaurant", "Gym", "Parking"], imageUrl: "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800&q=80", description: "Contemporary 5-star hotel in Pune's trendiest district." },
    { name: "Lemon Tree Hotel Pune", location: "Baner Road", stars: 4, rating: 4.2, ratingCount: 920, pricePerNight: 3800, amenities: ["WiFi", "Pool", "Restaurant", "Gym", "Parking"], imageUrl: "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800&q=80", description: "Cheerful 4-star hotel with lively décor and great service." },
  ],
  ahmedabad: [
    { name: "Hyatt Regency Ahmedabad", location: "Ashram Road", stars: 5, rating: 4.5, ratingCount: 1650, pricePerNight: 8500, amenities: ["WiFi", "Pool", "Spa", "Restaurant", "Gym", "Parking"], imageUrl: "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80", description: "Upscale Hyatt property alongside the Sabarmati River." },
    { name: "The House of MG", location: "Lal Darwaja", stars: 4, rating: 4.6, ratingCount: 1100, pricePerNight: 6500, amenities: ["WiFi", "Restaurant", "Spa"], imageUrl: "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=800&q=80", description: "Heritage boutique hotel in a restored 1920s mansion." },
    { name: "Courtyard by Marriott", location: "SG Highway", stars: 4, rating: 4.3, ratingCount: 980, pricePerNight: 4500, amenities: ["WiFi", "Pool", "Restaurant", "Gym", "Parking"], imageUrl: "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800&q=80", description: "Modern 4-star hotel in Ahmedabad's commercial corridor." },
  ],
};

// Alias lookups
const CITY_ALIASES: Record<string, string> = {
  "new delhi": "delhi", "bengaluru": "bangalore", "bombay": "mumbai",
  "calcutta": "kolkata", "madras": "chennai", "cochin": "kochi",
};

function getCityHotels(city: string): any[] | null {
  const key = city.toLowerCase().trim();
  const canonical = CITY_ALIASES[key] || key;
  return CITY_HOTELS[canonical] || null;
}

// ── Hotelbeds destination code map ───────────────────────────────────────────
const HOTELBEDS_DEST_CODES: Record<string, string> = {
  hyderabad: "HYD", mumbai: "BOM", bombay: "BOM",
  delhi: "DEL", "new delhi": "DEL",
  bangalore: "BLR", bengaluru: "BLR",
  goa: "GOA",
  chennai: "MAA", madras: "MAA",
  kolkata: "CCU", calcutta: "CCU",
  jaipur: "JAI",
  kochi: "COK", cochin: "COK",
  pune: "PNQ",
  ahmedabad: "AMD",
  agra: "AGR",
  varanasi: "VNS",
  udaipur: "UDR",
  amritsar: "ATQ",
};

function hotelbedsDestCode(city: string): string | null {
  return HOTELBEDS_DEST_CODES[city.toLowerCase().trim()] ?? null;
}

function hotelbedsSignature(apiKey: string, secret: string): string {
  const ts = Math.floor(Date.now() / 1000).toString();
  return createHash("sha256").update(apiKey + secret + ts).digest("hex");
}

// ── GET /api/hotels/live-search ─────────────────────────────────────────────
router.get("/hotels/live-search", async (req, res): Promise<void> => {
  const city     = (req.query.city     as string | undefined) || "";
  const checkin  = (req.query.checkin  as string | undefined) || "";
  const checkout = (req.query.checkout as string | undefined) || "";

  if (!city.trim()) {
    res.status(400).json({ error: "City is required for hotel search." });
    return;
  }

  const keysRows  = await db.select().from(apiKeysTable).limit(1);
  const keysRow   = keysRows[0] ?? {};
  const hbApiKey  = (keysRow as any).hotelApiKey  || process.env.HOTELBEDS_API_KEY  || "";
  const hbSecret  = (keysRow as any).hotelApiSecret|| process.env.HOTELBEDS_SECRET   || "";

  console.log(`[hotels/live-search] city="${city}" checkin="${checkin}" checkout="${checkout}" hotelbeds=${hbApiKey ? "set" : "not set"}`);

  // ── HotelBeds: always call when credentials are present ──────────────────
  if (hbApiKey && hbSecret) {
    const destCode = hotelbedsDestCode(city);
    const checkIn  = checkin  || new Date(Date.now() + 7  * 86400000).toISOString().slice(0, 10);
    const checkOut = checkout || new Date(Date.now() + 9  * 86400000).toISOString().slice(0, 10);

    if (!destCode) {
      console.log(`HotelBeds Error: No destination code mapped for city "${city}". Add it to HOTELBEDS_DEST_CODES.`);
      res.json({ hotels: [], total: 0, source: "hotelbeds", city, message: `No HotelBeds destination code for "${city}".` });
      return;
    }

    const requestBody = {
      stay: { checkIn, checkOut },
      occupancies: [{ rooms: 1, adults: 2, children: 0 }],
      destination: { code: destCode },
    };

    console.log("Calling HotelBeds API...", { city, destCode, checkIn, checkOut, endpoint: "https://api.test.hotelbeds.com/hotel-api/1.0/hotels" });

    try {
      const hbRes = await fetch("https://api.test.hotelbeds.com/hotel-api/1.0/hotels", {
        method: "POST",
        headers: {
          "Api-key":       hbApiKey,
          "X-Signature":   hotelbedsSignature(hbApiKey, hbSecret),
          "Content-Type":  "application/json",
          "Accept":        "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(15_000),
      });

      const hbBody = await hbRes.json().catch(() => null);
      console.log("HotelBeds Response:", JSON.stringify(hbBody).slice(0, 1200));

      if (!hbRes.ok) {
        console.log("HotelBeds Error:", { status: hbRes.status, body: hbBody });
        res.json({ hotels: [], total: 0, source: "hotelbeds", city, message: `HotelBeds API error ${hbRes.status}` });
        return;
      }

      const rawHotels: any[] = hbBody?.hotels?.hotels ?? [];
      console.log(`HotelBeds: ${rawHotels.length} hotels returned for ${city} (${destCode})`);

      if (rawHotels.length === 0) {
        res.json({ hotels: [], total: 0, source: "hotelbeds", city, message: `HotelBeds has no inventory for "${city}" (${destCode}) in the test environment for ${checkIn}→${checkOut}.` });
        return;
      }

      const FALLBACK_IMAGES = [
        "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80",
        "https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=800&q=80",
        "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800&q=80",
        "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800&q=80",
        "https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=800&q=80",
        "https://images.unsplash.com/photo-1444201983204-c43cbd584d93?w=800&q=80",
        "https://images.unsplash.com/photo-1455587734955-081b22074882?w=800&q=80",
      ];

      const mapped = rawHotels.slice(0, 20).map((h: any, idx: number) => {
        const stars = parseInt(h.categoryCode) || 3;
        const firstRate   = h.rooms?.[0]?.rates?.[0];
        const netPrice    = parseFloat(firstRate?.net || "0");
        const pricePerNight = netPrice > 0 ? Math.round(netPrice * 84) : (3500 + idx * 500);
        const boardName: string = (firstRate?.boardName || "").toUpperCase();
        const amenities: string[] = ["WiFi", "AC"];
        if (boardName.includes("BREAKFAST") || boardName.includes("BB")) amenities.push("Breakfast");
        if (boardName.includes("HALF") || boardName.includes("HB"))      amenities.push("Half Board");
        if (boardName.includes("FULL") || boardName.includes("FB"))      amenities.push("Full Board");
        if (stars >= 4) amenities.push("Restaurant", "Room Service");
        if (stars >= 5) amenities.push("Spa", "Concierge");
        if (stars >= 3) amenities.push("Parking");
        const imageUrl    = FALLBACK_IMAGES[idx % FALLBACK_IMAGES.length];
        const baseRating  = Math.min(5, (stars - 1) * 0.5 + 2.5);
        const rating      = parseFloat((baseRating + (idx % 5) * 0.1).toFixed(1));
        const ratingLabel = rating >= 4.5 ? "Exceptional" : rating >= 4.0 ? "Excellent" : rating >= 3.5 ? "Very Good" : "Good";
        return {
          id: h.code || (10000 + idx),
          name: h.name || `Hotel ${idx + 1}`,
          city,
          location: h.zoneName || h.destinationName || city,
          stars,
          rating,
          ratingCount: 150 + idx * 45,
          ratingLabel,
          pricePerNight,
          amenities,
          imageUrl,
          photos: [imageUrl],
          description: `${h.name} — a ${h.categoryName || `${stars}-star`} property in ${h.zoneName || city}.`,
        };
      });

      console.log(`[hotels/live-search] HotelBeds OK: ${mapped.length} hotels for ${city}`);
      res.json({ hotels: mapped, total: mapped.length, source: "hotelbeds", city });
      return;

    } catch (err: any) {
      console.log("HotelBeds Error:", err?.message ?? err);
      res.json({ hotels: [], total: 0, source: "hotelbeds", city, message: `HotelBeds request failed: ${err?.message}` });
      return;
    }
  }

  // ── No HotelBeds credentials configured ──────────────────────────────────
  console.log("HotelBeds Error: HOTELBEDS_API_KEY and HOTELBEDS_SECRET are not configured.");
  res.json({ hotels: [], total: 0, source: "hotelbeds", city, message: "HotelBeds credentials not configured." });
});

router.get("/hotels/search", async (req, res): Promise<void> => {
  const parsed = SearchHotelsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { location, stars } = parsed.data;

  let query = db.select().from(hotelsTable).$dynamic();

  const conditions = [];
  if (location) {
    conditions.push(ilike(hotelsTable.location, `%${location}%`));
  }
  if (stars) {
    conditions.push(eq(hotelsTable.stars, stars));
  }

  if (conditions.length > 0) {
    const { and } = await import("drizzle-orm");
    query = query.where(and(...conditions));
  }

  const hotels = await query;
  const mapped = hotels.map((h) => ({
    ...h,
    rating: Number(h.rating),
    pricePerNight: Number(h.pricePerNight),
    imageUrl: h.imageUrl ?? undefined,
    address: h.address ?? undefined,
    description: h.description ?? undefined,
  }));
  res.json(SearchHotelsResponse.parse(mapped));
});

router.get("/hotels", async (_req, res): Promise<void> => {
  const hotels = await db.select().from(hotelsTable).orderBy(hotelsTable.id);
  const mapped = hotels.map((h) => ({
    ...h,
    rating: Number(h.rating),
    pricePerNight: Number(h.pricePerNight),
    imageUrl: h.imageUrl ?? undefined,
    address: h.address ?? undefined,
    description: h.description ?? undefined,
  }));
  res.json(ListHotelsResponse.parse(mapped));
});

router.get("/hotels/:id", async (req, res): Promise<void> => {
  const params = GetHotelParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [hotel] = await db
    .select()
    .from(hotelsTable)
    .where(eq(hotelsTable.id, params.data.id));

  if (!hotel) {
    res.status(404).json({ error: "Hotel not found" });
    return;
  }

  res.json(
    GetHotelResponse.parse({
      ...hotel,
      rating: Number(hotel.rating),
      pricePerNight: Number(hotel.pricePerNight),
      imageUrl: hotel.imageUrl ?? undefined,
      address: hotel.address ?? undefined,
      description: hotel.description ?? undefined,
    })
  );
});

export default router;
