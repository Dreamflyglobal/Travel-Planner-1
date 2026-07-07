---
name: TripJack booking data sync
description: How PNR/tjBookingRef flow from TripJack into the DB and all four display surfaces (invoice, PDF, payment-success, my-bookings)
---

## The three payment paths and how they persist TripJack data

### Razorpay path (main)
Calls `POST /api/book-flight` which:
1. Calls TripJack `/oms/v1/air/book` — extracts `data.bookingId` (tjBookingRef) and `data.pnr || data.pnrDetails?.[0]?.pnr`
2. Saves to DB (STEP 4)
3. Calls TripJack `/oms/v1/booking/detail` (STEP 4.5) to get enriched PNR/tjPassengers
4. Updates DB with enriched data
5. Returns `{ pnr, tjBookingRef, bookingId, tjPassengers, ticketNumbers }` — all top-level (no `.data.` wrapper)

Frontend reads: `flightBookResult.pnr`, `flightBookResult.tjBookingRef` — correct, no wrapping.

### Wallet / Cash / Credit paths
1. Save booking to DB first via `createBooking.mutateAsync`
2. Call `attemptTjBook()` → `POST /api/tj-book` (thin proxy to TripJack)
3. `/api/tj-book` returns raw TripJack body directly — `data.bookingId` = TripJack ref, `data.pnr` or `data.pnrDetails[0].pnr` = PNR
4. After success, call `PATCH /api/bookings/ref/:bookingRef/tj-update` to persist to DB
5. Store in localStorage

**Why:** `/api/tj-book` is a thin proxy; it doesn't run STEP 4.5 or update the DB.

## Key field name bugs (fixed)
- `attemptTjBook` was reading `data?.data?.pnr` and `data?.data?.bookingId` — WRONG (no `.data.` wrapper)
- Correct: `data?.pnr || data?.pnrDetails?.[0]?.pnr` and `data?.bookingId`

## TripJack AirBook PNR location
TripJack returns PNR in `data.pnrDetails[0].pnr` in the AirBook response, NOT always in `data.pnr` (which can be null in sandbox). Both must be checked.

## PATCH endpoint for wallet/cash DB update
`PATCH /api/bookings/ref/:bookingRef/tj-update` — accepts `{ tjBookingRef, pnr, tjDetailStatus, tjPassengers, ticketNumbers }`, updates the booking record's `details` JSONB and sets `bookingStatus/status = "confirmed"`.

## Invoice / PDF display
- PDF is a DOM screenshot (`captureElementAsPDF`) of the invoice HTML — fixing invoice fixes PDF
- Dream Fly Booking ID uses `text-green-300` (was `text-white` which appeared blank on dark bg in PDFs)
- TripJack Booking ID: `text-blue-300`
- PNR: `text-orange-300`
- All three come from the API invoice endpoint which reads from DB `details` JSONB

## Data flow for all surfaces
All four surfaces (payment-success, invoice, PDF, my-bookings) read from the same DB record:
- payment-success: polls `/api/booking-status/:ref` which reads from DB + optionally re-calls TripJack
- invoice + PDF: fetches `/api/invoice/:bookingId` which reads from DB `details`
- my-bookings: fetches `/api/bookings?userId=` list which includes pnr from DB
