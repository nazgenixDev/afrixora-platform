"use client";

import Link from "next/link";
import { useCallback, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { useEnergyQuery, useEnergyRequest } from "@/hooks/useEnergyRequest";
import api from "@/lib/api";
import { dateLabel, deviceHref, formatReading, money, priorities, sourceStatuses, sourceTypes,
  type Endpoint, type MeteredEnergy, type Point, type Topology } from "@/lib/energyV2";
import type { Alert, ConsumptionBucket, EnergySummary, PaginatedResponse } from "@/types";

export const selectClass = "w-full min-w-0 rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function EnergyPanel({ title, children }: { title: string; children: ReactNode }) {
  return <Card className="min-w-0">
    <CardHeader className="p-4 pb-3 sm:p-5 sm:pb-3">
      <CardTitle className="text-base">{title}</CardTitle>
    </CardHeader>
    <CardContent className="min-w-0 space-y-3 p-4 pt-0 sm:p-5 sm:pt-0">{children}</CardContent>
  </Card>;
}

export function EnergyRequestState({ status, reload }: { status: string; reload: () => void }) {
  if (status === "loading") return <p role="status" className="py-3 text-sm text-muted-foreground">Chargement…</p>;
  if (status === "denied") return <p role="alert" className="text-sm text-destructive">Vous n’avez pas accès à cette vue pour ce bâtiment.</p>;
  if (status === "error") return <div className="space-y-2">
    <p role="alert" className="text-sm text-destructive">Impossible de charger ces données.</p>
    <Button variant="outline" size="sm" onClick={reload}>Réessayer</Button>
  </div>;
  return null;
}

export function PointSelector({ label, points, selected, onChange }: {
  label: string; points: Point[]; selected: string; onChange: (id: string) => void;
}) {
  return <label className="block min-w-0 space-y-1 text-sm font-medium">
    <span>{label}</span>
    <select className={selectClass} value={selected} onChange={event => onChange(event.target.value)} disabled={!points.length}>
      <option value="">Sélectionner un point</option>
      {points.map(point => <option key={point.id} value={point.id}>{point.name}</option>)}
    </select>
  </label>;
}

export function ReadingSummary({ energy, powerW, powerDetail, historicalCost }: {
  energy: MeteredEnergy | null; powerW: number | null; powerDetail?: string; historicalCost: number | null;
}) {
  const indicators = [
    ["Énergie mesurée", formatReading(energy?.measuredKWh, "kWh"), "border-t-emerald-500"],
    ["Énergie estimée", formatReading(energy?.estimatedKWh, "kWh"), "border-t-amber-500"],
    ["Dernière puissance", formatReading(powerW === null ? null : powerW / 1000, "kW"), "border-t-blue-500"],
    ["Source actuelle confirmée", "Inconnue", "border-t-slate-400"],
    ["Coût historique estimé", historicalCost !== null ? money.format(historicalCost) : "Indisponible", "border-t-orange-500"],
  ];
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
    {indicators.map(([label, value, color]) => <Card key={label} className={`min-w-0 border-t-2 ${color}`}>
      <CardHeader className="p-3 pb-1 sm:p-4 sm:pb-1"><CardTitle className="text-xs leading-tight text-muted-foreground">{label}</CardTitle></CardHeader>
      <CardContent className="p-3 pt-1 sm:p-4 sm:pt-1">
        <p className="break-words text-lg font-semibold tabular-nums sm:text-xl">{value}</p>
        {label === "Dernière puissance" && powerDetail && <p className="mt-1 text-xs text-muted-foreground">{powerDetail}</p>}
      </CardContent>
    </Card>)}
  </div>;
}

