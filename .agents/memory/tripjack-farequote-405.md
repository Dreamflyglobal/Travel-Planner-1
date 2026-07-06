---
name: TripJack real endpoint paths and priceId extraction
description: The correct TripJack sandbox endpoint paths/field names for search, review (fareQuote), farerule, and book — and why a bare 405 here means wrong path, not IP whitelisting.
---

**Correction (superseding an earlier, wrong version of this note):** the earlier claim that a bare HTTP 405 from TripJack always means IP whitelisting was WRONG and was never verified against the real sandbox. Direct testing (OPTIONS preflight, GET/POST probes) proved several guessed endpoint paths simply don't exist on TripJack's gateway — they're unmapped GET-only stubs. A bare 405 with `allow: GET,HEAD` on OPTIONS is TripJack's signature for "this path doesn't support POST" — i.e. **wrong path**, not an access/whitelisting problem. Always verify with a direct OPTIONS/GET probe before assuming IP whitelisting.

**Verified real TripJack sandbox endpoints** (apitest.tripjack.com), authenticated with a plain `apikey` header (Bearer token exchange via `/auth/v1/token` genuinely rejects this account's key with `errCode 403 "Invalid Access"` — a separate, still-unresolved account/credential issue, unrelated to path bugs):
- Search: `POST /fms/v1/air-search-all` (NOT `/fms/v1/air/search`, which is a GET-only stub returning an unrelated `{"suggestions":[]}` body).
- Fare verification ("review"/fareQuote step): `POST /fms/v1/review` with body `{ priceIds: [...] }` (NOT `/fms/v1/air/farequote`, which is a GET-only stub). Returns fare data + a `bookingId`.
- Fare rules: `POST /fms/v1/farerule` (no `/air/` segment) with `{ bookingId }`.
- Booking: `POST /oms/v1/air/book` (order-management service — NOT `/fms/v1/air/book`, which is a GET-only stub) with `{ bookingId, ...travellerInfo/deliveryInfo }`.
- No separate SSR/seatmap/baggage endpoint exists in the sandbox (all guessed paths are 404 or GET-only stubs) — SSR data (baggage/meal options) comes embedded in the `/fms/v1/review` response under `tripInfos[].sI[].ssrInfo`.

**Critical priceId gotcha:** the value to send in `/fms/v1/review`'s `priceIds` array must be `totalPriceList[].id` — the long alphanumeric fare identifier (e.g. `"4-6051918598_0BLRBOMSG115~..."`). It is NOT the numeric `sI[0].id` / `tai.tbi` object key (e.g. `"928"`), even though that numeric key is also a real per-segment identifier and looks like a plausible priceId. Sending the numeric key always yields `errCode 808 "Keys Passed in the request is already expired"` — even on an immediate, fresh search — which looks exactly like a transient/expiry bug but is actually a wrong-field-value bug.

**Why:** two different mapping bugs (wrong endpoint paths + wrong priceId field) combined to produce a generic "temporary airline issue" error on every flight selection. Both were found only by directly probing the live sandbox response shapes rather than trusting endpoint-name guesses or plausible-looking numeric IDs.

**How to apply:** when integrating a new TripJack call, always fetch a real response from the sandbox first and inspect its exact field names before wiring up extraction logic — don't assume a numeric-looking ID field is the right one just because it exists in the expected place.
