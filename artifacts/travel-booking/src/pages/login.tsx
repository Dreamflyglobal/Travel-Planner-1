import { APP_NAME } from "@/lib/app-config";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { PHONE_REGEX, normalizePhone } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Sparkles, Mail, Lock, User, Phone, ArrowRight,
  CheckCircle2, AlertTriangle, Building2, MessageSquare,
  RefreshCw, Eye, EyeOff, ShieldCheck,
} from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.VITE_API_BASE_URL ?? "";

type LoginMode = "detect" | "email" | "phone-otp";
type OtpStep  = "send" | "verify";

export default function Login() {
  const [, setLocation] = useLocation();
  const { login, loginWithOTP, signup, logout, isAuthenticated } = useAuth();

  const returnTo = new URLSearchParams(window.location.search).get("returnTo") || "/";

  // ── Login state ──────────────────────────────────────────────────────────────
  const [loginInput,    setLoginInput]    = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showPassword,  setShowPassword]  = useState(false);
  const [loginMode,     setLoginMode]     = useState<LoginMode>("detect");
  const [loginError,    setLoginError]    = useState("");
  const [loginLoading,  setLoginLoading]  = useState(false);

  // OTP sub-flow
  const [otpStep,      setOtpStep]      = useState<OtpStep>("send");
  const [otpValue,     setOtpValue]     = useState("");
  const [otpError,     setOtpError]     = useState("");
  const [otpSending,   setOtpSending]   = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpResendCD,  setOtpResendCD]  = useState(0);
  const [devOtp,       setDevOtp]       = useState(""); // shown when SMS not configured

  // ── Signup state ─────────────────────────────────────────────────────────────
  const [signupName,            setSignupName]            = useState("");
  const [signupEmail,           setSignupEmail]           = useState("");
  const [signupPhone,           setSignupPhone]           = useState("");
  const [signupPhoneError,      setSignupPhoneError]      = useState("");
  const [signupPassword,        setSignupPassword]        = useState("");
  const [signupConfirmPassword, setSignupConfirmPassword] = useState("");
  const [signupError,           setSignupError]           = useState("");
  const [signupLoading,         setSignupLoading]         = useState(false);
  const [showSignupPw,          setShowSignupPw]          = useState(false);
  const [showSignupConfirmPw,   setShowSignupConfirmPw]   = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      setLocation(returnTo);
    }
  }, [isAuthenticated]);

  if (isAuthenticated) return null;

  // ── Detect mode from input ──────────────────────────────────────────────────
  // Only switch to phone-OTP when the input is clearly a full phone number
  // (all digits, 10 characters). Typing partial digits keeps the email form visible.
  const detectMode = (value: string): LoginMode => {
    if (value.includes("@")) return "email";
    const digits = value.replace(/\D/g, "");
    if (/^\d+$/.test(value.trim()) && digits.length >= 10) return "phone-otp";
    return "detect";
  };

  const handleLoginInputChange = (value: string) => {
    setLoginInput(value);
    setLoginError("");
    setOtpStep("send");
    setOtpValue("");
    setOtpError("");
    setDevOtp("");
    const mode = detectMode(value);
    setLoginMode(mode);
  };

  // ── OTP resend countdown ────────────────────────────────────────────────────
  useEffect(() => {
    if (otpResendCD <= 0) return;
    const t = setTimeout(() => setOtpResendCD((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [otpResendCD]);

  // ── Send OTP ────────────────────────────────────────────────────────────────
  const handleSendOTP = async () => {
    const phone = normalizePhone(loginInput);
    if (!PHONE_REGEX.test(phone)) {
      setLoginError("Please enter valid 10-digit mobile number");
      return;
    }

    setOtpSending(true);
    setLoginError("");
    setOtpError("");

    try {
      const res  = await fetch(`${BASE}/api/auth/send-otp`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ phone }),
      });
      const data = await res.json();

      if (!res.ok) {
        setLoginError(data.error || "Failed to send OTP. Please try again.");
      } else {
        setOtpStep("verify");
        setOtpResendCD(30);
        if (data.devOtp) {
          setDevOtp(data.devOtp);
        }
      }
    } catch {
      setLoginError("Network error. Please try again.");
    } finally {
      setOtpSending(false);
    }
  };

  // ── Verify OTP ──────────────────────────────────────────────────────────────
  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    const phone = normalizePhone(loginInput);

    if (!otpValue.trim() || otpValue.trim().length !== 6) {
      setOtpError("Please enter the 6-digit OTP");
      return;
    }

    setOtpVerifying(true);
    setOtpError("");

    try {
      const result = await loginWithOTP(phone, otpValue.trim());
      if (result.success) {
        const role = result.user?.role ?? "user";
        if (role === "agent") { logout(); setLoginError("agent_blocked"); return; }
        setLocation(returnTo);
      } else {
        setOtpError("Invalid or expired OTP. Please try again.");
      }
    } catch {
      setOtpError("Network error. Please try again.");
    } finally {
      setOtpVerifying(false);
    }
  };

  // ── Email + password login ──────────────────────────────────────────────────
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);

    if (!loginInput.trim() || !loginPassword) {
      setLoginError("Please fill in all fields");
      setLoginLoading(false);
      return;
    }

    const { user: loggedInUser, error: loginErr, code: loginCode } = await login(loginInput.trim(), loginPassword);

    if (loggedInUser) {
      const role = loggedInUser.role;
      if (role === "agent") { logout(); setLoginError("agent_blocked"); setLoginLoading(false); return; }
      if (role === "admin") setLocation("/master-admin/dashboard");
      else setLocation(returnTo);
    } else if (loginCode === "otp_account") {
      // Account exists but was created with OTP — switch to OTP mode automatically
      const digits = loginInput.replace(/\D/g, "");
      if (digits.length === 0) {
        setLoginError("This account uses mobile OTP login. Please enter your mobile number instead.");
      } else {
        setLoginError("otp_account");
      }
    } else {
      setLoginError(loginErr || "Invalid email or password. Please try again.");
    }

    setLoginLoading(false);
  };

  // ── Signup phone handler — only update state while typing, validate on submit ─
  const handleSignupPhoneChange = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 10);
    setSignupPhone(digits);
    setSignupPhoneError(""); // clear any previous error while typing
  };

  // ── Signup ──────────────────────────────────────────────────────────────────
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignupError("");

    if (!signupName.trim() || !signupEmail.trim() || !signupPhone || !signupPassword || !signupConfirmPassword) {
      setSignupError("Please fill in all required fields");
      return;
    }

    const cleanPhone = normalizePhone(signupPhone);
    if (!PHONE_REGEX.test(cleanPhone)) {
      setSignupPhoneError("Please enter valid 10-digit mobile number");
      return;
    }

    if (signupPassword !== signupConfirmPassword) {
      setSignupError("Passwords do not match");
      return;
    }

    if (signupPassword.length < 6) {
      setSignupError("Password must be at least 6 characters");
      return;
    }

    setSignupLoading(true);

    const result = await signup(signupName.trim(), signupEmail.trim(), cleanPhone, signupPassword, "user");

    if (result.success) {
      setLocation(returnTo);
    } else if (result.error === "duplicate_email") {
      setSignupError("Account already exists. Please login.");
    } else if (result.error === "duplicate_phone") {
      setSignupError("Account already exists. Please login.");
    } else if (result.error === "invalid_phone") {
      setSignupPhoneError("Please enter valid 10-digit mobile number");
    } else {
      setSignupError("Something went wrong. Please try again.");
    }

    setSignupLoading(false);
  };

  const isPhoneMode  = loginMode === "phone-otp";
  const isEmailMode  = loginMode === "email";
  const showPwField  = isEmailMode || (!isPhoneMode && loginInput.length > 0 && !isPhoneMode);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center p-4">
      <div className="w-full max-w-6xl grid lg:grid-cols-2 gap-8 items-center">

        {/* ── Left branding ──────────────────────────────────────────────────── */}
        <div className="hidden lg:flex flex-col justify-center p-12">
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shadow-lg">
                <Sparkles className="w-10 h-10 text-white" />
              </div>
              <div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  {APP_NAME}
                </h1>
                <p className="text-muted-foreground">Explore the world with us</p>
              </div>
            </div>
            <h2 className="text-4xl font-bold mb-4">
              Your Journey <br />
              <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Starts Here
              </span>
            </h2>
            <p className="text-lg text-muted-foreground mb-8">
              Book flights, hotels, buses and holiday packages at the best prices. Join thousands of happy travellers!
            </p>
            <div className="space-y-4">
              {[
                "Best Price Guarantee",
                "OTP Login — No Password Needed",
                "Instant Booking Confirmation",
                "Secure Payment Gateway",
              ].map((f) => (
                <div key={f} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  </div>
                  <span className="font-medium">{f}</span>
                </div>
              ))}
            </div>
            <div className="mt-10 p-4 rounded-xl border border-blue-200 bg-blue-50 flex items-center gap-3">
              <Building2 className="w-5 h-5 text-blue-600 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-blue-900">Travel Agent?</p>
                <p className="text-xs text-blue-700">
                  Use the{" "}
                  <Link href="/agent-login" className="font-bold underline underline-offset-2 hover:text-blue-900">
                    Agent Portal
                  </Link>{" "}
                  for B2B rates and commissions.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Right card ─────────────────────────────────────────────────────── */}
        <Card className="shadow-2xl border-0">
          <CardHeader className="space-y-1 pb-6">
            <div className="lg:hidden flex items-center justify-center gap-2 mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
                <Sparkles className="w-7 h-7 text-white" />
              </div>
              <span className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                {APP_NAME}
              </span>
            </div>
            <CardTitle className="text-2xl text-center">Customer Login</CardTitle>
            <CardDescription className="text-center">Sign in or create your traveller account</CardDescription>
          </CardHeader>

          <CardContent>
            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="login">Login</TabsTrigger>
                <TabsTrigger value="signup">Sign Up</TabsTrigger>
              </TabsList>

              {/* ════════════════ LOGIN TAB ════════════════ */}
              <TabsContent value="login">
                {/* Agent blocked alert */}
                {loginError === "agent_blocked" ? (
                  <Alert className="border-orange-300 bg-orange-50 mb-4">
                    <AlertTriangle className="h-4 w-4 text-orange-600" />
                    <AlertDescription className="text-orange-900">
                      <p className="font-semibold mb-1">Agent accounts must use the Agent Portal.</p>
                      <Link href="/agent-login">
                        <Button size="sm" className="mt-1 h-8 bg-orange-500 hover:bg-orange-600 text-white gap-1.5">
                          <Building2 className="w-3.5 h-3.5" /> Go to Agent Login
                        </Button>
                      </Link>
                    </AlertDescription>
                  </Alert>
                ) : loginError === "otp_account" ? (
                  <Alert className="border-blue-300 bg-blue-50 mb-4">
                    <Phone className="h-4 w-4 text-blue-600" />
                    <AlertDescription className="text-blue-900">
                      <p className="font-semibold mb-1">This account uses mobile OTP login.</p>
                      <p className="text-xs mb-2">Enter your mobile number to receive an OTP.</p>
                      <Button
                        size="sm"
                        className="mt-1 h-8 bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
                        onClick={() => {
                          setLoginInput("");
                          setLoginMode("phone-otp");
                          setLoginError("");
                        }}
                      >
                        <MessageSquare className="w-3.5 h-3.5" /> Switch to OTP Login
                      </Button>
                    </AlertDescription>
                  </Alert>
                ) : loginError ? (
                  <Alert variant="destructive" className="mb-4">
                    <AlertDescription>{loginError}</AlertDescription>
                  </Alert>
                ) : null}

                {/* ── Phone OTP flow ── */}
                {isPhoneMode ? (
                  <div className="space-y-4">
                    {/* Info badge */}
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-xs">
                      <MessageSquare className="w-4 h-4 shrink-0 text-blue-600" />
                      <span>Login with a one-time password sent to your mobile</span>
                    </div>

                    {/* Phone input */}
                    <div className="space-y-2">
                      <Label>Mobile Number</Label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="tel"
                          inputMode="numeric"
                          placeholder="10-digit mobile number"
                          value={loginInput}
                          onChange={(e) => handleLoginInputChange(e.target.value.replace(/\D/g, "").slice(0, 10))}
                          className="pl-10 h-11"
                          maxLength={10}
                        />
                      </div>
                    </div>

                    {otpStep === "send" ? (
                      <Button
                        type="button"
                        className="w-full h-11 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                        onClick={handleSendOTP}
                        disabled={otpSending || loginInput.replace(/\D/g, "").length < 10}
                      >
                        {otpSending ? (
                          <><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Sending OTP...</>
                        ) : (
                          <><MessageSquare className="mr-2 h-4 w-4" /> Send OTP</>
                        )}
                      </Button>
                    ) : (
                      <form onSubmit={handleVerifyOTP} className="space-y-4">
                        {/* OTP backup code — shown always */}
                        {devOtp && (
                          <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-3 space-y-2">
                            <div className="flex items-center gap-2 text-amber-800">
                              <ShieldCheck className="w-4 h-4 shrink-0 text-amber-600" />
                              <span className="text-xs font-semibold">Your OTP Code</span>
                            </div>
                            <div className="text-center">
                              <span className="font-mono text-3xl font-bold tracking-[0.3em] text-amber-900">{devOtp}</span>
                            </div>
                            <p className="text-xs text-amber-700 text-center">
                              Also sent via WhatsApp to +91 {loginInput.replace(/\D/g, "").slice(0, 10)}
                            </p>
                            <div className="text-xs text-amber-600 bg-amber-100 rounded p-2">
                              <strong>WhatsApp not received?</strong> Send <code className="bg-white px-1 rounded">join &lt;keyword&gt;</code> to <strong>+1 415 523 8886</strong> on WhatsApp to join the sandbox first.
                            </div>
                          </div>
                        )}

                        <div className="space-y-2">
                          <Label>Enter OTP</Label>
                          <Input
                            type="text"
                            inputMode="numeric"
                            placeholder="6-digit OTP"
                            value={otpValue}
                            onChange={(e) => {
                              setOtpValue(e.target.value.replace(/\D/g, "").slice(0, 6));
                              setOtpError("");
                            }}
                            className={cn("h-11 text-center text-xl font-mono tracking-widest", otpError && "border-red-500")}
                            maxLength={6}
                            autoFocus
                          />
                          {otpError && <p className="text-xs text-red-500">{otpError}</p>}
                          <p className="text-xs text-muted-foreground">OTP sent to +91 {loginInput.replace(/\D/g, "").slice(0, 10)}</p>
                        </div>

                        <Button
                          type="submit"
                          className="w-full h-11 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                          disabled={otpVerifying || otpValue.length < 6}
                        >
                          {otpVerifying ? (
                            <><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Verifying...</>
                          ) : (
                            <><ShieldCheck className="mr-2 h-4 w-4" /> Verify & Login</>
                          )}
                        </Button>

                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>Didn't receive OTP?</span>
                          {otpResendCD > 0 ? (
                            <span>Resend in {otpResendCD}s</span>
                          ) : (
                            <button
                              type="button"
                              className="text-primary font-semibold hover:underline"
                              onClick={() => { setOtpStep("send"); setOtpValue(""); setOtpError(""); setDevOtp(""); }}
                            >
                              Resend OTP
                            </button>
                          )}
                        </div>
                      </form>
                    )}

                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-foreground w-full text-center"
                      onClick={() => { setLoginInput(""); setLoginMode("detect"); setOtpStep("send"); setOtpValue(""); setLoginError(""); setDevOtp(""); }}
                    >
                      ← Use email instead
                    </button>
                  </div>
                ) : (
                  /* ── Email + password flow ── */
                  <form onSubmit={handleEmailLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="login-input">Email or Mobile Number</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="login-input"
                          type="text"
                          placeholder="your@email.com or 9876543210"
                          value={loginInput}
                          onChange={(e) => handleLoginInputChange(e.target.value)}
                          className="pl-10 h-11"
                          autoComplete="username"
                        />
                      </div>
                      {loginInput.length > 0 && !isPhoneMode && (
                        <p className="text-xs text-muted-foreground">
                          {loginInput.replace(/\D/g, "").length >= 10
                            ? "Enter a valid 10-digit mobile to use OTP login"
                            : "Enter email for password login · or enter mobile for OTP"}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="login-password">Password</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="login-password"
                          type={showPassword ? "text" : "password"}
                          placeholder="••••••••"
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          className="pl-10 pr-10 h-11"
                          autoComplete="current-password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <Button
                      type="submit"
                      className="w-full h-11 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                      disabled={loginLoading}
                    >
                      {loginLoading ? "Logging in..." : <>Login <ArrowRight className="ml-2 h-4 w-4" /></>}
                    </Button>

                    <div className="relative my-1">
                      <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-background px-2 text-muted-foreground">Or</span>
                      </div>
                    </div>

                    <Link href="/">
                      <Button type="button" variant="outline" className="w-full h-11">
                        Continue as Guest
                      </Button>
                    </Link>

                    <p className="text-center text-xs text-muted-foreground">
                      Travel Agent?{" "}
                      <Link href="/agent-login" className="font-semibold text-blue-600 hover:underline">
                        Use Agent Portal →
                      </Link>
                    </p>
                  </form>
                )}
              </TabsContent>

              {/* ════════════════ SIGN UP TAB ════════════════ */}
              <TabsContent value="signup">
                <form onSubmit={handleSignup} className="space-y-4">
                  {signupError && (
                    <Alert variant="destructive">
                      <AlertDescription>{signupError}</AlertDescription>
                    </Alert>
                  )}

                  <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-xs">
                    <User className="w-4 h-4 shrink-0 text-blue-600" />
                    <span>
                      Creates a <strong>Customer</strong> account. Travel Agents should{" "}
                      <Link href="/agent-signup" className="font-semibold underline underline-offset-2">register here</Link>.
                    </span>
                  </div>

                  {/* Name */}
                  <div className="space-y-2">
                    <Label htmlFor="su-name">Full Name *</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="su-name"
                        placeholder="John Doe"
                        value={signupName}
                        onChange={(e) => setSignupName(e.target.value)}
                        className="pl-10 h-11"
                        required
                      />
                    </div>
                  </div>

                  {/* Email */}
                  <div className="space-y-2">
                    <Label htmlFor="su-email">Email *</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="su-email"
                        type="email"
                        placeholder="your@email.com"
                        value={signupEmail}
                        onChange={(e) => setSignupEmail(e.target.value)}
                        className="pl-10 h-11"
                        required
                      />
                    </div>
                  </div>

                  {/* Phone */}
                  <div className="space-y-2">
                    <Label htmlFor="su-phone">Mobile Number *</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="su-phone"
                        type="tel"
                        inputMode="numeric"
                        placeholder="9876543210"
                        value={signupPhone}
                        onChange={(e) => handleSignupPhoneChange(e.target.value)}
                        className={cn("pl-10 h-11", signupPhoneError && "border-red-500 focus-visible:ring-red-500")}
                        maxLength={10}
                        required
                      />
                    </div>
                    {signupPhoneError ? (
                      <p className="text-xs text-red-500 font-medium">{signupPhoneError}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">10 digits, numbers only (e.g. 9876543210)</p>
                    )}
                  </div>

                  {/* Password */}
                  <div className="space-y-2">
                    <Label htmlFor="su-pw">Password *</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="su-pw"
                        type={showSignupPw ? "text" : "password"}
                        placeholder="Minimum 6 characters"
                        value={signupPassword}
                        onChange={(e) => setSignupPassword(e.target.value)}
                        className="pl-10 pr-10 h-11"
                        required
                        minLength={6}
                      />
                      <button
                        type="button"
                        onClick={() => setShowSignupPw(!showSignupPw)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showSignupPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Confirm Password */}
                  <div className="space-y-2">
                    <Label htmlFor="su-confirm">Confirm Password *</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="su-confirm"
                        type={showSignupConfirmPw ? "text" : "password"}
                        placeholder="Repeat your password"
                        value={signupConfirmPassword}
                        onChange={(e) => setSignupConfirmPassword(e.target.value)}
                        className={cn(
                          "pl-10 pr-10 h-11",
                          signupConfirmPassword && signupPassword !== signupConfirmPassword && "border-red-400"
                        )}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowSignupConfirmPw(!showSignupConfirmPw)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showSignupConfirmPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {signupConfirmPassword && signupPassword !== signupConfirmPassword && (
                      <p className="text-xs text-red-500">Passwords do not match</p>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground">
                    By signing up you agree to our{" "}
                    <Link href="#" className="text-primary hover:underline">Terms</Link> and{" "}
                    <Link href="#" className="text-primary hover:underline">Privacy Policy</Link>
                  </p>

                  <Button
                    type="submit"
                    className="w-full h-11 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                    disabled={signupLoading}
                  >
                    {signupLoading ? "Creating account..." : <>Create Account <ArrowRight className="ml-2 h-4 w-4" /></>}
                  </Button>

                  <div className="relative my-1">
                    <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-background px-2 text-muted-foreground">Or</span>
                    </div>
                  </div>

                  <Link href="/">
                    <Button type="button" variant="outline" className="w-full h-11">
                      Continue as Guest
                    </Button>
                  </Link>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
