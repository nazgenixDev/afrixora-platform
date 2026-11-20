import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { Server } from 'socket.io';
import mqtt from 'mqtt';
import logger from '../utils/logger';
import { prisma, query } from '../utils/database';
import { getRedisClient, isRedisConnected } from '../utils/redis';
import automationEngine from './automationEngine';

let mqttClient: mqtt.MqttClient | null = null;
let retryRunning = false;

const BUFFER_KEY_PREFIX = 'mqtt_buffer:';
const RETRY_LOCK_KEY = 'mqtt:buffer-retry-lock';
const RETRY_LOCK_SECONDS = 60;
const RETRY_INTERVAL_MS = 10_000;
const MAX_RETRY_DELAY_MS = 15 * 60_000;
const MAX_RETRY_AGE_MS = 24 * 60 * 60_000;
const MAX_FUTURE_TIMESTAMP_MS = 24 * 60 * 60_000;
const MAX_RETRY_ENTRIES = 1000;
const DEVICE_CACHE_TTL_MS = 60_000;
const MAX_DEVICE_CACHE_ENTRIES = 10_000;

type DeviceScope = { tenantId: string; buildingId: string; deviceId: string };
type Measurement = DeviceScope & { metric: string; value: number; unit: string | null };

const deviceCache = new Map<string, { expiresAt: number; verified: Promise<boolean> }>();
const isoTimestamp = z.string().datetime({ offset: true });

const bufferedEntrySchema = z.object({
  id: z.string().optional(),
  tenantId: z.string().uuid(),
  buildingId: z.string().min(1),
  deviceId: z.string().uuid(),
  metric: z.string().min(1).refine((metric) => !metric.includes('\0')),
  value: z.unknown(),
  unit: z.unknown(),
  timestamp: z.union([z.string(), z.number().int()]),
  queuedAt: z.number().int().nonnegative().optional(),
  nextRetryAt: z.number().int().nonnegative().optional(),
  retryCount: z.number().int().nonnegative().default(0),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numericMetric(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return undefined;
  const state = value.trim().toLowerCase();
  if (state === 'on' || state === 'open') return 1;
  if (state === 'off' || state === 'closed') return 0;
  return undefined;
}

function metricUnit(value: unknown): string | null {
  return typeof value === 'string' && !value.includes('\0') ? value : null;
}

function readingTime(value: unknown, receivedAt: number): Date | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (typeof value === 'string' && !isoTimestamp.safeParse(value).success) return null;
  if (typeof value === 'number' && !Number.isInteger(value)) return null;
  const time = new Date(value);
  // PostgreSQL ne peut pas représenter toute la plage des dates JavaScript.
  if (!Number.isFinite(time.getTime()) || time.getUTCFullYear() < -4712
      || time.getTime() > receivedAt + MAX_FUTURE_TIMESTAMP_MS) return null;
  return time;
}

function deviceCacheKey({ tenantId, buildingId, deviceId }: DeviceScope): string {
  return JSON.stringify([tenantId, buildingId, deviceId]);
}

function deviceWhere({ tenantId, buildingId, deviceId }: DeviceScope) {
  return { id: deviceId, tenantId, buildingId, building: { tenantId } };
}

async function belongsToScope(scope: DeviceScope): Promise<boolean> {
  const key = deviceCacheKey(scope);
  const cached = deviceCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.verified;
  deviceCache.delete(key);

  if (deviceCache.size >= MAX_DEVICE_CACHE_ENTRIES) {
    const oldest = deviceCache.keys().next().value;
    if (oldest !== undefined) deviceCache.delete(oldest);
  }
  const verify = async (): Promise<boolean> => {
    const device = await prisma.device.findFirst({ where: deviceWhere(scope), select: { id: true } });
    return device !== null;
  };
  const entry = { expiresAt: Date.now() + DEVICE_CACHE_TTL_MS, verified: verify() };
  deviceCache.set(key, entry);
  let allowed = false;
  try {
    allowed = await entry.verified;
    return allowed;
  } finally {
    if (!allowed && deviceCache.get(key) === entry) deviceCache.delete(key);
  }
}

async function insertReading(
  { tenantId, deviceId, metric, value, unit }: Measurement,
  time: Date | null
): Promise<void> {
  await query(
    `INSERT INTO sensor_readings (time, tenant_id, device_id, metric, value, unit)
     SELECT COALESCE($1::timestamptz, NOW()), "id"::uuid, $3::uuid, $4, $5, $6
     FROM "Tenant" WHERE "id" = $2
     FOR KEY SHARE`,
    [time, tenantId, deviceId, metric, value, unit]
  );
}

/**
 * Get the initialized MQTT client
 * @returns The MQTT client instance
 * @throws Error if the client is not initialized
 */
export const getMqttClient = (): mqtt.MqttClient => {
  if (!mqttClient) {
    throw new Error('MQTT client not initialized. Call connectMQTT() first.');
  }
  return mqttClient;
};

/**
 * Publish a message to an MQTT topic using the shared client
 * @param topic MQTT topic
 * @param payload Message payload (object or string)
 * @returns Promise that resolves when the message is published
 */
export const publishMqtt = (topic: string, payload: unknown): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!mqttClient || !mqttClient.connected) {
      reject(new Error('MQTT client not connected'));
      return;
    }
    const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
    mqttClient.publish(topic, payloadString, { qos: 1 }, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
};

