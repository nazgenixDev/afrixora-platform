import { randomUUID } from 'node:crypto';
import { Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { prisma } from '../src/utils/database';
import * as database from '../src/utils/database';

vi.mock('../src/utils/redis', () => ({ default: {}, isRedisConnected: () => false }));
vi.mock('../src/middleware/requestLogger', () => ({
  requestLogger: vi.fn((_req, _res, next: () => void) => next()),
}));
vi.mock('../src/utils/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../src/services/refreshSessions', () => ({ startRefreshSession: vi.fn() }));
vi.mock('../src/services/apiKeyUsage', () => ({ consumeApiKeyQuota: vi.fn(async () => true) }));

const sendEmail = vi.hoisted(() => vi.fn());
vi.mock('resend', () => ({ Resend: class { emails = { send: sendEmail }; } }));

const api = '/api/v1';
let app: ReturnType<typeof request>;
const password = 'mot-de-passe-de-test';
const tenants = [createFixture('a'), createFixture('b'), createFixture('plateforme'), createFixture('suppression')] as const;
const [local, foreign, platform, removable] = tenants;
let authorization: string;
let superAuthorization: string;
let viewerAuthorization: string;
let operatorAuthorization: string;
const browserOrigin = 'http://localhost:3000';

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
  return app.post(`${api}/auth/login`).set('Origin', browserOrigin).send({ email, password: candidate });
}

async function bearer(email: string) {
  const { body } = await app.post(`${api}/auth/token`).send({ email, password }).expect(200);
  return `Bearer ${body.accessToken}`;
}

