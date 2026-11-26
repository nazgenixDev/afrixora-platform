import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseTelemetry } from '../src/services/energyTelemetry';
import { summarizeMeteredEnergy, type MeteredRow } from '../src/services/meteredEnergyService';
import { buildingTimeZone, validTimeZone } from '../src/utils/buildingTimeZone';
import { connectMQTT } from '../src/services/mqttWorker';

const { handlers, transaction, redis, prisma, transport } = vi.hoisted(() => ({
  handlers: new Map<string, (...args: never[]) => unknown>(),
  transaction: vi.fn(),
  redis: { eval: vi.fn(), set: vi.fn(), scan: vi.fn(), lrange: vi.fn() },
  prisma: { device: { updateMany: vi.fn(), findFirst: vi.fn() } },
  transport: { publish: vi.fn(), removeOutgoingMessage: vi.fn(), getLastMessageId: vi.fn(() => 1) },
}));
vi.mock('mqtt', () => ({ default: { connect: () => ({
  connected: true, ...transport,
  subscribe: (topics: string[], _options: unknown, reply: (error: null, grants: { qos: number }[]) => void) =>
    reply(null, topics.map(() => ({ qos: 1 }))),
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
  it('reprend après perte de l’ACK et distingue résultats partiels, conflits et horloge incorrecte', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const base = `afrixora/${scope.tenantId}/${scope.buildingId}/devices/${scope.deviceId}`;
    const id = (position: number) => `00000000-0000-4000-8000-${String(position).padStart(12, '0')}`;
    const item = (position: number, overrides: Partial<typeof sample> | { capturedAt: string } = {}) =>
      ({ itemId: id(position), sample: { ...sample, sequence: position, ...overrides } });
    const batch = (items: unknown[]) => Buffer.from(JSON.stringify({ type: 'telemetry_batch', schemaVersion: 2, batchId: id(99), items }));
    connectMQTT({} as Parameters<typeof connectMQTT>[0]);
    const onConnect = handlers.get('connect') as () => void;
    const message = handlers.get('message') as (topic: string, payload: Buffer, packet?: { retain: boolean }) => Promise<void>;
    const onClose = handlers.get('close') as () => void;
    onConnect();
    // Le paquet MQTT sortant est mis en attente, puis la connexion tombe avant son PUBACK.
    transport.publish.mockImplementationOnce((_topic, _payload, options) => { options.cbStorePut(); onClose(); });
    transport.publish.mockImplementationOnce((_topic, _payload, options, done) => { options.cbStorePut(); done(); });
    prisma.device.findFirst.mockResolvedValue({ id: scope.deviceId });
    const execute = vi.fn().mockResolvedValue(1);
    const lookup = vi.fn().mockResolvedValueOnce([{ exists: false }]);
    transaction.mockImplementationOnce(work => work({ $executeRaw: execute, $queryRaw: lookup }));
    await message(base + '/readings', batch([item(10)]), { retain: true });
    expect(transaction).not.toHaveBeenCalled();
    await message(base + '/readings', batch([item(10)]));
    expect(transport.removeOutgoingMessage).toHaveBeenCalledWith(1);

    onConnect();
    const replay = (exists: boolean, matches: boolean) => (work: (db: unknown) => Promise<unknown>) =>
      work({ $executeRaw: execute, $queryRaw: async () => [{ exists, matches }] });
    transaction.mockImplementationOnce(replay(true, true)).mockImplementationOnce(replay(true, false))
      .mockImplementationOnce(replay(false, false)).mockRejectedValueOnce(new Error('Base indisponible'));
    await message(base + '/readings', batch([
      item(10), item(11), item(12), item(13), item(14),
      item(15, { capturedAt: new Date(now + 360_000).toISOString() }),
      item(16, { capturedAt: new Date(now - 90_000_000).toISOString() }),
      { itemId: id(17), sample: { ...sample, deviceId: id(42) } },
    ]));
    expect(transport.publish).toHaveBeenCalledTimes(2);
    const [topic, payload, options] = transport.publish.mock.calls[1];
    expect(topic).toBe(base + '/telemetry-ack');
    expect(options).toMatchObject({ qos: 1, retain: false, properties: { messageExpiryInterval: 10 } });
    expect(JSON.parse(payload)).toMatchObject({
      batchId: id(99), serverReceivedAt: new Date(now).toISOString(), results: [
        { itemId: id(10), status: 'DUPLICATE' }, { itemId: id(11), status: 'REJECTED', reason: 'IDENTITY_CONFLICT' },
        { itemId: id(12), status: 'STORED' }, { itemId: id(13), status: 'RETRY' }, { itemId: id(14), status: 'RETRY' },
        { itemId: id(15), status: 'REJECTED', reason: 'CLOCK_AHEAD' },
        { itemId: id(16), status: 'REJECTED', reason: 'REPLAY_EXPIRED' },
        { itemId: id(17), status: 'REJECTED', reason: 'INVALID_SAMPLE' },
      ],
    });
    expect(transaction).toHaveBeenCalledTimes(5);
    expect(redis.eval).not.toHaveBeenCalled();
  });

  it('ne répond ni à un lot ambigu ni à un équipement hors périmètre', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    connectMQTT({} as Parameters<typeof connectMQTT>[0]);
    (handlers.get('connect') as () => void)();
    prisma.device.findFirst.mockResolvedValue(null);
    const message = handlers.get('message') as (topic: string, payload: Buffer) => Promise<void>;
    const item = { itemId: sample.bootId, sample };
    const topic = `afrixora/${scope.tenantId}/${scope.buildingId}/devices/00000000-0000-4000-8000-000000000042/readings`;
    const batch = (items: unknown[]) => Buffer.from(JSON.stringify({ type: 'telemetry_batch', schemaVersion: 2, batchId: sample.bootId, items }));
    await message(topic, batch([item, item]));
    expect(prisma.device.findFirst).not.toHaveBeenCalled();
    await message(topic, batch([]));
    expect(prisma.device.findFirst).toHaveBeenCalledOnce();
    expect(transport.publish).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
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
