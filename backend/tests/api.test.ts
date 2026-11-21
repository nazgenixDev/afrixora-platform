import { randomUUID } from 'node:crypto';
import { Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { prisma } from '../src/utils/database';

vi.mock('../src/utils/redis', () => ({ default: {}, isRedisConnected: () => false }));
vi.mock('../src/middleware/requestLogger', () => ({
  requestLogger: vi.fn((_req, _res, next: () => void) => next()),
}));
vi.mock('../src/utils/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const api = '/api/v1';
const app = request(createApp(0));
const password = 'mot-de-passe-de-test';
const tenants = [createFixture('a'), createFixture('b'), createFixture('plateforme'), createFixture('suppression')] as const;
const [local, foreign, platform, removable] = tenants;
let authorization: string;
let superAuthorization: string;

function createFixture(label: string) {
  const id = randomUUID();
  return {
    id,
    slug: `vitest-${label}-${id}`,
    email: `${id}@example.test`,
    userId: randomUUID(),
    buildingId: randomUUID(),
    deviceId: randomUUID(),
    alertId: randomUUID(),
    automationId: randomUUID(),
  };
}

function automationInput(tenant: typeof local) {
  return {
    buildingId: tenant.buildingId,
    name: 'Seuil de température',
    trigger: { deviceId: tenant.deviceId, metric: 'temperature', operator: 'gt', value: 30 },
    action: { type: 'SEND_ALERT', severity: 'WARNING' },
  };
}

function login(email: string, candidate: string) {
  return app.post(`${api}/auth/login`).send({ email, password: candidate });
}

let fixturesCreated = false;

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('Renseigner DATABASE_URL avec une base PostgreSQL de test migrée. Voir le README.');
  }

  vi.stubEnv('JWT_SECRET', randomUUID());
  vi.stubEnv('JWT_REFRESH_SECRET', randomUUID());
  const passwordHash = await bcrypt.hash(password, 4);

  await prisma.$transaction(async (db) => {
    for (const tenant of tenants) {
      const { id: tenantId, slug, email, userId, buildingId, deviceId, alertId, automationId } = tenant;
      await db.tenant.create({ data: { id: tenantId, name: slug, slug } });
      await db.user.create({
        data: { id: userId, tenantId, email, passwordHash, name: slug, role: tenant === platform ? Role.SUPER_ADMIN : Role.TENANT_ADMIN },
      });
      await db.building.create({
        data: { id: buildingId, tenantId, name: slug, address: 'Adresse de test' },
      });
      await db.device.create({
        data: { id: deviceId, tenantId, buildingId, name: slug, type: 'SENSOR' },
      });
      await db.alert.create({
        data: { id: alertId, tenantId, buildingId, deviceId, message: slug, type: 'THRESHOLD' },
      });
      await db.automation.create({
        data: { ...automationInput(tenant), id: automationId, tenantId },
      });
    }
  });
  fixturesCreated = true;

  const response = await login(local.email, password).expect(200);
  authorization = `Bearer ${response.body.accessToken}`;
  const superResponse = await login(platform.email, password).expect(200);
  superAuthorization = `Bearer ${superResponse.body.accessToken}`;
}, 15_000);

afterAll(async () => {
  try {
    if (fixturesCreated) {
      const tenantIds = tenants.map(({ id }) => id);
      const where = { tenantId: { in: tenantIds } };
      await prisma.$transaction([
        prisma.subscriptionHistory.deleteMany({ where }),
        prisma.apiLog.deleteMany({ where }),
        prisma.apiKey.deleteMany({ where }),
        prisma.gateway.deleteMany({ where }),
        prisma.alert.deleteMany({ where }),
        prisma.automation.deleteMany({ where }),
        prisma.deviceState.deleteMany({ where }),
        prisma.device.deleteMany({ where }),
        prisma.zone.deleteMany({ where }),
        prisma.building.deleteMany({ where }),
        prisma.user.deleteMany({ where }),
        prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } }),
      ]);
    }
  } finally {
    vi.unstubAllEnvs();
    await prisma.$disconnect();
  }
});

