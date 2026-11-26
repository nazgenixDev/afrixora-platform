import { describe, expect, it } from 'vitest';
import { EnergyDecimal } from '../src/services/meteredEnergyService';
import { maintenanceSchedule, validHourProgress } from '../src/services/maintenanceSchedule';

const hour = (value: string) => new EnergyDecimal(value);
const date = (value: string) => new Date(value);
const reading = (time: string, value: string) => ({ capturedAt: date(time), totalHours: hour(value) });
const base = {
  startsAt: date('2026-11-25T22:30:00Z'), initialTotalHours: hour('100'), intervalHours: hour('4'), intervalDays: 1,
  latest: reading('2026-11-26T00:30:00Z', '101'),
  lastService: null, timeZone: 'Africa/Lubumbashi', now: date('2026-11-26T01:30:00Z'),
};

describe('Échéancier de maintenance', () => {
  it('compte les jours civils dans le fuseau du bâtiment', () => {
    expect(maintenanceSchedule(base)).toMatchObject({ dueDate: '2026-11-27', dueTotalHours: '104', status: 'PLANNED' });
    expect(maintenanceSchedule({ ...base, timeZone: 'UTC' })).toMatchObject({ dueDate: '2026-11-26', calendarDue: true, status: 'DUE' });
  });

  it('signale une échéance horaire confirmée et la distingue d’un relevé à actualiser', () => {
    const now = date('2026-11-26T05:00:00Z');
    expect(maintenanceSchedule({ ...base, now })).toMatchObject({ status: 'CHECK_HOURS', hoursDue: false, needsReading: true });
    expect(maintenanceSchedule({ ...base, now, latest: reading('2026-11-26T04:30:00Z', '104') }))
      .toMatchObject({ status: 'DUE', hoursDue: true, needsReading: false });
    expect(maintenanceSchedule({ ...base, latest: null })).toMatchObject({ status: 'CHECK_HOURS', latestHours: null });
  });

  it('repart de l’intervention terminée et conserve un index de zéro', () => {
    const performedAt = date('2026-11-26T01:00:00Z');
    expect(maintenanceSchedule({ ...base, lastService: { performedAt, totalHours: hour('0') },
      latest: { capturedAt: performedAt, totalHours: hour('0') } })).toMatchObject({
      status: 'PLANNED', latestHours: '0', dueTotalHours: '4', dueDate: '2026-11-27',
    });
  });

  it('contrôle la progression possible et refuse les remises à zéro', () => {
    const initial = reading('2026-11-26T00:00:00Z', '2');
    expect(validHourProgress(initial, reading('2026-11-26T01:00:00Z', '3.001'))).toBe(true);
    expect(validHourProgress(initial, reading('2026-11-26T01:00:00Z', '3.002'))).toBe(false);
    expect(validHourProgress(initial, reading('2026-11-26T01:00:00Z', '1'))).toBe(false);
    expect(validHourProgress(initial, reading('2026-11-26T01:00:00Z', '2'))).toBe(true);
  });
});
