---
name: Duplicate requireAdmin implementations caused inconsistent 401s
description: Two competing requireAdmin middlewares (header-only vs cookie-or-header) existed in this codebase with different error strings — always check for duplicate auth middleware before assuming a token/secret bug.
---

Dream Fly Global's api-server had two separate `requireAdmin` Express
middlewares: one in `middlewares/auth.ts` (Bearer header only, error
"Admin authentication required") and one in `lib/admin-auth.ts` (accepts
`admin_session` httpOnly cookie OR Bearer header, error "Not authenticated —
please log in..."). Different admin routes imported different ones
(`upload.ts`/`admin-bookings.ts` used the cookie-aware one, `settings.ts`
used the header-only one), so behavior and error messages were inconsistent
across admin-only endpoints even though JWT_SECRET and token issuance were
correct everywhere.

**Why:** When a user reports "admin login works but endpoint X returns 401,"
before hunting for a JWT_SECRET mismatch or expired-token bug, grep for
*how many* auth-checking middleware functions exist and which routes import
which one. A logged/observed error string that doesn't match the middleware
a route appears to import is a strong signal of a duplicate implementation
or a stale build, not a token bug.

**How to apply:** Consolidate to a single canonical `requireAdmin` (or
`requireAuth`) that every route imports from one file, add debug-level
logging of auth-header/cookie presence + JWT verify outcome inside it, and
delete/re-export the duplicate rather than leaving two implementations to
drift apart again.
