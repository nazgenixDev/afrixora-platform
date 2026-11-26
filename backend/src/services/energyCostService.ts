import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AppError, NotFoundError } from '../utils/errors';
import type { energyCostQuery, tariffInput, exchangeRateInput, generatorInput, generatorQuery } from '../utils/energyCostSchemas';
import { onSite } from './energyTopologyService';
import { findMeteringPoint, meteredEnergySegments, readMeteredRows } from './meteredEnergyService';
import { priceEnergy, priceGenerator } from './energyCostCalculation';

type Tx = Prisma.TransactionClient;
type Actor = Parameters<typeof onSite>[0];
type Site = { tenantId: string; buildingId: string };
type Pagination = { page: number; limit: number };

function overlapping(effectiveFrom: Date, effectiveTo?: Date) {
  return {
    effectiveFrom: effectiveTo ? { lt: effectiveTo } : undefined,
    OR: [{ effectiveTo: null }, { effectiveTo: { gt: effectiveFrom } }],
  };
}

function previousOpen<T extends { id: string; effectiveFrom: Date; effectiveTo: Date | null }>(matches: T[], start: Date) {
  if (!matches.length) return undefined;
  if (matches.length === 1 && matches[0].effectiveTo === null && matches[0].effectiveFrom < start) return matches[0];
  throw new AppError('Une version couvre déjà cette période.', 409, 'ENERGY_COST_PERIOD_CONFLICT');
}

async function requireSource(tx: Tx, site: Site, id: string, active = false) {
  const source = await tx.energySource.findFirst({ where: { ...site, id, ...(active ? { archivedAt: null } : {}) },
    select: { type: true } });
  if (!source) throw new NotFoundError('Source énergétique introuvable.');
  return source;
}

function paging({ page, limit }: Pagination) {
  return { skip: (page - 1) * limit, take: limit };
}

function pageOf<T>(data: T[], total: number, { page, limit }: Pagination) {
  return { data, total, page, totalPages: Math.ceil(total / limit) };
}

export function addEnergyTariff(actor: Actor, input: z.infer<typeof tariffInput>) {
  return onSite(actor, input.buildingId, 'write', async (tx, site) => {
    const { sourceId, effectiveFrom, effectiveTo, unitPrice, currency, unit } = input;
    await requireSource(tx, site, sourceId, true);
    const where = { ...site, sourceId };
    const previous = previousOpen(await tx.energyTariff.findMany({
      where: { ...where, ...overlapping(effectiveFrom, effectiveTo) }, take: 2,
    }), effectiveFrom);
    if (previous) await tx.energyTariff.update({ where: { ...where, id: previous.id }, data: { effectiveTo: effectiveFrom } });
    return tx.energyTariff.create({ data: { ...where, unit, unitPrice, currency, effectiveFrom, effectiveTo } });
  });
}

export function addEnergyExchangeRate(actor: Actor, input: z.infer<typeof exchangeRateInput>) {
  return onSite(actor, input.buildingId, 'write', async (tx, site) => {
    const { cdfPerUsd, rateSource, effectiveFrom, effectiveTo } = input;
    const previous = previousOpen(await tx.energyExchangeRate.findMany({
      where: { ...site, ...overlapping(effectiveFrom, effectiveTo) }, take: 2,
    }), effectiveFrom);
    if (previous) await tx.energyExchangeRate.update({ where: { ...site, id: previous.id }, data: { effectiveTo: effectiveFrom } });
    return tx.energyExchangeRate.create({ data: { ...site, cdfPerUsd, rateSource, effectiveFrom, effectiveTo } });
  });
}

export function listEnergyTariffs(actor: Actor, query: Pagination & { buildingId: string; sourceId: string }) {
  return onSite(actor, query.buildingId, 'read', async (tx, site) => {
    await requireSource(tx, site, query.sourceId);
    const where = { ...site, sourceId: query.sourceId };
    const [data, total] = await Promise.all([
      tx.energyTariff.findMany({ where, orderBy: { effectiveFrom: 'desc' }, ...paging(query) }),
      tx.energyTariff.count({ where }),
    ]);
    return pageOf(data, total, query);
  });
}

