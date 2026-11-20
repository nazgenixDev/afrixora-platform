import { createHash } from 'crypto';
import redis from '../utils/redis';
import { AppError } from '../utils/errors';

function sessionKey(id: string) {
  return `afrixora:auth:refresh:${id}`;
}

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function unavailable() {
  return new AppError('Service de session indisponible', 503, 'SESSION_STORE_UNAVAILABLE');
}

export async function startRefreshSession(id: string, token: string, expiresAt: number) {
  try {
    const created = await redis.set(sessionKey(id), tokenHash(token), 'EXAT', expiresAt, 'NX');
    if (created !== 'OK') throw unavailable();
  } catch {
    throw unavailable();
  }
}

// Le marqueur de rejeu survit aux erreurs temporaires de révocation en base.
const rotate = `
  local current = redis.call('GET', KEYS[1])
  if not current then return 0 end
  if current ~= ARGV[1] then
    redis.call('SET', KEYS[1], 'revoked', 'KEEPTTL')
    return -1
  end
  redis.call('SET', KEYS[1], ARGV[2], 'KEEPTTL')
  return 1
`;

export async function rotateRefreshSession(id: string, current: string, replacement: string) {
  let result;
  try {
    result = await redis.eval(rotate, 1, sessionKey(id), tokenHash(current), tokenHash(replacement));
  } catch {
    throw unavailable();
  }
  if (result === 1) return 'rotated';
  if (result === -1) return 'replayed';
  return 'expired';
}
