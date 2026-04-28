import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { Building2 } from "lucide-react";

interface AgentGuardProps {
  children: React.ReactNode;
}

export function AgentGuard({ children }: AgentGuardProps) {
  const { isAgent, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isAuthenticated || !isAgent) {
      setLocation("/agent-login");
    }
  }, [isAuthenticated, isAgent, setLocation]);

  if (!isAuthenticated || !isAgent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="flex flex-col items-center gap-4 text-white/60">
          <Building2 className="w-10 h-10 animate-pulse" />
          <p className="text-sm">Checking access…</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
