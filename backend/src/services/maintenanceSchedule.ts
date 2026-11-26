import type { Prisma } from '@prisma/client';
import { EnergyDecimal } from './meteredEnergyService';

type Hours = Prisma.Decimal;
type Reading = { capturedAt: Date; totalHours: Hours };
const msPerHour = 3_600_000;

export function hoursBetween(from: Date, to: Date) {
  return new EnergyDecimal(to.getTime() - from.getTime()).div(msPerHour);
}

export function validHourProgress(previous: Reading, next: Reading) {
  const delta = new EnergyDecimal(next.totalHours).minus(previous.totalHours);
  // Deux relevés arrondis au millième peuvent introduire un millième d’écart.
  return delta.gte(0) && delta.lte(hoursBetween(previous.capturedAt, next.capturedAt).plus('0.001'));
}

function siteDay(value: Date, zone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(value);
  const part = (type: string) => parts.find(entry => entry.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function maintenanceSchedule(input: {
  startsAt: Date; initialTotalHours: Hours | null; intervalDays: number | null; intervalHours: Hours | null;
  latest: Reading | null; lastService: { performedAt: Date; totalHours: Hours | null } | null;
  timeZone: string; now: Date;
}) {
  const { startsAt, initialTotalHours, intervalDays, intervalHours, latest, lastService, timeZone, now } = input;
  const baselineAt = lastService?.performedAt ?? startsAt;
  const baselineHours = lastService?.totalHours ?? initialTotalHours;
  let dueDate = null;
  if (intervalDays !== null) {
    const day = new Date(siteDay(baselineAt, timeZone) + 'T00:00:00Z');
    day.setUTCDate(day.getUTCDate() + intervalDays);
    dueDate = day.toISOString().slice(0, 10);
  }
  const target = intervalHours && baselineHours ? new EnergyDecimal(baselineHours).plus(intervalHours) : null;
  const reading = latest && latest.capturedAt >= baselineAt ? latest : null;
  const hoursDue = Boolean(target && reading && reading.totalHours.gte(target));
  const calendarDue = dueDate !== null && siteDay(now, timeZone) >= dueDate;
  const needsReading = Boolean(target && !hoursDue && (!reading ||
    new EnergyDecimal(reading.totalHours).plus(hoursBetween(reading.capturedAt, now)).gte(target)));
  const status = now < startsAt ? 'NOT_STARTED'
    : hoursDue || calendarDue ? 'DUE'
      : needsReading ? 'CHECK_HOURS' : 'PLANNED';
  return { status, dueDate, dueTotalHours: target?.toFixed() ?? null, hoursDue, calendarDue, needsReading,
    latestHours: reading?.totalHours.toFixed() ?? null, latestReadingAt: reading?.capturedAt ?? null, timeZone };
}