export function listEnergyExchangeRates(actor: Actor, query: Pagination & { buildingId: string }) {
  return onSite(actor, query.buildingId, 'read', async (tx, site) => {
    const [data, total] = await Promise.all([
      tx.energyExchangeRate.findMany({ where: site, orderBy: { effectiveFrom: 'desc' }, ...paging(query) }),
      tx.energyExchangeRate.count({ where: site }),
    ]);
    return pageOf(data, total, query);
  });
}

export function calculateEnergyCosts(actor: Actor, input: z.infer<typeof energyCostQuery>) {
  const { buildingId, meteringPointId, from, to, currency } = input;
  return onSite(actor, buildingId, 'read', async (tx, site) => {
    const point = await findMeteringPoint(tx, site, meteringPointId);
    if (point.scope !== 'BOARD' || point.flowDirection !== 'IMPORT' || point.measurementMode === 'INSTANTANEOUS') {
      throw new AppError('Choisissez un point d’import sur tableau couvrant le bâtiment.', 400, 'INVALID_BUILDING_METER');
    }
    const rows = await readMeteredRows(tx, site, meteringPointId, point.measurementMode, from, to, true);
    const { segments, gaps } = meteredEnergySegments(rows, point.measurementMode);
    const sourceIds = [...new Set(segments.flatMap(segment => segment.sourceId ? [segment.sourceId] : []))];
    const versions = overlapping(from, to);
    const [tariffs, rates] = await Promise.all([
      tx.energyTariff.findMany({ where: { ...site, sourceId: { in: sourceIds }, ...versions }, orderBy: { effectiveFrom: 'asc' } }),
      tx.energyExchangeRate.findMany({ where: { ...site, ...versions }, orderBy: { effectiveFrom: 'asc' } }),
    ]);
    const baseline = point.measurementMode === 'CUMULATIVE' ? 1 : 0;
    const missing = gaps > baseline || rows[0]?.time.getTime() !== from.getTime() ||
      rows[rows.length - 1]?.time.getTime() !== to.getTime();
    return { buildingId, meteringPointId, from, to, ...priceEnergy(segments, tariffs, rates, currency, point.measurementMode, missing) };
  });
}

async function requireGenerator(tx: Tx, site: Site, sourceId: string, active = false) {
  if ((await requireSource(tx, site, sourceId, active)).type !== 'GENERATOR') {
    throw new AppError('La source doit être un groupe électrogène.', 400, 'SOURCE_NOT_GENERATOR');
  }
}

export function addGeneratorCost(actor: Actor, input: z.infer<typeof generatorInput>) {
  const { buildingId, ...entry } = input;
  return onSite(actor, buildingId, 'write', async (tx, site) => {
    await requireGenerator(tx, site, entry.sourceId, true);
    if (await tx.generatorOperatingCost.findFirst({
      where: { ...site, sourceId: entry.sourceId, periodFrom: { lt: entry.periodTo }, periodTo: { gt: entry.periodFrom } },
      select: { id: true },
    })) throw new AppError('Un relevé du groupe couvre déjà cette période.', 409, 'ENERGY_COST_PERIOD_CONFLICT');
    return tx.generatorOperatingCost.create({ data: { ...site, ...entry } });
  });
}

export function listGeneratorCosts(actor: Actor, query: z.infer<typeof generatorQuery>) {
  const { buildingId, sourceId, from, to, currency } = query;
  return onSite(actor, buildingId, 'read', async (tx, site) => {
    await requireGenerator(tx, site, sourceId);
    const where = { ...site, sourceId, periodFrom: { gte: from }, periodTo: { lte: to } };
    const [entries, total, rates] = await Promise.all([
      tx.generatorOperatingCost.findMany({ where, orderBy: { periodFrom: 'desc' }, ...paging(query) }),
      tx.generatorOperatingCost.count({ where }),
      tx.energyExchangeRate.findMany({ where: { ...site, ...overlapping(from, to) }, orderBy: { effectiveFrom: 'asc' } }),
    ]);
    return pageOf(entries.map(entry => ({ entry, quote: priceGenerator(entry, rates, currency) })), total, query);
  });
}
