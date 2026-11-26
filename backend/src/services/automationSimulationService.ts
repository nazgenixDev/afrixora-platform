import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AppError, NotFoundError } from '../utils/errors';
import {
  createSimulationRule, simulatedLoadSchema, simulationPolicy,
  type SimulationPolicy, type SimulationRequest,
} from '../utils/automationSimulationSchemas';
import { onSite } from './energyTopologyService';
import { simulateEnergy, type PowerSample, type SimulationLoad } from './automationSimulationEngine';

type Tx = Prisma.TransactionClient;
type Actor = Parameters<typeof onSite>[0];
type Site = { tenantId: string; buildingId: string };
type Page = { page: number; limit: number };

const executionFields = {
  id: true, tenantId: true, buildingId: true, automationId: true, scenarioId: true, requestId: true,
  evaluatedAt: true, createdAt: true, inputSnapshot: true, decision: true, reason: true,
  result: true, action: true, targetLoadId: true,
} as const;

function invalid(message: string) {
  return new AppError(message, 400, 'INVALID_SIMULATION');
}

function conflict(message: string) {
  return new AppError(message, 409, 'SIMULATION_CONFLICT');
}

async function findRule(tx: Tx, site: Site, id: string) {
  const rule = await tx.automation.findFirst({ where: { ...site, id, simulationOnly: true } });
  if (!rule) throw new NotFoundError('Règle de simulation introuvable.');
  return rule;
}

async function readTopology(tx: Tx, site: Site, policy: SimulationPolicy) {
  const where = { ...site, archivedAt: null };
  const [feed, points, loads] = await Promise.all([
    tx.sourceFeed.findFirst({ where: { ...where, id: policy.feedId, source: { archivedAt: null }, bus: { archivedAt: null } },
      select: { busId: true, sourceId: true, isAllowed: true, source: { select: { ratedPowerW: true, status: true } } } }),
    tx.meteringPoint.findMany({ where: {
      ...where, id: { in: [policy.demandPointId, ...policy.loads.map(load => load.meteringPointId)] },
      measurementMode: 'INSTANTANEOUS', flowDirection: 'IMPORT', unit: { in: ['W', 'kW'] },
      device: { ...site },
    }, select: { id: true, scope: true, loadId: true, feedId: true, sourceId: true, boardId: true, circuitId: true } }),
    tx.electricalLoad.findMany({ where: { ...where, id: { in: policy.loads.map(load => load.loadId) },
      circuit: { archivedAt: null, board: { archivedAt: null } } },
      select: { id: true, circuitId: true, priority: true, isControllable: true, canBeAutomated: true,
        ratedPowerW: true, minOnSeconds: true, minOffSeconds: true, maxInterruptionsPerHour: true,
        circuit: { select: { priority: true, status: true, isControllable: true, autoSheddingAllowed: true,
          boardId: true, board: { select: { busId: true } } } } } }),
  ]);
  const pointById = new Map(points.map(point => [point.id, point]));
  const demand = pointById.get(policy.demandPointId);
  if (!feed || !demand || loads.length !== policy.loads.length) return null;
  if (feed.source.ratedPowerW !== null && feed.source.ratedPowerW.lessThan(policy.availablePowerW)) return null;

  const loadById = new Map(loads.map(load => [load.id, load]));
  const candidates: Omit<SimulationLoad, 'sample'>[] = [];
  for (const entry of policy.loads) {
    const load = loadById.get(entry.loadId);
    const point = pointById.get(entry.meteringPointId);
    if (!load || point?.scope !== 'LOAD' || point.loadId !== load.id || load.circuit.board.busId !== feed.busId) return null;

    const matchesDemand =
      (demand.scope === 'FEED' && demand.feedId === policy.feedId) ||
      (demand.scope === 'SOURCE' && demand.sourceId === feed.sourceId) ||
      (demand.scope === 'BOARD' && demand.boardId === load.circuit.boardId) ||
      (demand.scope === 'CIRCUIT' && demand.circuitId === load.circuitId);
    if (!matchesDemand) return null;

    candidates.push({
      loadId: load.id, circuitId: load.circuitId, priority: load.priority, circuitPriority: load.circuit.priority,
      isAllowed: load.isControllable && load.canBeAutomated && load.circuit.isControllable &&
        load.circuit.autoSheddingAllowed && load.circuit.status !== 'OUT_OF_SERVICE',
      maintenanceExcluded: entry.maintenanceExcluded,
      ratedPowerW: load.ratedPowerW?.toNumber() ?? null,
      minOnSeconds: load.minOnSeconds ?? 0, minOffSeconds: load.minOffSeconds ?? 0,
      maxInterruptionsPerHour: load.maxInterruptionsPerHour,
    });
  }
  return { candidates, sourceId: feed.sourceId, feedAllowed: feed.isAllowed && !['UNAVAILABLE', 'MAINTENANCE'].includes(feed.source.status) };
}