let fixturesCreated = false;

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('Renseigner DATABASE_URL avec une base PostgreSQL de test migrée. Voir le README.');
  }

  vi.stubEnv('JWT_SECRET', randomUUID());
  vi.stubEnv('JWT_REFRESH_SECRET', randomUUID());
  vi.stubEnv('CORS_ORIGINS', browserOrigin);
  app = request(createApp(0));
  const passwordHash = await bcrypt.hash(password, 4);
  const viewerEmail = `${randomUUID()}@example.test`;
  const operatorEmail = `${randomUUID()}@example.test`;

  await prisma.$transaction(async (db) => {
    for (const tenant of tenants) {
      const { id: tenantId, slug, email, userId, buildingId, deviceId, alertId, automationId } = tenant;
      await db.tenant.create({ data: { id: tenantId, name: slug, slug, plan: tenant === local ? 'PRO' : 'BASIC' } });
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
    await db.user.createMany({ data: [
      { tenantId: local.id, email: viewerEmail, name: 'Lecteur', passwordHash, role: Role.VIEWER },
      { tenantId: local.id, email: operatorEmail, name: 'Opérateur', passwordHash, role: Role.OPERATOR },
    ] });
  });
  fixturesCreated = true;

  authorization = await bearer(local.email);
  superAuthorization = await bearer(platform.email);
  viewerAuthorization = await bearer(viewerEmail);
  operatorAuthorization = await bearer(operatorEmail);
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

describe('Disponibilité de l’API', () => {
  it('reste vivante pendant une panne et devient disponible après le rétablissement', async () => {
    let available = false;
    const readiness = request(createApp(0, async () => available));
    await readiness.get('/health').expect(200, { status: 'ok' });
    await readiness.get('/ready').expect(503, { status: 'not_ready' });
    available = true;
    await readiness.get('/ready').expect(200, { status: 'ready' });
  });
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
    if (route === 'users') {
      expect(records.map(({ id }: { id: string }) => id)).toContain(ownId);
      expect(records.map(({ id }: { id: string }) => id)).not.toContain(foreign.userId);
      expect(body.total).toBe(3);
    } else {
      expect(records.map(({ id }: { id: string }) => id)).toEqual([ownId]);
      if (route !== 'automations') expect(body.total).toBe(1);
    }
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

  it('valide le bâtiment du résumé et utilise uniquement des requêtes avec ce périmètre', async () => {
    const query = vi.spyOn(database, 'query')
      .mockResolvedValueOnce({ command: 'SELECT', rowCount: 1, oid: 0, fields: [],
        rows: [{ total_kwh: 2, peak_power_w: 3, avg_power_w: 2, device_count: 1 }] })
      .mockResolvedValueOnce({ command: 'SELECT', rowCount: 1, oid: 0, fields: [], rows: [{ value: 3 }] });
    try {
      await app.get(`${api}/energy/summary`).set('Authorization', authorization).expect(400);
      await app.get(`${api}/energy/summary`).set('Authorization', authorization)
        .query({ buildingId: foreign.buildingId, period: '24h' }).expect(404);
      expect(query).not.toHaveBeenCalled();
      await app.get(`${api}/energy/summary`).set('Authorization', authorization)
        .query({ buildingId: local.buildingId, period: '24h' }).expect(200)
        .expect(({ body }) => expect(body).toMatchObject({ currentPowerW: 3, deviceCount: 1 }));
      expect(query).toHaveBeenCalledTimes(2);
      for (const [, params] of query.mock.calls) {
        expect(params?.slice(0, 2)).toEqual([local.id, local.buildingId]);
      }
    } finally {
      query.mockRestore();
    }
  });

  it('refuse une nouvelle relation entre les zones et les bâtiments de tenants distincts', async () => {
    await expect(prisma.zone.create({
      data: { tenantId: foreign.id, buildingId: local.buildingId, name: 'Zone de validation' },
    })).rejects.toMatchObject({ code: 'P2003' });
  });

  it('présente la même réponse pour un abonnement étranger ou inconnu', async () => {
    const getSubscription = (id: string) => app.get(`${api}/tenants/${id}/subscription`)
      .set('Authorization', authorization);
    const foreignResponse = await getSubscription(foreign.id).expect(404);
    const unknownResponse = await getSubscription(randomUUID()).expect(404);
    expect(foreignResponse.body).toEqual(unknownResponse.body);
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
    const previousSession = await bearer(email);
    await app.delete(endpoint).set('Authorization', superAuthorization).expect(204);
    expect(await prisma.tenant.findUnique({ where: { id: tenantId } })).toMatchObject({ isActive: false });
    expect(await prisma.device.count({ where })).toBe(1);
    expect(await prisma.apiKey.count({ where: { ...where, isActive: true } })).toBe(0);
    await app.patch(endpoint).set('Authorization', superAuthorization).send({ isActive: true }).expect(200);
    await app.get(`${api}/auth/me`).set('Authorization', previousSession).expect(401);

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
    expect(body).not.toHaveProperty('accessToken');
    expect(headers['set-cookie']).toEqual(expect.arrayContaining([
      expect.stringMatching(/^access_token=.+; HttpOnly/),
    ]));
  });

  it('réserve le jeton JSON au client hors navigateur', async () => {
    const endpoint = `${api}/auth/token`;
    const { body, headers } = await app.post(endpoint).send({ email: local.email, password }).expect(200);
    expect(body.accessToken).toEqual(expect.any(String));
    expect(headers['set-cookie']).toBeUndefined();
    await app.post(endpoint).set('Origin', browserOrigin).send({ email: local.email, password }).expect(403);
  });

  it('exige une origine approuvée pour les écritures authentifiées par cookie', async () => {
    const session = await login(local.email, password).expect(200);
    const accessCookie = (session.headers['set-cookie'] as unknown as string[])
      .find((cookie) => cookie.startsWith('access_token='))!.split(';', 1)[0];
    await app.patch(`${api}/alerts/${local.alertId}/read`).set('Cookie', accessCookie)
      .set('Origin', 'https://non-autorise.example.test').expect(403);
    await app.patch(`${api}/alerts/${local.alertId}/read`).set('Cookie', accessCookie)
      .set('Origin', browserOrigin).expect(200);
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

describe('Clés API et permissions', () => {
  it('permet la lecture par clé et sa révocation idempotente même après rétrogradation', async () => {
    const { body } = await app.post(`${api}/api-keys`).set('Authorization', authorization)
      .send({ name: 'Clé fictive', scope: 'read' }).expect(201);
    const getDevices = () => app.get(`${api}/devices`).set('X-Api-Key', body.key);
    await getDevices().expect(200).expect(({ body }) => {
      expect(body.data).toMatchObject([{ id: local.deviceId }]);
    });
    await prisma.tenant.update({ where: { id: local.id }, data: { plan: 'BASIC' } });
    try {
      await getDevices().expect(403).expect(({ body }) => expect(body.code).toBe('API_PLAN_REQUIRED'));
      await app.get(`${api}/api-keys`).set('Authorization', authorization).expect(200)
        .expect(({ body: list }) => {
          expect(list[0].id).toBe(body.id);
          expect(list[0]).not.toHaveProperty('keyHash');
        });
      for (let retry = 0; retry < 2; retry++) {
        await app.patch(`${api}/api-keys/${body.id}/revoke`).set('Authorization', authorization).expect(200)
          .expect(({ body }) => expect(body.isActive).toBe(false));
      }
    } finally {
      await prisma.tenant.update({ where: { id: local.id }, data: { plan: 'PRO' } });
    }
    await getDevices().expect(401);
  });

  it('préserve la lecture seule du lecteur et réserve la gestion des appareils aux admins', async () => {
    await app.get(`${api}/alerts`).set('Authorization', viewerAuthorization).expect(200);
    await app.patch(`${api}/alerts/${local.alertId}/read`).set('Authorization', viewerAuthorization).expect(403);
    await app.patch(`${api}/devices/${local.deviceId}`).set('Authorization', operatorAuthorization)
      .send({ name: 'Appareil de test' }).expect(403);
    await app.post(`${api}/devices/${local.deviceId}/control`).set('Authorization', operatorAuthorization)
      .send({ command: 'set_state', params: { state: 'on' } }).expect(400)
      .expect(({ body }) => expect(body.code).toBe('INVALID_DEVICE_COMMAND'));
  });
});

describe('Exports et notifications', () => {
  it('échappe les champs du CSV et traite les valeurs texte ressemblant à des formules comme du texte', async () => {
    const query = vi.spyOn(database, 'query').mockResolvedValueOnce({
      command: 'SELECT', rowCount: 1, oid: 0, fields: [],
      rows: [{ time: new Date(), device_name: 'Capteur "A", zone 2', metric: '=1', value: -2, unit: null }],
    });
    try {
      await app.get(`${api}/reports/csv`).set('Authorization', authorization)
        .query({ buildingId: local.buildingId, from: '2026-11-01', to: '2026-11-02' }).expect(200)
        .expect(({ text }) => expect(text).toContain('"Capteur ""A"", zone 2","\'=1",-2,""'));
    } finally {
      query.mockRestore();
    }
  });

  it('renvoie un échec si le service de notification est indisponible ou refuse l’envoi', async () => {
    const requestUpgrade = () => app.post(`${api}/tenants/current/upgrade-request`)
      .set('Authorization', authorization).send({ requestedPlan: 'BUSINESS' });
    vi.stubEnv('RESEND_API_KEY', '');
    await requestUpgrade().expect(503);

    vi.stubEnv('RESEND_API_KEY', 'cle-de-test');
    vi.stubEnv('RESEND_FROM', 'test@example.test');
    sendEmail.mockResolvedValueOnce({ error: { name: 'refus-test' } });
    await requestUpgrade().expect(502);
    sendEmail.mockResolvedValueOnce({ data: { id: 'envoi-fictif' }, error: null });
    await requestUpgrade().expect(200);
    expect(sendEmail).toHaveBeenLastCalledWith(expect.objectContaining({ to: platform.email, text: expect.any(String) }));
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
