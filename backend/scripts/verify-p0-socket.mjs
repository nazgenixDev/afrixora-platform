import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import http from 'node:http';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';

const require = createRequire(import.meta.url);
const requireFrontend = createRequire(new URL('../../frontend/package.json', import.meta.url));
const { io: connect } = requireFrontend('socket.io-client');

async function waitFor(emitter, event) {
  const [value] = await once(emitter, event, { signal: AbortSignal.timeout(5_000) });
  return value;
}

test('P0-3 : authentification, isolation des bâtiments et diffusion légitime', async (context) => {
  const tenantId = randomUUID();
  const otherTenantId = randomUUID();
  const buildingId = randomUUID();
  const otherBuildingId = randomUUID();
  const userId = randomUUID();
  const adminId = randomUUID();
  const secret = randomBytes(32);
  const clients = [];
  const users = new Map([
    [userId, { tenantId, role: 'VIEWER', jwtVersion: 2, isActive: true, tenant: { isActive: true } }],
    [adminId, { tenantId, role: 'SUPER_ADMIN', jwtVersion: 2, isActive: true, tenant: { isActive: false } }],
  ]);
  const buildings = new Map([[buildingId, tenantId], [otherBuildingId, otherTenantId]]);
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = secret.toString('hex');

  let io;
  let buildingQueries = 0;
  function replaceModule(path, exports) {
    const filename = require.resolve(path);
    const previous = require.cache[filename];
    require.cache[filename] = { id: filename, filename, loaded: true, exports };
    context.after(() => {
      if (previous) require.cache[filename] = previous;
      else delete require.cache[filename];
    });
  }

  context.after(async () => {
    for (const client of clients) client.disconnect();
    await io?.close();
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  });

  replaceModule('../dist/utils/database.js', { prisma: {
    user: { async findFirst({ where }) {
      const user = users.get(where.id);
      return user?.tenantId === where.tenantId ? user : null;
    } },
    building: { async findFirst({ where }) {
      buildingQueries++;
      const owner = buildings.get(where.id);
      return owner && (where.tenantId === undefined || owner === where.tenantId) ? { id: where.id } : null;
    } },
  } });
  replaceModule('../dist/utils/redis.js', { duplicate: () => ({}) });
  replaceModule('../dist/services/mqttWorker.js', { connectMQTT: (server) => { io = server; } });
  replaceModule('../dist/scripts/checkEnv.js', { checkEnv: () => {} });
  context.mock.method(require('@socket.io/redis-adapter'), 'createAdapter', () => new Server().adapter());

  const listen = http.Server.prototype.listen;
  const loopback = context.mock.method(http.Server.prototype, 'listen', function (_port, callback) {
    return listen.call(this, 0, '127.0.0.1', callback);
  });
  try {
    require('../dist/server.js');
  } finally {
    loopback.mock.restore();
  }
  await waitFor(io.httpServer, 'listening');
  const baseUrl = `http://127.0.0.1:${io.httpServer.address().port}`;

  function openClient(options = {}) {
    const client = connect(baseUrl, { autoConnect: false, reconnection: false, transports: ['websocket'], ...options });
    clients.push(client);
    return client;
  }

  function issueToken(id, jwtVersion = 2) {
    return jwt.sign({ userId: id, tenantId, jwtVersion }, process.env.JWT_SECRET, { expiresIn: '1m' });
  }

  async function expectRefusal(options) {
    const client = openClient(options);
    const rejected = waitFor(client, 'connect_error');
    client.connect();
    assert.equal((await rejected).message, 'Unauthorized');
    assert.equal(client.connected, false);
  }

  async function expectJoin(client, id) {
    const joined = once(io.of('/').adapter, 'join-room', { signal: AbortSignal.timeout(5_000) });
    client.emit('join:building', id);
    assert.deepEqual(await joined, [`building:${id}`, client.id]);
  }

  const token = issueToken(userId);
  await context.test('Refuse une connexion sans jeton ou avec une session invalide', async () => {
    await expectRefusal();
    await expectRefusal({ auth: { token: issueToken(userId, 1) } });
    await expectRefusal({ auth: { token }, extraHeaders: { cookie: 'access_token=invalid' } });
  });

  await context.test('Refuse un bâtiment étranger et ne livre aucune de ses mesures', async () => {
    const client = openClient({ auth: { token } });
    const connected = waitFor(client, 'connect');
    client.connect();
    await connected;

    const queryCount = buildingQueries;
    let refused = waitFor(client, 'error:join');
    client.emit('join:building', { id: buildingId });
    const genericError = await refused;
    assert.equal(buildingQueries, queryCount);

    refused = waitFor(client, 'error:join');
    client.emit('join:building', otherBuildingId);
    assert.equal(await refused, genericError);

    const received = [];
    client.on('device:reading', (reading) => received.push(reading));
    await expectJoin(client, buildingId);
    const foreignReading = { deviceId: randomUUID(), metrics: { power_w: 20 } };
    const ownReading = { deviceId: randomUUID(), metrics: { power_w: 10 } };
    const delivered = waitFor(client, 'device:reading');
    io.to(`building:${otherBuildingId}`).emit('device:reading', foreignReading);
    io.to(`building:${buildingId}`).emit('device:reading', ownReading);
    assert.deepEqual(await delivered, ownReading);
    assert.deepEqual(received, [ownReading]);
    assert.equal(io.of('/').adapter.rooms.get(`building:${otherBuildingId}`)?.has(client.id) ?? false, false);
    client.disconnect();
  });

  await context.test('Le cookie prioritaire permet au SUPER_ADMIN de recevoir une mesure d’un autre tenant', async () => {
    const client = openClient({
      auth: { token: 'invalid' },
      extraHeaders: { cookie: `theme=dark; access_token=${issueToken(adminId)}` },
    });
    const connected = waitFor(client, 'connect');
    client.connect();
    await connected;
    await expectJoin(client, otherBuildingId);

    const reading = { deviceId: randomUUID(), metrics: { power_w: 30 } };
    const delivered = waitFor(client, 'device:reading');
    io.to(`building:${otherBuildingId}`).emit('device:reading', reading);
    assert.deepEqual(await delivered, reading);
  });
});
