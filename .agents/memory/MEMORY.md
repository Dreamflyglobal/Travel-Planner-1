# Memory Index

- [Razorpay webhook secret](razorpay-webhook-secret.md) — webhook signature verification needs a separate RAZORPAY_WEBHOOK_SECRET, not the API key secret.
- [Replit port mapping](replit-port-mapping.md) — public domain 502s if backend port owns externalPort 80 instead of the frontend; fix via configureWorkflow, not raw .replit edits.
- [Duplicate admin-auth middleware](duplicate-admin-auth-middleware.md) — two competing requireAdmin functions caused inconsistent 401s; check for duplicate auth middleware before suspecting JWT/secret bugs.
- [TripJack per-fare resultIndex](tripjack-fare-resultindex.md) — each flight fare option has its own resultIndex distinct from the flight-level one; using the wrong one silently breaks FareQuote.
