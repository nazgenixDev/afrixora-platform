"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { isAxiosError } from "axios";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { useEnergyQuery } from "@/hooks/useEnergyRequest";
import api from "@/lib/api";
import { dateLabel, formatReading, priorities, rulePath, type Load, type SimulationRule, type SimulationRun, type Topology } from "@/lib/energyV2";
import type { PaginatedResponse } from "@/types";
import { EnergyPanel, EnergyRequestState, selectClass } from "./EnergyViews";

const decisions: Record<string, string> = { SHED: "Délestage simulé", RESTORE: "Reprise simulée", NO_ACTION: "Aucune action proposée" };
const reasons: Record<string, string> = {
  RULE_DISABLED: "La règle est désactivée.",
  PROTECTION_NOT_CLEAR: "L’état des protections est inconnu ou bloquant.",
  MAINTENANCE_NOT_CLEAR: "La maintenance est active ou son état est inconnu.",
  SITE_PERMISSION_NOT_CLEAR: "Les règles du site ne permettent pas cette simulation.",
  MANUAL_PRIORITY: "La priorité manuelle bloque la décision ou son état est inconnu.",
  TOPOLOGY_UNAVAILABLE: "La topologie enregistrée est devenue indisponible.",
  FEED_NOT_ALLOWED: "L’arrivée n’est pas autorisée ou la source est indisponible.",
  MISSING_MEASUREMENT: "Mesure absente.",
  INVALID_MEASUREMENT: "Mesure invalide, ambiguë ou estimée.",
  STALE_MEASUREMENT: "Mesure obsolète.",
  UNKNOWN_SOURCE: "Source inconnue ou incohérente avec la règle.",
  CRITICAL_SCOPE: "La charge ou son circuit est critique.",
  LOAD_NOT_FLEXIBLE: "La charge n’est pas flexible.",
  LOAD_MAINTENANCE_EXCLUDED: "La charge est exclue pour maintenance.",
  LOAD_NOT_ALLOWED: "La charge ou son circuit n’autorise pas le délestage.",
  UNKNOWN_LOAD_STATE: "État initial de la charge inconnu.",
  SIMULATED_BASELINE_UNCERTAIN: "La demande de référence après projection est incertaine.",
  INCONSISTENT_POWER_TOTAL: "Les mesures de puissance sont incohérentes entre elles.",
  DEMAND_WITHIN_LIMIT: "La demande est sous le plafond.",
  HOURLY_ACTION_LIMIT: "Le plafond horaire de la règle est atteint.",
  ACTION_COOLDOWN: "Le délai anti-oscillation est en cours.",
  MIN_ON_TIME: "La durée minimale de marche n’est pas atteinte.",
  MIN_OFF_TIME: "La durée minimale d’arrêt n’est pas atteinte.",
  LOAD_HOURLY_LIMIT: "Le plafond horaire de la charge est atteint.",
  NO_RELIABLE_REDUCTION: "La mesure ne permet pas de calculer une réduction fiable.",
  DEMAND_EXCEEDS_LIMIT: "La demande projetée dépasse la puissance disponible.",
  RESTORE_HYSTERESIS: "La puissance après reprise dépasserait le seuil avec marge.",
  DEMAND_RECOVERED_WITH_MARGIN: "La marge de puissance et le temps d’arrêt permettent la reprise.",
  NO_ELIGIBLE_LOAD: "Aucune charge ne remplit les conditions du délestage.",
  RESTORE_BLOCKED: "Les conditions de reprise ne sont pas réunies.",
};

const gateFields = [
  { key: "protection", label: "Protection locale (hypothèse)", allow: "CLEAR", deny: "BLOCKED", yes: "Disponible", no: "Bloquante" },
  { key: "maintenance", label: "Maintenance (hypothèse)", allow: "CLEAR", deny: "LOCKED", yes: "Hors maintenance", no: "Verrouillée" },
  { key: "site", label: "Règles du site (hypothèse)", allow: "ALLOWED", deny: "BLOCKED", yes: "Autorisée", no: "Bloquée" },
  { key: "manual", label: "Priorité manuelle (hypothèse)", allow: "CLEAR", deny: "HOLD", yes: "Sans blocage manuel", no: "Priorité manuelle active" },
] as const;