export function EnergyList<T extends { id: string }>({ items, empty, render }: {
  items: T[]; empty: string; render: (item: T) => ReactNode;
}) {
  const [page, setPage] = useState(1);
  const size = 8;
  const totalPages = Math.ceil(items.length / size);
  const current = Math.min(page, Math.max(1, totalPages));
  if (!items.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return <>
    <ul className="divide-y">
      {items.slice((current - 1) * size, current * size).map(item =>
        <li key={item.id} className="min-w-0 py-2.5 text-sm [overflow-wrap:anywhere]">{render(item)}</li>)}
    </ul>
    <PaginationControls page={current} totalPages={totalPages} onPageChange={setPage} loading={false} />
  </>;
}

export function SourcesView({ topology, timeZone }: { topology: Topology; timeZone?: string | null }) {
  const observed = topology.feeds.filter(feed => feed.observedAt && ["OPEN", "CLOSED"].includes(feed.observedState))
    .sort((a, b) => Date.parse(b.observedAt!) - Date.parse(a.observedAt!));
  return <div className="grid gap-4 lg:grid-cols-2">
    <EnergyPanel title="Sources recensées">
      <EnergyList items={topology.sources} empty="Aucune source répertoriée pour ce bâtiment." render={source => <>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong>{source.name}</strong><Badge variant="outline">{sourceStatuses[source.status] ?? "Disponibilité inconnue"}</Badge>
        </div>
        <p className="mt-1 text-muted-foreground">{sourceTypes[source.type] ?? "Autre"} · Puissance nominale : {formatReading(source.ratedPowerW === null ? null : Number(source.ratedPowerW), "W")}</p>
      </>} />
    </EnergyPanel>
    <EnergyPanel title="Dernières positions observées">
      <EnergyList items={observed} empty="Aucune position d’arrivée horodatée." render={feed => <>
        <strong>{feed.name}</strong>
        <p className="text-muted-foreground">{feed.observedState === "OPEN" ? "Ouverte" : "Fermée"} · {dateLabel(feed.observedAt!, timeZone)}</p>
      </>} />
      <p className="text-xs text-muted-foreground">L’historique des basculements confirmés et la source actuellement active sont indisponibles.</p>
    </EnergyPanel>
  </div>;
}

export function PhysicalState({ endpoint }: { endpoint: Endpoint }) {
  const verified = endpoint.verifiedAt && Number.isFinite(Date.parse(endpoint.verifiedAt)) && ["AUXILIARY_CONTACT", "INDEPENDENT_METER"].includes(endpoint.verificationMethod) && ["ON", "OFF"].includes(endpoint.verifiedState);
  return verified
    ? <span className="text-emerald-600 dark:text-emerald-400">Dernier état physiquement vérifié : {endpoint.verifiedState === "ON" ? "allumé" : "éteint"} · {dateLabel(endpoint.verifiedAt!)} UTC</span>
    : <span className="text-muted-foreground">État physique inconnu</span>;
}

const circuitStatuses: Record<string, string> = { IN_SERVICE: "En service", OUT_OF_SERVICE: "Hors service", UNKNOWN: "État inconnu" };

export function DistributionView({ topology }: { topology: Topology }) {
  const circuitNames = new Map(topology.circuits.map(circuit => [circuit.id, circuit.name]));
  const boardNames = new Map(topology.boards.map(board => [board.id, board.name]));
  const loadNames = new Map(topology.loads.map(load => [load.id, load.name]));
  const busNames = new Map(topology.buses.map(bus => [bus.id, bus.name]));
  const sourceNames = new Map(topology.sources.map(source => [source.id, source.name]));
  const feedNames = new Map(topology.feeds.map(feed => [feed.id, feed.name]));
  return <div className="grid gap-4 lg:grid-cols-2">
    <EnergyPanel title="Tableaux">
      <EnergyList items={topology.boards} empty="Aucun tableau répertorié." render={board => <>
        <strong>{board.name}</strong>
        <p className="text-muted-foreground">{busNames.get(board.busId) ?? "Bus indisponible"}{board.location ? ` · ${board.location}` : ""}</p>
      </>} />
    </EnergyPanel>
    <EnergyPanel title="Circuits">
      <EnergyList items={topology.circuits} empty="Aucun circuit répertorié." render={circuit => <>
        <strong>{circuit.code} · {circuit.name}</strong>
        <p className="text-muted-foreground">{boardNames.get(circuit.boardId) ?? "Tableau indisponible"} · {priorities[circuit.priority] ?? "Priorité inconnue"} · {circuitStatuses[circuit.status] ?? "État inconnu"}</p>
      </>} />
    </EnergyPanel>
    <EnergyPanel title="Charges physiques">
      <EnergyList items={topology.loads} empty="Aucune charge physique répertoriée." render={load => <>
        <strong>{load.name}</strong>
        <p className="text-muted-foreground">{circuitNames.get(load.circuitId) ?? "Circuit indisponible"} · {priorities[load.priority] ?? "Priorité inconnue"} · {formatReading(load.ratedPowerW === null ? null : Number(load.ratedPowerW), "W nominaux")}</p>
      </>} />
    </EnergyPanel>
    <EnergyPanel title="Points de mesure et contrôleurs">
      <EnergyList items={[...topology["metering-points"], ...topology["control-endpoints"]]} empty="Aucun point de mesure ni contrôleur déclaré." render={item => <>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong>{item.name}</strong>
          <Link href={deviceHref(item.deviceId)} className="text-primary underline underline-offset-4">Voir l’appareil</Link>
        </div>
        {"scope" in item ? <>
          <p className="text-muted-foreground">Point de mesure · {item.unit} · {item.loadId ? loadNames.get(item.loadId) :
            item.circuitId ? circuitNames.get(item.circuitId) : item.boardId ? boardNames.get(item.boardId) :
              item.sourceId ? sourceNames.get(item.sourceId) : item.feedId ? feedNames.get(item.feedId) : "Cible indisponible"}</p>
        </> : <>
          <p className="text-muted-foreground">Contrôleur {item.isEnabled ? "activé" : "désactivé"} · {item.targetLoadId ? loadNames.get(item.targetLoadId) :
            item.targetCircuitId ? circuitNames.get(item.targetCircuitId) : "Cible indisponible"}</p>
          <PhysicalState endpoint={item} />
        </>}
      </>} />
    </EnergyPanel>
  </div>;
}

export function useHistoricalEstimate(buildingId: string, period: string) {
  const loadEstimate = useCallback(async (signal: AbortSignal) => {
    const options = { params: { buildingId, period }, signal };
    const [summary, consumption] = await Promise.all([
      api.get<EnergySummary>("/api/v1/energy/summary", options),
      api.get<ConsumptionBucket[]>("/api/v1/energy/consumption", options),
    ]);
    return consumption.data.length && Number.isFinite(summary.data.estimatedCostUSD) ? summary.data.estimatedCostUSD : null;
  }, [buildingId, period]);
  return useEnergyRequest(loadEstimate);
}

type Currency = "USD" | "CDF";
type CostAmounts = { currency: Currency; calculatedAmount: string | null; estimatedAmount: string | null; hasMissingData: boolean };
type EnergyCost = CostAmounts & {
  reasons: string[];
  bySource: { sourceId: string | null; sourceType: string; measuredKWh: string; estimatedKWh: string;
    unpricedKWh: string; calculatedAmount: string | null; estimatedAmount: string | null; reasons: string[] }[];
  references: { tariff: { id: string; sourceId: string; unit: string; unitPrice: string; currency: Currency;
    effectiveFrom: string; effectiveTo: string | null };
    exchangeRate: { id: string; rateSource: string; cdfPerUsd: string; effectiveFrom: string; effectiveTo: string | null } | null }[];
};
type GeneratorCost = {
  entry: { id: string; periodFrom: string; periodTo: string; fuelLitres: string | null; engineHours: string | null };
  quote: CostAmounts;
};
const costReasons: Record<string, string> = {
  MEASUREMENT_GAPS: "Couverture de mesure incomplète",
  NO_ENERGY_DATA: "Aucune énergie exploitable",
  SOURCE_UNKNOWN: "Source inconnue",
  INTERVAL_START_UNKNOWN: "Début de l’intervalle inconnu",
  TARIFF_NOT_COVERED: "Tarif absent ou changement de tarif pendant l’intervalle",
  EXCHANGE_RATE_NOT_COVERED: "Taux absent ou changement de taux pendant l’intervalle",
};

function costLine(cost: { calculatedAmount: string | null; estimatedAmount: string | null }, currency: Currency) {
  const display = (value: string | null) => value === null ? "indisponible" : `${value.replace(".", ",")} ${currency}`;
  return `Sur mesures : ${display(cost.calculatedAmount)} · Estimé : ${display(cost.estimatedAmount)}`;
}

function GeneratorCosts({ topology, buildingId, from, to, currency, timeZone }: {
  topology: Topology; buildingId: string; from: string; to: string; currency: Currency; timeZone: string;
}) {
  const [selection, setSelection] = useState({ sourceId: "", page: 1 });
  const generators = topology.sources.filter(source => source.type === "GENERATOR");
  const { sourceId, page } = selection;
  const { result, reload } = useEnergyQuery<PaginatedResponse<GeneratorCost>>(sourceId ? "/api/v1/energy/finance/generator-costs" : null,
    new URLSearchParams({ buildingId, sourceId, from, to, currency, page: String(page), limit: "8" }).toString());
  return <EnergyPanel title="Coûts d’exploitation du groupe">
    {generators.length ? <label className="block space-y-1 text-sm font-medium">
      <span>Groupe électrogène</span>
      <select className={selectClass} value={sourceId} onChange={event => setSelection({ sourceId: event.target.value, page: 1 })}>
        <option value="">Sélectionner un groupe</option>
        {generators.map(source => <option key={source.id} value={source.id}>{source.name}</option>)}
      </select>
    </label> : <p className="text-sm text-muted-foreground">Aucun groupe répertorié.</p>}
    <EnergyRequestState status={result.status} reload={reload} />
    {result.status === "ready" && <>
      <EnergyList items={result.data.data.map(cost => ({ ...cost, id: cost.entry.id }))}
        empty="Aucun relevé entièrement compris dans cette période." render={({ entry, quote }) => <>
          <p className="font-medium">{dateLabel(entry.periodFrom, timeZone)} – {dateLabel(entry.periodTo, timeZone)}</p>
          <p className="mt-1">{costLine(quote, currency)}</p>
          <p className="text-muted-foreground">{entry.fuelLitres === null ? "Carburant inconnu" : `${entry.fuelLitres.replace(".", ",")} L`}
            {" · "}{entry.engineHours === null ? "Heures moteur inconnues" : `${entry.engineHours.replace(".", ",")} h moteur`}</p>
          {quote.hasMissingData && <p className="text-muted-foreground">Relevé, prix ou taux incomplet.</p>}
        </>} />
      <PaginationControls page={page} totalPages={result.data.totalPages}
        onPageChange={next => setSelection({ sourceId, page: next })} loading={false} />
    </>}
    <p className="text-xs text-muted-foreground">Carburant et provision d’entretien. Ce montant est présenté séparément du tarif au kWh.</p>
  </EnergyPanel>;
}

export function FinanceView({ topology, buildingId, meteringPointId, from, to, timeZone, estimate }: {
  topology: Topology; buildingId: string; meteringPointId: string; from: string; to: string; timeZone: string;
  estimate: ReturnType<typeof useHistoricalEstimate>;
}) {
  const [currency, setCurrency] = useState<Currency>("USD");
  const { result, reload } = useEnergyQuery<EnergyCost>(meteringPointId ? "/api/v1/energy/finance/costs" : null,
    new URLSearchParams({ buildingId, meteringPointId, from, to, currency }).toString());
  const sourceNames = new Map(topology.sources.map(source => [source.id, source.name]));
  const historical = estimate.result;
  return <>
    <label className="block max-w-xs space-y-1 text-sm font-medium">
      <span>Devise de calcul</span>
      <select className={selectClass} value={currency} onChange={event => setCurrency(event.target.value === "CDF" ? "CDF" : "USD")}>
        <option value="USD">USD</option><option value="CDF">CDF</option>
      </select>
    </label>
    <div className="grid gap-4 lg:grid-cols-2">
      <EnergyPanel title="Coûts par source">
        <EnergyRequestState status={result.status} reload={reload} />
        {result.status === "idle" && <p className="text-sm text-muted-foreground">Sélectionnez un point d’import sur tableau général.</p>}
        {result.status === "ready" && <>
          <p className="font-semibold">{costLine(result.data, currency)}</p>
          {result.data.hasMissingData && <p className="text-sm text-muted-foreground">
            Couverture partielle · {result.data.reasons.map(reason => costReasons[reason] ?? "Donnée manquante").join(" · ")}
          </p>}
          <EnergyList items={result.data.bySource.map(source => ({ ...source, id: source.sourceId ?? "unknown" }))}
            empty="Aucune attribution disponible sur cette période." render={source => <>
              <strong>{(source.sourceId && sourceNames.get(source.sourceId)) || sourceTypes[source.sourceType] || "Source non attribuée"}</strong>
              <p>{costLine(source, currency)}</p>
              <p className="text-muted-foreground">Mesuré : {source.measuredKWh.replace(".", ",")} kWh · Estimé : {source.estimatedKWh.replace(".", ",")} kWh</p>
              {!!source.reasons.length && <p className="text-muted-foreground">{source.unpricedKWh.replace(".", ",")} kWh sans valorisation</p>}
            </>} />
          <details className="text-sm">
            <summary className="cursor-pointer font-medium">Tarifs et taux appliqués</summary>
            <EnergyList items={result.data.references.map(reference => ({ ...reference, id: `${reference.tariff.id}-${reference.exchangeRate?.id ?? ""}` }))}
              empty="Aucun tarif appliqué." render={({ tariff, exchangeRate }) => <>
                <p>{sourceNames.get(tariff.sourceId) ?? "Source archivée"} · {tariff.unitPrice.replace(".", ",")} {tariff.currency}/kWh</p>
                <p className="text-muted-foreground">Tarif du {dateLabel(tariff.effectiveFrom, timeZone)}
                  {tariff.effectiveTo && ` au ${dateLabel(tariff.effectiveTo, timeZone)}`}</p>
                {exchangeRate && <p className="text-muted-foreground">{exchangeRate.cdfPerUsd.replace(".", ",")} CDF pour 1 USD · {exchangeRate.rateSource} · {dateLabel(exchangeRate.effectiveFrom, timeZone)}</p>}
              </>} />
          </details>
        </>}
        <p className="text-xs text-muted-foreground">Valorisation du point sélectionné. Choisissez celui qui couvre le bâtiment entier.</p>
      </EnergyPanel>
      <GeneratorCosts key={`${buildingId}:${from}:${to}:${currency}`} {...{ topology, buildingId, from, to, currency, timeZone }} />
      <EnergyPanel title="Estimation historique en USD">
        <EnergyRequestState status={historical.status} reload={estimate.reload} />
        {historical.status === "ready" && <p className="text-xl font-semibold">
          {typeof historical.data === "number" && Number.isFinite(historical.data) ? money.format(historical.data) : "Indisponible"}
        </p>}
        <p className="text-sm text-muted-foreground">Analyse historique au tarif global configuré.</p>
      </EnergyPanel>
    </div>
  </>;
}

const severityLabels = { INFO: "Information", WARNING: "Avertissement", CRITICAL: "Critique" };

export function AlertsAndMaintenance({ topology, buildingId, timeZone }: { topology: Topology; buildingId: string; timeZone?: string | null }) {
  const [page, setPage] = useState(1);
  const alerts = useEnergyQuery<PaginatedResponse<Alert>>("/api/v1/alerts", new URLSearchParams({ buildingId, limit: "8", page: String(page) }).toString());
  return <div className="grid gap-4 lg:grid-cols-2">
    <EnergyPanel title="Alertes du bâtiment">
      <EnergyRequestState status={alerts.result.status} reload={alerts.reload} />
      {alerts.result.status === "ready" && <>
        {alerts.result.data.data.length ? <ul className="divide-y">{alerts.result.data.data.map(alert => <li key={alert.id} className="py-2 text-sm [overflow-wrap:anywhere]">
          <p className="font-medium">{alert.message}</p>
          <p className="text-muted-foreground">{severityLabels[alert.severity]} · {alert.resolvedAt ? "Résolue" : alert.isRead ? "Lue" : "Non lue"} · {dateLabel(alert.createdAt, timeZone)}</p>
        </li>)}</ul> : <p className="text-sm text-muted-foreground">Aucune alerte pour ce bâtiment.</p>}
        <PaginationControls page={page} totalPages={alerts.result.data.totalPages} loading={false} onPageChange={setPage} />
      </>}
    </EnergyPanel>
    <EnergyPanel title="Maintenance déclarée">
      <EnergyList items={topology.sources.filter(source => source.status === "MAINTENANCE")}
        empty="Aucune source signalée en maintenance." render={source => <strong>{source.name}</strong>} />
    </EnergyPanel>
    <ScheduledMaintenance buildingId={buildingId} />
  </div>;
}

type MaintenancePlan = {
  id: string; title: string; sourceName: string; sourceArchived: boolean; manufacturerReference: string;
  schedule: { status: "DUE" | "CHECK_HOURS" | "PLANNED" | "NOT_STARTED"; dueDate: string | null;
    dueTotalHours: string | null; latestHours: string | null };
};
type MaintenanceTicket = {
  id: string; description: string; plan: { title: string }; status: "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
};
const scheduleLabels = { DUE: "Entretien dû", CHECK_HOURS: "Relevé d’heures à actualiser", PLANNED: "Planifié", NOT_STARTED: "À venir" };
const ticketLabels = { OPEN: "Ouvert", IN_PROGRESS: "En cours", COMPLETED: "Terminé", CANCELLED: "Annulé" };

function ScheduledMaintenance({ buildingId }: { buildingId: string }) {
  const [planPage, setPlanPage] = useState(1);
  const [ticketPage, setTicketPage] = useState(1);
  const params = (page: number) => new URLSearchParams({ buildingId, page: String(page), limit: "8" }).toString();
  const plans = useEnergyQuery<PaginatedResponse<MaintenancePlan>>("/api/v1/energy/maintenance/plans", params(planPage));
  const tickets = useEnergyQuery<PaginatedResponse<MaintenanceTicket>>("/api/v1/energy/maintenance/tickets", params(ticketPage));
  return <>
    <EnergyPanel title="Entretien programmé des groupes">
      <EnergyRequestState status={plans.result.status} reload={plans.reload} />
      {plans.result.status === "ready" && <>
        <EnergyList items={plans.result.data.data} empty="Aucun plan d’entretien défini pour ce bâtiment." render={plan => <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong>{plan.title} · {plan.sourceName}</strong>
            <Badge variant="outline">{plan.sourceArchived ? "Groupe archivé" : scheduleLabels[plan.schedule.status]}</Badge>
          </div>
          <p className="text-muted-foreground">{plan.manufacturerReference}</p>
          {plan.schedule.dueDate && <p>Échéance calendrier · {plan.schedule.dueDate}</p>}
          {plan.schedule.dueTotalHours !== null && <p>Échéance compteur · {plan.schedule.dueTotalHours.replace(".", ",")} h
            {plan.schedule.latestHours !== null && ` · Dernier relevé ${plan.schedule.latestHours.replace(".", ",")} h`}</p>}
        </>} />
        <PaginationControls page={planPage} totalPages={plans.result.data.totalPages} loading={false} onPageChange={setPlanPage} />
      </>}
    </EnergyPanel>
    <EnergyPanel title="Tickets de maintenance">
      <EnergyRequestState status={tickets.result.status} reload={tickets.reload} />
      {tickets.result.status === "ready" && <>
        <EnergyList items={tickets.result.data.data} empty="Aucun ticket pour ce bâtiment." render={ticket => <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong>{ticket.plan.title}</strong><Badge variant="outline">{ticketLabels[ticket.status]}</Badge>
          </div>
          <p className="text-muted-foreground">{ticket.description}</p>
        </>} />
        <PaginationControls page={ticketPage} totalPages={tickets.result.data.totalPages} loading={false} onPageChange={setTicketPage} />
      </>}
    </EnergyPanel>
  </>;
}
