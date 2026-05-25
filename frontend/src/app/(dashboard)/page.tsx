"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import api from "@/lib/api";
import {
  LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from "recharts";

interface DashboardData {
  energySummary: any;
  consumptionData: { date: string; kwh: number; threshold: number }[];
  zoneDistribution: { name: string; value: number; color: string }[];
  devices: any[];
  alerts: any[];
  automations: any[];
  isLoading: boolean;
  noBuilding: boolean;
}

const COLORS = ["#00C9A7", "#3B82F6", "#FFA726", "#A855F7", "#FF4757", "#22C55E"];

const DashboardPage = () => {
  const [buildings, setBuildings] = useState<any[]>([]);
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
        const buildingList = res.data || [];
        setBuildings(buildingList);
        
        // Restaurer le bâtiment depuis localStorage, ou prendre le premier
        const savedBuildingId = localStorage.getItem("afrixora_selected_building");
        if (savedBuildingId && buildingList.some((b: any) => b.id === savedBuildingId)) {
          setSelectedBuilding(savedBuildingId);
        } else if (buildingList.length > 0) {
          setSelectedBuilding(buildingList[0].id);
        } else {
          setData(prev => ({ ...prev, noBuilding: true, isLoading: false }));
        }
      } catch (err) {
        console.error(err);
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
        const allDevices = devRes.data || [];
        const buildingDevices = allDevices.filter((d: any) => d.buildingId === selectedBuilding);
        const buildingAlerts = (alRes.data || []).filter((a: any) => a.buildingId === selectedBuilding);
        const buildingAutomations = (auRes.data || []).filter((a: any) => a.buildingId === selectedBuilding);

        const consumptionData = (consRes.data || []).map((i: any) => ({
          date: new Date(i.bucket).toLocaleDateString("fr-FR", { weekday: "short" }),
          kwh: i.total_kwh,
          threshold: 25,
        }));

        const zoneDistribution = (zoneRes.data || []).map((i: any, idx: number) => ({
          name: i.zone_name || `Zone ${idx + 1}`,
          value: i.total_kwh,
          color: COLORS[idx % COLORS.length],
        }));

        setData({
          energySummary: sumRes.data ?? sumRes,
          consumptionData,
          zoneDistribution,
          devices: buildingDevices,
          alerts: buildingAlerts,
          automations: buildingAutomations,
          isLoading: false,
          noBuilding: false,
        });
      } catch (err) {
        console.error(err);
        if (!cancelled) setData(prev => ({ ...prev, isLoading: false }));
      }
    })();
    return () => { cancelled = true; };
  }, [selectedBuilding]);

  // Affichage si aucun bâtiment n'existe
  if (data.noBuilding) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-3">
          <p className="text-muted-foreground">Aucun bâtiment enregistré.</p>
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => window.location.href = "/buildings"}>
            Ajouter un bâtiment
          </Button>
        </div>
      </div>
    );
  }

  if (data.isLoading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Chargement...</div>;
  }

  const onlineDevices = data.devices.filter((d: any) => d.isOnline).length;
  const totalDevices = data.devices.length;
  const activeAlerts = data.alerts.filter((a: any) => !a.isRead).length;
  const criticalAlerts = data.alerts.filter((a: any) => a.severity === "CRITICAL" && !a.isRead).length;
  const selectedBuildingName = buildings.find(b => b.id === selectedBuilding)?.name || "Bâtiment";

  return (
    <div className="space-y-6">
      {/* Header avec sélecteur de bâtiment */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{selectedBuildingName}</h1>
          <p className="text-muted-foreground">
            {buildings.find(b => b.id === selectedBuilding)?._count?.zones || 0} zones · {totalDevices} appareils
          </p>
        </div>
        <div className="flex items-center gap-2">
          {buildings.length > 1 && (
            <Select value={selectedBuilding} onValueChange={setSelectedBuilding}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Sélectionner un bâtiment" />
              </SelectTrigger>
              <SelectContent>
                {buildings.map((b: any) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Badge variant="outline" className="animate-pulse text-emerald-400 border-emerald-400/30">
            ● Gateway connectée
          </Badge>
        </div>
      </div>

      {/* Si aucun appareil */}
      {totalDevices === 0 && (
        <div className="p-6 border rounded-md bg-muted/10 text-center">
          <p className="text-muted-foreground">Aucun appareil enregistré pour ce bâtiment.</p>
          <Button className="mt-3 bg-emerald-600 hover:bg-emerald-700" onClick={() => window.location.href = "/devices"}>
            Ajouter des appareils
          </Button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-t-2 border-t-emerald-500">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Puissance actuelle</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.energySummary?.avgPowerW?.toFixed(1) || "0"}<span className="text-sm text-muted-foreground"> kW</span></div>
            <p className="text-xs text-emerald-500 mt-1">↑ +12% vs hier</p>
          </CardContent>
        </Card>
        <Card className="border-t-2 border-t-orange-500">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Conso. 7 jours</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.energySummary?.totalKwh?.toFixed(1) || "0"}<span className="text-sm text-muted-foreground"> kWh</span></div>
            <p className="text-xs text-red-500 mt-1">↓ -5% vs prec.</p>
          </CardContent>
        </Card>
        <Card className="border-t-2 border-t-emerald-500">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Appareils en ligne</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{onlineDevices}<span className="text-sm text-muted-foreground"> / {totalDevices}</span></div>
            <p className="text-xs text-muted-foreground mt-1">{totalDevices > 0 ? Math.round((onlineDevices / totalDevices) * 100) : 0}% connectés</p>
          </CardContent>
        </Card>
        <Card className="border-t-2 border-t-red-500">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Alertes actives</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">{activeAlerts}</div>
            <p className="text-xs text-muted-foreground mt-1">{criticalAlerts} critiques</p>
          </CardContent>
        </Card>
      </div>

      {/* Graphiques et détails */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle>Consommation — 7 derniers jours</CardTitle></CardHeader>
            <CardContent className="h-72">
              {data.consumptionData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.consumptionData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="date" tick={{ fill: "#9CA3AF" }} />
                    <YAxis unit="kWh" tick={{ fill: "#9CA3AF" }} />
                    <Tooltip />
                    <Legend />
                    <ReferenceLine y={25} stroke="#F97316" strokeDasharray="5 5" />
                    <Line type="monotone" dataKey="kwh" stroke="#00C9A7" strokeWidth={2} dot={{ r: 3, fill: "#00C9A7" }} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="threshold" stroke="#F97316" strokeDasharray="5 5" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  Aucune donnée de consommation pour ce bâtiment
                </div>
              )}
            </CardContent>
          </Card>

          {totalDevices > 0 && (
            <div>
              <h3 className="font-semibold mb-3">Appareils IoT</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {data.devices.slice(0, 6).map((d: any) => (
                  <Card key={d.id} className={`p-3 ${d.config?.state === "on" ? "border-emerald-500/30 bg-emerald-500/5" : ""}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="w-8 h-8 rounded bg-muted flex items-center justify-center text-xs font-bold">{d.type[0]}</div>
                      <Switch checked={d.config?.state === "on"} />
                    </div>
                    <div className="text-sm font-medium truncate">{d.name}</div>
                    <div className="text-xs text-muted-foreground">{d.zone?.name || "—"}</div>
                    <div className={`text-xs mt-1 ${d.isOnline ? "text-emerald-400" : "text-red-400"}`}>{d.isOnline ? (d.config?.state === "on" ? "Actif" : "Éteint") : "Hors ligne"}</div>
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
                      {data.zoneDistribution.map((entry: any, i: number) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip />
                    <Legend layout="vertical" align="right" />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  Aucune donnée de répartition
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Alertes actives</CardTitle></CardHeader>
            <CardContent>
              {data.alerts.filter((a: any) => !a.isRead).length > 0 ? (
                data.alerts.filter((a: any) => !a.isRead).slice(0, 3).map((a: any) => (
                  <div key={a.id} className="flex items-start gap-2 py-2 border-b border-border last:border-0">
                    <Badge className={a.severity === "CRITICAL" ? "bg-red-600" : a.severity === "WARNING" ? "bg-orange-500" : "bg-emerald-600"}>
                      {a.severity === "CRITICAL" ? "CRIT" : a.severity === "WARNING" ? "WARN" : "INFO"}
                    </Badge>
                    <div className="flex-1">
                      <p className="text-sm">{a.message}</p>
                      <p className="text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleString()}</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-xs">ACK</Button>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">Aucune alerte active</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Automatisations</CardTitle></CardHeader>
            <CardContent>
              {data.automations.length > 0 ? (
                data.automations.slice(0, 3).map((a: any) => (
                  <div key={a.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div>
                      <p className="text-sm font-medium">{a.name}</p>
                      <p className="text-xs text-muted-foreground">SI {a.trigger?.metric} {a.trigger?.operator} {a.trigger?.value} → {a.action?.type}</p>
                    </div>
                    <Switch checked={a.isActive} />
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">Aucune automatisation configurée</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;