# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Project: Dream Fly Global - Travel Booking Platform

A comprehensive travel booking website with:
- **TripJack Add-ons Booking Page** — New standalone page at `/booking/tj-addons` (`artifacts/travel-booking/src/pages/tj-addons-booking.tsx`). Full Search → FareQuote → SSR → Select Add-ons → Book → PNR flow. On mount: calls `POST /api/tj-farequote` to lock in the fare, then `POST /api/tj-ssr` to fetch live seats + baggage from TripJack. Uses real TripJack seat map and baggage list when API key is set; falls back to sample data (5-row × 6-col seat map + 4 baggage tiers) when sandbox returns an error. Passenger form (Title + First/Last name + DOB + Email + Phone, all validated before submit). Collects selected seat code + baggage code and sends them in `POST /api/tj-book` with full `travellerInfo` + `deliveryInfo`. Success screen shows PNR + bookingId. Route registered in App.tsx as one import + one `<Route>`. Link to this page: `/booking/tj-addons?bookingId=<TJ_BOOKING_ID>&from=DEL&to=BOM&date=2026-05-15&airline=IndiGo&flightNumber=6E123&departure=06:00&arrival=08:10&duration=2h10m&price=4500&passengers=1`. MSW explicitly passes through `/api/tj-farequote`, `/api/tj-ssr`, `/api/tj-book` in both handler files. No existing files were functionally changed.
- **TripJack Sandbox API pass-through routes** — Four new backend routes that proxy directly to the TripJack TEST (sandbox) environment (`https://apitest.tripjack.com`). All routes use `axios`, pass the full request body through, return the full TripJack response, and log request/response to the console. Routes live in `artifacts/api-server/src/routes/tripjack.ts`: `POST /api/search` → `/fms/v1/air/search`, `POST /api/fareQuote` → `/fms/v1/air/farequote`, `POST /api/ssr` → `/fms/v1/air/ssr`, `POST /api/book` → `/fms/v1/air/book`. All four read `TRIPJACK_API_KEY` from env and return `503` if not set. Designed as the backbone for the Search → Select → FareQuote → SSR → Book → PNR flow. No existing routes modified.
- **TripJack Retry Infrastructure** — Shared `artifacts/api-server/src/lib/tj-retry.ts` client with: automatic 2-retry policy on every transient failure (HTTP 5xx, ECONNABORTED, ETIMEDOUT, ECONNRESET, 401 stale token); fresh token forced on each retry attempt via `bustTripJackToken()`; per-attempt 15-second timeout (30s for AirBook); "server busy / timeout / airline not reachable" pattern detection inside 200-OK response bodies; structured pino logging of traceId, resultIndex, pnr, attempt number on every call; user-friendly "Temporary airline issue. Please try again." message after exhausted retries. Used by `tripjack.ts`, `tripjackRoutes.ts`, and `book-flight.ts` replacing all raw `axios.post` calls.
- **Flight booking** — Live search via Booking.com (RapidAPI, `booking-com15.p.rapidapi.com`) as primary source → Aviationstack as secondary → synthetic schedule as final fallback. Shows source banner ("Live fares from Booking.com" / "Scheduled"). `GET /api/flights/live-search?from=&to=&date=`. Airport autocomplete: `GET /api/airports/search?q=`. All flights include `stops` field; non-stop filter works.
- **Bus booking** — Live search via `GET /api/buses/live-search?from=&to=` generates rich synthetic buses for ANY Indian city pair. Distance-based pricing (₹1.2–3.5/km), realistic duration calculation, 6–8 operators (VRL, APSRTC, Orange, SRS, Neeta, Paulo, KSRTC, MSRTC, etc.), city-specific boarding/dropping points from CITY_BUS_DATA lookup. "Live bus schedule" green banner. Filters (price, operator, bus type, departure time) all work. Slider max is dynamic from results.
- **Hotel booking** — Live search via Booking.com API (RapidAPI). Real amenities extracted from `accessibilityLabel` + `badges` fields, star-tier defaults. Photos from API. Rating shown as /10 (Booking.com scale). Falls back to curated city data → generic data. "Live from Booking.com" green banner when RapidAPI succeeds.
- **Automated Marketing System** — 4-trigger WhatsApp marketing engine. DB tables: `user_activity` (last search/booking per user), `marketing_messages` (log of all messages). Scheduler: `lib/marketing-scheduler.ts`. Routes: `POST /api/marketing/search-event` (schedule 10-min search trigger), `POST /api/marketing/booking-followup` (schedule 6-hr follow-up), `POST /api/marketing/cancel-search` (cancel on booking), `POST /api/marketing/activity` (save activity), `POST /api/marketing/send-daily-offers` (admin: trigger now), `GET /api/marketing/status` (admin: stats). Messages: (1) Welcome — immediate on signup; (2) Search trigger — 10 min after flight/hotel/bus search if not booked; (3) Booking follow-up — 6 hours after booking, suggests return trip or hotels; (4) Daily offers — once/day at 9 AM IST to all users with phone numbers (dedup check per day). Frontend hook `useMarketing` in `src/hooks/use-marketing.ts` — used by all 3 results pages to fire search events; deduped per session per type. All 4 timers are in-memory. Messages are logged via `marketing_messages` table. WhatsApp sent via `marketing-whatsapp.ts` using same Twilio creds.
- **Holiday Lead Follow-up System** — Automated 3-step WhatsApp sequence per lead: 10 min / 2 hr / 24 hr. `POST /api/followup/schedule` registers the sequence; `POST /api/followup/cancel` stops it. `GET /api/followup/log?leadId=` retrieves per-lead send history. `GET|PUT /api/followup/settings` controls global toggle + editable message templates. Lead status: new → contacted → interested → booked (stored on each HolidayLead in localStorage). Setting status to "contacted" or "booked" auto-cancels pending follow-ups. All three timeouts survive server restarts via `recoverPendingFollowUps()` which re-schedules DB-persisted pending rows on startup. DB tables: `lead_followups` (per-message log), `followup_settings` (singleton config row). Admin panel Leads tab: status dropdown, follow-up log expandable per row, auto follow-up settings panel with enable/disable toggle and editable message templates.
- **WhatsApp + PDF automation** — `POST /api/holiday-whatsapp` triggers WhatsApp message (via Twilio) with a personalised PDF itinerary link. `GET /api/itinerary-pdf?name=&phone=&dest=&duration=&people=&date=&pkg=&price=&total=` generates a 2-page A4 PDF with purple Dream Fly Global branding, day-wise itinerary (destination-templated), inclusions list, and price summary. Fire-and-forget calls from frontend — lead submit in packages.tsx and booking confirm in package-booking.tsx. Twilio env vars: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` (default +14155238886), `TWILIO_WHATSAPP_TO` (sandbox test override). Gracefully skips if credentials not configured.
- **Holiday packages** — Full TravelTriangle-style system: search hero with "Where do you want to go?", lead capture modal (Name/Mobile/Date/People → saved to localStorage `holiday_leads`), 8 rich mock packages (Goa, Kashmir, Kerala, Rajasthan, Manali, Andaman, Maldives, Himachal) with destination images. Package detail: image gallery with thumbnails, AI itinerary (destination-specific day-plans with "Regenerate" button + 2-sec spinner animation), inclusions/exclusions cards, enquiry modal (Name/Phone/Email/Message → saved to localStorage `holiday_enquiries`, status: pending/contacted/converted), Book Now → /packages/booking. Booking page: step progress indicator, guest form, real coupon system (from admin), price summary (no conv fee), final payment card (conv fee only). Admin panel: "Leads" tab shows all captured lead details in table; "Enquiries" tab shows cards with Mark Contacted / Converted status buttons.
- **Auto User Creation & Booking Linking** — Every booking is linked to a real user row (no orphan "guest" bookings). Logic in `POST /api/bookings` (backend) and `POST /api/bookings` MSW handler (dev): if `userId` is absent or "guest", system calls `findOrCreateUser(phone, email, name)` — (1) lookup by phone, (2) lookup by email, (3) create new passwordless account (OTP-compatible). Prevents duplicate accounts via DB unique constraints on `phone` and `email`. `GET /api/bookings` accepts `?userId=` OR `?phone=` — returns all bookings linked to either. MSW mirrors this with `msw_mock_users` localStorage store + `findOrCreateMockUser` helper. My Bookings page sends both `?userId=` and `?phone=` for maximum recall of historical bookings.
- **My Bookings** — view all bookings, booking details, cancel bookings
- **B2B Agent System** — agent signup/login, agent role, agent dashboard with commission tracking, markup-based pricing
- **Hotels & Buses fetched from external API** — Mock data arrays (`MOCK_HOTELS` in `hotel-results.tsx`, `MOCK_BUSES` in `bus-results.tsx`) are removed. Both pages now fetch via dedicated services that use `axios`: `src/services/hotelService.ts` (GET `https://jsonplaceholder.typicode.com/users` → mapped to `Hotel` shape) and `src/services/busService.ts` (GET `https://jsonplaceholder.typicode.com/posts` → mapped to `Bus` shape, capped at 20). Each results page uses `useState` + `useEffect` to call the service on mount, with `isLoading` skeletons, an `isError` banner with a Retry button, and a green "Showing N · Live data" banner on success. The `MOCK_HOTELS` / `MOCK_BUSES` exports are kept as mutable empty arrays that get populated after fetch, so `hotel-detail.tsx`, `bus-detail.tsx`, and `bus-seat-selection.tsx` can still resolve items by ID after the user has visited the results page. The jsonplaceholder URLs are placeholder test endpoints — swap them in the service files for a real hotel/bus API later. **Flights are intentionally untouched** — the `flight-*` pages still use their original mock + live-search hybrid.
- **Booking Management & Refunds** — Admin-only page at `/master-admin/bookings-management` (`artifacts/travel-booking/src/pages/admin/bookings-management.tsx`). Displays all bookings in a table with Booking ID, user, type (flight/bus/hotel/package), amount, status, refund status, travel date, and actions. Search by ID/email/name/phone; filter by status (pending/confirmed/cancelled/refunded) and service type. Status badges colour-coded. Per-row actions: View (modal with full details + payment + refund history), Confirm, Cancel, Initiate Refund (with confirmation dialog + editable amount). New backend routes (`artifacts/api-server/src/routes/admin-bookings.ts`): `GET /api/admin/bookings` (paginated list with `?search=&status=&type=` filters), `GET /api/admin/bookings/:id`, `PUT /api/admin/bookings/:id/status` (validates status against the four allowed values), `POST /api/admin/refund` (body: `{paymentId, amount, bookingId?}` — calls Razorpay refund API at `/v1/payments/{id}/refund` with HTTP Basic auth using DB-stored or env Razorpay key/secret; runs in demo mode if creds absent or paymentId starts with `demo_`). Refund tracking via new `booking_refunds` table (`lib/db/src/schema/booking-refunds.ts`) — singleton-per-refund row with `bookingId`, `paymentId`, `refundId`, `amount`, `status` (processing/completed/failed), `errorMessage`, `initiatedBy`. Successful refunds auto-set the booking status to `refunded`. All routes require admin JWT. Discoverable via a quick-link card at the top of `/master-admin/settings`. Existing booking/payment/Razorpay code untouched — purely additive.
- **API Keys Management** — Admin panel section to securely store provider API keys (Flight/Bus/Hotel/Payment) in DB. Singleton row in `api_keys` table (`apiKeysTable` in `lib/db/src/schema/api-keys.ts`). DB columns: `flightApiKey`, `busApiKey`, `hotelApiKey`, `hotelApiSecret` (HotelBeds secret for X-Signature), `paymentApiKey`, `paymentApiSecret`, `tboApiKey`. Routes: `GET /api/admin/api-keys` returns ONLY masked values (`****1234`) + `set` flag + `source` (db/env/none). `POST /api/admin/api-keys` saves. `POST /api/admin/api-keys/test { which }` — combined test (TripJack live call, Razorpay live call, HotelBeds live probe, format-check for others). Separate dedicated test routes: `POST /api/admin/test-tripjack`, `POST /api/admin/test-razorpay`, `POST /api/admin/test-hotelbeds`. Alias: `POST /api/admin/api-settings` accepts `{tripjackKey, razorpayKey, razorpaySecret, hotelbedsKey, hotelbedsSecret}`. Falls back to env vars when DB empty. HotelBeds live search (`GET /api/hotels/live-search`) reads both key and secret from DB first, then env fallback. All routes admin-only (JWT bearer, role check). Frontend: `artifacts/travel-booking/src/pages/admin/api-keys-section.tsx` — password inputs with show/hide, masked badges, per-provider Test buttons including HotelBeds secret field.

