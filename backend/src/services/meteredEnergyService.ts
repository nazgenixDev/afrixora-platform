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

function toKWh(row: MeteredRow) {
  return row.unit === 'Wh' ? row.value / 1000 : row.value;
}

export function summarizeMeteredEnergy(rows: MeteredRow[], mode: 'CUMULATIVE' | 'INTERVAL', timeZone: string) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const totals = emptyTotals();
  const energyWithoutDay = emptyTotals();
  const byDay = new Map<string, Totals>();
  const bySource = new Map<string | null, Totals & { sourceId: string | null; sourceType: string }>();
  let previous: MeteredRow | undefined;
  let gaps = 0;
  let samples = 0;
  for (const row of rows) {
    const baseline = previous;
    previous = row;
    if (row.quality === 'INVALID') {
      gaps++;
      continue;
    }

    let value = toKWh(row);
    let estimate = row.quality === 'ESTIMATED';
    let hasKnownSource = Boolean(row.sourceId);
    const date = day.format(row.time);
    let sameDate = true;
    if (mode === 'CUMULATIVE') {
      if (!baseline || baseline.quality === 'INVALID' || baseline.bootId !== row.bootId || baseline.deviceId !== row.deviceId ||
          baseline.sequence + 1 !== row.sequence || baseline.time >= row.time || toKWh(baseline) > value) {
        gaps++;
        continue;
      }
      value -= toKWh(baseline);
      estimate ||= baseline.quality === 'ESTIMATED';
      hasKnownSource &&= row.feedId === baseline.feedId && row.sourceId === baseline.sourceId;
      sameDate = day.format(baseline.time) === date;
    } else if (baseline && baseline.deviceId === row.deviceId && baseline.bootId === row.bootId &&
        baseline.sequence + 1 !== row.sequence) {
      gaps++;
    }

    samples++;
    add(totals, estimate, value);
    if (sameDate) {
      const daily = byDay.get(date) ?? emptyTotals();
      add(daily, estimate, value);
      byDay.set(date, daily);
    } else {
      add(energyWithoutDay, estimate, value);
    }

    const sourceId = hasKnownSource ? row.sourceId : null;
    const source = bySource.get(sourceId) ?? {
      ...emptyTotals(), sourceId, sourceType: hasKnownSource ? row.sourceType ?? 'UNKNOWN' : 'UNKNOWN',
    };
    add(source, estimate, value);
    bySource.set(sourceId, source);
  }

  return {
    ...totals,
    samples,
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

export async function getMeteredReadings(actor: SiteActor, input: MeteredQuery) {
  const { buildingId, meteringPointId, from, to, buildingTotal } = input;
  return onSite(actor, buildingId, 'read', async (tx, site) => {
    const point = await tx.meteringPoint.findFirst({ where: { ...site, id: meteringPointId, archivedAt: null },
      select: { scope: true, measurementMode: true, flowDirection: true,
        building: { select: { city: true, timeZone: true } } } });
    if (!point) throw new NotFoundError('Point de mesure introuvable.');
    const timeZone = buildingTimeZone(point.building);
    if (!timeZone) throw new AppError('Renseignez le fuseau horaire du bâtiment.', 409, 'BUILDING_TIME_ZONE_REQUIRED');
    const { measurementMode, flowDirection } = point;
    if (buildingTotal && (point.scope !== 'BOARD' || flowDirection !== 'IMPORT' || measurementMode === 'INSTANTANEOUS')) {
      throw new AppError('Le total du bâtiment exige un compteur d’import sur tableau.', 400, 'INVALID_BUILDING_METER');
    }

    const metric = measurementMode === 'INSTANTANEOUS' ? 'power' : 'energy';
    const rows = await tx.$queryRaw<MeteredRow[]>`
      SELECT r.time, r.value, r.unit, r.device_id::text AS "deviceId",
             r.boot_id::text AS "bootId", r.sequence, r.quality,
             r.source_feed_id::text AS "feedId", r.source_id::text AS "sourceId", r.source_type AS "sourceType"
      FROM public.sensor_readings r
      WHERE r.tenant_id = ${site.tenantId}::uuid
        AND r.metering_point_id = ${meteringPointId}::uuid AND r.metric = ${metric}
        AND r.measurement_mode = ${measurementMode} AND r.time >= ${from} AND r.time < ${to}
      ORDER BY r.time, r.device_id, r.boot_id, r.sequence
      LIMIT ${maxReadings + 1}`;
    if (rows.length > maxReadings) {
      throw new AppError('Trop de relevés pour cette période. Réduisez la plage.', 400, 'METERED_READINGS_LIMIT');
    }
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
