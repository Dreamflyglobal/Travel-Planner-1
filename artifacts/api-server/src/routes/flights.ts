import { Router, type IRouter } from "express";
import { logger } from "../lib/logger.js";
import { ilike, eq } from "drizzle-orm";
import { db, flightsTable } from "@workspace/db";
import {
  SearchFlightsQueryParams,
  SearchFlightsResponse,
  ListFlightsResponse,
  GetFlightParams,
  GetFlightResponse,
} from "@workspace/api-zod";
import { getTripJackApiKey, getTripJackHeaders, TRIPJACK_BASE } from "../lib/tripjack-auth.js";

const router: IRouter = Router();

// ── City name → IATA code lookup ──────────────────────────────────────────
const CITY_TO_IATA: Record<string, string> = {
  delhi: "DEL", "new delhi": "DEL",
  mumbai: "BOM", bombay: "BOM",
  bangalore: "BLR", bengaluru: "BLR",
  chennai: "MAA", madras: "MAA",
  kolkata: "CCU", calcutta: "CCU",
  hyderabad: "HYD",
  goa: "GOI",
  kochi: "COK", cochin: "COK",
  jaipur: "JAI",
  pune: "PNQ",
  ahmedabad: "AMD",
  lucknow: "LKO",
  varanasi: "VNS",
  amritsar: "ATQ",
  nagpur: "NAG",
  indore: "IDR",
  bhopal: "BHO",
  srinagar: "SXR",
  leh: "IXL",
  patna: "PAT",
  ranchi: "IXR",
  bhubaneswar: "BBI",
  visakhapatnam: "VTZ", vizag: "VTZ",
  dubai: "DXB",
  singapore: "SIN",
  bangkok: "BKK",
  london: "LHR",
  "new york": "JFK",
  "abu dhabi": "AUH",
  "kuala lumpur": "KUL",
  colombo: "CMB",
  kathmandu: "KTM",
  coimbatore: "CJB",
  tiruchirappalli: "TRZ", trichy: "TRZ",
  madurai: "IXM",
  mangalore: "IXE",
  vadodara: "BDQ",
  surat: "STV",
  chandigarh: "IXC",
  vijayawada: "VGA",
  rajkot: "RAJ",
  jodhpur: "JDH",
  raipur: "RPR",
  dehradun: "DED",
  udaipur: "UDR",
  agra: "AGR",
  hubli: "HBX",
  jammu: "IXJ",
  dibrugarh: "DIB",
  bagdogra: "IXB",
  port_blair: "IXZ", "port blair": "IXZ",
  tirupati: "TIR",
  aurangabad: "IXU",
};

const CANONICAL: Record<string, string> = {
  DEL: "Delhi", BOM: "Mumbai", BLR: "Bangalore", MAA: "Chennai",
  CCU: "Kolkata", HYD: "Hyderabad", GOI: "Goa", COK: "Kochi",
  JAI: "Jaipur", PNQ: "Pune", AMD: "Ahmedabad", LKO: "Lucknow",
  VNS: "Varanasi", ATQ: "Amritsar", NAG: "Nagpur", IDR: "Indore",
  BHO: "Bhopal", SXR: "Srinagar", IXL: "Leh", PAT: "Patna",
  IXR: "Ranchi", BBI: "Bhubaneswar", VTZ: "Visakhapatnam",
  CJB: "Coimbatore", TRZ: "Tiruchirappalli", IXM: "Madurai",
  IXE: "Mangalore", BDQ: "Vadodara", STV: "Surat", IXC: "Chandigarh",
  VGA: "Vijayawada", RAJ: "Rajkot", JDH: "Jodhpur", RPR: "Raipur",
  DED: "Dehradun", UDR: "Udaipur", AGR: "Agra", HBX: "Hubli",
  IXJ: "Jammu", DIB: "Dibrugarh", IXB: "Bagdogra",
  IXZ: "Port Blair", TIR: "Tirupati", IXU: "Aurangabad",
  DXB: "Dubai", SIN: "Singapore", BKK: "Bangkok",
  LHR: "London", JFK: "New York", AUH: "Abu Dhabi",
  KUL: "Kuala Lumpur", CMB: "Colombo", KTM: "Kathmandu",
};