### B2B Agent System
- **Agent creation**: Admin panel → Agent Management → "+ Create Agent" button (admin creates directly), OR agents self-register at `/signup` → "Travel Agent (B2B)"
- **Agent role**: `role: "agent"` in User, stored in `localStorage.users`. Separate from `"user"` and `"admin"`
- **Agent approval flow**: New agents start as `isApproved: false`. Admin approves/deactivates in Agent Management tab
- **Agent pricing**: `isApprovedAgent = role === "agent" && isApproved === true`. Agent base price = rawPrice + agentMarkup (defaults 0 if not set by admin). Commission = normalMarkup − agentMarkup per passenger
- **Agent dashboard**: `/agent` — booking history (reads both sessionStorage + localStorage), wallet, commission per booking, total spent, commission earned
- **Admin management**: Admin panel → Agent Management tab — create/approve/deactivate agents, set agentMarkup (₹), top up wallet, view booking count + commission earned per agent
- **Admin Agent Bookings tab**: Shows all bookings made by agents with per-agent revenue/commission cards + full bookings table
- **Booking storage**: MSW bookings written to `localStorage.msw_mock_bookings` (persists across sessions) AND mirrored to `localStorage.travel_bookings`. Agent fields `agentId`, `agentCode`, `agentEmail`, `commissionEarned` stored at top-level of each booking record. Backend POST `/api/bookings` also inserts into PostgreSQL `bookings` table with `userId`, `bookingRef`, `title` columns.
- **All Bookings table**: Agent bookings show an agent code badge on the customer row
- **Key files**: `auth-context.tsx` (User model + login), `passenger-details-page.tsx` (agent pricing + booking creation), `agent-dashboard.tsx` (dashboard, reads both storages), `admin.tsx` (management + create agent), `mocks/handlers.ts` (MSW: stores agent fields, mirrors to localStorage)

