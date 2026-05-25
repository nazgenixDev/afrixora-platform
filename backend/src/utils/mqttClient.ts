import mqtt from 'mqtt';
import logger from './logger';

/**
 * MQTT Client Singleton
 * Connects to the MQTT broker and provides methods to publish messages
 */
class MqttClient {
  private static instance: MqttClient;
  private client: mqtt.MqttClient | null = null;
  private isConnected = false;

  private constructor() {
    this.connect();
  }

  /**
   * Get the singleton instance of MqttClient
   * @returns MqttClient instance
   */
  public static getInstance(): MqttClient {
    if (!MqttClient.instance) {
      MqttClient.instance = new MqttClient();
    }
    return MqttClient.instance;
  }

  /**
   * Connect to the MQTT broker
   */
  private connect(): void {
    const url = process.env.MQTT_URL || 'mqtt://localhost:1883';
    const options: mqtt.IClientOptions = {
      username: process.env.MQTT_API_USER,
      password: process.env.MQTT_API_PASSWORD,
      reconnectPeriod: 5000,
      clientId: `afrixora-backend-${Math.random().toString(16).substring(2, 8)}`,
    };

    logger.info(`Connecting to MQTT broker at ${url}`);
    this.client = mqtt.connect(url, options);

    this.client.on('connect', () => {
      this.isConnected = true;
      logger.info('Connected to MQTT broker');
    });

    this.client.on('reconnect', () => {
      logger.info('Reconnecting to MQTT broker');
    });

    this.client.on('disconnect', () => {
      this.isConnected = false;
      logger.warn('Disconnected from MQTT broker');
    });

    this.client.on('error', (error) => {
      logger.error('MQTT client error', { error: error.message });
    });
  }

  /**
   * Publish a message to a topic
   * @param topic MQTT topic
   * @param payload Message payload (will be converted to JSON string)
   * @param options MQTT publish options
   * @returns Promise that resolves when the message is published
   */
  public publish(
    topic: string,
    payload: any,
    options: mqtt.IClientPublishOptions = {}
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.client || !this.isConnected) {
        logger.error('Cannot publish: MQTT client not connected');
        reject(new Error('MQTT client not connected'));
        return;
      }

      const payloadString = typeof payload === 'string' 
        ? payload 
        : JSON.stringify(payload);

      this.client.publish(topic, payloadString, options, (error) => {
        if (error) {
          logger.error('Failed to publish MQTT message', {
            topic,
            error: error.message,
          });
          reject(error);
        } else {
          logger.debug('Published MQTT message', { topic });
          resolve();
        }
      });
    });
  }

  /**
   * Subscribe to a topic
   * @param topic MQTT topic or array of topics
   * @param options MQTT subscribe options
   * @returns Promise that resolves when subscribed
   */
    public subscribe(
    topic: string | string[],
    options: mqtt.IClientSubscribeOptions = { qos: 1 }
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.client || !this.isConnected) {
        logger.error('Cannot subscribe: MQTT client not connected');
        reject(new Error('MQTT client not connected'));
        return;
      }

      this.client.subscribe(topic, options, (error) => {
        if (error) {
          logger.error('Failed to subscribe to MQTT topic', {
            topic,
            error: error.message,
          });
          reject(error);
        } else {
          logger.info('Subscribed to MQTT topic', { topic });
          resolve();
        }
      });
    });
  }

  /**
   * Check if the client is connected
   * @returns True if connected, false otherwise
   */
  public isClientConnected(): boolean {
    return this.isConnected;
  }
}

// Export the singleton instance
export const mqttClient = MqttClient.getInstance();

// Export the publish function for convenience
export const publish = (
  topic: string,
  payload: any,
  options?: mqtt.IClientPublishOptions
): Promise<void> => {
  return mqttClient.publish(topic, payload, options);
};