async function readPower(tx: Tx, site: Site, policy: SimulationPolicy, at: Date, sourceId: string) {
  const points = [policy.demandPointId, ...policy.loads.map(load => load.meteringPointId)];
  const rows = await tx.$queryRaw<(Omit<PowerSample, 'capturedAt'> & { pointId: string; capturedAt: Date })[]>`
    SELECT p.id AS "pointId", r.time AS "capturedAt", r.value, r.unit, r.quality,
           CASE WHEN r.source_id = ${sourceId}::uuid THEN r.source_feed_id::text END AS "feedId"
    FROM "MeteringPoint" p
    CROSS JOIN LATERAL (
      SELECT time, value, unit, quality, source_id, source_feed_id
      FROM public.sensor_readings
      WHERE tenant_id = ${site.tenantId}::uuid AND device_id = p."deviceId"::uuid
        AND metering_point_id = p.id::uuid AND time <= ${at}
        AND metric = 'power' AND measurement_mode = 'INSTANTANEOUS'
      ORDER BY time DESC LIMIT 2
    ) r
    WHERE p."tenantId" = ${site.tenantId} AND p."buildingId" = ${site.buildingId}
      AND p.id IN (${Prisma.join(points)})
    ORDER BY p.id, r.time DESC`;
  const samples = new Map<string, PowerSample>();
  for (const { pointId, capturedAt: date, ...sample } of rows) {
    const capturedAt = date.toISOString();
    const latest = samples.get(pointId);
    if (!latest) samples.set(pointId, { ...sample, capturedAt });
    else if (latest.capturedAt === capturedAt) latest.quality = 'INVALID';
  }
  return samples;
}

export function createEnergySimulationRule(actor: Actor, input: z.infer<typeof createSimulationRule>) {
  const { buildingId, name, policy } = input;
  return onSite(actor, buildingId, 'write', async (tx, site) => {
    if (!await readTopology(tx, site, policy)) throw invalid('Les points, l’arrivée, les charges ou la capacité sont incompatibles.');
    return tx.automation.create({ data: {
      ...site, name, isActive: false, simulationOnly: true,
      trigger: { type: 'MANUAL_SIMULATION' }, action: { type: 'ENERGY_SIMULATION', policy },
    } });
  });
}

export function updateEnergySimulationRule(actor: Actor, buildingId: string, id: string, isActive: boolean) {
  return onSite(actor, buildingId, 'write', async (tx, site) => {
    await findRule(tx, site, id);
    return tx.automation.update({ where: { ...site, id }, data: { isActive } });
  });
}

export function listEnergySimulationRules(actor: Actor, buildingId: string, { page, limit }: Page) {
  return onSite(actor, buildingId, 'read', async (tx, site) => {
    const where = { ...site, simulationOnly: true };
    const [data, total] = await Promise.all([
      tx.automation.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * limit, take: limit }),
      tx.automation.count({ where }),
    ]);
    return { data, total, page, totalPages: Math.ceil(total / limit) };
  });
}

