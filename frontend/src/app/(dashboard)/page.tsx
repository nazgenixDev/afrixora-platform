"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Activity, AlertTriangle, BarChart3, Building2, Cpu, Zap } from "lucide-react";
import {
  CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import KpiCard from "@/components/dashboard/KpiCard";
import SuperAdminDashboard from "@/components/dashboard/SuperAdminDashboard";
import { useDashboardBuildings } from "@/components/dashboard/useDashboardBuildings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import api from "@/lib/api";
import logger from "@/lib/logger";
import useStore, { type User } from "@/store";
import type { Alert, Building, ConsumptionBucket, Device, EnergySummary, PaginatedResponse, ZoneBucket } from "@/types";

interface DashboardAutomation {
  id: string;
  buildingId: string;
  name: string;
  isActive: boolean;
}

interface DashboardData {
  summary: EnergySummary;
  consumption: { date: string; kwh: number }[];
  zones: { id: string | null; name: string; value: number; color: string }[];
  devices: PaginatedResponse<Device>;
  alerts: PaginatedResponse<Alert>;
  automations: DashboardAutomation[];
  onlineDevices: number;
  criticalAlerts: number;
}

const COLORS = ["#00C9A7", "#3B82F6", "#FFA726", "#A855F7", "#FF4757", "#22C55E"];
const dateFormat = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short", day: "numeric", timeZone: "Africa/Kinshasa",
});
const alertDateFormat = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short", timeStyle: "short", timeZone: "Africa/Kinshasa",
});
const numberFormat = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const tooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  borderColor: "hsl(var(--border))",
  borderRadius: "0.75rem",
  color: "hsl(var(--foreground))",
};

