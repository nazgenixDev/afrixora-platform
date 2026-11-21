"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Content as DialogContent } from "@radix-ui/react-dialog";
import {
  Home, Building2, Cpu, Zap, Workflow, Bell, FileText, Menu, Users, Settings, X, Globe, Briefcase, CreditCard, ChevronLeft, ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogOverlay, DialogPortal, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { PlanLimits } from "@/hooks/useSubscriptionLimits";
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
}) => {
  const pathname = usePathname();
  const user = useStore((state) => state.user);
  const setAuth = useStore((state) => state.setAuth);
  const impersonatedTenantId = useStore((state) => state.impersonatedTenantId);
  const role = user?.role || "VIEWER";
  const tenantId = role === "SUPER_ADMIN" && impersonatedTenantId ? impersonatedTenantId : user?.tenantId;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [subscription, setSubscription] = useState<{ tenantId: string; limits: PlanLimits } | null>(null);
  const limits = subscription?.tenantId === tenantId ? subscription?.limits : null;

  useEffect(() => {
    // Vérifier l'authentification via /api/v1/auth/me (cookie httpOnly)
    const controller = new AbortController();
    api.get("/api/v1/auth/me", { signal: controller.signal })
      .then(res => {
        const { user: userData } = res.data;
        if (!controller.signal.aborted && userData && !useStore.getState().user) {
          setAuth(userData, null);
        }
      })
      .catch(() => {
        // 401 → pas connecté
        if (!controller.signal.aborted) redirectToLogin();
      });
    return () => controller.abort();
  }, [setAuth]);

  useEffect(() => {
    if (!tenantId) return;
    const controller = new AbortController();
    api.get<{ limits: PlanLimits }>("/api/v1/tenants/current/subscription", { signal: controller.signal })
      .then(({ data }) => {
        if (!controller.signal.aborted) setSubscription({ tenantId, limits: data.limits });
      })
      .catch(() => {});
    return () => controller.abort();
  }, [tenantId]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)");
    const closeOnDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setMobileMenuOpen(false);
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  const logo = (
    <span
      role="img"
      aria-label="AFRIXORA"
      className="block h-full w-full bg-[url('/iconAfrixora.svg')] bg-contain bg-center bg-no-repeat dark:bg-[url('/afrixora_logo3.png')]"
    />
  );
  const closeMobileMenu = () => setMobileMenuOpen(false);

  const baseNav = [
    { href: "/", label: "Tableau de bord", icon: <Home className="h-5 w-5" /> },
    { href: "/buildings", label: "Bâtiments", icon: <Building2 className="h-5 w-5" /> },
    { href: "/devices", label: "Appareils", icon: <Cpu className="h-5 w-5" /> },
    { href: "/energy", label: "Énergie", icon: <Zap className="h-5 w-5" /> },
    // Reports visible uniquement si le plan le permet (hasExport)
    ...(limits?.hasExport !== false ? [{ href: "/reports" as const, label: "Rapports", icon: <FileText className="h-5 w-5" /> }] : []),
    { href: "/subscription", label: "Abonnement", icon: <CreditCard className="h-5 w-5" /> },
    { href: "/settings", label: "Paramètres", icon: <Settings className="h-5 w-5" /> },
  ];

  const buildingAdminNav = [
    { href: "/automations", label: "Automatisations", icon: <Workflow className="h-5 w-5" /> },
    { href: "/alerts", label: "Alertes", icon: <Bell className="h-5 w-5" /> },
  ];

  const adminNav = [
    { href: "/users", label: "Utilisateurs", icon: <Users className="h-5 w-5" /> },
    { href: "/api-dashboard", label: "API", icon: <Globe className="h-5 w-5" /> },
  ];

  const isAdmin = ["SUPER_ADMIN", "TENANT_ADMIN"].includes(role);
  const superAdminNav = role === "SUPER_ADMIN"
    ? [{ href: "/tenants", label: "Clients", icon: <Briefcase className="h-5 w-5" /> }]
    : [];
  const navItems = [
    ...baseNav,
    ...superAdminNav,
    ...(isAdmin || role === "BUILDING_ADMIN" ? buildingAdminNav : []),
    ...(isAdmin ? adminNav : []),
  ];

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const renderSidebar = (collapsed: boolean, mobile = false) => (
    <>
      {/* Logo */}
      <div className={`flex items-center justify-between p-4 border-b border-border/50 ${collapsed ? "flex-col gap-2" : ""}`}>
        <div className={`flex items-center gap-2 ${collapsed ? "flex-col" : ""}`}>
          <div className="w-10 h-10 flex items-center justify-center flex-shrink-0">
            {logo}
          </div>
          {!collapsed && (
            <span aria-hidden="true" className="text-lg font-bold tracking-tight bg-gradient-to-r from-brand-400 to-brand-600 bg-clip-text text-transparent">
              AFRIXORA
            </span>
          )}
        </div>
        {mobile ? (
          <DialogClose asChild>
            <Button variant="ghost" size="icon" aria-label="Fermer le menu de navigation">
              <X className="h-5 w-5" aria-hidden="true" />
            </Button>
          </DialogClose>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            aria-controls="desktop-navigation"
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Développer le menu de navigation" : "Réduire le menu de navigation"}
            onClick={() => setSidebarCollapsed(current => !current)}
          >
            {collapsed ? <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />}
          </Button>
        )}
      </div>

      {/* Navigation */}
      <nav
        id={mobile ? undefined : "desktop-navigation"}
        aria-label="Navigation principale"
        className="flex-1 p-3 space-y-1 overflow-y-auto custom-scrollbar"
      >
        {!collapsed && <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 py-2">Menu</div>}
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={mobile ? closeMobileMenu : undefined}
            aria-label={collapsed ? item.label : undefined}
            aria-current={isActive(item.href) ? "page" : undefined}
            className={`
              flex items-center gap-3 px-3 py-2.5 text-sm rounded-xl
              transition-all duration-200 group relative
              ${isActive(item.href)
                ? "bg-gradient-to-r from-brand-500/15 to-brand-500/5 text-brand-600 font-medium shadow-sm"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              }
              ${collapsed ? "justify-center px-2" : ""}
            `}
          >
            {/* Active indicator */}
            {isActive(item.href) && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-brand-500 rounded-full" />
            )}
            <span aria-hidden="true" className={`
              ${isActive(item.href) ? "text-brand-500" : "text-muted-foreground group-hover:text-foreground"}
              transition-colors flex-shrink-0
            `}>
              {item.icon}
            </span>
            {!collapsed && (
              <span className="truncate">{item.label}</span>
            )}
          </Link>
        ))}
      </nav>

      {/* User Menu */}
      <div className={`p-3 border-t border-border/50 ${collapsed ? "flex justify-center" : ""}`}>
        <UserMenu collapsed={collapsed} onNavigate={mobile ? closeMobileMenu : undefined} />
      </div>
    </>
  );

  return (
    <div className="flex h-dvh bg-gradient-to-br from-background via-background to-brand-50/30 relative">
      {/* Desktop Sidebar */}
      <aside className={`
        hidden md:flex flex-col bg-card/80 backdrop-blur-sm border-r border-border/50
        transition-all duration-300 ease-in-out
        ${sidebarCollapsed ? "w-16" : "w-64"}
      `}>
        {renderSidebar(sidebarCollapsed)}
      </aside>

      <Dialog open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <DialogPortal>
          <DialogOverlay className="md:hidden motion-reduce:animate-none" />
          <DialogContent
            aria-describedby={undefined}
            className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-full flex-col border-r bg-card shadow-2xl outline-none md:hidden motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:slide-in-from-left motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=closed]:slide-out-to-left"
          >
            <DialogTitle className="sr-only">Menu de navigation</DialogTitle>
            {renderSidebar(false, true)}
          </DialogContent>
        </DialogPortal>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b border-border/50 bg-card/80 px-3 shadow-sm backdrop-blur-sm sm:gap-3 sm:px-4 md:px-6">
            <div className="flex shrink-0 items-center gap-1 md:hidden">
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-11 w-11 text-muted-foreground hover:text-foreground"
                  aria-label="Ouvrir le menu de navigation"
                >
                  <Menu className="h-5 w-5" aria-hidden="true" />
                </Button>
              </DialogTrigger>
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 flex items-center justify-center">
                  {logo}
                </div>
                <span aria-hidden="true" className="hidden text-sm font-bold sm:inline">AFRIXORA</span>
              </div>
            </div>
            <div className="flex min-w-0 flex-1">
              <HeaderInfo />
            </div>
            {user && <NotificationBell key={`${user.id}:${tenantId}`} />}
          </header>

          <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8 custom-scrollbar motion-safe:animate-fade-in">
            {children}
          </main>
        </div>
      </Dialog>
    </div>
  );
};

export default DashboardLayout;
