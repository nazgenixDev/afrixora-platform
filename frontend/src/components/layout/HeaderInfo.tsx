"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import api from "@/lib/api";

const HeaderInfo = () => {
  const [time, setTime] = useState<string | null>(null);
  const [buildingName, setBuildingName] = useState<string>("");

  useEffect(() => {
    setTime(new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    const timer = setInterval(() => {
      setTime(new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get("/api/v1/buildings");
        if (res.data?.length > 0) {
          setBuildingName(res.data[0].name);
        }
      } catch {}
    })();
  }, []);

  return (
    <div className="flex items-center gap-4">
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