describe('Isolation entre tenants', () => {
  it.each([
    ['devices', local.deviceId],
    ['alerts', local.alertId],
    ['automations', local.automationId],
    ['users', local.userId],
    ['buildings', local.buildingId],
  ])('filtre la liste %s, même avec un en-tête de tenant étranger', async (route, ownId) => {
    const { body } = await app.get(`${api}/${route}`)
      .set('Authorization', authorization)
      .set('X-Tenant-Id', foreign.id)
      .expect(200);

    const records = route === 'automations' ? body : body.data;
    expect(records.map(({ id }: { id: string }) => id)).toEqual([ownId]);
    if (route !== 'automations') expect(body.total).toBe(1);
  });

  it.each([
    [`devices/${local.deviceId}`, `devices/${foreign.deviceId}`],
    [`buildings/${local.buildingId}`, `buildings/${foreign.buildingId}`],
  ])('autorise la lecture de %s et refuse la lecture de %s', async (ownPath, foreignPath) => {
    await app.get(`${api}/${ownPath}`).set('Authorization', authorization).expect(200);
    await app.get(`${api}/${foreignPath}`).set('Authorization', authorization).expect(404);
  });

  it.each([
    [`devices/${foreign.deviceId}`, { name: 'Modification étrangère' }],
    [`alerts/${foreign.alertId}/read`, {}],
    [`automations/${foreign.automationId}`, { isActive: false }],
    [`users/${foreign.userId}/toggle`, {}],
  ])('refuse la modification de %s', async (path, payload) => {
    await app.patch(`${api}/${path}`).set('Authorization', authorization).send(payload).expect(404);
  });

  it('autorise la création de zone dans son bâtiment et la refuse dans un bâtiment étranger', async () => {
    const payload = { name: 'Zone de test' };
    await app.post(`${api}/buildings/${local.buildingId}/zones`)
      .set('Authorization', authorization).send(payload).expect(201);
    await app.post(`${api}/buildings/${foreign.buildingId}/zones`)
      .set('Authorization', authorization).send(payload).expect(404);
  });
});

describe('Suppression définitive des clients', () => {
  it('réserve la suppression au super administrateur', async () => {
    const endpoint = `${api}/tenants/${local.id}/permanent`;
    await app.delete(endpoint).expect(401);
    await app.delete(endpoint).set('Authorization', authorization).expect(403);
  });

  it('protège le tenant qui héberge un compte super administrateur', async () => {
    await app.delete(`${api}/tenants/${platform.id}/permanent`)
      .set('Authorization', superAuthorization).set('X-Tenant-Id', foreign.id)
      .expect(409).expect(({ body }) => expect(body.code).toBe('PROTECTED_TENANT'));
    expect(await prisma.user.findUnique({ where: { id: platform.userId } })).not.toBeNull();
    expect(await prisma.building.findUnique({ where: { id: platform.buildingId } })).not.toBeNull();
  });

  it('conserve les données lors de la désactivation et les supprime sur demande explicite', async () => {
    const { id: tenantId, buildingId, deviceId, email } = removable;
    const slug = removable.slug;
    const where = { tenantId };
    await prisma.$transaction([
      prisma.zone.create({ data: { ...where, buildingId, name: slug } }),
      prisma.gateway.create({ data: { ...where, buildingId, name: slug } }),
      prisma.deviceState.create({ data: { ...where, deviceId, state: {} } }),
      prisma.apiKey.create({ data: { ...where, name: slug, keyHash: randomUUID(), keyPrefix: 'test' } }),
      prisma.apiLog.create({ data: { ...where, method: 'GET', endpoint: '/', statusCode: 200, durationMs: 10, ip: '127.0.0.1' } }),
      prisma.subscriptionHistory.create({ data: { ...where, plan: 'BASIC', status: 'ACTIVE' } }),
    ]);

    const endpoint = `${api}/tenants/${tenantId}`;
    await app.delete(endpoint).set('Authorization', superAuthorization).expect(204);
    expect(await prisma.tenant.findUnique({ where: { id: tenantId } })).toMatchObject({ isActive: false });
    expect(await prisma.device.count({ where })).toBe(1);

    await app.delete(`${endpoint}/permanent`).set('Authorization', superAuthorization)
      .set('X-Tenant-Id', foreign.id).expect(204);
    expect(await prisma.tenant.findUnique({ where: { id: tenantId } })).toBeNull();
    expect(await prisma.$transaction([
      prisma.user.count({ where }),
      prisma.building.count({ where }),
      prisma.zone.count({ where }),
      prisma.device.count({ where }),
      prisma.deviceState.count({ where }),
      prisma.alert.count({ where }),
      prisma.automation.count({ where }),
      prisma.gateway.count({ where }),
      prisma.apiKey.count({ where }),
      prisma.apiLog.count({ where }),
      prisma.subscriptionHistory.count({ where }),
    ])).toEqual(Array(11).fill(0));
    expect(await prisma.device.count({ where: { tenantId: foreign.id } })).toBe(1);
    await login(email, password).expect(401);
    await app.delete(`${endpoint}/permanent`).set('Authorization', superAuthorization).expect(404);
  });
});

