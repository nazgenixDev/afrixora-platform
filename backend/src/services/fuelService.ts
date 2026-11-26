import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { AppError, NotFoundError } from '../utils/errors';
import { fuelProfile, type assessmentInput, type calibrationInput, type deliveryInput,
  type fuelTankInput, type levelInput } from '../utils/fuelSchemas';
import { onSite } from './energyTopologyService';
import { assessFuelBalance } from './fuelBalance';
import { EnergyDecimal, meteredEnergySegments, readMeteredRows, type MeteredRow } from './meteredEnergyService';

type Tx = Prisma.TransactionClient;
type Actor = Parameters<typeof onSite>[0];
type Site = { tenantId: string; buildingId: string };
type Page = { page: number; limit: number };
type TankQuery = { buildingId: string; tankId: string };

async function pageOf<T>(query: Page, find: (paging: { skip: number; take: number }) => Promise<T[]>, count: () => Promise<number>) {
  const { page, limit } = query;
  const [data, total] = await Promise.all([find({ skip: (page - 1) * limit, take: limit }), count()]);
  return { data, page, total, totalPages: Math.ceil(total / limit) };
}

async function requireTank(tx: Tx, site: Site, tankId: string) {
  const tank = await tx.fuelTank.findFirst({ where: { ...site, id: tankId } });
  if (!tank) throw new NotFoundError('Cuve de carburant introuvable.');
  return tank;
}

export function addTank(actor: Actor, { buildingId, ...input }: z.infer<typeof fuelTankInput>) {
  return onSite(actor, buildingId, 'write', async (tx, site) => {
    const { sourceId, probeDeviceId, productionPointId } = input;
    const [source, probe, meter] = await Promise.all([
      tx.energySource.findFirst({ where: { ...site, id: sourceId, archivedAt: null } }),
      tx.device.findFirst({ where: { ...site, id: probeDeviceId } }),
      tx.meteringPoint.findFirst({ where: { ...site, id: productionPointId, archivedAt: null } }),
    ]);
    if (!source || !probe || !meter) throw new NotFoundError('Référence active introuvable dans ce bâtiment.');
    if (source.type !== 'GENERATOR' || probe.type !== 'SENSOR' || meter.scope !== 'SOURCE' ||
        meter.sourceId !== sourceId || meter.flowDirection !== 'EXPORT' || meter.measurementMode !== 'CUMULATIVE') {
      throw new AppError('Une cuve exige un groupe, une sonde et son compteur cumulatif de production.', 400, 'INVALID_FUEL_TOPOLOGY');
    }
    return tx.fuelTank.create({ data: { ...site, ...input } });
  });
}

