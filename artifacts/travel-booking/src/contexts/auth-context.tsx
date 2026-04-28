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

// ── Storage keys ──────────────────────────────────────────────────────────────
// Each portal uses its own localStorage key so sessions never bleed across roles.
//   B2C  customers → "b2c_token"
//   B2B  agents    → "agent_token"
//   Admin          → "admin_token"
//
// Legacy keys ("jwt_token", "admin_jwt") are migrated on first load and removed.

const B2C_TOKEN_KEY   = "b2c_token";
const AGENT_TOKEN_KEY = "agent_token";
const ADMIN_TOKEN_KEY = "admin_token";

// Legacy key names — only used for one-time migration
const LEGACY_USER_KEY  = "jwt_token";
const LEGACY_ADMIN_KEY = "admin_jwt";

function isAdminJwt(token: string): boolean {
  try {
    const p = JSON.parse(atob(token.split(".")[1]));
    return p.userId === 0 && p.role === "admin";
  } catch {
    return false;
  }
}

/** Determine which portal the current URL belongs to */
function currentPortal(): "admin" | "agent" | "b2c" {
  const path = window.location.pathname;
  if (path.startsWith("/master-admin")) return "admin";
  if (path.startsWith("/agent") || path.startsWith("/agent-login") || path.startsWith("/agent-signup")) return "agent";
  return "b2c";
}

/** Return the active token for the current portal */
function getActiveToken(): string | null {
  switch (currentPortal()) {
    case "admin": return localStorage.getItem(ADMIN_TOKEN_KEY);
    case "agent": return localStorage.getItem(AGENT_TOKEN_KEY);
    default:      return localStorage.getItem(B2C_TOKEN_KEY);
  }
}

