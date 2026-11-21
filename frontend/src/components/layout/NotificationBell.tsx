"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import api from "@/lib/api";
import logger from "@/lib/logger";
import useStore from "@/store";
import type { Alert, PaginatedResponse } from "@/types";

const NotificationBell = () => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const storeAlerts = useStore((state) => state.alerts);
  const addAlert = useStore((state) => state.addAlert);
  const canAcknowledge = useStore(({ user }) => !!user && user.role !== "VIEWER");

  useEffect(() => {
    let pending: AbortController | undefined;
    const fetchAlerts = async (): Promise<void> => {
      pending?.abort();
      const controller = new AbortController();
      pending = controller;

      try {
        const res = await api.get<Alert[] | PaginatedResponse<Alert>>("/api/v1/alerts", {
          params: { isRead: false, limit: 5 },
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        const data = Array.isArray(res.data) ? res.data : res.data.data;
        const unreadAlerts = data.filter((alert) => !alert.isRead);
        setAlerts(unreadAlerts.slice(0, 5));
        setUnreadCount(Array.isArray(res.data) ? unreadAlerts.length : res.data.total);
        setStatus("ready");
      } catch (err) {
        if (controller.signal.aborted) return;
        logger.error("Erreur de chargement des notifications", err);
        setStatus("error");
      }
    };

    void fetchAlerts();
    const interval = setInterval(fetchAlerts, 30000);
    return () => {
      pending?.abort();
      clearInterval(interval);
    };
  }, [storeAlerts]);

  const markAsRead = async (id: string): Promise<void> => {
    try {
      const { data: alert } = await api.patch<Alert>(`/api/v1/alerts/${id}/read`);
      setAlerts(prev => prev.filter(a => a.id !== id));
      addAlert(alert);
    } catch (err) {
      logger.error("Erreur de marquage de la notification comme lue", err);
      toast.error("Impossible de marquer cette alerte comme lue.");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 shrink-0"
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} non lue${unreadCount === 1 ? "" : "s"}` : "Notifications"}
        >
          <Bell className="h-5 w-5" aria-hidden="true" />
          {unreadCount > 0 && (
            <span aria-hidden="true" className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[var(--radix-dropdown-menu-content-available-height)] w-80 max-w-[calc(100vw-1rem)] overflow-y-auto">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Alertes</span>
          {unreadCount > 0 && (
            <Badge variant="destructive" className="text-xs">{unreadCount} non lue(s)</Badge>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {status === "error" && (
          <div role="status" className="px-3 py-2 text-sm text-muted-foreground">
            Impossible d’actualiser les notifications.
          </div>
        )}
        {alerts.length === 0 ? (
          status !== "error" && (
            <div role="status" className="px-3 py-4 text-sm text-muted-foreground text-center">
              {status === "loading" ? "Chargement des notifications…" : "Aucune alerte non lue"}
            </div>
          )
        ) : (
          alerts.map(alert => {
            const notification = (
              <>
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
                  {alert.severity === "CRITICAL" ? "Critique" : alert.severity === "WARNING" ? "Avertissement" : "Info"}
                </Badge>
                {canAcknowledge && <span className="text-xs text-muted-foreground">Marquer comme lue</span>}
              </div>
              <p className="w-full break-words text-sm">{alert.message}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(alert.createdAt).toLocaleString("fr-FR")}
              </p>
              </>
            );
            return canAcknowledge ? (
              <DropdownMenuItem
                key={alert.id}
                className="flex cursor-pointer flex-col items-start gap-1"
                onSelect={() => void markAsRead(alert.id)}
              >
                {notification}
              </DropdownMenuItem>
            ) : (
              <div key={alert.id} className="flex flex-col gap-1 px-2 py-1.5">
                {notification}
              </div>
            );
          })
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/alerts" className="w-full text-center text-sm text-emerald-400 hover:text-emerald-300">
            Voir toutes les alertes
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default NotificationBell;
