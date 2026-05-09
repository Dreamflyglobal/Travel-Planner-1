import { APP_NAME } from "@/lib/app-config";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Building2, Eye, EyeOff, Plane } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function AgentSignup() {
  const [, setLocation] = useLocation();
  const { signup } = useAuth();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [agencyName, setAgencyName] = useState("");
  const [gstNumber, setGstNumber] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name || !email || !phone || !agencyName || !password || !confirmPassword) {
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
      const result = await signup(name, email, phone, password, "agent", agencyName, gstNumber);
      if (result.success) {
        toast({
          title: "Agent Account Created!",
          description: "Your account is pending admin approval. You can log in and browse meanwhile.",
        });
        setLocation("/agent");
      } else if (result.error === "duplicate_email") {
        toast({ title: "Error", description: "An account with this email already exists. Please login.", variant: "destructive" });
      } else if (result.error === "duplicate_phone") {
        toast({ title: "Error", description: "An account with this mobile number already exists.", variant: "destructive" });
      } else if (result.error === "invalid_phone") {
        toast({ title: "Error", description: "Please enter valid 10-digit mobile number", variant: "destructive" });
      } else {
        toast({ title: "Error", description: "An account with this email already exists", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Something went wrong. Please try again.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-background to-indigo-50 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/">
            <div className="inline-flex items-center gap-2 mb-4 cursor-pointer hover:opacity-80 transition-opacity">
              <div className="bg-blue-600 text-white p-2 rounded-lg">
                <Plane className="w-6 h-6" />
              </div>
              <span className="text-2xl font-bold">{APP_NAME}</span>
            </div>
          </Link>
          <h1 className="text-3xl font-bold mb-2">Agent Registration</h1>
          <p className="text-muted-foreground">Join as a B2B travel agent and earn commissions</p>
        </div>

        <div className="mb-4 p-4 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-sm">
          <strong>B2B Agent Account</strong><br />
          Earn commissions on every booking. Access exclusive agent pricing and a personal wallet. Account activated after admin approval (usually within 24 hours).
        </div>

        <Card className="shadow-xl border-2 border-blue-100">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-700">
              <Building2 className="w-5 h-5" />
              Agent Registration
            </CardTitle>
            <CardDescription>
              Register as a B2B travel agent to access exclusive rates
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="agencyName">Agency Name <span className="text-red-500">*</span></Label>
                <Input
                  id="agencyName"
                  placeholder="e.g., Sunrise Travel Agency"
                  value={agencyName}
                  onChange={(e) => setAgencyName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Contact Person Name <span className="text-red-500">*</span></Label>
                <Input
                  id="name"
                  placeholder="Full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email <span className="text-red-500">*</span></Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="agency@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Mobile Number <span className="text-red-500">*</span></Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="Enter 10-digit mobile number"
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
                <Label htmlFor="gstNumber">GST Number (Optional)</Label>
                <Input
                  id="gstNumber"
                  placeholder="22AAAAA0000A1Z5"
                  value={gstNumber}
                  onChange={(e) => setGstNumber(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password <span className="text-red-500">*</span></Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Min. 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password <span className="text-red-500">*</span></Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Repeat your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((p) => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                disabled={isLoading}
              >
                {isLoading ? "Creating Agent Account..." : "Register as Agent"}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm space-y-2">
              <p className="text-muted-foreground">
                Already have an agent account?{" "}
                <Link href="/agent-login" className="text-blue-600 font-semibold hover:underline">
                  Agent Login
                </Link>
              </p>
              <p className="text-muted-foreground">
                Individual traveller?{" "}
                <Link href="/signup" className="text-primary font-semibold hover:underline">
                  Sign up here
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
