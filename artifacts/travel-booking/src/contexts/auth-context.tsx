import { createContext, useContext, useState, useEffect, ReactNode } from "react";

const API = import.meta.env.VITE_API_BASE_URL ?? "";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface User {
  id: number | string;
  name: string;
  email?: string | null;
  phone?: string | null;
  role: "user" | "admin" | "agent" | "staff";
  staffId?: string;
  agencyName?: string | null;
  gstNumber?: string | null;
  agentCode?: string | null;
  walletBalance?: string | number | null;
  commission?: string | number | null;
  agentMarkup?: number;
  isApproved?: boolean | null;
  referralCode?: string | null;
  referredBy?: string | null;
  otpUser?: boolean | null;
}

export interface AutoLoginResult {
  user: User;
  isNew: boolean;
  generatedPassword?: string;
}

export const PHONE_REGEX = /^[6-9][0-9]{9}$/;

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10);
}

export function isValidPhone(phone: string): boolean {
  return PHONE_REGEX.test(normalizePhone(phone));
}

// ── Token helpers ─────────────────────────────────────────────────────────────
// Admin sessions are stored under "admin_jwt"; B2C user sessions under "jwt_token".
// This keeps the two roles fully isolated — logging in as admin never pollutes
// the B2C user session and vice-versa.

const ADMIN_TOKEN_KEY = "admin_jwt";
const USER_TOKEN_KEY  = "jwt_token";

function isAdminJwt(token: string): boolean {
  try {
    const p = JSON.parse(atob(token.split(".")[1]));
    return p.userId === 0 && p.role === "admin";
  } catch {
    return false;
  }
}

/** Returns the active token: admin_jwt if an admin session exists, else jwt_token */
function getToken(): string | null {
  const adminToken = localStorage.getItem(ADMIN_TOKEN_KEY);
  if (adminToken && isAdminJwt(adminToken)) return adminToken;
  return localStorage.getItem(USER_TOKEN_KEY);
}

/** Store a B2C user token */
function setToken(token: string) {
  localStorage.setItem(USER_TOKEN_KEY, token);
}

/** Store an admin token (kept separate from B2C sessions) */
function setAdminToken(token: string) {
  localStorage.setItem(ADMIN_TOKEN_KEY, token);
}

/** Clear the B2C user token */
function clearToken() {
  localStorage.removeItem(USER_TOKEN_KEY);
}

/** Clear both tokens (full logout) */
function clearAllTokens() {
  localStorage.removeItem(USER_TOKEN_KEY);
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  localStorage.removeItem("isAdmin");
}

