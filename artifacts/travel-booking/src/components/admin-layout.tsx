import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { useBranding } from "@/contexts/branding-context";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, TrendingUp, Package,
  MessageSquare, FileText, ClipboardList, LogOut, Menu, X,
  ShieldCheck, UserCheck, ChevronRight, Receipt, Users, Award, Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Dashboard",        href: "/master-admin/dashboard",        icon: LayoutDashboard },
  { label: "Revenue",          href: "/master-admin/revenue",          icon: TrendingUp },
  { label: "All Users",        href: "/master-admin/users",            icon: Users },
  { label: "Agents",           href: "/master-admin/agents",           icon: UserCheck },
  { label: "Packages",         href: "/master-admin/packages",         icon: Package },
  { label: "Invoices",         href: "/master-admin/invoices",         icon: Receipt },
  { label: "CRM & Staff",      href: "/master-admin/crm",              icon: MessageSquare },
  { label: "Staff Incentives", href: "/master-admin/staff-incentives", icon: Award },
  { label: "Leads",            href: "/master-admin/leads",            icon: FileText },
  { label: "Enquiries",        href: "/master-admin/enquiries",        icon: ClipboardList },
  { label: "Settings",         href: "/master-admin/settings",         icon: Settings },
];

function SidebarLink({
  item,
  active,
  onClick,
}: {
  item: typeof NAV_ITEMS[number];
  active: boolean;
  onClick?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group",
        active
          ? "bg-purple-600 text-white shadow-sm"
          : "text-slate-400 hover:bg-white/10 hover:text-white"
      )}
    >
      <Icon className={cn("w-4 h-4 shrink-0", active ? "text-white" : "text-slate-400 group-hover:text-white")} />
      <span>{item.label}</span>
      {active && <ChevronRight className="w-3.5 h-3.5 ml-auto text-purple-200" />}
    </Link>
  );
}

function Sidebar({ onClose }: { onClose?: () => void }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { branding } = useBranding();
  const [, setLocation] = useLocation();

  function handleLogout() {
    logout();
    setLocation("/master-admin/login");
  }

  return (
    <div className="flex flex-col h-full bg-slate-900 w-64 p-4">
      {/* Logo */}
      <div className="flex items-center justify-between mb-8 px-1">
        <div className="flex items-center gap-2.5">
          {branding.logoUrl ? (
            <img
              src={branding.logoUrl}
              alt={branding.companyName}
              className="w-8 h-8 rounded-lg object-contain bg-white"
              data-testid="img-admin-brand-logo"
            />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-white" />
            </div>
          )}
          <div>
            <p className="text-white font-bold text-sm leading-tight" data-testid="text-admin-brand-name">{branding.companyName}</p>
            <p className="text-purple-400 text-[10px] font-semibold uppercase tracking-widest leading-tight">Admin Panel</p>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors p-1">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1">
        {NAV_ITEMS.map((item) => (
          <SidebarLink key={item.label} item={item} active={location === item.href} onClick={onClose} />
        ))}
      </nav>

      {/* Footer: user + logout */}
      <div className="mt-4 pt-4 border-t border-white/10">
        <div className="flex items-center gap-2.5 px-3 py-2 mb-2">
          <div className="w-7 h-7 rounded-full bg-purple-700 flex items-center justify-center text-xs font-bold text-white shrink-0">
            {user?.name?.charAt(0)?.toUpperCase() ?? "A"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-white truncate">{user?.name ?? "Admin"}</p>
            <p className="text-[10px] text-slate-500 truncate">{user?.email}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-slate-400 hover:bg-white/10 hover:text-red-400 transition-all"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          Sign Out
        </button>
      </div>
    </div>
  );
}

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen flex bg-slate-100">

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col shrink-0 h-screen sticky top-0">
        <Sidebar />
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <div className={cn(
        "fixed inset-y-0 left-0 z-50 lg:hidden transition-transform duration-300",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="lg:hidden bg-slate-900 px-4 py-3 flex items-center gap-3 sticky top-0 z-30">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-purple-600 flex items-center justify-center">
              <ShieldCheck className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-white font-bold text-sm">Admin Panel</span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 w-full">
          {children}
        </main>
      </div>
    </div>
  );
}