const KNOWN_IATA_CODES = new Set(Object.values(CITY_TO_IATA));

function resolveIata(raw: string): string | undefined {
  const clean = raw.trim();
  if (!clean) return undefined;

  // "Rajahmundry (RJA) - India" or "Mumbai (BOM)" → extract 3-letter code directly
  const codeMatch = clean.match(/\(([A-Z]{3})\)\s*(?:-.*)?$/);
  if (codeMatch) return codeMatch[1];

  // Plain uppercase 3-letter code like "BOM" or "DEL"
  if (/^[A-Z]{3}$/.test(clean)) return clean;

  // City name lookup (e.g. "Mumbai", "Delhi")
  const cityOnly = clean.replace(/\s*\(.*\)\s*$/, "").toLowerCase().trim();
  if (CITY_TO_IATA[cityOnly]) return CITY_TO_IATA[cityOnly];

  if (CITY_TO_IATA[clean.toLowerCase()]) return CITY_TO_IATA[clean.toLowerCase()];

  for (const word of clean.toLowerCase().split(/[\s,;()\-/]+/)) {
    if (word.length >= 3 && CITY_TO_IATA[word]) return CITY_TO_IATA[word];
  }

  return undefined;
}

// ── TripJack flight mapper ─────────────────────────────────────────────────
function mapTripJackFlight(item: any, idx: number, fromIata: string, toIata: string, traceId = ""): any {
  const firstSeg = item.sI?.[0];
  const lastSeg  = item.sI?.[item.sI.length - 1];

  const airlineCode = firstSeg?.fD?.aI?.code || "";
  const airline     = firstSeg?.fD?.aI?.name || "Unknown Airline";
  const flightNum   = firstSeg?.fD?.fN
    ? `${airlineCode}${firstSeg.fD.fN}`
    : `FL${idx + 1}`;

  const depIso = firstSeg?.dt;
  const arrIso = lastSeg?.at;

  // TripJack sends "YYYY-MM-DDTHH:MM" local IST — extract HH:MM directly
  const depTime = depIso ? depIso.slice(11, 16) || "N/A" : "N/A";
  const arrTime = arrIso ? arrIso.slice(11, 16) || "N/A" : "N/A";

  // Duration: always calculate from first-departure → last-arrival ISO timestamps.
  // Using firstSeg.duration alone is wrong for multi-stop flights (it's only leg 1).
  let duration = "N/A";
  if (depIso && arrIso) {
    const depMs  = new Date(depIso).getTime();
    const arrMs  = new Date(arrIso).getTime();
    const diffMs = arrMs - depMs;
    if (diffMs > 0) {
      const durH = Math.floor(diffMs / 3_600_000);
      const durM = Math.floor((diffMs % 3_600_000) / 60_000);
      duration = `${durH}h ${durM.toString().padStart(2, "0")}m`;
    }
  } else {
    // Fallback: TripJack pre-computed segment duration (first segment only)
    const durMinsRaw = firstSeg?.duration as number | undefined;
    if (durMinsRaw && durMinsRaw > 0) {
      const durH = Math.floor(durMinsRaw / 60);
      const durM = durMinsRaw % 60;
      duration = `${durH}h ${durM.toString().padStart(2, "0")}m`;
    }
  }

  // ── All fare classes from TripJack totalPriceList ─────────────────────────
  const CABIN_LABEL: Record<string, string> = {
    ECONOMY:         "Economy",
    BUSINESS:        "Business",
    FIRST:           "First",
    PREMIUM_ECONOMY: "Premium Economy",
  };

  // TripJack /fms/v1/review priceIds must be totalPriceList[].id — the full
  // alphanumeric fare identifier (e.g. "4-6051918598_0BLRBOMSG115~..."), NOT
  // the numeric sI[0].id / tai.tbi key (e.g. "928"). Verified directly
  // against the sandbox: sending the tbi/segment numeric key always yields
  // "Keys Passed in the request is already expired" (errCode 808) even on
  // an immediate fresh search, while totalPriceList[].id returns HTTP 200
  // with a real bookingId. Fall back to sI[0].id only if totalPriceList is
  // empty (should not normally happen).
  const flightResultIndex: string =
    String(item.totalPriceList?.[0]?.id ?? "")  ||
    String(item.resultIndex             ?? "")  ||
    String(item.sI?.[0]?.id             ?? "")  ||
    String(item.sI?.[0]?.rI             ?? "")  ||
    String(idx);

  // Map every totalPriceList entry to a fare option object.
  // Keep ALL fares per cabin — the UI groups them and lets the user choose.
  const fareOptions = (item.totalPriceList || [])
    .map((pl: any) => {
      const adultFd = pl?.fd?.ADULT;
      if (!adultFd) return null;
      const rawFare = adultFd?.fC?.TF || adultFd?.fC?.BF || 0;
      if (!rawFare) return null;
      const cc = (String(adultFd?.cc || "ECONOMY")).toUpperCase();

      // resultIndex (TripJack priceId): must be this fare's own totalPriceList
      // item `id` — the full alphanumeric fare identifier that /fms/v1/review
      // expects in `priceIds`. The numeric tai.tbi key looks plausible (it's
      // also a per-segment id) but is the WRONG value here — confirmed live
      // against the sandbox, it always yields "Keys Passed in the request is
      // already expired" (errCode 808), even immediately after a fresh
      // search. See flightResultIndex comment above for the full writeup.
      const fareResultIndex: string =
        String(pl.id          ?? "")  ||
        String(pl.resultIndex ?? "")  ||
        String(pl.rI          ?? "")  ||
        flightResultIndex;

      // Normalize meal indicator: "F" → "FREE", "P" → "PAID", else null
      const rawMeal = adultFd?.mI ?? adultFd?.meal ?? null;
      const meal: string | null =
        rawMeal === "F" || rawMeal === "FREE" ? "FREE" :
        rawMeal === "P" || rawMeal === "PAID" ? "PAID" :
        null;

      // Refundability — TripJack's real indicator is `rT`, a NUMERIC enum on fd.ADULT:
      //   0 = fully non-refundable, 1 = refundable, 2 = partially refundable,
      //   4 = LCC fare (refundability governed by `nRF` instead).
      // Some environments may still send the legacy string enum
      // ("REFUNDABLE" / "NON_REFUNDABLE" / etc.) — support both, numeric first.
      const rTRaw = adultFd?.rT;
      const rTStr: string = typeof rTRaw === "string" ? rTRaw.toUpperCase() : "";
      const rTNum: number | null =
        typeof rTRaw === "number" ? rTRaw :
        rTStr !== "" && !Number.isNaN(Number(rTStr)) ? Number(rTStr) :
        null;
      const nRF: boolean = adultFd?.nRF === true || adultFd?.nRF === 1;
      const refundable: boolean =
        rTNum === 1 || rTNum === 2 ||
        rTStr === "FULL_REFUNDABLE" || rTStr === "PARTIAL_REFUNDABLE" || rTStr === "REFUNDABLE"
          ? true
          : rTNum === 0 || rTStr === "NON_REFUNDABLE"
          ? false
          // rT absent/ambiguous (e.g. LCC fare, rT=4) — trust TripJack's own
          // non-refundable flag rather than guessing off cabin class.
          : !nRF;

      // Fare label — map TripJack internal fareIdentifier values to user-friendly names
      const FARE_SOURCE_LABEL: Record<string, string> = {
        PUBLISHED:   "Regular",
        NDC_VALUE:   "Airline Direct",
        CORPORATE:   "Corporate",
        SME:         "SME",
        SPECIAL:     "Special",
        OFFER:       "Offer",
        GOVERNMENT:  "Government",
        STUDENT:     "Student",
        SENIOR:      "Senior",
        ARMED_FORCE: "Armed Forces",
      };
      const rawFareId: string = (pl.fareIdentifier || pl.fn || adultFd?.fareIdentifier || "").trim();
      const apiLabel: string = FARE_SOURCE_LABEL[rawFareId] || rawFareId;
      const fareLabel: string = apiLabel ||
        (cc === "BUSINESS" || cc === "FIRST" ? (refundable ? "Business Flex" : "Business Saver") :
         cc === "PREMIUM_ECONOMY" ? "Premium Economy" :
         refundable ? "Flex" : "Saver");

      // Baggage — TripJack bI object carries iB (check-in) and cB (cabin)
      const bI = adultFd?.bI ?? {};
      const checkedBaggage: string =
        bI.iB  ? String(bI.iB) :
        bI.checkIn ? String(bI.checkIn) :
        cc === "BUSINESS" || cc === "FIRST" ? "30 kg" :
        cc === "PREMIUM_ECONOMY" ? "20 kg" : "15 kg";
      const cabinBaggage: string =
        bI.cB  ? String(bI.cB) :
        bI.cabin ? String(bI.cabin) :
        cc === "BUSINESS" || cc === "FIRST" ? "10 kg" : "7 kg";

      return {
        fareId:         pl.id || pl.fareIdentifier || `${cc}_${rawFare}`,
        cabinClass:     cc,
        cabinLabel:     CABIN_LABEL[cc] || cc,
        fareLabel,
        totalFare:      rawFare,
        seatsLeft:      adultFd?.sR ?? 9,
        resultIndex:    fareResultIndex,
        meal,
        refundable,
        checkedBaggage,
        cabinBaggage,
      };
    })
    .filter(Boolean) as Array<{
      fareId: string; cabinClass: string; cabinLabel: string; fareLabel: string;
      totalFare: number; seatsLeft: number; resultIndex: string;
      meal: string | null; refundable: boolean;
      checkedBaggage: string; cabinBaggage: string;
    }>;

  // Sort cheapest-first within each cabin so the best price leads
  fareOptions.sort((a, b) => a.totalFare - b.totalFare);

  // Deduplicate: if two entries have the same cabinClass + totalFare they are the
  // same fare from different source channels (e.g. PUBLISHED vs NDC_VALUE).
  // Keep only the first (cheapest-first sort already ensures best one leads).
  const _seenFareKey = new Set<string>();
  const fareOptionsDeduped = fareOptions.filter((f) => {
    const key = `${f.cabinClass}:${f.totalFare}`;
    if (_seenFareKey.has(key)) return false;
    _seenFareKey.add(key);
    return true;
  });
  fareOptions.length = 0;
  fareOptionsDeduped.forEach((f) => fareOptions.push(f));

  // Primary price = cheapest available fare (for sort/filter compatibility)
  const priceInfo  = item.totalPriceList?.[0]?.fd?.ADULT;
  const price      = fareOptions.length > 0
    ? Math.min(...fareOptions.map((f: any) => f.totalFare))
    : (priceInfo?.fC?.TF || priceInfo?.fC?.BF || 0);
  const seatsLeft  = priceInfo?.sR ?? 9;
  const cabinClass = CABIN_LABEL[(String(priceInfo?.cc || "ECONOMY")).toUpperCase()] ?? "Economy";

  const segCount = item.sI?.length ?? 1;
  const stops = Math.max(0, segCount - 1);
  const stopsLabel = segCount === 1 ? "Non-stop" : segCount === 2 ? "1 Stop" : "Multi-stop";

  // resultIndex: this is the flight-level convenience field returned to the
  // frontend (kept for back-compat) — it must use the same priceId logic as
  // flightResultIndex above (totalPriceList[].id, TripJack's real /fms/v1/review
  // priceId), not the numeric sI[0].id/tai.tbi segment key, or fareQuote will
  // fail with "Keys Passed in the request is already expired" (errCode 808).
  const resultIndex: string = flightResultIndex;

  // Map each TripJack segment to a normalized segment object
  const segments = (item.sI || []).map((seg: any) => {
    const depDt = seg.dt || "";
    const arrDt = seg.at || "";
    const fromCode = seg.da?.code || seg.da?.cityCode || "";
    const toCode   = seg.aa?.code || seg.aa?.cityCode || "";
    return {
      from:          fromCode,
      fromCity:      seg.da?.cityName || seg.da?.name || CANONICAL[fromCode] || fromCode,
      fromTerminal:  seg.da?.terminal || "",
      to:            toCode,
      toCity:        seg.aa?.cityName || seg.aa?.name || CANONICAL[toCode]   || toCode,
      toTerminal:    seg.aa?.terminal || "",
      departure:     depDt,
      arrival:       arrDt,
      departureTime: depDt ? depDt.slice(11, 16) : "",
      arrivalTime:   arrDt ? arrDt.slice(11, 16) : "",
      airline:       seg.fD?.aI?.name || airline,
      flightNumber:  seg.fD?.aI?.code && seg.fD?.fN ? `${seg.fD.aI.code}${seg.fD.fN}` : flightNum,
    };
  });

  return {
    id: idx + 1,
    airline,
    airlineCode,
    flightNumber: flightNum,
    origin:      CANONICAL[fromIata] || fromIata,
    destination: CANONICAL[toIata]   || toIata,
    departureTime:  depTime,
    arrivalTime:    arrTime,
    departureDatetime: depIso || "",   // full ISO — for client-side calculations
    arrivalDatetime:   arrIso || "",   // full ISO — for client-side calculations
    duration,
    price,
    class: cabinClass,
    seatsAvailable: seatsLeft,
    stops,
    stopsLabel,
    status: "scheduled",
    segments,      // ← per-segment details for stop/layover display
    fareOptions,   // ← all cabin classes with their prices
    resultIndex,   // ← required by TripJack fareQuote/SSR/book
    traceId,       // ← search session ID — embedded per-flight for reliable access
  };
}

