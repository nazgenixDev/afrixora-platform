"use client";

import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Settings,
  HelpCircle,
  LogOut,
  Smartphone,
  ChevronUp,
} from "lucide-react";
import useStore from "@/store";
import Link from "next/link";
import { logoutSession } from "@/lib/api";
import { redirectToLogin } from "@/lib/auth";
import { toast } from "sonner";

interface UserMenuProps {
  collapsed?: boolean;
  onNavigate?: () => void;
}

const UserMenu = ({ collapsed = false, onNavigate }: UserMenuProps) => {
  const user = useStore(state => state.user);
  const clearAuth = useStore(state => state.clearAuth);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logoutSession();
      clearAuth();
      redirectToLogin();
    } catch {
      toast.error("Déconnexion indisponible. Réessayez.");
      setLoggingOut(false);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map(n => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      SUPER_ADMIN: "Super Admin",
      TENANT_ADMIN: "Admin Client",
      BUILDING_ADMIN: "Admin Bâtiment",
      OPERATOR: "Opérateur",
      VIEWER: "Lecteur",
    };
    return labels[role] || role;
  };

  if (collapsed) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button aria-label="Menu utilisateur" className="w-full flex items-center justify-center p-2 rounded-xl hover:bg-accent/50 hover:text-accent-foreground transition-colors">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {user?.name ? getInitials(user.name) : "?"}
            </div>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" side="right" className="w-56 ml-2">
          <DropdownMenuLabel>
            <div className="text-sm font-medium">{user?.name}</div>
            <div className="text-xs text-muted-foreground">{user?.email}</div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/settings" onNavigate={onNavigate} className="cursor-pointer flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Paramètres
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem className="cursor-pointer flex items-center gap-2" disabled>
            <Smartphone className="h-4 w-4" />
            App mobile
          </DropdownMenuItem>
          <DropdownMenuItem className="cursor-pointer flex items-center gap-2" disabled>
            <HelpCircle className="h-4 w-4" />
            Aide & Support
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="cursor-pointer flex items-center gap-2 text-red-400 hover:text-red-300"
            disabled={loggingOut}
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" />
            Déconnexion
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-accent/50 hover:text-accent-foreground transition-colors text-left group">
          {/* Avatar */}
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shadow-sm">
            {user?.name ? getInitials(user.name) : "?"}
          </div>
          {/* Nom + Rôle */}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{user?.name || "Utilisateur"}</div>
            <div className="text-xs text-muted-foreground">{getRoleLabel(user?.role || "VIEWER")}</div>
          </div>
          {/* Chevron */}
          <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0 group-hover:translate-y-[-1px] transition-transform" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-56 mb-2">
        <DropdownMenuLabel>
          <div className="text-sm font-medium">{user?.name}</div>
          <div className="text-xs text-muted-foreground">{user?.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings" onNavigate={onNavigate} className="cursor-pointer flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Paramètres
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem className="cursor-pointer flex items-center gap-2" disabled>
          <Smartphone className="h-4 w-4" />
          Télécharger l&apos;app mobile
        </DropdownMenuItem>
        <DropdownMenuItem className="cursor-pointer flex items-center gap-2" disabled>
          <HelpCircle className="h-4 w-4" />
          Aide & Support
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer flex items-center gap-2 text-red-400 hover:text-red-300"
          disabled={loggingOut}
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4" />
          Déconnexion
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default UserMenu;
