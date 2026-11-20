#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."

# Exécute les routes Express en mémoire avec des données de test et un JWT signé.
NODE_ENV=development ./node_modules/.bin/ts-node --files <<'TS'
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import { Socket } from 'node:net';
import { test } from 'node:test';
import { DeviceType, Prisma, SubscriptionStatus } from '@prisma/client';
import express from 'express';
import jwt from 'jsonwebtoken';

test('P0-5 — validation HTTP et isolation des automatisations', async () => {
  const secret = randomBytes(32).toString('hex');
  process.env.JWT_SECRET = secret;
  const tenantId = 'tenant-test';
  const buildingId = 'building-test';
  const deviceId = 'device-test';
  const sensorId = 'sensor-test';
  const automationId = 'automation-test';
  const foreignBuildingId = 'other-building';
  const foreignDeviceId = 'other-device';
  const anotherBuildingId = 'another-building';
  const anotherBuildingDeviceId = 'another-building-device';
  const adminId = 'admin-test';
  const tenantSlugs = new Set<string>();
  const userEmails = new Set<string>();
  let savedApiKey: Prisma.ApiKeyUncheckedCreateInput | undefined;
  let subscriptionStatus: SubscriptionStatus = 'ACTIVE';
  const devices = [
    { id: deviceId, tenantId, buildingId, type: DeviceType.LIGHT },
    { id: sensorId, tenantId, buildingId, type: DeviceType.SENSOR },
    { id: foreignDeviceId, tenantId: 'other-tenant', buildingId: foreignBuildingId, type: DeviceType.LIGHT },
    { id: anotherBuildingDeviceId, tenantId, buildingId: anotherBuildingId, type: DeviceType.PLUG },
  ];

  Object.assign(globalThis, {
    prisma: {
      user: {
        findUnique: async ({ where }: { where: Prisma.UserWhereUniqueInput }) => ({
          tenantId, role: where.id === adminId ? 'SUPER_ADMIN' : 'TENANT_ADMIN',
          jwtVersion: 0, isActive: true, tenant: { isActive: true },
        }),
      },
      tenant: {
        findUnique: async () => ({ plan: 'ENTERPRISE', subscriptionStatus, subscriptionEndsAt: null, isActive: true }),
        create: async ({ data }: { data: Prisma.TenantCreateInput }) => {
          const admin = data.users?.create;
          assert(admin && 'passwordHash' in admin && admin.passwordHash.length > 8);
          assert.equal(admin.role, 'TENANT_ADMIN');
          const duplicateField = tenantSlugs.has(data.slug) ? 'slug' : userEmails.has(admin.email) ? 'email' : undefined;
          if (duplicateField) {
            throw new Prisma.PrismaClientKnownRequestError('Conflit simulé', {
              code: 'P2002', clientVersion: Prisma.prismaVersion.client, meta: { target: [duplicateField] },
            });
          }
          tenantSlugs.add(data.slug);
          userEmails.add(admin.email);
          return { name: data.name, slug: data.slug, plan: data.plan };
        },
      },
      building: {
        findFirst: async ({ where }: { where: Prisma.BuildingWhereInput }) => {
          assert.equal(where.tenantId, tenantId);
          return where.id === buildingId ? { id: buildingId } : null;
        },
      },
      device: {
        findMany: async ({ where }: { where: { id: { in: string[] }; tenantId: string; buildingId: string } }) =>
          devices.filter(device => where.id.in.includes(device.id)
            && device.tenantId === where.tenantId && device.buildingId === where.buildingId),
      },
      automation: {
        findFirst: async ({ where }: { where: Prisma.AutomationWhereInput }) =>
          where.id === automationId && where.tenantId === tenantId ? { id: automationId, buildingId } : null,
        create: async ({ data }: { data: Prisma.AutomationUncheckedCreateInput }) => ({ id: automationId, ...data }),
        update: async ({ where, data }: { where: Prisma.AutomationWhereUniqueInput; data: Prisma.AutomationUpdateInput }) => {
          assert.deepEqual(where, { id: automationId, tenantId, building: { tenantId, isActive: true } });
          assert.equal(data.conditions, undefined);
          return { id: automationId, isActive: data.isActive };
        },
        delete: async ({ where }: { where: Prisma.AutomationWhereUniqueInput }) => {
          assert.deepEqual(where, { id: automationId, tenantId, building: { tenantId } });
        },
      },
      apiKey: {
        create: async ({ data }: { data: Prisma.ApiKeyUncheckedCreateInput }) => {
          assert.equal(data.tenantId, tenantId);
          savedApiKey = data;
          return { name: data.name, scope: data.scope, keyPrefix: data.keyPrefix };
        },
      },
    },
  });

  // Le script utilise uniquement des routes simulées et n’ouvre aucune connexion Redis.
  const requireFromBackend = createRequire(process.cwd() + '/package.json');
  Object.assign(requireFromBackend.cache, {
    [requireFromBackend.resolve('./src/utils/redis')]: { loaded: true, exports: {} },
  });

  const { default: automationRoutes } = await import('./src/routes/automations');
  const { default: tenantRoutes } = await import('./src/routes/tenants');
  const { default: apiKeyRoutes } = await import('./src/routes/apiKeys');
  const { errorHandler } = await import('./src/middleware/errorHandler');
  const { default: logger } = await import('./src/utils/logger');
  logger.silent = true;

  const app = express();
  app.use(express.json());
  app.use('/automations', automationRoutes);
  app.use('/tenants', tenantRoutes);
  app.use('/api-keys', apiKeyRoutes);
  app.use(errorHandler);
  const server = createServer(app);

  async function expectStatus(
    expected: number, method: string, path: string, payload?: unknown, userId = 'tenant-admin-test',
  ): Promise<string> {
    const { status, body } = await new Promise<{ status: number; body: string }>(resolve => {
      const request = new IncomingMessage(new Socket());
      request.method = method;
      request.url = path;
      request.headers.authorization = 'Bearer ' + jwt.sign({ userId, tenantId, jwtVersion: 0 }, secret);
      if (payload !== undefined) {
        const json = JSON.stringify(payload);
        request.headers['content-type'] = 'application/json';
        request.headers['content-length'] = String(Buffer.byteLength(json));
        request.push(json);
      }
      request.push(null);
      const response = new ServerResponse(request);
      Object.assign(response, {
        end(chunk?: string | Buffer) {
          resolve({ status: response.statusCode, body: chunk?.toString() ?? '' });
          return response;
        },
      });
      server.emit('request', request, response);
    });
    assert.equal(status, expected, `${method} ${path} devait renvoyer ${expected}`);
    return body;
  }

  const rule = {
    name: 'Règle de test',
    buildingId,
    trigger: { deviceId, metric: 'power_w', operator: 'eq', value: 0 },
    action: { type: 'SEND_ALERT', severity: 'INFO' },
  };
  const automationPath = '/automations/' + automationId;
  const createdRule = await expectStatus(201, 'POST', '/automations', rule);
  assert.deepEqual(JSON.parse(createdRule).conditions, []);
  await expectStatus(400, 'PATCH', automationPath, { tenantId: 'x' });
  await expectStatus(400, 'PATCH', automationPath, { buildingId: anotherBuildingId });
  await expectStatus(200, 'PATCH', automationPath, { isActive: false });
  await expectStatus(404, 'PATCH', '/automations/inconnue', { isActive: false });
  await expectStatus(404, 'DELETE', '/automations/inconnue');
  await expectStatus(204, 'DELETE', automationPath);
  await expectStatus(404, 'POST', '/automations', { ...rule, buildingId: foreignBuildingId });
  await expectStatus(404, 'POST', '/automations', { ...rule, trigger: { ...rule.trigger, deviceId: foreignDeviceId } });
  const command = { type: 'DEVICE_COMMAND', deviceId, command: 'turn_off' };
  await expectStatus(201, 'POST', '/automations', { ...rule, action: command });
  await expectStatus(400, 'POST', '/automations', { ...rule, action: { ...command, deviceId: sensorId } });
  const invalidCommand = JSON.parse(await expectStatus(400, 'POST', '/automations', {
    ...rule, action: { ...command, command: 'set_state' },
  }));
  assert.equal(invalidCommand.code, 'VALIDATION_ERROR');
  await expectStatus(404, 'POST', '/automations', { ...rule, action: { ...command, deviceId: anotherBuildingDeviceId } });
  await expectStatus(404, 'PATCH', automationPath, { action: { ...command, deviceId: foreignDeviceId } });

  await expectStatus(400, 'POST', '/api-keys', { name: 'Test', scope: 'inconnu' });
  await expectStatus(400, 'POST', '/api-keys', { name: 'a'.repeat(61), scope: 'read' });
  await expectStatus(400, 'POST', '/api-keys', { name: 'Test', scope: 'gateway' });
  for (const scope of ['read', 'write', 'full']) {
    const body = await expectStatus(201, 'POST', '/api-keys', { name: 'Test', scope });
    const created = JSON.parse(body);
    assert.equal(created.scope, scope);
    assert.match(created.key, /^afrx_live_[0-9a-f]{32}$/);
    assert.equal(created.keyPrefix, created.key.slice('afrx_live_'.length, 'afrx_live_'.length + 8));
    assert.equal(created.keyHash, undefined);
    assert(savedApiKey);
    assert.equal(savedApiKey.keyHash, createHash('sha256').update(created.key).digest('hex'));
    assert.equal('key' in savedApiKey, false);
  }
  subscriptionStatus = 'PAST_DUE';
  await expectStatus(403, 'POST', '/api-keys', { name: 'Test', scope: 'read' });
  subscriptionStatus = 'ACTIVE';

  const tenant = {
    name: 'Client test', slug: 'client-test', plan: 'BUSINESS',
    adminEmail: 'admin@example.test', adminName: 'Admin test',
    adminPassword: randomBytes(12).toString('hex'),
  };
  for (const invalid of [
    { name: '' }, { slug: 'Slug invalide' }, { plan: 'CORE' },
    { adminEmail: 'invalide' }, { adminName: '' }, { adminPassword: 'court' },
  ]) {
    await expectStatus(400, 'POST', '/tenants', { ...tenant, ...invalid }, adminId);
  }
  for (const plan of ['BASIC', 'PRO', 'BUSINESS', 'ENTERPRISE']) {
    const suffix = plan.toLowerCase();
    const body = await expectStatus(201, 'POST', '/tenants', {
      ...tenant, plan, slug: 'client-' + suffix, adminEmail: suffix + '@example.test',
    }, adminId);
    assert.equal(JSON.parse(body).plan, plan);
  }
  await expectStatus(409, 'POST', '/tenants', { ...tenant, slug: 'client-basic' }, adminId);
  await expectStatus(409, 'POST', '/tenants', { ...tenant, adminEmail: 'pro@example.test' }, adminId);
});
TS
