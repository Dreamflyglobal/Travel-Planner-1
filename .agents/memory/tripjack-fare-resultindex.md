---
name: TripJack per-fare resultIndex
description: Each flight fare option carries its own TripJack resultIndex, separate from the flight-level resultIndex — mixing them up silently breaks FareQuote.
---

TripJack search results attach a `resultIndex` at two levels:
- **Flight-level** (`LiveFlight.resultIndex`) — the raw resultIndex of the base/default search result item.
- **Per-fare** (`FareOption.resultIndex`) — a distinct resultIndex for each cabin class/fare option, derived from `pl.tai.tbi` keys or `pl.resultIndex` in the TripJack search response. Different fare options are genuinely different TripJack search result items.

**Why:** FareQuote (and downstream SSR/Book) must be called with the resultIndex that matches the specific fare the user picked. When a UI selects a fare from an expanded fare list, it must send `fare.resultIndex`, not the flight's base resultIndex — otherwise TripJack quotes/verifies the wrong fare and the call fails or returns mismatched pricing, with no obvious error pointing at the real cause.

**How to apply:** Whenever wiring a fare-selection handler into fareQuote/SSR/book, always prefer the per-fare resultIndex over the flight-level one (`fare.resultIndex || flight.resultIndex`, not the reverse). If FareQuote is failing/rejecting fares intermittently despite valid auth and payload, check resultIndex precedence at the call site before suspecting the backend or TripJack auth.