// ── POST /api/flights — TripJack live search ───────────────────────────────

// Map our cabin class values → TripJack cabin class codes
function resolveCabinClass(raw?: string): string {
  const v = (raw || "ECONOMY").toUpperCase().replace(/[\s-]/g, "_");
  if (v === "BUSINESS")        return "BUSINESS";
  if (v === "FIRST")           return "FIRST";
  if (v.includes("PREMIUM"))   return "PREMIUM_ECONOMY";
  return "ECONOMY";
}

router.post("/flights", async (req, res): Promise<void> => {
  const {
    // Legacy single-route params (kept for backward compat)
    from,
    to,
    date,
    passengers = 1,
    class: requestedClass,
    // Extended params
    tripType     = "ONEWAY",
    routeInfos   : incomingRoutes,
    paxInfo      : incomingPax,
    cabinClass   : incomingCabinClass,
    returnDate,
  } = req.body as {
    from?: string;
    to?: string;
    date?: string;
    passengers?: number;
    class?: string;
    tripType?: string;
    routeInfos?: Array<{ from: string; to: string; date: string }>;
    paxInfo?: { ADULT?: number; CHILD?: number; INFANT?: number };
    cabinClass?: string;
    returnDate?: string;
  };

  const apiKey = await getTripJackApiKey();
  if (!apiKey) {
    res.status(503).json({ error: "TripJack API key is not configured. Please set it in Admin Settings → API Keys." });
    return;
  }

  // ── Resolve cabin class ──────────────────────────────────────────────────
  const cabinClass = resolveCabinClass(incomingCabinClass || requestedClass);

  // ── Resolve paxInfo ──────────────────────────────────────────────────────
  const adultCount = incomingPax?.ADULT  ?? Math.max(1, Number(passengers) || 1);
  const childCount = incomingPax?.CHILD  ?? 0;
  const infantCount= incomingPax?.INFANT ?? 0;
  const paxInfo    = { ADULT: adultCount, CHILD: childCount, INFANT: infantCount };

  // ── Build routeInfos ─────────────────────────────────────────────────────
  let resolvedRoutes: Array<{ fromIata: string; toIata: string; travelDate: string }>;

  if (Array.isArray(incomingRoutes) && incomingRoutes.length > 0) {
    // Multi-city or explicit routes provided by the new frontend
    const mapped = incomingRoutes.map((r) => ({
      fromIata  : resolveIata(r.from || "") || "",
      toIata    : resolveIata(r.to   || "") || "",
      travelDate: r.date || new Date().toISOString().slice(0, 10),
    }));
    const bad = mapped.find((r) => !r.fromIata || !r.toIata);
    if (bad) {
      res.status(400).json({ error: `Could not resolve airport code for one of the routes.` });
      return;
    }
    resolvedRoutes = mapped;
  } else {
    // Backward-compat: single route from from/to/date
    const fromIata = resolveIata(from || "");
    const toIata   = resolveIata(to   || "");

    if (!fromIata || !toIata) {
      res.status(400).json({
        error: `Could not find airport for "${!fromIata ? from : to}". Please use a valid city or IATA code.`,
      });
      return;
    }

    const travelDate = date || new Date().toISOString().slice(0, 10);
    resolvedRoutes = [{ fromIata, toIata, travelDate }];

    // Round trip: add the return leg
    if (String(tripType).toUpperCase() === "ROUNDTRIP" && returnDate) {
      resolvedRoutes.push({ fromIata: toIata, toIata: fromIata, travelDate: returnDate });
    }
  }

  const searchRouteInfos = resolvedRoutes.map((r) => ({
    fromCityOrAirport: { code: r.fromIata },
    toCityOrAirport:   { code: r.toIata   },
    travelDate:        r.travelDate,
  }));

  const searchBody = {
    searchQuery: {
      cabinClass,
      paxInfo,
      routeInfos: searchRouteInfos,
      searchModifiers: { isDirectFlight: false, isConnectingFlight: false },
    },
  };

  const logLabel = resolvedRoutes.map((r) => `${r.fromIata}→${r.toIata} on ${r.travelDate}`).join(" | ");

  console.log(`[flights/tripjack] search body: ${JSON.stringify(searchBody)}`);

  try {
    const searchHeaders = await getTripJackHeaders();
    const apiRes = await fetch(`${TRIPJACK_BASE}/fms/v1/air-search-all`, {
      method: "POST",
      headers: searchHeaders,
      body: JSON.stringify(searchBody),
      signal: AbortSignal.timeout(20_000),
    });

    const data: any = await apiRes.json().catch(() => ({}));

    console.log(
      `[flights/tripjack] raw response | status:${apiRes.status} | ` +
      `top-keys:[${Object.keys(data || {}).join(",")}] | ` +
      `errors:${JSON.stringify(data?.errors ?? null)} | ` +
      `searchResult-keys:[${Object.keys(data?.searchResult || {}).join(",")}]`
    );

    if (!apiRes.ok) {
      const reason = data?.errors?.[0]?.message || `HTTP ${apiRes.status}`;
      logger.error(`[flights/tripjack] Search HTTP error: ${reason}`);
      res.status(apiRes.status).json({ error: reason });
      return;
    }

    // TripJack returns HTTP 200 with a non-empty errors array when the route
    // has no availability ("No flight search results found.").
    // Treat this as an empty result set, not a hard failure.
    if (data?.errors?.length) {
      const reason = data.errors[0]?.message ?? "No results";
      logger.warn(`[flights/tripjack] ${logLabel}: no availability — "${reason}"`);
      res.json({ flights: [], total: 0, source: "tripjack", traceId: "" });
      return;
    }

    // TripJack wraps results under searchResult.tripInfos
    const { fromIata: f0, toIata: t0 } = resolvedRoutes[0];
    const onward: any[] = data?.searchResult?.tripInfos?.ONWARD
      || data?.tripInfos?.ONWARD
      || [];

    // Extract traceId BEFORE mapping so it is embedded in every flight object.
    // Check every known location TripJack may return it.
    const traceId: string =
      data?.searchResult?.traceId ||
      data?.traceId               ||
      data?.data?.traceId         ||
      onward?.[0]?.traceId        ||
      "";

    const rawFlights = onward.map((item, idx) => mapTripJackFlight(item, idx, f0, t0, traceId));

    // ── Group duplicate fare variants into a single flight card ──────────────
    // TripJack frequently returns the same physical flight (same airline, flight
    // number, departure, arrival) as multiple separate items — one per fare type
    // (Published, NDC, Flex, Corporate, etc.).  We merge them so the UI shows one
    // card per unique flight with all fare options inside the selection modal.
    const groupMap = new Map<string, typeof rawFlights[0]>();

    for (const flight of rawFlights) {
      // Normalise flight number: strip whitespace so "6E 123" and "6E123" collide
      const normFlight = (flight.flightNumber || "").replace(/\s+/g, "").toUpperCase();
      const key = `${(flight.airlineCode || "").toUpperCase()}|${normFlight}|${flight.departureTime}|${flight.arrivalTime}`;

      const existing = groupMap.get(key);
      if (!existing) {
        groupMap.set(key, { ...flight });
      } else {
        // Merge fareOptions — append new ones, de-duplicate by fareId
        const seenFareIds = new Set(existing.fareOptions?.map((f: any) => f.fareId) ?? []);
        for (const fo of flight.fareOptions ?? []) {
          if (!seenFareIds.has(fo.fareId)) {
            existing.fareOptions = [...(existing.fareOptions ?? []), fo];
            seenFareIds.add(fo.fareId);
          }
        }
        // Re-sort merged fareOptions cheapest-first
        existing.fareOptions?.sort((a: any, b: any) => a.totalFare - b.totalFare);

        // Keep the lowest price as the card display price
        const cheapest = existing.fareOptions?.[0];
        if (cheapest && cheapest.totalFare < existing.price) {
          existing.price = cheapest.totalFare;
        }
        // Flight-level resultIndex is a display/back-compat convenience only —
        // the booking flow always uses each fareOption's own resultIndex
        // (the real TripJack priceId). Keep it aligned with the current
        // cheapest fare so it's never a stale/mismatched value.
        existing.resultIndex = existing.fareOptions?.[0]?.resultIndex || existing.resultIndex;
      }
    }

    // Assign stable sequential ids and convert map → array
    const flights = Array.from(groupMap.values()).map((f, idx) => ({ ...f, id: idx + 1 }));

    if (!traceId) {
      // Log top-level keys so we can identify where traceId lives on the sandbox.
      const topKeys = Object.keys(data || {}).join(", ");
      const srKeys  = Object.keys(data?.searchResult || {}).join(", ");
      logger.warn(
        `[flights/tripjack] traceId not found — top-level keys: [${topKeys}] | searchResult keys: [${srKeys}]`,
      );
    }

    logger.info(
      `[flights/tripjack] ${logLabel}: ${rawFlights.length} raw → ${flights.length} unique flights` +
      ` (${cabinClass}, A${adultCount}C${childCount}I${infantCount}) | traceId: ${traceId || "(none)"}`,
    );

    res.json({ flights, total: flights.length, source: "tripjack", traceId });
  } catch (err: any) {
    logger.error("[flights/tripjack] Request failed:", err.message);
    res.status(502).json({ error: `TripJack request failed: ${err.message}` });
  }
});

