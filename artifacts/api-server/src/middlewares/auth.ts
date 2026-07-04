import { Request, Response, NextFunction } from "express";
import { verifyToken, JwtPayload } from "../lib/jwt.js";
import { logger } from "../lib/logger.js";

declare global {
  namespace Express {
    interface Request {
      jwtUser?: JwtPayload;
    }
  }
}

// NOTE: `requireAdmin` used to live here as a header-only, cookie-blind
// implementation with its own error strings ("Admin authentication
// required"). That duplicate caused inconsistent 401s across admin routes
// (upload vs. settings vs. bookings each behaving slightly differently).
// The canonical `requireAdmin` (cookie OR Bearer header, shared error
// shape, debug logging) now lives in `../lib/admin-auth.js` — every
// admin-only route should import it from there instead.
export { requireAdmin } from "../lib/admin-auth.js";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  logger.debug(
    { path: req.originalUrl, method: req.method, hasAuthHeader: !!header },
    "[requireAuth] incoming request",
  );
  if (!header?.startsWith("Bearer ")) {
    logger.warn({ path: req.originalUrl, method: req.method }, "[requireAuth] rejected — no Authorization header");
    return res.status(401).json({ error: "Authentication required" });
  }
  try {
    const token = header.slice(7);
    req.jwtUser = verifyToken(token);
    logger.debug(
      { path: req.originalUrl, userId: req.jwtUser.userId, role: req.jwtUser.role },
      "[requireAuth] authenticated",
    );
    next();
  } catch (err) {
    logger.warn(
      { path: req.originalUrl, method: req.method, err: (err as Error)?.message },
      "[requireAuth] rejected — invalid or expired token",
    );
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    try {
      req.jwtUser = verifyToken(header.slice(7));
    } catch {
      // ignore invalid tokens for optional auth
    }
  }
  next();
}
