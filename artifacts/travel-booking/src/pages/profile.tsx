import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import { useAuth } from "@/contexts/auth-context";
import { getUserReferralStats, type ReferralStats } from "@/lib/referral";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  User,
  Mail,
  Phone,
  Calendar,
  MapPin,
  Edit2,
  Save,
  X,
  Shield,
  LogIn,
  Gift,
  Copy,
  CheckCircle2,
  Users,
  IndianRupee,
  Clock,
  Share2,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useLocation } from "wouter";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export default function Profile() {
  const { user, isAuthenticated, refreshUser } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [isEditing, setIsEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [referralStats, setReferralStats] = useState<ReferralStats | null>(null);
  const [phoneError, setPhoneError] = useState("");

  const [formData, setFormData] = useState({
    name: user?.name || "",
    email: user?.email || "",
    phone: user?.phone || "",
    address: (user as any)?.address || "",
    city: (user as any)?.city || "",
    country: (user as any)?.country || "India",
  });

  // Always reload fresh data (wallet balance may have changed since last render)
  useEffect(() => {
    refreshUser();
  }, []);

  // Load referral stats whenever user changes
  useEffect(() => {
    if (user?.id) {
      setReferralStats(getUserReferralStats(user.id));
    }
  }, [user?.id]);

  if (!isAuthenticated) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-16">
          <Card className="max-w-md mx-auto text-center">
            <CardContent className="pt-16 pb-8">
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-blue-100 flex items-center justify-center">
                <LogIn className="w-10 h-10 text-blue-600" />
              </div>
              <h2 className="text-2xl font-bold mb-3">Login Required</h2>
              <p className="text-muted-foreground mb-6">
                Please login to view your profile
              </p>
              <Button
                onClick={() => setLocation("/login")}
                className="w-full"
              >
                Go to Login
              </Button>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  const PHONE_REGEX = /^[6-9][0-9]{9}$/;

  const handleSave = () => {
    const digits = formData.phone.replace(/\D/g, "").slice(-10);
    if (formData.phone && !PHONE_REGEX.test(digits)) {
      setPhoneError("Enter valid 10-digit mobile number");
      toast({ title: "Invalid Phone", description: "Enter valid 10-digit mobile number", variant: "destructive" });
      return;
    }
    setPhoneError("");
    const updatedUser = { ...user, ...formData, phone: digits || formData.phone };
    localStorage.setItem("user", JSON.stringify(updatedUser));
    toast({
      title: "Profile Updated",
      description: "Your profile information has been saved successfully.",
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setFormData({
      name: user?.name || "",
      email: user?.email || "",
      phone: user?.phone || "",
      address: (user as any)?.address || "",
      city: (user as any)?.city || "",
      country: (user as any)?.country || "India",
    });
    setIsEditing(false);
  };

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  const handleCopyCode = async () => {
    if (!referralStats?.referralCode || referralStats.referralCode === "—") return;
    try {
      await navigator.clipboard.writeText(referralStats.referralCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "Copied!", description: "Referral code copied to clipboard." });
    } catch {
      toast({ title: "Copy failed", description: "Please copy manually.", variant: "destructive" });
    }
  };

  const handleShareLink = async () => {
    if (!referralStats?.referralCode || referralStats.referralCode === "—") return;
    const url = `${window.location.origin}/signup?ref=${referralStats.referralCode}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied!", description: "Share this link with friends." });
    } catch {
      toast({ title: "Copy failed", description: url, variant: "destructive" });
    }
  };

  return (
    <Layout>
      <div className="bg-muted/30 py-8 md:py-12 border-b">
        <div className="container mx-auto px-4">
          <div className="flex items-center gap-4 md:gap-6">
            <Avatar className="w-14 h-14 md:w-20 md:h-20 border-4 border-background shadow-lg shrink-0">
              <AvatarFallback className="bg-primary text-primary-foreground text-xl md:text-2xl font-bold">
                {getInitials(user?.name || "User")}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h1 className="text-2xl md:text-4xl font-extrabold tracking-tight truncate">{user?.name}</h1>
              <p className="text-muted-foreground mt-1 flex items-center gap-2 text-sm md:text-base">
                <Mail className="w-4 h-4 shrink-0" />
                <span className="truncate">{user?.email}</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 md:py-12">
        <div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Profile Info Card */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <div>
                  <CardTitle>Personal Information</CardTitle>
                  <CardDescription>Update your personal details</CardDescription>
                </div>
                {!isEditing ? (
                  <Button onClick={() => setIsEditing(true)} variant="outline" size="sm">
                    <Edit2 className="w-4 h-4 mr-2" />
                    Edit
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button onClick={handleSave} size="sm">
                      <Save className="w-4 h-4 mr-2" />
                      Save
                    </Button>
                    <Button onClick={handleCancel} variant="outline" size="sm">
                      <X className="w-4 h-4 mr-2" />
                      Cancel
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="name">
                      <User className="w-4 h-4 inline mr-2" />
                      Full Name
                    </Label>
                    {isEditing ? (
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Enter your full name"
                      />
                    ) : (
                      <p className="text-sm font-medium p-2 bg-muted/30 rounded-md">{formData.name || "Not set"}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">
                      <Mail className="w-4 h-4 inline mr-2" />
                      Email Address
                    </Label>
                    {isEditing ? (
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder="Enter your email"
                      />
                    ) : (
                      <p className="text-sm font-medium p-2 bg-muted/30 rounded-md">{formData.email || "Not set"}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">
                      <Phone className="w-4 h-4 inline mr-2" />
                      Phone Number
                    </Label>
                    {isEditing ? (
                      <>
                        <Input
                          id="phone"
                          type="tel"
                          value={formData.phone}
                          onChange={(e) => {
                            const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
                            setFormData({ ...formData, phone: digits });
                            const PHONE_RE = /^[6-9][0-9]{9}$/;
                            setPhoneError(digits.length > 0 && !PHONE_RE.test(digits) ? "Enter valid 10-digit mobile number" : "");
                          }}
                          placeholder="Enter mobile number"
                          maxLength={10}
                          inputMode="numeric"
                          className={phoneError ? "border-red-500 focus-visible:ring-red-500" : ""}
                        />
                        {phoneError && (
                          <p className="text-xs text-red-500 font-medium mt-1">{phoneError}</p>
                        )}
                      </>
                    ) : (
                      <p className="text-sm font-medium p-2 bg-muted/30 rounded-md">{formData.phone || "Not set"}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="city">
                      <MapPin className="w-4 h-4 inline mr-2" />
                      City
                    </Label>
                    {isEditing ? (
                      <Input
                        id="city"
                        value={formData.city}
                        onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                        placeholder="Enter your city"
                      />
                    ) : (
                      <p className="text-sm font-medium p-2 bg-muted/30 rounded-md">{formData.city || "Not set"}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="address">
                    <MapPin className="w-4 h-4 inline mr-2" />
                    Address
                  </Label>
                  {isEditing ? (
                    <Input
                      id="address"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      placeholder="Enter your address"
                    />
                  ) : (
                    <p className="text-sm font-medium p-2 bg-muted/30 rounded-md">{formData.address || "Not set"}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="country">
                    <MapPin className="w-4 h-4 inline mr-2" />
                    Country
                  </Label>
                  {isEditing ? (
                    <Input
                      id="country"
                      value={formData.country}
                      onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                      placeholder="Enter your country"
                    />
                  ) : (
                    <p className="text-sm font-medium p-2 bg-muted/30 rounded-md">{formData.country || "Not set"}</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* ── Referral Program Card ─────────────────────────────────────── */}
            {referralStats && user?.role !== "admin" && (
              <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50">
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-2 text-amber-800">
                    <Gift className="w-5 h-5 text-amber-600" />
                    Referral Program
                  </CardTitle>
                  <CardDescription className="text-amber-700">
                    Invite friends — your friend gets ₹50 instantly, you earn ₹50 when they book
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  {/* Referral code display */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Your Referral Code</p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-white border-2 border-amber-300 rounded-lg px-4 py-2.5 font-mono text-xl font-bold text-amber-900 tracking-widest text-center select-all">
                        {referralStats.referralCode}
                      </div>
                      <Button
                        variant="outline"
                        size="icon"
                        className="border-amber-300 hover:bg-amber-100 shrink-0"
                        onClick={handleCopyCode}
                        title="Copy code"
                      >
                        {copied ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-amber-700" />}
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="border-amber-300 hover:bg-amber-100 shrink-0"
                        onClick={handleShareLink}
                        title="Copy invite link"
                      >
                        <Share2 className="w-4 h-4 text-amber-700" />
                      </Button>
                    </div>
                    <p className="text-xs text-amber-600">
                      Friends sign up at <span className="font-mono">/signup?ref={referralStats.referralCode}</span>
                    </p>
                  </div>

                  <Separator className="bg-amber-200" />

                  {/* Stats grid */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-white rounded-xl p-3 text-center border border-amber-200">
                      <Users className="w-5 h-5 mx-auto text-amber-600 mb-1" />
                      <p className="text-2xl font-bold text-amber-900">{referralStats.totalReferrals}</p>
                      <p className="text-xs text-amber-600 font-medium">Total Referrals</p>
                    </div>
                    <div className="bg-white rounded-xl p-3 text-center border border-amber-200">
                      <IndianRupee className="w-5 h-5 mx-auto text-green-600 mb-1" />
                      <p className="text-2xl font-bold text-green-700">₹{referralStats.totalEarnings}</p>
                      <p className="text-xs text-amber-600 font-medium">Total Earned</p>
                    </div>
                    <div className="bg-white rounded-xl p-3 text-center border border-amber-200">
                      <Clock className="w-5 h-5 mx-auto text-amber-500 mb-1" />
                      <p className="text-2xl font-bold text-amber-900">{referralStats.pendingReferrals}</p>
                      <p className="text-xs text-amber-600 font-medium">Pending</p>
                    </div>
                  </div>

                  {/* How it works */}
                  <div className="bg-white/70 rounded-lg p-3 border border-amber-200 space-y-1.5 text-sm text-amber-800">
                    <p className="font-semibold text-xs uppercase tracking-wide text-amber-600 mb-2">How it works</p>
                    <div className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">1</span>
                      <span>Share your referral code or invite link with a friend</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">2</span>
                      <span>Friend signs up with your code — they instantly receive <strong>₹50</strong> in Travel Credits</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">3</span>
                      <span>When your friend completes their first booking, you earn <strong>₹50</strong> too!</span>
                    </div>
                  </div>

                  {/* Signup bonus note */}
                  {referralStats.signupBonusReceived && (
                    <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-green-700">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>You received a ₹50 welcome bonus when you joined via referral!</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Account Stats Sidebar */}
          <div className="space-y-6">
            {/* Travel Credits Card */}
            {user?.role === "user" && (
              <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-yellow-50">
                <CardContent className="pt-5 pb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                      <Wallet className="w-6 h-6 text-amber-600" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide">Travel Credits</p>
                      <p className="text-3xl font-extrabold text-amber-900 leading-none mt-0.5">
                        ₹{(user as any)?.walletBalance ?? 0}
                      </p>
                      <p className="text-xs text-amber-600 mt-1">Earned from referrals</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Account Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Account Type</span>
                  <Badge className="bg-gradient-to-r from-blue-500 to-purple-500">
                    <Shield className="w-3 h-3 mr-1" />
                    Premium
                  </Badge>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Member Since</span>
                  <span className="text-sm font-medium flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {new Date((user as any)?.createdAt || Date.now()).toLocaleDateString("en-US", {
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">User ID</span>
                  <span className="text-sm font-mono font-medium">{String(user?.id ?? '').slice(0, 8)}...</span>
                </div>
                {referralStats && referralStats.totalReferrals > 0 && (
                  <>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Referrals</span>
                      <span className="text-sm font-semibold text-amber-600">
                        {referralStats.totalReferrals} invited
                      </span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => setLocation("/bookings")}
                >
                  <User className="w-4 h-4 mr-2" />
                  My Bookings
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => setLocation("/settings")}
                >
                  <Shield className="w-4 h-4 mr-2" />
                  Settings
                </Button>
                {referralStats?.referralCode && referralStats.referralCode !== "—" && (
                  <Button
                    variant="outline"
                    className="w-full justify-start text-amber-700 border-amber-300 hover:bg-amber-50"
                    onClick={handleShareLink}
                  >
                    <Gift className="w-4 h-4 mr-2 text-amber-600" />
                    Share Referral Link
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}