describe('Connexion', () => {
  it('ouvre une session pour des identifiants valides', async () => {
    const { body, headers } = await login(local.email, password).expect(200);
    expect(body.user).toMatchObject({ id: local.userId, tenantId: local.id, email: local.email });
    expect(body.user).not.toHaveProperty('passwordHash');
    expect(body.accessToken).toEqual(expect.any(String));
    expect(headers['set-cookie']).toEqual(expect.arrayContaining([
      expect.stringMatching(/^access_token=.+; HttpOnly/),
    ]));
  });

  it.each([
    ['mot de passe erroné', local.email, 'mot-de-passe-errone'],
    ['compte inconnu', `${randomUUID()}@example.test`, password],
  ])('renvoie 401 pour un %s', async (_scenario, email, candidate) => {
    const response = await login(email, candidate).expect(401);
    expect(response.body.code).toBe('INVALID_CREDENTIALS');
    expect(response.headers['set-cookie']).toBeUndefined();
  });
});

describe('Validation Zod', () => {
  it('accepte les paramètres de pagination et convertit la valeur false', async () => {
    const { body } = await app.get(`${api}/devices`).set('Authorization', authorization)
      .query({ page: 1, limit: 1, isOnline: 'false', type: 'SENSOR' }).expect(200);
    expect(body).toMatchObject({ page: 1, total: 1, data: [{ id: local.deviceId, isOnline: false }] });
  });

  it.each([
    [{ page: 0 }, 'page'],
    [{ limit: 101 }, 'limit'],
    [{ isOnline: 'yes' }, 'isOnline'],
    [{ buildingId: 'invalide' }, 'buildingId'],
  ])('rejette la requête appareils %j', async (query, field) => {
    const { body } = await app.get(`${api}/devices`).set('Authorization', authorization)
      .query(query).expect(400);
    expect(body).toMatchObject({
      error: 'Validation error',
      details: expect.arrayContaining([expect.objectContaining({ path: ['query', field] })]),
    });
  });

  it('rejette un e-mail invalide et un mot de passe trop court', async () => {
    const { body } = await login('invalide', 'court').expect(400);
    expect(body).toMatchObject({
      error: 'Validation error',
      details: expect.arrayContaining([
        expect.objectContaining({ path: ['body', 'email'] }),
        expect.objectContaining({ path: ['body', 'password'] }),
      ]),
    });
  });
});
