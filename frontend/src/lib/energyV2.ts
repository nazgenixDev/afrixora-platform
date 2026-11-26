import api from "@/lib/api";
import type { Building, PaginatedResponse } from "@/types";

type Item = { id: string; name: string };
export type Source = Item & { type: string; status: string; ratedPowerW: string | null };
export type Feed = Item & { sourceId: string; busId: string; observedState: string; observedAt: string | null };
export type Board = Item & { busId: string; location: string | null; nominalVoltageV: string | null };
export type Circuit = Item & { boardId: string; code: string; priority: string; status: string };
export type Load = Item & { circuitId: string; priority: string; category: string; ratedPowerW: string | null };
export type Point = Item & {
  deviceId: string; scope: string; unit: string; measurementMode: string; flowDirection: string;
  sourceId: string | null; feedId: string | null; boardId: string | null;
  circuitId: string | null; loadId: string | null;
};
export type Endpoint = Item & {
  deviceId: string; targetCircuitId: string | null; targetLoadId: string | null;
  isEnabled: boolean; approvalStatus: string; verifiedState: string; verifiedAt: string | null; verificationMethod: string;
};

export type Topology = {
  sources: Source[]; feeds: Feed[]; buses: Item[]; boards: Board[]; circuits: Circuit[];
  loads: Load[]; "metering-points": Point[]; "control-endpoints": Endpoint[];
};

export type EnergyQuantity = { measuredKWh: number | null; estimatedKWh: number | null };
export type MeteredEnergy = EnergyQuantity & {
  samples: number;
  gaps: number;
  timeZone: string;
  bySource: (EnergyQuantity & { sourceId: string | null; sourceType: string })[];
};
export type MeteredPower = { timeZone: string; latestPower: { valueW: number; time: string; quality: string } | null };

export const rulePath = "/api/v1/automations/energy-simulation/rules";

export type SimulationRule = Item & {
  isActive: boolean;
  action: { policy: { availablePowerW: number; hysteresisW: number; loads: { loadId: string; maintenanceExcluded: boolean }[] } };
};
export type SimulationRun = {
  id: string;
  scenarioId: string;
  evaluatedAt: string;
  decision: string;
  reason: string;
  result: {
    action: { type: string; loadId: string; powerW: number } | null;
    measuredDemandW: number | null;
    projectedDemandBeforeW: number | null;
    projectedDemandAfterW: number | null;
    exclusions: { loadId: string; reason: string }[];
  };
};

export const number = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
export const money = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "USD", currencyDisplay: "code" });
export const formatReading = (value: number | null | undefined, unit: string) =>
  typeof value === "number" && Number.isFinite(value) ? `${number.format(value)} ${unit}` : "Indisponible";

export const sourceTypes: Record<string, string> = {
  GRID: "Réseau (SNEL)", GENERATOR: "Groupe électrogène", PV_INVERTER: "Solaire", BATTERY_INVERTER: "Batterie",
  OTHER: "Autre", UNKNOWN: "Source non attribuée",
};
export const sourceStatuses: Record<string, string> = {
  UNKNOWN: "Disponibilité inconnue", AVAILABLE: "Disponible", UNAVAILABLE: "Indisponible", MAINTENANCE: "En maintenance",
};
export const priorities: Record<string, string> = { CRITICAL: "Critique", IMPORTANT: "Importante", FLEXIBLE: "Flexible" };

export function siteTimeZone(building: Pick<Building, "timeZone" | "city">) {
  if (building.timeZone) {
    try {
      new Intl.DateTimeFormat("fr-FR", { timeZone: building.timeZone });
      return building.timeZone;
    } catch {
      // Un fuseau invalide utilise le même repli que les agrégats historiques.
    }
  }
  const city = building.city?.trim().toLowerCase() ?? "";
  if (["lubumbashi", "kolwezi", "likasi", "goma", "bukavu", "kisangani"].includes(city)) return "Africa/Lubumbashi";
  if (["kinshasa", "matadi"].includes(city)) return "Africa/Kinshasa";
  return "UTC";
}

export function dateLabel(value: string, timeZone?: string | null) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date inconnue";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: timeZone || "UTC" }).format(date);
}

export function deviceHref(id: string) {
  return `/devices?${new URLSearchParams({ deviceId: id })}`;
}

export async function allTopologyItems<K extends keyof Topology>(buildingId: string, resource: K, signal: AbortSignal): Promise<Topology[K]> {
  const path = `/api/v1/energy/buildings/${encodeURIComponent(buildingId)}/topology/${resource}`;
  const items: Topology[K][number][] = [];
  let totalPages = 1;
  for (let page = 1; page <= totalPages && !signal.aborted; page++) {
    const { data } = await api.get<PaginatedResponse<Topology[K][number]>>(path, { params: { page, limit: 100 }, signal });
    items.push(...data.data);
    totalPages = data.totalPages;
  }
  return items as Topology[K];
}

export async function loadTopology(buildingId: string, signal: AbortSignal): Promise<Topology> {
  const [sources, feeds, buses, boards, circuits, loads, points, endpoints] = await Promise.all([
    allTopologyItems(buildingId, "sources", signal), allTopologyItems(buildingId, "feeds", signal),
    allTopologyItems(buildingId, "buses", signal), allTopologyItems(buildingId, "boards", signal),
    allTopologyItems(buildingId, "circuits", signal), allTopologyItems(buildingId, "loads", signal),
    allTopologyItems(buildingId, "metering-points", signal), allTopologyItems(buildingId, "control-endpoints", signal),
  ]);
  return { sources, feeds, buses, boards, circuits, loads, "metering-points": points, "control-endpoints": endpoints };
}

export const commandLabels: Record<string, string> = {
  PENDING: "Commande demandée", SENT: "Commande envoyée au broker", ACKNOWLEDGED: "Réception acquittée",
  CONFIRMED: "État déclaré par le boîtier", FAILED: "Commande en échec", EXPIRED: "Commande expirée", REJECTED: "Commande refusée",
};
