import { randomUUID } from 'node:crypto';
import type { DeviceCommandStatus } from '@prisma/client';
import { z } from 'zod';
import { Server } from 'socket.io';
import mqtt from 'mqtt';
import logger from '../utils/logger';
import { prisma, query } from '../utils/database';
import { getRedisClient, isRedisConnected } from '../utils/redis';
import automationEngine from './automationEngine';

let mqttClient: mqtt.MqttClient | null = null;
let subscriptionsReady = false;
const pendingPublications = new Map<number, (error: Error) => void>();
const MAX_PENDING_PUBLICATIONS = 100;
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
const MAX_PAYLOAD_BYTES = 64 * 1024;

type DeviceScope = { tenantId: string; buildingId: string; deviceId: string };
type Measurement = DeviceScope & { metric: string; value: number; unit: string | null };

const deviceCache = new Map<string, { expiresAt: number; verified: Promise<boolean> }>();
const isoTimestamp = z.string().datetime({ offset: true });

const commandIdSchema = z.string().uuid();
const commandAckSchema = z.discriminatedUnion('status', [
  z.object({ commandId: commandIdSchema, status: z.literal('ACKNOWLEDGED') }),
  z.object({ commandId: commandIdSchema, status: z.literal('CONFIRMED'),
    observedState: z.object({ state: z.enum(['on', 'off']) }),
  }),
  z.object({ commandId: commandIdSchema, status: z.literal('FAILED') }),
]);

