import { Server } from 'socket.io';
import mqtt from 'mqtt';
import logger from '../utils/logger';
import { prisma, query } from '../utils/database';
import { getRedisClient, isRedisConnected } from '../utils/redis';
import automationEngine from './automationEngine';

// MQTT client as module variable
let mqttClient: mqtt.MqttClient | null = null;

const BUFFER_KEY_PREFIX = 'mqtt_buffer:';
const RETRY_INTERVAL_MS = 10 * 1000; // 10 secondes
const MAX_RETRY_ENTRIES = 1000; // limite du buffer par tenant

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

/**
 * Buffer un message dans Redis quand l'insertion TimescaleDB échoue
 */
async function bufferMessage(
  tenantId: string,
  buildingId: string,
  deviceId: string,
  metric: string,
  value: number,
  unit: string | null
): Promise<void> {
  try {
    const redis = getRedisClient();
    const message = JSON.stringify({
      tenantId,
      buildingId,
      deviceId,
      metric,
      value,
      unit,
      timestamp: new Date().toISOString(),
      retryCount: 0,
    });

    // LPUSH pour ajouter en tête, LTRIM pour limiter la taille
    const key = `${BUFFER_KEY_PREFIX}${tenantId}`;
    await redis.lpush(key, message);
    await redis.ltrim(key, 0, MAX_RETRY_ENTRIES - 1);

    logger.warn('Message buffered in Redis (TimescaleDB insert failed)', {
      tenantId,
      deviceId,
      metric,
    });
  } catch (redisError) {
    logger.error('Failed to buffer message in Redis', {
      error: (redisError as Error).message,
      tenantId,
      deviceId,
    });
  }
}

/**
 * Rejouer les messages bufferisés dans Redis vers TimescaleDB
 */
