"use client";

import { useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useEnergyQuery, useEnergyRequest } from "@/hooks/useEnergyRequest";
import { allTopologyItems, commandLabels, dateLabel, priorities } from "@/lib/energyV2";
import { EnergyRequestState, PhysicalState } from "./EnergyViews";

export type SentCommand = { commandId: string; status: string };
type CommandRecord = {
  status: string; createdAt: string; sentAt: string | null; acknowledgedAt: string | null; confirmedAt: string | null;
};

export function DeviceCommandProgress({ deviceId, command }: { deviceId: string; command: SentCommand }) {
  const path = `/api/v1/devices/${encodeURIComponent(deviceId)}/commands/${encodeURIComponent(command.commandId)}`;
  const tracking = useEnergyQuery<CommandRecord>(path);
  const record = tracking.result.status === "ready" ? tracking.result.data : null;
  const status = record?.status ?? command.status;
  return <section className="space-y-2 border-t pt-3" aria-label="Suivi de la commande">
    <h4 className="font-semibold">Suivi de la commande</h4>
    <Badge variant={status === "CONFIRMED" ? "secondary" : "outline"}>{commandLabels[status] ?? "Statut de commande inconnu"}</Badge>
    <EnergyRequestState status={tracking.result.status} reload={tracking.reload} />
    {record && <dl className="grid gap-1 text-xs">
      {[
        ["Demande enregistrée", record.createdAt], ["Envoi au broker", record.sentAt],
        ["Réception acquittée", record.acknowledgedAt], ["État déclaré par le boîtier", record.confirmedAt],
      ].map(([label, at]) => <div className="flex justify-between gap-2" key={label}>
        <dt className="text-muted-foreground">{label}</dt><dd>{at ? `${dateLabel(at)} UTC` : "—"}</dd>
      </div>)}
    </dl>}
    {tracking.result.status === "ready" && ["PENDING", "SENT", "ACKNOWLEDGED"].includes(status) &&
      <Button size="sm" variant="outline" onClick={tracking.reload}>Actualiser le statut</Button>}
  </section>;
}

export function DeviceEnergyDetails({ buildingId, deviceId }: { buildingId: string; deviceId: string }) {
  const fetchLinks = useCallback(async (signal: AbortSignal) => {
    const [loads, points, endpoints] = await Promise.all([
      allTopologyItems(buildingId, "loads", signal),
      allTopologyItems(buildingId, "metering-points", signal),
      allTopologyItems(buildingId, "control-endpoints", signal),
    ]);
    const channels = endpoints.filter(endpoint => endpoint.deviceId === deviceId);
    const related = new Set([
      ...points.filter(point => point.deviceId === deviceId).map(point => point.loadId),
      ...channels.map(channel => channel.targetLoadId),
    ]);
    return { loads: loads.filter(load => related.has(load.id)), channels };
  }, [buildingId, deviceId]);
  const links = useEnergyRequest(fetchLinks);
  return <section className="space-y-2 border-t pt-3" aria-label="Liens avec la topologie électrique">
    <h4 className="font-semibold">Charges physiques liées</h4>
    <EnergyRequestState status={links.result.status} reload={links.reload} />
    {links.result.status === "ready" && <>
      {links.result.data.loads.length ? <ul className="space-y-1">
        {links.result.data.loads.map(load => <li key={load.id} className="[overflow-wrap:anywhere]">
          {load.name} · {priorities[load.priority] ?? "Priorité inconnue"}
        </li>)}
      </ul> : <p className="text-muted-foreground">Aucun lien direct déclaré avec une charge physique.</p>}
      <h4 className="pt-1 font-semibold">Vérification physique</h4>
      {links.result.data.channels.length ? <ul className="space-y-1">
        {links.result.data.channels.map(endpoint => <li key={endpoint.id} className="[overflow-wrap:anywhere]">
          {endpoint.name} · <PhysicalState endpoint={endpoint} />
        </li>)}
      </ul> : <p className="text-muted-foreground">État physique inconnu.</p>}
    </>}
  </section>;
}
