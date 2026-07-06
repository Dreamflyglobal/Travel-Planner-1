// Airline IATA code → logo image URL, keyed off the code returned by the
// flight search API (flight.airlineCode). Falls back to the gradient +
// initials badge (see airlineGradient in flight-results.tsx) when a code
// isn't in this map or the image fails to load.
export const airlineLogos: Record<string, string> = {
  AI: "https://www.gstatic.com/flights/airline_logos/70px/AI.png", // Air India
  IX: "https://www.gstatic.com/flights/airline_logos/70px/IX.png", // Air India Express
  "6E": "https://www.gstatic.com/flights/airline_logos/70px/6E.png", // IndiGo
  SG: "https://www.gstatic.com/flights/airline_logos/70px/SG.png", // SpiceJet
  QP: "https://www.gstatic.com/flights/airline_logos/70px/QP.png", // Akasa Air
  "9I": "https://www.gstatic.com/flights/airline_logos/70px/9I.png", // Alliance Air
  S5: "https://www.gstatic.com/flights/airline_logos/70px/S5.png", // Star Air
  UK: "https://www.gstatic.com/flights/airline_logos/70px/UK.png", // Vistara
  G8: "https://www.gstatic.com/flights/airline_logos/70px/G8.png", // Go First / GoAir
  I5: "https://www.gstatic.com/flights/airline_logos/70px/I5.png", // AirAsia India
};

export function getAirlineLogoUrl(code?: string): string | null {
  if (!code) return null;
  return airlineLogos[code.toUpperCase().trim()] ?? null;
}