### Pricing System
- **Hidden markup** (`hidden_markup_v1`): silently absorbed into "Base Price", never shown. Admin sets this globally.
- **Convenience fee** (`markup_settings_v2`): shown as "Convenience Fee" only at final checkout step (payment dialog/sidebar)
- **Agent markup**: per-agent flat ₹ value (lower than hidden markup). Commission = hiddenMarkup − agentMarkup
- **Pricing flow**: Search → base price only → Booking page → base + fee breakdown → Pay button charges full total

### Smart Dynamic Pricing (Holiday Packages)
- **Package type markup** (`PACKAGE_TYPE_MARKUP`): honeymoon +30%, luxury +50%, family +20%, friends +15%, budget +5%. Applies via `packageType` field; falls back to `type` field for seed packages.
- **Date-based adjustment**: Peak months (Apr–Jun, Oct–Dec) = +20% weekday / +30% weekend; Off-season (Jul–Sep) = -10%; Weekends outside peak = +10%.
- **Admin price override** (`markupPct` column + `adminPrice`): Admin can set a custom markup% per package (overrides type default), or a hard fixed price (bypasses all dynamic pricing).
- **`originalPrice`**: Base + type markup, no date effect — shown as strikethrough "was" price when a date changes it.
- **`pricingBreakdown`**: Returned in every GET `/api/holiday-packages` response — `{basePrice, typeMarkupPct, typeMarkupAmt, dateMarkupPct, dateMarkupAmt, dateLabel, finalPrice}`.
- **Frontend**: Travel date picker in packages grid + detail sidebar; season badge (🔥/✅/📅); strikethrough with SAVE% tag; pricing breakdown panel in detail page.
- **Key files**: `artifacts/api-server/src/routes/holiday-packages.ts` (`computeSmartPrice`, `getEffectiveMarkupPct`, `getDateMarkupInfo`); `artifacts/travel-booking/src/pages/packages.tsx` (PackageCard); `artifacts/travel-booking/src/pages/package-detail.tsx` (sidebar + breakdown panel).

