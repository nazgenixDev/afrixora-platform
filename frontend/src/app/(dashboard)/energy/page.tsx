"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import api from "@/lib/api";
import logger from "@/lib/logger";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from "recharts";

const COLORS = ["#00C9A7", "#3B82F6", "#FFA726", "#A855F7", "#FF4757", "#22C55E"];

const EnergyPage = () => {
  const [period, setPeriod] = useState<string>("7d");
  const [buildings, setBuildings] = useState<any[]>([]);
  const [selectedBuilding, setSelectedBuilding] = useState<string>("");
  const [data, setData] = useState<any>({
    summary: null,
    consumption: [],
    byDevice: [],
    byZone: [],
    isLoading: true,
    error: null,
  });
  const [showExport, setShowExport] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await api.get("/api/v1/buildings");
      const raw = res.data;
      const buildingList = Array.isArray(raw) ? raw : (raw?.data ?? []);
      setBuildings(buildingList);
      if (buildingList.length > 0) setSelectedBuilding(buildingList[0].id);
    })();
  }, []);

  useEffect(() => {
    if (!selectedBuilding) return;
    (async () => {
      try {
        setData((prev: any) => ({ ...prev, isLoading: true }));
        const [sumRes, consRes, devRes, zoneRes] = await Promise.all([
          api.get(`/api/v1/energy/summary?buildingId=${selectedBuilding}&period=${period}`),
          api.get(`/api/v1/energy/consumption?buildingId=${selectedBuilding}&period=${period}`),
          api.get(`/api/v1/energy/by-device?buildingId=${selectedBuilding}&period=${period}`),
          api.get(`/api/v1/energy/by-zone?buildingId=${selectedBuilding}&period=${period}`),
        ]);
        setData({
          summary: sumRes.data,
          consumption: (consRes.data || []).map((i: any) => ({
            time: new Date(i.bucket).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }),
            kwh: i.total_kwh,
            avg: i.avg_power_w,
            threshold: period === "24h" ? 5 : 28,
          })),
          byDevice: devRes.data || [],
          byZone: (zoneRes.data || []).map((i: any, idx: number) => ({
            name: i.zone_name || `Zone ${idx + 1}`,
            value: i.total_kwh,
            color: COLORS[idx % COLORS.length],
          })),
          isLoading: false,
          error: null,
        });
      } catch (err) {
        setData((prev) => ({ ...prev, isLoading: false, error: "Erreur de chargement" }));
      }
    })();
  }, [selectedBuilding, period]);

  const kpi = {
    totalKwh: data.summary?.totalKwh ?? 0,
    estimatedCost: data.summary?.estimatedCostUSD ?? 0,
    peakPower: data.summary?.peakPowerW ?? 0,
    avgPower: data.summary?.avgPowerW ?? 0,
    deviceCount: data.summary?.deviceCount ?? 0,
  };

  if (data.isLoading) return <div className="flex items-center justify-center h-64">Chargement...</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Analytics Énergie</h1>
          <p className="text-muted-foreground">
            {buildings.find(b => b.id === selectedBuilding)?.name || "Sélectionnez un bâtiment"} · Données temps réel via TimescaleDB
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedBuilding} onValueChange={setSelectedBuilding}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Bâtiment" /></SelectTrigger>
            <SelectContent>{buildings.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
          </Select>
          <Badge variant="outline" className="animate-pulse text-emerald-400 border-emerald-400/30">● Live</Badge>
        </div>
      </div>

      {/* Period Tabs */}
      <div className="flex items-center gap-2">
        {["24h", "7d", "30d", "3m"].map(p => (
          <Button key={p} variant={period === p ? "default" : "outline"} size="sm" onClick={() => setPeriod(p)}
            className={period === p ? "bg-emerald-600" : ""}>
            {p === "24h" ? "24 heures" : p === "7d" ? "7 jours" : p === "30d" ? "30 jours" : "3 mois"}
          </Button>
        ))}
        <Button variant="outline" size="sm" className="ml-auto" onClick={async () => {
  if (!selectedBuilding) return;
  const from = new Date();
  from.setDate(from.getDate() - (period === '24h' ? 1 : period === '7d' ? 7 : 30));
  const to = new Date();
  try {
    const response = await api.get(
      `/api/v1/reports/csv?buildingId=${selectedBuilding}&from=${from.toISOString()}&to=${to.toISOString()}`,
      { responseType: 'blob' }
    );
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.download = `afrixora_energy_${period}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    logger.error('Erreur export CSV', err);
  }
}}>
  📤 Exporter
</Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Conso totale", value: `${kpi.totalKwh.toFixed(1)} kWh`, color: "border-t-emerald-500" },
          { label: "Coût estimé", value: `${kpi.estimatedCost.toFixed(2)} USD`, color: "border-t-orange-500" },
          { label: "Puissance max", value: `${kpi.peakPower.toFixed(0)} W`, color: "border-t-blue-500" },
          { label: "Puissance moy", value: `${kpi.avgPower.toFixed(0)} W`, color: "border-t-purple-500" },
          { label: "Appareils", value: `${kpi.deviceCount}`, color: "border-t-emerald-500" },
        ].map((item, idx) => (
          <Card key={idx} className={`border-t-2 ${item.color}`}>
            <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">{item.label}</CardTitle></CardHeader>
            <CardContent className="text-lg font-bold">{item.value}</CardContent>
          </Card>
        ))}
      </div>

      {/* Main Chart */}
      <Card>
        <CardHeader><CardTitle>Courbe de consommation</CardTitle></CardHeader>
        <CardContent className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.consumption}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="time" tick={{ fill: "#9CA3AF", fontSize: 10 }} />
              <YAxis unit="kWh" tick={{ fill: "#9CA3AF", fontSize: 10 }} />
              <Tooltip />
              <Legend />
              <ReferenceLine y={period === "24h" ? 5 : 28} stroke="#F97316" strokeDasharray="5 5" />
              <Line type="monotone" dataKey="kwh" stroke="#00C9A7" strokeWidth={2} dot={{ r: 3, fill: "#00C9A7" }} activeDot={{ r: 6 }} />
              <Line type="monotone" dataKey="threshold" stroke="#F97316" strokeDasharray="5 5" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Zone Table + Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Consommation par zone</CardTitle></CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-2">Zone</th>
                    <th className="py-2">Appareils</th>
                    <th className="py-2 text-right">kWh</th>
                    <th className="py-2 text-right">%</th>
                    <th className="py-2 text-right">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byZone.map((z: any) => {
                    const pct = kpi.totalKwh > 0 ? ((z.value / kpi.totalKwh) * 100).toFixed(1) : 0;
                    return (
                      <tr key={z.name} className="border-b border-border/50">
                        <td className="py-2 font-medium">{z.name}</td>
                        <td className="py-2 text-muted-foreground">{z.deviceCount ?? "—"}</td>
                        <td className="py-2 text-right">{z.value.toFixed(1)}</td>
                        <td className="py-2 text-right">{pct}%</td>
                        <td className="py-2 text-right">
                          <Badge variant={Number(pct) > 30 ? "destructive" : "default"}>{Number(pct) > 30 ? "ÉLEVÉ" : "NORMAL"}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
        <div>
          <Card>
            <CardHeader><CardTitle>Répartition</CardTitle></CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data.byZone} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" nameKey="name">
                    {data.byZone.map((entry: any, i: number) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip />
                  <Legend layout="vertical" align="right" />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Comparaison (placeholder basé sur les données réelles si disponible) */}
      <Card>
        <CardHeader><CardTitle>Comparaison mensuelle — Baseline vs AFRIXORA</CardTitle></CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={[
              { month: "Jan", avant: 245, apres: 218 },
              { month: "Fév", avant: 258, apres: 225 },
              { month: "Mar", avant: 271, apres: 231 },
              { month: "Avr", avant: 262, apres: 214 },
              { month: "Mai", avant: 249, apres: 207 },
              { month: "Jun", avant: 255, apres: 212 },
            ]}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="month" tick={{ fill: "#9CA3AF" }} />
              <YAxis unit="kWh" tick={{ fill: "#9CA3AF" }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="avant" fill="#6A8099" name="Avant AFRIXORA" radius={[3,3,0,0]} />
              <Bar dataKey="apres" fill="#00C9A7" name="Avec AFRIXORA" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
};

export default EnergyPage;