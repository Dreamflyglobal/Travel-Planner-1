import { useState, useEffect } from 'react';
import { useListFlights, useListBuses, useListHotels, useListPackages, useGetFlight, useGetBus, useGetHotel, useGetPackage, useListBookings } from "@workspace/api-client-react";
import { mockFlights, mockBuses, mockHotels, mockPackages, mockDestinations, mockDeals, mockStats, mockBookings } from './mock-data';
import { MOCK_BUSES } from '../pages/bus-results';

// Normalize a MOCK_BUSES entry (from bus-results.tsx) to match mock-data.ts bus shape
function normalizeMockBus(b: (typeof MOCK_BUSES)[number]) {
  return {
    id:             b.id,
    operator:       b.operator,
    busNumber:      `${b.operator.split(" ")[0].toUpperCase()}-${b.id}`,
    origin:         b.from,
    destination:    b.to,
    departureTime:  b.departure,
    arrivalTime:    b.arrival,
    price:          b.price,
    seatsAvailable: b.seatsAvailable,
    busType:        b.busType,
    amenities:      b.amenities,
    duration:       b.duration,
    rating:         b.rating,
    boardingPoints: b.boardingPoints,
    droppingPoints: b.droppingPoints,
    totalSeats:     b.totalSeats,
  };
}

// Global state to track if backend is available
let backendAvailable: boolean | null = null;

async function checkBackend(): Promise<boolean> {
  if (backendAvailable !== null) {
    return backendAvailable;
  }
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1000);

    const apiBase = (import.meta.env.VITE_API_BASE_URL as string) ?? "";
    const response = await fetch(`${apiBase}/api/healthz`, {
      method: 'GET',
      signal: controller.signal,
    });
      clearTimeout(timeoutId);
    backendAvailable = response.ok;
    
    return backendAvailable;
  } catch (error) {
    backendAvailable = false;
    return false;
  }
}

// Custom hook for flights with fallback
export function useFlightsWithFallback() {
  const [useMock, setUseMock] = useState(true);
  const apiQuery = useListFlights();

  useEffect(() => {
    checkBackend().then(available => setUseMock(!available));
  }, []);

  return {
    data: useMock ? mockFlights : apiQuery.data,
    isLoading: useMock ? false : apiQuery.isLoading,
    error: useMock ? null : apiQuery.error,
    usingMockData: useMock,
  };
}

// Custom hook for buses with fallback
export function useBusesWithFallback() {
  const [useMock, setUseMock] = useState(true);
  const apiQuery = useListBuses();

  useEffect(() => {
    checkBackend().then(available => setUseMock(!available));
  }, []);

  return {
    data: useMock ? mockBuses : apiQuery.data,
    isLoading: useMock ? false : apiQuery.isLoading,
    error: useMock ? null : apiQuery.error,
    usingMockData: useMock,
  };
}

// Custom hook for hotels with fallback
export function useHotelsWithFallback() {
  const [useMock, setUseMock] = useState(true);
  const apiQuery = useListHotels();

  useEffect(() => {
    checkBackend().then(available => setUseMock(!available));
  }, []);

  return {
    data: useMock ? mockHotels : apiQuery.data,
    isLoading: useMock ? false : apiQuery.isLoading,
    error: useMock ? null : apiQuery.error,
    usingMockData: useMock,
  };
}

// Custom hook for packages with fallback
export function usePackagesWithFallback() {
  const [useMock, setUseMock] = useState(true);
  const apiQuery = useListPackages();

  useEffect(() => {
    checkBackend().then(available => setUseMock(!available));
  }, []);

  return {
    data: useMock ? mockPackages : apiQuery.data,
    isLoading: useMock ? false : apiQuery.isLoading,
    error: useMock ? null : apiQuery.error,
    usingMockData: useMock,
  };
}

// Custom hook for destinations with fallback
export function useDestinationsWithFallback() {
  const [useMock, setUseMock] = useState(true);

  useEffect(() => {
    checkBackend().then(available => setUseMock(!available));
  }, []);

  return {
    data: mockDestinations, // Always use mock for now since we don't have this API hook
    isLoading: false,
    error: null,
    usingMockData: true,
  };
}