function SimulationReport({ run, names, timeZone }: { run: SimulationRun; names: Map<string, Load>; timeZone?: string | null }) {
  return <article className="min-w-0 space-y-2 rounded-md border p-3 text-sm" aria-label="Rapport de simulation">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <strong>{decisions[run.decision] ?? run.decision}</strong>
      <span className="text-xs text-muted-foreground">{dateLabel(run.evaluatedAt, timeZone)} {timeZone || "UTC"}</span>
    </div>
    <p className="text-muted-foreground">{reasons[run.reason] ?? run.reason}</p>
    <p>Demande mesurée : {formatReading(run.result.measuredDemandW, "W")} · Projection avant : {formatReading(run.result.projectedDemandBeforeW, "W")} · Après : {formatReading(run.result.projectedDemandAfterW, "W")}</p>
    {run.result.action && <p>Charge : {names.get(run.result.action.loadId)?.name ?? "Charge du scénario"} · {formatReading(run.result.action.powerW, "W")}</p>}
    {!!run.result.exclusions.length && <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
      {run.result.exclusions.map(item => <li key={item.loadId}>{names.get(item.loadId)?.name ?? "Charge du scénario"} · {reasons[item.reason] ?? item.reason}</li>)}
    </ul>}
  </article>;
}

function RuleSimulation({ rule, buildingId, names, timeZone, refreshRules }: {
  rule: SimulationRule; buildingId: string; names: Map<string, Load>; timeZone?: string | null; refreshRules: () => void;
}) {
  const path = `${rulePath}/${encodeURIComponent(rule.id)}`;
  const [page, setPage] = useState(1);
  const history = useEnergyQuery<PaginatedResponse<SimulationRun>>(`${path}/runs`,
    new URLSearchParams({ buildingId, page: String(page), limit: "5" }).toString());
  const [scenarioChoice, setScenarioChoice] = useState("new");
  const [latest, setLatest] = useState<SimulationRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const pending = useRef<AbortController | null>(null);
  const retry = useRef<{ fingerprint: string; scenarioId: string; requestId: string } | null>(null);
  const scenarioIds = [...new Set([
    ...(history.result.status === "ready" ? history.result.data.data.map(run => run.scenarioId) : []),
    ...(latest ? [latest.scenarioId] : []), ...(scenarioChoice !== "new" ? [scenarioChoice] : []),
  ])];

  useEffect(() => () => pending.current?.abort(), []);

  async function simulate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || !rule.isActive) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const evaluatedAt = new Date(String(values.get("evaluatedAt")));
    if (!Number.isFinite(evaluatedAt.getTime()) || evaluatedAt.getTime() > Date.now()) {
      setMessage("Choisissez une date d’évaluation passée ou présente.");
      return;
    }
    const initialLoads = [];
    if (scenarioChoice === "new") {
      for (const { loadId } of rule.action.policy.loads) {
        const state = values.get(`state-${loadId}`);
        if (state !== "ON" && state !== "OFF") continue;
        const changedAt = new Date(String(values.get(`time-${loadId}`)));
        if (!Number.isFinite(changedAt.getTime()) || changedAt > evaluatedAt) {
          setMessage("Renseignez un changement d’état antérieur ou égal à l’évaluation pour chaque charge renseignée.");
          return;
        }
        initialLoads.push({ loadId, state, changedAt: changedAt.toISOString() });
      }
    }
    const body = { buildingId, evaluatedAt: evaluatedAt.toISOString(), initialLoads,
      ...Object.fromEntries(gateFields.map(({ key }) => [key, values.get(key)])) };
    const fingerprint = JSON.stringify([scenarioChoice, body]);
    if (retry.current?.fingerprint !== fingerprint) {
      retry.current = { fingerprint, requestId: crypto.randomUUID(),
        scenarioId: scenarioChoice === "new" ? crypto.randomUUID() : scenarioChoice };
    }
    const { scenarioId, requestId } = retry.current;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setMessage("");
    try {
      const { data } = await api.post<SimulationRun>(`${path}/runs`, { ...body, scenarioId, requestId }, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setLatest(data);
      setScenarioChoice(data.scenarioId);
      retry.current = null;
      form.reset();
      setPage(1);
      history.reload();
    } catch (error) {
      if (controller.signal.aborted) return;
      const status = isAxiosError(error) ? error.response?.status : undefined;
      setMessage(status === 403 ? "Le bâtiment n’est plus accessible." :
        status === 409 ? "Cet instant ou cette demande est déjà enregistré. Choisissez un instant ultérieur ou un nouveau scénario." :
          "La simulation n’a pas pu être chargée. Réessayez avec les mêmes paramètres.");
    } finally {
      pending.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  async function toggleRule() {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setMessage("");
    try {
      await api.patch(path, { buildingId, isActive: !rule.isActive }, { signal: controller.signal });
      if (!controller.signal.aborted) refreshRules();
    } catch {
      if (!controller.signal.aborted) setMessage("Impossible de modifier l’activation de la règle.");
    } finally {
      pending.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
    <EnergyPanel title={rule.name}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{rule.isActive ? "Simulation activée" : "Simulation désactivée"}</Badge>
        <Button size="sm" variant="outline" disabled={busy} onClick={toggleRule}>{rule.isActive ? "Désactiver la règle" : "Activer la règle"}</Button>
      </div>
      <p className="text-sm text-muted-foreground">Puissance disponible : {formatReading(rule.action.policy.availablePowerW, "W")} · Marge de reprise : {formatReading(rule.action.policy.hysteresisW, "W")}</p>
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        {rule.action.policy.loads.map(item => <li key={item.loadId}>
          {names.get(item.loadId)?.name ?? "Charge indisponible"} · {priorities[names.get(item.loadId)?.priority ?? ""] ?? "Priorité inconnue"}
          {item.maintenanceExcluded && " · Exclue pour maintenance"}
        </li>)}
      </ol>
      {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
      <form className="space-y-3 border-t pt-3" onSubmit={simulate}>
        <fieldset disabled={busy || !rule.isActive} className="min-w-0 space-y-3 disabled:opacity-70">
          <legend className="font-semibold">Paramètres de simulation</legend>
          <label className="block space-y-1 text-sm">Scénario
            <select className={selectClass} value={scenarioChoice} onChange={event => setScenarioChoice(event.target.value)}>
              <option value="new">Nouveau scénario</option>
              {scenarioIds.map(id => <option value={id} key={id}>Poursuivre · {id.slice(0, 8)}</option>)}
            </select>
          </label>
          <label className="block min-w-0 space-y-1 text-sm">Date d’évaluation (heure de votre appareil)
            <Input name="evaluatedAt" type="datetime-local" required className="min-w-0" />
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            {gateFields.map(field => <label key={field.key} className="min-w-0 space-y-1 text-sm">
              <span>{field.label}</span><select className={selectClass} name={field.key} defaultValue="UNKNOWN">
                <option value="UNKNOWN">Inconnu</option><option value={field.allow}>{field.yes}</option><option value={field.deny}>{field.no}</option>
              </select>
            </label>)}
          </div>
          {scenarioChoice === "new" && <details className="rounded-md border p-2">
            <summary className="cursor-pointer text-sm font-medium">États initiaux hypothétiques</summary>
            {rule.action.policy.loads.map(({ loadId }) => <div key={loadId} className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className="min-w-0 text-sm">{names.get(loadId)?.name ?? "Charge du scénario"}
                <select name={`state-${loadId}`} className={selectClass}><option value="UNKNOWN">Inconnu</option><option value="ON">En marche</option><option value="OFF">À l’arrêt</option></select>
              </label>
              <label className="min-w-0 text-sm">Changement d’état
                <Input name={`time-${loadId}`} className="min-w-0" type="datetime-local" />
              </label>
            </div>)}
          </details>}
          <Button type="submit">{busy ? "Simulation en cours…" : "Simuler"}</Button>
        </fieldset>
      </form>
    </EnergyPanel>
    <EnergyPanel title="Historique des décisions simulées">
      {latest && <div aria-live="polite"><SimulationReport run={latest} names={names} timeZone={timeZone} /></div>}
      <EnergyRequestState status={history.result.status} reload={history.reload} />
      {history.result.status === "ready" && <>
        {history.result.data.data.length === 0 && <p className="text-sm text-muted-foreground">Aucune simulation enregistrée.</p>}
        {history.result.data.data.filter(run => run.id !== latest?.id).map(run => <SimulationReport key={run.id} run={run} names={names} timeZone={timeZone} />)}
        <PaginationControls page={page} onPageChange={setPage} loading={false} totalPages={history.result.data.totalPages} />
      </>}
    </EnergyPanel>
  </div>;
}

export function SimulationView({ buildingId, topology, timeZone }: { buildingId: string; topology: Topology; timeZone?: string | null }) {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState("");
  const rules = useEnergyQuery<PaginatedResponse<SimulationRule>>(rulePath,
    new URLSearchParams({ buildingId, page: String(page), limit: "25" }).toString());
  const names = new Map(topology.loads.map(load => [load.id, load]));
  if (rules.result.status !== "ready") return <EnergyRequestState status={rules.result.status} reload={rules.reload} />;
  const { data, totalPages } = rules.result.data;
  if (!data.length) return <EnergyPanel title="Simulation énergétique"><p className="text-sm text-muted-foreground">Aucune règle de simulation configurée pour ce bâtiment.</p></EnergyPanel>;
  const rule = data.find(item => item.id === selected) ?? data[0];
  return <div className="space-y-4">
    <label className="block w-full max-w-md space-y-1 text-sm font-medium">
      <span>Règle de simulation</span>
      <select className={selectClass} value={rule.id} onChange={event => setSelected(event.target.value)}>
        {data.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </label>
    <PaginationControls page={page} onPageChange={setPage} totalPages={totalPages} loading={false} />
    <RuleSimulation key={rule.id} rule={rule} buildingId={buildingId} names={names} timeZone={timeZone} refreshRules={rules.reload} />
  </div>;
}
