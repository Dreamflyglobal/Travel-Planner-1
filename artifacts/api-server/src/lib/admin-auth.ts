import { type Request, type Response, type NextFunction } from "express";
import { verifyToken } from "./jwt.js";
import { logger } from "./logger.js";

const COOKIE_NAME = "admin_session";

/**
 * Express middleware that verifies the admin is authenticated.
 * Accepts auth from either:
 *   1. httpOnly cookie "admin_session" (set by POST /api/admin/login or /api/auth/login-admin)
 *   2. Authorization: Bearer <jwt>  (used by the frontend admin panel for uploads/settings)
 *
 * This is the single canonical admin-auth middleware — every admin-only route
 * in the API server should import `requireAdmin` from here so behaviour and
 * error messages stay consistent across upload, settings, and bookings routes.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const cookieToken = (req as any).cookies?.[COOKIE_NAME] as string | undefined;
  const authHeader = req.headers.authorization;
  const headerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;

  const raw = cookieToken || headerToken;
  const source = cookieToken ? "cookie" : headerToken ? "header" : "none";

  logger.debug(
    {
      path: req.originalUrl,
      method: req.method,
      hasAuthHeader: !!authHeader,
      hasCookie: !!cookieToken,
      tokenSource: source,
    },
    "[requireAdmin] incoming request",
  );

  if (!raw) {
    logger.warn(
      { path: req.originalUrl, method: req.method },
      "[requireAdmin] rejected — no cookie or Authorization header present",
    );
    res.status(401).json({ success: false, error: "Not authenticated — please log in to the admin panel." });
    return;
  }

  try {
    const payload = verifyToken(raw);
    if (payload.role !== "admin") {
      logger.warn(
        { path: req.originalUrl, method: req.method, role: payload.role, tokenSource: source },
        "[requireAdmin] rejected — token verified but role is not admin",
      );
      res.status(403).json({ success: false, error: "Admin access required." });
      return;
    }
    logger.debug(
      { path: req.originalUrl, method: req.method, email: payload.email, tokenSource: source },
      "[requireAdmin] authenticated",
    );
    (req as any).adminUser = payload;
    next();
  } catch (err) {
    logger.warn(
      { path: req.originalUrl, method: req.method, tokenSource: source, err: (err as Error)?.message },
      "[requireAdmin] rejected — JWT verification failed (invalid or expired token)",
    );
    res.status(401).json({ success: false, error: "Session expired — please log in again." });
  }
}
