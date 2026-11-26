import { Prisma } from '@prisma/client';
import { AppError, NotFoundError } from '../utils/errors';
import { buildingTimeZone } from '../utils/buildingTimeZone';
import { onSite } from './energyTopologyService';

export type MeteredRow = {
  time: Date;
  value: number;
  unit: string;
  deviceId: string;
  bootId: string;
  sequence: number;
  quality: 'MEASURED' | 'ESTIMATED' | 'INVALID';
  feedId: string | null;
  sourceId: string | null;
  sourceType: string | null;
};

type Totals = { measuredKWh: number | null; estimatedKWh: number | null };

function emptyTotals(): Totals {
  return { measuredKWh: null, estimatedKWh: null };
}

function add(totals: Totals, estimate: boolean, kWh: number) {
  const key = estimate ? 'estimatedKWh' : 'measuredKWh';
  totals[key] = (totals[key] ?? 0) + kWh;
}

export const EnergyDecimal = Prisma.Decimal.clone({ precision: 50 });
type EnergyMode = 'CUMULATIVE' | 'INTERVAL';
export type EnergySegment = {
  start: Date | null; end: Date; kWh: Prisma.Decimal; estimated: boolean; sourceId: string | null; sourceType: string;
};

function toKWh(row: MeteredRow) {
  const value = new EnergyDecimal(row.value);
  return row.unit === 'Wh' ? value.div(1000) : value;
}

export function meteredEnergySegments(rows: MeteredRow[], mode: EnergyMode) {
  const segments: EnergySegment[] = [];
  let previous: MeteredRow | undefined;
  let gaps = 0;
  for (const row of rows) {
    const baseline = previous;
    previous = row;
    if (row.quality === 'INVALID' || !Number.isFinite(row.value) || row.value < 0 || !['Wh', 'kWh'].includes(row.unit)) {
      previous = { ...row, quality: 'INVALID' };
      gaps++;
      continue;
    }

    let kWh = toKWh(row);
    let estimated = row.quality === 'ESTIMATED';
    let sourceId = row.sourceId;
    const sameStream = baseline && baseline.bootId === row.bootId && baseline.deviceId === row.deviceId;
    const continuous = sameStream && baseline.quality !== 'INVALID' && baseline.sequence + 1 === row.sequence &&
      baseline.time < row.time;
    if (mode === 'CUMULATIVE') {
      if (!continuous || toKWh(baseline).gt(kWh)) {
        gaps++;
        continue;
      }
      kWh = kWh.minus(toKWh(baseline));
      estimated ||= baseline.quality === 'ESTIMATED';
      if (row.feedId !== baseline.feedId || row.sourceId !== baseline.sourceId) sourceId = null;
    } else if (sameStream && baseline.sequence + 1 !== row.sequence) {
      gaps++;
    }
    segments.push({ start: continuous ? baseline.time : null, end: row.time, kWh, estimated, sourceId,
      sourceType: sourceId ? row.sourceType ?? 'UNKNOWN' : 'UNKNOWN' });
  }
  return { segments, gaps };
}

export function summarizeMeteredEnergy(rows: MeteredRow[], mode: EnergyMode, timeZone: string) {
  const { segments, gaps } = meteredEnergySegments(rows, mode);
  const day = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const totals = emptyTotals();
  const energyWithoutDay = emptyTotals();
  const byDay = new Map<string, Totals>();
  const bySource = new Map<string | null, Totals & { sourceId: string | null; sourceType: string }>();

  for (const { start, end, kWh, estimated, sourceId, sourceType } of segments) {
    const date = day.format(end);
    const value = kWh.toNumber();
    add(totals, estimated, value);
    if (mode === 'INTERVAL' || (start && day.format(start) === date)) {
      const daily = byDay.get(date) ?? emptyTotals();
      add(daily, estimated, value);
      byDay.set(date, daily);
    } else {
      add(energyWithoutDay, estimated, value);
    }
    const source = bySource.get(sourceId) ?? { ...emptyTotals(), sourceId, sourceType };
    add(source, estimated, value);
    bySource.set(sourceId, source);
  }

  return {
    ...totals,
    samples: segments.length,
    gaps,
    energyWithoutDay,
    byDay: [...byDay].map(([date, values]) => ({ date, ...values })),
    bySource: [...bySource.values()],
  };
}

