import { randomUUID } from 'node:crypto';
import { Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import type { RequestHandler } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { prisma } from '../src/utils/database';
import * as database from '../src/utils/database';
import { routePath } from '../src/utils/requestRoute';
import { persistTelemetry, type Telemetry } from '../src/services/energyTelemetry';
import { createEnergyTopologyFixture } from './fixtures/energyTopology';

vi.mock('../src/utils/redis', () => ({ default: {}, isRedisConnected: () => false }));
const recordRoute = vi.hoisted(() => vi.fn());
vi.mock('../src/middleware/requestLogger', () => ({
  requestLogger: vi.fn<RequestHandler>((req, res, next) => {
    res.on('finish', () => recordRoute(routePath(req), res.statusCode));
    next();
  }),
}));
vi.mock('../src/utils/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../src/services/refreshSessions', () => ({ startRefreshSession: vi.fn() }));
vi.mock('../src/services/apiKeyUsage', () => ({ consumeApiKeyQuota: vi.fn(async () => true) }));

const sendEmail = vi.hoisted(() => vi.fn());
const publishCommand = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('resend', () => ({ Resend: class { emails = { send: sendEmail }; } }));
vi.mock('../src/services/mqttWorker', () => ({ publishMqtt: publishCommand }));

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
  vi.stubEnv('AFRIXORA_DEVICE_CONTROL_ENABLED', 'false');
  vi.stubEnv('AFRIXORA_AUTOMATION_COMMANDS_ENABLED', 'false');
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
        prisma.controlEndpoint.deleteMany({ where }),
        prisma.meteringPoint.deleteMany({ where }),
        prisma.electricalLoad.deleteMany({ where }),
        prisma.circuit.deleteMany({ where }),
        prisma.distributionBoard.deleteMany({ where }),
        prisma.sourceFeed.deleteMany({ where }),
        prisma.energyBus.deleteMany({ where }),
        prisma.energySource.deleteMany({ where }),
        prisma.deviceState.deleteMany({ where }),
        prisma.deviceCommand.deleteMany({ where }),
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

describe('Journal des commandes', () => {
  it('désactive la publication par défaut sans écrire dans le journal', async () => {
    await app.post(`${api}/devices/${local.deviceId}/control`).set('Authorization', authorization)
      .send({ command: 'set_state', params: { state: 'on' } }).expect(503)
      .expect(({ body }) => expect(body.code).toBe('CONTROL_DISABLED'));
    expect(publishCommand).not.toHaveBeenCalled();
    expect(await prisma.deviceCommand.count({ where: { tenantId: local.id } })).toBe(0);
  });

  it('journalise l’envoi sans confirmer l’état, limite les commandes concurrentes et protège l’historique', async () => {
    const device = await prisma.device.create({ data: {
      tenantId: local.id, buildingId: local.buildingId, name: 'Lampe de test', type: 'LIGHT', isOnline: true,
    } });
    const path = `${api}/devices/${device.id}`;
    const control = () => app.post(`${path}/control`).set('Authorization', operatorAuthorization)
      .send({ command: 'turn_on' });
    vi.stubEnv('AFRIXORA_DEVICE_CONTROL_ENABLED', 'true');
    try {
      await app.post(`${api}/devices/${local.deviceId}/control`).set('Authorization', authorization)
        .send({ command: 'turn_on' }).expect(400);
      await app.post(`${path}/control`).set('Authorization', viewerAuthorization)
        .send({ command: 'turn_on' }).expect(403);

      const responses = await Promise.all([control(), control()]);
      expect(responses.map(({ status }) => status).sort()).toEqual([202, 409]);
      const accepted = responses.find(({ status }) => status === 202)?.body;
      const blocked = responses.find(({ status }) => status === 409)?.body;
      expect(accepted.status).toBe('SENT');
      expect(blocked.code).toBe('COMMAND_IN_PROGRESS');
      expect(publishCommand).toHaveBeenCalledTimes(1);
      expect(await prisma.deviceState.findUnique({ where: { deviceId: device.id } })).toBeNull();

      await app.get(`${path}/commands/${accepted.commandId}`).set('Authorization', authorization).expect(200)
        .expect(({ body }) => expect(body).toMatchObject({ status: 'SENT', params: { state: 'on' } }));
      await app.get(`${api}/devices/${local.deviceId}/commands/${accepted.commandId}`)
        .set('Authorization', authorization).expect(404);
      const foreignAuthorization = await bearer(foreign.email);
      await app.get(`${path}/commands/${accepted.commandId}`).set('Authorization', foreignAuthorization).expect(404);
      await app.delete(path).set('Authorization', authorization).expect(409)
        .expect(({ body }) => expect(body.code).toBe('DEVICE_AUDIT_HISTORY'));

      await prisma.deviceCommand.update({ where: { id: accepted.commandId }, data: { expiresAt: new Date(0) } });
      await app.get(`${path}/commands/${accepted.commandId}`).set('Authorization', authorization).expect(200)
        .expect(({ body }) => expect(body.status).toBe('EXPIRED'));
      await control().expect(202);
    } finally {
      vi.stubEnv('AFRIXORA_DEVICE_CONTROL_ENABLED', 'false');
      await prisma.deviceCommand.deleteMany({ where: { deviceId: device.id, tenantId: local.id } });
      await prisma.device.delete({ where: { id: device.id, tenantId: local.id } });
    }
  });

  it('rejette les références du journal vers un autre tenant ou bâtiment en base', async () => {
    const building = await prisma.building.create({ data: {
      tenantId: local.id, name: 'Bâtiment de test supplémentaire', address: 'Adresse de test',
    } });
    const command = { deviceId: local.deviceId, command: 'set_state', expiresAt: new Date() };
    await expect(prisma.deviceCommand.create({ data: { ...command, tenantId: local.id, buildingId: building.id } }))
      .rejects.toMatchObject({ code: 'P2003' });
    await expect(prisma.deviceCommand.create({ data: { ...command, tenantId: foreign.id, buildingId: foreign.buildingId } }))
      .rejects.toMatchObject({ code: 'P2003' });
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
    const scope = { tenantId, buildingId };
    const { load, circuit } = await createEnergyTopologyFixture(prisma, scope);
    const meter = await prisma.device.create({ data: { ...scope, type: 'ENERGY_METER', name: 'Compteur fictif' } });
    await prisma.$transaction([
      prisma.zone.create({ data: { ...where, buildingId, name: slug } }),
      prisma.gateway.create({ data: { ...where, buildingId, name: slug } }),
      prisma.deviceState.create({ data: { ...where, deviceId, state: {} } }),
      prisma.deviceCommand.create({ data: { ...where, buildingId, deviceId, command: 'set_state', expiresAt: new Date(), status: 'EXPIRED' } }),
      prisma.meteringPoint.create({ data: {
        ...scope, deviceId: meter.id, name: 'Mesure fictive', scope: 'LOAD', loadId: load.id,
        unit: 'W', measurementMode: 'INSTANTANEOUS',
      } }),
      prisma.controlEndpoint.create({ data: { ...scope, deviceId, name: 'Canal fictif', targetCircuitId: circuit.id } }),
      prisma.apiKey.create({ data: { ...where, name: slug, keyHash: randomUUID(), keyPrefix: 'test' } }),
      prisma.apiLog.create({ data: { ...where, method: 'GET', endpoint: '/', statusCode: 200, durationMs: 10, ip: '127.0.0.1' } }),
      prisma.subscriptionHistory.create({ data: { ...where, plan: 'BASIC', status: 'ACTIVE' } }),
    ]);

    const endpoint = `${api}/tenants/${tenantId}`;
    const previousSession = await bearer(email);
    await app.delete(endpoint).set('Authorization', superAuthorization).expect(204);
    expect(await prisma.tenant.findUnique({ where: { id: tenantId } })).toMatchObject({ isActive: false });
    expect(await prisma.device.count({ where })).toBe(2);
    expect(await prisma.deviceCommand.count({ where })).toBe(1);
    expect(await prisma.meteringPoint.count({ where })).toBe(1);
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
      prisma.deviceCommand.count({ where }),
      prisma.energySource.count({ where }),
      prisma.energyBus.count({ where }),
      prisma.sourceFeed.count({ where }),
      prisma.distributionBoard.count({ where }),
      prisma.circuit.count({ where }),
      prisma.electricalLoad.count({ where }),
      prisma.meteringPoint.count({ where }),
      prisma.controlEndpoint.count({ where }),
      prisma.alert.count({ where }),
      prisma.automation.count({ where }),
      prisma.gateway.count({ where }),
      prisma.apiKey.count({ where }),
      prisma.apiLog.count({ where }),
      prisma.subscriptionHistory.count({ where }),
    ])).toEqual(Array(20).fill(0));
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

describe('API de topologie par bâtiment', () => {
  const root = (building: string) => `${api}/energy/buildings/${building}/topology`;
  const base = root(local.buildingId);
  const sourcesTemplate = api + '/energy/buildings/:buildingId/topology/sources';

  it('protège les sites et applique les affectations et leur révocation', async () => {
    const operator = await prisma.user.findFirstOrThrow({ where: { role: 'OPERATOR', tenantId: local.id } });
    const path = base + '/access/' + operator.id;
    recordRoute.mockClear();
    await app.get(base + '/sources').expect(401);
    expect(recordRoute).toHaveBeenCalledWith(sourcesTemplate, 401);
    await app.get(root(foreign.buildingId) + '/sources').set('Authorization', authorization).expect(404);
    await app.get(base + '/sources').set('Authorization', operatorAuthorization).expect(403);
    await app.put(path).set('Authorization', authorization).expect(204);
    await app.get(base + '/sources').set('Authorization', operatorAuthorization).expect(200);
    expect(recordRoute).toHaveBeenCalledWith(sourcesTemplate, 200);
    await app.post(base + '/buses').set('Authorization', operatorAuthorization).send({ name: 'Bus' }).expect(403);
    await app.put(base + '/access/' + foreign.userId).set('Authorization', authorization).expect(404);
    await app.delete(path).set('Authorization', authorization).expect(204);
    await app.get(base + '/sources').set('Authorization', operatorAuthorization).expect(403);
  });
  it('limite un administrateur de bâtiment au site affecté et laisse les routes historiques accessibles', async () => {
    const second = await prisma.building.create({ data: {
      tenantId: local.id, name: 'Deuxième site fictif', address: 'Adresse de test',
    } });
    const admin = await prisma.user.create({ data: {
      tenantId: local.id, name: 'Administrateur de site', email: randomUUID() + '@example.test',
      role: 'BUILDING_ADMIN', passwordHash: await bcrypt.hash(password, 4),
    } });
    const siteAuthorization = await bearer(admin.email);
    const grant = base + '/access/' + admin.id;
    const otherGrant = root(second.id) + '/access/' + admin.id;
    const bus = { name: 'Bus du site affecté' };

    await app.post(base + '/buses').set('Authorization', siteAuthorization).send(bus).expect(403);
    const buildingPath = api + '/buildings/' + local.buildingId;
    await app.patch(buildingPath).set('Authorization', siteAuthorization)
      .send({ timeZone: 'Africa/Kinshasa' }).expect(403);
    await app.put(grant).set('Authorization', authorization).expect(204);
    await app.put(grant).set('Authorization', authorization).expect(204);
    await app.patch(buildingPath).set('Authorization', siteAuthorization).send({ timeZone: 'Mars/Olympus' }).expect(400);
    await app.patch(buildingPath).set('Authorization', siteAuthorization).send({ timeZone: 'Africa/Lubumbashi' })
      .expect(200).expect(({ body }) => expect(body.timeZone).toBe('Africa/Lubumbashi'));
    const { body: created } = await app.post(base + '/buses').set('Authorization', siteAuthorization).send(bus).expect(201);
    await app.get(root(second.id) + '/buses').set('Authorization', siteAuthorization).expect(403);
    await app.put(otherGrant).set('Authorization', siteAuthorization).expect(403);
    await app.get(root(second.id) + '/buses/' + created.id).set('Authorization', authorization).expect(404);
    await app.post(root(second.id) + '/boards').set('Authorization', authorization)
      .send({ name: 'Tableau', busId: created.id }).expect(404);
    await app.delete(grant).set('Authorization', authorization).expect(204);
    await app.delete(grant).set('Authorization', authorization).expect(204);
    await app.patch(base + '/buses/' + created.id).set('Authorization', siteAuthorization)
      .send({ name: 'Bus renommé' }).expect(403);
    await app.get(api + '/buildings/' + second.id).set('Authorization', siteAuthorization).expect(200);
  });

  it('préserve les quatre lectures Énergie avec une clé API valide et réserve la topologie au JWT', async () => {
    const { body } = await app.post(api + '/api-keys').set('Authorization', authorization)
      .send({ name: 'Clé Énergie fictive', scope: 'read' }).expect(201);
    const query = vi.spyOn(database, 'query').mockResolvedValue({
      command: 'SELECT', rowCount: 1, oid: 0, fields: [],
      rows: [{ total_kwh: 0, peak_power_w: 0, avg_power_w: 0, device_count: 0, value: 0 }],
    });
    try {
      await app.get(base + '/sources').set('X-Api-Key', body.key).expect(401);
      expect(query).not.toHaveBeenCalled();
      for (const route of ['summary', 'consumption', 'by-device', 'by-zone']) {
        await app.get(api + '/energy/' + route).set('X-Api-Key', body.key)
          .query({ buildingId: local.buildingId, period: '24h' }).expect(200);
      }
      expect(query).toHaveBeenCalledTimes(5);
      for (const [, params] of query.mock.calls) {
        expect(params?.slice(0, 2)).toEqual([local.id, local.buildingId]);
      }
    } finally {
      query.mockRestore();
    }
  });

  it('crée toute la chaîne, refuse les références étrangères et archive dans l’ordre des dépendances', async () => {
    publishCommand.mockClear();
    const commandCount = await prisma.deviceCommand.count({ where: { tenantId: local.id } });
    const post = (resource: string, data: object) => app.post(base + '/' + resource).set('Authorization', authorization).send(data);
    const create = async (resource: string, data: object) => (await post(resource, data).expect(201)).body.id as string;
    const sourceId = await create('sources', { name: 'Réseau test', type: 'GRID' });
    const busId = await create('buses', { name: 'Bus test' });
    const feedId = await create('feeds', { name: 'Arrivée', sourceId, busId });
    const boardId = await create('boards', { name: 'Tableau', busId });
    const circuit = { name: 'Départ', boardId, code: 'D1', priority: 'IMPORTANT' };
    const circuitId = await create('circuits', circuit);
    await post('circuits', circuit).expect(409);
    await post('circuits', { ...circuit, code: 'D2', priority: 'CRITICAL',
      isControllable: true, autoSheddingAllowed: true }).expect(400);
    const loadId = await create('loads', { name: 'Lampe', circuitId, category: 'LIGHTING', priority: 'FLEXIBLE' });
    const device = await prisma.device.create({ data: { tenantId: local.id, buildingId: local.buildingId, type: 'ENERGY_METER', name: 'Compteur' } });
    const point = { name: 'Point', scope: 'FEED', feedId, deviceId: device.id, measurementMode: 'INTERVAL', unit: 'Wh' };
    const pointId = await create('metering-points', point);
    await post('metering-points', { ...point, sourceId }).expect(400);
    await post('metering-points', { ...point, deviceId: local.deviceId }).expect(400);
    await post('metering-points', { ...point, deviceId: foreign.deviceId }).expect(404);
    const endpoint = { name: 'Canal', targetLoadId: loadId, deviceId: local.deviceId };
    const { body: canal } = await post('control-endpoints', endpoint).expect(201);
    expect(canal).toMatchObject({ isEnabled: false, approvalStatus: 'PENDING', verifiedState: 'UNKNOWN' });
    await post('control-endpoints', { ...endpoint, targetCircuitId: circuitId }).expect(400);
    await post('control-endpoints', { ...endpoint, verifiedState: 'ON' }).expect(400);
    await app.patch(base + '/control-endpoints/' + canal.id).set('Authorization', authorization)
      .send({ isEnabled: true }).expect(400);
    await post('buses', { name: 'Bus', tenantId: foreign.id }).expect(400);
    const source = base + '/sources/' + sourceId;
    await app.patch(source).set('Authorization', authorization).send({ name: 'Réseau renommé' }).expect(200);
    await app.delete(source).set('Authorization', authorization).expect(409);
    const foreignAuthorization = await bearer(foreign.email);
    await app.get(source).set('Authorization', foreignAuthorization).expect(404);
    await app.patch(source).set('Authorization', foreignAuthorization).send({ name: 'Autre' }).expect(404);
    await app.delete(source).set('Authorization', foreignAuthorization).expect(404);
    await app.get(root(foreign.buildingId) + '/sources/' + sourceId).set('Authorization', foreignAuthorization).expect(404);
    const single = await create('buses', { name: 'Bus isolé' });
    await app.delete(base + '/buses/' + single).set('Authorization', authorization).expect(204);
    const archived = await app.get(base + '/buses?archived=true&limit=1').set('Authorization', authorization).expect(200);
    expect(archived.body.data[0].id).toBe(single);
    await post('boards', { name: 'Autre', busId: single }).expect(404);
    const initialResources = [
      ['control-endpoints', canal.id], ['metering-points', pointId], ['loads', loadId],
      ['circuits', circuitId], ['boards', boardId], ['feeds', feedId], ['buses', busId], ['sources', sourceId],
    ];
    for (const [resource, id] of initialResources) {
      await app.delete(base + '/' + resource + '/' + id).set('Authorization', authorization).expect(204);
    }
    await app.get(source).set('Authorization', authorization).expect(200)
      .expect(({ body }) => expect(body.archivedAt).toEqual(expect.any(String)));
    await app.patch(source).set('Authorization', authorization).send({ name: 'Source archivée' }).expect(409);
    expect(publishCommand).not.toHaveBeenCalled();
    expect(await prisma.deviceCommand.count({ where: { tenantId: local.id } })).toBe(commandCount);
  });

  it('empêche un tableau actif de référencer un bus archivé lors de mutations concurrentes', async () => {
    const { body: bus } = await app.post(base + '/buses').set('Authorization', authorization)
      .send({ name: 'Bus pour le test concurrent' }).expect(201);
    const [archive, create] = await Promise.all([
      app.delete(base + '/buses/' + bus.id).set('Authorization', authorization),
      app.post(base + '/boards').set('Authorization', authorization).send({ name: 'Tableau concurrent', busId: bus.id }),
    ]);
    expect([[204, 404], [204, 409], [409, 201]]).toContainEqual([archive.status, create.status]);
    const [parent, children] = await Promise.all([
      prisma.energyBus.findUniqueOrThrow({ where: { id: bus.id } }),
      prisma.distributionBoard.count({ where: { busId: bus.id, archivedAt: null } }),
    ]);
    expect(children).toBe(archive.status === 204 ? 0 : 1);
    expect(Boolean(parent.archivedAt)).toBe(archive.status === 204);
  });
});

describe.runIf(process.env.AFRIXORA_TEST_TIMESCALE === 'true')('Mesures V2 sur TimescaleDB', () => {
  it('persiste une seule fois et calcule 100 kWh au général malgré un sous-compteur à 40 kWh', async () => {
    const site = { tenantId: local.id, buildingId: local.buildingId };
    const topology = await prisma.$transaction(tx => createEnergyTopologyFixture(tx, site));
    const elsewhere = await prisma.$transaction(tx => createEnergyTopologyFixture(tx, {
      tenantId: foreign.id, buildingId: foreign.buildingId,
    }));
    const pv = await prisma.energySource.create({ data: { ...site, name: 'PV fictif', type: 'PV_INVERTER' } });
    const feed = await prisma.sourceFeed.create({ data: {
      ...site, name: 'Arrivée solaire', busId: topology.bus.id, sourceId: pv.id,
    } });
    const device = await prisma.device.create({ data: { ...site, name: 'Compteur', type: 'ENERGY_METER' } });
    const point = { ...site, deviceId: device.id, unit: 'kWh', measurementMode: 'CUMULATIVE', flowDirection: 'IMPORT' } as const;
    const main = await prisma.meteringPoint.create({ data: { ...point, name: 'Général', scope: 'BOARD', boardId: topology.board.id } });
    const sub = await prisma.meteringPoint.create({ data: { ...point, name: 'Sous-compteur', scope: 'CIRCUIT', circuitId: topology.circuit.id } });
    const scope = { ...site, deviceId: device.id };
    const receivedAt = Date.now();
    const bootId = randomUUID();
    const reading = (meteringPointId: string, sequence: number, value: number, sourceFeedId?: string): Telemetry => ({
      schemaVersion: 2, deviceId: device.id, meteringPointId, bootId, sequence, value, sourceFeedId,
      capturedAt: new Date(receivedAt - 600_000 + sequence * 60_000).toISOString(),
      metric: 'energy', unit: 'kWh', measurementMode: 'CUMULATIVE', quality: 'MEASURED', origin: 'DEVICE',
    });

    try {
      const first = reading(main.id, 0, 0, topology.feed.id);
      expect(await Promise.all([persistTelemetry(scope, first, receivedAt), persistTelemetry(scope, first, receivedAt)]))
        .toEqual(expect.arrayContaining(['stored', 'duplicate']));
      expect(await persistTelemetry(scope, { ...first, capturedAt: new Date(receivedAt).toISOString() }, receivedAt)).toBe('duplicate');
      expect(await persistTelemetry(scope, reading(main.id, 1, 60, topology.feed.id), receivedAt)).toBe('stored');
      expect(await persistTelemetry(scope, reading(main.id, 2, 100, feed.id), receivedAt)).toBe('stored');
      expect(await persistTelemetry(scope, reading(main.id, 3, 200, elsewhere.feed.id), receivedAt)).toBe('rejected');
      expect(await persistTelemetry(scope, reading(sub.id, 0, 0), receivedAt)).toBe('stored');
      expect(await persistTelemetry(scope, reading(sub.id, 1, 40), receivedAt)).toBe('stored');

      const route = api + '/energy/metered';
      const query = { buildingId: local.buildingId, meteringPointId: main.id, buildingTotal: 'true',
        from: first.capturedAt, to: new Date(receivedAt).toISOString() };
      const { body } = await app.get(route).set('Authorization', authorization).query(query).expect(200);
      expect(body).toMatchObject({
        measuredKWh: 100, estimatedKWh: null, timeZone: 'Africa/Lubumbashi', samples: 2,
        bySource: expect.arrayContaining([
          expect.objectContaining({ sourceType: 'GRID', measuredKWh: 60 }),
          expect.objectContaining({ sourceType: 'UNKNOWN', measuredKWh: 40 }),
        ]),
      });
      await app.get(route).set('Authorization', authorization).query({ ...query, meteringPointId: sub.id }).expect(400);
      await app.get(route).set('Authorization', authorization).query({
        ...query, meteringPointId: sub.id, buildingTotal: 'false',
      }).expect(200).expect(({ body }) => expect(body.measuredKWh).toBe(40));
      await app.get(route).set('Authorization', operatorAuthorization).query(query).expect(403);
      await app.get(route).set('Authorization', await bearer(foreign.email)).query(query).expect(404);
      await app.get(api + '/readings').set('Authorization', authorization)
        .query({ deviceId: device.id, metric: 'energy', from: query.from, to: query.to }).expect(200)
        .expect(({ body }) => expect(body.total).toBe(0));
    } finally {
      await prisma.$executeRaw`DELETE FROM public.sensor_readings WHERE tenant_id = ${local.id}::uuid
        AND device_id = ${device.id}::uuid AND metering_point_id IS NOT NULL`;
    }
  }, 30_000);
});
