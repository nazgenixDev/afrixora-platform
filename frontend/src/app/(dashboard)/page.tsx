"use client";
import SuperAdminDashboard from "@/components/dashboard/SuperAdminDashboard";
import useStore from "@/store";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import KpiCard from "@/components/dashboard/KpiCard";
import api from "@/lib/api";
import logger from "@/lib/logger";
import type { Device, Building, Alert, EnergySummary, ConsumptionBucket, ZoneBucket } from "@/types";
import {
  LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from "recharts";
import { Zap, BarChart3, Cpu, AlertTriangle, Building2, Activity, RefreshCw } from "lucide-react";

interface DashboardData {
  energySummary: EnergySummary | null;
  consumptionData: { date: string; kwh: number; threshold: number }[];
  zoneDistribution: { name: string; value: number; color: string }[];
  devices: Device[];
  alerts: Alert[];
  automations: unknown[];
  isLoading: boolean;
  noBuilding: boolean;
}

const COLORS = ["#00C9A7", "#3B82F6", "#FFA726", "#A855F7", "#FF4757", "#22C55E"];

// Custom Tooltip personnalisé
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border rounded-xl shadow-lg p-3 backdrop-blur-sm">
        <p className="text-sm font-medium mb-1">{label}</p>
        {payload.map((entry: any, idx: number) => (
          <p key={idx} className="text-sm" style={{ color: entry.color }}>
            {entry.name}: <span className="font-semibold">{entry.value.toFixed(1)} kWh</span>
          </p>
        ))}
      </div>
    );
  }
  return null;
};

