import { Router } from "express";
import { signToken } from "../lib/jwt.js";

const router = Router();

const COOKIE_NAME = "admin_session";
const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path:     "/",
  maxAge:   8 * 60 * 60 * 1000, // 8 hours
};

// ── POST /api/admin/login ─────────────────────────────────────────────────
router.post("/admin/login", async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email?.trim() || !password) {
    return res.status(400).json({ success: false, error: "Email and password are required" });
  }

  const ADMIN_EMAIL    = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.error("[admin/login] ADMIN_EMAIL / ADMIN_PASSWORD env vars are not configured");
    return res.status(500).json({ success: false, error: "Admin login is not configured on the server" });
  }

  const inputEmail = email.trim().toLowerCase();
  if (inputEmail !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, error: "Invalid credentials" });
  }

  const token = signToken({ userId: 0, role: "admin", email: ADMIN_EMAIL });

  // Set httpOnly session cookie so the browser sends it automatically on every
  // subsequent admin request — no need to read/store it in localStorage.
  res.cookie(COOKIE_NAME, token, COOKIE_OPTS);

  return res.json({
    success: true,
    token,
    user: { id: 0, name: "Admin", email: ADMIN_EMAIL, role: "admin" },
  });
});

// ── POST /api/admin/logout ────────────────────────────────────────────────
router.post("/admin/logout", (_req, res) => {
  res.clearCookie(COOKIE_NAME, { path: "/" });
  res.json({ success: true });
});

export default router;