// ── GET /api/airports/search — airport autocomplete ────────────────────────
router.get("/airports/search", async (req, res): Promise<void> => {
  const q = ((req.query.q as string | undefined) || "").trim();
  if (!q || q.length < 2) {
    res.json({ airports: [] });
    return;
  }

  const rapidApiKey = process.env.RAPIDAPI_KEY;

  if (rapidApiKey) {
    try {
      const apiRes = await fetch(
        `https://booking-com15.p.rapidapi.com/api/v1/flights/searchDestination?query=${encodeURIComponent(q)}`,
        {
          headers: {
            "X-RapidAPI-Key": rapidApiKey,
            "X-RapidAPI-Host": "booking-com15.p.rapidapi.com",
          },
          signal: AbortSignal.timeout(6_000),
        }
      );
      if (apiRes.ok) {
        const body: any = await apiRes.json();
        const items: any[] = Array.isArray(body?.data) ? body.data : [];
        const airports = items.slice(0, 8).map((item: any) => ({
          id:      item.id || item.code,
          name:    item.name || item.cityName,
          iata:    item.code,
          city:    item.cityName || item.name,
          country: item.countryName || "",
          type:    item.type || "AIRPORT",
        }));
        res.json({ airports, source: "rapidapi" });
        return;
      }
    } catch (err: any) {
      logger.warn(`[airports/search] RapidAPI error: ${err?.message}`);
    }
  }

  const lower = q.toLowerCase();
  const matches = Object.entries(CITY_TO_IATA)
    .filter(([city]) => city.includes(lower))
    .slice(0, 8)
    .map(([city, iata]) => ({
      id: iata, name: CANONICAL[iata] || city, iata, city: CANONICAL[iata] || city, country: "India", type: "AIRPORT",
    }));
  res.json({ airports: matches, source: "local" });
});

