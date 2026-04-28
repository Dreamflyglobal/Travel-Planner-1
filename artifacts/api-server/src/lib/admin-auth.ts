import { type Request, type Response, type NextFunction } from "express";
import { verifyToken } from "./jwt.js";

const COOKIE_NAME = "admin_session";

/**
 * Express middleware that verifies the admin is authenticated.
 * Accepts auth from either:
 *   1. httpOnly cookie "admin_session" (set by POST /api/admin/login)
 *   2. Authorization: Bearer <jwt>  (legacy / backward compat)
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const cookieToken = (req as any).cookies?.[COOKIE_NAME] as string | undefined;
  const headerToken = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : undefined;

  const raw = cookieToken || headerToken;

  if (!raw) {
    res.status(401).json({ success: false, error: "Not authenticated — please log in to the admin panel." });
    return;
  }

  try {
    const payload = verifyToken(raw);
    if (payload.role !== "admin") {
      res.status(403).json({ success: false, error: "Admin access required." });
      return;
    }
    (req as any).adminUser = payload;
    next();
  } catch {
    res.status(401).json({ success: false, error: "Session expired — please log in again." });
  }
}
