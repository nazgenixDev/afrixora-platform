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
        prisma.fuelTank.deleteMany({ where }),
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
  }, 20_000);

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
      expect(await persistTelemetry(scope, first, receivedAt, true)).toBe('duplicate');
      expect(await persistTelemetry(scope, { ...first, value: first.value + 1 }, receivedAt, true)).toBe('conflict');
      expect(await persistTelemetry(scope, { ...first, capturedAt: new Date(receivedAt).toISOString() }, receivedAt, true)).toBe('conflict');
      expect(await persistTelemetry({ ...scope, buildingId: foreign.buildingId }, first, receivedAt, true)).toBe('rejected');
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

describe.runIf(process.env.AFRIXORA_TEST_TIMESCALE === 'true')('Simulation énergétique avec mesures V2', () => {
  it('simule puis rétablit une charge, journalise une seule fois et isole les tenants', async () => {
    const site = { tenantId: local.id, buildingId: randomUUID() };
    await prisma.building.create({ data: { id: site.buildingId, tenantId: site.tenantId,
      name: 'Bâtiment de simulation', address: 'Adresse fictive' } });
    const topology = await prisma.$transaction(tx => createEnergyTopologyFixture(tx, site));
    await prisma.sourceFeed.update({ where: { id: topology.feed.id }, data: { isAllowed: true } });
    await prisma.circuit.update({ where: { id: topology.circuit.id },
      data: { isControllable: true, autoSheddingAllowed: true } });
    await prisma.electricalLoad.update({ where: { id: topology.load.id },
      data: { isControllable: true, canBeAutomated: true, minOnSeconds: 60, minOffSeconds: 120 } });
    const meter = await prisma.device.create({ data: { ...site, type: 'ENERGY_METER', name: 'Compteur simulation' } });
    const meterScope = { ...site, deviceId: meter.id };
    const point = { ...meterScope, unit: 'W', measurementMode: 'INSTANTANEOUS', flowDirection: 'IMPORT' } as const;
    const demand = await prisma.meteringPoint.create({
      data: { ...point, name: 'Demande générale', scope: 'BOARD', boardId: topology.board.id },
    });
    const load = await prisma.meteringPoint.create({
      data: { ...point, name: 'Demande de la charge', scope: 'LOAD', loadId: topology.load.id },
    });
    const root = api + '/automations/energy-simulation/rules';
    const policy = { version: 1, feedId: topology.feed.id, demandPointId: demand.id,
      availablePowerW: 1000, hysteresisW: 100, maxReadingAgeSeconds: 60, cooldownSeconds: 30,
      minOnSeconds: 60, minOffSeconds: 120, maxActionsPerHour: 4,
      loads: [{ loadId: topology.load.id, meteringPointId: load.id }],
    };

    try {
      await app.post(root).set('Authorization', authorization).send({
        buildingId: site.buildingId, name: 'Règle incompatible', policy: { ...policy, feedId: randomUUID() },
      }).expect(400);
      const { body: rule } = await app.post(root).set('Authorization', authorization)
        .send({ buildingId: site.buildingId, name: 'Simulation fictive', policy }).expect(201);
      expect(rule).toMatchObject({ isActive: false, simulationOnly: true });
      const path = root + '/' + rule.id;
      await app.get(api + '/automations').set('Authorization', authorization).expect(200)
        .expect(({ body }) => expect(body.map((item: { id: string }) => item.id)).not.toContain(rule.id));
      await app.patch(api + '/automations/' + rule.id).set('Authorization', authorization).send({ isActive: true }).expect(404);
      await app.get(root).set('Authorization', authorization).query({ buildingId: site.buildingId }).expect(200)
        .expect(({ body }) => expect(body.data[0].id).toBe(rule.id));
      await app.patch(path).set('Authorization', authorization).send({ buildingId: site.buildingId, isActive: true }).expect(200);
      const receivedAt = Date.now();
      const start = receivedAt - 600_000;
      const stamp = (ms: number) => new Date(start + ms).toISOString();
      const bootId = randomUUID();
      const publishFixture = (meteringPointId: string, value: number, sequence: number, elapsed: number) =>
        persistTelemetry(meterScope, {
          schemaVersion: 2, deviceId: meter.id, meteringPointId, bootId, sequence, value,
          capturedAt: stamp(elapsed), metric: 'power', unit: 'W', measurementMode: 'INSTANTANEOUS',
          quality: 'MEASURED', origin: 'DEVICE', sourceFeedId: topology.feed.id,
        }, receivedAt);
      for (const [value, sequence, elapsed] of [[1350, 0, 0], [850, 1, 180_000]]) {
        expect(await publishFixture(demand.id, value, sequence, elapsed)).toBe('stored');
        expect(await publishFixture(load.id, 400, sequence, elapsed)).toBe('stored');
      }
      const payload = { buildingId: site.buildingId, scenarioId: randomUUID(), requestId: randomUUID(),
        evaluatedAt: stamp(0), protection: 'CLEAR', maintenance: 'CLEAR', site: 'ALLOWED', manual: 'CLEAR',
        initialLoads: [{ loadId: topology.load.id, state: 'ON', changedAt: stamp(-120_000) }],
      };
      const other = await bearer(foreign.email);
      await app.post(path + '/runs').set('Authorization', other).send(payload).expect(404);
      await app.get(path + '/runs').set('Authorization', other).query({ buildingId: site.buildingId }).expect(404);
      await app.post(path + '/runs').set('Authorization', operatorAuthorization).send(payload).expect(403);
      const commandCount = await prisma.deviceCommand.count({ where: site });
      const deviceStates = () => prisma.deviceState.findMany({
        where: { tenantId: local.id }, orderBy: { id: 'asc' },
      });
      const observedStates = await deviceStates();
      publishCommand.mockClear();

      const run = (body: object) => app.post(path + '/runs').set('Authorization', authorization).send(body);
      const [first, duplicate] = await Promise.all([run(payload).expect(200), run(payload).expect(200)]);
      expect(first.body).toEqual(duplicate.body);
      expect(first.body).toMatchObject({ decision: 'SHED', targetLoadId: topology.load.id,
        result: { mode: 'DRY_RUN', measuredDemandW: 1350, projectedDemandAfterW: 950 } });
      await run({ ...payload, manual: 'HOLD' }).expect(409);
      await run({ ...payload, requestId: randomUUID(), initialLoads: [] }).expect(409);
      await run({ ...payload, initialLoads: [], requestId: randomUUID(), evaluatedAt: stamp(180_000) }).expect(200)
        .expect(({ body }) => expect(body).toMatchObject({ decision: 'RESTORE',
          result: { measuredDemandW: 850, projectedDemandAfterW: 850 } }));

      await app.patch(path).set('Authorization', authorization).send({ buildingId: site.buildingId, isActive: false }).expect(200);
      await run({ ...payload, initialLoads: [], requestId: randomUUID(), evaluatedAt: stamp(180_001) }).expect(200)
        .expect(({ body }) => expect(body).toMatchObject({ decision: 'NO_ACTION', reason: 'RULE_DISABLED' }));
      await app.get(path + '/runs').set('Authorization', authorization).query({ buildingId: site.buildingId, limit: 1 })
        .expect(200).expect(({ body }) => expect(body).toMatchObject({ total: 3, totalPages: 3 }));
      expect(await prisma.deviceCommand.count({ where: site })).toBe(commandCount);
      expect(await deviceStates()).toEqual(observedStates);
      expect(publishCommand).not.toHaveBeenCalled();
    } finally {
      await prisma.$executeRaw`DELETE FROM public.sensor_readings WHERE tenant_id = ${local.id}::uuid
        AND device_id = ${meter.id}::uuid AND metering_point_id IS NOT NULL`;
    }
  }, 30_000);
});