function BuildingDashboard({ building, role }: { building: Building; role: User["role"] }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const canManage = role === "SUPER_ADMIN" || role === "TENANT_ADMIN" || role === "BUILDING_ADMIN";

  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    const buildingId = building.id;
    const energyOptions = { signal, params: { buildingId, period: "7d" } };

    async function loadData() {
      try {
        const [summary, consumption, zones, devices, onlineDevices, alerts, criticalAlerts, automations] = await Promise.all([
          api.get<EnergySummary>("/api/v1/energy/summary", energyOptions),
          api.get<ConsumptionBucket[]>("/api/v1/energy/consumption", energyOptions),
          api.get<ZoneBucket[]>("/api/v1/energy/by-zone", energyOptions),
          api.get<PaginatedResponse<Device>>("/api/v1/devices", { signal, params: { buildingId, limit: 6 } }),
          api.get<PaginatedResponse<Device>>("/api/v1/devices", { signal, params: { buildingId, isOnline: true, limit: 1 } }),
          api.get<PaginatedResponse<Alert>>("/api/v1/alerts", { signal, params: { buildingId, isRead: false, limit: 3 } }),
          api.get<PaginatedResponse<Alert>>("/api/v1/alerts", {
            signal, params: { buildingId, isRead: false, severity: "CRITICAL", limit: 1 },
          }),
          api.get<DashboardAutomation[]>("/api/v1/automations", { signal }),
        ]);

        if (signal.aborted) return;
        setData({
          summary: summary.data,
          consumption: consumption.data.map(bucket => ({
            date: dateFormat.format(new Date(bucket.bucket)),
            kwh: bucket.total_kwh,
          })),
          zones: zones.data.map((zone, index) => ({
            id: zone.zoneId,
            name: zone.name || "Sans zone",
            value: zone.total_kwh,
            color: COLORS[index % COLORS.length],
          })),
          devices: devices.data,
          onlineDevices: onlineDevices.data.total,
          alerts: alerts.data,
          criticalAlerts: criticalAlerts.data.total,
          automations: automations.data.filter(automation => automation.buildingId === buildingId).slice(0, 3),
        });
      } catch (error) {
        if (signal.aborted) return;
        controller.abort();
        logger.error("Erreur de chargement du tableau de bord du bâtiment", error);
        setFailed(true);
      }
    }

    void loadData();
    return () => controller.abort();
  }, [building.id, attempt]);

  if (failed) {
    return (
      <div className="space-y-3">
        <p role="alert" className="text-sm text-destructive">Impossible de charger les données du bâtiment.</p>
        <Button variant="outline" onClick={() => {
          setFailed(false);
          setAttempt(previous => previous + 1);
        }}>Réessayer</Button>
      </div>
    );
  }

  if (!data) {
    return <p role="status" className="py-12 text-center text-muted-foreground">Chargement des données du bâtiment…</p>;
  }

  const { devices, alerts, criticalAlerts, onlineDevices, summary } = data;
  const onlinePercent = devices.total > 0 ? Math.round((onlineDevices / devices.total) * 100) : 0;

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Puissance actuelle" value={summary.currentPowerW?.toFixed(1) ?? "—"}
          unit={summary.currentPowerW != null ? "W" : undefined} icon={<Zap className="w-4 h-4" />} accentColor="emerald" />
        <KpiCard label="Conso. 7 jours" value={summary.totalKwh.toFixed(1)} unit="kWh"
          icon={<BarChart3 className="w-4 h-4" />} accentColor="blue" />
        <KpiCard label="Appareils en ligne" value={onlineDevices} unit={`/ ${devices.total}`}
          icon={<Cpu className="w-4 h-4" />} accentColor="purple"
          trend={{ direction: "neutral", value: `${onlinePercent}% connectés` }} />
        <KpiCard label="Alertes non lues" value={alerts.total}
          icon={<AlertTriangle className="w-4 h-4" />} accentColor="red"
          trend={{ direction: criticalAlerts > 0 ? "up" : "neutral", value: `${criticalAlerts} critiques` }} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="min-w-0 lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle>Consommation sur 7 jours</CardTitle>
              <Activity className="w-4 h-4 shrink-0 text-muted-foreground" />
            </CardHeader>
            <CardContent className="h-72">
              {data.consumption.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <LineChart data={data.consumption}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                    <YAxis width={48} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                    <Tooltip contentStyle={tooltipStyle} formatter={value => `${numberFormat.format(Number(value))} kWh`} />
                    <Legend />
                    <Line type="monotone" dataKey="kwh" name="Consommation" stroke="#10b981" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="flex h-full items-center justify-center text-center text-muted-foreground">
                  Aucune mesure de consommation sur les 7 derniers jours.
                </p>
              )}
            </CardContent>
          </Card>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-semibold"><Cpu className="w-4 h-4" /> Appareils IoT</h2>
              <Button asChild variant="outline" size="sm">
                <Link href="/devices">{canManage ? "Gérer les appareils" : "Voir les appareils"}</Link>
              </Button>
            </div>
            {devices.total === 0 ? (
              <p className="rounded-xl border-2 border-dashed p-5 text-sm text-muted-foreground">
                Aucun appareil enregistré pour ce bâtiment.
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {devices.data.map(device => (
                  <Card key={device.id} className="min-w-0 p-4">
                    <p className="text-sm font-medium [overflow-wrap:anywhere]">{device.name}</p>
                    <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{device.zone?.name || "Sans zone"}</p>
                    <Badge variant="outline" className={`mt-2 ${device.isOnline ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                      {device.isOnline ? "En ligne" : "Hors ligne"}
                    </Badge>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader><CardTitle>Répartition par zone</CardTitle></CardHeader>
            <CardContent className="h-52">
              {data.zones.some(zone => zone.value > 0) ? (
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <PieChart>
                    <Pie data={data.zones} innerRadius={36} outerRadius={62} dataKey="value" nameKey="name">
                      {data.zones.map(zone => <Cell key={zone.id ?? "sans-zone"} fill={zone.color} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} formatter={value => `${numberFormat.format(Number(value))} kWh`} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="flex h-full items-center justify-center text-muted-foreground">Aucune consommation à répartir.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center gap-2 space-y-0">
              <CardTitle>Alertes non lues</CardTitle>
              {alerts.total > 0 && <Badge variant="destructive">{alerts.total}</Badge>}
            </CardHeader>
            <CardContent className="space-y-3">
              {alerts.total === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune alerte non lue.</p>
              ) : (
                <ul className="divide-y">
                  {alerts.data.map(alert => (
                    <li key={alert.id} className="flex items-start gap-2 py-2 first:pt-0">
                      <Badge variant={alert.severity === "CRITICAL" ? "destructive" : "secondary"}>
                        {alert.severity === "CRITICAL" ? "Critique" : alert.severity === "WARNING" ? "Avert." : "Info"}
                      </Badge>
                      <div className="min-w-0">
                        <p className="text-sm [overflow-wrap:anywhere]">{alert.message}</p>
                        <p className="text-xs text-muted-foreground">{alertDateFormat.format(new Date(alert.createdAt))}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <Button asChild variant="outline" size="sm">
                <Link href="/alerts">{role === "VIEWER" ? "Voir les alertes" : "Gérer les alertes"}</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Automatisations</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {data.automations.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune automatisation configurée.</p>
              ) : (
                <ul className="divide-y">
                  {data.automations.map(automation => (
                    <li key={automation.id} className="flex items-start justify-between gap-2 py-2 first:pt-0">
                      <span className="min-w-0 text-sm [overflow-wrap:anywhere]">{automation.name}</span>
                      <Badge variant="secondary" className="shrink-0">{automation.isActive ? "Active" : "Désactivée"}</Badge>
                    </li>
                  ))}
                </ul>
              )}
              {canManage && (
                <Button asChild variant="outline" size="sm">
                  <Link href="/automations">Gérer les automatisations</Link>
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function TenantDashboard({ role }: { role: User["role"] }) {
  const { state, retry } = useDashboardBuildings();
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const canManage = role === "SUPER_ADMIN" || role === "TENANT_ADMIN" || role === "BUILDING_ADMIN";

  if (state.status === "loading") {
    return <p role="status" className="py-12 text-center text-muted-foreground">Chargement des bâtiments…</p>;
  }

  if (state.status === "error") {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-bold">Tableau de bord</h1>
        <p role="alert" className="text-sm text-destructive">Impossible de charger la liste des bâtiments.</p>
        <Button variant="outline" onClick={retry}>Réessayer</Button>
      </div>
    );
  }

  const { buildings, savedBuildingId } = state;
  const selectedId = selectedBuildingId ?? savedBuildingId;
  const building = buildings.find(item => item.id === selectedId) ?? buildings[0];

  if (!building) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-bold">Tableau de bord</h1>
        <p className="text-muted-foreground">Aucun bâtiment actif dans cet espace.</p>
        {canManage && <Button asChild><Link href="/buildings">Gérer les bâtiments</Link></Button>}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight [overflow-wrap:anywhere]">{building.name}</h1>
          <p className="flex items-center gap-1 text-muted-foreground">
            <Building2 className="w-3.5 h-3.5 shrink-0" />
            Données du bâtiment
          </p>
        </div>
        {buildings.length > 1 && (
          <Select value={building.id} onValueChange={id => {
            setSelectedBuildingId(id);
            localStorage.setItem("afrixora_selected_building", id);
          }}>
            <SelectTrigger aria-label="Bâtiment" className="min-w-0 sm:w-48 [&>span]:truncate">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {buildings.map(item => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>
      <BuildingDashboard key={building.id} building={building} role={role} />
    </div>
  );
}

export default function DashboardPage() {
  const user = useStore(state => state.user);
  const impersonatedTenantId = useStore(state => state.impersonatedTenantId);

  if (!user) return <p role="status" className="py-12 text-center text-muted-foreground">Chargement du profil…</p>;
  if (user.role === "SUPER_ADMIN" && !impersonatedTenantId) return <SuperAdminDashboard />;

  return (
    <TenantDashboard
      key={`${user.id}:${user.role}:${impersonatedTenantId ?? user.tenantId}`}
      role={user.role}
    />
  );
}
