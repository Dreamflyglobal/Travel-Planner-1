import { Router } from "express";
import twilio from "twilio";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { signToken } from "../lib/jwt.js";
import { requireAuth } from "../middlewares/auth.js";
import { sendWelcomeMessage } from "../lib/marketing-scheduler.js";

const router = Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

interface OTPEntry {
  otp: string;
  expiresAt: number;
  requestCount: number;
  windowStart: number;
}

const otpStore = new Map<string, OTPEntry>();

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10);
}

function isValidPhone(phone: string): boolean {
  return /^[6-9][0-9]{9}$/.test(normalizePhone(phone));
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function generateReferralCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "WW";
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function generateAgentCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "AG";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function safeUser(u: typeof usersTable.$inferSelect) {
  const { passwordHash: _, ...safe } = u;
  return safe;
}

async function sendSMSOTP(phone: string, otp: string): Promise<{ sent: boolean; reason?: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID || "";
  const authToken  = process.env.TWILIO_AUTH_TOKEN  || "";

  if (!accountSid || !authToken) {
    return { sent: false, reason: "Twilio not configured" };
  }

  const client = twilio(accountSid, authToken);
  const to     = `+91${phone}`;
  const body   = `Your Dream Fly Global OTP is ${otp}. Valid for 5 minutes. Do not share this code.`;

  const smsSender = process.env.TWILIO_SMS_FROM || "";
  if (smsSender) {
    try {
      await client.messages.create({ from: smsSender, to, body });
      return { sent: true };
    } catch (err: any) {
      console.warn("[otp] SMS failed:", err.message);
    }
  }

  // Fallback: WhatsApp OTP
  const waFrom = process.env.TWILIO_WHATSAPP_FROM || "";
  if (waFrom) {
    const fromWA = waFrom.startsWith("whatsapp:") ? waFrom : `whatsapp:${waFrom}`;
    const toWA   = `whatsapp:${to}`;
    try {
      await client.messages.create({
        from: fromWA,
        to: toWA,
        body: `🔐 *Dream Fly Global OTP Login*\n\nYour OTP is: *${otp}*\n\nValid for 5 minutes. Do not share.`,
      });
      return { sent: true };
    } catch (err: any) {
      console.warn("[otp] WhatsApp fallback failed:", err.message);
      return { sent: false, reason: err.message };
    }
  }

  return { sent: false, reason: "No Twilio sender configured" };
}

// ── GET /api/auth/me ─────────────────────────────────────────────────────────

router.get("/auth/me", requireAuth, async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, req.jwtUser!.userId))
      .limit(1);

    if (!rows.length) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json({ user: safeUser(rows[0]) });
  } catch (err: any) {
    console.error("[auth/me] error:", err.message);
    return res.status(500).json({ error: "Server error" });
  }
});

// ── POST /api/auth/register ──────────────────────────────────────────────────
// Fields: name, email, phone, password, role?, agencyName?, gstNumber?

router.post("/auth/register", async (req, res) => {
  const {
    name, email, phone, password, role = "user",
    agencyName, gstNumber,
  } = req.body as {
    name?: string;
    email?: string;
    phone?: string;
    password?: string;
    role?: string;
    agencyName?: string;
    gstNumber?: string;
  };

  // Validate required fields
  if (!name?.trim()) {
    return res.status(400).json({ error: "Name is required" });
  }
  if (!email?.trim() && !phone?.trim()) {
    return res.status(400).json({ error: "Email or mobile number is required" });
  }
  if (!password) {
    return res.status(400).json({ error: "Password is required" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }

  // Validate email format
  if (email && !isValidEmail(email)) {
    return res.status(400).json({ error: "Please enter a valid email address" });
  }

  // Validate phone
  let cleanPhone: string | null = null;
  if (phone?.trim()) {
    cleanPhone = normalizePhone(phone.trim());
    if (!isValidPhone(cleanPhone)) {
      return res.status(400).json({ error: "Please enter valid 10-digit mobile number" });
    }
  }

  const cleanEmail = email?.trim().toLowerCase() || null;

  try {
    // Check for duplicate email
    if (cleanEmail) {
      const existing = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.email, cleanEmail))
        .limit(1);
      if (existing.length) {
        return res.status(409).json({ error: "Account already exists. Please login.", code: "duplicate_email" });
      }
    }

    // Check for duplicate phone
    if (cleanPhone) {
      const existing = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.phone, cleanPhone))
        .limit(1);
      if (existing.length) {
        return res.status(409).json({ error: "Account already exists. Please login.", code: "duplicate_phone" });
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const isAgent = role === "agent";

    const [newUser] = await db
      .insert(usersTable)
      .values({
        name: name.trim(),
        email: cleanEmail,
        phone: cleanPhone,
        passwordHash,
        role: isAgent ? "agent" : "user",
        agencyName: isAgent ? (agencyName || name.trim()) : null,
        gstNumber:  isAgent ? (gstNumber  || null)        : null,
        agentCode:  isAgent ? generateAgentCode()          : null,
        commission: isAgent ? "5"                          : null,
        isApproved: !isAgent,
        referralCode: generateReferralCode(),
        walletBalance: "0",
      })
      .returning();

    const token = signToken({ userId: newUser.id, role: newUser.role, email: newUser.email ?? undefined, phone: newUser.phone ?? undefined });

    // Fire welcome WhatsApp asynchronously (non-blocking)
    if (newUser.phone) {
      sendWelcomeMessage(String(newUser.id), newUser.name, newUser.phone)
        .catch((e) => console.error("[auth/register] welcome WhatsApp failed:", e));
    }

    return res.status(201).json({ token, user: safeUser(newUser) });
  } catch (err: any) {
    if (err.code === "23505") {
      if (err.constraint?.includes("email")) {
        return res.status(409).json({ error: "Account already exists. Please login.", code: "duplicate_email" });
      }
      if (err.constraint?.includes("phone")) {
        return res.status(409).json({ error: "Account already exists. Please login.", code: "duplicate_phone" });
      }
    }
    console.error("[auth/register] error:", err.message);
    return res.status(500).json({ error: "Registration failed. Please try again." });
  }
});

