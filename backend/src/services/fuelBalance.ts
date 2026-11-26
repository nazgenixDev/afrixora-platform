import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import type { fuelProfile } from '../utils/fuelSchemas';
import { EnergyDecimal } from './meteredEnergyService';

type Profile = z.infer<typeof fuelProfile>;
type Decimal = Prisma.Decimal;
type DecimalValue = string | Decimal;
type Level = { levelMm: DecimalValue; temperatureC: DecimalValue | null; quality: string };
type Delivery = { litresAt20C: DecimalValue; uncertaintyLitres: DecimalValue };
type Range = { min: Decimal; max: Decimal };
const decimal = (value: DecimalValue | number) => new EnergyDecimal(value);
const atReferenceTemperature = (litres: Decimal, temperature: DecimalValue, coefficient: string) =>
  litres.div(decimal(1).plus(decimal(temperature).minus(20).mul(coefficient)));

function levelRange(level: Level, profile: Profile): Range | null {
  const points = profile.points.map(point => ({ height: decimal(point.levelMm), litres: decimal(point.litres) }));
  const first = points[0];
  const last = points[points.length - 1];
  const height = decimal(level.levelMm);
  const { temperatureC } = level;
  if (level.quality !== 'MEASURED' || temperatureC === null || height.lt(first.height) || height.gt(last.height)) return null;
  const volumeAt = (value: Decimal) => {
    if (value.lte(first.height)) return first.litres;
    if (value.gte(last.height)) return last.litres;
    const upper = points.findIndex(point => point.height.gte(value));
    const low = points[upper - 1];
    const high = points[upper];
    return low.litres.plus(value.minus(low.height).mul(high.litres.minus(low.litres)).div(high.height.minus(low.height)));
  };
  const litres = (value: Decimal) => atReferenceTemperature(volumeAt(value), temperatureC, profile.thermalCoefficientPerC);
  return { min: litres(height.minus(profile.noiseMm)), max: litres(height.plus(profile.noiseMm)) };
}

function format(range: Range) {
  return { min: range.min.toFixed(3, EnergyDecimal.ROUND_FLOOR), max: range.max.toFixed(3, EnergyDecimal.ROUND_CEIL) };
}

export function assessFuelBalance(input: {
  start: Level; end: Level; state: 'RUNNING' | 'STOPPED' | 'UNKNOWN';
  productionKWh: Decimal | null; durationMs: number; deliveries: Delivery[]; profile: Profile;
}) {
  const { start, end, state, productionKWh, durationMs, deliveries, profile } = input;
  if (durationMs > profile.maxIntervalMinutes * 60_000) return { status: 'INDETERMINATE', reason: 'INTERVAL_TOO_LONG' } as const;
  if (state === 'UNKNOWN') return { status: 'INDETERMINATE', reason: 'ENGINE_STATE_UNKNOWN' } as const;
  const initial = levelRange(start, profile);
  const final = levelRange(end, profile);
  if (!initial || !final) return { status: 'INDETERMINATE', reason: 'LEVEL_OR_TEMPERATURE_UNUSABLE' } as const;
  if (productionKWh === null) return { status: 'INDETERMINATE', reason: 'PRODUCTION_INCOMPLETE' } as const;
  if (state === 'STOPPED' && productionKWh.gt(0)) return { status: 'INDETERMINATE', reason: 'ENGINE_STATE_CONFLICT' } as const;

  const filled = deliveries.reduce((total, delivery) => ({
    min: total.min.plus(decimal(delivery.litresAt20C).minus(delivery.uncertaintyLitres)),
    max: total.max.plus(decimal(delivery.litresAt20C).plus(delivery.uncertaintyLitres)),
  }), { min: decimal(0), max: decimal(0) });
  const observed = { min: initial.min.plus(filled.min).minus(final.max), max: initial.max.plus(filled.max).minus(final.min) };
  const tolerance = decimal(profile.toleranceLitres);
  const expected = state === 'STOPPED' ? { min: tolerance.neg(), max: tolerance } : {
    min: EnergyDecimal.max(0, productionKWh.mul(profile.minLitresPerKWh)).minus(tolerance),
    max: productionKWh.mul(profile.maxLitresPerKWh)
      .plus(decimal(durationMs).div(3_600_000).mul(profile.maxIdleLitresPerHour)).plus(tolerance),
  };
  const status = observed.min.gt(expected.max) ? 'LOSS_TO_REVIEW'
    : observed.max.lt(expected.min) ? 'SURPLUS_TO_REVIEW' : 'WITHIN_RANGE';
  return {
    status, productionKWh: productionKWh.toFixed(), state,
    initialLitres: format(initial), finalLitres: format(final), deliveredLitres: format(filled),
    observedLitres: format(observed), expectedLitres: format(expected),
  } as const;
}
