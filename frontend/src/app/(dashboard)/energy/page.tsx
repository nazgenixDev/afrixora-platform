"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { isAxiosError } from "axios";
import { Download } from "lucide-react";
import {
  CartesianGrid, Cell, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useDashboardBuildings } from "@/components/dashboard/useDashboardBuildings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import api from "@/lib/api";
import logger from "@/lib/logger";
import useStore, { type User } from "@/store";
import type { ConsumptionBucket, EnergySummary, ZoneBucket } from "@/types";

const PERIODS = [
  { value: "24h", label: "24 heures", hours: 24 },
  { value: "7d", label: "7 jours", hours: 168 },
  { value: "30d", label: "30 jours", hours: 720 },
  { value: "3m", label: "3 mois", hours: 2160 },
] as const;

type Period = typeof PERIODS[number];
type ExportAccess = "checking" | "allowed" | "denied" | "unavailable";

const COLORS = ["#00C9A7", "#3B82F6", "#FFA726", "#A855F7", "#FF4757", "#22C55E"];
const wholeNumber = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const decimalNumber = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const money = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "USD", currencyDisplay: "code" });
const tooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  borderColor: "hsl(var(--border))",
  borderRadius: "0.75rem",
  color: "hsl(var(--foreground))",
};

interface EnergyData {
  summary: EnergySummary;
  consumption: { time: string; kwh: number }[];
  zones: { id: string | null; name: string; value: number; color: string }[];
}

