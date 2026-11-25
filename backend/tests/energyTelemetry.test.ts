import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseTelemetry } from '../src/services/energyTelemetry';
import { summarizeMeteredEnergy, type MeteredRow } from '../src/services/meteredEnergyService';
import { buildingTimeZone, validTimeZone } from '../src/utils/buildingTimeZone';
import { connectMQTT } from '../src/services/mqttWorker';

const { handlers, transaction, redis, prisma } = vi.hoisted(() => ({
  handlers: new Map<string, (...args: never[]) => unknown>(),
  transaction: vi.fn(),
  redis: { eval: vi.fn(), set: vi.fn(), scan: vi.fn(), lrange: vi.fn() },
  prisma: { device: { updateMany: vi.fn() } },
}));
vi.mock('mqtt', () => ({ default: { connect: () => ({
  on: (name: string, handler: (...args: never[]) => unknown) => handlers.set(name, handler),
}) } }));
vi.mock('../src/utils/database', () => ({ prisma: { ...prisma, $transaction: transaction } }));
vi.mock('../src/utils/redis', () => ({ getRedisClient: () => redis, isRedisConnected: () => true }));
vi.mock('../src/utils/logger', () => ({ default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('../src/services/automationEngine', () => ({ default: { evaluate: vi.fn() } }));

const scope = {
  tenantId: '00000000-0000-4000-8000-000000000001',
  buildingId: '00000000-0000-4000-8000-000000000002',
  deviceId: '00000000-0000-4000-8000-000000000003',
};
const now = Date.parse('2026-11-25T12:00:00Z');
const sample = {
  schemaVersion: 2, deviceId: scope.deviceId, meteringPointId: '00000000-0000-4000-8000-000000000004',
  capturedAt: new Date(now).toISOString(), metric: 'energy', value: 0, unit: 'Wh',
  measurementMode: 'CUMULATIVE', bootId: '00000000-0000-4000-8000-000000000005',
  sequence: 0, quality: 'MEASURED', origin: 'DEVICE',
} as const;

describe('Contrat de télémétrie V2', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('accepte zéro et refuse les unités, modes, identités, dates et nombres invalides', () => {
    expect(parseTelemetry(sample, scope, now)).toMatchObject({ value: 0 });
    for (const data of [
      { unit: 'kW' }, { value: Infinity }, { value: NaN }, { measurementMode: 'INSTANTANEOUS' },
      { deviceId: scope.buildingId }, { sequence: -1 }, { schemaVersion: 3 }, { tenantId: scope.tenantId },
      { capturedAt: '2026-11-25T12:00:00' }, { capturedAt: '2026-11-25T12:06:00Z' },
      { capturedAt: '2026-11-24T11:59:00Z' },
    ]) expect(parseTelemetry({ ...sample, ...data }, scope, now)).toBeUndefined();
  });

  it('contrôle le message MQTT puis remet la même mesure en attente après une panne SQL', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    transaction.mockRejectedValueOnce(new Error('Base inaccessible'));
    redis.eval.mockResolvedValueOnce([]);
    connectMQTT({} as Parameters<typeof connectMQTT>[0]);
    const message = handlers.get('message') as (topic: string, payload: Buffer, packet?: { retain: boolean }) => Promise<void>;
    const topic = `afrixora/${scope.tenantId}/${scope.buildingId}/devices/${scope.deviceId}/readings`;
    await message(topic, Buffer.from(JSON.stringify({ ...sample, unit: 'kW' })));
    await message(topic, Buffer.from(JSON.stringify(sample)), { retain: true });
    expect(transaction).not.toHaveBeenCalled();

    await message(topic, Buffer.from(JSON.stringify(sample)));
    expect(transaction).toHaveBeenCalledTimes(1);
    const buffered = redis.eval.mock.calls[0][3] as string;
    expect(JSON.parse(buffered)).toMatchObject({ telemetry: sample, telemetryReceivedAt: now });
    const execute = vi.fn().mockResolvedValue(0);
    const read = vi.fn().mockResolvedValue([{ exists: true }]);
    transaction.mockImplementationOnce(work => work({ $executeRaw: execute, $queryRaw: read }));
    redis.set.mockResolvedValueOnce('OK');
    redis.scan.mockResolvedValueOnce(['0', [`mqtt_buffer:${scope.tenantId}`]]);
    redis.lrange.mockResolvedValueOnce([buffered]);
    redis.eval.mockResolvedValue(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledTimes(1);
    expect(redis.eval.mock.calls.some(([script]) => String(script).includes('LREM'))).toBe(true);
  });
});

function row(sequence: number, value: number, fields: Partial<MeteredRow> = {}): MeteredRow {
  return {
    time: new Date(now + sequence * 60_000), sequence, value, unit: 'kWh',
    deviceId: scope.deviceId, bootId: sample.bootId, quality: 'MEASURED',
    feedId: 'feed', sourceId: 'source', sourceType: 'PV_INVERTER', ...fields,
  };
}

describe('Calcul énergétique', () => {
  it('calcule les deltas, écarte le reset et isole le delta lors d’un changement de source', () => {
    const result = summarizeMeteredEnergy([
      row(0, 0), row(1, 60), row(2, 100_000, { unit: 'Wh', feedId: 'batterie', sourceId: 'batterie', sourceType: 'BATTERY_INVERTER' }),
      row(3, 0), row(4, 2, { quality: 'ESTIMATED' }), row(6, 5),
    ], 'CUMULATIVE', 'Africa/Lubumbashi');
    expect(result).toMatchObject({ measuredKWh: 100, estimatedKWh: 2, gaps: 3, samples: 3 });
    expect(result.bySource).toEqual([
      { sourceId: 'source', sourceType: 'PV_INVERTER', measuredKWh: 60, estimatedKWh: 2 },
      { sourceId: null, sourceType: 'UNKNOWN', measuredKWh: 40, estimatedKWh: null },
    ]);
  });

  it('distingue une série absente de zéro et les dates locales des bâtiments', () => {
    expect(summarizeMeteredEnergy([], 'INTERVAL', 'Africa/Lubumbashi').measuredKWh).toBeNull();
    const sample = row(0, 0, { time: new Date('2026-11-25T22:30:00Z') });
    expect(summarizeMeteredEnergy([sample], 'INTERVAL', 'Africa/Lubumbashi').byDay[0])
      .toMatchObject({ date: '2026-11-26', measuredKWh: 0 });
    expect(summarizeMeteredEnergy([sample], 'INTERVAL', 'Africa/Kinshasa').byDay[0]?.date).toBe('2026-11-25');
    expect(buildingTimeZone({ city: 'Lubumbashi', timeZone: null })).toBe('Africa/Lubumbashi');
    expect(buildingTimeZone({ city: 'Site fictif', timeZone: null })).toBeNull();
    expect(validTimeZone('+02:00')).toBe(false);
  });
});
