import prisma from "../utils/database";
import logger from "../utils/logger";
import redis, { isRedisConnected } from "../utils/redis";

const pendingKeys = "api-key:usage:pending";
const usageKey = (id: string) => `api-key:usage:${id}`;
const syncIntervalMs = 30_000;

// Le contrôle du quota, l'incrément et le marquage se font dans une même opération Redis.
const consumeQuota = `
  local requests = math.max(tonumber(redis.call("HGET", KEYS[1], "requests") or "0"), tonumber(ARGV[2]))
  if requests >= tonumber(ARGV[3]) then return 0 end

  local time = redis.call("TIME")
  local lastUsed = math.max(
    tonumber(redis.call("HGET", KEYS[1], "lastUsed") or "0"),
    tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
  )
  redis.call("HSET", KEYS[1], "requests", requests + 1, "lastUsed", string.format("%.0f", lastUsed))
  redis.call("SADD", KEYS[2], ARGV[1])
  return 1
`;

export async function consumeApiKeyQuota(key: { id: string; requests: number; limit: number }) {
  if (!isRedisConnected()) throw new Error("Redis indisponible");

  const result = await redis.eval(consumeQuota, 2, usageKey(key.id), pendingKeys, key.id, key.requests, key.limit);
  return result === 1;
}

const acknowledgeUsage = `
  if redis.call("HGET", KEYS[1], "requests") == ARGV[2] then
    redis.call("SREM", KEYS[2], ARGV[1])
  end
`;

export async function syncApiKeyUsage() {
  let cursor = "0";
  do {
    const [nextCursor, ids] = await redis.sscan(pendingKeys, cursor, "COUNT", 100);
    cursor = nextCursor;

    for (const id of ids) {
      const [requests, lastUsed] = await redis.hmget(usageKey(id), "requests", "lastUsed");
      if (requests === null || lastUsed === null) continue;

      // Écrire un total croissant rend les reprises et les synchronisations concurrentes idempotentes.
      const count = Number(requests);
      await prisma.apiKey.updateMany({
        where: { id, requests: { lt: count } },
        data: { requests: count, lastUsed: new Date(Number(lastUsed)) },
      });

      // Un appel accepté pendant l'écriture SQL reste à synchroniser au prochain passage.
      await redis.eval(acknowledgeUsage, 2, usageKey(id), pendingKeys, id, requests);
    }
  } while (cursor !== "0");
}

export function startApiKeyUsageSync() {
  let syncing = false;
  setInterval(async () => {
    if (syncing || !isRedisConnected()) return;

    syncing = true;
    try {
      await syncApiKeyUsage();
    } catch {
      logger.error("api_key_usage_sync_failed");
    } finally {
      syncing = false;
    }
  }, syncIntervalMs).unref();
}
