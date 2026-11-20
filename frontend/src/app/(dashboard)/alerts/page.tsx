"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import useSocket from "@/hooks/useSocket";
import useStore from "@/store";
import type { Alert, AlertType, PaginatedResponse, Severity } from "@/types";
import api from "@/lib/api";
import logger from "@/lib/logger";

interface Building {
  id: string;
  name: string;
}

interface AlertFilters {
  severity: Severity | "ALL";
  isRead: boolean | "ALL";
  buildingId: string | "ALL";
}

const AlertsPage = () => {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(null);
  const [fetchedAlerts, setFetchedAlerts] = useState<Alert[]>([]);
  const [unreadCount, setUnreadCount] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<AlertFilters>({
    severity: "ALL",
    isRead: "ALL",
    buildingId: "ALL",
  });

  const storeAlerts = useStore((state) => state.alerts);
  const addAlert = useStore((state) => state.addAlert);
  const tenantId = useStore((state) => state.user?.tenantId);
  const canAcknowledge = useStore(({ user }) => !!user && user.role !== "VIEWER");

  const { isConnected } = useSocket({
    buildingId: selectedBuilding?.id,
    enabled: !!selectedBuilding,
  });

  useEffect(() => {
    const fetchBuildings = async (): Promise<void> => {
      try {
        const response = await api.get<Building[] | PaginatedResponse<Building>>("/api/v1/buildings");
        const raw = response.data;
        setBuildings(Array.isArray(raw) ? raw : (raw?.data ?? []));
      } catch (err) {
        logger.error("Erreur de chargement des bâtiments", err);
        setError("Impossible de charger les bâtiments.");
      }
    };

    fetchBuildings();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const fetchAlerts = async (): Promise<void> => {
      setIsLoading(true);
      setError(null);

      try {
        const res = await api.get<Alert[] | PaginatedResponse<Alert>>("/api/v1/alerts", {
          params: {
            severity: filters.severity === "ALL" ? undefined : filters.severity,
            isRead: filters.isRead === "ALL" ? undefined : filters.isRead,
            buildingId: filters.buildingId === "ALL" ? undefined : filters.buildingId,
          },
          signal: controller.signal,
        });
        const data = Array.isArray(res.data) ? res.data : res.data.data ?? res.data;
        if (!controller.signal.aborted) setFetchedAlerts(data);
      } catch (err) {
        if (controller.signal.aborted) return;
        logger.error("Erreur de chargement des alertes", err);
        setError("Impossible de charger les alertes.");
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };

    void fetchAlerts();
    return () => controller.abort();
  }, [filters, tenantId]);

  const { severity, buildingId } = filters;
  useEffect(() => {
    const controller = new AbortController();
    const fetchUnreadCount = async (): Promise<void> => {
      try {
        const res = await api.get<Alert[] | PaginatedResponse<Alert>>("/api/v1/alerts", {
          params: {
            isRead: false,
            severity: severity === "ALL" ? undefined : severity,
            buildingId: buildingId === "ALL" ? undefined : buildingId,
          },
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setUnreadCount(Array.isArray(res.data)
          ? res.data.filter((alert) => !alert.isRead &&
            (severity === "ALL" || alert.severity === severity) &&
            (buildingId === "ALL" || alert.buildingId === buildingId)).length
          : res.data.total);
      } catch (err) {
        if (controller.signal.aborted) return;
        logger.error("Erreur de chargement du nombre d’alertes non lues", err);
        setUnreadCount(null);
      }
    };

    void fetchUnreadCount();
    return () => controller.abort();
  }, [severity, buildingId, tenantId, storeAlerts]);

  // Les événements Socket.IO et les confirmations de lecture enrichissent la liste HTTP.
  const alerts = useMemo((): Alert[] => {
    const alertsById = new Map(fetchedAlerts.map((alert) => [alert.id, alert]));

    for (const alert of storeAlerts) {
      if (alert.tenantId !== tenantId) continue;
      const fetchedAlert = alertsById.get(alert.id);
      if (!fetchedAlert || alert.isRead) alertsById.set(alert.id, alert);
    }

    return [...alertsById.values()]
      .filter((alert) => alert.tenantId === tenantId &&
        (filters.severity === "ALL" || filters.severity === alert.severity) &&
        (filters.isRead === "ALL" || filters.isRead === alert.isRead) &&
        (filters.buildingId === "ALL" || filters.buildingId === alert.buildingId))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [fetchedAlerts, storeAlerts, filters, tenantId]);

  const handleMarkAsRead = async (alertId: string): Promise<void> => {
    try {
      const { data: alert } = await api.patch<Alert>(`/api/v1/alerts/${alertId}/read`);
      setFetchedAlerts((current) => current.map((item) => item.id === alert.id ? alert : item));
      addAlert(alert);
    } catch (err) {
      logger.error("Erreur de marquage de l’alerte comme lue", err);
    }
  };

  const handleFilterChange = <K extends keyof AlertFilters>(key: K, value: AlertFilters[K]): void => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const getSeverityBadge = (severity: Severity) => {
    switch (severity) {
      case "INFO":
        return <Badge className="bg-blue-500">INFO</Badge>;
      case "WARNING":
        return <Badge className="bg-orange-500">AVERTISSEMENT</Badge>;
      case "CRITICAL":
        return <Badge className="bg-red-600">CRITIQUE</Badge>;
      default:
        return <Badge>{severity}</Badge>;
    }
  };

  const getAlertTypeLabel = (type: AlertType): string => {
    switch (type) {
      case "THRESHOLD":
        return "Seuil dépassé";
      case "OFFLINE":
        return "Appareil hors ligne";
      case "AUTOMATION":
        return "Automatisation déclenchée";
      case "SYSTEM":
        return "Système";
      default:
        return type;
    }
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  // Chargement
  if (isLoading && alerts.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-t-emerald-500 border-emerald-200 rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Chargement des alertes...</p>
        </div>
      </div>
    );
  }

  // Erreur
  if (error && alerts.length === 0) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-md">
        <h2 className="text-lg font-semibold text-red-700">Erreur</h2>
        <p className="text-red-600">{error}</p>
        <Button
          className="mt-4"
          variant="outline"
          onClick={() => {
            setError(null);
            setIsLoading(true);
            setSelectedBuilding(null);
            setFilters({
              severity: "ALL",
              isRead: "ALL",
              buildingId: "ALL",
            });
          }}
        >
          Réessayer
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Alertes</h1>
          <p className="text-muted-foreground">
            {unreadCount === null ? "Gérez les alertes et notifications du système" :
              `${unreadCount} alerte${unreadCount === 1 ? "" : "s"} non lue${unreadCount === 1 ? "" : "s"}`}
          </p>
        </div>

        {/* Filtres */}
        <div className="flex flex-col sm:flex-row gap-2">
          {/* Filtre de sévérité */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-full sm:w-auto">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="w-5 h-5 mr-2"
                >
                  <path
                    fillRule="evenodd"
                    d="M2.628 1.601C5.028 1.206 7.49 1 10 1s4.973.206 7.372.601a.75.75 0 01.628.74v2.288a2.25 2.25 0 01-.659 1.59l-4.682 4.683a2.25 2.25 0 00-.659 1.59v3.037c0 .684-.31 1.33-.844 1.757l-1.937 1.55A.75.75 0 018 18.25v-5.757a2.25 2.25 0 00-.659-1.591L2.659 6.22A2.25 2.25 0 012 4.629V2.34a.75.75 0 01.628-.74z"
                    clipRule="evenodd"
                  />
                </svg>
                Sévérité: {filters.severity === "ALL" ? "Toutes" : filters.severity}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => handleFilterChange("severity", "ALL")}
                className="cursor-pointer"
              >
                Toutes
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleFilterChange("severity", "INFO")}
                className="cursor-pointer"
              >
                INFO
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleFilterChange("severity", "WARNING")}
                className="cursor-pointer"
              >
                AVERTISSEMENT
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleFilterChange("severity", "CRITICAL")}
                className="cursor-pointer"
              >
                CRITIQUE
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Filtre de lecture */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-full sm:w-auto">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="w-5 h-5 mr-2"
                >
                  <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
                  <path
                    fillRule="evenodd"
                    d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
                    clipRule="evenodd"
                  />
                </svg>
                Statut:{" "}
                {filters.isRead === "ALL"
                  ? "Tous"
                  : filters.isRead
                  ? "Lues"
                  : "Non lues"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => handleFilterChange("isRead", "ALL")}
                className="cursor-pointer"
              >
                Tous
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleFilterChange("isRead", true)}
                className="cursor-pointer"
              >
                Lues
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleFilterChange("isRead", false)}
                className="cursor-pointer"
              >
                Non lues
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Filtre de bâtiment */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-full sm:w-auto">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="w-5 h-5 mr-2"
                >
                  <path
                    fillRule="evenodd"
                    d="M4 16.5v-13h-.25a.75.75 0 010-1.5h12.5a.75.75 0 010 1.5H16v13h.25a.75.75 0 010 1.5h-12.5a.75.75 0 010-1.5H4zm3-11a.75.75 0 01.75-.75h4.5a.75.75 0 010 1.5h-4.5A.75.75 0 017 5.5zm0 4a.75.75 0 01.75-.75h4.5a.75.75 0 010 1.5h-4.5A.75.75 0 017 9.5zm0 4a.75.75 0 01.75-.75h4.5a.75.75 0 010 1.5h-4.5a.75.75 0 01-.75-.75z"
                    clipRule="evenodd"
                  />
                </svg>
                Bâtiment:{" "}
                {filters.buildingId === "ALL"
                  ? "Tous"
                  : buildings.find((b) => b.id === filters.buildingId)?.name || "Inconnu"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                onClick={() => {
                  handleFilterChange("buildingId", "ALL");
                  setSelectedBuilding(null);
                }}
                className="cursor-pointer"
              >
                Tous les bâtiments
              </DropdownMenuItem>
              {buildings.map((building) => (
                <DropdownMenuItem
                  key={building.id}
                  onClick={() => {
                    handleFilterChange("buildingId", building.id);
                    setSelectedBuilding(building);
                  }}
                  className="cursor-pointer"
                >
                  {building.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* État de la connexion temps réel */}
      {selectedBuilding && (
        <div
          className={`text-sm ${
            isConnected ? "text-emerald-600" : "text-amber-600"
          } flex items-center`}
        >
          <span
            className={`inline-block w-2 h-2 rounded-full mr-2 ${
              isConnected ? "bg-emerald-600" : "bg-amber-600"
            }`}
          ></span>
          {isConnected
            ? "Alertes en temps réel connectées"
            : "Alertes en temps réel déconnectées"}
        </div>
      )}

      {/* Liste des alertes */}
      {alerts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-12 h-12 text-muted-foreground mb-4"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <h3 className="text-lg font-medium">Aucune alerte trouvée</h3>
            <p className="text-muted-foreground mt-2">
              Aucune alerte ne correspond à vos critères de filtrage actuels.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {alerts.map((alert) => (
            <Card
              key={alert.id}
              className={`overflow-hidden ${
                alert.isRead ? "bg-card/50" : "border-l-4 border-l-emerald-600"
              }`}
            >
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <div>{getSeverityBadge(alert.severity)}</div>
                    <CardTitle className="text-base">
                      {getAlertTypeLabel(alert.type)}
                    </CardTitle>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {formatDate(alert.createdAt)}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pb-4">
                <p className="mb-4">{alert.message}</p>
                <div className="flex justify-between items-center">
                  <div className="text-sm text-muted-foreground">
                    {buildings.find((b) => b.id === alert.buildingId)?.name || "Bâtiment inconnu"}
                  </div>
                  {canAcknowledge && !alert.isRead && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleMarkAsRead(alert.id)}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="w-4 h-4 mr-2"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                          clipRule="evenodd"
                        />
                      </svg>
                      Marquer comme lu
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default AlertsPage;
