import { useQuery } from "@tanstack/react-query";

export interface FareOption {
  fareId:     string;
  cabinClass: string;
  cabinLabel: string;
  totalFare:  number;
  seatsLeft:  number;
}

export interface LiveFlight {
  id: number;
  airline: string;
  airlineCode?: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departureTime: string;
  arrivalTime: string;
  duration: string;
  price: number;
  class: string;
  seatsAvailable: number;
  stops?: number;
  stopsLabel?: string;
  status?: string;
  fareOptions?: FareOption[];
  resultIndex?: string;  // TripJack result identifier — required for fareQuote/SSR/book
}

interface LiveSearchResult {
  flights: LiveFlight[];
  total: number;
  source: "tripjack" | "scheduled";
  fallbackMessage?: string;
  error?: string;
  traceId?: string;      // TripJack search session token — required for fareQuote/SSR/book
}

export interface FlightSearchOptions {
  tripType?   : string;
  routeInfos? : Array<{ from: string; to: string; date: string }>;
  paxInfo?    : { ADULT: number; CHILD: number; INFANT: number };
  cabinClass? : string;
  returnDate? : string;
  adults?     : number;
  children?   : number;
  infants?    : number;
}

async function fetchLiveFlights(
  from: string,
  to: string,
  date: string,
  opts: FlightSearchOptions = {},
): Promise<LiveSearchResult> {
  const { tripType, routeInfos, paxInfo, cabinClass, returnDate, adults, children, infants } = opts;

  // Build paxInfo: prefer explicit paxInfo object, else build from individual counts
  const resolvedPax = paxInfo || (
    (adults !== undefined || children !== undefined || infants !== undefined)
      ? { ADULT: adults ?? 1, CHILD: children ?? 0, INFANT: infants ?? 0 }
      : undefined
  );

  const body: Record<string, unknown> = { from, to, date };
  if (tripType)      body.tripType   = tripType;
  if (routeInfos)    body.routeInfos = routeInfos;
  if (resolvedPax)   body.paxInfo    = resolvedPax;
  if (cabinClass)    body.cabinClass = cabinClass;
  if (returnDate)    body.returnDate = returnDate;

  const res = await fetch("/api/flights", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody?.error || `Server error ${res.status}`);
  }

  return res.json() as Promise<LiveSearchResult>;
}

export function useFlightSearch(
  from: string,
  to: string,
  date: string,
  opts: FlightSearchOptions = {},
) {
  const enabled = Boolean(from.trim() && to.trim());

  const query = useQuery<LiveSearchResult, Error>({
    queryKey: [
      "flights-live-search",
      from, to, date,
      opts.tripType, opts.returnDate,
      JSON.stringify(opts.routeInfos),
      JSON.stringify(opts.paxInfo),
      opts.cabinClass,
      opts.adults, opts.children, opts.infants,
    ],
    queryFn: () => fetchLiveFlights(from, to, date, opts),
    enabled,
    retry: 1,
    staleTime: 2 * 60 * 1000,
  });

  return {
    flights: query.data?.flights ?? [],
    isLoading: query.isLoading,
    isLiveError: query.isError,
    isNoResults: !query.isLoading && !query.isError && (query.data?.flights.length ?? 0) === 0,
    usingFallback: false,
    errorMessage: query.error?.message,
    source: query.data?.source ?? null,
    fallbackMessage: query.data?.fallbackMessage,
    traceId: query.data?.traceId ?? "",
    refetch: query.refetch,
  };
}