export function listSimulationRuns(actor: Actor, buildingId: string, id: string, { page, limit }: Page) {
  return onSite(actor, buildingId, 'read', async (tx, site) => {
    await findRule(tx, site, id);
    const where = { ...site, automationId: id };
    const [data, total] = await Promise.all([
      tx.automationExecution.findMany({ where, orderBy: [{ evaluatedAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * limit, take: limit, select: executionFields }),
      tx.automationExecution.count({ where }),
    ]);
    return { data, total, page, totalPages: Math.ceil(total / limit) };
  });
}

export async function runEnergySimulation(actor: Actor, id: string, request: SimulationRequest) {
  const { buildingId, scenarioId, requestId } = request;
  const at = new Date(request.evaluatedAt);
  if (at.getTime() > Date.now()) throw invalid('La date d’évaluation doit être passée ou présente.');
  // L’ordre des états envoyés ne change pas le scénario.
  const normalized = { ...request, initialLoads: [...request.initialLoads].sort((a, b) => a.loadId.localeCompare(b.loadId)) };
  const requestHash = createHash('sha256').update(JSON.stringify(normalized)).digest('hex');

  const execute = () => onSite(actor, buildingId, 'write', async (tx, site) => {
    const rule = await findRule(tx, site, id);
    const scenario = { ...site, automationId: id, scenarioId };
    const existing = await tx.automationExecution.findFirst({
      where: { ...scenario, requestId }, select: { ...executionFields, requestHash: true },
    });
    if (existing) {
      const { requestHash: existingHash, ...execution } = existing;
      if (existingHash !== requestHash) throw conflict('Cette clé identifie déjà une autre demande.');
      return execution;
    }

    const storedPolicy = z.object({ type: z.literal('ENERGY_SIMULATION'), policy: simulationPolicy }).safeParse(rule.action);
    if (!storedPolicy.success) throw conflict('Configuration de simulation invalide.');
    const { policy } = storedPolicy.data;
    const previous = await tx.automationExecution.findFirst({ where: scenario,
      orderBy: { evaluatedAt: 'desc' }, select: { evaluatedAt: true, result: true } });
    if (previous && (at <= previous.evaluatedAt || normalized.initialLoads.length)) {
      throw conflict('Le scénario exige des dates croissantes et initialise les charges une seule fois.');
    }
    const initialById = new Map(normalized.initialLoads.map(load => [load.loadId, load]));
    const configured = new Set(policy.loads.map(load => load.loadId));
    if (normalized.initialLoads.some(load => !configured.has(load.loadId) || new Date(load.changedAt) > at)) {
      throw invalid('État initial incohérent avec les charges ou la date de la règle.');
    }

    const loads = previous ? z.object({ loads: z.array(simulatedLoadSchema) }).parse(previous.result).loads :
      policy.loads.map(({ loadId }) => ({
        loadId, state: initialById.get(loadId)?.state ?? 'UNKNOWN' as const,
        changedAt: initialById.get(loadId)?.changedAt ?? null, shedW: null,
      }));
    const mayEvaluate = rule.isActive && normalized.protection === 'CLEAR' && normalized.maintenance === 'CLEAR' &&
      normalized.site === 'ALLOWED' && normalized.manual === 'CLEAR';
    const topology = mayEvaluate ? await readTopology(tx, site, policy) : null;
    const samples = topology?.feedAllowed ? await readPower(tx, site, policy, at, topology.sourceId) : new Map<string, PowerSample>();
    const recentActions = await tx.automationExecution.findMany({
      where: { ...scenario, action: { not: null }, evaluatedAt: { gt: new Date(at.getTime() - 3_600_000) } },
      orderBy: { evaluatedAt: 'desc' }, take: 60, select: { action: true, evaluatedAt: true, targetLoadId: true },
    });
    const pointByLoad = new Map(policy.loads.map(load => [load.loadId, load.meteringPointId]));
    const input = {
      ruleEnabled: rule.isActive, topologyAvailable: Boolean(topology), feedAllowed: topology?.feedAllowed ?? false,
      policy, request: normalized, demand: samples.get(policy.demandPointId) ?? null, loads,
      candidates: topology?.candidates.map(candidate => ({
        ...candidate, sample: samples.get(pointByLoad.get(candidate.loadId) ?? '') ?? null,
      })) ?? [],
      recentActions: recentActions.map(action => ({ ...action, evaluatedAt: action.evaluatedAt.toISOString() })),
    };
    const result = simulateEnergy(input);
    return tx.automationExecution.create({
      data: { ...scenario, requestId, requestHash, evaluatedAt: at, inputSnapshot: { ruleName: rule.name, ...input },
        decision: result.decision, reason: result.reason, result, action: result.action?.type, targetLoadId: result.action?.loadId },
      select: executionFields,
    });
  });

  // Une transaction concurrente peut gagner la réservation d’une clé ou d’un instant.
  try {
    return await execute();
  } catch (error) {
    const retry = error instanceof AppError && error.code === 'TOPOLOGY_CONFLICT' ||
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
    if (!retry) throw error;
    return execute();
  }
}
