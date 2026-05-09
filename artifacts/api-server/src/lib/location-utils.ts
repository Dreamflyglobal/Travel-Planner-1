/**
 * Location / route string sanitization utilities — backend (Node.js)
 *
 * Fixes:
 *   - Zero-width characters that cause "H y d e r a b a d" letter-spacing
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

  // ── Remove zero-width / invisible characters (PRIMARY cause of "H y d e r a b a d") ──
  // Zero-width space U+200B, ZWNJ U+200C, ZWJ U+200D, BOM U+FEFF,
  // soft hyphen U+00AD, null bytes, ASCII control chars, line/paragraph separators
  s = s.replace(/[\x00-\x1F\x7F\u00AD\u200B\u200C\u200D\u2028\u2029\uFEFF]/g, "");

  // ── Remove common encoding corruption artifacts ───────────────────────────
  // These appear when the → (U+2192) arrow is mis-encoded or mis-decoded.
  // Common patterns: !' !; !` (byte-sequence corruption of 0xE2 0x86 0x92)
  s = s.replace(/!['\u2019\u0060\u0027;]/g, " ");
  // Right/left smart quotes, replacement character (U+FFFD)
  s = s.replace(/[\u2018\u2019\u201c\u201d\uFFFD\u00e2\u0086\u0092]/g, "");
  // Remove the actual → character (will be re-added as separator by formatRoute)
  s = s.replace(/\u2192/g, " ");
  // Remove → encoded as literal HTML entity (just in case)
  s = s.replace(/&rarr;|&#8594;|&#x2192;/gi, " ");

  // ── Strip IATA / ICAO airport codes ──────────────────────────────────────
  // "(HYD)", "(BLR)", "(DEL)", "(VIDP)" etc.
  s = s.replace(/\s*\([A-Z]{3,4}\)\s*/g, " ");
  // Standalone 3-letter IATA codes at end of string after space: "Hyderabad HYD"
  s = s.replace(/\s+[A-Z]{3}$/, "");

  // ── Normalise whitespace ──────────────────────────────────────────────────
  s = s.replace(/\s+/g, " ").trim();

  // ── Title-case ────────────────────────────────────────────────────────────
  // Only title-case if the whole string is uppercase (e.g. API returns "HYDERABAD")
  // Preserve mixed-case city names (e.g. "New Delhi", "McLeod Ganj")
  const isAllCaps = s === s.toUpperCase() && /[A-Z]/.test(s);
  if (isAllCaps) {
    s = s
      .split(" ")
      .map((w) => (w.length > 0 ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ""))
      .join(" ");
  }

  return s;
}

/**
 * Formats a route as "CityA → CityB".
 * Sanitizes both city names before joining.
 *
 * @param from        Origin city/location
 * @param to          Destination city/location
 * @param separator   Defaults to " → " (Unicode arrow — fine for HTML/WhatsApp/SMS)
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

/**
 * PDF-safe route string — uses an ASCII "to" separator instead of →.
 * Use this wherever PDFKit (server-side PDF) renders text with standard fonts.
 * Standard fonts (Helvetica, Times) use WinAnsiEncoding which does NOT include →.
 */
export function formatRoutePdfSafe(
  from: string | null | undefined,
  to:   string | null | undefined,
): string {
  return formatRoute(from, to, "  to  ");
}