describe.runIf(process.env.AFRIXORA_TEST_TIMESCALE === 'true')('Tarifs et coûts par bâtiment', () => {
  it('versionne les tarifs, chiffre un seul point général et cloisonne l’accès financier', async () => {
    const site = { tenantId: local.id, buildingId: randomUUID() };
    await prisma.building.create({ data: { id: site.buildingId, tenantId: site.tenantId,
      name: 'Bâtiment de recette financière', address: 'Adresse fictive' } });
    const topology = await prisma.$transaction(tx => createEnergyTopologyFixture(tx, site));
    const device = await prisma.device.create({ data: { ...site, name: 'Compteur financier', type: 'ENERGY_METER' } });
    const common = { ...site, deviceId: device.id, unit: 'kWh', measurementMode: 'CUMULATIVE', flowDirection: 'IMPORT' } as const;
    const main = await prisma.meteringPoint.create({ data: { ...common, name: 'Général', scope: 'BOARD', boardId: topology.board.id } });
    const sub = await prisma.meteringPoint.create({ data: { ...common, name: 'Divisionnaire', scope: 'CIRCUIT', circuitId: topology.circuit.id } });
    const generator = await prisma.energySource.create({ data: { ...site, name: 'Groupe fictif', type: 'GENERATOR' } });
    const root = api + '/energy/finance';
    const receivedAt = Date.now();
    const start = receivedAt - 600_000;
    const at = (minute: number) => new Date(start + minute * 60_000).toISOString();
    const baseTariff = { buildingId: site.buildingId, sourceId: topology.source.id, unit: 'KWH' };
    const adminPost = (resource: string, data: object) =>
      app.post(root + resource).set('Authorization', authorization).send(data);
    const adminGet = (resource: string, query: object) =>
      app.get(root + resource).set('Authorization', authorization).query(query);

    try {
      await adminPost('/tariffs', { ...baseTariff, currency: 'USD', unitPrice: 0.335, effectiveFrom: at(0) }).expect(400);
      const first = await adminPost('/tariffs', { ...baseTariff, currency: 'USD', unitPrice: '0.335', effectiveFrom: at(0) }).expect(201);
      const second = await adminPost('/tariffs', { ...baseTariff, currency: 'CDF', unitPrice: '1000', effectiveFrom: at(1) }).expect(201);
      await adminPost('/tariffs', { ...baseTariff, currency: 'USD', unitPrice: '0.50', effectiveFrom: at(0), effectiveTo: at(2) }).expect(409);
      await adminGet('/tariffs', { buildingId: site.buildingId, sourceId: topology.source.id }).expect(200)
        .expect(({ body }) => expect(body.data).toMatchObject([
          { id: second.body.id, currency: 'CDF', unitPrice: '1000' },
          { id: first.body.id, currency: 'USD', effectiveTo: at(1), unitPrice: '0.335' },
        ]));
      const rate = await adminPost('/exchange-rates', { buildingId: site.buildingId, cdfPerUsd: '2500',
        rateSource: 'Taux de recette fictif', effectiveFrom: at(0) }).expect(201);

      const bootId = randomUUID();
      for (const [point, quantities] of [[main, [0, 1, 2]], [sub, [0, 0.4, 0.8]]] as const) {
        for (const [sequence, value] of quantities.entries()) {
          expect(await persistTelemetry({ ...site, deviceId: device.id }, {
            schemaVersion: 2, deviceId: device.id, meteringPointId: point.id, bootId, sequence, value,
            capturedAt: at(sequence), metric: 'energy', unit: 'kWh', measurementMode: 'CUMULATIVE',
            quality: 'MEASURED', origin: 'DEVICE', sourceFeedId: topology.feed.id,
          }, receivedAt)).toBe('stored');
        }
      }
      const window = { buildingId: site.buildingId, from: at(0), to: at(2) };
      const costs = { ...window, meteringPointId: main.id, currency: 'USD' };
      await adminGet('/costs', costs).expect(200).expect(({ body }) => expect(body).toMatchObject({
        calculatedAmount: '0.74', estimatedAmount: null, hasMissingData: false,
        bySource: [{ sourceId: topology.source.id, measuredKWh: '2', unpricedKWh: '0' }],
        references: [{ tariff: { id: first.body.id }, exchangeRate: null },
          { tariff: { id: second.body.id }, exchangeRate: { id: rate.body.id } }],
      }));
      await adminGet('/costs', { ...costs, currency: 'CDF', to: at(3) }).expect(200)
        .expect(({ body }) => expect(body).toMatchObject({ calculatedAmount: '1837.50', hasMissingData: true }));
      await adminGet('/costs', { ...costs, meteringPointId: sub.id }).expect(400);
      await adminGet('/costs', { ...costs, from: at(3), to: at(4) }).expect(200)
        .expect(({ body }) => expect(body).toMatchObject({ calculatedAmount: null, hasMissingData: true }));
      await adminGet('/tariffs', { buildingId: local.buildingId, sourceId: topology.source.id }).expect(404);
      const other = await bearer(foreign.email);
      await app.get(root + '/costs').set('Authorization', other).query(costs).expect(404);
      await app.get(root + '/exchange-rates').set('Authorization', operatorAuthorization).query({ buildingId: site.buildingId }).expect(403);
      await app.post(root + '/tariffs').set('Authorization', other)
        .send({ ...baseTariff, currency: 'USD', unitPrice: '0.5', effectiveFrom: at(3) }).expect(404);

      const nextRate = { buildingId: site.buildingId, cdfPerUsd: '2600',
        rateSource: 'Révision fictive', effectiveFrom: at(3) };
      const updates = await Promise.all([adminPost('/exchange-rates', nextRate), adminPost('/exchange-rates', nextRate)]);
      expect(updates.map(response => response.status).sort()).toEqual([201, 409]);
      await adminGet('/exchange-rates', { buildingId: site.buildingId }).expect(200)
        .expect(({ body }) => expect(body.data).toMatchObject([
          { effectiveFrom: at(3), cdfPerUsd: '2600' },
          { id: rate.body.id, effectiveTo: at(3) },
        ]));

      const operating = { buildingId: site.buildingId, sourceId: generator.id, periodFrom: at(0), periodTo: at(2),
        currency: 'USD', fuelLitres: '10.5', fuelQuality: 'MEASURED', fuelPricePerLitre: '1.25',
        engineHours: '0.02', hoursQuality: 'ESTIMATED', maintenanceCostPerHour: '25' };
      await adminPost('/generator-costs', operating).expect(201);
      await adminPost('/generator-costs', operating).expect(409);
      await adminGet('/generator-costs', { ...window, sourceId: generator.id, currency: 'USD' }).expect(200)
        .expect(({ body }) => expect(body.data[0].quote).toMatchObject({
          calculatedAmount: '13.13', estimatedAmount: '0.50', hasMissingData: false,
        }));
    } finally {
      await prisma.$executeRaw`DELETE FROM public.sensor_readings WHERE tenant_id = ${local.id}::uuid
        AND device_id = ${device.id}::uuid AND metering_point_id IS NOT NULL`;
    }
  }, 30_000);
});