function EnergyExport({ access, buildingId, period }: { access: ExportAccess; buildingId: string; period: Period }) {
  const activeExport = useRef<AbortController | null>(null);
  const [status, setStatus] = useState<"idle" | "pending" | "done" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => () => activeExport.current?.abort(), []);

  async function exportCSV() {
    if (access !== "allowed" || activeExport.current) return;
    const controller = new AbortController();
    activeExport.current = controller;
    setStatus("pending");
    setErrorMessage("");
    const to = new Date();
    const from = new Date(to.getTime() - period.hours * 60 * 60 * 1000);

    try {
      const { data } = await api.get<Blob>("/api/v1/reports/csv", {
        params: { buildingId, from: from.toISOString(), to: to.toISOString() },
        responseType: "blob",
        signal: controller.signal,
      });

      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `afrixora_energy_${period.value}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus("done");
    } catch (error) {
      if (controller.signal.aborted) return;
      logger.error("Erreur d’export Énergie", error);
      const code = isAxiosError(error) ? error.response?.status : undefined;
      if (code === 403) {
        setErrorMessage("Votre abonnement ne permet pas cet export.");
      } else if (code === 413) {
        setErrorMessage("L’export dépasse la taille autorisée. Sélectionnez une période plus courte.");
      } else {
        setErrorMessage("Impossible de télécharger le fichier CSV. Réessayez.");
      }
      setStatus("error");
    } finally {
      activeExport.current = null;
    }
  }

  if (access === "checking") {
    return <p role="status" className="text-sm text-muted-foreground">Vérification du droit d’export…</p>;
  }
  if (access === "denied") {
    return <p className="text-sm text-muted-foreground">L’export CSV est indisponible avec votre abonnement.</p>;
  }
  if (access === "unavailable") {
    return <p role="alert" className="text-sm text-destructive">Impossible de vérifier le droit d’export CSV.</p>;
  }

  return (
    <div className="space-y-2">
      <Button variant="outline" className="w-full gap-2 sm:w-auto" onClick={exportCSV} disabled={status === "pending"}>
        <Download aria-hidden="true" className="h-4 w-4" />
        {status === "pending" ? "Exportation en cours…" : "Exporter en CSV"}
      </Button>
      {status === "error" && <p role="alert" className="text-sm text-destructive">{errorMessage}</p>}
      {status === "done" && <p role="status" className="text-sm text-muted-foreground">Téléchargement du fichier CSV lancé.</p>}
    </div>
  );
}

function EnergyMeasurements({ buildingId, period }: { buildingId: string; period: Period }) {
  const [data, setData] = useState<EnergyData | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;
    const options = { params: { buildingId, period: period.value }, signal };

    async function loadMeasurements() {
      try {
        const [summary, consumption, zones] = await Promise.all([
          api.get<EnergySummary>("/api/v1/energy/summary", options),
          api.get<ConsumptionBucket[]>("/api/v1/energy/consumption", options),
          api.get<ZoneBucket[]>("/api/v1/energy/by-zone", options),
        ]);
        if (signal.aborted) return;

        const dateFormat = new Intl.DateTimeFormat("fr-FR", {
          day: "numeric", month: "short", timeZone: "Africa/Kinshasa",
          ...(period.value === "24h" ? { hour: "2-digit", minute: "2-digit" } : {}),
        });

        setData({
          summary: summary.data,
          consumption: consumption.data.map(bucket => ({
            time: dateFormat.format(new Date(bucket.bucket)),
            kwh: bucket.total_kwh,
          })),
          zones: zones.data.map((zone, index) => ({
            id: zone.zoneId,
            name: zone.name || "Sans zone",
            value: zone.total_kwh,
            color: COLORS[index % COLORS.length],
          })),
        });
      } catch (error) {
        if (signal.aborted) return;
        controller.abort();
        logger.error("Erreur de chargement des mesures d’énergie", error);
        setFailed(true);
      }
    }

    void loadMeasurements();
    return () => controller.abort();
  }, [buildingId, period.value, attempt]);

  if (failed) {
    return (
      <div className="space-y-3">
        <p role="alert" className="text-sm text-destructive">Impossible de charger les mesures de cette période.</p>
        <Button variant="outline" onClick={() => {
          setFailed(false);
          setAttempt(previous => previous + 1);
        }}>Réessayer</Button>
      </div>
    );
  }

  if (!data) return <p role="status" className="py-10 text-muted-foreground">Chargement des mesures d’énergie…</p>;

  const { summary, consumption, zones } = data;
  const indicators = [
    { label: "Consommation totale", value: `${decimalNumber.format(summary.totalKwh)} kWh`, color: "border-t-emerald-500" },
    { label: "Coût estimé", value: money.format(summary.estimatedCostUSD), color: "border-t-orange-500" },
    { label: "Puissance maximale", value: `${wholeNumber.format(summary.peakPowerW)} W`, color: "border-t-blue-500" },
    { label: "Puissance moyenne", value: `${wholeNumber.format(summary.avgPowerW)} W`, color: "border-t-purple-500" },
    { label: "Appareils mesurés", value: wholeNumber.format(summary.deviceCount), color: "border-t-emerald-500" },
  ];

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {indicators.map(item => (
          <Card key={item.label} className={`min-w-0 border-t-2 ${item.color}`}>
            <CardHeader className="p-3 pb-2 sm:px-6">
              <CardTitle className="text-xs leading-snug text-muted-foreground">{item.label}</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 text-base font-bold [overflow-wrap:anywhere] sm:px-6 sm:text-lg">
              {item.value}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="p-3 sm:px-6"><CardTitle>Courbe de consommation</CardTitle></CardHeader>
        {consumption.length === 0 ? (
          <CardContent className="px-3 sm:px-6">
            <p className="text-sm text-muted-foreground">Aucune mesure de consommation sur cette période.</p>
          </CardContent>
        ) : (
          <CardContent className="h-60 min-w-0 px-3 sm:h-80 sm:px-6">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <LineChart data={consumption} margin={{ top: 8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="time" minTickGap={22} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                <YAxis width={48} tickFormatter={wholeNumber.format} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={value => `${decimalNumber.format(Number(value))} kWh`}
                />
                <Line type="monotone" dataKey="kwh" name="Consommation" stroke="#00C9A7" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        )}
      </Card>

      {zones.length > 0 && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Card className="min-w-0">
            <CardHeader className="p-3 sm:px-6"><CardTitle>Consommation par zone</CardTitle></CardHeader>
            <CardContent className="px-3 sm:px-6">
              <table className="w-full table-fixed text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="w-1/2 py-2" scope="col">Zone</th>
                    <th className="w-[30%] py-2 text-right" scope="col">kWh</th>
                    <th className="w-1/5 py-2 text-right" scope="col">Part</th>
                  </tr>
                </thead>
                <tbody>
                  {zones.map(zone => (
                    <tr key={zone.id ?? "sans-zone"} className="border-b border-border/50">
                      <td className="py-2 pr-2 font-medium">
                        <div className="flex items-baseline gap-2">
                          <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ backgroundColor: zone.color }} />
                          <span className="min-w-0 [overflow-wrap:anywhere]">{zone.name}</span>
                        </div>
                      </td>
                      <td className="py-2 text-right tabular-nums [overflow-wrap:anywhere]">{decimalNumber.format(zone.value)}</td>
                      <td className="py-2 text-right tabular-nums">
                        {decimalNumber.format(summary.totalKwh > 0 ? (zone.value / summary.totalKwh) * 100 : 0)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {zones.some(zone => zone.value > 0) && (
            <Card className="min-w-0">
              <CardHeader className="p-3 sm:px-6"><CardTitle>Répartition par zone</CardTitle></CardHeader>
              <CardContent className="h-52 px-3 sm:h-64 sm:px-6">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <PieChart>
                    <Pie data={zones} innerRadius="45%" outerRadius="75%" dataKey="value" nameKey="name">
                      {zones.map(zone => <Cell key={zone.id ?? "sans-zone"} fill={zone.color} />)}
                    </Pie>
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={value => `${decimalNumber.format(Number(value))} kWh`}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </>
  );
}

function TenantEnergyPage({ role }: { role: User["role"] }) {
  const [period, setPeriod] = useState<Period>(PERIODS[1]);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const { state, retry } = useDashboardBuildings();
  const { limits, loading: checkingExportAccess } = useSubscriptionLimits();
  const canManage = role === "SUPER_ADMIN" || role === "TENANT_ADMIN" || role === "BUILDING_ADMIN";

  const building = state.status === "ready"
    ? state.buildings.find(item => item.id === (selectedBuildingId ?? state.savedBuildingId)) ?? state.buildings[0]
    : undefined;

  let access: ExportAccess = "checking";
  if (!checkingExportAccess) {
    if (limits?.hasExport === true) access = "allowed";
    else if (limits?.hasExport === false) access = "denied";
    else access = "unavailable";
  }

  return (
    <div className="min-w-0 space-y-6">
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">Énergie</h1>
          {building && <p className="text-muted-foreground [overflow-wrap:anywhere]">{building.name}</p>}
        </div>
        {building && state.status === "ready" && state.buildings.length > 1 && (
          <Select value={building.id} onValueChange={setSelectedBuildingId}>
            <SelectTrigger aria-label="Bâtiment" className="min-w-0 sm:w-56 sm:shrink-0 [&>span]:truncate">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-w-[var(--radix-select-content-available-width)]">
              {state.buildings.map(item => (
                <SelectItem key={item.id} value={item.id} className="[overflow-wrap:anywhere]">{item.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </header>

      {state.status === "loading" && <p role="status" className="py-10 text-muted-foreground">Chargement des bâtiments…</p>}
      {state.status === "error" && (
        <div className="space-y-3">
          <p role="alert" className="text-sm text-destructive">Impossible de charger la liste des bâtiments.</p>
          <Button variant="outline" onClick={retry}>Réessayer</Button>
        </div>
      )}
      {state.status === "ready" && !building && (
        <div className="space-y-3">
          <p className="text-muted-foreground">Aucun bâtiment actif dans cet espace.</p>
          {canManage && <Button asChild><Link href="/buildings">Gérer les bâtiments</Link></Button>}
        </div>
      )}

      {building && (
        <>
          <div className="flex flex-col items-stretch justify-between gap-3 md:flex-row md:items-start">
            <div role="group" aria-label="Période d’analyse" className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              {PERIODS.map(item => (
                <Button
                  key={item.value}
                  variant={period.value === item.value ? "default" : "outline"}
                  aria-pressed={period.value === item.value}
                  onClick={() => setPeriod(item)}
                >
                  {item.label}
                </Button>
              ))}
            </div>
            <EnergyExport key={`${building.id}:${period.value}`} buildingId={building.id} period={period} access={access} />
          </div>
          <EnergyMeasurements key={`${building.id}:${period.value}`} buildingId={building.id} period={period} />
        </>
      )}
    </div>
  );
}

export default function EnergyPage() {
  const user = useStore(state => state.user);
  const impersonatedTenantId = useStore(state => state.impersonatedTenantId);

  if (!user) return <p role="status" className="py-10 text-muted-foreground">Chargement du profil…</p>;

  return (
    <TenantEnergyPage
      key={`${user.id}:${user.role}:${impersonatedTenantId ?? user.tenantId}`}
      role={user.role}
    />
  );
}
