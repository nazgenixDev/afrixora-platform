import { createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import authService from '../src/services/authService';

const prisma = vi.hoisted(() => ({ user: { findUnique: vi.fn(), updateMany: vi.fn() } }));
const redis = vi.hoisted(() => ({ set: vi.fn(), eval: vi.fn() }));

vi.mock('../src/utils/database', () => ({ prisma }));
vi.mock('../src/utils/redis', () => ({ default: redis }));
vi.mock('../src/utils/logger', () => ({ default: { info: vi.fn(), warn: vi.fn() } }));

const password = 'phrase de test pour une session';
const credentials = { email: 'session@example.test', passwordHash: bcrypt.hashSync(password, 4) };
const account = { id: 'utilisateur-test', tenantId: 'client-test', name: 'Session test', role: 'VIEWER' };

describe('Sessions avec renouvellement à usage unique', () => {
  let jwtVersion: number;
  let hashes: Map<string, string>;

  beforeEach(() => {
    jwtVersion = 1;
    hashes = new Map();
    vi.stubEnv('JWT_SECRET', 'secret-access-fictif');
    vi.stubEnv('JWT_REFRESH_SECRET', 'secret-renouvellement-fictif');
    prisma.user.findUnique.mockImplementation(async () => ({
      ...account, ...credentials, jwtVersion, isActive: true, tenant: { isActive: true },
    }));
    prisma.user.updateMany.mockImplementation(async ({ where }) => {
      if (where.jwtVersion !== jwtVersion) return { count: 0 };
      jwtVersion++;
      return { count: 1 };
    });
    redis.set.mockImplementation(async (key, hash) => {
      hashes.set(key, hash);
      return 'OK';
    });
    redis.eval.mockImplementation(async (_script, _keys, key, current, replacement) => {
      const stored = hashes.get(key);
      if (!stored) return 0;
      if (stored !== current) {
        hashes.set(key, 'revoked');
        return -1;
      }
      hashes.set(key, replacement);
      return 1;
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('conserve une empreinte, remplace le jeton et refuse toute continuation après rejeu', async () => {
    const initial = await authService.login(credentials.email, password);
    expect([...hashes.values()]).toEqual([createHash('sha256').update(initial.refreshToken).digest('hex')]);
    const renewed = await authService.refreshToken(initial.refreshToken);
    expect(renewed.refreshToken).not.toBe(initial.refreshToken);
    expect(renewed.expiresAt).toBe(initial.expiresAt);
    await expect(authService.refreshToken(initial.refreshToken)).rejects.toMatchObject({ statusCode: 401 });
    expect(jwtVersion).toBe(2);
    await expect(authService.refreshToken(renewed.refreshToken)).rejects.toMatchObject({ statusCode: 401 });
  });

  it('révoque les sessions au logout même lorsque le jeton d’accès a expiré', async () => {
    const initial = await authService.login(credentials.email, password);
    const expired = jwt.sign({
      userId: account.id,
      tenantId: account.tenantId,
      jwtVersion,
    }, process.env.JWT_SECRET!, { expiresIn: -1 });
    await authService.logout(expired, initial.refreshToken);
    expect(jwtVersion).toBe(2);
    await expect(authService.refreshToken(initial.refreshToken)).rejects.toMatchObject({ statusCode: 401 });
  });
});
