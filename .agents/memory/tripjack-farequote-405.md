---
name: TripJack FareQuote HTTP 405
description: Why TripJack's fms/v1 endpoints can return 405 even when the path and method are correct.
---

TripJack's `apitest.tripjack.com` gateway (Cloudflare) confirms its `fms/v1/*` endpoints (e.g. `/fms/v1/air/farequote`) accept POST via CORS preflight (`OPTIONS` → `access-control-allow-methods: POST`), and returns HTTP 200 with an embedded `status.success:false` error body for bad/missing API keys. It does **not** produce a real 404/405 for wrong paths or bad keys in normal cases.

A genuine HTTP 405 (not a 200-wrapped error) on a `fms/v1` call — especially right after "token exchange failed, falling back to apikey header" — is therefore not an endpoint-path bug. It indicates TripJack's edge is blocking the request before routing it, almost always because the calling server's outbound IP isn't whitelisted for that API key (both the Bearer-token exchange and the apikey-header fallback are rejected at the gateway).

**Why:** Confirmed by directly probing the sandbox gateway (OPTIONS preflight + POST with garbage keys) — every case returned 200 with a body-level error, never a bare 405, ruling out wrong-path/wrong-method as the cause of a real 405 in production logs.

**How to apply:** In `tj-retry.ts`, HTTP 401/403/405 are all treated as hard auth/access rejections — bust the cached token and retry once, then surface an actionable error telling the user to get TripJack to whitelist the server's IP. Don't waste time trying alternate endpoint path spellings when you see a bare 405 from TripJack.