async function bufferMessage(reading: Measurement, time: Date): Promise<void> {
  const { tenantId, deviceId, metric } = reading;
  try {
    const queuedAt = Date.now();
    const entry = JSON.stringify({
      ...reading,
      id: randomUUID(),
      timestamp: time.getTime(),
      queuedAt,
      nextRetryAt: queuedAt + RETRY_INTERVAL_MS,
      retryCount: 0,
    });
    const redis = getRedisClient();
    const discarded = await redis.eval(
      `redis.call('LPUSH', KEYS[1], ARGV[1])
       local discarded = redis.call('LRANGE', KEYS[1], ARGV[2], -1)
       redis.call('LTRIM', KEYS[1], 0, tonumber(ARGV[2]) - 1)
       return discarded`,
      1, `${BUFFER_KEY_PREFIX}${tenantId}`, entry, MAX_RETRY_ENTRIES
    ) as string[];

    for (const raw of discarded) {
      const evicted = parseBufferedEntry(raw);
      logger.error('Mesure MQTT abandonnée : capacité du buffer atteinte', {
        tenantId, deviceId: evicted?.deviceId, metric: evicted?.metric,
      });
    }
    logger.warn('Mesure MQTT mise en attente dans Redis', { tenantId, deviceId, metric });
  } catch (error) {
    logger.error('Mesure MQTT perdue : mise en attente dans Redis impossible', {
      tenantId, deviceId, metric, error: (error as Error).message,
    });
  }
}

function parseBufferedEntry(raw: string): z.infer<typeof bufferedEntrySchema> | undefined {
  try {
    const entry = bufferedEntrySchema.safeParse(JSON.parse(raw));
    return entry.success ? entry.data : undefined;
  } catch {
    return undefined;
  }
}

async function retryEntry(key: string, raw: string, token: string): Promise<void> {
  const entry = parseBufferedEntry(raw);
  const now = Date.now();
  const time = readingTime(entry?.timestamp, now);
  const value = numericMetric(entry?.value);
  const tenantId = key.slice(BUFFER_KEY_PREFIX.length);
  let replacement = '';
  let discarded: string | undefined;

  if (!entry || entry.tenantId !== tenantId || !time || value === undefined) {
    discarded = 'entrée invalide';
  } else {
    // Les anciennes entrées enregistrent déjà l'heure de mise en attente dans timestamp.
    const queuedAt = entry.queuedAt ?? time.getTime();
    const expiresAt = queuedAt + MAX_RETRY_AGE_MS;
    if (now >= expiresAt) {
      discarded = 'délai de rejeu dépassé';
    } else if (now < (entry.nextRetryAt ?? queuedAt + RETRY_INTERVAL_MS)) {
      return;
    } else {
      const current = await getRedisClient().eval(
        `if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
         if redis.call('LPOS', KEYS[2], ARGV[2]) then return 1 end
         return 0`,
        2, RETRY_LOCK_KEY, key, token, raw
      );
      if (current !== 1) return;
      try {
        if (await belongsToScope(entry)) {
          await insertReading({ ...entry, value, unit: metricUnit(entry.unit) }, time);
        } else {
          discarded = 'appareil hors du périmètre';
        }
      } catch {
        const retryCount = entry.retryCount + 1;
        const delay = Math.min(MAX_RETRY_DELAY_MS, RETRY_INTERVAL_MS * 2 ** Math.min(retryCount, 10));
        replacement = JSON.stringify({
          ...entry, id: entry.id ?? randomUUID(), queuedAt, retryCount,
          nextRetryAt: Math.min(Date.now() + delay, expiresAt),
        });
      }
    }
  }

  // La mesure reste dans Redis tant que l'insertion ou son report n'est pas confirmé.
  const removed = await getRedisClient().eval(
    `if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
     local removed = redis.call('LREM', KEYS[2], -1, ARGV[2])
     if removed == 1 and ARGV[3] ~= '' then
       redis.call('LPUSH', KEYS[2], ARGV[3])
     end
     return removed`,
    2, RETRY_LOCK_KEY, key, token, raw, replacement
  );
  if (removed === 1 && discarded) {
    logger.error('Mesure MQTT abandonnée après mise en attente', {
      tenantId, deviceId: entry?.deviceId, metric: entry?.metric,
      retryCount: entry?.retryCount, reason: discarded,
    });
  }
}