// ── POST /api/auth/login ─────────────────────────────────────────────────────
// Fields: email (or phone), password

router.post("/auth/login", async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email?.trim()) {
    return res.status(400).json({ error: "Email is required" });
  }
  if (!password) {
    return res.status(400).json({ error: "Password is required" });
  }

  const input = email.trim().toLowerCase();

  try {
    // Note: Admin login is handled by POST /api/admin/login (uses ADMIN_EMAIL / ADMIN_PASSWORD env vars)
    const rows = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, input))
      .limit(1);

    if (!rows.length) {
      return res.status(401).json({ error: "No account found with this email. Please sign up first.", code: "user_not_found" });
    }

    const user = rows[0];
    if (!user.passwordHash) {
      return res.status(401).json({ error: "This account was created with mobile OTP. Please login using your mobile number.", code: "otp_account" });
    }

    const passwordOk = await bcrypt.compare(password, user.passwordHash);
    if (!passwordOk) {
      return res.status(401).json({ error: "Incorrect password. Please try again.", code: "wrong_password" });
    }

    const token = signToken({ userId: user.id, role: user.role, email: user.email ?? undefined, phone: user.phone ?? undefined });
    return res.json({ token, user: safeUser(user) });
  } catch (err: any) {
    console.error("[auth/login] error:", err.message);
    return res.status(500).json({ error: "Login failed. Please try again." });
  }
});

// ── POST /api/auth/send-otp ──────────────────────────────────────────────────

router.post("/auth/send-otp", async (req, res) => {
  const { phone } = req.body as { phone?: string };

  if (!phone) {
    return res.status(400).json({ error: "Phone number is required" });
  }

  const normalized = normalizePhone(phone);
  if (!isValidPhone(normalized)) {
    return res.status(400).json({ error: "Please enter valid 10-digit mobile number" });
  }

  const now      = Date.now();
  const existing = otpStore.get(normalized);

  // Rate limit: max 3 requests per 10-minute window
  if (existing) {
    const windowAge = now - existing.windowStart;
    if (windowAge < 10 * 60 * 1000 && existing.requestCount >= 3) {
      const waitMins = Math.ceil((10 * 60 * 1000 - windowAge) / 60000);
      return res.status(429).json({
        error: `Too many OTP requests. Please try again in ${waitMins} minute${waitMins > 1 ? "s" : ""}.`,
      });
    }
  }

  const otp       = generateOTP();
  const expiresAt = now + 5 * 60 * 1000;
  otpStore.set(normalized, {
    otp,
    expiresAt,
    requestCount: existing && now - existing.windowStart < 10 * 60 * 1000 ? existing.requestCount + 1 : 1,
    windowStart:  existing && now - existing.windowStart < 10 * 60 * 1000 ? existing.windowStart : now,
  });

  console.log(`[otp] ✅ Generated OTP for +91${normalized}: ${otp}`);

  const { sent, reason } = await sendSMSOTP(normalized, otp);

  if (sent) {
    console.log(`[otp] ✅ OTP sent via Twilio to +91${normalized}`);
    // Always include OTP in response as a backup — Twilio WhatsApp sandbox
    // requires users to join ("join <keyword>") before receiving messages.
    // The frontend shows this as a fallback code in case WhatsApp delivery fails.
    return res.json({
      success: true,
      message: "OTP sent to your WhatsApp. If not received, use the backup code below.",
      devOtp: otp,
    });
  }

  // Twilio not configured or failed — return OTP directly for testing
  console.log(`[otp] ⚠️  SMS/WhatsApp not sent (${reason}). Returning OTP in response for testing.`);
  return res.json({
    success: true,
    message: "OTP generated. Use the code below to login.",
    devOtp: otp,
  });
});

