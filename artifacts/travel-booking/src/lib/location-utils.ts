/**
 * Location / route string sanitization utilities — frontend (React/Vite)
 *
 * Fixes:
 *   - Encoding artifacts where → (U+2192) appears as !' or similar garbled text
 *   - IATA airport codes in parentheses: "Hyderabad (HYD)" → "Hyderabad"
 *   - ALL_CAPS city names: "BENGALURU" → "Bengaluru"
 *   - Extra whitespace, special symbols, non-printable characters
 */

/**
 * Cleans a single location/city name string.
 * Returns a properly title-cased, human-readable city name.
 */
export function sanitizeLocation(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = String(raw).trim();

  // ── Remove common encoding corruption artifacts ───────────────────────────
  // These appear when the → (U+2192) arrow is mis-encoded or mis-decoded.
  s = s.replace(/!['\u2019\u0060\u0027;,\s]/g, " ");
  // Smart quotes, replacement character
  s = s.replace(/[\u2018\u2019\u201c\u201d\uFFFD]/g, "");
  // Remove the actual → character (will be re-added by formatRoute)
  s = s.replace(/\u2192/g, " ");
  // HTML entities
  s = s.replace(/&rarr;|&#8594;|&#x2192;/gi, " ");

  // ── Strip IATA / ICAO airport codes ──────────────────────────────────────
  // "(HYD)", "(BLR)", "(VIDP)" etc.
  s = s.replace(/\s*\([A-Z]{3,4}\)\s*/g, " ");
  // Standalone 3-letter IATA codes at end: "Hyderabad HYD" → "Hyderabad"
  s = s.replace(/\s+[A-Z]{3}$/, "");

  // ── Remove non-alphanumeric characters (keep spaces, hyphens, commas) ────
  s = s.replace(/[^\w\s,.\-]/g, " ");

  // ── Normalise whitespace ──────────────────────────────────────────────────
  s = s.replace(/\s+/g, " ").trim();

  // ── Title-case ────────────────────────────────────────────────────────────
  s = s
    .split(" ")
    .map((w) => (w.length > 0 ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ""))
    .join(" ");

  return s;
}

/**
 * Formats a route as "CityA → CityB".
 * Sanitizes both city names before joining.
 */
export function formatRoute(
  from: string | null | undefined,
  to:   string | null | undefined,
  separator = " \u2192 ",
): string {
  const f = sanitizeLocation(from);
  const t = sanitizeLocation(to);
  if (!f && !t) return "";
  if (!f) return t;
  if (!t) return f;
  return `${f}${separator}${t}`;
}
