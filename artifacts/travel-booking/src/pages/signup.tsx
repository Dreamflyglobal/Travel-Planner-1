import { useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { findUserByReferralCode } from "@/lib/referral";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Plane, Eye, EyeOff, User, Building2, ArrowRight, Gift, CheckCircle2, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Signup() {
  const [, setLocation] = useLocation();
  const searchStr = useSearch();
  const { signup } = useAuth();
  const { toast } = useToast();

  // Pre-fill referral code from URL ?ref=WWXXXXX
  const prefilledRef = new URLSearchParams(searchStr).get("ref") ?? "";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [referralCode, setReferralCode] = useState(prefilledRef.toUpperCase());
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const PHONE_REGEX = /^[6-9][0-9]{9}$/;

  const handlePhoneChange = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 10);
    setPhone(digits);
    if (digits.length === 0) {
      setPhoneError("");
    } else if (digits.length < 10 || !PHONE_REGEX.test(digits)) {
      setPhoneError("Enter valid 10-digit mobile number");
    } else {
      setPhoneError("");
    }
  };

  // Live referral code validation state
  const referralOwner = referralCode.length >= 5 ? findUserByReferralCode(referralCode) : null;
  const referralValid = !!referralOwner;
  const referralInvalid = referralCode.length >= 5 && !referralOwner;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name || !email || !phone || !password || !confirmPassword) {
      toast({ title: "Error", description: "Please fill in all required fields", variant: "destructive" });
      return;
    }

    if (password !== confirmPassword) {
      toast({ title: "Error", description: "Passwords do not match", variant: "destructive" });
      return;
    }

    if (!PHONE_REGEX.test(phone)) {
      setPhoneError("Enter valid 10-digit mobile number");
      toast({ title: "Error", description: "Enter valid 10-digit mobile number", variant: "destructive" });
      return;
    }

    if (password.length < 6) {
      toast({ title: "Error", description: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    try {
      const result = await signup(name, email, phone, password, "user", undefined, undefined, referralCode.trim() || undefined);
      if (result.success) {
        if (referralValid) {
          toast({
            title: "Account Created!",
            description: "₹50 has been added to your Travel Credits wallet!",
          });
        } else {
          toast({ title: "Account Created!", description: "Welcome to Dream Fly Global!" });
        }
        setLocation("/bookings");
      } else if (result.error === "duplicate_email") {
        toast({ title: "Error", description: "An account with this email already exists. Please login.", variant: "destructive" });
      } else if (result.error === "duplicate_phone") {
        toast({ title: "Error", description: "An account with this mobile number already exists. Please login.", variant: "destructive" });
      } else if (result.error === "invalid_phone") {
        setPhoneError("Please enter valid 10-digit mobile number");
        toast({ title: "Error", description: "Please enter valid 10-digit mobile number", variant: "destructive" });
      } else {
        toast({ title: "Error", description: "An account with this email or phone number already exists", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Something went wrong. Please try again.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/10 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/">
            <div className="inline-flex items-center gap-2 mb-4 cursor-pointer hover:opacity-80 transition-opacity">
              <div className="bg-primary text-primary-foreground p-2 rounded-lg">
                <Plane className="w-6 h-6" />
              </div>
              <span className="text-2xl font-bold">Dream Fly Global</span>
            </div>
          </Link>
          <h1 className="text-3xl font-bold mb-2">Create Account</h1>
          <p className="text-muted-foreground">Join us and start your adventure</p>
        </div>

        {/* Customer-only badge */}
        <div className="flex items-center gap-2 mb-4 p-3 rounded-xl border-2 border-primary/30 bg-primary/5">
          <User className="w-5 h-5 text-primary shrink-0" />
          <div>
            <p className="text-sm font-semibold text-foreground">Customer Account</p>
            <p className="text-xs text-muted-foreground">For travellers who want to book flights, hotels & more</p>
          </div>
        </div>

        <Card className="shadow-xl border-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" /> Sign Up
            </CardTitle>
            <CardDescription>Create a new customer account to get started</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name *</Label>
                <Input
                  id="name"
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone *</Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="9876543210"
                  value={phone}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  maxLength={10}
                  inputMode="numeric"
                  className={phoneError ? "border-red-500 focus-visible:ring-red-500" : ""}
                  required
                />
                {phoneError && (
                  <p className="text-xs text-red-500 font-medium">{phoneError}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password *</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Minimum 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password *</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Repeat your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                  </Button>
                </div>
              </div>

              {/* Referral Code Field */}
              <div className="space-y-2">
                <Label htmlFor="referralCode" className="flex items-center gap-1.5">
                  <Gift className="w-3.5 h-3.5 text-amber-500" />
                  Referral Code
                  <span className="text-muted-foreground font-normal text-xs">(optional)</span>
                </Label>
                <div className="relative">
                  <Input
                    id="referralCode"
                    placeholder="e.g. WWAB123"
                    value={referralCode}
                    onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
                    className={`font-mono pr-8 ${referralValid ? "border-green-400 focus-visible:ring-green-400" : referralInvalid ? "border-red-400 focus-visible:ring-red-400" : ""}`}
                  />
                  {referralValid && (
                    <CheckCircle2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-green-500" />
                  )}
                  {referralInvalid && (
                    <XCircle className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-red-400" />
                  )}
                </div>
                {referralValid && (
                  <p className="text-xs text-green-600 font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Referred by {referralOwner.name} — ₹50 will be added to your wallet instantly on signup!
                  </p>
                )}
                {referralInvalid && (
                  <p className="text-xs text-red-500">Invalid referral code. Please double-check.</p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={isLoading}
              >
                {isLoading ? "Creating account..." : <>Create Account <ArrowRight className="ml-2 h-4 w-4" /></>}
              </Button>

              <div className="text-center text-sm">
                <span className="text-muted-foreground">Already have an account? </span>
                <Link href="/login">
                  <span className="text-primary font-semibold hover:underline cursor-pointer">Sign In</span>
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Travel Agent promotion */}
        <div className="mt-5 p-4 rounded-xl border border-blue-200 bg-blue-50 flex items-start gap-3">
          <Building2 className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-blue-900">Are you a Travel Agent?</p>
            <p className="text-xs text-blue-700 mb-2">
              Register as a B2B agent to earn commissions and access exclusive rates.
            </p>
            <Link href="/agent-signup">
              <Button size="sm" className="h-8 bg-blue-600 hover:bg-blue-700 text-white gap-1.5">
                <Building2 className="w-3.5 h-3.5" />
                Register as Agent
              </Button>
            </Link>
          </div>
        </div>

        <div className="mt-4 text-center">
          <Link href="/">
            <span className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
              ← Back to Home
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
