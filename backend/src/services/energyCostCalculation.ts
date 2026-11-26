import { Prisma, type EnergyCurrency } from '@prisma/client';
import { EnergyDecimal, type EnergySegment } from './meteredEnergyService';

type Validity = { id: string; effectiveFrom: Date; effectiveTo: Date | null };
export type Tariff = Validity & { sourceId: string; unit: string; currency: EnergyCurrency; unitPrice: Prisma.Decimal };
export type ExchangeRate = Validity & { rateSource: string; cdfPerUsd: Prisma.Decimal };
type Amounts = { calculated: Prisma.Decimal | null; estimated: Prisma.Decimal | null };

function zero() {
  return new EnergyDecimal(0);
}

function sum(values: Amounts, estimated: boolean, amount: Prisma.Decimal) {
  const field = estimated ? 'estimated' : 'calculated';
  values[field] = (values[field] ?? zero()).plus(amount);
}

function money(amount: Prisma.Decimal | null) {
  return amount?.toFixed(2, EnergyDecimal.ROUND_HALF_UP) ?? null;
}

function output(values: Amounts) {
  return { calculatedAmount: money(values.calculated), estimatedAmount: money(values.estimated) };
}

// Les versions sont triées par date d’effet et sans chevauchement.
function coveringVersion<T extends Validity>(versions: T[], from: Date, to: Date): T | undefined {
  let start = 0;
  let end = versions.length;
  while (start < end) {
    const cursor = Math.floor((start + end) / 2);
    if (versions[cursor].effectiveFrom <= from) start = cursor + 1;
    else end = cursor;
  }
  const found = versions[start - 1];
  return found && (!found.effectiveTo || found.effectiveTo >= to) ? found : undefined;
}

function convert(value: Prisma.Decimal, native: EnergyCurrency, target: EnergyCurrency,
  rates: ExchangeRate[], from: Date, to: Date) {
  if (native === target) return { amount: value, exchangeRate: null };
  const exchangeRate = coveringVersion(rates, from, to);
  if (!exchangeRate) return { amount: null, exchangeRate: null };
  return {
    amount: native === 'USD' ? value.mul(exchangeRate.cdfPerUsd) : value.div(exchangeRate.cdfPerUsd),
    exchangeRate,
  };
}

export function priceEnergy(segments: EnergySegment[], tariffs: Tariff[], rates: ExchangeRate[],
  currency: EnergyCurrency, mode: 'CUMULATIVE' | 'INTERVAL', hasMeasurementGaps: boolean) {
  const byTariffSource = new Map<string, Tariff[]>();
  for (const tariff of tariffs) {
    const versions = byTariffSource.get(tariff.sourceId) ?? [];
    versions.push(tariff);
    byTariffSource.set(tariff.sourceId, versions);
  }

  const totals: Amounts = { calculated: null, estimated: null };
  const bySource = new Map<string | null, Amounts & {
    sourceId: string | null; sourceType: string; measuredKWh: Prisma.Decimal; estimatedKWh: Prisma.Decimal;
    unpricedKWh: Prisma.Decimal; reasons: Set<string>;
  }>();
  const references = new Map<string, { tariff: Tariff; exchangeRate: ExchangeRate | null }>();
  const reasons = new Set<string>();
  if (hasMeasurementGaps) reasons.add('MEASUREMENT_GAPS');
  if (!segments.length) reasons.add('NO_ENERGY_DATA');
  const missing = (group: NonNullable<ReturnType<typeof bySource.get>>, segment: EnergySegment, reason: string) => {
    group.unpricedKWh = group.unpricedKWh.plus(segment.kWh);
    group.reasons.add(reason);
    reasons.add(reason);
  };

  for (const segment of segments) {
    const { sourceId, sourceType, kWh, start, end } = segment;
    const group = bySource.get(sourceId) ?? {
      sourceId, sourceType, measuredKWh: zero(), estimatedKWh: zero(), unpricedKWh: zero(),
      reasons: new Set<string>(), calculated: null, estimated: null,
    };
    bySource.set(sourceId, group);
    const key = segment.estimated ? 'estimatedKWh' : 'measuredKWh';
    group[key] = group[key].plus(kWh);
    if (!sourceId) {
      missing(group, segment, 'SOURCE_UNKNOWN');
      continue;
    }
    if (!start) {
      missing(group, segment, 'INTERVAL_START_UNKNOWN');
      continue;
    }
    const tariff = coveringVersion(byTariffSource.get(sourceId) ?? [], start, end);
    if (!tariff) {
      missing(group, segment, 'TARIFF_NOT_COVERED');
      continue;
    }
    const { amount, exchangeRate } = convert(new EnergyDecimal(kWh).mul(tariff.unitPrice), tariff.currency, currency, rates, start, end);
    if (amount === null) {
      missing(group, segment, 'EXCHANGE_RATE_NOT_COVERED');
      continue;
    }
    references.set(`${tariff.id}:${exchangeRate?.id ?? ''}`, { tariff, exchangeRate });
    // Un delta d’index possède deux bornes. Pour une énergie de période, le relevé précédent fournit une borne estimée.
    const estimated = segment.estimated || mode === 'INTERVAL';
    sum(totals, estimated, amount);
    sum(group, estimated, amount);
  }

  return {
    currency, ...output(totals), hasMissingData: reasons.size > 0, reasons: [...reasons],
    bySource: [...bySource.values()].map(group => ({
      sourceId: group.sourceId, sourceType: group.sourceType,
      measuredKWh: group.measuredKWh.toFixed(), estimatedKWh: group.estimatedKWh.toFixed(),
      unpricedKWh: group.unpricedKWh.toFixed(), ...output(group), reasons: [...group.reasons],
    })),
    references: [...references.values()],
  };
}

type GeneratorEntry = {
  currency: EnergyCurrency; periodFrom: Date; periodTo: Date; fuelLitres: Prisma.Decimal | null;
  fuelQuality: string | null; fuelPricePerLitre: Prisma.Decimal | null; engineHours: Prisma.Decimal | null;
  hoursQuality: string | null; maintenanceCostPerHour: Prisma.Decimal | null;
};

export function priceGenerator(entry: GeneratorEntry, rates: ExchangeRate[], currency: EnergyCurrency) {
  const totals: Amounts = { calculated: null, estimated: null };
  const components = [
    { kind: 'FUEL', quantity: entry.fuelLitres, unit: 'L', price: entry.fuelPricePerLitre, quality: entry.fuelQuality },
    { kind: 'MAINTENANCE', quantity: entry.engineHours, unit: 'H', price: entry.maintenanceCostPerHour, quality: entry.hoursQuality },
  ].map(component => {
    const { kind, quantity, unit, price, quality } = component;
    if (quantity === null || price === null || (quality !== 'MEASURED' && quality !== 'ESTIMATED')) {
      return { kind, unit, quality, nativeAmount: null, amount: null, exchangeRate: null, missing: 'INPUT_MISSING' };
    }
    const nativeAmount = new EnergyDecimal(quantity).mul(price);
    const { amount, exchangeRate } = convert(nativeAmount, entry.currency, currency, rates, entry.periodFrom, entry.periodTo);
    if (amount !== null) sum(totals, quality === 'ESTIMATED', amount);
    return { kind, unit, quality, nativeAmount: money(nativeAmount), amount: money(amount), exchangeRate,
      missing: amount === null ? 'EXCHANGE_RATE_NOT_COVERED' : null };
  });
  return { currency, ...output(totals), hasMissingData: components.some(component => component.missing !== null), components };
}