async function retryBuffer(): Promise<void> {
  try {
    const redis = getRedisClient();

    if (!isRedisConnected()) {
      logger.debug('Redis not connected, skipping buffer retry');
      return;
    }

    // Récupérer toutes les clés de buffer
    const keys = await redis.keys(`${BUFFER_KEY_PREFIX}*`);

    if (keys.length === 0) return;

    logger.info(`Buffer retry: checking ${keys.length} tenant buffers`);

    for (const key of keys) {
      const tenantId = key.replace(BUFFER_KEY_PREFIX, '');
      let replayed = 0;
      let failed = 0;

      // RPOP pour dépiler en ordre FIFO (les plus anciens d'abord)
      let raw: string | null;
      while ((raw = await redis.rpop(key)) !== null) {
        try {
          const msg = JSON.parse(raw);

          // Réessayer l'insertion TimescaleDB
          await query(
            'INSERT INTO sensor_readings (time, tenant_id, device_id, metric, value, unit) VALUES ($1, $2, $3, $4, $5, $6)',
            [
              msg.timestamp ? new Date(msg.timestamp) : new Date(),
              msg.tenantId || tenantId,
              msg.deviceId,
              msg.metric,
              msg.value,
              msg.unit,
            ]
          );

          replayed++;
          logger.info('Buffered message replayed successfully', {
            tenantId,
            deviceId: msg.deviceId,
            metric: msg.metric,
          });
        } catch (err) {
          failed++;

          // Réincrémenter le compteur de tentatives
          const msg = JSON.parse(raw);
          msg.retryCount = (msg.retryCount || 0) + 1;

          // Si trop de tentatives, jeter le message
          if (msg.retryCount > 10) {
            logger.error('Buffered message discarded after max retries', {
              tenantId,
              deviceId: msg.deviceId,
              metric: msg.metric,
              retryCount: msg.retryCount,
            });
          } else {
            // Repousser en queue pour un prochain retry
            await redis.lpush(key, JSON.stringify(msg));
            await redis.ltrim(key, 0, MAX_RETRY_ENTRIES - 1);
          }
        }
      }

      if (replayed > 0 || failed > 0) {
        logger.info(`Buffer retry complete for tenant ${tenantId}`, {
          replayed,
          failed,
        });
      }
    }
  } catch (error) {
    logger.error('Error during buffer retry', {
      error: (error as Error).message,
    });
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

  // Handle incoming messages
  mqttClient.on('message', async (topic, payload) => {
    try {
      // Parse the topic to extract tenantId, buildingId, deviceId, msgType
      const topicParts = topic.split('/');
      
      // Expected format: afrixora/{tenantId}/{buildingId}/devices/{deviceId}/{msgType}
      // or: afrixora/{tenantId}/{buildingId}/gateways/{gatewayId}/status
      if (topicParts.length < 6) {
        logger.warn('Invalid MQTT topic format', { topic });
        return;
      }

      const tenantId = topicParts[1];
      const buildingId = topicParts[2];
      
      // Parse the payload as JSON
      let payloadData: unknown;
      try {
        payloadData = JSON.parse(payload.toString());
      } catch (error) {
        logger.error('Invalid JSON payload', { 
          topic, 
          payload: payload.toString(),
          error: (error as Error).message 
        });
        return;
      }

      // Handle different message types
      if (topic.includes('/devices/') && topic.endsWith('/readings')) {
        // Handle device readings
        const deviceId = topicParts[4];
        await handleDeviceReadings(tenantId, buildingId, deviceId, payloadData, io);
      } else if (topic.includes('/devices/') && topic.endsWith('/events')) {
        // Handle device events
        const deviceId = topicParts[4];
        await handleDeviceEvents(tenantId, buildingId, deviceId, payloadData, io);
      } else if (topic.includes('/gateways/') && topic.endsWith('/status')) {
        // Handle gateway status
        const gatewayId = topicParts[4];
        await handleGatewayStatus(tenantId, buildingId, gatewayId, payloadData);
      }
    } catch (error) {
      logger.error('Error processing MQTT message', { 
        topic, 
        error: (error as Error).message 
      });
    }
  });

  // Start the offline detection job
  startOfflineDetectionJob();

  // Start the buffer retry job
  startBufferRetryJob();
  logger.info('Started buffer retry job', { interval: `${RETRY_INTERVAL_MS}ms` });
};

/**
 * Handle device readings messages
 * @param tenantId Tenant ID
 * @param buildingId Building ID
 * @param deviceId Device ID
 * @param payload Message payload (unknown, guarded)
 * @param io Socket.IO server instance
 */
async function handleDeviceReadings(
  tenantId: string,
  buildingId: string,
  deviceId: string,
  payload: unknown,
  io: Server
): Promise<void> {
  try {
    if (typeof payload !== 'object' || payload === null) {
      logger.warn('Invalid payload (not an object)', { deviceId });
      return;
    }

    const raw = payload as Record<string, unknown>;
    const metrics = raw.metrics;
    const units = raw.units;

    if (!metrics || typeof metrics !== 'object') {
      logger.warn('Invalid metrics in payload', { deviceId });
      return;
    }

    // Insert each metric into sensor_readings table
    for (const [metric, value] of Object.entries(metrics as Record<string, unknown>)) {
      const unit = units && typeof units === 'object' ? (units as Record<string, unknown>)[metric] : null;
      
      try {
        // Insert into TimescaleDB using raw SQL
        await query(
          'INSERT INTO sensor_readings (time, tenant_id, device_id, metric, value, unit) VALUES (NOW(), $1, $2, $3, $4, $5)',
          [tenantId, deviceId, metric, value, unit]
        );
      } catch (dbError) {
        // En cas d'erreur d'insertion, bufferiser dans Redis
        logger.error('TimescaleDB insert failed, buffering message', {
          tenantId,
          deviceId,
          metric,
          error: (dbError as Error).message,
        });

        await bufferMessage(
          tenantId,
          buildingId,
          deviceId,
          metric,
          value as number,
          unit as string | null
        );
      }
    }

    // Update device status in Prisma
    await prisma.device.update({
      where: { id: deviceId },
      data: {
        isOnline: true,
        lastSeen: new Date()
      }
    });

    // Emit to Socket.IO
    io.to(`building:${buildingId}`).emit('device:reading', {
      deviceId,
      ...(payload as Record<string, unknown>),
    });

    // Evaluate automation rules for this device
    await automationEngine.evaluate(tenantId, buildingId, deviceId, metrics as Record<string, number>, io);

    logger.debug('Processed device reading', { deviceId, metrics: Object.keys(metrics as Record<string, unknown>) });
  } catch (error) {
    logger.error('Error handling device readings', { 
      tenantId, 
      buildingId, 
      deviceId, 
      error: (error as Error).message 
    });
  }
}

/**
 * Handle device events messages
 * @param tenantId Tenant ID
 * @param buildingId Building ID
 * @param deviceId Device ID
 * @param payload Message payload (unknown, guarded)
 * @param io Socket.IO server instance
 */
async function handleDeviceEvents(
  tenantId: string,
  buildingId: string,
  deviceId: string,
  payload: unknown,
  io: Server
): Promise<void> {
  try {
    const eventPayload = typeof payload === 'object' && payload !== null ? payload as Record<string, unknown> : {};

    // Update device status
    await prisma.device.update({
      where: { id: deviceId },
      data: {
        isOnline: true,
        lastSeen: new Date()
      }
    });

    // Emit to Socket.IO
    io.to(`building:${buildingId}`).emit('device:event', {
      deviceId,
      ...eventPayload,
    });

    logger.debug('Processed device event', { deviceId });
  } catch (error) {
    logger.error('Error handling device event', { 
      tenantId, 
      buildingId, 
      deviceId, 
      error: (error as Error).message 
    });
  }
}

/**
 * Handle gateway status messages
 * @param tenantId Tenant ID
 * @param buildingId Building ID
 * @param gatewayId Gateway ID
 * @param payload Message payload (unknown, guarded)
 */
async function handleGatewayStatus(
  tenantId: string,
  buildingId: string,
  gatewayId: string,
  payload: unknown
): Promise<void> {
  try {
    const gatewayPayload = typeof payload === 'object' && payload !== null ? payload as Record<string, unknown> : {};

    // Update gateway status in Prisma
    await prisma.gateway.update({
      where: { id: gatewayId },
      data: {
        isOnline: true,
        lastSeen: new Date(),
        version: (gatewayPayload.version as string) || null,
      },
    });

    logger.debug('Processed gateway status', { gatewayId });
  } catch (error) {
    logger.error('Error handling gateway status', { 
      tenantId, 
      buildingId, 
      gatewayId, 
      error: (error as Error).message 
    });
  }
}

/**
 * Start the job to detect offline devices
 * Runs every 2 minutes and marks devices as offline if they haven't been seen in 5 minutes
 */
function startOfflineDetectionJob(): void {
  const INTERVAL_MS = 2 * 60 * 1000; // 2 minutes
  const OFFLINE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

  setInterval(async () => {
    try {
      const offlineThreshold = new Date(Date.now() - OFFLINE_THRESHOLD_MS);
      
      // Find and update devices that haven't been seen in 5 minutes
      const result = await prisma.device.updateMany({
        where: {
          isOnline: true,
          lastSeen: {
            lt: offlineThreshold
          }
        },
        data: {
          isOnline: false
        }
      });

      if (result.count > 0) {
        logger.info(`Marked ${result.count} devices as offline`);
      }
    } catch (error) {
      logger.error('Error in offline detection job', { error: (error as Error).message });
    }
  }, INTERVAL_MS);

  logger.info(`Started offline detection job (interval: ${INTERVAL_MS}ms, threshold: ${OFFLINE_THRESHOLD_MS}ms)`);
}

/**
 * Start the job to retry buffered messages from Redis
 * Runs every 10 seconds
 */
function startBufferRetryJob(): void {
  setInterval(() => {
    retryBuffer().catch((err) => {
      logger.error('Error in buffer retry job', { error: (err as Error).message });
    });
  }, RETRY_INTERVAL_MS);
}