const bufferedEntrySchema = z.object({
  id: z.string().optional(),
  tenantId: z.guid(),
  buildingId: z.guid(),
  deviceId: z.guid(),
  metric: z.string().min(1).max(80).refine((metric) => !metric.includes('\0')),
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
  return typeof value === 'string' && value.length <= 32 && !value.includes('\0') ? value : null;
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
  return { id: deviceId, tenantId, buildingId, building: { tenantId, isActive: true, tenant: { isActive: true } } };
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
  { tenantId, buildingId, deviceId, metric, value, unit }: Measurement,
  time: Date | null
): Promise<boolean> {
  const result = await query(
    `INSERT INTO sensor_readings (time, tenant_id, device_id, metric, value, unit)
     SELECT COALESCE($1::timestamptz, NOW()), t.id::uuid, d.id::uuid, $5, $6, $7
     FROM "Tenant" t
     JOIN "Building" b ON b."tenantId" = t.id AND b.id = $3 AND b."isActive"
     JOIN "Device" d ON d."buildingId" = b.id AND d."tenantId" = t.id AND d.id = $4
     WHERE t.id = $2 AND t."isActive"
     FOR SHARE OF t, b, d`,
    [time, tenantId, buildingId, deviceId, metric, value, unit]
  );
  return result.rowCount === 1;
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

export function isMqttReady(): boolean {
  return mqttClient?.connected === true && subscriptionsReady;
}

// Les commandes ne survivent pas à une coupure du transport.
export function publishMqtt(topic: string, payload: unknown, expiresAt: Date): Promise<void> {
  const client = mqttClient;
  const remainingMs = expiresAt.getTime() - Date.now();
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
    return Promise.reject(new Error('Délai de publication MQTT dépassé'));
  }
  if (!client?.connected || !subscriptionsReady || pendingPublications.size >= MAX_PENDING_PUBLICATIONS) {
    return Promise.reject(new Error('Transport de commandes MQTT indisponible'));
  }

  return new Promise((resolve, reject) => {
    let messageId: number | undefined;
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (messageId !== undefined) pendingPublications.delete(messageId);
      if (error) reject(error);
      else resolve();
    };
    const cancel = (error: Error) => {
      finish(error);
      if (messageId !== undefined) client.removeOutgoingMessage(messageId);
    };
    const timer = setTimeout(() => cancel(new Error('Délai de publication MQTT dépassé')), remainingMs);

    try {
      client.publish(topic, JSON.stringify(payload), {
        qos: 1,
        retain: false,
        properties: { messageExpiryInterval: Math.ceil(remainingMs / 1000) },
        // Le magasin MQTT.js attribue l’identifiant avant d’écrire le paquet.
        cbStorePut: () => {
          messageId = client.getLastMessageId();
          if (settled) client.removeOutgoingMessage(messageId);
          else pendingPublications.set(messageId, cancel);
        },
      }, (error) => {
        finish(error || (Date.now() >= expiresAt.getTime() ? new Error('Délai de publication MQTT dépassé') : undefined));
      });
    } catch (error) {
      cancel(error instanceof Error ? error : new Error('Échec de publication MQTT'));
    }
  });
}

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
      tenantId, deviceId, errorType: (error as Error).name,
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
        if (!await insertReading({ ...entry, value, unit: metricUnit(entry.unit) }, time)) {
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
        logger.warn('Renouvellement du verrou de rejeu MQTT impossible', { errorType: (error as Error).name });
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
    logger.error('Erreur durant le rejeu MQTT', { errorType: (error as Error).name });
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
  if (process.env.NODE_ENV === 'production') {
    const { protocol, hostname } = new URL(url);
    const internalBroker = protocol === 'mqtt:' && hostname === 'mosquitto';
    if (!internalBroker && protocol !== 'mqtts:' && protocol !== 'wss:') {
      throw new Error('Le broker MQTT distant exige une connexion TLS en production');
    }
  }
  const options: mqtt.IClientOptions = {
    username: process.env.MQTT_API_USER,
    password: process.env.MQTT_API_PASSWORD,
    reconnectPeriod: 5000,
    // Les abonnements sont rétablis et contrôlés au prochain SUBACK.
    resubscribe: false,
    protocolVersion: 5,
    rejectUnauthorized: true,
    clientId: `afrixora-backend-${Math.random().toString(16).substring(2, 8)}`,
  };

  logger.info('mqtt_connecting');
  mqttClient = mqtt.connect(url, options);

  mqttClient.on('connect', () => {
    subscriptionsReady = false;
    logger.info('Connected to MQTT broker');
    
    // Subscribe to topics
    const topics = [
      'afrixora/+/+/devices/+/readings',
      'afrixora/+/+/devices/+/events',
      'afrixora/+/+/gateways/+/status'
    ];
    
    mqttClient!.subscribe(topics, { qos: 1, rap: true }, (err, grants) => {
      subscriptionsReady = !err && !!grants && grants.length === topics.length
        && grants.every(({ qos }) => qos === 1);
      if (!subscriptionsReady) {
        logger.error('mqtt_subscribe_failed', { errorType: err?.name });
      } else {
        logger.info('Subscribed to MQTT topics', { topics });
      }
    });
  });

  mqttClient.on('close', () => {
    subscriptionsReady = false;
    for (const cancel of pendingPublications.values()) {
      cancel(new Error('Connexion MQTT interrompue'));
    }
  });

  mqttClient.on('reconnect', () => {
    logger.info('Reconnecting to MQTT broker');
  });

  mqttClient.on('disconnect', () => {
    logger.warn('Disconnected from MQTT broker');
  });

  mqttClient.on('error', (error) => {
    logger.error('mqtt_client_error', { errorType: error.name });
  });

  mqttClient.on('message', async (topic, payload, packet) => {
    const receivedAt = Date.now();
    try {
      const parts = topic.split('/');
      const [prefix, tenantId, buildingId, resource, id, kind] = parts;
      const identifier = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;
      if (parts.length !== 6 || prefix !== 'afrixora' || ![tenantId, buildingId, id].every((value) => identifier.test(value))) {
        logger.warn('mqtt_topic_invalid');
        return;
      }
      const isDeviceMessage = resource === 'devices' && (kind === 'readings' || kind === 'events');
      const isGatewayStatus = resource === 'gateways' && kind === 'status';
      if (!isDeviceMessage && !isGatewayStatus) return;
      if (payload.length > MAX_PAYLOAD_BYTES) {
        logger.warn('mqtt_payload_too_large', { tenantId, buildingId, id });
        return;
      }

      const scope = { tenantId, buildingId, deviceId: id };
      if (isDeviceMessage && !await belongsToScope(scope)) {
        logger.warn('mqtt_device_scope_rejected', scope);
        return;
      }
      const payloadData: unknown = JSON.parse(payload.toString());
      if (!isRecord(payloadData)) {
        logger.warn('mqtt_payload_invalid', scope);
        return;
      }

      if (isDeviceMessage) {
        if (kind === 'readings') {
          await handleDeviceReadings(scope, payloadData, receivedAt, io);
        } else if (payloadData.type === 'command_ack') {
          if (!packet?.retain && await markDeviceSeen(scope)) await handleCommandAck(scope, payloadData, io);
        } else if (await markDeviceSeen(scope)) {
          io.to(`building:${buildingId}`).emit('device:event', { ...payloadData, deviceId: id });
        }
      } else {
        const result = await prisma.gateway.updateMany({
          where: { id, tenantId, buildingId, building: { tenantId, isActive: true, tenant: { isActive: true } } },
          data: {
            isOnline: true,
            lastSeen: new Date(),
            version: typeof payloadData.version === 'string' ? payloadData.version.slice(0, 100) : null,
          },
        });
        if (result.count === 0) logger.warn('mqtt_gateway_scope_rejected', { tenantId, buildingId, gatewayId: id });
      }
    } catch (error) {
      logger.error('mqtt_message_failed', { errorType: (error as Error).name });
    }
  });

  startOfflineDetectionJob(io);
  setInterval(retryBuffer, RETRY_INTERVAL_MS);
};

