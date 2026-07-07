---
name: TripJack booking data sync & OMS endpoint access
description: How PNR/tjBookingRef flow into DB, and why OMS detail endpoints return 404 in sandbox (IP whitelist split).
---

## OMS endpoint IP-whitelist split (CRITICAL)

TripJack whitelists endpoints **per sub-tree** for each API key + server IP:

| Sub-tree | Works in sandbox | Notes |
|---|---|---|
| `/fms/v1/*` (search, review, farerule) | ✅ | FMS endpoints, IP whitelisted |
| `/oms/v1/air/book` | ✅ | AirBook specifically whitelisted |
| `/oms/v1/booking/detail` | ❌ 404 | Requires separate IP whitelist |
| `/oms/v1/air/booking/detail` | ❌ 404 | Also blocked |
| `/oms/v1/booking/list` | ❌ 404 | Also blocked |
| `/auth/v1/token` | ❌ 403 | Token exchange blocked in sandbox |

The 404 body: `{ status: 404, error: "Not Found", message: "No message available", path: "..." }` — Spring Boot whitelist block, NOT a wrong path.

**ACTION REQUIRED for production**: Ask TripJack support to whitelist the production server IP for:
- `/oms/v1/booking/detail`, `/oms/v1/booking/list`, `/auth/v1/token`

## AirBook response structure (sandbox)

`POST /oms/v1/air/book` returns: `{ "bookingId": "TJSxxxxxxx", "status": { "success": true, "httpStatus": 200 } }`
- NO `status.booking` field (absent = PENDING)
- NO `pnr` / `pnrDetails`
- In production with confirmed airline: response will include `status.booking: "CONFIRMED"` + `pnrDetails`

## The three payment paths and how they persist TripJack data

### Razorpay path (main)
Calls `POST /api/book-flight` which:
1. Calls TripJack `/oms/v1/air/book` — extracts `bookingId` (tjBookingRef)
2. STEP 4.5: calls `fetchTjBookingDetail()` helper (multi-strategy)
3. Saves to DB with pnr + enriched data if detail succeeded
4. Returns `{ pnr, tjBookingRef, bookingId, tjPassengers, ticketNumbers }` — all top-level (no `.data.` wrapper)

### Wallet / Cash / Credit paths
1. Save booking to DB via `createBooking.mutateAsync`
2. Call `POST /api/tj-book` (thin proxy — does NOT run STEP 4.5)
3. After success, call `PATCH /api/bookings/ref/:bookingRef/tj-update` to persist tjBookingRef/pnr to DB

## Multi-strategy helper: fetchTjBookingDetail

`artifacts/api-server/src/lib/tj-booking-helper.ts` — tries 4 strategies in order:
1. `POST /oms/v1/booking/detail { bookingId }`
2. `POST /oms/v1/air/booking/detail { bookingId }`
3. `POST /oms/v1/booking/list` (today)
4. `POST /oms/v1/booking/list` (yesterday+today)
Returns `{ rawStatus, pnr, tjPassengers, ticketNumbers, source }` or `source: "none"` on all-failed.

Used in: `book-flight.ts` (STEP 4.5 + booking-status route), `tj-booking-poller.ts`, `bookings.ts`.

## Auto-sync API endpoint

`POST /api/bookings/ref/:bookingRef/tj-sync` (admin auth) — queries TripJack automatically, syncs DB if CONFIRMED. No manual PNR entry. Returns `{ synced, bookingStatus, pnr, tjStatus, source, message }`.

## Key field name rules
- AirBook: `data.pnr || data.pnrDetails?.[0]?.pnr` and `data.bookingId` (no `.data.` wrapper from tjPostWithRetry)
- Wallet path `/api/tj-book`: same shape (raw TripJack body)

## Invoice / PDF display
- PDF is DOM screenshot of invoice HTML
- Dream Fly Booking ID: `text-green-300`; TripJack Booking ID: `text-blue-300`; PNR: `text-orange-300`
- All surfaces read from the same DB `details` JSONB record
