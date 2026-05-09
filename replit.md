# Dream Fly Global - Travel Booking Platform

A comprehensive travel booking website offering flights, hotels, buses, and holiday packages with advanced features for both B2C and B2B users.

## Run & Operate

- `pnpm run typecheck`: Perform a full typecheck across all packages.
- `pnpm run build`: Typecheck and build all packages.
- `pnpm --filter @workspace/api-spec run codegen`: Regenerate API hooks and Zod schemas.
- `pnpm --filter @workspace/db run push`: Push DB schema changes (development only).
- `pnpm --filter @workspace/api-server run dev`: Run the API server locally.

**Environment Variables for Production:**
- `DATABASE_URL`: PostgreSQL connection string (required).
- `HOTELBEDS_API_KEY`: HotelBeds API key.
- `HOTELBEDS_SECRET`: HotelBeds secret.
- `TRIPJACK_API_KEY`: TripJack API key.
- `TRIPJACK_BASE_URL`: TripJack base URL (`https://apitest.tripjack.com`).
- `PORT`: Server port (`3000`).
- `NODE_ENV`: Set to `production`.
- `LOG_LEVEL`: Pino log level (`info`).
- `JWT_SECRET`: Secret for JWT signing.
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`: Admin login credentials.
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`: Twilio credentials.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite

## Where things live

- `artifacts/travel-booking`: React + Vite frontend application.
- `artifacts/api-server`: Express 5 API server.
- `lib/db/src/schema`: Database schema definitions (source of truth).
- `artifacts/api-server/src/routes`: API endpoint definitions.
- `artifacts/travel-booking/src/pages`: Frontend page components.
- `artifacts/travel-booking/src/contexts/auth-context.tsx`: User authentication context.
- `lib/coupon.ts`: Coupon validation and management logic.
- `lib/wallet.ts`: Agent wallet management.
- `lib/booking-session.ts`: Typed utility for managing pending booking sessions in `localStorage`.
- `artifacts/travel-booking/src/pages/admin/api-keys-section.tsx`: API Keys Management UI.
- `artifacts/api-server/src/routes/holiday-packages.ts`: Holiday package pricing and category logic.
- `artifacts/api-server/src/routes/settings.ts`: Global admin settings API (`GET/PUT /api/settings/:namespace`).
- `lib/db/src/schema/settings.ts`: `app_settings` table — one row per namespace (branding, site, website, notification).

## Architecture decisions

- **Monorepo Structure**: Uses pnpm workspaces for a unified development environment for frontend and backend.
- **Microservice-like API Proxies**: Backend directly proxies requests to external travel APIs (TripJack, Booking.com, HotelBeds) to centralize API key management and implement custom retry logic.
- **Separated Booking Flow**: Passenger/guest details are collected on specific booking pages, but payment is handled on a dedicated, separate `/booking/payment` page, allowing for consistent payment processing across all booking types.
- **Client-Side Persistence for B2B/Coupons**: Features like B2B agent state, coupons, and historical bookings leverage `localStorage`/`sessionStorage` for persistence across sessions, minimizing backend dependency for these client-side specific features.
- **Dynamic Pricing for Holiday Packages**: Implemented a sophisticated dynamic pricing engine for holiday packages considering package type, seasonality, and admin overrides, with a clear `pricingBreakdown` provided.
- **DB-Backed Admin Settings**: All four settings namespaces (branding, site, website, notification) are stored in the `app_settings` PostgreSQL table via `GET/PUT /api/settings/:namespace`. Frontend contexts fetch from DB on mount and on window focus — changes made on any device appear everywhere. localStorage is used as an immediate-render cache only.

## Product

- **Travel Booking**: Comprehensive search and booking for flights (TripJack, Booking.com, Aviationstack), hotels (Booking.com, HotelBeds), buses (synthetic data), and holiday packages.
- **B2B Agent System**: Dedicated agent portal with signup, approval workflow, commission tracking, markup-based pricing, and wallet top-up/payment.
- **Automated Marketing**: 4-trigger WhatsApp marketing engine (Welcome, Search Trigger, Booking Follow-up, Daily Offers).
- **Holiday Lead Follow-up**: Automated 3-step WhatsApp sequence for holiday leads, with persistence across server restarts.
- **Admin Panels**: Comprehensive administration interfaces for bookings management, API key configuration, agent management, coupon management, and CRM.
- **User Management**: Auto user creation and booking linking, JWT-based authentication with OTP and Email/Password options, and unique constraint enforcement for email and phone.
- **Coupon System**: Public, welcome, and user-specific coupons with validation, usage tracking, and admin management.
- **Itinerary Generation**: Automated personalized PDF itinerary generation for holiday packages.

## User preferences

_Populate as you build_

## Gotchas

- **API Key Fallback**: When DB API keys are empty, the system falls back to environment variables. Ensure env vars are correctly set for initial setup or if DB is not preferred for storage.
- **TripJack Sandbox**: TripJack API routes use the TEST (sandbox) environment. Ensure `TRIPJACK_API_KEY` is set for live data, otherwise sample data will be used.
- **Local Storage Reliance**: Many client-side features (B2B agents, coupons, pending bookings) rely heavily on `localStorage`/`sessionStorage`. Clearing browser storage will reset these states.
- **Abandoned Lead Timer**: The 2-minute timer for flight abandoned leads starts after passenger details are entered. Ensure proper handling if payment takes longer or is interrupted.
- **Admin Login**: Hardcoded admin credentials have been removed. Use `/master-admin/login` with `ADMIN_EMAIL` and `ADMIN_PASSWORD` from environment variables.

## Pointers

- **pnpm-workspace skill**: Refer to the `pnpm-workspace` skill for details on the monorepo structure and package management.
- **Drizzle ORM Documentation**: For database schema and query building.
- **Zod Documentation**: For schema validation.
- **Orval Documentation**: For API client code generation from OpenAPI.
- **Pino Logger Documentation**: For structured logging in the backend.
- **Twilio Documentation**: For WhatsApp messaging integration.
- **Razorpay Documentation**: For payment gateway integration.
- **HotelBeds API Documentation**: For hotel search and booking.
- **TripJack API Documentation**: For flight search and booking.
- **RapidAPI Documentation**: For Booking.com integration.