describe.runIf(process.env.AFRIXORA_TEST_TIMESCALE === 'true')('Bilan de carburant des groupes', () => {
  it('calibre les relevés, compare la production, versionne le rapport et protège les alertes', async () => {
    const site = { tenantId: local.id, buildingId: randomUUID() };
    await prisma.building.create({ data: { id: site.buildingId, tenantId: site.tenantId, name: 'Site carburant fictif', address: 'Adresse fictive' } });
    const source = await prisma.energySource.create({ data: { ...site, name: 'Groupe fictif', type: 'GENERATOR' } });
    const probe = await prisma.device.create({ data: { ...site, name: 'Sonde fictive', type: 'SENSOR' } });
    const meter = await prisma.device.create({ data: { ...site, name: 'Compteur fictif', type: 'ENERGY_METER' } });
    const point = await prisma.meteringPoint.create({ data: { ...site, name: 'Production du groupe', sourceId: source.id,
      deviceId: meter.id, scope: 'SOURCE', unit: 'kWh', measurementMode: 'CUMULATIVE', flowDirection: 'EXPORT' } });
    const root = api + '/energy/fuel';
    const post = (resource: string, data: object) => app.post(root + resource).set('Authorization', authorization).send(data);
    const get = (resource: string, query: object) => app.get(root + resource).set('Authorization', authorization).query(query);
    const now = Date.now();
    const at = (minute: number) => new Date(now - (90 - minute) * 60_000).toISOString();
    const tankInput = { name: 'Cuve fictive', buildingId: site.buildingId, sourceId: source.id,
      probeDeviceId: probe.id, productionPointId: point.id };
    const profile = { points: [{ levelMm: '0', litres: '0' }, { levelMm: '200', litres: '200' }],
      noiseMm: '0.1', toleranceLitres: '1', thermalCoefficientPerC: '0.001', maxIntervalMinutes: 60,
      minLitresPerKWh: '0.3', maxLitresPerKWh: '0.4', maxIdleLitresPerHour: '1' };

    try {
      await post('/tanks', { ...tankInput, probeDeviceId: foreign.deviceId }).expect(404);
      const { body: tank } = await post('/tanks', tankInput).expect(201);
      await app.delete(api + '/devices/' + probe.id).set('Authorization', authorization).expect(400)
        .expect(({ body }) => expect(body.code).toBe('FOREIGN_KEY_CONSTRAINT_VIOLATION'));
      const context = { buildingId: site.buildingId, tankId: tank.id };
      const period = { ...context, from: at(1), to: at(31) };
      const { body: calibration } = await post('/calibrations', { ...context, effectiveFrom: at(0), profile }).expect(201);
      await post('/readings', { ...context, capturedAt: at(1), levelMm: '100', temperatureC: '20',
        quality: 'MEASURED', intervalState: 'UNKNOWN' }).expect(201);
      await post('/readings', { ...context, capturedAt: at(31), levelMm: '113', temperatureC: '20',
        quality: 'MEASURED', intervalState: 'RUNNING' }).expect(201);
      await post('/calibrations', { ...context, effectiveFrom: at(21), profile }).expect(409);
      await post('/assessments', period).expect(200).expect(({ body }) =>
        expect(body).toMatchObject({ status: 'INDETERMINATE', reason: 'PRODUCTION_INCOMPLETE', report: null }));

      const bootId = randomUUID();
      for (const [sequence, value] of [4, 24].entries()) {
        expect(await persistTelemetry({ ...site, deviceId: meter.id }, { deviceId: meter.id, schemaVersion: 2,
          meteringPointId: point.id, metric: 'energy', bootId, sequence, value, capturedAt: at(1 + 30 * sequence),
          unit: 'kWh', quality: 'MEASURED', measurementMode: 'CUMULATIVE', origin: 'DEVICE' }, now)).toBe('stored');
      }
      await get('/balance', period).expect(200).expect(({ body }) => expect(body).toMatchObject({
        status: 'SURPLUS_TO_REVIEW', report: null, productionKWh: '20', calibrationId: calibration.id,
      }));
      const report = await post('/assessments', period).expect(200);
      const alertId = report.body.report.alertId;
      expect(alertId).toEqual(expect.any(String));
      await post('/assessments', period).expect(200).expect(({ body }) => expect(body.report.id).toBe(report.body.report.id));
      const delivery = { ...context, deliveredAt: at(16), litresAt20C: '20', uncertaintyLitres: '1', reference: 'LIV-TEST' };
      await post('/deliveries', delivery).expect(201);
      await post('/deliveries', delivery).expect(409);
      await post('/assessments', period).expect(200).expect(({ body }) => expect(body).toMatchObject({
        status: 'WITHIN_RANGE', observedLitres: { min: '5.800', max: '8.200' }, report: { alertId: null },
      }));
      await get('/assessments', context).expect(200).expect(({ body }) => expect(body.total).toBe(2));
      await post('/calibrations', { ...context, effectiveFrom: at(36), profile }).expect(201);
      await post('/readings', { ...context, capturedAt: at(40), levelMm: '113', temperatureC: '20',
        quality: 'MEASURED', intervalState: 'STOPPED' }).expect(201);
      await get('/balance', { ...context, from: at(31), to: at(40) }).expect(200).expect(({ body }) =>
        expect(body).toMatchObject({ status: 'INDETERMINATE', reason: 'CALIBRATION_CHANGED' }));

      const other = await bearer(foreign.email);
      await app.get(root + '/assessments').set('Authorization', other).query(context).expect(404);
      await get('/assessments', { buildingId: local.buildingId, tankId: tank.id }).expect(404);
      await app.get(root + '/assessments').set('Authorization', operatorAuthorization).query(context).expect(403);
      const listAlerts = (header: string) => app.get(api + '/alerts').set('Authorization', header)
        .query({ buildingId: site.buildingId, type: 'FUEL_DISCREPANCY' });
      await listAlerts(authorization).expect(200).expect(({ body }) =>
        expect(body.data).toMatchObject([{ id: alertId, message: 'Écart de carburant à vérifier.', resolvedAt: expect.any(String) }]));
      await listAlerts(operatorAuthorization).expect(200).expect(({ body }) => expect(body.total).toBe(0));
      await app.patch(api + '/alerts/' + alertId + '/read').set('Authorization', operatorAuthorization).expect(404);
      await prisma.buildingAccess.create({ data: { ...site, userId: (await prisma.user.findFirstOrThrow({
        where: { tenantId: local.id, role: 'OPERATOR' }, select: { id: true },
      })).id } });
      await listAlerts(operatorAuthorization).expect(200).expect(({ body }) => expect(body.total).toBe(1));
      expect(publishCommand).not.toHaveBeenCalled();
    } finally {
      await prisma.$executeRaw`DELETE FROM public.sensor_readings WHERE tenant_id = ${local.id}::uuid
        AND device_id = ${meter.id}::uuid AND metering_point_id IS NOT NULL`;
    }
  }, 30_000);
});

