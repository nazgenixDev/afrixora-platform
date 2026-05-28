"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import api from "@/lib/api";
import useStore from "@/store";

const HeaderInfo = () => {
  const [time, setTime] = useState<string | null>(null);
  const [buildingName, setBuildingName] = useState<string>("");
  const [tenants, setTenants] = useState<any[]>([]);
  
  const user = useStore(state => state.user);
  const impersonatedTenantId = useStore(state => state.impersonatedTenantId);
  const setImpersonatedTenantId = useStore(state => state.setImpersonatedTenantId);
  const isSuperAdmin = user?.role === "SUPER_ADMIN";

  // Horloge
  useEffect(() => {
    setTime(new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    const timer = setInterval(() => {
      setTime(new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Charger les tenants pour SUPER_ADMIN
  useEffect(() => {
    if (isSuperAdmin) {
      api.get("/api/v1/tenants")
        .then(res => setTenants(res.data || []))
        .catch(() => {});
    }
  }, [isSuperAdmin]);

  // Charger le premier bâtiment du tenant courant
  useEffect(() => {
    const tenantId = isSuperAdmin ? impersonatedTenantId : user?.tenantId;
    if (tenantId) {
      api.get(`/api/v1/buildings`)
        .then(res => {
          if (res.data?.length > 0) setBuildingName(res.data[0].name);
          else setBuildingName("");
        })
        .catch(() => {});
    }
  }, [impersonatedTenantId, user?.tenantId, isSuperAdmin]);

  const handleTenantChange = (value: string) => {
    if (value === "__all__") {
      setImpersonatedTenantId(null);
    } else {
      setImpersonatedTenantId(value);
    }
    // Forcer un rechargement complet de la page pour re-fetch toutes les données
    window.location.reload();
  };

  return (
    <div className="flex items-center gap-4">
      {isSuperAdmin && (
        <Select value={impersonatedTenantId || "__all__"} onValueChange={handleTenantChange}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Sélectionner un tenant" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Mon tenant</SelectItem>
            {tenants.map((t: any) => (
              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {buildingName && (
        <div className="hidden sm:block">
          <div className="text-sm font-medium">{buildingName}</div>
          <div className="text-xs text-muted-foreground">Lubumbashi, RDC</div>
        </div>
      )}

      <Badge variant="outline" className="hidden sm:flex items-center gap-1 animate-pulse text-emerald-400 border-emerald-400/30">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
        Gateway connectée
      </Badge>

      {time && (
        <div className="text-sm text-muted-foreground font-mono tabular-nums hidden md:block">
          {time}
        </div>
      )}
    </div>
  );
};

export default HeaderInfo;