async function retryBuffer(): Promise<void> {
  if (retryRunning || !isRedisConnected()) return;
  retryRunning = true;

  const redis = getRedisClient();
  const token = randomUUID();
  try {
    if (await redis.set(RETRY_LOCK_KEY, token, 'EX', RETRY_LOCK_SECONDS, 'NX') !== 'OK') return;
    let lockHeld = true;
    const renewal = setInterval(async () => {
      try {
        const renewed = await redis.eval(
          `if redis.call('GET', KEYS[1]) == ARGV[1] then
             return redis.call('EXPIRE', KEYS[1], ARGV[2])
           end
           return 0`,
          1, RETRY_LOCK_KEY, token, RETRY_LOCK_SECONDS
        );
        if (renewed !== 1) lockHeld = false;
      } catch (error) {
        lockHeld = false;
        logger.warn('Renouvellement du verrou de rejeu MQTT impossible', { error: (error as Error).message });
      }
    }, RETRY_LOCK_SECONDS * 1000 / 3);

    try {
      let cursor = '0';
      do {
        const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', `${BUFFER_KEY_PREFIX}*`, 'COUNT', 100);
        cursor = nextCursor;
        for (const key of keys) {
          if (!lockHeld) return;
          const entries = await redis.lrange(key, 0, -1);
          // L'instantané borne le passage et laisse les nouvelles entrées au cycle suivant.
          for (const raw of entries.reverse()) {
            if (!lockHeld) return;
            await retryEntry(key, raw, token);
          }
        }
      } while (cursor !== '0' && lockHeld);
    } finally {
      clearInterval(renewal);
      await redis.eval(
        `if redis.call('GET', KEYS[1]) == ARGV[1] then
           return redis.call('DEL', KEYS[1])
         end
         return 0`,
        1, RETRY_LOCK_KEY, token
      );
    }
  } catch (error) {
    logger.error('Erreur durant le rejeu MQTT', { error: (error as Error).message });
  } finally {
    retryRunning = false;
  }
}

/**
 * Connect to MQTT broker and subscribe to topics
 * @param io Socket.IO server instance for broadcasting messages
 */
export const connectMQTT = (io: Server): void => {
  const url = process.env.MQTT_URL || 'mqtt://localhost:1883';
  const options: mqtt.IClientOptions = {
    username: process.env.MQTT_API_USER,
    password: process.env.MQTT_API_PASSWORD,
    reconnectPeriod: 5000,
    clientId: `afrixora-backend-${Math.random().toString(16).substring(2, 8)}`,
  };

  logger.info(`Connecting to MQTT broker at ${url}`);
  mqttClient = mqtt.connect(url, options);

  mqttClient.on('connect', () => {
    logger.info('Connected to MQTT broker');
    
    // Subscribe to topics
    const topics = [
      'afrixora/+/+/devices/+/readings',
      'afrixora/+/+/devices/+/events',
      'afrixora/+/+/gateways/+/status'
    ];
    
    mqttClient!.subscribe(topics, { qos: 1 }, (err) => {
      if (err) {
        logger.error('Failed to subscribe to MQTT topics', { error: err.message });
      } else {
        logger.info('Subscribed to MQTT topics', { topics });
      }
    });
  });

  mqttClient.on('reconnect', () => {
    logger.info('Reconnecting to MQTT broker');
  });

  mqttClient.on('disconnect', () => {
    logger.warn('Disconnected from MQTT broker');
  });

  mqttClient.on('error', (error) => {
    logger.error('MQTT client error', { error: error.message });
  });

  mqttClient.on('message', async (topic, payload) => {
    const receivedAt = Date.now();
    try {
      const parts = topic.split('/');
      const [prefix, tenantId, buildingId, resource, id, kind] = parts;
      if (parts.length !== 6 || prefix !== 'afrixora' || !tenantId || !buildingId || !id) {
        logger.warn('Topic MQTT invalide', { topic });
        return;
      }
      const isDeviceMessage = resource === 'devices' && (kind === 'readings' || kind === 'events');
      const isGatewayStatus = resource === 'gateways' && kind === 'status';
      if (!isDeviceMessage && !isGatewayStatus) return;

      const scope = { tenantId, buildingId, deviceId: id };
      if (isDeviceMessage && !await belongsToScope(scope)) {
        logger.warn('Message MQTT rejeté : appareil hors du périmètre', { topic });
        return;
      }
      const payloadData: unknown = JSON.parse(payload.toString());
      if (!isRecord(payloadData)) {
        logger.warn('Le payload MQTT doit être un objet JSON', { topic });
        return;
      }

      if (isDeviceMessage) {
        if (kind === 'readings') {
          await handleDeviceReadings(scope, payloadData, receivedAt, io);
        } else if (await markDeviceSeen(scope)) {
          io.to(`building:${buildingId}`).emit('device:event', { ...payloadData, deviceId: id });
        }
      } else {
        const result = await prisma.gateway.updateMany({
          where: { id, tenantId, buildingId, building: { tenantId } },
          data: {
            isOnline: true,
            lastSeen: new Date(),
            version: typeof payloadData.version === 'string' ? payloadData.version : null,
          },
        });
        if (result.count === 0) logger.warn('Statut MQTT rejeté : passerelle hors du périmètre', { topic });
      }
    } catch (error) {
      logger.error('Erreur de traitement du message MQTT', { topic, error: (error as Error).message });
    }
  });

  startOfflineDetectionJob(io);
  setInterval(retryBuffer, RETRY_INTERVAL_MS);
};

