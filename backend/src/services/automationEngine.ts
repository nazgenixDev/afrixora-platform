import { Server } from 'socket.io';
import { prisma } from '../utils/database';
import { publishMqtt } from './mqttWorker';
import logger from '../utils/logger';

/**
 * Evaluates automation rules for a device based on received metrics
 * @param tenantId The tenant ID
 * @param buildingId The building ID
 * @param deviceId The device ID that triggered the evaluation
 * @param metrics The metrics received from the device
 * @param io Socket.IO server instance for emitting alerts
 */
export const evaluate = async (
  tenantId: string,
  buildingId: string,
  deviceId: string,
  metrics: Record<string, number>,
  io: Server
): Promise<void> => {
  try {
    // Load active automation rules for this device
    const rules = await prisma.automation.findMany({
      where: {
        tenantId,
        buildingId,
        isActive: true,
        trigger: { path: ['deviceId'], equals: deviceId }
      }
    });

    if (rules.length === 0) {
      return; // No rules to evaluate
    }

    logger.debug(`Evaluating ${rules.length} automation rules for device ${deviceId}`, {
      tenantId,
      buildingId,
      deviceId
    });

    // Evaluate each rule
    for (const rule of rules) {
      try {
        // Extract trigger conditions
        const trigger = rule.trigger as {
          deviceId: string;
          metric: string;
          operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
          value: number;
        };

        // Skip if the metric isn't in the received data
        if (!metrics[trigger.metric]) {
          continue;
        }

        // Evaluate the condition
        let conditionMet = false;
        const metricValue = metrics[trigger.metric];
        
        switch (trigger.operator) {
          case 'gt':
            conditionMet = metricValue > trigger.value;
            break;
          case 'lt':
            conditionMet = metricValue < trigger.value;
            break;
          case 'eq':
            conditionMet = metricValue === trigger.value;
            break;
          case 'gte':
            conditionMet = metricValue >= trigger.value;
            break;
          case 'lte':
            conditionMet = metricValue <= trigger.value;
            break;
        }

        // If condition is met and rule hasn't fired recently (or never fired)
        if (conditionMet && (!rule.lastFiredAt || new Date().getTime() - rule.lastFiredAt.getTime() > 5 * 60 * 1000)) {
          logger.info(`Automation rule triggered: ${rule.name}`, {
            ruleId: rule.id,
            tenantId,
            buildingId,
            deviceId,
            metric: trigger.metric,
            value: metricValue
          });

          // Execute the action based on its type
          const action = rule.action as any;
          
          if (action.type === 'DEVICE_COMMAND') {
            // Send command to device via MQTT
            publishMqtt(
              `afrixora/${tenantId}/${buildingId}/devices/${action.deviceId}/commands`,
              { command: action.command, params: action.params }
            );
            
            logger.debug(`Published MQTT command for device ${action.deviceId}`, {
              command: action.command,
              params: action.params
            });
          } 
          else if (action.type === 'SEND_ALERT') {
            // Create alert in database
            const alert = await prisma.alert.create({
              data: {
                tenantId,
                buildingId,
                deviceId,
                type: 'AUTOMATION',
                severity: action.severity || 'WARNING',
                message: action.message || `Règle déclenchée : ${rule.name}`,
                isRead: false
              }
            });
            
            // Emit alert to connected clients
            io.to(`building:${buildingId}`).emit('alert:new', alert);
            
            logger.debug(`Created alert for automation rule: ${rule.name}`, {
              alertId: alert.id,
              severity: alert.severity
            });
          }

          // Update lastFiredAt timestamp
          await prisma.automation.update({
            where: { id: rule.id },
            data: { lastFiredAt: new Date() }
          });
        }
      } catch (ruleError) {
        // Log error but continue processing other rules
        logger.error(`Error evaluating rule ${rule.id}`, {
          error: (ruleError as Error).message,
          ruleId: rule.id,
          tenantId,
          buildingId
        });
      }
    }
  } catch (error) {
    logger.error('Error in automation engine', {
      error: (error as Error).message,
      tenantId,
      buildingId,
      deviceId
    });
  }
};

export default { evaluate };