"use client";

import { useEffect, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import api, { tenantDeletedEvent } from "@/lib/api";
import useStore from "@/store";

interface TenantOption {
  id: string;
  name: string;
}

const HeaderInfo = () => {
  const [time, setTime] = useState<string | null>(null);
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  
  const user = useStore(state => state.user);
  const impersonatedTenantId = useStore(state => state.impersonatedTenantId);
  const setImpersonatedTenantId = useStore(state => state.setImpersonatedTenantId);
  const isSuperAdmin = user?.role === "SUPER_ADMIN";

  // Horloge
  useEffect(() => {
    const updateTime = () => {
      setTime(new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Charger les tenants pour SUPER_ADMIN
  useEffect(() => {
    if (!isSuperAdmin) return;

    let controller: AbortController | undefined;
    const loadTenants = () => {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      api.get<TenantOption[]>("/api/v1/tenants", { signal: request.signal })
        .then(res => {
          if (!request.signal.aborted) setTenants(res.data || []);
        })
        .catch(() => {});
    };
    const removeTenant = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      setTenants(current => current.filter(tenant => tenant.id !== id));
      loadTenants();
    };

    loadTenants();
    window.addEventListener(tenantDeletedEvent, removeTenant);
    return () => {
      controller?.abort();
      window.removeEventListener(tenantDeletedEvent, removeTenant);
    };
  }, [isSuperAdmin]);

  const handleTenantChange = (value: string) => {
    setImpersonatedTenantId(value === "__all__" ? null : value);
    // Forcer un rechargement complet de la page pour re-fetch toutes les données
    window.location.reload();
  };

  return (
    <div className="flex w-full min-w-0 items-center gap-4 sm:w-auto">
      {isSuperAdmin && (
        <Select value={impersonatedTenantId || "__all__"} onValueChange={handleTenantChange}>
          <SelectTrigger
            aria-label="Client actif"
            className="w-full min-w-0 gap-2 sm:w-48 [&>span]:truncate [&>svg]:shrink-0"
          >
            <SelectValue placeholder="Sélectionner un client" />
          </SelectTrigger>
          <SelectContent className="max-w-[calc(100vw-1rem)]">
            <SelectItem value="__all__">Mon espace</SelectItem>
            {tenants.map((tenant) => (
              <SelectItem key={tenant.id} value={tenant.id} className="[overflow-wrap:anywhere]">{tenant.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {time && (
        <div className="text-sm text-muted-foreground font-mono tabular-nums hidden md:block">
          {time}
        </div>
      )}
    </div>
  );
};

export default HeaderInfo;