// ── POST /api/auth/verify-otp ────────────────────────────────────────────────
// Verifies OTP, creates or finds user in DB, returns JWT

router.post("/auth/verify-otp", async (req, res) => {
  const { phone, otp, name } = req.body as { phone?: string; otp?: string; name?: string };

  if (!phone || !otp) {
    return res.status(400).json({ error: "Phone number and OTP are required" });
  }

  const normalized = normalizePhone(phone);
  const stored     = otpStore.get(normalized);

  if (!stored) {
    return res.status(400).json({ error: "No OTP found for this number. Please request a new one." });
  }
  if (Date.now() > stored.expiresAt) {
    otpStore.delete(normalized);
    return res.status(400).json({ error: "OTP has expired. Please request a new one." });
  }
  if (stored.otp !== otp.trim()) {
    return res.status(400).json({ error: "Invalid OTP. Please check and try again." });
  }

  otpStore.delete(normalized);

  try {
    // Find or create user by phone
    const rows = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.phone, normalized))
      .limit(1);

    let user: typeof usersTable.$inferSelect;

    if (rows.length) {
      user = rows[0];
    } else {
      // Create minimal OTP-only account
      const userName = name?.trim() || `User${normalized.slice(-4)}`;
      const [created] = await db
        .insert(usersTable)
        .values({
          name: userName,
          phone: normalized,
          email: null,
          passwordHash: null,
          role: "user",
          isApproved: true,
          otpUser: true,
          referralCode: generateReferralCode(),
          walletBalance: "0",
        })
        .returning();
      user = created;
    }

    const token = signToken({ userId: user.id, role: user.role, phone: user.phone ?? undefined, email: user.email ?? undefined });
    return res.json({ success: true, token, user: safeUser(user) });
  } catch (err: any) {
    console.error("[auth/verify-otp] error:", err.message);
    return res.status(500).json({ error: "Login failed. Please try again." });
  }
});

// ── POST /api/auth/link-email ────────────────────────────────────────────────
// Link email+password to an existing OTP-only account

router.post("/auth/link-email", requireAuth, async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email?.trim() || !isValidEmail(email)) {
    return res.status(400).json({ error: "Please enter a valid email address" });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }

  const cleanEmail = email.trim().toLowerCase();

  try {
    // Check email is not taken by another user
    const existing = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, cleanEmail))
      .limit(1);

    if (existing.length && existing[0].id !== req.jwtUser!.userId) {
      return res.status(409).json({ error: "This email is already linked to another account." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [updated] = await db
      .update(usersTable)
      .set({ email: cleanEmail, passwordHash, otpUser: false, updatedAt: new Date() })
      .where(eq(usersTable.id, req.jwtUser!.userId))
      .returning();

    return res.json({ success: true, user: safeUser(updated) });
  } catch (err: any) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "This email is already linked to another account." });
    }
    console.error("[auth/link-email] error:", err.message);
    return res.status(500).json({ error: "Failed to link email. Please try again." });
  }
});

// ── POST /api/auth/link-phone ────────────────────────────────────────────────
// Link mobile number to an existing email account (OTP required)

router.post("/auth/link-phone", requireAuth, async (req, res) => {
  const { phone, otp } = req.body as { phone?: string; otp?: string };

  if (!phone || !otp) {
    return res.status(400).json({ error: "Phone number and OTP are required" });
  }

  const normalized = normalizePhone(phone);
  if (!isValidPhone(normalized)) {
    return res.status(400).json({ error: "Please enter valid 10-digit mobile number" });
  }

  const stored = otpStore.get(normalized);
  if (!stored || Date.now() > stored.expiresAt || stored.otp !== otp.trim()) {
    return res.status(400).json({ error: "Invalid or expired OTP" });
  }
  otpStore.delete(normalized);

  try {
    // Check phone is not taken
    const existing = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.phone, normalized))
      .limit(1);

    if (existing.length && existing[0].id !== req.jwtUser!.userId) {
      return res.status(409).json({ error: "This mobile number is already linked to another account." });
    }

    const [updated] = await db
      .update(usersTable)
      .set({ phone: normalized, updatedAt: new Date() })
      .where(eq(usersTable.id, req.jwtUser!.userId))
      .returning();

    return res.json({ success: true, user: safeUser(updated) });
  } catch (err: any) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "This mobile number is already linked to another account." });
    }
    console.error("[auth/link-phone] error:", err.message);
    return res.status(500).json({ error: "Failed to link mobile. Please try again." });
  }
});

export default router;