### Holiday Package Admin Markup + Convenience Fee (layer 2)
On top of the smart API price, the same two-layer system as flights/buses/hotels applies:
- **Hidden markup** (`hidden_markup_v1.packages`): admin-controlled, silently absorbed into displayed price. `displayedPPP = API_price + hiddenMarkupPP`
- **Convenience fee** (`markup_settings_v2.packages`): shown explicitly in Final Payment card. Applied per person × people count.
- **B2C formula**: `displayed = rawAPIPrice + hiddenMarkup`; `total = displayed × people + convFee`
- **Agent formula**: `displayed = rawAPIPrice + agentMarkup` (lower); `commission = (hiddenMarkup - agentMarkup) × people`; same `convFee`
- **Consistency**: Search cards, detail sidebar, and booking page all apply the same `getHiddenMarkupAmount(rawPrice, "packages")` + `getConvenienceFee(rawPrice, "packages")` logic.
- **Admin UI**: Admin panel → Markup Settings tab → Packages section (same UI as flights/hotels/buses).

### Holiday Package Category System
- **Field**: `category` (text, nullable) on `packages` table — values: `domestic | international | devotional`
- **DB**: Column added via `drizzle-kit push`; existing seed packages pre-seeded (domestic: Goa/Kashmir/Kerala/Rajasthan/Manali/Andaman/Himachal, international: Maldives)
- **API**: `category` returned in every GET `/api/holiday-packages` response; accepted in POST and PUT/PATCH bodies
- **Admin form**: Category select dropdown (🇮🇳 Domestic / ✈️ International / 🛕 Devotional) in 3-column row alongside Theme/Type and Audience/Package Type
- **B2C UI**: Prominent tab bar (🌍 All | 🇮🇳 Domestic | ✈️ International | 🛕 Devotional) at the top of the package filter section; underline-style active indicator; stacks with audience + theme filters
- **Filter logic**: `matchCategory = !categoryFilter || pkg.category === categoryFilter`; "Clear Filters" resets all four filters including category
- **Key files**: `lib/db/src/schema/packages.ts`, `artifacts/api-server/src/routes/holiday-packages.ts`, `artifacts/travel-booking/src/pages/packages.tsx`, `artifacts/travel-booking/src/pages/admin/packages.tsx`

