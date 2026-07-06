# Memory Index

- [Razorpay webhook secret](razorpay-webhook-secret.md) — webhook signature verification needs a separate RAZORPAY_WEBHOOK_SECRET, not the API key secret.
- [TripJack real endpoints & priceId](tripjack-farequote-405.md) — verified real paths (air-search-all, review, farerule, oms/v1/air/book) and the priceId field gotcha; a bare 405 means wrong path, not IP whitelisting.
- [Replit port mapping](replit-port-mapping.md) — public domain 502s if backend port owns externalPort 80 instead of the frontend; fix via configureWorkflow, not raw .replit edits.
- [Duplicate admin-auth middleware](duplicate-admin-auth-middleware.md) — two competing requireAdmin functions caused inconsistent 401s; check for duplicate auth middleware before suspecting JWT/secret bugs.
- [TripJack per-fare resultIndex](tripjack-fare-resultindex.md) — each flight fare option has its own resultIndex distinct from the flight-level one; using the wrong one silently breaks FareQuote.
- [Dream Fly Global parallel flight flows](dreamfly-parallel-flight-flows.md) — two separate flight booking implementations exist; only one is the real production flow.
