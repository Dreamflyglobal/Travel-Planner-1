import { APP_NAME } from "@/lib/app-config";
import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Building2,
  Mail,
  Lock,
  ArrowRight,
  BadgeCheck,
  TrendingUp,
  Wallet,
  Globe,
  ShieldCheck,
  Eye,
  EyeOff,
  User,
} from "lucide-react";

export default function AgentLogin() {
  const [, setLocation] = useLocation();
  const { login, logout, isAuthenticated, user } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (isAuthenticated) {
    if (user?.role === "agent") setLocation("/agent");
    else if (user?.role === "admin") setLocation("/master-admin/dashboard");
    else setLocation("/");
    return null;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (!email || !password) {
      setError("Please enter your email and password.");
      setLoading(false);
      return;
    }

    const { user: loggedInUser } = await login(email, password);

    if (loggedInUser) {
      const role = loggedInUser.role;
      if (role === "agent") {
        setLocation("/agent");
      } else if (role === "admin") {
        setLocation("/master-admin/dashboard");
      } else {
        // Customer account — log them out and show a clear error with redirect
        logout();
        setError("customer_blocked");
        setLoading(false);
        return;
      }
    } else {
      setError("Invalid email or password. Please try again.");
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex">
      {/* Left Panel — Branding */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 p-12 text-white relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-64 h-64 rounded-full bg-blue-400 blur-3xl" />
          <div className="absolute bottom-20 right-10 w-80 h-80 rounded-full bg-indigo-500 blur-3xl" />
        </div>

        {/* Logo */}
        <div className="relative flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center backdrop-blur-sm">
            <Globe className="w-7 h-7 text-white" />
          </div>
          <div>
            <p className="text-xl font-bold tracking-tight">{APP_NAME}</p>
            <p className="text-blue-300 text-xs font-medium uppercase tracking-widest">B2B Agent Portal</p>
          </div>
        </div>

        {/* Main headline */}
        <div className="relative space-y-6">
          <div>
            <h1 className="text-5xl font-bold leading-tight mb-4">
              Your Partner in
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-cyan-300">
                Travel Business
              </span>
            </h1>
            <p className="text-blue-200 text-lg leading-relaxed">
              Access exclusive B2B rates, track your commissions, and grow your travel business with {APP_NAME}.
            </p>
          </div>

          {/* Feature list */}
          <div className="space-y-4">
            {[
              { icon: TrendingUp, label: "Earn Commission on Every Booking", desc: "Track real-time earnings from your dashboard" },
              { icon: BadgeCheck,  label: "Exclusive Agent Pricing",          desc: "Lower markups on flights, hotels, buses & packages" },
              { icon: Wallet,      label: "Wallet & Payouts",                 desc: "Manage your agent wallet and withdraw anytime" },
              { icon: ShieldCheck, label: "Dedicated Support",                desc: "Priority assistance for all your queries" },
            ].map(({ icon: Icon, label, desc }) => (
              <div key={label} className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-white/10 border border-white/15 flex items-center justify-center shrink-0 mt-0.5">
                  <Icon className="w-4 h-4 text-blue-300" />
                </div>
                <div>
                  <p className="font-semibold text-sm">{label}</p>
                  <p className="text-blue-300 text-xs mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer note */}
        <div className="relative">
          <p className="text-blue-400 text-xs">
            Not an agent yet?{" "}
            <Link href="/agent-signup" className="text-blue-300 underline underline-offset-2 hover:text-white transition-colors">
              Register your agency
            </Link>
          </p>
        </div>
      </div>

      {/* Right Panel — Login form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2 mb-8 justify-center">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <Globe className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-lg">{APP_NAME}</p>
              <p className="text-blue-300 text-[10px] font-medium uppercase tracking-widest">B2B Agent Portal</p>
            </div>
          </div>

          {/* Card */}
          <div className="bg-white/5 border border-white/10 backdrop-blur-xl rounded-2xl p-8 shadow-2xl">
            {/* Header */}
            <div className="mb-8">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center mb-4 shadow-lg">
                <Building2 className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-white">Agent Login</h2>
              <p className="text-blue-300 text-sm mt-1">Welcome back! Sign in to your agent account.</p>
            </div>

            {/* Form */}
            <form onSubmit={handleLogin} className="space-y-5">
              {error === "customer_blocked" ? (
                <Alert className="bg-orange-500/10 border-orange-400/40">
                  <User className="h-4 w-4 text-orange-300" />
                  <AlertDescription className="text-orange-200">
                    <p className="font-semibold mb-1">This portal is for agents only.</p>
                    <p className="text-xs text-orange-300 mb-2">Your account is a customer account. Please use the Customer Login.</p>
                    <Link href="/login">
                      <Button size="sm" className="h-8 bg-orange-500 hover:bg-orange-600 text-white gap-1.5 border-0">
                        <User className="w-3.5 h-3.5" />
                        Go to Customer Login
                      </Button>
                    </Link>
                  </AlertDescription>
                </Alert>
              ) : error ? (
                <Alert variant="destructive" className="bg-red-500/10 border-red-500/30 text-red-200">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}

              {/* Email */}
              <div className="space-y-1.5">
                <Label htmlFor="agent-email" className="text-blue-200 text-sm font-medium">
                  Email Address
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-400" />
                  <Input
                    id="agent-email"
                    type="email"
                    placeholder="agent@agency.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 h-11 bg-white/5 border-white/15 text-white placeholder:text-blue-400/60 focus:border-blue-400 focus:ring-blue-400/20"
                    required
                    autoComplete="email"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <Label htmlFor="agent-password" className="text-blue-200 text-sm font-medium">
                  Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-400" />
                  <Input
                    id="agent-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10 h-11 bg-white/5 border-white/15 text-white placeholder:text-blue-400/60 focus:border-blue-400 focus:ring-blue-400/20"
                    required
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-400 hover:text-blue-200 transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <Button
                type="submit"
                disabled={loading}
                className="w-full h-11 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-semibold shadow-lg shadow-blue-500/25 border-0 mt-2"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Signing in...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    Sign In to Agent Portal
                    <ArrowRight className="w-4 h-4" />
                  </span>
                )}
              </Button>
            </form>

            {/* Footer links */}
            <div className="mt-6 pt-6 border-t border-white/10 space-y-3 text-center text-sm">
              <p className="text-blue-300">
                New travel agency?{" "}
                <Link href="/agent-signup" className="text-white font-semibold hover:text-blue-200 transition-colors">
                  Register as Agent
                </Link>
              </p>
              <p className="text-blue-400 text-xs">
                Regular user?{" "}
                <Link href="/login" className="text-blue-300 hover:text-white transition-colors underline underline-offset-2">
                  Go to main login
                </Link>
              </p>
            </div>
          </div>

          {/* Help text */}
          <p className="text-center text-blue-500 text-xs mt-6">
            Need help? Contact your account manager or{" "}
            <span className="text-blue-400 cursor-pointer hover:text-blue-300">support@dreamflyglobal.com</span>
          </p>
        </div>
      </div>
    </div>
  );
}