// Custom hook for deals with fallback
export function useDealsWithFallback() {
  const [useMock, setUseMock] = useState(true);

  useEffect(() => {
    checkBackend().then(available => setUseMock(!available));
  }, []);

  return {
    data: mockDeals, // Always use mock for now since we don't have this API hook
    isLoading: false,
    error: null,
    usingMockData: true,
  };
}

// Custom hook for stats with fallback
export function useStatsWithFallback() {
  const [useMock, setUseMock] = useState(true);

  useEffect(() => {
    checkBackend().then(available => setUseMock(!available));
  }, []);
  return {
    data: mockStats, // Always use mock for now since we don't have this API hook
    isLoading: false,
    error: null,
    usingMockData: true,
  };
}

// Custom hook for flight detail with fallback
export function useFlightDetailWithFallback(id: number) {
  const [useMock, setUseMock] = useState(true);
  
  useEffect(() => {
    checkBackend().then(available => setUseMock(!available));
  }, []);

  // Only call API hook if not using mock
  const apiQuery = useGetFlight(id, {
    query: { enabled: !useMock && !!id, queryKey: [`/api/flights/${id}`] }
  });

  // Find mock flight by ID
  const mockFlight = mockFlights.find(f => f.id === id);

  return {
    data: useMock ? mockFlight : apiQuery.data,
    isLoading: useMock ? false : apiQuery.isLoading,
    error: useMock ? null : apiQuery.error,
    usingMockData: useMock,
  };
}

// Custom hook for bus detail with fallback
export function useBusDetailWithFallback(id: number) {
  const [useMock, setUseMock] = useState(true);
  
  useEffect(() => {
    checkBackend().then(available => setUseMock(!available));
  }, []);

  const apiQuery = useGetBus(id, {
    query: { enabled: !useMock && !!id, queryKey: [`/api/buses/${id}`] }
  });

  const mockBus = mockBuses.find(b => b.id === id)
    ?? (() => {
      const r = MOCK_BUSES.find(b => b.id === id);
      return r ? normalizeMockBus(r) : undefined;
    })();

  return {
    data: useMock ? mockBus : apiQuery.data,
    isLoading: useMock ? false : apiQuery.isLoading,
    error: useMock ? null : apiQuery.error,
    usingMockData: useMock,
  };
}

// Custom hook for hotel detail with fallback
export function useHotelDetailWithFallback(id: number) {
  const [useMock, setUseMock] = useState(true);
  
  useEffect(() => {
    checkBackend().then(available => setUseMock(!available));
  }, []);

  const apiQuery = useGetHotel(id, {
    query: { enabled: !useMock && !!id, queryKey: [`/api/hotels/${id}`] }
  });

  const mockHotel = mockHotels.find(h => h.id === id);

  return {
    data: useMock ? mockHotel : apiQuery.data,
    isLoading: useMock ? false : apiQuery.isLoading,
    error: useMock ? null : apiQuery.error,
    usingMockData: useMock,
  };
}

// Custom hook for package detail with fallback
export function usePackageDetailWithFallback(id: number) {
  const [useMock, setUseMock] = useState(true);
  
  useEffect(() => {
    checkBackend().then(available => setUseMock(!available));
  }, []);

  const apiQuery = useGetPackage(id, {
    query: { enabled: !useMock && !!id, queryKey: [`/api/packages/${id}`] }
  });
  const mockPackage = mockPackages.find(p => p.id === id);

  return {
    data: useMock ? mockPackage : apiQuery.data,
    isLoading: useMock ? false : apiQuery.isLoading,
    error: useMock ? null : apiQuery.error,
    usingMockData: useMock,
  };
}

// Custom hook for bookings with fallback
export function useBookingsWithFallback() {
  // Always use API query - MSW will intercept and return mock data if backend is unavailable
  const apiQuery = useListBookings();

  return {
    data: apiQuery.data,
    isLoading: apiQuery.isLoading,
    error: apiQuery.error,
    usingMockData: false, // MSW handles mocking transparently
    refetch: apiQuery.refetch,
  };
}
