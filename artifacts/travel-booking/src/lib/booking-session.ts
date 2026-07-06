export type Passenger = {
  name: string;
  age: string;
  gender: string;
  email: string;
  phone: string;
  dob?: string;
};

export type Guest = {
  name: string;
  age?: string;
  gender?: string;
  email: string;
  phone: string;
};

export type FlightBookingSession = {
  type: "flight";
  flightId: string;
  airline: string;
  flightNum: string;
  from: string;
  to: string;
  date: string;
  departure: string;
  arrival: string;
  duration: string;
  passengers: Passenger[];
  travelers: number;
  selectedSeats: string[];
  extraBaggageKg: number;
  extraBaggageCost: number;
  extraBaggageCode: string;
  rawPrice: number;
  hiddenMarkup: number;
  baseFare: number;
  convFee: number;
  totalBase: number;
  seatAddOnPrice?: number;
  baggageAddOnPrice?: number;
  lockedTotalPrice?: number;
  isAgent: boolean;
  agentSavings: number;
  normalMarkup: number;
  agentId?: string;
  agentEmail?: string;
  cabinClass: string;
  cabinLabel: string;
  tjBookingId: string;
  fareRules?: {
    refundable: boolean;
    cancellationCharge?: number;
    dateChangeCharge?: number;
    note?: string;
  };
};

export type BusBookingSession = {
  type: "bus";
  busId: string;
  busName: string;
  operator: string;
  from: string;
  to: string;
  date: string;
  departure: string;
  arrival: string;
  duration: string;
  busType: string;
  selectedSeats: number[];
  boardingPoint: string;
  droppingPoint: string;
  passengers: Passenger[];
  seatCount: number;
  rawPrice: number;
  hiddenMarkup: number;
  baseFare: number;
  convFee: number;
  totalBase: number;
  isAgent: boolean;
  agentSavings: number;
  normalMarkup: number;
  agentId?: string;
  agentEmail?: string;
};

export type HotelBookingSession = {
  type: "hotel";
  hotelId: string;
  hotelName: string;
  city: string;
  location: string;
  stars: number;
  rating: number;
  image: string;
  checkin: string;
  checkout: string;
  nights: number;
  guests: number;
  roomType: string;
  guest: Guest;
  rawPrice: number;
  markupAmt: number;
  baseFare: number;
  convFee: number;
  totalBase: number;
  isAgent: boolean;
  agentSavings: number;
  normalMarkup: number;
  agentId?: string;
  agentEmail?: string;
  rateKey?: string | null;
  holderFirstName?: string;
  holderLastName?: string;
};

export type BookingSession =
  | FlightBookingSession
  | BusBookingSession
  | HotelBookingSession;

const SESSION_KEY = "ww_pending_booking";

export function saveBookingSession(session: BookingSession): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // ignore storage errors
  }
}

export function loadBookingSession(): BookingSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as BookingSession;
  } catch {
    return null;
  }
}

export function clearBookingSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}
