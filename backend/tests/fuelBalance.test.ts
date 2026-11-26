import { describe, expect, it } from 'vitest';
import { assessFuelBalance } from '../src/services/fuelBalance';
import { productionForInterval } from '../src/services/fuelService';
import { EnergyDecimal, type MeteredRow } from '../src/services/meteredEnergyService';
import { fuelProfile } from '../src/utils/fuelSchemas';

const profile = {
  points: [{ levelMm: '0', litres: '0' }, { levelMm: '50', litres: '20' }, { levelMm: '100', litres: '120' }],
  noiseMm: '0', toleranceLitres: '1', thermalCoefficientPerC: '0',
  minLitresPerKWh: '0.25', maxLitresPerKWh: '0.4', maxIdleLitresPerHour: '2', maxIntervalMinutes: 90,
};
const level = (levelMm: string, temperatureC: string | null = '20') => ({ levelMm, temperatureC, quality: 'MEASURED' });
const balance = (overrides: Partial<Parameters<typeof assessFuelBalance>[0]> = {}) => assessFuelBalance({
  start: level('90'), end: level('76'), state: 'RUNNING', productionKWh: new EnergyDecimal(80),
  durationMs: 3_600_000, deliveries: [], profile, ...overrides,
});

describe('Bilan du carburant', () => {
  it('compare la variation calibrée à une plage de consommation et conserve les vrais zéros', () => {
    expect(balance()).toMatchObject({ status: 'WITHIN_RANGE', observedLitres: { min: '28.000', max: '28.000' },
      expectedLitres: { min: '19.000', max: '35.000' } });
    expect(balance({ end: level('65') }).status).toBe('LOSS_TO_REVIEW');
    expect(balance({ end: level('90') }).status).toBe('SURPLUS_TO_REVIEW');
    expect(balance({ end: level('90'), state: 'STOPPED', productionKWh: new EnergyDecimal(0) }).status).toBe('WITHIN_RANGE');
  });

  it('intègre la géométrie, le bruit de sonde et la dilatation', () => {
    const corrected = { ...profile, noiseMm: '0.25', thermalCoefficientPerC: '0.001', toleranceLitres: '0' };
    expect(balance({ start: level('90'), end: level('91', '40'), productionKWh: new EnergyDecimal(0), state: 'STOPPED',
      profile: corrected })).toMatchObject({ status: 'WITHIN_RANGE', observedLitres: { min: '-0.991', max: '0.991' } });
    expect(balance({ start: level('90'), end: level('91', '40'), productionKWh: new EnergyDecimal(0), state: 'STOPPED',
      profile: { ...corrected, thermalCoefficientPerC: '0' } }).status).toBe('SURPLUS_TO_REVIEW');
  });

  it('prend en compte les livraisons et leur incertitude', () => {
    const stopped = { end: level('99'), state: 'STOPPED', productionKWh: new EnergyDecimal(0) } as const;
    expect(balance(stopped).status).toBe('SURPLUS_TO_REVIEW');
    expect(balance({ ...stopped, deliveries: [{ litresAt20C: '20', uncertaintyLitres: '2' }] })).toMatchObject({
      status: 'WITHIN_RANGE', deliveredLitres: { min: '18.000', max: '22.000' },
    });
  });

  it('s’abstient sur les données incomplètes ou contradictoires', () => {
    expect(balance({ state: 'UNKNOWN' })).toMatchObject({ reason: 'ENGINE_STATE_UNKNOWN' });
    expect(balance({ end: level('90', null) })).toMatchObject({ reason: 'LEVEL_OR_TEMPERATURE_UNUSABLE' });
    expect(balance({ end: level('101') })).toMatchObject({ reason: 'LEVEL_OR_TEMPERATURE_UNUSABLE' });
    expect(balance({ productionKWh: null })).toMatchObject({ reason: 'PRODUCTION_INCOMPLETE' });
    expect(balance({ state: 'STOPPED' })).toMatchObject({ reason: 'ENGINE_STATE_CONFLICT' });
    expect(balance({ durationMs: 5_460_000 })).toMatchObject({ reason: 'INTERVAL_TOO_LONG' });
    expect(fuelProfile.safeParse({ ...profile, points: [{ levelMm: '2', litres: '1' }, { levelMm: '1', litres: '10' }] }).success).toBe(false);
  });

  it('exige des index de production mesurés, continus et bornés', () => {
    const from = new Date('2026-11-26T07:00:00Z');
    const to = new Date('2026-11-26T08:00:00Z');
    const row = { value: 1000, unit: 'Wh', deviceId: 'device', bootId: 'boot', sequence: 1,
      quality: 'MEASURED', sourceId: null, sourceType: null, feedId: null } as const;
    const start: MeteredRow = { ...row, time: from };
    const end: MeteredRow = { ...row, time: to, value: 1250, sequence: 2 };
    const production = (last: MeteredRow) => productionForInterval([start, last], from, to, 'source', 'device');
    expect(production(end)?.toFixed()).toBe('0.25');
    expect(production({ ...end, value: 1000 })?.toFixed()).toBe('0');
    expect(production({ ...end, value: 500 })).toBeNull();
    expect(production({ ...end, sequence: 3 })).toBeNull();
    expect(production({ ...end, quality: 'ESTIMATED' })).toBeNull();
    expect(production({ ...end, sourceId: 'foreign-source' })).toBeNull();
    expect(production({ ...end, time: new Date(to.getTime() - 1) })).toBeNull();
  });
});