const DashboardPage = () => {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [selectedBuilding, setSelectedBuilding] = useState<string>("");
  const [data, setData] = useState<DashboardData>({
    energySummary: null,
    consumptionData: [],
    zoneDistribution: [],
    devices: [],
    alerts: [],
    automations: [],
    isLoading: true,
    noBuilding: false,
  });

  // Charger la liste des bâtiments au montage
  useEffect(() => {
    (async () => {
      try {
        const res = await api.get("/api/v1/buildings");
        const buildingList: Building[] = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
        setBuildings(buildingList);
        
        // Restaurer le bâtiment depuis localStorage, ou prendre le premier
        const savedBuildingId = localStorage.getItem("afrixora_selected_building");
        if (savedBuildingId && buildingList.some((b: Building) => b.id === savedBuildingId)) {
          setSelectedBuilding(savedBuildingId);
        } else if (buildingList.length > 0) {
          setSelectedBuilding(buildingList[0].id);
        } else {
          setData(prev => ({ ...prev, noBuilding: true, isLoading: false }));
        }
      } catch (err) {
        logger.error("Erreur chargement bâtiments", err);
        setData(prev => ({ ...prev, isLoading: false, noBuilding: true }));
      }
    })();
  }, []);

  // Sauvegarder la sélection dans localStorage
  useEffect(() => {
    if (selectedBuilding) {
      localStorage.setItem("afrixora_selected_building", selectedBuilding);
    }
  }, [selectedBuilding]);

  // Charger les données pour le bâtiment sélectionné
  useEffect(() => {
    if (!selectedBuilding) return;
    let cancelled = false;
    (async () => {
      setData(prev => ({ ...prev, isLoading: true }));
      try {
        const [sumRes, consRes, zoneRes, devRes, alRes, auRes] = await Promise.all([
          api.get(`/api/v1/energy/summary?buildingId=${selectedBuilding}&period=7d`),
          api.get(`/api/v1/energy/consumption?buildingId=${selectedBuilding}&period=7d`),
          api.get(`/api/v1/energy/by-zone?buildingId=${selectedBuilding}&period=7d`),
          api.get("/api/v1/devices"),
          api.get("/api/v1/alerts"),
          api.get("/api/v1/automations"),
        ]);

        if (cancelled) return;

        // Filtrer les devices et alertes par le buildingId
        const allDevices: Device[] = Array.isArray(devRes.data) ? devRes.data : (devRes.data?.data ?? []);
        const buildingDevices = allDevices.filter((d: Device) => d.buildingId === selectedBuilding);
        const buildingAlerts: Alert[] = Array.isArray(alRes.data) ? alRes.data : (alRes.data?.data ?? []);
        const filteredAlerts = buildingAlerts.filter((a: Alert) => a.buildingId === selectedBuilding);
        const allAutomations: unknown[] = Array.isArray(auRes.data) ? auRes.data : (auRes.data?.data ?? []);
        const buildingAutomations = allAutomations.filter((a) => {
          if (typeof a === 'object' && a !== null) {
            return (a as Record<string, unknown>).buildingId === selectedBuilding;
          }
          return false;
        });

        const consumptionData = (Array.isArray(consRes.data) ? consRes.data : (consRes.data?.data ?? [])).map((i: ConsumptionBucket) => ({
          date: new Date(i.bucket).toLocaleDateString("fr-FR", { weekday: "short" }),
          kwh: i.total_kwh,
          threshold: 25,
        }));

        const zoneDistribution = (Array.isArray(zoneRes.data) ? zoneRes.data : (zoneRes.data?.data ?? [])).map((i: ZoneBucket, idx: number) => ({
          name: i.zone_name || i.name || `Zone ${idx + 1}`,
          value: i.total_kwh,
          color: COLORS[idx % COLORS.length],
        }));

        setData({
          energySummary: sumRes.data ?? sumRes,
          consumptionData,
          zoneDistribution,
          devices: buildingDevices,
          alerts: filteredAlerts,
          automations: buildingAutomations,
          isLoading: false,
          noBuilding: false,
        });
      } catch (err) {
        logger.error("Erreur chargement données dashboard", err);
        if (!cancelled) setData(prev => ({ ...prev, isLoading: false }));
      }
    })();
    return () => { cancelled = true; };
  }, [selectedBuilding]);

  const user = useStore(state => state.user);
  const impersonatedTenantId = useStore(state => state.impersonatedTenantId);
  const [showSuperAdmin, setShowSuperAdmin] = useState(false);

  useEffect(() => {
    if (user?.role === "SUPER_ADMIN" && !impersonatedTenantId) {
      setShowSuperAdmin(true);
    } else {
      setShowSuperAdmin(false);
    }
  }, [user, impersonatedTenantId]);

  // Loading state
  if (data.isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <div className="skeleton h-8 w-48 mb-2" />
            <div className="skeleton h-4 w-32" />
          </div>
          <div className="skeleton h-10 w-44 rounded-lg" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => (
            <div key={i} className="skeleton h-32 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 skeleton h-80 rounded-xl" />
          <div className="skeleton h-80 rounded-xl" />
        </div>
      </div>
    );
  }

  if (data.noBuilding) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4 animate-fade-in-up">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto">
            <Building2 className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground text-lg">Aucun bâtiment enregistré.</p>
          <Button className="bg-brand-600 hover:bg-brand-700 shadow-lg shadow-brand-500/25" onClick={() => window.location.href = "/buildings"}>
            Ajouter un bâtiment
          </Button>
        </div>
      </div>
    );
  }

  if (showSuperAdmin) {
    return <SuperAdminDashboard />;
  }

  const onlineDevices = data.devices.filter((d: Device) => d.isOnline).length;
  const totalDevices = data.devices.length;
  const activeAlerts = data.alerts.filter((a: Alert) => !a.isRead).length;
  const criticalAlerts = data.alerts.filter((a: Alert) => a.severity === "CRITICAL" && !a.isRead).length;
  const selectedBuildingName = buildings.find(b => b.id === selectedBuilding)?.name || "Bâtiment";

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header avec sélecteur de bâtiment */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{selectedBuildingName}</h1>
          <p className="text-muted-foreground flex items-center gap-1">
            <Building2 className="w-3.5 h-3.5" />
            {buildings.find(b => b.id === selectedBuilding)?._count?.zones || 0} zones · {totalDevices} appareils
          </p>
        </div>
        <div className="flex items-center gap-2">
          {buildings.length > 1 && (
            <Select value={selectedBuilding} onValueChange={setSelectedBuilding}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Sélectionner un bâtiment" />
              </SelectTrigger>
              <SelectContent>
                {buildings.map((b: Building) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Badge variant="outline" className="gap-1.5 text-emerald-500 border-emerald-500/30 bg-emerald-500/5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            Live
          </Badge>
        </div>
      </div>

      {/* Si aucun appareil */}
      {totalDevices === 0 && (
        <div className="p-8 border-2 border-dashed rounded-xl bg-muted/10 text-center animate-fade-in">
          <Cpu className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground mb-3">Aucun appareil enregistré pour ce bâtiment.</p>
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => window.location.href = "/devices"}>
            Ajouter des appareils
          </Button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Puissance actuelle"
          value={data.energySummary?.avgPowerW?.toFixed(1) || "0"}
          unit="kW"
          icon={<Zap className="w-4 h-4" />}
          accentColor="emerald"
          trend={{ direction: "up", value: "+12% vs hier" }}
        />
        <KpiCard
          label="Conso. 7 jours"
          value={data.energySummary?.totalKwh?.toFixed(1) || "0"}
          unit="kWh"
          icon={<BarChart3 className="w-4 h-4" />}
          accentColor="blue"
          trend={{ direction: "down", value: "-5% vs prec." }}
        />
        <KpiCard
          label="Appareils en ligne"
          value={onlineDevices}
          unit={`/ ${totalDevices}`}
          icon={<Cpu className="w-4 h-4" />}
          accentColor="purple"
          trend={{ direction: "neutral", value: `${totalDevices > 0 ? Math.round((onlineDevices / totalDevices) * 100) : 0}% connectés` }}
        />
        <KpiCard
          label="Alertes actives"
          value={activeAlerts}
          icon={<AlertTriangle className="w-4 h-4" />}
          accentColor="red"
          trend={{ direction: criticalAlerts > 0 ? "up" : "neutral", value: `${criticalAlerts} critiques` }}
        />
      </div>

      {/* Graphiques et détails */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Consommation — 7 derniers jours</CardTitle>
              <Activity className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="h-72">
              {data.consumptionData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.consumptionData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                    <YAxis unit="kWh" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <ReferenceLine y={25} stroke="#F97316" strokeDasharray="5 5" />
                    <Line type="monotone" dataKey="kwh" stroke="#10b981" strokeWidth={2} dot={{ r: 3, fill: "#10b981" }} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="threshold" stroke="#F97316" strokeDasharray="5 5" dot={false} name="Seuil" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full flex-col gap-2 text-muted-foreground">
                  <BarChart3 className="w-8 h-8" />
                  <span>Aucune donnée de consommation</span>
                </div>
              )}
            </CardContent>
          </Card>

          {totalDevices > 0 && (
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Cpu className="w-4 h-4" />
                Appareils IoT
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {data.devices.slice(0, 6).map((d: Device) => (
                  <Card key={d.id} className={`p-4 ${d.config?.state === "on" ? "border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 to-transparent" : ""}`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold ${d.config?.state === "on" ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                        {d.type[0]}
                      </div>
                      <Switch checked={d.config?.state === "on"} />
                    </div>
                    <div className="text-sm font-medium truncate">{d.name}</div>
                    <div className="text-xs text-muted-foreground">{d.zone?.name || "—"}</div>
                    <div className={`text-xs mt-1.5 flex items-center gap-1 ${d.isOnline ? "text-emerald-500" : "text-red-400"}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${d.isOnline ? "bg-emerald-500" : "bg-red-400"}`} />
                      {d.isOnline ? (d.config?.state === "on" ? "Actif" : "Éteint") : "Hors ligne"}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Répartition par zone</CardTitle></CardHeader>
            <CardContent className="h-48">
              {data.zoneDistribution.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={data.zoneDistribution} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" nameKey="name">
                      {data.zoneDistribution.map((entry, i: number) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip />
                    <Legend layout="vertical" align="right" />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  Aucune donnée
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Alertes actives</CardTitle>
              {activeAlerts > 0 && (
                <Badge variant="destructive" className="text-xs">{activeAlerts}</Badge>
              )}
            </CardHeader>
            <CardContent>
              {data.alerts.filter((a: Alert) => !a.isRead).length > 0 ? (
                data.alerts.filter((a: Alert) => !a.isRead).slice(0, 3).map((a: Alert) => (
                  <div key={a.id} className="flex items-start gap-2 py-2.5 border-b border-border/50 last:border-0">
                    <Badge className={a.severity === "CRITICAL" ? "bg-red-500" : a.severity === "WARNING" ? "bg-orange-500" : "bg-emerald-500"}>
                      {a.severity === "CRITICAL" ? "CRIT" : a.severity === "WARNING" ? "WARN" : "INFO"}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{a.message}</p>
                      <p className="text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleString()}</p>
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-foreground">
                      ACK
                    </Button>
                  </div>
                ))
              ) : (
                <div className="text-center py-6">
                  <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center mx-auto mb-2">
                    <RefreshCw className="w-5 h-5 text-emerald-500" />
                  </div>
                  <p className="text-sm text-muted-foreground">Aucune alerte active</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Automatisations</CardTitle></CardHeader>
            <CardContent>
              {data.automations.length > 0 ? (
                data.automations.slice(0, 3).map((a) => {
                  const automation = a as Record<string, unknown>;
                  const trigger = automation.trigger as Record<string, unknown> | undefined;
                  const action = automation.action as Record<string, unknown> | undefined;
                  return (
                    <div key={automation.id as string} className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0">
                      <div className="min-w-0 flex-1 mr-2">
                        <p className="text-sm font-medium truncate">{automation.name as string}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          SI {trigger?.metric as string} {trigger?.operator as string} {trigger?.value as string} → {action?.type as string}
                        </p>
                      </div>
                      <Switch checked={automation.isActive as boolean} />
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-6">
                  <p className="text-sm text-muted-foreground">Aucune automatisation configurée</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
