import { Router } from "express";
import { signToken } from "../lib/jwt.js";

const router = Router();

// ── POST /api/admin/login ────────────────────────────────────────────────────
// Validates against ADMIN_EMAIL / ADMIN_PASSWORD env vars.
// Returns a JWT token (userId 0, role "admin") so the existing AuthContext,
// AdminGuard, navbar, and admin-layout continue to work without UI changes.

router.post("/admin/login", async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email?.trim() || !password) {
    return res.status(400).json({ success: false, error: "Email and password are required" });
  }

  const ADMIN_EMAIL = process.env.ADMIN_EMAIL?.trim().toLowerCase();
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

  return res.json({
    success: true,
    token,
    user: { id: 0, name: "Admin", email: ADMIN_EMAIL, role: "admin" },
  });
});

export default router;
