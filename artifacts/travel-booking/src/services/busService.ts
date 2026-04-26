import axios from "axios";

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

const BUS_API_URL = "https://jsonplaceholder.typicode.com/posts";

const OPERATORS = [
  "Orange Travels", "VRL Travels", "SRS Travels", "Kaleswari Travels",
  "Greenline", "Diamond Travels", "Royal Cruiser", "Neeta Tours",
];

const BUS_TYPES = ["AC Sleeper", "AC Semi-Sleeper", "Non-AC Sleeper", "Volvo Multi-Axle"];

const ROUTES: Array<[string, string]> = [
  ["Hyderabad", "Vijayawada"],
  ["Bengaluru", "Chennai"],
  ["Mumbai", "Pune"],
  ["Delhi", "Jaipur"],
  ["Kolkata", "Bhubaneswar"],
];

const AMENITY_POOL = ["AC", "Wifi", "Charging", "Water Bottle", "Blanket", "TV"];

function fmtTime(hour: number, min: number): string {
  const h = ((hour % 12) || 12).toString();
  const m = min.toString().padStart(2, "0");
  return `${h}:${m} ${hour < 12 || hour === 24 ? "AM" : "PM"}`;
}

function pickAmenities(seed: number): string[] {
  const count = 2 + (seed % 4);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(AMENITY_POOL[(seed + i) % AMENITY_POOL.length]);
  }
  return Array.from(new Set(out));
}

function mapToBus(post: any): Bus {
  const id = Number(post.id) || 0;
  const route = ROUTES[id % ROUTES.length];
  const depHour = (18 + (id % 6)) % 24;
  const durHours = 5 + (id % 6);
  const arrHour = (depHour + durHours) % 24;
  const price = 600 + ((id * 137) % 1500);

  return {
    id,
    name: OPERATORS[id % OPERATORS.length],
    operator: OPERATORS[id % OPERATORS.length],
    from: route[0],
    to: route[1],
    departure: fmtTime(depHour, 0),
    arrival: fmtTime(arrHour, 30),
    duration: `${durHours}h 30m`,
    price,
    busType: BUS_TYPES[id % BUS_TYPES.length],
    totalSeats: 40,
    seatsAvailable: 8 + (id % 25),
    amenities: pickAmenities(id),
    rating: Math.round((3.8 + (id % 12) / 10) * 10) / 10,
    boardingPoints: ["Main Bus Stand", "City Centre", "Railway Station"],
    droppingPoints: ["Central Bus Stop", "Town Square", "Highway Junction"],
  };
}

export async function fetchBuses(): Promise<Bus[]> {
  const { data } = await axios.get(BUS_API_URL);
  if (!Array.isArray(data)) {
    throw new Error("Unexpected buses response");
  }
  // jsonplaceholder /posts returns 100 items — cap to 20 for a reasonable list.
  return data.slice(0, 20).map(mapToBus);
}
