---
name: TripJack booking session expiry
description: TripJack's /fms/v1/review session expires in ~2-3 min; must refresh before calling /oms/v1/air/book after payment.
---

# TripJack Booking Session Expiry

## The rule
Always call `/fms/v1/review` again on the **backend**, immediately after Razorpay payment verification, before calling `/oms/v1/air/book`. Never reuse a bookingId from a session created during the fareQuote step at fare-selection time.

**Why:** TripJack's booking session (created by `/fms/v1/review`) has a TTL of a few minutes. By the time the user fills in passenger details and completes Razorpay checkout, the session is almost always expired. TripJack returns: `"BookingId passed in the request is already expired. Kindly generate new bookingId from review response."`

## How to apply
In `book-flight.ts`, STEP 2 calls `/fms/v1/review` with `{ priceIds: [priceIdForRefresh] }` where `priceIdForRefresh = fareData.resultIndex || fareData.bookingId`. The input (resultIndex/priceId) is the stable fare identifier — it doesn't expire; only the review *session* does. After the refresh call, use `freshBookingId` in `tjPayload.bookingId`.

## Key identifiers
- `fareData.resultIndex`: the priceId sent by frontend (populated from `ww_tj_farequote_key` sessionStorage key — the fareKey stored at fare-selection time)
- `fareData.bookingId`: fallback when resultIndex not extracted (often the same value as resultIndex)
- `freshBookingId`: the bookingId to use for AirBook — extracted from `reviewData?.bookingId ?? reviewData?.data?.bookingId ?? priceIdForRefresh`

## TripJack review response structure
The `/fms/v1/review` response has `tripInfos` at the top level (no `data` wrapper). Any returned `bookingId` is also at the top level. The frontend code `data?.data?.bookingId` was wrong — should be `data?.bookingId`.
