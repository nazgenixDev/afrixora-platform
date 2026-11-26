"use client";

import { useCallback, useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEnergyQuery, useEnergyRequest } from "@/hooks/useEnergyRequest";
import { dateLabel, loadTopology, siteTimeZone, type MeteredEnergy, type MeteredPower, type Topology } from "@/lib/energyV2";
import type { Alert, Building, PaginatedResponse } from "@/types";
import { AlertsAndMaintenance, DistributionView, EnergyPanel, EnergyRequestState,
  FinanceView, PointSelector, ReadingSummary, SourcesView, useHistoricalEstimate } from "./EnergyViews";
import { SimulationView } from "./SimulationView";

const tabs = [
  ["overview", "Vue d’ensemble"], ["sources", "Sources"], ["distribution", "Distribution"],
  ["simulation", "Simulations"], ["finance", "Finances"], ["alerts", "Alertes et maintenance"],
  ["legacy", "Analyses historiques"],
] as const;

type ReadingControls = { energyId: string; powerId: string; to: string };
function Measurements({ building, topology, period, hours, tab, controls, setControls }: {
  building: Building; topology: Topology; period: string; hours: number; tab: "overview" | "finance";
  controls: ReadingControls; setControls: (value: ReadingControls) => void;
}) {
  const { energyId, powerId, to } = controls;
  const from = new Date(Date.parse(to) - hours * 3_600_000).toISOString();
  const pointParams = (meteringPointId: string, buildingTotal?: boolean) =>
    new URLSearchParams({ buildingId: building.id, meteringPointId, from, to,
      ...(buildingTotal ? { buildingTotal: "true" } : {}),
    }).toString();
  const energyPoints = topology["metering-points"].filter(point =>
    point.scope === "BOARD" && point.flowDirection === "IMPORT" && point.measurementMode !== "INSTANTANEOUS");
  const powerPoints = topology["metering-points"].filter(point => point.measurementMode === "INSTANTANEOUS");
  const energy = useEnergyQuery<MeteredEnergy>(energyId && tab === "overview" ? "/api/v1/energy/metered" : null, pointParams(energyId, true));
  const power = useEnergyQuery<MeteredPower>(powerId && tab === "overview" ? "/api/v1/energy/metered" : null, pointParams(powerId));
  const alerts = useEnergyQuery<PaginatedResponse<Alert>>(tab === "overview" ? "/api/v1/alerts" : null,
    new URLSearchParams({ buildingId: building.id, limit: "1", isRead: "false" }).toString());
  const estimate = useHistoricalEstimate(building.id, period);
  const measuredEnergy = energy.result.status === "ready" ? energy.result.data : null;
  const latestPower = power.result.status === "ready" ? power.result.data.latestPower : null;
  const powerDetail = latestPower && power.result.status === "ready"
    ? `${latestPower.quality === "MEASURED" ? "Mesurée" : "Estimée"} · ${dateLabel(latestPower.time, power.result.data.timeZone)}`
    : undefined;

  return <>
    <div className="grid items-end gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
      <PointSelector label="Point d’import sur tableau général" points={energyPoints} selected={energyId} onChange={id => setControls({ ...controls, energyId: id, to: new Date().toISOString() })} />
      {tab === "overview" && <PointSelector label="Point de puissance instantanée" points={powerPoints} selected={powerId} onChange={id => setControls({ ...controls, powerId: id, to: new Date().toISOString() })} />}
      <Button className="justify-self-start gap-2" variant="outline" onClick={() => {
        setControls({ ...controls, to: new Date().toISOString() });
        alerts.reload();
      }}><RefreshCw size={16} aria-hidden="true" />Actualiser les données</Button>
    </div>
    <EnergyRequestState status={energy.result.status} reload={energy.reload} />
    <EnergyRequestState status={power.result.status} reload={power.reload} />
    {tab === "overview" ? <>
      <EnergyRequestState status={estimate.result.status} reload={estimate.reload} />
      <ReadingSummary energy={measuredEnergy} powerW={latestPower?.valueW ?? null} powerDetail={powerDetail}
        historicalCost={estimate.result.status === "ready" ? estimate.result.data : null} />
      <div className="grid gap-4 md:grid-cols-2">
        <EnergyPanel title="Qualité et couverture">
          {measuredEnergy ? <p className="text-sm">
            {measuredEnergy.samples} valeur{measuredEnergy.samples !== 1 && "s"} exploitable{measuredEnergy.samples !== 1 && "s"} · {measuredEnergy.gaps} lacune{measuredEnergy.gaps !== 1 && "s"} · {measuredEnergy.timeZone}
          </p> : <p className="text-sm text-muted-foreground">{energyPoints.length
            ? "Sélectionnez le point qui couvre la consommation du bâtiment." : "Aucun point d’import sur tableau n’est configuré."}</p>}
          {measuredEnergy?.samples === 0 && <p className="text-sm text-muted-foreground">Aucune énergie exploitable sur la période.</p>}
          {!powerPoints.length && <p className="text-sm text-muted-foreground">Aucun point de puissance instantanée configuré.</p>}
        </EnergyPanel>
        <EnergyPanel title="Alertes non lues">
          <EnergyRequestState status={alerts.result.status} reload={alerts.reload} />
          {alerts.result.status === "ready" && <p className="text-sm">{alerts.result.data.total
            ? `${alerts.result.data.total} alerte(s) non lue(s) pour ce bâtiment.` : "Aucune alerte non lue."}</p>}
        </EnergyPanel>
      </div>
    </> : <FinanceView topology={topology} buildingId={building.id} meteringPointId={energyId} from={from} to={to}
      timeZone={siteTimeZone(building)} estimate={estimate} />}
  </>;
}