### Authentication System (Backend JWT — v2)
- **Auth backend**: All auth handled by Express API (`/api/auth/*`) + PostgreSQL `users` table
- **JWT tokens**: 30-day expiry, signed with `JWT_SECRET` env var (falls back to dev secret). Stored in `localStorage.jwt_token`
- **OTP Login**: `POST /api/auth/send-otp` → Twilio SMS/WhatsApp → `POST /api/auth/verify-otp` → returns JWT. Creates DB user if first-time
- **Email+Password**: `POST /api/auth/register` (name+email+phone+password) → `POST /api/auth/login` (email+password) → returns JWT
- **Session**: `GET /api/auth/me` with `Authorization: Bearer <token>` → returns user from DB
- **Unique constraints**: `users.email UNIQUE` + `users.phone UNIQUE` enforced at DB level
- **Duplicate detection**: `409` with `code: "duplicate_email" | "duplicate_phone"` → frontend shows "Account already exists. Please login."
- **Phone validation**: Backend enforces 10-digit Indian mobile (starts 6-9)
- **Account linking**: OTP users can add email/password via `POST /api/auth/link-email`; email users can add phone via `POST /api/auth/link-phone`
- **Admin login**: dedicated `POST /api/admin/login` endpoint (`artifacts/api-server/src/routes/admin.ts`) validates against `ADMIN_EMAIL` / `ADMIN_PASSWORD` env vars and returns a JWT with `userId:0, role:"admin"`. The hardcoded `admin@dreamflyglobal.com / admin123` shortcut has been removed from `/api/auth/login`. Frontend (`master-admin-login.tsx`) calls the new endpoint and stores both `jwt_token` and `isAdmin=true` in localStorage; `logout()` clears both. `AdminGuard` component protects all `/master-admin/*` routes.
- **API key security**: Razorpay KEY_SECRET, Twilio AUTH_TOKEN, SMTP_PASS, Hotelbeds SECRET all stay on backend only
- **Key files**: `artifacts/api-server/src/routes/auth.ts`, `lib/jwt.ts`, `middlewares/auth.ts`, `lib/db/src/schema/users.ts`, `artifacts/travel-booking/src/contexts/auth-context.tsx`