type SiteActor = Parameters<typeof onSite>[0];
type MeteredQuery = {
  buildingId: string;
  meteringPointId: string;
  from: Date;
  to: Date;
  buildingTotal: boolean;
};
const maxReadings = 50_000;

type MeteredSite = { tenantId: string; buildingId: string };

export async function findMeteringPoint(tx: Prisma.TransactionClient, site: MeteredSite, id: string) {
  const point = await tx.meteringPoint.findFirst({ where: { ...site, id, archivedAt: null },
    select: { scope: true, measurementMode: true, flowDirection: true,
      building: { select: { city: true, timeZone: true } } } });
  if (!point) throw new NotFoundError('Point de mesure introuvable.');
  return point;
}

export async function readMeteredRows(tx: Prisma.TransactionClient, site: MeteredSite, meteringPointId: string,
  measurementMode: EnergyMode | 'INSTANTANEOUS', from: Date, to: Date, includeEnd = false) {
  const metric = measurementMode === 'INSTANTANEOUS' ? 'power' : 'energy';
  const upperBound = includeEnd ? Prisma.sql`r.time <= ${to}` : Prisma.sql`r.time < ${to}`;
  const rows = await tx.$queryRaw<MeteredRow[]>`
    SELECT r.time, r.value, r.unit, r.device_id::text AS "deviceId",
           r.boot_id::text AS "bootId", r.sequence, r.quality,
           r.source_feed_id::text AS "feedId", r.source_id::text AS "sourceId", r.source_type AS "sourceType"
    FROM public.sensor_readings r
    WHERE r.tenant_id = ${site.tenantId}::uuid AND r.metering_point_id = ${meteringPointId}::uuid
      AND r.metric = ${metric} AND r.measurement_mode = ${measurementMode}
      AND r.time >= ${from} AND ${upperBound}
    ORDER BY r.time, r.device_id, r.boot_id, r.sequence
    LIMIT ${maxReadings + 1}`;
  if (rows.length > maxReadings) {
    throw new AppError('Trop de relevés pour cette période. Réduisez la plage.', 400, 'METERED_READINGS_LIMIT');
  }
  return rows;
}

export async function getMeteredReadings(actor: SiteActor, input: MeteredQuery) {
  const { buildingId, meteringPointId, from, to, buildingTotal } = input;
  return onSite(actor, buildingId, 'read', async (tx, site) => {
    const point = await findMeteringPoint(tx, site, meteringPointId);
    const timeZone = buildingTimeZone(point.building);
    if (!timeZone) throw new AppError('Renseignez le fuseau horaire du bâtiment.', 409, 'BUILDING_TIME_ZONE_REQUIRED');
    const { measurementMode, flowDirection } = point;
    if (buildingTotal && (point.scope !== 'BOARD' || flowDirection !== 'IMPORT' || measurementMode === 'INSTANTANEOUS')) {
      throw new AppError('Le total du bâtiment exige un compteur d’import sur tableau.', 400, 'INVALID_BUILDING_METER');
    }

    const rows = await readMeteredRows(tx, site, meteringPointId, measurementMode, from, to);
    const context = { meteringPointId, measurementMode, flowDirection, timeZone, buildingTotal, from, to };
    if (measurementMode === 'INSTANTANEOUS') {
      const latest = rows.reverse().find(row => row.quality !== 'INVALID');
      return { ...context, latestPower: latest ? {
        valueW: latest.unit === 'kW' ? latest.value * 1000 : latest.value,
        time: latest.time,
        quality: latest.quality,
      } : null };
    }
    return { ...context, ...summarizeMeteredEnergy(rows, measurementMode, timeZone) };
  });
}
