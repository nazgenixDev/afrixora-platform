const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
const zod = require('zod');

const source = path.join(__dirname, '..', 'src');
const logger = { info() {}, debug() {}, warn() {}, error() {} };
const command = { command: 'set_state', params: { state: 'on' } };
const commandId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const scope = {
  tenantId: '10000000-0000-4000-8000-000000000001',
  buildingId: '20000000-0000-4000-8000-000000000001',
  deviceId: '30000000-0000-4000-8000-000000000001',
};
const otherId = '40000000-0000-4000-8000-000000000001';

function load(file, dependencies, env = {}) {
  const { outputText } = ts.transpileModule(fs.readFileSync(path.join(source, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  });
  const module = { exports: {} };
  vm.runInNewContext(outputText, {
    exports: module.exports,
    module,
    require(id) {
      if (id in dependencies) return dependencies[id];
      throw new Error(`Dépendance non simulée ${id}`);
    },
    process: { env },
    Buffer,
    URL,
    Date,
    Promise,
    setInterval() {},
    setTimeout,
    clearTimeout,
  });
  return module.exports;
}

class AppError extends Error {
  constructor(message, status, code) {
    super(message);
    this.code = code;
  }
}

function setupService(env, publish = async () => {}) {
  const events = [];
  const journal = { id: commandId, ...scope };
  const prisma = {
    device: {
      findFirst: async ({ where }) => {
        if (where.tenantId !== scope.tenantId || where.id !== scope.deviceId) return null;
        if (where.buildingId && where.buildingId !== scope.buildingId) return null;
        return { id: scope.deviceId, ...scope, isOnline: true, type: 'LIGHT' };
      },
    },
    deviceState: {
      upsert() { throw new Error('Le service de publication ne doit pas écrire d’état'); },
    },
    deviceCommand: {
      create: async ({ data }) => {
        events.push('PENDING');
        Object.assign(journal, { status: 'PENDING' }, data);
        return journal;
      },
      findFirst: async () => journal,
      updateMany: async ({ where, data }) => {
        assert.equal(where.tenantId, scope.tenantId);
        assert.equal(where.deviceId, scope.deviceId);
        assert.equal(where.buildingId, scope.buildingId);
        if (typeof where.status === 'string' && where.status !== journal.status) return { count: 0 };
        if (where.status?.in && !where.status.in.includes(journal.status)) return { count: 0 };
        if (where.expiresAt?.lte && journal.expiresAt > where.expiresAt.lte) return { count: 0 };
        if (data.status) events.push(data.status);
        Object.assign(journal, data);
        return { count: 1 };
      },
    },
  };
  const service = load('services/deviceService.ts', {
    '@prisma/client': { Prisma: { PrismaClientKnownRequestError: class extends Error {} } },
    '../utils/database': { prisma },
    '../utils/deviceCommands': load('utils/deviceCommands.ts', { zod, './errors': { AppError } }),
    './mqttWorker': {
      publishMqtt: async (topic, message, expiresAt) => {
        events.push('PUBLISH');
        assert.equal(topic, `afrixora/${scope.tenantId}/${scope.buildingId}/devices/${scope.deviceId}/commands`);
        assert.equal(message.commandId, commandId);
        assert.equal(message.expiresAt, journal.expiresAt.toISOString());
        assert.equal(expiresAt, journal.expiresAt);
        await publish(journal);
      },
    },
    '../utils/errors': { AppError, NotFoundError: Error },
  }, env).default;
  return { service, events, journal };
}

test('Le pilotage manuel et l’automatisation restent bloqués par défaut', async () => {
  const { service, events } = setupService({});
  await assert.rejects(service.control(scope.deviceId, command, scope.tenantId), { code: 'CONTROL_DISABLED' });
  const manualOnly = setupService({ AFRIXORA_DEVICE_CONTROL_ENABLED: 'true' });
  await assert.rejects(manualOnly.service.control(scope.deviceId, command, scope.tenantId, {
    origin: 'AUTOMATION', buildingId: scope.buildingId,
  }), { code: 'CONTROL_DISABLED' });
  assert.deepEqual(events, []);
  assert.deepEqual(manualOnly.events, []);
});

test('La publication journalise SENT sans modifier l’état de l’appareil', async () => {
  const { service, events } = setupService({ AFRIXORA_DEVICE_CONTROL_ENABLED: 'true' });
  const response = await service.control(scope.deviceId, command, scope.tenantId);
  assert.equal(response.accepted, true);
  assert.equal(response.status, 'SENT');
  assert.deepEqual(events, ['PENDING', 'PUBLISH', 'SENT']);
});

test('Un ACK anticipé conserve son statut et la date d’envoi', async () => {
  const { service, journal } = setupService({ AFRIXORA_DEVICE_CONTROL_ENABLED: 'true' }, async (record) => {
    record.status = 'ACKNOWLEDGED';
  });
  const response = await service.control(scope.deviceId, command, scope.tenantId);
  assert.equal(response.status, 'ACKNOWLEDGED');
  assert.ok(journal.sentAt instanceof Date);
});

test('Le tenant et le bâtiment de la règle limitent la cible de commande', async () => {
  const { service, events } = setupService({
    AFRIXORA_DEVICE_CONTROL_ENABLED: 'true',
    AFRIXORA_AUTOMATION_COMMANDS_ENABLED: 'true',
  });
  await assert.rejects(service.control(scope.deviceId, command, 'autre-tenant'), /Device not found/);
  await assert.rejects(service.control(scope.deviceId, command, scope.tenantId, {
    origin: 'AUTOMATION', buildingId: 'autre-batiment',
  }), /Device not found/);
  assert.deepEqual(events, []);
});

test('Une erreur du broker journalise FAILED', async () => {
  const { service, events } = setupService({ AFRIXORA_DEVICE_CONTROL_ENABLED: 'true' }, async () => {
    throw new Error('Broker indisponible');
  });
  await assert.rejects(service.control(scope.deviceId, command, scope.tenantId), { code: 'MQTT_UNAVAILABLE' });
  assert.deepEqual(events, ['PENDING', 'PUBLISH', 'FAILED']);
});

test('Les règles existantes turn_on et turn_off suivent le même chemin journalisé', async () => {
  const automationSchemas = load('utils/automationSchemas.ts', {
    '@prisma/client': { Severity: { INFO: 'INFO', WARNING: 'WARNING', CRITICAL: 'CRITICAL' } },
    './deviceCommands': load('utils/deviceCommands.ts', { zod, './errors': { AppError } }),
    zod,
  });
  const actions = [
    { command: 'turn_on' },
    { command: 'turn_on', params: { state: 'off' } },
    { command: 'turn_off' },
    { command: 'set_state', params: { state: 'on' } },
    { command: 'set_state' },
    { command: 'unsupported' },
  ];
  const calls = [];
  const { evaluate } = load('services/automationEngine.ts', {
    '../utils/automationSchemas': automationSchemas,
    '../utils/database': { prisma: { automation: {
      findMany: async () => actions.map((action, index) => ({
        id: String(index), name: String(index),
        trigger: { metric: 'temperature', operator: 'gt', value: 0 },
        action: { type: 'DEVICE_COMMAND', deviceId: scope.deviceId, ...action },
      })),
      update: async () => {},
    } } },
    './deviceService': { control: async (id, payload, tenantId, context) => {
      assert.equal(id, scope.deviceId);
      assert.equal(tenantId, scope.tenantId);
      assert.equal(context.buildingId, scope.buildingId);
      assert.equal(context.origin, 'AUTOMATION');
      calls.push(payload.command === 'set_state' ? payload.params.state : payload.command);
      return { status: 'SENT' };
    } },
    '../utils/logger': logger,
  }, { AFRIXORA_DEVICE_CONTROL_ENABLED: 'true', AFRIXORA_AUTOMATION_COMMANDS_ENABLED: 'true' });
  await evaluate(scope.tenantId, scope.buildingId, scope.deviceId, { temperature: 1 }, {});
  assert.deepEqual(calls, ['turn_on', 'turn_off', 'on']);
});

function loadMqttWorker(mqtt, prisma = {}, env = {}) {
  return load('services/mqttWorker.ts', {
    'node:crypto': { randomUUID: () => commandId },
    zod,
    mqtt,
    '../utils/logger': logger,
    '../utils/database': { prisma },
    '../utils/redis': { getRedisClient: () => ({}), isRedisConnected: () => false },
    './automationEngine': { evaluate: async () => {} },
    './energyTelemetry': load('services/energyTelemetry.ts', {
      zod, '../utils/database': { prisma },
    }),
  }, env);
}

test('Le transport distant exige TLS en production', () => {
  const attempted = [];
  const mqtt = { connect: (url) => { attempted.push(url); return { on() {} }; } };
  const start = (url) => loadMqttWorker(mqtt, {}, {
    NODE_ENV: 'production', MQTT_URL: url,
  }).connectMQTT({});
  assert.throws(() => start('mqtt://broker.example.test'), /exige une connexion TLS/);
  start('mqtt://mosquitto:1883');
  start('mqtts://broker.example.test');
  assert.deepEqual(attempted, ['mqtt://mosquitto:1883', 'mqtts://broker.example.test']);
});

function setupTransport() {
  const handlers = {};
  const published = [];
  const outgoing = new Map();
  const removed = [];
  let lastMessageId = 0;
  const client = {
    connected: true,
    on(name, handler) { handlers[name] = handler; },
    subscribe(topics, { qos }, callback) {
      callback(undefined, topics.map(topic => ({ topic, qos })));
    },
    getLastMessageId() { return lastMessageId; },
    publish(topic, payload, options, callback) {
      const id = ++lastMessageId;
      outgoing.set(id, callback);
      published.push({ id, topic, payload, options });
      options.cbStorePut();
    },
    removeOutgoingMessage(id) {
      removed.push(id);
      const callback = outgoing.get(id);
      outgoing.delete(id);
      callback?.(new Error('Paquet retiré'));
    },
  };
  const worker = loadMqttWorker({ connect: (_url, options) => {
    assert.equal(options.protocolVersion, 5);
    assert.equal(options.resubscribe, false);
    return client;
  } });
  worker.connectMQTT({});
  return { ...worker, client, handlers, published, outgoing, removed };
}

const topic = 'afrixora/tenant/batiment/devices/appareil/commands';

test('La publication QoS 1 attend le PUBACK et transmet le délai au broker', async () => {
  const { handlers, publishMqtt, published, outgoing, removed } = setupTransport();
  await assert.rejects(publishMqtt(topic, command, new Date(Date.now() + 1_000)), /indisponible/);
  handlers.connect();
  const attempt = publishMqtt(topic, command, new Date(Date.now() + 1_500));
  const [{ id, options }] = published;
  assert.equal(options.qos, 1);
  assert.equal(options.retain, false);
  assert.equal(options.properties.messageExpiryInterval, 2);
  outgoing.get(id)();
  await attempt;
  assert.deepEqual(removed, []);
});

test('Une expiration retire la publication du magasin et bloque un nouvel envoi périmé', async () => {
  const { handlers, publishMqtt, published, outgoing, removed } = setupTransport();
  handlers.connect();
  await assert.rejects(publishMqtt(topic, command, new Date(Date.now() + 30)), /Délai/);
  assert.deepEqual(removed, [published[0].id]);
  assert.equal(outgoing.size, 0);
  await assert.rejects(publishMqtt(topic, command, new Date(0)), /Délai/);
  assert.equal(published.length, 1);
});

test('Une coupure retire les commandes en attente avant reconnexion', async () => {
  const { client, handlers, publishMqtt, published, outgoing, removed } = setupTransport();
  handlers.connect();
  const attempts = [1, 2].map(() => publishMqtt(topic, command, new Date(Date.now() + 1_000)));
  const settled = Promise.allSettled(attempts);
  client.connected = false;
  handlers.close();
  assert.deepEqual(removed, published.map(({ id }) => id));
  assert.equal(outgoing.size, 0);
  for (const result of await settled) {
    assert.equal(result.status, 'rejected');
    assert.match(result.reason.message, /interrompue/);
  }
  client.connected = true;
  await assert.rejects(publishMqtt(topic, command, new Date(Date.now() + 1_000)), /indisponible/);
  assert.equal(published.length, 2);
});

function setupAck({ expired = false, stateWriteFails = false } = {}) {
  const handlers = {};
  const notifications = [];
  const journal = {
    id: commandId, ...scope, status: 'SENT', params: command.params,
    expiresAt: new Date(Date.now() + (expired ? -1_000 : 60_000)),
  };
  let reported;
  const matches = (where) => where.id === journal.id &&
    where.deviceId === journal.deviceId && where.tenantId === journal.tenantId &&
    where.buildingId === journal.buildingId && where.status.in.includes(journal.status) &&
    journal.expiresAt > where.expiresAt.gt;
  const tx = {
    deviceCommand: {
      findFirst: async ({ where }) => matches(where) ? journal : null,
      updateMany: async ({ where, data }) => {
        if (!matches(where)) return { count: 0 };
        Object.assign(journal, data);
        return { count: 1 };
      },
    },
    deviceState: {
      upsert: async ({ where, update }) => {
        assert.equal(where.tenantId, scope.tenantId);
        assert.equal(where.deviceId, scope.deviceId);
        if (stateWriteFails) throw new Error('Échec écriture état');
        reported = update.state;
      },
    },
  };
  const prisma = {
    device: { findFirst: async () => ({ id: 'device' }), updateMany: async () => ({ count: 1 }) },
    $transaction: async (run) => {
      const before = { ...journal };
      try {
        return await run(tx);
      } catch (error) {
        Object.assign(journal, before);
        throw error;
      }
    },
  };
  const mqtt = {
    connect: () => ({ connected: true, on: (name, fn) => { handlers[name] = fn; } }),
  };
  const { connectMQTT } = loadMqttWorker(mqtt, prisma);
  connectMQTT({ to: () => ({ emit: (name, event) => notifications.push([name, event.status]) }) });
  function ack(status, { state, tenantId, buildingId, deviceId, retain } = {}) {
    const topic = `afrixora/${tenantId ?? scope.tenantId}/${buildingId ?? scope.buildingId}/devices/${deviceId ?? scope.deviceId}/events`;
    const event = { type: 'command_ack', commandId, status, ...(state ? { observedState: { state } } : {}) };
    return handlers.message(topic, Buffer.from(JSON.stringify(event)), { retain });
  }
  return { ack, journal, notifications, getReported: () => reported };
}

test('Seul un état cohérent déclaré par le boîtier alimente DeviceState', async () => {
  const { ack, journal, notifications, getReported } = setupAck();
  await ack('ACKNOWLEDGED');
  assert.equal(journal.status, 'ACKNOWLEDGED');
  assert.equal(getReported(), undefined);
  await ack('CONFIRMED', { state: 'off' });
  assert.equal(journal.status, 'ACKNOWLEDGED');
  await ack('CONFIRMED', { state: 'on' });
  assert.equal(journal.status, 'CONFIRMED');
  assert.equal(getReported().source, 'device_reported');
  assert.equal(getReported().state, 'on');
  await ack('CONFIRMED', { state: 'on' });
  assert.deepEqual(notifications, [['device:command', 'ACKNOWLEDGED'], ['device:command', 'CONFIRMED']]);
});

test('Les ACK hors périmètre, retenus ou périmés sont ignorés', async () => {
  const active = setupAck();
  for (const input of [{ tenantId: otherId }, { buildingId: otherId }, { deviceId: otherId }, { retain: true }]) {
    await active.ack('ACKNOWLEDGED', input);
  }
  const expired = setupAck({ expired: true });
  await expired.ack('CONFIRMED', { state: 'on' });
  assert.equal(active.journal.status, 'SENT');
  assert.equal(expired.journal.status, 'SENT');
  assert.deepEqual(active.notifications, []);
  assert.deepEqual(expired.notifications, []);
  assert.equal(expired.getReported(), undefined);
});

test('Un échec d’écriture de l’état annule la confirmation et son événement', async () => {
  const { ack, journal, notifications } = setupAck({ stateWriteFails: true });
  await ack('CONFIRMED', { state: 'on' });
  assert.equal(journal.status, 'SENT');
  assert.deepEqual(notifications, []);
});
