import { Server } from 'socket.io';
import mqtt from 'mqtt';
import logger from '../utils/logger';
import { prisma, query } from '../utils/database';
import automationEngine from './automationEngine';

// MQTT client as module variable
let mqttClient: mqtt.MqttClient | null = null;

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
      let payloadData;
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
};

/**
 * Handle device readings messages
 * @param tenantId Tenant ID
 * @param buildingId Building ID
 * @param deviceId Device ID
 * @param payload Message payload
 * @param io Socket.IO server instance
 */
async function handleDeviceReadings(
  tenantId: string,
  buildingId: string,
  deviceId: string,
  payload: any,
  io: Server
): Promise<void> {
  try {
    // Extract metrics from payload
        const { metrics, units } = payload;
    
    if (!metrics || typeof metrics !== 'object') {
      logger.warn('Invalid metrics in payload', { deviceId, payload });
      return;
    }

    // Insert each metric into sensor_readings table
    for (const [metric, value] of Object.entries(metrics)) {
      const unit = units && units[metric] ? units[metric] : null;
      
      // Insert into TimescaleDB using raw SQL
      await query(
        'INSERT INTO sensor_readings (time, tenant_id, device_id, metric, value, unit) VALUES (NOW(), $1, $2, $3, $4, $5)',
        [tenantId, deviceId, metric, value, unit]
      );
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
      ...payload
    });

    // Evaluate automation rules for this device
    await automationEngine.evaluate(tenantId, buildingId, deviceId, metrics as Record<string, number>, io);

    logger.debug('Processed device reading', { deviceId, metrics: Object.keys(metrics) });
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
 * @param payload Message payload
 * @param io Socket.IO server instance
 */
async function handleDeviceEvents(
  tenantId: string,
  buildingId: string,
  deviceId: string,
  payload: any,
  io: Server
): Promise<void> {
  try {
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
      ...payload
    });

    logger.debug('Processed device event', { deviceId, payload });
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
 * @param payload Message payload
 */
async function handleGatewayStatus(
  tenantId: string,
  buildingId: string,
  gatewayId: string,
  payload: any
): Promise<void> {
  try {
    // Update gateway status in Prisma
    await prisma.gateway.update({
      where: { id: gatewayId },
      data: {
        isOnline: true,
        lastSeen: new Date(),
        version: payload.version || null
      }
    });

    logger.debug('Processed gateway status', { gatewayId, payload });
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