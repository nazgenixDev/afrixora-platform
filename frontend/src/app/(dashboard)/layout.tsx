"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useTheme } from "next-themes";
import {
  Home, Building2, Cpu, Zap, Workflow, Bell, FileText, Menu, Users, Settings, X, Globe, Briefcase, CreditCard, ChevronLeft, ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { redirectToLogin } from "@/lib/auth";
import api from "@/lib/api";
import useStore from "@/store";
import NotificationBell from "@/components/layout/NotificationBell";
import HeaderInfo from "@/components/layout/HeaderInfo";
import UserMenu from "@/components/layout/UserMenu";

const DashboardLayout = ({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element => {
  const router = useRouter();
  const pathname = usePathname();
  const user = useStore((state) => state.user);
  const setAuth = useStore((state) => state.setAuth);
  const role = user?.role || "VIEWER";
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [limits, setLimits] = useState<any>(null);

  useEffect(() => {
    // Vérifier l'authentification via /api/v1/auth/me (cookie httpOnly)
    api.get("/api/v1/auth/me")
      .then(res => {
        const { user: userData } = res.data;
        if (userData && !user) {
          setAuth(userData, null);
        }
        // Charger les limites du plan d'abonnement
        return api.get("/api/v1/tenants/current/subscription");
      })
      .then(res => {
        setLimits(res.data.limits);
      })
      .catch(() => {
        // 401 → pas connecté
        redirectToLogin();
      });
  }, []);

  const { resolvedTheme } = useTheme();
  const logoSidebar = resolvedTheme === "dark" ? "/afrixora_logo3.png" : "/iconAfrixora.svg";
  const closeMobileMenu = () => setMobileMenuOpen(false);

  const baseNav = [
    { href: "/", label: "Dashboard", icon: <Home className="h-5 w-5" /> },
    { href: "/buildings", label: "Bâtiments", icon: <Building2 className="h-5 w-5" /> },
    { href: "/devices", label: "Appareils", icon: <Cpu className="h-5 w-5" /> },
    { href: "/energy", label: "Énergie", icon: <Zap className="h-5 w-5" /> },
    // Reports visible uniquement si le plan le permet (hasExport)
    ...(limits?.hasExport !== false ? [{ href: "/reports" as const, label: "Rapports", icon: <FileText className="h-5 w-5" /> }] : []),
    { href: "/subscription", label: "Abonnement", icon: <CreditCard className="h-5 w-5" /> },
    { href: "/settings", label: "Paramètres", icon: <Settings className="h-5 w-5" /> },
  ];

  const adminNav = [
    { href: "/automations", label: "Automations", icon: <Workflow className="h-5 w-5" /> },
    { href: "/alerts", label: "Alertes", icon: <Bell className="h-5 w-5" /> },
    { href: "/users", label: "Utilisateurs", icon: <Users className="h-5 w-5" /> },
    // API Dashboard visible uniquement si le plan le permet (hasApi)
    ...(limits?.hasApi !== false ? [{ href: "/api-dashboard" as const, label: "API", icon: <Globe className="h-5 w-5" /> }] : []),
  ];

  const isAdmin = ["SUPER_ADMIN", "TENANT_ADMIN"].includes(role);
  // Ajouter Tenants uniquement pour SUPER_ADMIN
  if (role === "SUPER_ADMIN") {
    adminNav.unshift({ href: "/tenants", label: "Clients", icon: <Briefcase className="h-5 w-5" /> });
  }
  const navItems = isAdmin ? [...baseNav, ...adminNav] : baseNav;

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className={`flex items-center justify-between p-4 border-b border-border/50 ${sidebarCollapsed ? "flex-col gap-2" : ""}`}>
        <div className={`flex items-center gap-2 ${sidebarCollapsed ? "flex-col" : ""}`}>
          <div className="w-10 h-10 flex items-center justify-center flex-shrink-0">
            <img src={logoSidebar} alt="AFRIXORA" className="w-full h-full object-contain" />
          </div>
          {!sidebarCollapsed && (
            <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-brand-400 to-brand-600 bg-clip-text text-transparent">
              AFRIXORA
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="hidden md:flex h-6 w-6 text-muted-foreground hover:text-foreground"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        >
          {sidebarCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </Button>
        <Button variant="ghost" size="icon" className="md:hidden absolute right-4" onClick={closeMobileMenu}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto custom-scrollbar">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 py-2">
          {sidebarCollapsed ? "..." : "Menu"}
        </div>
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={closeMobileMenu}
            className={`
              flex items-center gap-3 px-3 py-2.5 text-sm rounded-xl
              transition-all duration-200 group relative
              ${isActive(item.href)
                ? "bg-gradient-to-r from-brand-500/15 to-brand-500/5 text-brand-600 font-medium shadow-sm"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              }
              ${sidebarCollapsed ? "justify-center px-2" : ""}
            `}
          >
            {/* Active indicator */}
            {isActive(item.href) && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-brand-500 rounded-full" />
            )}
            <span className={`
              ${isActive(item.href) ? "text-brand-500" : "text-muted-foreground group-hover:text-foreground"}
              transition-colors flex-shrink-0
            `}>
              {item.icon}
            </span>
            {!sidebarCollapsed && (
              <span className="truncate">{item.label}</span>
            )}
          </Link>
        ))}
      </nav>

      {/* User Menu */}
      <div className={`p-3 border-t border-border/50 ${sidebarCollapsed ? "flex justify-center" : ""}`}>
        <UserMenu collapsed={sidebarCollapsed} />
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-gradient-to-br from-background via-background to-brand-50/30 relative">
      {/* Desktop Sidebar */}
      <aside className={`
        hidden md:flex flex-col bg-card/80 backdrop-blur-sm border-r border-border/50
        transition-all duration-300 ease-in-out
        ${sidebarCollapsed ? "w-16" : "w-64"}
      `}>
        {sidebarContent}
      </aside>

      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden animate-fade-in" onClick={closeMobileMenu} />
      )}

      {/* Mobile Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-72 bg-card border-r shadow-2xl
          transform transition-transform duration-300 ease-in-out md:hidden
          ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        {sidebarContent}
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Header */}
        <header className="h-16 border-b border-border/50 flex items-center justify-between px-4 md:px-6 bg-card/80 backdrop-blur-sm sticky top-0 z-30 shadow-sm">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden h-9 w-9 text-muted-foreground hover:text-foreground"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            {/* Mobile logo */}
            <div className="md:hidden flex items-center gap-2">
              <div className="w-9 h-9 flex items-center justify-center">
                <img src={logoSidebar} alt="AFRIXORA" className="w-full h-full object-contain" />
              </div>
              <span className="text-sm font-bold">AFRIXORA</span>
            </div>
            <HeaderInfo />
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8 custom-scrollbar animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