export function EnergyManagement({ building, period, hours, canSimulate, initialTab, legacy }: {
  building: Building; period: string; hours: number; canSimulate: boolean; initialTab?: string | null; legacy: ReactNode;
}) {
  const [tab, setTab] = useState(tabs.some(([value]) => value === initialTab && (value !== "simulation" || canSimulate))
    ? initialTab! : "overview");
  const [controls, setControls] = useState(() => ({ energyId: "", powerId: "", to: new Date().toISOString() }));
  const fetchTopology = useCallback((signal: AbortSignal) => loadTopology(building.id, signal), [building.id]);
  const topology = useEnergyRequest(tab !== "legacy" ? fetchTopology : null);
  const data = topology.result.status === "ready" ? topology.result.data : null;
  return <Tabs value={tab} onValueChange={setTab} className="min-w-0">
    <TabsList aria-label="Vues Énergie" className="h-auto w-full flex-wrap justify-start gap-1">
      {tabs.filter(([value]) => value !== "simulation" || canSimulate).map(([value, label]) =>
        <TabsTrigger value={value} key={value} className="px-2.5">{label}</TabsTrigger>)}
    </TabsList>
    {tab !== "legacy" && <EnergyRequestState status={topology.result.status} reload={topology.reload} />}
    {data && <>
      <TabsContent value="overview" className="mt-4 space-y-4">
        <Measurements building={building} topology={data} period={period} hours={hours} tab="overview" controls={controls} setControls={setControls} />
      </TabsContent>
      <TabsContent value="sources" className="mt-4 space-y-4">
        <SourcesView topology={data} timeZone={siteTimeZone(building)} />
      </TabsContent>
      <TabsContent value="distribution" className="mt-4"><DistributionView topology={data} /></TabsContent>
      {canSimulate && <TabsContent value="simulation" className="mt-4">
        <SimulationView buildingId={building.id} topology={data} timeZone={siteTimeZone(building)} />
      </TabsContent>}
      <TabsContent value="finance" className="mt-4 space-y-4">
        <Measurements building={building} topology={data} period={period} hours={hours} tab="finance" controls={controls} setControls={setControls} />
      </TabsContent>
      <TabsContent value="alerts" className="mt-4">
        <AlertsAndMaintenance topology={data} buildingId={building.id} timeZone={siteTimeZone(building)} />
      </TabsContent>
    </>}
    <TabsContent value="legacy" className="mt-4 space-y-5">{legacy}</TabsContent>
  </Tabs>;
}