### Admin Credentials
- URL: `/master-admin/login`
- Credentials sourced from env vars: `ADMIN_EMAIL` / `ADMIN_PASSWORD` (Replit Secrets)

## Artifacts

- `artifacts/travel-booking` — React + Vite frontend (Dream Fly Global travel booking site)
- `artifacts/api-server` — Express 5 API server

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Database Schema

Tables:
- `flights` — airline flight data
- `buses` — bus route data
- `hotels` — hotel listings
- `packages` — holiday packages
- `bookings` — customer bookings
- `destinations` — popular travel destinations
- `lead_followups` — WhatsApp follow-up automation log (step, status, scheduledAt)
- `followup_settings` — single-row config for follow-up messages
- `leads` — CRM lead table; fields: leadId, name, phone, email, type, source, status, packageId, packageName, assignedTo, assignedName, bookingRef, notes
- `enquiries` — holiday package enquiries table; status="enquiry" on creation
- `users` — authenticated user accounts; UNIQUE email + UNIQUE phone; role: user/agent/admin/staff; otpUser flag; passwordHash (bcrypt); referralCode; walletBalance

### CRM + Staff System
- **Lead status values**: `viewed` (logged-in customer opens package), `guest_lead` (guest submits lead capture popup), `abandoned` (flight passenger fills form but doesn't pay in 2 min), `new` (default), `contacted`, `interested`, `booked`, `lost`
- **Holiday leads — logged-in user**: When a logged-in customer opens a package detail page, `autoSaveCustomerHolidayLead()` silently saves a lead with `status="viewed"`, `packageId`, `packageName`. Dedup: same phone+packageId within 1 hour → skipped.
- **Holiday leads — guest**: After 700ms on package detail page, a **lead capture popup** auto-appears with Full Name + 10-digit Mobile. On submit: creates a Dream Fly Global account automatically (auto-login), saves lead with `status="guest_lead"`. No enquiry created.
- **Holiday enquiries**: When user clicks "Send Enquiry" button → saves to `enquiries` table with `status="enquiry"`. No CRM lead created from enquiry form.
- **Flight abandoned lead**: When passenger name (≥2 chars) + phone (10 digits) are filled on flight booking page, a 2-minute timer starts. If payment is NOT completed within 2 minutes, an abandoned lead is saved (`status="abandoned"`, `type="flight"`). Timer is cancelled immediately on any successful payment (`convertLeadToBooked` called).
- **Dedup**: `POST /api/leads` — if `packageId` provided: same phone+packageId within 1 hour → skip; otherwise: same phone+type within 1 hour → merge.
- **Lead conversion**: When booking payment completes, `convertLeadToBooked(phone, type, bookingRef)` updates status → "booked".
- **API routes**: `GET /api/leads?status=&type=`, `POST /api/leads`, `PATCH /api/leads/:leadId`, `POST /api/leads/convert`; `GET /api/enquiries`, `POST /api/enquiries`, `PATCH /api/enquiries/:enquiryId`
- **Admin pages**: `/admin/leads` — full leads table (all statuses, filterable by status/type, Call button, status-change actions); `/admin/enquiries` — enquiry-only table; `/admin/crm` — combined CRM with staff management
- **Key files**: `lib/crm.ts` (autoSaveLead, autoSaveCustomerHolidayLead, savePackageEnquiry), `leads.ts` (API route), `enquiries.ts` (API route), `pages/admin/leads.tsx`, `pages/admin/enquiries.tsx`, `pages/package-detail.tsx` (lead capture popup + customer auto-lead), `pages/flight-booking.tsx` (abandoned lead timer)

### Coupon System
- **Storage**: `localStorage.coupons` (JSON array). Usage log: `localStorage.coupon_usage`. Each coupon: `{code, discount, discountType, minAmount, expiryDate, type, firstTimeOnly, allowed_phone, used_by[], maxUses}`.
- **Three coupon types**: `"public"` (anyone), `"welcome"` (first-time users, `firstTimeOnly:true`), `"user_specific"` (single phone, `allowed_phone`).
- **Validation**: `validateCoupon(code, amount, context)` in `lib/coupon.ts` — checks type eligibility (phone match, first-time), expiry, min amount, max uses. Context: `{phone, userBookingsCount}`.
- **Available Offers UI**: `components/available-coupons.tsx` — shows eligible coupons per user as clickable cards (type badge + savings preview). Mounted above manual code entry on all 5 booking pages.
- **Admin coupon management**: Admin panel Coupons tab — create/delete coupons, type dropdown (Public/Welcome/User-Specific), conditional phone field for user-specific coupons, type badges on coupon cards.
- **Usage recording**: `recordCouponUsage(code, phone)` updates `coupon_usage` log AND `used_by[]` on the coupon. Called on all booking payment success paths.
- **Backward compat**: Old coupons without `type` field migrate on read: `firstTimeOnly=true` → `"welcome"`, else → `"public"`.
- **Key files**: `lib/coupon.ts`, `components/available-coupons.tsx`, `pages/admin.tsx` (Coupons tab)

### Separated Booking Flow (v2)
- **Architecture**: Booking pages (flight, bus, hotel) now only handle passenger/guest details. Payment is a separate dedicated page at `/booking/payment`.
- **Session storage**: `src/lib/booking-session.ts` — typed utility using `localStorage` key `ww_pending_booking`. Types: `FlightBookingSession`, `BusBookingSession`, `HotelBookingSession`. Save/load/clear helpers.
- **Flight booking** (`/booking/flight`): Passenger forms + inline **seat selection grid** (6 rows × A–F columns, pre-taken seats highlighted) + **extra baggage options** (0/15/20/30 kg with cost). "Continue to Payment" saves session → navigates to `/booking/payment`.
- **Bus booking** (`/bus/booking`): Passenger forms per seat, journey summary. "Continue to Payment" saves session → `/booking/payment`.
- **Hotel booking** (`/hotels/booking`): Guest details form. "Continue to Payment" saves session → `/booking/payment`.
- **Payment page** (`/booking/payment`): Reads session from localStorage; shows booking summary (type-aware: flight/bus/hotel); full coupon system (`AvailableCoupons` + manual code); Travel Credits toggle (regular users); Wallet Pay button (agents); Razorpay checkout; on success → create booking → redirect `/bookings?success=true`. Clears session on completion.
- **Home page improvements**: Bus search button now goes to `/bus/results?from=&to=&date=` (direct results, no intermediate page). Added "Browse by Category" section with 4 category cards (Flights/Hotels/Buses/Holidays). Added "Today's Best Deals" promo banners section (3 gradient cards with coupon codes). Added trust indicators section (Secure/Premium/Support).
- **CRM routing**: `/admin/crm` now redirects to `/master-admin/crm`; new `/master-admin/crm` route uses the same AdminCRM component.

### Agent Wallet System
- **Wallet balance**: `walletBalance` field on User in `localStorage.users`. `lib/wallet.ts` — `creditWallet(userId, amount, note)`, `deductWallet(userId, amount, note)`. Transaction log in `localStorage.agent_wallet_txns`.
- **Top-up**: Agent dashboard Wallet tab — Razorpay top-up with quick-amount chips (₹500/1k/2k/5k). Admin panel → Agent Management → Top Up button (calls `creditWallet` for logging).
- **Pay with Wallet**: All 4 booking pages (flight, bus, hotel, package) show "Pay with Wallet" button to agents with sufficient balance. Instant, no OTP.

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
