import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ShieldCheck, Eye, EyeOff, Lock, Mail, AlertCircle } from "lucide-react";

const API = import.meta.env.VITE_API_BASE_URL ?? "";

export default function MasterAdminLogin() {
  const [, setLocation] = useLocation();
  const { isAdmin, isAuthenticated, refreshUser } = useAuth();

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [showPwd,  setShowPwd]  = useState(false);
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  // Already logged in as admin → go straight to dashboard
  useEffect(() => {
    if (isAuthenticated && isAdmin) {
      setLocation("/master-admin/dashboard");
    }
  }, [isAuthenticated, isAdmin, setLocation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please fill in all fields.");
      return;
    }
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setLoading(false);
        setError("Invalid credentials");
        return;
      }

      // Persist auth state
      localStorage.setItem("jwt_token", data.token);
      localStorage.setItem("isAdmin", "true");

      // Refresh AuthContext so navbar / AdminGuard pick up the new admin user
      await refreshUser();

      setLoading(false);
      setLocation("/master-admin/dashboard");
    } catch {
      setLoading(false);
      setError("Invalid credentials");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-4">

      {/* Subtle grid background */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
        }}
      />

      <div className="relative w-full max-w-md">

        {/* Badge */}
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-3 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-5 py-2.5">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg">
              <ShieldCheck className="w-4 h-4 text-white" />
            </div>
            <span className="text-white font-bold text-sm tracking-wide">Dream Fly Global · Master Admin</span>
          </div>
        </div>

        <Card className="border-0 shadow-2xl bg-white/95 backdrop-blur-sm">
          <CardHeader className="text-center pb-2 pt-8 px-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-700 flex items-center justify-center shadow-lg">
              <Lock className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900">Master Admin Login</h1>
            <p className="text-sm text-muted-foreground mt-1">Restricted access · Authorised personnel only</p>
          </CardHeader>

          <CardContent className="px-8 pb-8 pt-6">
            <form onSubmit={handleSubmit} className="space-y-5">

              {/* Email */}
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-sm font-semibold text-slate-700">
                  Admin Email
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="admin@dreamflyglobal.com"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(""); }}
                    className="pl-10 h-11 border-slate-200 focus:border-purple-500 focus:ring-purple-500/20"
                    autoComplete="email"
                    required
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-sm font-semibold text-slate-700">
                  Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPwd ? "text" : "password"}
                    placeholder="Enter admin password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(""); }}
                    className="pl-10 pr-10 h-11 border-slate-200 focus:border-purple-500 focus:ring-purple-500/20"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(!showPwd)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-slate-700 transition-colors"
                  >
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-50 border border-red-200">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700 font-medium">{error}</p>
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-11 bg-gradient-to-r from-purple-600 to-indigo-700 hover:from-purple-700 hover:to-indigo-800 text-white font-bold text-sm shadow-md"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Authenticating…
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4" />
                    Access Admin Panel
                  </span>
                )}
              </Button>
            </form>

            <div className="mt-6 pt-5 border-t border-slate-100 text-center">
              <p className="text-xs text-muted-foreground">
                🔒 This area is restricted to Dream Fly Global administrators.<br />
                Unauthorised access attempts are logged.
              </p>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-white/40 mt-6">
          © {new Date().getFullYear()} Dream Fly Global · All rights reserved
        </p>
      </div>
    </div>
  );
}
