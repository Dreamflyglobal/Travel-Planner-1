---
name: Dream Fly Global parallel flight booking flows
description: Two separate flight booking implementations exist in the codebase; only one is the real production flow used by the app's navigation.
---

The app has two independent flight booking implementations:

1. **Real/production flow** (linked from flight search results): flight-results →
   `flight-booking.tsx` (passenger details + fareQuote) → `flight-addons.tsx`
   (SSR seats/baggage) → `flight-review.tsx` → `booking-payment.tsx` (Razorpay)
   → `book-flight.ts` (TripJack AirBook, auto-refund on failure).
2. **Orphaned/legacy flow**: `tj-addons-booking.tsx` at `/booking/tj-addons`,
   which calls TripJack SSR then books directly via `tj-book` — bypasses
   Razorpay entirely and is not linked from any navigation path.

**Why this matters:** it's easy to mistake the orphaned page for the target
flow when grepping for "SSR" or "tj-book" usage, and end up building/fixing
the wrong flow. The two flows also each define their own separate local
`Passenger` type (not shared) — `bus-booking.tsx`, `tj-addons-booking.tsx`,
and `flight-booking.tsx` all have distinct `Passenger` types, so a field
added to one (e.g. `dob`) does not automatically apply to the others.

**How to apply:** before touching flight-booking-related code, confirm which
of the two flows the user's request actually targets. Default to the
production flow (`flight-booking.tsx` → `flight-addons.tsx` →
`flight-review.tsx` → `booking-payment.tsx` → `book-flight.ts`) unless the
user explicitly asks about `/booking/tj-addons`.
