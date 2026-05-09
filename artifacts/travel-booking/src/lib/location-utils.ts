/**
 * Location / route string sanitization utilities — frontend (React/Vite)
 *
 * Fixes:
 *   - Zero-width characters that cause "H y d e r a b a d" letter-spacing
 *   - Visible letter-by-letter spacing "V i j a y a w a d a" (regular spaces between chars)
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
  // Common patterns: !' !; !`  (byte-sequence corruption of 0xE2 0x86 0x92)
  s = s.replace(/!['\u2019\u0060\u0027;]/g, " ");
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

  // ── Normalise whitespace ──────────────────────────────────────────────────
  s = s.replace(/\s+/g, " ").trim();

  // ── Detect and fix letter-by-letter spacing ───────────────────────────────
  // e.g. "V i j a y a w a d a" → "Vijayawada"
  // This happens when API data embeds zero-width chars that jsPDF renders as spaces,
  // or when titles are stored character-by-character with space separators.
  // Rule: if ALL space-separated tokens are single letters and there are 4+, collapse them.
  const tokens = s.split(" ").filter(Boolean);
  if (tokens.length >= 4 && tokens.every((t) => /^[A-Za-z]$/.test(t))) {
    s = tokens.join("");
  }

  // ── Title-case if entirely all-caps ("HYDERABAD") or all-lowercase ("visakhapatnam") ──
  // Preserves correctly mixed-case names like "New Delhi", "McLeod Ganj"
  const isAllCaps  = s === s.toUpperCase() && /[A-Z]/.test(s);
  const isAllLower = s === s.toLowerCase() && /[a-z]/.test(s);
  if (isAllCaps || isAllLower) {
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
 * Sanitizes a booking title that may contain route corruption artifacts
 * or letter-by-letter spacing from API data.
 *
 * Handles:
 *   "V i j a y a w a d a !' C h e n n a i" → "Vijayawada → Chennai"
 *   "visakhapatnam !' tirupati"              → "Visakhapatnam → Tirupati"
 *   "Hyderabad → Goa"                        → "Hyderabad → Goa"  (passthrough, re-sanitized)
 *   "Hotel Grand Palace"                     → "Hotel Grand Palace"  (passthrough)
 */
export function sanitizeBookingTitle(raw: string | null | undefined): string {
  if (!raw) return "";

  // Strip zero-width / invisible characters first
  let s = String(raw).replace(/[\x00-\x1F\x7F\u00AD\u200B\u200C\u200D\u2028\u2029\uFEFF]/g, "").trim();

  // Helper: sanitize one route segment, handling "Operator · City" sub-format.
  // e.g. "Patel Travels · vijayawada" → "Patel Travels · Vijayawada"
  const sanitizeSegment = (seg: string): string => {
    const t = seg.trim();
    // Middle dot (U+00B7) or bullet (U+2022) used as operator · city separator
    if (/[\u00B7\u2022]/.test(t)) {
      return t
        .split(/\s*[\u00B7\u2022]\s*/)
        .map((sp) => sanitizeLocation(sp.trim()))
        .filter(Boolean)
        .join(" \u00B7 ");
    }
    return sanitizeLocation(t);
  };

  // If the title contains a corruption artifact (!' or similar), treat as a route
  const corruptionPattern = /!['\u2019\u0060\u0027;]/;
  if (corruptionPattern.test(s)) {
    const parts = s.split(corruptionPattern).map(sanitizeSegment).filter(Boolean);
    if (parts.length >= 2) return parts.join(" \u2192 ");
    if (parts.length === 1) return parts[0];
  }

  // If already contains →, re-sanitize each segment (fixes letter-spacing in each city)
  if (s.includes("\u2192")) {
    const parts = s.split("\u2192").map(sanitizeSegment).filter(Boolean);
    if (parts.length >= 2) return parts.join(" \u2192 ");
  }

  // Final pass: run through sanitizeSegment to fix any remaining issues
  return sanitizeSegment(s);
}
