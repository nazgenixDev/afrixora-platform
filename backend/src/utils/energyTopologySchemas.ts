import * as db from '@prisma/client';
import { z } from 'zod';

const name = z.string().trim().min(1).max(120);
const id = z.guid();
const optionalId = id.nullable().optional();
const metadata = z.record(z.string(), z.json()).optional();
const priority = z.enum(db.ElectricalPriority);
const phases = z.enum(db.ElectricalPhaseConfiguration).optional();
const flag = z.boolean().optional();
const positive = (max: number) => z.number().positive().max(max).multipleOf(0.001).nullable().optional();
const duration = z.number().int().min(0).max(2147483647).nullable().optional();
const location = z.string().trim().max(300).nullable().optional();

export const topologySchemas = {
  sources: z.strictObject({ name, type: z.enum(db.EnergySourceType), ratedPowerW: positive(99999999999.999), metadata }),
  buses: z.strictObject({ name }),
  feeds: z.strictObject({ name, sourceId: id, busId: id, switchingMode: z.enum(db.FeedSwitchingMode).optional(),
    switchingReference: location, isAllowed: flag }),
  boards: z.strictObject({ name, busId: id, location, nominalVoltageV: positive(9999999.999), phaseConfiguration: phases }),
  circuits: z.strictObject({ name, boardId: id, code: z.string().regex(/^[A-Z0-9][A-Z0-9_-]{0,31}$/),
    priority, phaseConfiguration: phases, ratedCurrentA: positive(9999999.999), protection: metadata,
    isControllable: flag, autoSheddingAllowed: flag }),
  loads: z.strictObject({ name, circuitId: id, zoneId: optionalId, category: z.enum(db.ElectricalLoadCategory),
    priority, ratedPowerW: positive(99999999999.999), isControllable: flag, canBeAutomated: flag,
    minOnSeconds: duration, minOffSeconds: duration, maxInterruptionsPerHour: duration }),
  'metering-points': z.strictObject({ name, deviceId: id, scope: z.enum(db.MeteringScope),
    sourceId: optionalId, feedId: optionalId, boardId: optionalId, circuitId: optionalId, loadId: optionalId,
    unit: z.string().trim().min(1).max(32), measurementMode: z.enum(db.MeasurementMode),
    flowDirection: z.enum(db.MeteringFlowDirection).optional(), location, calibration: metadata }),
  'control-endpoints': z.strictObject({ name, deviceId: id, targetCircuitId: optionalId, targetLoadId: optionalId,
    declaredActions: z.array(z.enum(db.ControlAction)).max(2).refine(actions => new Set(actions).size === actions.length).optional(),
    verificationMethod: z.enum(db.ControlVerificationMethod).optional(), constraints: metadata }),
};
export type Resource = keyof typeof topologySchemas;