// ── GET /api/flights/search — DB search ───────────────────────────────────
router.get("/flights/search", async (req, res): Promise<void> => {
  const parsed = SearchFlightsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { origin, destination, class: flightClass } = parsed.data;

  let query = db.select().from(flightsTable).$dynamic();

  const conditions = [];
  if (origin)      conditions.push(ilike(flightsTable.origin,      `%${origin}%`));
  if (destination) conditions.push(ilike(flightsTable.destination, `%${destination}%`));
  if (flightClass) conditions.push(eq(flightsTable.class, flightClass));

  if (conditions.length > 0) {
    const { and } = await import("drizzle-orm");
    query = query.where(and(...conditions));
  }

  const flights = await query;
  const mapped = flights.map((f) => ({ ...f, price: Number(f.price), airlineLogoUrl: f.airlineLogoUrl ?? undefined }));
  res.json(SearchFlightsResponse.parse(mapped));
});

// ── GET /api/flights — list all DB flights ─────────────────────────────────
router.get("/flights", async (_req, res): Promise<void> => {
  const flights = await db.select().from(flightsTable).orderBy(flightsTable.id);
  const mapped = flights.map((f) => ({ ...f, price: Number(f.price), airlineLogoUrl: f.airlineLogoUrl ?? undefined }));
  res.json(ListFlightsResponse.parse(mapped));
});

// ── GET /api/flights/:id ───────────────────────────────────────────────────
router.get("/flights/:id", async (req, res): Promise<void> => {
  const params = GetFlightParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [flight] = await db.select().from(flightsTable).where(eq(flightsTable.id, params.data.id));
  if (!flight) {
    res.status(404).json({ error: "Flight not found" });
    return;
  }

  res.json(GetFlightResponse.parse({ ...flight, price: Number(flight.price), airlineLogoUrl: flight.airlineLogoUrl ?? undefined }));
});

export default router;
