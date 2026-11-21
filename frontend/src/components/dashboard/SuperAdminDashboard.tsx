"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import logger from "@/lib/logger";
import type { Alert } from "@/types";
import {
  Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";

const COLORS = ["#00C9A7", "#3B82F6", "#FFA726", "#A855F7", "#FF4757", "#22C55E"];

interface AdminSummary {
  kpis: {
    totalTenants: number;
    totalBuildings: number;
    totalDevices: number;
    onlineDevices: number;
    activeAlerts: number;
    totalAutomations: number;
  };
  consumption: { daily: number; weekly: number; monthly: number; yearly: number };
  currentPower: number | null;
  topBuildings: { buildingId: string; buildingName: string; tenantName: string; totalKwh: number }[];
  recentAlerts: Pick<Alert, "id" | "severity" | "message" | "createdAt">[];
}

const SuperAdminDashboard = () => {
  const [data, setData] = useState<AdminSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api.get<AdminSummary>("/api/v1/admin/summary", { signal: controller.signal })
      .then(({ data }) => {
        if (!controller.signal.aborted) setData(data);
      })
      .catch(error => {
        if (controller.signal.aborted) return;
        logger.error("Erreur de chargement de la synthèse globale", error);
        setFailed(true);
      });
    return () => controller.abort();
  }, [attempt]);

  if (failed) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-bold">Vue globale</h1>
        <p role="alert" className="text-sm text-destructive">Impossible de charger la synthèse globale.</p>
        <Button variant="outline" onClick={() => {
          setFailed(false);
          setAttempt(previous => previous + 1);
        }}>Réessayer</Button>
      </div>
    );
  }

  if (!data) return <p role="status" className="py-12 text-center text-muted-foreground">Chargement de la synthèse globale…</p>;

  const { kpis, consumption, currentPower, topBuildings, recentAlerts } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Vue globale des espaces clients</h1>
          <p className="text-muted-foreground">Consolidation de toutes les données de la plateforme</p>
        </div>
        <Badge variant="outline" className="text-emerald-400 border-emerald-400/30">Super Admin</Badge>
      </div>

      {/* KPIs Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="border-t-2 border-t-emerald-500">
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Tenants</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold">{kpis?.totalTenants || 0}</div></CardContent>
        </Card>
        <Card className="border-t-2 border-t-emerald-500">
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Bâtiments</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold">{kpis?.totalBuildings || 0}</div></CardContent>
        </Card>
        <Card className="border-t-2 border-t-blue-500">
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Appareils en ligne</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold">{kpis?.onlineDevices || 0}<span className="text-sm text-muted-foreground"> / {kpis?.totalDevices || 0}</span></div></CardContent>
        </Card>
        <Card className="border-t-2 border-t-red-500">
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Alertes actives</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold text-red-500">{kpis?.activeAlerts || 0}</div></CardContent>
        </Card>
        <Card className="border-t-2 border-t-purple-500">
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Automatisations</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold">{kpis?.totalAutomations || 0}</div></CardContent>
        </Card>
        <Card className="border-t-2 border-t-orange-500">
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Puissance actuelle</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold">{currentPower?.toFixed(1) ?? "—"}{currentPower != null && <span className="text-sm text-muted-foreground"> W</span>}</div></CardContent>
        </Card>
      </div>

      {/* Consommation par période */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-t-2 border-t-emerald-500">
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Consommation du jour</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold">{consumption?.daily?.toFixed(1) || "0"}<span className="text-sm text-muted-foreground"> kWh</span></div></CardContent>
        </Card>
        <Card className="border-t-2 border-t-emerald-500">
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Cette semaine</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold">{consumption?.weekly?.toFixed(1) || "0"}<span className="text-sm text-muted-foreground"> kWh</span></div></CardContent>
        </Card>
        <Card className="border-t-2 border-t-emerald-500">
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Ce mois</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold">{consumption?.monthly?.toFixed(1) || "0"}<span className="text-sm text-muted-foreground"> kWh</span></div></CardContent>
        </Card>
        <Card className="border-t-2 border-t-emerald-500">
          <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Cette année</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold">{consumption?.yearly?.toFixed(1) || "0"}<span className="text-sm text-muted-foreground"> kWh</span></div></CardContent>
        </Card>
      </div>

      {/* Top Buildings + Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Top 5 Bâtiments (conso. 7 jours)</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="py-2">Bâtiment</th>
                  <th className="py-2">Tenant</th>
                  <th className="py-2 text-right">kWh</th>
                </tr>
              </thead>
              <tbody>
                {topBuildings.map(b => (
                  <tr key={b.buildingId} className="border-b border-border/50">
                    <td className="py-2 font-medium">{b.buildingName}</td>
                    <td className="py-2 text-muted-foreground">{b.tenantName}</td>
                    <td className="py-2 text-right">{b.totalKwh.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Répartition par bâtiment</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={topBuildings} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="totalKwh" nameKey="buildingName">
                  {topBuildings.map((building, index) => <Cell key={building.buildingId} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend layout="vertical" align="right" />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Alertes récentes */}
      <Card>
        <CardHeader><CardTitle>Alertes récentes non lues</CardTitle></CardHeader>
        <CardContent>
          {recentAlerts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Aucune alerte active</p>
          ) : (
            recentAlerts.map(a => (
              <div key={a.id} className="flex items-start gap-2 py-2 border-b border-border last:border-0">
                <Badge className={a.severity === "CRITICAL" ? "bg-red-600" : a.severity === "WARNING" ? "bg-orange-500" : "bg-emerald-600"}>
                  {a.severity === "CRITICAL" ? "CRIT" : a.severity === "WARNING" ? "WARN" : "INFO"}
                </Badge>
                <div className="flex-1">
                  <p className="text-sm">{a.message}</p>
                  <p className="text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleString("fr-FR", { timeZone: "Africa/Kinshasa" })}</p>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SuperAdminDashboard;
