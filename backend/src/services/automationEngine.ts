import { Server } from 'socket.io';
import { prisma } from '../utils/database';
import { automationActionSchema } from '../utils/automationSchemas';
import deviceService from './deviceService';
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
        building: { tenantId, isActive: true, tenant: { isActive: true } },
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
        if (typeof metrics[trigger.metric] !== 'number') {
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
          const parsedAction = automationActionSchema.safeParse(rule.action);
          if (!parsedAction.success) {
            logger.warn('automation_action_invalid', { ruleId: rule.id, tenantId, buildingId });
            continue;
          }
          const action = parsedAction.data;
          logger.info('automation_triggered', {
            ruleId: rule.id,
            tenantId,
            buildingId,
            deviceId,
            metric: trigger.metric,
            value: metricValue
          });

          // Execute the action based on its type
          if (action.type === 'DEVICE_COMMAND') {
            if (process.env.AFRIXORA_AUTOMATION_COMMANDS_ENABLED !== 'true' ||
                process.env.AFRIXORA_DEVICE_CONTROL_ENABLED !== 'true') continue;
            const result = await deviceService.control(action.deviceId, action, tenantId,
              { origin: 'AUTOMATION', buildingId });
            if (result.status === 'FAILED' || result.status === 'EXPIRED' || result.status === 'REJECTED') continue;
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
            where: { id: rule.id, tenantId, buildingId },
            data: { lastFiredAt: new Date() }
          });
        }
      } catch (ruleError) {
        // Log error but continue processing other rules
        logger.error(`Error evaluating rule ${rule.id}`, {
          errorType: (ruleError as Error).name,
          ruleId: rule.id,
          tenantId,
          buildingId
        });
      }
    }
  } catch (error) {
    logger.error('Error in automation engine', {
      errorType: (error as Error).name,
      tenantId,
      buildingId,
      deviceId
    });
  }
};

export default { evaluate };