async function markDeviceSeen(scope: DeviceScope): Promise<boolean> {
  const result = await prisma.device.updateMany({
    where: deviceWhere(scope),
    data: { isOnline: true, lastSeen: new Date() },
  });
  if (result.count > 0) return true;

  deviceCache.delete(deviceCacheKey(scope));
  logger.warn('Appareil MQTT introuvable lors de la mise à jour du statut', scope);
  return false;
}

async function handleDeviceReadings(
  scope: DeviceScope,
  payload: Record<string, unknown>,
  receivedAt: number,
  io: Server
): Promise<void> {
  const { tenantId, buildingId, deviceId } = scope;
  if (!isRecord(payload.metrics)) {
    logger.warn('Métriques MQTT invalides', scope);
    return;
  }

  const units = isRecord(payload.units) ? payload.units : {};
  const metrics: Record<string, number> = Object.create(null);
  const timestamp = readingTime(payload.timestamp, receivedAt);
  for (const [metric, rawValue] of Object.entries(payload.metrics)) {
    const value = numericMetric(rawValue);
    if (value === undefined || !metric || metric.includes('\0')) {
      logger.warn('Métrique MQTT ignorée : nom ou valeur invalide', { ...scope, metric });
      continue;
    }

    metrics[metric] = value;
    const reading = { ...scope, metric, value, unit: metricUnit(units[metric]) };
    try {
      await insertReading(reading, timestamp);
    } catch (error) {
      logger.error('Insertion TimescaleDB impossible', { ...scope, metric, error: (error as Error).message });
      await bufferMessage(reading, timestamp ?? new Date(receivedAt));
    }
  }

  if (!await markDeviceSeen(scope)) return;
  io.to(`building:${buildingId}`).emit('device:reading', { ...payload, deviceId });
  if (Object.keys(metrics).length > 0) {
    await automationEngine.evaluate(tenantId, buildingId, deviceId, metrics, io);
  }
}

function startOfflineDetectionJob(io: Server): void {
  const intervalMs = 2 * 60_000;
  const offlineThresholdMs = 5 * 60_000;

  setInterval(async () => {
    try {
      const stale = { isOnline: true, lastSeen: { lt: new Date(Date.now() - offlineThresholdMs) } };
      const devices = await prisma.device.findMany({
        where: stale,
        select: { id: true, tenantId: true, buildingId: true, name: true, lastSeen: true },
      });

      for (const { id, tenantId, buildingId, name, lastSeen } of devices) {
        try {
          const alert = await prisma.$transaction(async (tx) => {
            // Un seul worker peut effectuer cette transition et créer l'alerte correspondante.
            const result = await tx.device.updateMany({
              where: {
                ...deviceWhere({ tenantId, buildingId, deviceId: id }),
                isOnline: true,
                lastSeen: { equals: lastSeen, ...stale.lastSeen },
              },
              data: { isOnline: false },
            });
            if (result.count === 0) return null;
            return tx.alert.create({
              data: {
                tenantId, buildingId, deviceId: id,
                type: 'OFFLINE', severity: 'WARNING',
                message: `L’appareil « ${name} » est hors ligne.`,
              },
            });
          });

          if (alert) {
            const room = io.to(`building:${buildingId}`);
            room.emit('device:status', { deviceId: id, isOnline: false, lastSeen });
            room.emit('alert:new', alert);
          }
        } catch (error) {
          logger.error('Impossible de signaler la mise hors ligne de l’appareil', {
            tenantId, buildingId, deviceId: id, error: (error as Error).message,
          });
        }
      }
    } catch (error) {
      logger.error('Erreur durant la détection des appareils hors ligne', { error: (error as Error).message });
    }
  }, intervalMs);
}