// CONFIRMED désigne l'état déclaré par le boîtier.
async function handleCommandAck(scope: DeviceScope, event: Record<string, unknown>, io: Server): Promise<void> {
  const parsed = commandAckSchema.safeParse(event);
  if (!parsed.success) return;

  const ack = parsed.data;
  const { status, commandId } = ack;
  const updated = await prisma.$transaction(async (tx) => {
    const statuses: DeviceCommandStatus[] = ['PENDING', 'SENT'];
    if (status !== 'ACKNOWLEDGED') statuses.push('ACKNOWLEDGED');
    const eligible = { ...scope, id: commandId, expiresAt: { gt: new Date() }, status: { in: statuses } };

    if (ack.status === 'CONFIRMED') {
      const current = await tx.deviceCommand.findFirst({ where: eligible, select: { params: true } });
      if (!current || !isRecord(current.params) || current.params.state !== ack.observedState.state) return false;
    }

    const now = new Date();
    const result = await tx.deviceCommand.updateMany({
      where: { ...eligible, expiresAt: { gt: now } },
      data: {
        status,
        ...(ack.status === 'ACKNOWLEDGED' ? { acknowledgedAt: now } : {}),
        ...(ack.status === 'CONFIRMED' ? { confirmedAt: now, observedState: ack.observedState } : {}),
        ...(ack.status === 'FAILED' ? { failedAt: now, error: 'Échec signalé par le boîtier' } : {}),
      },
    });
    if (!result.count) return false;

    if (ack.status === 'CONFIRMED') {
      const { deviceId, tenantId } = scope;
      const state = { ...ack.observedState, source: 'device_reported' };
      await tx.deviceState.upsert({
        where: { deviceId, tenantId },
        update: { state },
        create: { deviceId, tenantId, state },
      });
    }
    return true;
  });
  if (updated) {
    io.to(`building:${scope.buildingId}`).emit('device:command', {
      deviceId: scope.deviceId, commandId, status,
    });
  }
}

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
  const acceptedUnits: Record<string, string> = Object.create(null);
  const timestamp = readingTime(payload.timestamp, receivedAt);
  for (const [metric, rawValue] of Object.entries(payload.metrics)) {
    const value = numericMetric(rawValue);
    if (value === undefined || !metric || metric.length > 80 || metric.includes('\0')) {
      logger.warn('mqtt_metric_invalid', scope);
      continue;
    }

    const unit = metricUnit(units[metric]);
    const reading = { ...scope, metric, value, unit };
    try {
      if (!await insertReading(reading, timestamp)) return;
    } catch (error) {
      logger.error('mqtt_reading_insert_failed', { ...scope, errorType: (error as Error).name });
      await bufferMessage(reading, timestamp ?? new Date(receivedAt));
    }
    metrics[metric] = value;
    if (unit !== null) acceptedUnits[metric] = unit;
  }

  if (!await markDeviceSeen(scope)) return;
  io.to(`building:${buildingId}`).emit('device:reading', {
    timestamp: (timestamp ?? new Date(receivedAt)).toISOString(), deviceId, metrics, units: acceptedUnits,
  });
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
        where: { ...stale, building: { isActive: true, tenant: { isActive: true } } },
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
            tenantId, buildingId, deviceId: id, errorType: (error as Error).name,
          });
        }
      }
    } catch (error) {
      logger.error('Erreur durant la détection des appareils hors ligne', { errorType: (error as Error).name });
    }
  }, intervalMs);
}
