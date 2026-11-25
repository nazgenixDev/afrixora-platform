import { z } from 'zod';
import { limitSchema, pageSchema } from './querySchemas';

export const simulationId = z.uuid().transform(value => value.toLowerCase());
const watts = z.number().min(0).max(1_000_000_000);
const seconds = z.number().int().min(0).max(86_400);
const instant = z.iso.datetime({ offset: true }).transform(value => new Date(value).toISOString());
const distinctLoads = <T extends { loadId: string }>(loads: T[]) =>
  new Set(loads.map(load => load.loadId)).size === loads.length;

export const simulationPolicy = z.strictObject({
  version: z.literal(1),
  feedId: simulationId,
  demandPointId: simulationId,
  availablePowerW: watts,
  hysteresisW: watts,
  maxReadingAgeSeconds: seconds.min(1),
  cooldownSeconds: seconds.min(1),
  minOnSeconds: seconds,
  minOffSeconds: seconds,
  maxActionsPerHour: z.number().int().min(1).max(60),
  loads: z.array(z.strictObject({
    loadId: simulationId,
    meteringPointId: simulationId,
    maintenanceExcluded: z.boolean().default(false),
  })).min(1).max(50).refine(distinctLoads, 'Chaque charge doit être déclarée une seule fois.'),
}).refine(policy => policy.hysteresisW <= policy.availablePowerW, {
  path: ['hysteresisW'], message: 'L’hystérésis doit rester dans la puissance disponible.',
});

export const createSimulationRule = z.strictObject({
  buildingId: simulationId,
  name: z.string().trim().min(1).max(100),
  policy: simulationPolicy,
});

export const updateSimulationRule = z.strictObject({
  buildingId: simulationId,
  isActive: z.boolean(),
});

export const simulationQuery = z.strictObject({
  buildingId: simulationId,
  page: pageSchema,
  limit: limitSchema.default(25),
});

export const simulateAutomation = z.strictObject({
  buildingId: simulationId,
  scenarioId: simulationId,
  requestId: simulationId,
  evaluatedAt: instant,
  protection: z.enum(['CLEAR', 'BLOCKED', 'UNKNOWN']).default('UNKNOWN'),
  maintenance: z.enum(['CLEAR', 'LOCKED', 'UNKNOWN']).default('UNKNOWN'),
  site: z.enum(['ALLOWED', 'BLOCKED', 'UNKNOWN']).default('UNKNOWN'),
  manual: z.enum(['CLEAR', 'HOLD', 'UNKNOWN']).default('UNKNOWN'),
  initialLoads: z.array(z.strictObject({
    loadId: simulationId,
    state: z.enum(['ON', 'OFF']),
    changedAt: instant,
  })).max(50).refine(distinctLoads, 'Chaque charge doit être déclarée une seule fois.').default([]),
});

export const simulatedLoadSchema = z.object({
  loadId: simulationId,
  state: z.enum(['ON', 'OFF', 'UNKNOWN']),
  changedAt: instant.nullable(),
  shedW: z.number().min(0).max(Number.MAX_SAFE_INTEGER).nullable(),
});

export type SimulationPolicy = z.infer<typeof simulationPolicy>;
export type SimulationRequest = z.infer<typeof simulateAutomation>;
export type SimulatedLoad = z.infer<typeof simulatedLoadSchema>;
