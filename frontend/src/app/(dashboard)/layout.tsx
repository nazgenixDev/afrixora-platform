"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Home, Building2, Cpu, Zap, Workflow, Bell, FileText, Menu, Users, Settings, X, Globe, Briefcase
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { isAuthenticated, clearToken, redirectToLogin, getToken } from "@/lib/auth";
import { decodeJwtPayload } from "@/lib/jwt";
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
  const user = useStore((state) => state.user);
  const role = user?.role || "VIEWER";
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      redirectToLogin();
    }
  }, []);

  useEffect(() => {
    const token = getToken();
    if (token && !user?.email) {
      api.get("/api/v1/users/me")
        .then(res => {
          useStore.getState().setAuth(res.data, token);
        })
        .catch(() => {});
    } else if (token && !user) {
      const payload = decodeJwtPayload(token);
      if (payload && payload.role && payload.userId && payload.tenantId) {
        useStore.getState().setAuth(
          { id: payload.userId, email: "", name: "", role: payload.role, tenantId: payload.tenantId } as any,
          token
        );
      }
    }
  }, []);

  const closeMobileMenu = () => setMobileMenuOpen(false);

  const baseNav = [
    { href: "/", label: "Dashboard", icon: <Home className="h-5 w-5" /> },
    { href: "/buildings", label: "Buildings", icon: <Building2 className="h-5 w-5" /> },
    { href: "/devices", label: "Devices", icon: <Cpu className="h-5 w-5" /> },
    { href: "/energy", label: "Energy", icon: <Zap className="h-5 w-5" /> },
    { href: "/reports", label: "Reports", icon: <FileText className="h-5 w-5" /> },
    { href: "/settings", label: "Paramètres", icon: <Settings className="h-5 w-5" /> },
  ];

  const adminNav = [
    { href: "/automations", label: "Automations", icon: <Workflow className="h-5 w-5" /> },
    { href: "/alerts", label: "Alerts", icon: <Bell className="h-5 w-5" /> },
    { href: "/users", label: "Utilisateurs", icon: <Users className="h-5 w-5" /> },
    { href: "/api-dashboard", label: "API Dashboard", icon: <Settings className="h-5 w-5" /> },
  ];

  const isAdmin = ["SUPER_ADMIN", "TENANT_ADMIN"].includes(role);
// Ajouter Tenants uniquement pour SUPER_ADMIN
  if (role === "SUPER_ADMIN") {
    adminNav.unshift({ href: "/tenants", label: "Tenants", icon: <Briefcase className="h-5 w-5" /> });
  }
  const navItems = isAdmin ? [...baseNav, ...adminNav] : baseNav;

  const sidebarContent = (
    <>
      <div className="p-4 flex items-center justify-center">
        <img src="/afrixora_logo1.svg" alt="AFRIXORA" className="h-16 w-auto" />
        <Button variant="ghost" size="icon" className="md:hidden absolute right-4" onClick={closeMobileMenu}>
          <X className="h-5 w-5" />
        </Button>
      </div>
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={closeMobileMenu}
            className="flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-accent hover:text-accent-foreground"
          >
            {item.icon}
            {item.label}
          </Link>
        ))}
      </nav>
      <UserMenu />
    </>
  );

  return (
    <div className="flex h-screen bg-background relative">
      <aside className="hidden md:flex w-64 flex-col bg-card border-r">
        {sidebarContent}
      </aside>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={closeMobileMenu} />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-card border-r transform transition-transform duration-300 ease-in-out md:hidden ${
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {sidebarContent}
      </aside>

      <div className="flex flex-col flex-1 overflow-hidden">
        <header className="h-16 border-b flex items-center justify-between px-4 bg-card">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileMenuOpen(true)}>
              <Menu className="h-5 w-5" />
            </Button>
            <img src="/afrixora_logo1.svg" alt="AFRIXORA" className="h-8 w-auto md:hidden" />
          </div>
          <HeaderInfo />
          <div className="flex items-center gap-4">
            <NotificationBell />
          </div>
        </header>
        <main className="flex-1 overflow-auto p-4">{children}</main>
      </div>
    </div>
  );
};

export default DashboardLayout;