describe('Maintenance programmée', () => {
  it('contrôle le compteur, les droits, le cycle du ticket et le recalcul après intervention', async () => {
    publishCommand.mockClear();
    const site = { tenantId: local.id, buildingId: randomUUID() };
    await prisma.building.create({ data: { id: site.buildingId, tenantId: site.tenantId,
      name: 'Site de maintenance fictif', address: 'Adresse fictive', timeZone: 'Africa/Lubumbashi' } });
    const source = await prisma.energySource.create({ data: { ...site, name: 'Groupe d’essai', type: 'GENERATOR' } });
    const spare = await prisma.energySource.create({ data: { ...site, name: 'Autre groupe d’essai', type: 'GENERATOR' } });
    const root = api + '/energy/maintenance';
    const post = (route: string, data: object) => app.post(root + route).set('Authorization', authorization).send(data);
    const get = (route: string, query: object) => app.get(root + route).set('Authorization', authorization).query(query);
    const context = { buildingId: site.buildingId };
    const clock = Date.now();
    const at = (shift: number) => new Date(clock + shift * 3_600_000).toISOString();
    const index = { ...context, sourceId: source.id };
    const { body: initial } = await post('/hours', { ...index, capturedAt: at(-12), totalHours: '100' }).expect(201);
    await post('/hours', { ...index, capturedAt: at(-1), totalHours: '104' }).expect(201);
    await post('/hours', { ...index, capturedAt: at(-2), totalHours: '105' }).expect(409);
    await post('/hours', { ...index, capturedAt: at(-2), totalHours: '103' }).expect(201);
    await post('/hours', { ...index, capturedAt: at(1), totalHours: '105' }).expect(400);
    await get('/hours', { ...index, limit: 1 }).expect(200).expect(({ body }) => expect(body).toMatchObject({ total: 3, totalPages: 3 }));

    const planInput = { ...index, title: 'Entretien planifié', manufacturerReference: 'Guide fictif § 4',
      intervalHours: '4', intervalDays: 90, startsAt: at(-12), initialReadingId: initial.id };
    await post('/plans', { ...planInput, sourceId: spare.id }).expect(404);
    const { body: plan } = await post('/plans', planInput).expect(201);
    await get('/plans', context).expect(200).expect(({ body }) => expect(body.data[0].schedule).toMatchObject({
      status: 'DUE', dueTotalHours: '104', hoursDue: true, timeZone: 'Africa/Lubumbashi',
    }));

    const ticketInput = { ...context, planId: plan.id, responsibleUserId: local.userId, description: 'Entretien fictif du groupe' };
    await post('/tickets', { ...ticketInput, responsibleUserId: foreign.userId }).expect(404);
    const { body: ticket } = await post('/tickets', ticketInput).expect(201);
    await post('/tickets', ticketInput).expect(409);
    const ticketRef = { ...context, ticketId: ticket.id };
    const patch = (action: object) => app.patch(root + '/tickets').set('Authorization', authorization).send({ ...ticketRef, ...action });
    const operator = await prisma.user.findFirstOrThrow({ where: { tenantId: local.id, role: 'OPERATOR' } });
    await patch({ action: 'ASSIGN', responsibleUserId: operator.id }).expect(404);
    await app.get(root + '/plans').set('Authorization', operatorAuthorization).query(context).expect(403);
    await prisma.buildingAccess.create({ data: { ...site, userId: operator.id } });
    await patch({ action: 'ASSIGN', responsibleUserId: operator.id }).expect(200);
    await patch({ action: 'START' }).expect(200);
    const performedAt = new Date().toISOString();
    const { body: wrongReading } = await post('/hours', { ...context, sourceId: spare.id, capturedAt: performedAt, totalHours: '1' }).expect(201);
    const { body: reading } = await post('/hours', { ...index, capturedAt: performedAt, totalHours: '104.5' }).expect(201);
    const completion = { ...ticketRef, performedAt, work: 'Entretien réalisé et consigné.' };
    await post('/interventions', completion).expect(400);
    await post('/interventions', { ...completion, readingId: wrongReading.id }).expect(404);
    await post('/interventions', { ...completion, readingId: reading.id }).expect(201)
      .expect(({ body }) => expect(body).toMatchObject({ status: 'COMPLETED', performedTotalHours: '104.5' }));
    await post('/interventions', { ...completion, readingId: reading.id }).expect(409);

    await get('/plans', context).expect(200).expect(({ body }) => expect(body.data[0].schedule).toMatchObject({
      status: 'PLANNED', dueTotalHours: '108.5', hoursDue: false,
    }));
    await get('/events', ticketRef).expect(200).expect(({ body }) => {
      expect(body.data.map((row: { type: string }) => row.type)).toEqual(['INTERVENTION', 'STARTED', 'ASSIGNED', 'OPENED']);
      expect(body.data[0]).toMatchObject({ actorUserId: local.userId, details: { readingId: reading.id, responsibleUserId: operator.id } });
    });
    const other = await bearer(foreign.email);
    await app.get(root + '/events').set('Authorization', other).query(ticketRef).expect(404);
    await get('/events', { ...ticketRef, buildingId: local.buildingId }).expect(404);
    await app.post(root + '/tickets').set('Authorization', operatorAuthorization).send(ticketInput).expect(403);
    expect(publishCommand).not.toHaveBeenCalled();
  }, 30_000);
});