export function listTanks(actor: Actor, query: Page & { buildingId: string }) {
  return onSite(actor, query.buildingId, 'read', (tx, site) => pageOf(query,
    paging => tx.fuelTank.findMany({ where: site, ...paging, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
    () => tx.fuelTank.count({ where: site })));
}

export function addCalibration(actor: Actor, { buildingId, ...input }: z.infer<typeof calibrationInput>) {
  return onSite(actor, buildingId, 'write', async (tx, site) => {
    await requireTank(tx, site, input.tankId);
    const where = { ...site, tankId: input.tankId };
    const [latestVersion, latestReading] = await Promise.all([
      tx.fuelCalibration.findFirst({ where, orderBy: { effectiveFrom: 'desc' }, select: { effectiveFrom: true } }),
      tx.fuelLevelReading.findFirst({ where, orderBy: { capturedAt: 'desc' }, select: { capturedAt: true } }),
    ]);
    if ((latestVersion && input.effectiveFrom <= latestVersion.effectiveFrom) ||
        (latestReading && input.effectiveFrom <= latestReading.capturedAt)) {
      throw new AppError('La calibration doit suivre les versions et relevés déjà enregistrés.', 409, 'FUEL_CALIBRATION_CONFLICT');
    }
    return tx.fuelCalibration.create({ data: { ...site, ...input } });
  });
}

export function addLevel(actor: Actor, { buildingId, ...input }: z.infer<typeof levelInput>) {
  return onSite(actor, buildingId, 'write', async (tx, site) => {
    await requireTank(tx, site, input.tankId);
    const calibration = await tx.fuelCalibration.findFirst({
      where: { ...site, tankId: input.tankId, effectiveFrom: { lte: input.capturedAt } }, orderBy: { effectiveFrom: 'desc' },
      select: { id: true },
    });
    if (!calibration) throw new AppError('Aucune calibration applicable au relevé.', 409, 'FUEL_CALIBRATION_MISSING');
    return tx.fuelLevelReading.create({ data: { ...site, ...input, calibrationId: calibration.id } });
  });
}

export function addDelivery(actor: Actor, { buildingId, ...input }: z.infer<typeof deliveryInput>) {
  return onSite(actor, buildingId, 'write', async (tx, site) => {
    await requireTank(tx, site, input.tankId);
    return tx.fuelDelivery.create({ data: { ...site, ...input } });
  });
}

type History = 'calibrations' | 'readings' | 'deliveries' | 'assessments';
export function listFuelHistory(actor: Actor, query: TankQuery & Page, history: History) {
  return onSite<unknown>(actor, query.buildingId, 'read', async (tx, site) => {
    await requireTank(tx, site, query.tankId);
    const where = { ...site, tankId: query.tankId };
    switch (history) {
      case 'calibrations': return pageOf(query, paging => tx.fuelCalibration.findMany({ where, ...paging, orderBy: { effectiveFrom: 'desc' } }),
        () => tx.fuelCalibration.count({ where }));
      case 'readings': return pageOf(query, paging => tx.fuelLevelReading.findMany({ where, ...paging, orderBy: { capturedAt: 'desc' } }),
        () => tx.fuelLevelReading.count({ where }));
      case 'deliveries': return pageOf(query, paging => tx.fuelDelivery.findMany({ where, ...paging,
        orderBy: [{ deliveredAt: 'desc' }, { id: 'desc' }] }), () => tx.fuelDelivery.count({ where }));
      case 'assessments': return pageOf(query, paging => tx.fuelAssessment.findMany({ where, ...paging,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }), () => tx.fuelAssessment.count({ where }));
    }
  });
}

export function productionForInterval(rows: MeteredRow[], from: Date, to: Date, sourceId: string, deviceId: string) {
  const { segments, gaps } = meteredEnergySegments(rows, 'CUMULATIVE');
  if (gaps !== 1 || rows[0]?.time.getTime() !== from.getTime() || rows[rows.length - 1]?.time.getTime() !== to.getTime() ||
      rows.some(row => row.quality !== 'MEASURED' || row.deviceId !== deviceId || (row.sourceId !== null && row.sourceId !== sourceId))) return null;
  // Le compteur SOURCE est dédié au groupe. Une arrivée n’est pas nécessaire pour lui attribuer la production.
  return segments.reduce((total, segment) => total.plus(segment.kWh), new EnergyDecimal(0));
}

function indeterminate(reason: string) {
  return { status: 'INDETERMINATE', reason, report: null } as const;
}

export function evaluateFuel(actor: Actor, input: z.infer<typeof assessmentInput>, publish: boolean) {
  const { buildingId, tankId, from, to } = input;
  return onSite(actor, buildingId, publish ? 'write' : 'read', async (tx, site) => {
    const tank = await requireTank(tx, site, tankId);
    const where = { ...site, tankId };
    const readings = await tx.fuelLevelReading.findMany({ where: { ...where, capturedAt: { gte: from, lte: to } },
      include: { calibration: { select: { profile: true } } }, orderBy: { capturedAt: 'asc' }, take: 3 });
    const [start, end] = readings;
    if (readings.length !== 2 || start.capturedAt.getTime() !== from.getTime() || end.capturedAt.getTime() !== to.getTime()) {
      return indeterminate('CONSECUTIVE_LEVELS_REQUIRED');
    }
    if (start.calibrationId !== end.calibrationId) return indeterminate('CALIBRATION_CHANGED');

    const meter = await tx.meteringPoint.findFirst({
      where: { ...site, id: tank.productionPointId, sourceId: tank.sourceId, scope: 'SOURCE', flowDirection: 'EXPORT',
        measurementMode: 'CUMULATIVE', archivedAt: null, source: { archivedAt: null, type: 'GENERATOR' } },
      select: { deviceId: true },
    });
    if (!meter) return indeterminate('PRODUCTION_METER_UNAVAILABLE');

    const [rows, deliveries] = await Promise.all([
      readMeteredRows(tx, site, tank.productionPointId, 'CUMULATIVE', from, to, true),
      tx.fuelDelivery.findMany({ where: { ...where, deliveredAt: { gt: from, lte: to } },
        orderBy: [{ deliveredAt: 'asc' }, { id: 'asc' }], take: 1001 }),
    ]);
    if (deliveries.length > 1000) return indeterminate('TOO_MANY_DELIVERIES');
    const result = assessFuelBalance({ start, end, state: end.intervalState, profile: fuelProfile.parse(start.calibration.profile),
      productionKWh: productionForInterval(rows, from, to, tank.sourceId, meter.deviceId), durationMs: to.getTime() - from.getTime(), deliveries });
    if (result.status === 'INDETERMINATE') return indeterminate(result.reason);
    const evidence = { ...result, startReadingId: start.id, endReadingId: end.id, calibrationId: start.calibrationId,
      productionPointId: tank.productionPointId, deliveryIds: deliveries.map(delivery => delivery.id) };
    if (!publish) return { ...evidence, report: null };

    const period = { ...where, periodFrom: from, periodTo: to };
    const evidenceHash = createHash('sha256').update(JSON.stringify(evidence)).digest('hex');
    const existing = await tx.fuelAssessment.findFirst({ where: { ...period, evidenceHash } });
    if (existing) return { ...evidence, report: existing };
    const previous = await tx.fuelAssessment.findFirst({ where: { ...period, alertId: { not: null } }, select: { alertId: true } });
    let alertId: string | undefined;
    if (result.status === 'WITHIN_RANGE') {
      if (previous?.alertId) await tx.alert.updateMany({
        where: { ...site, id: previous.alertId, resolvedAt: null }, data: { resolvedAt: new Date() },
      });
    } else {
      alertId = previous?.alertId ?? (await tx.alert.create({ data: { ...site, deviceId: tank.probeDeviceId,
        type: 'FUEL_DISCREPANCY', severity: 'WARNING', message: 'Écart de carburant à vérifier.',
        metadata: { tankId, from: from.toISOString(), to: to.toISOString() },
      }, select: { id: true } })).id;
      if (previous?.alertId) await tx.alert.updateMany({
        where: { ...site, id: previous.alertId, resolvedAt: { not: null } }, data: { resolvedAt: null, isRead: false },
      });
    }
    const report = await tx.fuelAssessment.create({ data: { ...period, status: result.status, evidence, evidenceHash, alertId } });
    return { ...evidence, report };
  });
}
