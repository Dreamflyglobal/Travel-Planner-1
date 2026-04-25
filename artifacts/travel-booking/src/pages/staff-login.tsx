import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { Eye, EyeOff, ShieldCheck, Users, BarChart2, MessageCircle } from "lucide-react";

export default function StaffLogin() {
  const [, setLocation] = useLocation();
  const { login, user }  = useAuth();
  const { toast }        = useToast();

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [showPw,   setShowPw]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [blocked,  setBlocked]  = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setBlocked(false);
    setLoading(true);
    const { user: loggedInUser, error: loginErr } = await login(email.trim(), password);
    setLoading(false);

    if (!loggedInUser) {
      toast({ title: loginErr || "Invalid email or password", variant: "destructive" });
      return;
    }

    if (loggedInUser.role !== "staff") {
      setBlocked(true);
      toast({
        title: "Access denied",
        description: "This login is for staff accounts only.",
        variant: "destructive",
      });
      return;
    }

    toast({ title: `Welcome, ${loggedInUser.name}!` });
    setLocation("/staff");
  }

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-slate-800 via-slate-900 to-gray-900 text-white flex-col justify-between p-12">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-bold text-white text-sm tracking-wide">Dream Fly Global</p>
            <p className="text-slate-400 text-xs uppercase tracking-widest">Staff Portal</p>
          </div>
        </div>

        <div>
          <h1 className="text-4xl font-extrabold mb-4 leading-tight">
            Your Leads,<br />
            <span className="text-slate-400">All in One Place</span>
          </h1>
          <p className="text-slate-400 text-base mb-10">
            Manage your assigned leads, update statuses, and reach customers directly from your dashboard.
          </p>

          <div className="space-y-4">
            {[
              { icon: Users,         label: "My Assigned Leads",   desc: "Only leads assigned to you are visible" },
              { icon: BarChart2,     label: "Track Progress",       desc: "Update lead status from New → Booked" },
              { icon: MessageCircle, label: "Call & WhatsApp",      desc: "Reach customers with one click" },
            ].map(({ icon: Icon, label, desc }) => (
              <div key={label} className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-slate-300" />
                </div>
                <div>
                  <p className="font-semibold text-sm text-white">{label}</p>
                  <p className="text-xs text-slate-400">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-slate-500">
          Need help? Contact your admin or{" "}
          <a href="mailto:support@dreamflyglobal.com" className="text-slate-300 hover:underline">support@dreamflyglobal.com</a>
        </p>
      </div>

      {/* Right panel */}
      <div className="w-full lg:w-1/2 flex items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-8 h-8 bg-slate-800 rounded-lg flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="font-bold text-slate-900 text-sm">Dream Fly Global</p>
              <p className="text-xs text-slate-400 uppercase tracking-widest">Staff Portal</p>
            </div>
          </div>

          <h2 className="text-2xl font-extrabold text-slate-900 mb-1">Staff Login</h2>
          <p className="text-slate-500 text-sm mb-7">Sign in to your staff account to manage leads.</p>

          {blocked && (
            <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 font-medium">
              This portal is for <strong>staff accounts only</strong>.{" "}
              <button className="underline font-semibold" onClick={() => setLocation("/login")}>
                Go to Customer Login
              </button>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-sm font-semibold text-slate-700 block mb-1.5">Email Address</label>
              <Input
                type="email"
                placeholder="staff@dreamflyglobal.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11"
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-700 block mb-1.5">Password</label>
              <div className="relative">
                <Input
                  type={showPw ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-11 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-slate-800 hover:bg-slate-900 text-white font-bold gap-2"
            >
              {loading ? "Signing in…" : "Sign In to Staff Portal"}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-slate-500 space-y-2">
            <p>
              Not a staff member?{" "}
              <button className="text-slate-700 font-semibold hover:underline" onClick={() => setLocation("/login")}>
                Customer Login
              </button>
            </p>
            <p>
              Travel agent?{" "}
              <button className="text-slate-700 font-semibold hover:underline" onClick={() => setLocation("/agent-login")}>
                Agent Portal
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