function authHeader(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ── Context ───────────────────────────────────────────────────────────────────

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isAgent: boolean;
  isStaff: boolean;
  login: (email: string, password: string) => Promise<{ user: User | null; error?: string; code?: string }>;
  loginWithOTP: (phone: string, otp?: string) => Promise<{ success: boolean; user?: User; token?: string }>;
  signup: (
    name: string,
    email: string,
    phone: string,
    password: string,
    role?: "user" | "agent",
    agencyName?: string,
    gstNumber?: string,
    referralCode?: string,
  ) => Promise<{ success: boolean; error?: "duplicate_email" | "duplicate_phone" | "invalid_phone" | string }>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  autoLoginOrRegister: (name: string, email: string, phone: string) => Promise<AutoLoginResult>;
  getToken: () => string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loaded, setLoaded] = useState(false);

  const loadUser = async () => {
    // ── 1. Check dedicated admin_jwt key first ────────────────────────────────
    const adminToken = localStorage.getItem(ADMIN_TOKEN_KEY);
    if (adminToken) {
      if (isAdminJwt(adminToken)) {
        setUser({ id: 0, name: "Admin", email: "admin@dreamflyglobal.com", role: "admin" });
        setLoaded(true);
        return;
      }
      // Stale / invalid admin token — remove it
      localStorage.removeItem(ADMIN_TOKEN_KEY);
    }

    // ── 2. Migrate legacy admin sessions stored in jwt_token ──────────────────
    const legacyToken = localStorage.getItem(USER_TOKEN_KEY);
    if (legacyToken && isAdminJwt(legacyToken)) {
      // Move to the correct key; clear from user slot
      localStorage.setItem(ADMIN_TOKEN_KEY, legacyToken);
      localStorage.removeItem(USER_TOKEN_KEY);
      setUser({ id: 0, name: "Admin", email: "admin@dreamflyglobal.com", role: "admin" });
      setLoaded(true);
      return;
    }

    // ── 3. Regular B2C user session ───────────────────────────────────────────
    const token = localStorage.getItem(USER_TOKEN_KEY);
    if (!token) { setLoaded(true); return; }

    try {
      const res = await fetch(`${API}/api/auth/me`, {
        headers: { ...authHeader(), "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else {
        clearToken();
        setUser(null);
      }
    } catch {
      // network error — keep user from last session if token exists
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => { loadUser(); }, []);

  const refreshUser = async () => { await loadUser(); };

  // ── login (email + password) ────────────────────────────────────────────────
  const login = async (email: string, password: string): Promise<{ user: User | null; error?: string; code?: string }> => {
    try {
      const res = await fetch(`${API}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { user: null, error: data.error || "Invalid email or password. Please try again.", code: data.code };
      }
      setToken(data.token);
      setUser(data.user);
      return { user: data.user as User };
    } catch {
      return { user: null, error: "Network error. Please check your connection." };
    }
  };

  // ── loginWithOTP (called after OTP is verified) ─────────────────────────────
  // Pass otp + phone to verify server-side, or just phone when token is returned inline
  const loginWithOTP = async (
    phone: string,
    otp?: string,
  ): Promise<{ success: boolean; user?: User; token?: string }> => {
    try {
      const cleanPhone = normalizePhone(phone);

      // If otp is provided, verify it with the backend
      if (otp) {
        const res = await fetch(`${API}/api/auth/verify-otp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: cleanPhone, otp }),
        });
        const data = await res.json();
        if (!res.ok) return { success: false };
        setToken(data.token);
        setUser(data.user);
        return { success: true, user: data.user, token: data.token };
      }

      return { success: false };
    } catch {
      return { success: false };
    }
  };

  // ── signup ──────────────────────────────────────────────────────────────────
  const signup = async (
    name: string,
    email: string,
    phone: string,
    password: string,
    role: "user" | "agent" = "user",
    agencyName?: string,
    gstNumber?: string,
    _referralCode?: string,
  ): Promise<{ success: boolean; error?: "duplicate_email" | "duplicate_phone" | "invalid_phone" | string }> => {
    try {
      const cleanPhone = normalizePhone(phone);
      if (phone && !PHONE_REGEX.test(cleanPhone)) {
        return { success: false, error: "invalid_phone" };
      }

      const res = await fetch(`${API}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: cleanPhone,
          password,
          role,
          agencyName,
          gstNumber,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.code === "duplicate_email") return { success: false, error: "duplicate_email" };
        if (data.code === "duplicate_phone") return { success: false, error: "duplicate_phone" };
        return { success: false, error: data.error || "Registration failed" };
      }

      setToken(data.token);
      setUser(data.user);
      return { success: true };
    } catch {
      return { success: false, error: "Network error" };
    }
  };

  // ── autoLoginOrRegister ─────────────────────────────────────────────────────
  const autoLoginOrRegister = async (
    name: string,
    email: string,
    phone: string,
  ): Promise<AutoLoginResult> => {
    const cleanPhone = phone ? normalizePhone(phone) : "";

    // Try login with email first (no password — use a temp OTP-less flow by checking if user exists)
    // We attempt registration; if duplicate_email, user already exists — they need to log in properly
    // For auto-registration (booking flow), create account without password
    try {
      const generatedPassword = Array.from(crypto.getRandomValues(new Uint8Array(12)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
        .slice(0, 12);

      const res = await fetch(`${API}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name || email.split("@")[0],
          email: email.trim(),
          phone: cleanPhone,
          password: generatedPassword,
          role: "user",
        }),
      });
      const data = await res.json();

      if (res.ok) {
        setToken(data.token);
        setUser(data.user);
        return { user: data.user, isNew: true, generatedPassword };
      }

      if (res.status === 409) {
        // User already exists — log them in with current session if available
        if (user) return { user, isNew: false };
        // Return a stub user object so booking flow doesn't break
        return {
          user: {
            id: `auto_${Date.now()}`,
            name: name || email.split("@")[0],
            email,
            phone: cleanPhone,
            role: "user",
          },
          isNew: false,
        };
      }

      throw new Error(data.error || "Failed");
    } catch {
      const fallback: User = {
        id: `auto_${Date.now()}`,
        name: name || email.split("@")[0],
        email,
        phone: cleanPhone,
        role: "user",
      };
      return { user: fallback, isNew: false };
    }
  };

  const logout = () => {
    clearAllTokens();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isAdmin: user?.role === "admin",
        isAgent: user?.role === "agent",
        isStaff: user?.role === "staff",
        login,
        loginWithOTP,
        signup,
        logout,
        refreshUser,
        autoLoginOrRegister,
        getToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
