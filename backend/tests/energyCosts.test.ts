import { describe, expect, it } from 'vitest';
import { EnergyDecimal, meteredEnergySegments, type EnergySegment, type MeteredRow } from '../src/services/meteredEnergyService';
import { priceEnergy, priceGenerator, type ExchangeRate, type Tariff } from '../src/services/energyCostCalculation';
import { generatorInput, tariffInput } from '../src/utils/energyCostSchemas';

const at = (hour: number) => new Date(Date.UTC(2026, 10, 20, hour));
const d = (value: string) => new EnergyDecimal(value);
const tariff = (id: string, from: number, to: number, price: string, currency: 'USD' | 'CDF' = 'USD'): Tariff =>
  ({ id, sourceId: 'reseau', effectiveFrom: at(from), effectiveTo: at(to), unit: 'KWH', currency, unitPrice: d(price) });
const rate = (id: string, from: number, to: number, value: string): ExchangeRate =>
  ({ id, rateSource: 'Source de test', effectiveFrom: at(from), effectiveTo: at(to), cdfPerUsd: d(value) });
const segment = (from: number | null, to: number, kWh: string, options: Partial<EnergySegment> = {}): EnergySegment =>
  ({ start: from === null ? null : at(from), end: at(to), kWh: d(kWh), sourceId: 'reseau',
    sourceType: 'GRID', estimated: false, ...options });

describe('Tarification de l’énergie', () => {
  it('sélectionne chaque tarif et taux daté, puis arrondit les montants après cumul', () => {
    const sourceTariffs = [tariff('t1', 0, 1, '0.005'), tariff('t2', 1, 2, '0.004'), tariff('t3', 2, 4, '8000', 'CDF')];
    const rates = [rate('r1', 0, 1, '2000'), rate('r2', 1, 4, '2500')];
    const segments = [segment(0, 1, '1'), segment(1, 2, '1'), segment(2, 3, '0.5', { estimated: true })];
    const quote = priceEnergy(segments, sourceTariffs, rates, 'USD', 'CUMULATIVE', false);
    expect(quote).toMatchObject({ calculatedAmount: '0.01', estimatedAmount: '1.60', hasMissingData: false });
    expect(quote.references.map(line => [line.tariff.id, line.exchangeRate?.id])).toEqual([['t1', undefined], ['t2', undefined], ['t3', 'r2']]);
    expect(priceEnergy(segments, sourceTariffs, rates, 'CDF', 'CUMULATIVE', false)).toMatchObject({
      calculatedAmount: '20.00', estimatedAmount: '4000.00',
    });
  });

  it('laisse les intervalles ambigus sans prix et conserve les quantités connues et les vrais zéros', () => {
    const result = priceEnergy([
      segment(null, 1, '3'), segment(0, 2, '4'), segment(1, 2, '2'),
      segment(2, 3, '1', { sourceId: null, sourceType: 'UNKNOWN' }),
      segment(0, 1, '0'),
    ], [tariff('t1', 0, 1, '2'), tariff('t2', 1, 4, '2500', 'CDF')], [], 'USD', 'CUMULATIVE', true);
    expect(result).toMatchObject({
      calculatedAmount: '0.00', estimatedAmount: null, hasMissingData: true,
      reasons: ['MEASUREMENT_GAPS', 'INTERVAL_START_UNKNOWN', 'TARIFF_NOT_COVERED', 'EXCHANGE_RATE_NOT_COVERED', 'SOURCE_UNKNOWN'],
      bySource: [{ sourceId: 'reseau', unpricedKWh: '9' }, { sourceId: null, unpricedKWh: '1' }],
    });
    expect(priceEnergy([], [], [], 'USD', 'INTERVAL', true)).toMatchObject({ calculatedAmount: null, estimatedAmount: null });
  });

  it('classe la borne déduite d’un relevé de période comme une estimation', () => {
    const quote = priceEnergy([segment(0, 1, '1.005')], [tariff('t1', 0, 2, '1')], [], 'USD', 'INTERVAL', false);
    expect(quote).toMatchObject({ calculatedAmount: null, estimatedAmount: '1.01' });
  });

  it('produit des deltas décimaux et retire l’attribution au changement d’arrivée', () => {
    const row = (time: number, value: number, id = 'reseau'): MeteredRow => ({
      time: at(time), value, unit: 'kWh', bootId: 'boot', deviceId: 'meter', sequence: time,
      quality: 'MEASURED', sourceId: id, sourceType: 'GRID', feedId: id,
    });
    const { segments, gaps } = meteredEnergySegments([row(0, 0.2), row(1, 0.3), row(2, 0.5, 'groupe')], 'CUMULATIVE');
    expect(gaps).toBe(1);
    expect(segments.map(entry => [entry.kWh.toFixed(), entry.sourceId])).toEqual([['0.1', 'reseau'], ['0.2', null]]);
  });
});

describe('Coût de fonctionnement du groupe', () => {
  const entry = { currency: 'USD', periodFrom: at(0), periodTo: at(2), fuelLitres: d('10.5'),
    fuelPricePerLitre: d('1.25'), fuelQuality: 'MEASURED', engineHours: d('2'),
    hoursQuality: 'ESTIMATED', maintenanceCostPerHour: d('0.25') } as const;

  it('sépare carburant mesuré et entretien estimé avec un taux couvrant la période', () => {
    expect(priceGenerator(entry, [], 'USD')).toMatchObject({ calculatedAmount: '13.13', estimatedAmount: '0.50', hasMissingData: false });
    expect(priceGenerator(entry, [rate('r1', 0, 3, '2000')], 'CDF'))
      .toMatchObject({ calculatedAmount: '26250.00', estimatedAmount: '1000.00', hasMissingData: false });
  });

  it('signale un coût partiel, une qualité absente ou un taux qui change pendant le relevé', () => {
    expect(priceGenerator({ ...entry, fuelPricePerLitre: null }, [], 'USD'))
      .toMatchObject({ calculatedAmount: null, estimatedAmount: '0.50', hasMissingData: true });
    expect(priceGenerator(entry, [rate('r1', 0, 1, '2000'), rate('r2', 1, 2, '2500')], 'CDF'))
      .toMatchObject({ calculatedAmount: null, estimatedAmount: null, hasMissingData: true });
    const uuid = '00000000-0000-4000-8000-000000000001';
    const base = { buildingId: uuid, sourceId: uuid, currency: 'USD', periodFrom: at(0).toISOString(), periodTo: at(2).toISOString() };
    expect(generatorInput.safeParse({ ...base, fuelLitres: '0' }).success).toBe(false);
    expect(generatorInput.safeParse({ ...base, fuelLitres: '0', fuelQuality: 'MEASURED' }).success).toBe(true);
    expect(tariffInput.safeParse({ buildingId: uuid, sourceId: uuid, currency: 'USD', unit: 'KWH',
      unitPrice: 0.1, effectiveFrom: at(0).toISOString() }).success).toBe(false);
  });
});
