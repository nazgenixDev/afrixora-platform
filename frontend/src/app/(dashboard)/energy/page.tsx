"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Building, ConsumptionBucket, EnergySummary, ZoneBucket } from "@/types";
import api from "@/lib/api";
import logger from "@/lib/logger";
import {
  LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";

const COLORS = ["#00C9A7", "#3B82F6", "#FFA726", "#A855F7", "#FF4757", "#22C55E"];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-xl p-3 backdrop-blur-sm">
        <p className="text-sm font-medium text-foreground mb-1">{label}</p>
        {payload.map((entry: any, idx: number) => (
          <p key={idx} className="text-sm" style={{ color: entry.color }}>
            {entry.name}: <span className="font-semibold">{Number(entry.value).toFixed(1)} kWh</span>
          </p>
        ))}
      </div>
    );
  }
  return null;
};

interface EnergyData {
  summary: EnergySummary | null;
  consumption: { time: string; kwh: number }[];
  byZone: { id: string | null; name: string; value: number; color: string }[];
  isLoading: boolean;
  error: string | null;
}

const EnergyPage = () => {
  const [period, setPeriod] = useState<string>("7d");
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [selectedBuilding, setSelectedBuilding] = useState<string>("");
  const [data, setData] = useState<EnergyData>({
    summary: null,
    consumption: [],
    byZone: [],
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    (async () => {
      try {
        const { data: raw } = await api.get("/api/v1/buildings");
        const buildingList: Building[] = Array.isArray(raw) ? raw : (raw?.data ?? []);
        setBuildings(buildingList);
        if (buildingList.length > 0) setSelectedBuilding(buildingList[0].id);
        else setData(prev => ({ ...prev, isLoading: false }));
      } catch (err) {
        logger.error("Erreur de chargement des bâtiments", err);
        setData(prev => ({ ...prev, isLoading: false, error: "Erreur de chargement des bâtiments" }));
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedBuilding) return;
    let cancelled = false;
    (async () => {
      try {
        setData(prev => ({ ...prev, isLoading: true, error: null }));
        const [sumRes, consRes, zoneRes] = await Promise.all([
          api.get(`/api/v1/energy/summary?buildingId=${selectedBuilding}&period=${period}`),
          api.get(`/api/v1/energy/consumption?buildingId=${selectedBuilding}&period=${period}`),
          api.get(`/api/v1/energy/by-zone?buildingId=${selectedBuilding}&period=${period}`),
        ]);
        if (cancelled) return;

        const dateFormat = new Intl.DateTimeFormat("fr-FR", {
          day: "numeric",
          month: "short",
          timeZone: "Africa/Kinshasa",
          ...(period === "24h" ? { hour: "2-digit", minute: "2-digit" } : {}),
        });
        setData({
          summary: sumRes.data,
          consumption: (consRes.data ?? []).map((i: ConsumptionBucket) => ({
            time: dateFormat.format(new Date(i.bucket)),
            kwh: i.total_kwh,
          })),
          byZone: (zoneRes.data ?? []).map((i: ZoneBucket, idx: number) => ({
            id: i.zoneId,
            name: i.name || "Sans zone",
            value: i.total_kwh,
            color: COLORS[idx % COLORS.length],
          })),
          isLoading: false,
          error: null,
        });
      } catch (err) {
        logger.error("Erreur de chargement des mesures d’énergie", err);
        if (!cancelled) setData({ summary: null, consumption: [], byZone: [], isLoading: false, error: "Erreur de chargement des mesures" });
      }
    })();
    return () => { cancelled = true; };
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
            {buildings.find(b => b.id === selectedBuilding)?.name || "Sélectionnez un bâtiment"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedBuilding} onValueChange={setSelectedBuilding}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Bâtiment" /></SelectTrigger>
            <SelectContent>{buildings.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
          </Select>
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
  const to = new Date();
  const days = period === '24h' ? 1 : period === '7d' ? 7 : period === '3m' ? 90 : 30;
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
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

      {data.error && <p role="alert">{data.error}</p>}
      {data.summary && (
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
      )}

      {data.consumption.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Courbe de consommation</CardTitle></CardHeader>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.consumption}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="time" tick={{ fill: "#9CA3AF", fontSize: 10 }} />
                <YAxis unit="kWh" tick={{ fill: "#9CA3AF", fontSize: 10 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Line type="monotone" dataKey="kwh" name="Consommation" stroke="#00C9A7" strokeWidth={2} dot={{ r: 3, fill: "#00C9A7" }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {data.summary && data.consumption.length === 0 && (
        <p className="text-muted-foreground">Aucune mesure de consommation sur cette période.</p>
      )}

      {data.byZone.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader><CardTitle>Consommation par zone</CardTitle></CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b">
                      <th className="py-2">Zone</th>
                      <th className="py-2 text-right">kWh</th>
                      <th className="py-2 text-right">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byZone.map((z) => {
                      const pct = kpi.totalKwh > 0 ? ((z.value / kpi.totalKwh) * 100).toFixed(1) : 0;
                      return (
                        <tr key={z.id ?? "sans-zone"} className="border-b border-border/50">
                          <td className="py-2 font-medium">{z.name}</td>
                          <td className="py-2 text-right">{z.value.toFixed(1)}</td>
                          <td className="py-2 text-right">{pct}%</td>
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
                      {data.byZone.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip />
                    <Legend layout="vertical" align="right" />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
};

export default EnergyPage;
