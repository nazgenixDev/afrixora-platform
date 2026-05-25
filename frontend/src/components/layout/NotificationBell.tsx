"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import api from "@/lib/api";

interface Alert {
  id: string;
  severity: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

const NotificationBell = () => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchAlerts = async () => {
    try {
      const res = await api.get("/api/v1/alerts?isRead=false");
      const data = res.data || [];
      setAlerts(data.slice(0, 5));
      setUnreadCount(data.length);
    } catch (err) {
      // silencieux
    }
  };

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 30000);
    return () => clearInterval(interval);
  }, []);

  const markAsRead = async (id: string) => {
    try {
      await api.patch(`/api/v1/alerts/${id}/read`);
      setAlerts(prev => prev.filter(a => a.id !== id));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      // silencieux
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div className="relative inline-flex items-center justify-center h-9 w-9 rounded-md hover:bg-accent hover:text-accent-foreground cursor-pointer">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Alertes</span>
          {unreadCount > 0 && (
            <Badge variant="destructive" className="text-xs">{unreadCount} non lue(s)</Badge>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {alerts.length === 0 ? (
          <div className="px-3 py-4 text-sm text-muted-foreground text-center">
            Aucune alerte non lue
          </div>
        ) : (
          alerts.map(alert => (
            <DropdownMenuItem key={alert.id} className="flex flex-col items-start gap-1 cursor-default">
              <div className="flex items-center justify-between w-full">
                <Badge
                  variant="outline"
                  className={
                    alert.severity === "CRITICAL"
                      ? "bg-red-500/10 text-red-400 border-red-500/30"
                      : alert.severity === "WARNING"
                      ? "bg-orange-500/10 text-orange-400 border-orange-500/30"
                      : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                  }
                >
                  {alert.severity === "CRITICAL" ? "CRIT" : alert.severity === "WARNING" ? "WARN" : "INFO"}
                </Badge>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    markAsRead(alert.id);
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Marquer lue
                </button>
              </div>
              <p className="text-sm">{alert.message}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(alert.createdAt).toLocaleString()}
              </p>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href="/alerts" className="w-full text-center text-sm text-emerald-400 hover:text-emerald-300">
            Voir toutes les alertes
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default NotificationBell;
