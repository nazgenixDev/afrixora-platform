import { randomUUID } from 'node:crypto';
import { Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { socketAuth } from '../src/middleware/socketAuth';
import { prisma } from '../src/utils/database';

vi.mock('../src/utils/redis', () => ({ default: {}, isRedisConnected: () => false }));
vi.mock('../src/middleware/requestLogger', () => ({
  requestLogger: vi.fn((_req, _res, next: () => void) => next()),
}));
vi.mock('../src/utils/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const api = '/api/v1';
const browserOrigin = 'http://localhost:3000';
const app = request(createApp(0));
const password = 'mot-de-passe-de-test';
const tenants = [createFixture('a'), createFixture('b'), createFixture('plateforme'), createFixture('suppression')] as const;
const [local, foreign, platform, removable] = tenants;
let accessCookie: string;
let superAccessCookie: string;

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
    commandId: randomUUID(),
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

function accessCookieFrom(cookies: unknown): string {
  const cookie = Array.isArray(cookies) && cookies.find(
    (value): value is string => typeof value === 'string' && value.startsWith('access_token='),
  );
  if (!cookie) throw new Error('Cookie de session attendu');
  return cookie.split(';')[0];
}

let fixturesCreated = false;

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('Renseigner DATABASE_URL avec une base PostgreSQL de test migrée. Voir le README.');
  }

  vi.stubEnv('CORS_ORIGINS', browserOrigin);
  vi.stubEnv('AFRIXORA_DEVICE_CONTROL_ENABLED', 'false');
  vi.stubEnv('AFRIXORA_AUTOMATION_COMMANDS_ENABLED', 'false');
  vi.stubEnv('JWT_SECRET', randomUUID());
  vi.stubEnv('JWT_REFRESH_SECRET', randomUUID());
  const passwordHash = await bcrypt.hash(password, 4);

  await prisma.$transaction(async (db) => {
    for (const tenant of tenants) {
      const { id: tenantId, slug, email, userId, buildingId, deviceId, alertId, automationId, commandId } = tenant;
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
      await db.deviceCommand.create({
        data: {
          id: commandId, tenantId, buildingId, deviceId, status: 'SENT',
          command: 'set_state', params: { state: 'off' }, expiresAt: new Date(Date.now() + 3_600_000),
        },
      });
    }
  });
  fixturesCreated = true;

  const response = await login(local.email, password).expect(200);
  accessCookie = accessCookieFrom(response.headers['set-cookie']);
  const superResponse = await login(platform.email, password).expect(200);
  superAccessCookie = accessCookieFrom(superResponse.headers['set-cookie']);
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

describe('Isolation entre tenants', () => {
  it.each([
    ['devices', local.deviceId],
    ['alerts', local.alertId],
    ['automations', local.automationId],
    ['users', local.userId],
    ['buildings', local.buildingId],
  ])('filtre la liste %s, même avec un en-tête de tenant étranger', async (route, ownId) => {
    const { body } = await app.get(`${api}/${route}`)
      .set('Cookie', accessCookie).set('Origin', browserOrigin)
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
    await app.get(`${api}/${ownPath}`).set('Cookie', accessCookie).set('Origin', browserOrigin).expect(200);
    await app.get(`${api}/${foreignPath}`).set('Cookie', accessCookie).set('Origin', browserOrigin).expect(404);
  });

  it.each([
    [`devices/${foreign.deviceId}`, { name: 'Modification étrangère' }],
    [`alerts/${foreign.alertId}/read`, {}],
    [`automations/${foreign.automationId}`, { isActive: false }],
    [`users/${foreign.userId}/toggle`, {}],
  ])('refuse la modification de %s', async (path, payload) => {
    await app.patch(`${api}/${path}`).set('Cookie', accessCookie).set('Origin', browserOrigin).send(payload).expect(404);
  });

  it('autorise la création de zone dans son bâtiment et la refuse dans un bâtiment étranger', async () => {
    const payload = { name: 'Zone de test' };
    await app.post(`${api}/buildings/${local.buildingId}/zones`)
      .set('Cookie', accessCookie).set('Origin', browserOrigin).send(payload).expect(201);
    await app.post(`${api}/buildings/${foreign.buildingId}/zones`)
      .set('Cookie', accessCookie).set('Origin', browserOrigin).send(payload).expect(404);
  });
});

describe('Actions de commande des automatisations', () => {
  it.each(['turn_on', 'turn_off', 'set_state'])('accepte la commande compatible %s', async (command) => {
    const payload = {
      ...automationInput(local),
      action: {
        type: 'DEVICE_COMMAND', deviceId: local.deviceId, command,
        ...(command === 'set_state' ? { params: { state: 'off' } } : {}),
      },
    };
    await app.post(`${api}/automations`).set('Cookie', accessCookie).set('Origin', browserOrigin)
      .send(payload).expect(201).expect(({ body }) => expect(body.action.command).toBe(command));
  });

  it.each([
    { command: 'set_state', params: { state: 'invalide' } },
    { command: 'set_state' },
    { command: 'unsupported' },
  ])('rejette une action de commande incompatible', async (action) => {
    const payload = {
      ...automationInput(local),
      action: { type: 'DEVICE_COMMAND', deviceId: local.deviceId, ...action },
    };
    await app.post(`${api}/automations`).set('Cookie', accessCookie).set('Origin', browserOrigin)
      .send(payload).expect(400);
  });
});

describe('Journal de commandes', () => {
  const endpoint = (deviceId: string, commandId: string) => `${api}/devices/${deviceId}/commands/${commandId}`;

  it('limite la lecture au tenant et à l’appareil authentifiés', async () => {
    await app.get(endpoint(local.deviceId, local.commandId)).set('Cookie', accessCookie)
      .expect(200).expect(({ body }) => expect(body.status).toBe('SENT'));
    await app.get(endpoint(foreign.deviceId, foreign.commandId)).set('Cookie', accessCookie)
      .set('X-Tenant-Id', foreign.id).expect(404);
    await app.get(endpoint(local.deviceId, foreign.commandId)).set('Cookie', accessCookie).expect(404);
    await app.get(endpoint(local.deviceId, 'invalide')).set('Cookie', accessCookie).expect(400);
  });

  it('refuse en base une commande liée à un autre tenant ou bâtiment', async () => {
    const data = { deviceId: local.deviceId, command: 'set_state', expiresAt: new Date() };
    await expect(prisma.deviceCommand.create({
      data: { ...data, tenantId: foreign.id, buildingId: local.buildingId },
    })).rejects.toMatchObject({ code: 'P2003' });
    await expect(prisma.deviceCommand.create({
      data: { ...data, tenantId: local.id, buildingId: foreign.buildingId },
    })).rejects.toMatchObject({ code: 'P2003' });
  });

  it('expire une commande restée sans accusé', async () => {
    const command = await prisma.deviceCommand.create({
      data: {
        tenantId: local.id, buildingId: local.buildingId, deviceId: local.deviceId,
        command: 'set_state', status: 'SENT', expiresAt: new Date(0),
      },
    });
    await app.get(endpoint(local.deviceId, command.id)).set('Cookie', accessCookie)
      .expect(200).expect(({ body }) => expect(body.status).toBe('EXPIRED'));
    const journal = await prisma.deviceCommand.findUniqueOrThrow({ where: { id: command.id } });
    expect(journal.status).toBe('EXPIRED');
    expect(journal.confirmedAt).toBeNull();
  });

  it('bloque le pilotage par défaut sans écrire dans le journal ni l’état', async () => {
    const where = { tenantId: local.id, deviceId: local.deviceId };
    const count = await prisma.deviceCommand.count({ where });
    await app.post(`${api}/devices/${local.deviceId}/control`)
      .set('Cookie', accessCookie).set('Origin', browserOrigin)
      .send({ command: 'set_state', params: { state: 'on' } })
      .expect(503).expect(({ body }) => expect(body.code).toBe('CONTROL_DISABLED'));
    expect(await prisma.deviceCommand.count({ where })).toBe(count);
    expect(await prisma.deviceState.count({ where })).toBe(0);
  });

  it('protège le journal lors de la suppression d’un appareil', async () => {
    await app.delete(`${api}/devices/${local.deviceId}`)
      .set('Cookie', accessCookie).set('Origin', browserOrigin)
      .expect(409).expect(({ body }) => expect(body.code).toBe('DEVICE_AUDIT_HISTORY'));
    expect(await prisma.deviceCommand.count({ where: { tenantId: local.id, deviceId: local.deviceId } }))
      .toBeGreaterThan(0);
  });
});

describe('Contrôle de l’origine', () => {
  it('refuse une mutation par cookie sans origine ou depuis une origine étrangère', async () => {
    const endpoint = `${api}/auth/logout`;
    await app.post(endpoint).set('Cookie', accessCookie).expect(403);
    await app.post(endpoint).set('Cookie', accessCookie).set('Origin', 'https://exemple.test').expect(403);
  });

  it('vérifie l’origine et la session du handshake Socket.IO', async () => {
    for (const [origin, accepted] of [[browserOrigin, true], ['https://exemple.test', false]] as const) {
      const handshake = {
        headers: { cookie: accessCookie, origin },
        auth: {},
      };
      const socket = { handshake, data: {} } as Parameters<typeof socketAuth>[0];
      const error = await new Promise<Error | undefined>(resolve => {
        void socketAuth(socket, resolve);
      });
      if (accepted) {
        expect(error).toBeUndefined();
        expect(socket.data.user.tenantId).toBe(local.id);
      } else {
        expect(error?.message).toBe('Origine refusée');
      }
    }
  });
});

describe('Suppression définitive des clients', () => {
  it('réserve la suppression au super administrateur', async () => {
    const endpoint = `${api}/tenants/${local.id}/permanent`;
    await app.delete(endpoint).expect(401);
    await app.delete(endpoint).set('Cookie', accessCookie).set('Origin', browserOrigin).expect(403);
  });

  it('protège le tenant qui héberge un compte super administrateur', async () => {
    await app.delete(`${api}/tenants/${platform.id}/permanent`)
      .set('Cookie', superAccessCookie).set('Origin', browserOrigin).set('X-Tenant-Id', foreign.id)
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
    await app.delete(endpoint).set('Cookie', superAccessCookie).set('Origin', browserOrigin).expect(204);
    expect(await prisma.tenant.findUnique({ where: { id: tenantId } })).toMatchObject({ isActive: false });
    expect(await prisma.device.count({ where })).toBe(1);

    await app.delete(`${endpoint}/permanent`).set('Cookie', superAccessCookie).set('Origin', browserOrigin)
      .set('X-Tenant-Id', foreign.id).expect(204);
    expect(await prisma.tenant.findUnique({ where: { id: tenantId } })).toBeNull();
    expect(await prisma.$transaction([
      prisma.user.count({ where }),
      prisma.building.count({ where }),
      prisma.zone.count({ where }),
      prisma.device.count({ where }),
      prisma.deviceState.count({ where }),
      prisma.deviceCommand.count({ where }),
      prisma.alert.count({ where }),
      prisma.automation.count({ where }),
      prisma.gateway.count({ where }),
      prisma.apiKey.count({ where }),
      prisma.apiLog.count({ where }),
      prisma.subscriptionHistory.count({ where }),
    ])).toEqual(Array(12).fill(0));
    expect(await prisma.device.count({ where: { tenantId: foreign.id } })).toBe(1);
    await login(email, password).expect(401);
    await app.delete(`${endpoint}/permanent`).set('Cookie', superAccessCookie).set('Origin', browserOrigin).expect(404);
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

  it('émet un Bearer de client hors navigateur sans poser de cookie', async () => {
    const { body, headers } = await app.post(`${api}/auth/token`)
      .send({ email: local.email, password }).expect(200);
    expect(headers['set-cookie']).toBeUndefined();
    expect(headers['cache-control']).toBe('no-store');
    expect(body.user).toMatchObject({ id: local.userId, tenantId: local.id });
    expect(body.user).not.toHaveProperty('jwtVersion');
    expect(body.accessToken).toEqual(expect.any(String));

    const authorization = `Bearer ${body.accessToken}`;
    await app.get(`${api}/devices/${local.deviceId}`).set('Authorization', authorization).expect(200);
    await app.get(`${api}/devices/${foreign.deviceId}`).set('Authorization', authorization).expect(404);
  });

  it('refuse d’émettre un Bearer dans une session navigateur', async () => {
    const payload = { email: local.email, password };
    await app.post(`${api}/auth/token`).set('Origin', browserOrigin).send(payload).expect(403);
    await app.post(`${api}/auth/token`).set('Sec-Fetch-Site', 'same-origin').send(payload).expect(403);
    await app.post(`${api}/auth/token`).set('Cookie', accessCookie).send(payload).expect(403);
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
    const { body } = await app.get(`${api}/devices`).set('Cookie', accessCookie).set('Origin', browserOrigin)
      .query({ page: 1, limit: 1, isOnline: 'false', type: 'SENSOR' }).expect(200);
    expect(body).toMatchObject({ page: 1, total: 1, data: [{ id: local.deviceId, isOnline: false }] });
  });

  it.each([
    [{ page: 0 }, 'page'],
    [{ limit: 101 }, 'limit'],
    [{ isOnline: 'yes' }, 'isOnline'],
    [{ buildingId: 'invalide' }, 'buildingId'],
  ])('rejette la requête appareils %j', async (query, field) => {
    const { body } = await app.get(`${api}/devices`).set('Cookie', accessCookie).set('Origin', browserOrigin)
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