function authHeader(): Record<string, string> {
  const token = getActiveToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** One-time migration of legacy storage keys */
function migrateLegacyKeys() {
  const legacyUser  = localStorage.getItem(LEGACY_USER_KEY);
  const legacyAdmin = localStorage.getItem(LEGACY_ADMIN_KEY);

  if (legacyAdmin && isAdminJwt(legacyAdmin)) {
    localStorage.setItem(ADMIN_TOKEN_KEY, legacyAdmin);
    localStorage.removeItem(LEGACY_ADMIN_KEY);
  } else if (legacyAdmin) {
    localStorage.removeItem(LEGACY_ADMIN_KEY);
  }

  if (legacyUser && isAdminJwt(legacyUser)) {
    localStorage.setItem(ADMIN_TOKEN_KEY, legacyUser);
    localStorage.removeItem(LEGACY_USER_KEY);
  } else if (legacyUser) {
    localStorage.setItem(B2C_TOKEN_KEY, legacyUser);
    localStorage.removeItem(LEGACY_USER_KEY);
  }
}

// ── Context ───────────────────────────────────────────────────────────────────

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isAgent: boolean;
  isStaff: boolean;
  /** B2C email+password login → stores in b2c_token */
  login: (email: string, password: string) => Promise<{ user: User | null; error?: string; code?: string }>;
  /** Agent portal login → stores in agent_token */
  loginAgent: (email: string, password: string) => Promise<{ user: User | null; error?: string; code?: string }>;
  /** Admin portal login → stores in admin_token */
  loginAdmin: (email: string, password: string) => Promise<{ user: User | null; error?: string }>;
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
    migrateLegacyKeys();

    const portal = currentPortal();

    if (portal === "admin") {
      const token = localStorage.getItem(ADMIN_TOKEN_KEY);
      if (token && isAdminJwt(token)) {
        const adminEmail = process.env.ADMIN_EMAIL || "admin@dreamflyglobal.com";
        setUser({ id: 0, name: "Admin", email: adminEmail, role: "admin" });
      } else {
        if (token) localStorage.removeItem(ADMIN_TOKEN_KEY); // stale
        setUser(null);
      }
      setLoaded(true);
      return;
    }

    if (portal === "agent") {
      const token = localStorage.getItem(AGENT_TOKEN_KEY);
      if (!token) { setLoaded(true); return; }
      try {
        const res = await fetch(`${API}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.user.role === "agent") {
            setUser(data.user);
          } else {
            localStorage.removeItem(AGENT_TOKEN_KEY);
            setUser(null);
          }
        } else {
          localStorage.removeItem(AGENT_TOKEN_KEY);
          setUser(null);
        }
      } catch {
        // network error — keep user optimistically if token present
      }
      setLoaded(true);
      return;
    }

    // B2C portal (default)
    const token = localStorage.getItem(B2C_TOKEN_KEY);
    if (!token) { setLoaded(true); return; }
    try {
      const res = await fetch(`${API}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        const role = data.user.role;
        if (role === "user" || role === "staff") {
          setUser(data.user);
        } else {
          // Agent or admin token in B2C slot — remove it
          localStorage.removeItem(B2C_TOKEN_KEY);
          setUser(null);
        }
      } else {
        localStorage.removeItem(B2C_TOKEN_KEY);
        setUser(null);
      }
    } catch {
      // network error — keep session optimistically
    }
    setLoaded(true);
  };

  useEffect(() => { loadUser(); }, []);

  const refreshUser = async () => { await loadUser(); };

  // ── login (B2C) ─────────────────────────────────────────────────────────────
  const login = async (email: string, password: string): Promise<{ user: User | null; error?: string; code?: string }> => {
    try {
      const res = await fetch(`${API}/api/auth/login-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { user: null, error: data.error || "Invalid email or password.", code: data.code };
      }
      localStorage.setItem(B2C_TOKEN_KEY, data.token);
      setUser(data.user);
      return { user: data.user as User };
    } catch {
      return { user: null, error: "Network error. Please check your connection." };
    }
  };

  // ── loginAgent (B2B) ────────────────────────────────────────────────────────
  const loginAgent = async (email: string, password: string): Promise<{ user: User | null; error?: string; code?: string }> => {
    try {
      const res = await fetch(`${API}/api/auth/login-agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { user: null, error: data.error || "Invalid credentials.", code: data.code };
      }
      localStorage.setItem(AGENT_TOKEN_KEY, data.token);
      setUser(data.user);
      return { user: data.user as User };
    } catch {
      return { user: null, error: "Network error. Please check your connection." };
    }
  };

  // ── loginAdmin ──────────────────────────────────────────────────────────────
  const loginAdmin = async (email: string, password: string): Promise<{ user: User | null; error?: string }> => {
    try {
      const res = await fetch(`${API}/api/auth/login-admin`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { user: null, error: data.error || "Invalid credentials" };
      }
      localStorage.setItem(ADMIN_TOKEN_KEY, data.token);
      setUser(data.user);
      return { user: data.user as User };
    } catch {
      return { user: null, error: "Network error. Please check your connection." };
    }
  };

  // ── loginWithOTP ─────────────────────────────────────────────────────────────
  const loginWithOTP = async (phone: string, otp?: string): Promise<{ success: boolean; user?: User; token?: string }> => {
    try {
      const cleanPhone = normalizePhone(phone);
      if (otp) {
        const res = await fetch(`${API}/api/auth/verify-otp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: cleanPhone, otp }),
        });
        const data = await res.json();
        if (!res.ok) return { success: false };
        localStorage.setItem(B2C_TOKEN_KEY, data.token);
        setUser(data.user);
        return { success: true, user: data.user, token: data.token };
      }
      return { success: false };
    } catch {
      return { success: false };
    }
  };

  // ── signup ───────────────────────────────────────────────────────────────────
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
        body: JSON.stringify({ name: name.trim(), email: email.trim(), phone: cleanPhone, password, role, agencyName, gstNumber }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.code === "duplicate_email") return { success: false, error: "duplicate_email" };
        if (data.code === "duplicate_phone") return { success: false, error: "duplicate_phone" };
        return { success: false, error: data.error || "Registration failed" };
      }

      // Store in the correct slot based on the registered role
      if (role === "agent") {
        localStorage.setItem(AGENT_TOKEN_KEY, data.token);
      } else {
        localStorage.setItem(B2C_TOKEN_KEY, data.token);
      }
      setUser(data.user);
      return { success: true };
    } catch {
      return { success: false, error: "Network error" };
    }
  };

  // ── autoLoginOrRegister ──────────────────────────────────────────────────────
  const autoLoginOrRegister = async (name: string, email: string, phone: string): Promise<AutoLoginResult> => {
    const cleanPhone = phone ? normalizePhone(phone) : "";
    try {
      const generatedPassword = Array.from(crypto.getRandomValues(new Uint8Array(12)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
        .slice(0, 12);

      const res = await fetch(`${API}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name || email.split("@")[0], email: email.trim(), phone: cleanPhone, password: generatedPassword, role: "user" }),
      });
      const data = await res.json();

      if (res.ok) {
        localStorage.setItem(B2C_TOKEN_KEY, data.token);
        setUser(data.user);
        return { user: data.user, isNew: true, generatedPassword };
      }

      if (res.status === 409) {
        if (user) return { user, isNew: false };
        return { user: { id: `auto_${Date.now()}`, name: name || email.split("@")[0], email, phone: cleanPhone, role: "user" }, isNew: false };
      }

      throw new Error(data.error || "Failed");
    } catch {
      return { user: { id: `auto_${Date.now()}`, name: name || email.split("@")[0], email, phone: cleanPhone, role: "user" }, isNew: false };
    }
  };

  // ── logout ───────────────────────────────────────────────────────────────────
  const logout = () => {
    localStorage.removeItem(B2C_TOKEN_KEY);
    localStorage.removeItem(AGENT_TOKEN_KEY);
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem("isAdmin");
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isAdmin:  user?.role === "admin",
        isAgent:  user?.role === "agent",
        isStaff:  user?.role === "staff",
        login,
        loginAgent,
        loginAdmin,
        loginWithOTP,
        signup,
        logout,
        refreshUser,
        autoLoginOrRegister,
        getToken: getActiveToken,
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
