import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Plane, Bus, Building2, Palmtree, Compass, Train, FileText, User, Menu, LogOut, Settings, Ticket, Sparkles, ShieldCheck, Wallet, Gift } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/auth-context";
import { useBranding } from "@/contexts/branding-context";
import { cn } from "@/lib/utils";
import { popUnseenRewardNotifications } from "@/lib/referral";

function BrandLogo({ logoUrl, companyName }: { logoUrl: string | null; companyName: string }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [logoUrl]);
  if (logoUrl && !broken) {
    return (
      <img
        src={logoUrl}
        alt={companyName}
        className="w-10 h-10 rounded-lg object-contain bg-white border border-slate-200 shadow-md transition-transform group-hover:scale-105"
        data-testid="img-brand-logo"
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shadow-md transition-transform group-hover:scale-105">
      <Sparkles className="h-6 w-6 text-white" />
    </div>
  );
}

export function Navbar() {
  const [location] = useLocation();
  const { user, isAuthenticated, isAdmin, isAgent, logout, refreshUser } = useAuth();
  const { branding } = useBranding();
  const { toast } = useToast();

  // Check for unseen referral reward notifications on every page the user visits
  useEffect(() => {
    if (!user?.id) return;
    const notifs = popUnseenRewardNotifications(user.id);
    if (notifs.length === 0) return;
    // Refresh React state so wallet balance in navbar updates immediately
    refreshUser();
    setTimeout(() => {
      notifs.forEach((n) => {
        toast({
          title: "₹50 Referral Bonus Credited! 🎉",
          description: n.message,
          duration: 7000,
        });
      });
    }, 500);
  }, [user?.id]);

  const handleInviteFriends = () => {
    const code = (user as any)?.referralCode;
    if (!code) return;
    const link = `${window.location.origin}/signup?ref=${code}`;
    navigator.clipboard.writeText(link).then(() => {
      toast({ title: "Invite link copied!", description: `Share this link: ${link}` });
    });
  };

  const navItems = [
    { href: "/flights", label: "Flights", icon: Plane, color: "text-blue-600" },
    { href: "/hotels", label: "Hotels", icon: Building2, color: "text-green-600" },
    { href: "/buses", label: "Bus", icon: Bus, color: "text-orange-600" },
    { href: "/packages", label: "Holidays", icon: Palmtree, color: "text-purple-600" },
    // { href: "/cars", label: "Cars", icon: Car, color: "text-rose-600" },   // temporarily hidden
    { href: "/trains", label: "Trains", icon: Train, color: "text-blue-600" },
    { href: "/visa", label: "Visa", icon: FileText, color: "text-indigo-600" },
    // { href: "/insurance", label: "Insurance", icon: Umbrella, color: "text-emerald-600" }, // temporarily hidden
    { href: "/activities", label: "Activities", icon: Compass, color: "text-teal-600" },
  ];

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  // ── Admin mode navbar (completely separate from B2C) ─────────────────────────
  if (isAdmin) {
    return (
      <header className="sticky top-0 z-50 w-full border-b bg-slate-900 shadow-sm">
        <div className="container mx-auto">
          <div className="flex h-16 items-center justify-between px-4">
            {/* Admin Brand */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-purple-600 flex items-center justify-center shadow">
                <ShieldCheck className="h-5 w-5 text-white" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-white text-base leading-tight">
                  {branding.companyName}
                </span>
                <span className="text-[10px] text-purple-300 font-semibold uppercase tracking-widest -mt-0.5">
                  Admin Panel
                </span>
              </div>
            </div>

            {/* Admin Nav Links - Desktop */}
            <nav className="hidden md:flex items-center gap-1">
              <Link href="/master-admin/dashboard">
                <Button
                  variant="ghost"
                  className={cn(
                    "text-slate-300 hover:text-white hover:bg-white/10 gap-2 h-10",
                    location.startsWith("/master-admin/dashboard") && "bg-white/10 text-white font-semibold"
                  )}
                >
                  <ShieldCheck className="h-4 w-4" />
                  Dashboard
                </Button>
              </Link>
            </nav>

            {/* Admin Right Actions */}
            <div className="flex items-center gap-3">
              <Link href="/master-admin/dashboard" className="hidden md:block">
                <Button size="sm" className="bg-purple-600 hover:bg-purple-700 text-white gap-2 border-0">
                  <ShieldCheck className="h-4 w-4" />
                  Admin Dashboard
                </Button>
              </Link>

              {/* Admin avatar + logout */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-9 w-9 rounded-full hover:bg-white/10">
                    <Avatar className="h-9 w-9 border-2 border-purple-400/30">
                      <AvatarFallback className="bg-purple-700 text-white font-bold text-sm">
                        AD
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuLabel>
                    <div className="flex flex-col space-y-0.5">
                      <p className="text-sm font-semibold">Admin</p>
                      <p className="text-xs text-muted-foreground">{user?.email}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/master-admin/dashboard" className="cursor-pointer text-purple-700 font-medium">
                      <ShieldCheck className="mr-2 h-4 w-4 text-purple-600" />
                      Admin Dashboard
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout} className="text-destructive cursor-pointer">
                    <LogOut className="mr-2 h-4 w-4" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Mobile admin menu */}
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="md:hidden text-white hover:bg-white/10">
                    <Menu className="h-5 w-5" />
                    <span className="sr-only">Toggle Menu</span>
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72 p-0 bg-slate-900 border-slate-700">
                  <div className="flex flex-col h-full">
                    <div className="p-6 border-b border-slate-700">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-purple-600 flex items-center justify-center">
                          <ShieldCheck className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <p className="font-bold text-white text-sm">{branding.companyName}</p>
                          <p className="text-[10px] text-purple-300 uppercase tracking-widest font-semibold">Admin Panel</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex-1 p-4">
                      <Link href="/master-admin/dashboard">
                        <Button
                          className="w-full justify-start gap-3 h-12 bg-purple-600 hover:bg-purple-700 text-white border-0"
                        >
                          <ShieldCheck className="h-5 w-5" />
                          Admin Dashboard
                        </Button>
                      </Link>
                    </div>
                    <div className="p-4 border-t border-slate-700">
                      <p className="text-xs text-slate-400 mb-3">Logged in as Admin</p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={logout}
                        className="w-full gap-2 text-red-400 border-slate-600 hover:bg-slate-800 hover:text-red-300"
                      >
                        <LogOut className="h-4 w-4" />
                        Logout
                      </Button>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </header>
    );
  }

  // ── B2C navbar (regular users, agents, staff) ─────────────────────────────────
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-white shadow-sm">
      <div className="container mx-auto">
        {/* Top Bar */}
        <div className="flex h-16 items-center justify-between px-4">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2 group" data-testid="link-brand-home">
            <BrandLogo logoUrl={branding.logoUrl} companyName={branding.companyName} />
            <div className="flex flex-col">
              <span
                className="font-bold text-xl bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent"
                data-testid="text-brand-name"
              >
                {branding.companyName}
              </span>
              <span className="text-[10px] text-muted-foreground -mt-1">{branding.tagline}</span>
            </div>
          </Link>

          {/* Main Navigation - Desktop */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.startsWith(item.href);
              return (
                <Link key={item.href} href={item.href}>
                  <Button
                    variant="ghost"
                    className={cn(
                      "flex items-center gap-2 h-12 px-4 rounded-lg transition-all",
                      isActive
                        ? "bg-primary/10 text-primary font-semibold"
                        : "hover:bg-muted/50 text-foreground/70"
                    )}
                  >
                    <Icon className={cn("h-5 w-5", isActive ? item.color : "")} />
                    <span className="text-sm">{item.label}</span>
                  </Button>
                </Link>
              );
            })}
          </nav>

          {/* Right Side Actions */}
          <div className="flex items-center gap-3">
            {/* My Bookings Button - Desktop */}
            <Link href="/bookings" className="hidden md:block">
              <Button
                variant={location.startsWith("/bookings") ? "default" : "outline"}
                size="sm"
                className="gap-2"
              >
                <Ticket className="h-4 w-4" />
                My Bookings
              </Button>
            </Link>

            {/* User Menu */}
            {isAuthenticated ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-10 w-10 rounded-full">
                    <Avatar className="h-10 w-10 border-2 border-primary/20">
                      <AvatarFallback className="bg-gradient-to-br from-blue-600 to-purple-600 text-white font-semibold">
                        {getInitials(user?.name || "User")}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuLabel>
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium">{user?.name}</p>
                      <p className="text-xs text-muted-foreground">{user?.email}</p>
                      {user?.role === "user" && (
                        <div className="flex items-center gap-1.5 mt-1 pt-1 border-t border-muted">
                          <Wallet className="w-3.5 h-3.5 text-amber-500" />
                          <span className="text-xs font-semibold text-amber-700">
                            Travel Credits: ₹{(user as any)?.walletBalance ?? 0}
                          </span>
                        </div>
                      )}
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/bookings" className="cursor-pointer">
                      <Ticket className="mr-2 h-4 w-4" />
                      My Bookings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/profile" className="cursor-pointer">
                      <User className="mr-2 h-4 w-4" />
                      Profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/settings" className="cursor-pointer">
                      <Settings className="mr-2 h-4 w-4" />
                      Settings
                    </Link>
                  </DropdownMenuItem>
                  {user?.role === "user" && (user as any)?.referralCode && (
                    <DropdownMenuItem onClick={handleInviteFriends} className="cursor-pointer text-amber-700 font-medium">
                      <Gift className="mr-2 h-4 w-4 text-amber-500" />
                      Invite Friends
                    </DropdownMenuItem>
                  )}
                  {isAgent && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <Link href="/agent" className="cursor-pointer text-blue-700 font-semibold">
                          <Building2 className="mr-2 h-4 w-4 text-blue-600" />
                          Agent Dashboard
                        </Link>
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout} className="text-destructive cursor-pointer">
                    <LogOut className="mr-2 h-4 w-4" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="flex items-center gap-2">
                <Link href="/login">
                  <Button size="sm" className="gap-2">
                    <User className="h-4 w-4" />
                    Login
                  </Button>
                </Link>
                <Link href="/agent-login">
                  <Button size="sm" variant="outline" className="gap-1.5 border-blue-200 text-blue-700 hover:bg-blue-50 hidden sm:flex">
                    <Building2 className="h-3.5 w-3.5" />
                    Agent Login
                  </Button>
                </Link>
              </div>
            )}

            {/* Mobile Menu */}
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                >
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Toggle Menu</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-80 p-0">
                <div className="flex flex-col h-full">
                  {/* Mobile Logo */}
                  <div className="p-6 border-b">
                    <Link href="/" className="flex items-center space-x-2">
                      <BrandLogo logoUrl={branding.logoUrl} companyName={branding.companyName} />
                      <span className="font-bold text-xl bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                        {branding.companyName}
                      </span>
                    </Link>
                  </div>

                  {/* Mobile Navigation */}
                  <div className="flex-1 overflow-y-auto p-6">
                    <div className="flex flex-col space-y-2">
                      {navItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = location.startsWith(item.href);
                        return (
                          <Link key={item.href} href={item.href}>
                            <Button
                              variant={isActive ? "secondary" : "ghost"}
                              className={cn(
                                "w-full justify-start gap-3 h-12",
                                isActive && "bg-primary/10 text-primary font-semibold"
                              )}
                            >
                              <Icon className={cn("h-5 w-5", isActive ? item.color : "")} />
                              {item.label}
                            </Button>
                          </Link>
                        );
                      })}
                      
                      <div className="pt-4 border-t space-y-1">
                        <Link href="/bookings">
                          <Button
                            variant={location.startsWith("/bookings") ? "secondary" : "ghost"}
                            className="w-full justify-start gap-3 h-12"
                          >
                            <Ticket className="h-5 w-5" />
                            My Bookings
                          </Button>
                        </Link>
                        {isAgent && (
                          <Link href="/agent">
                            <Button
                              variant={location.startsWith("/agent") ? "secondary" : "ghost"}
                              className="w-full justify-start gap-3 h-12 text-blue-700"
                            >
                              <Building2 className="h-5 w-5 text-blue-600" />
                              Agent Dashboard
                            </Button>
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Mobile User Section */}
                  {isAuthenticated && user && (
                    <div className="p-6 border-t bg-muted/30">
                      <div className="flex items-center gap-3 mb-4">
                        <Avatar className="h-10 w-10 border-2 border-primary/20">
                          <AvatarFallback className="bg-gradient-to-br from-blue-600 to-purple-600 text-white font-semibold">
                            {getInitials(user.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <p className="text-sm font-medium">{user.name}</p>
                          <p className="text-xs text-muted-foreground">{user.email}</p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={logout}
                        className="w-full gap-2 text-destructive hover:text-destructive"
                      >
                        <LogOut className="h-4 w-4" />
                        Logout
                      </Button>
                    </div>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  );
}
