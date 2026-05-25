import { DeviceType } from "@prisma/client";
import { prisma } from '../utils/database';
import { publish } from '../utils/mqttClient';
import logger from '../utils/logger';

interface DeviceFilters {
  buildingId?: string;
  zoneId?: string;
  type?: DeviceType;
}

interface DeviceCommand {
  command: string;
  params: Record<string, any>;
}

export const deviceService = {
  /**
   * Find all devices for a tenant with optional filters
   * @param tenantId Tenant ID
   * @param filters Optional filters (buildingId, zoneId, type)
   * @returns List of devices with their current state
   */
  async findAll(tenantId: string, filters: DeviceFilters = {}) {
    return prisma.device.findMany({
      where: {
        tenantId,
        ...(filters.buildingId && { buildingId: filters.buildingId }),
        ...(filters.zoneId && { zoneId: filters.zoneId }),
        ...(filters.type && { type: filters.type }),
      },
      include: {
        states: true,
        building: {
          select: {
            name: true,
          },
        },
        zone: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });
  },

  /**
   * Find a device by ID
   * @param id Device ID
   * @param tenantId Tenant ID
   * @returns Device with its current state
   */
  async findById(id: string, tenantId: string) {
    const device = await prisma.device.findFirst({
      where: {
        id,
        tenantId,
      },
      include: {
        states: true,
        building: {
          select: {
            name: true,
          },
        },
        zone: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!device) {
      throw new Error('Device not found');
    }

    return device;
  },

  /**
   * Create a new device
   * @param data Device data
   * @param tenantId Tenant ID
   * @returns Created device
   */
  async create(data: any, tenantId: string) {
    // Force tenantId to ensure multi-tenant isolation
    return prisma.device.create({
      data: {
        ...data,
        tenantId,
      },
    });
  },

  /**
   * Update a device
   * @param id Device ID
   * @param data Updated device data
   * @param tenantId Tenant ID
   * @returns Updated device
   */
  async update(id: string, data: any, tenantId: string) {
    // Check if device exists and belongs to tenant
    const device = await prisma.device.findFirst({
      where: {
        id,
        tenantId,
      },
    });

    if (!device) {
      throw new Error('Device not found');
    }

    return prisma.device.update({
      where: { id },
      data,
    });
  },

  /**
   * Remove a device
   * @param id Device ID
   * @param tenantId Tenant ID
   * @returns Removed device
   */
  async remove(id: string, tenantId: string) {
    // Check if device exists and belongs to tenant
    const device = await prisma.device.findFirst({
      where: {
        id,
        tenantId,
      },
    });

    if (!device) {
      throw new Error('Device not found');
    }

    // Delete device states first (due to foreign key constraint)
    await prisma.deviceState.deleteMany({
      where: { deviceId: id },
    });

    // Delete the device
    return prisma.device.delete({
      where: { id },
    });
  },

  /**
   * Control a device via MQTT
   * @param id Device ID
   * @param tenantId Tenant ID
   * @param command Command to send to the device
   * @returns Result of the command
   */
  async control(id: string, tenantId: string, command: DeviceCommand) {
    // Check if device exists and belongs to tenant
    const device = await prisma.device.findFirst({
      where: {
        id,
        tenantId,
      },
      include: {
        building: true,
      },
    });

    if (!device) {
      throw new Error('Device not found');
    }

    // Construct MQTT topic following the convention
    const topic = `afrixora/${tenantId}/${device.buildingId}/devices/${id}/commands`;

    // Add correlation ID to track the command
    const payload = {
      ...command,
      correlationId: `cmd-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    };

    try {
      // Publish command to MQTT broker
      await publish(topic, payload);

      logger.info('Device control command sent', {
        deviceId: id,
        topic,
        command: payload.command,
      });

      return {
        success: true,
        topic,
        command: payload,
      };
    } catch (error) {
      logger.error('Failed to send device control command', {
        deviceId: id,
        topic,
        error: (error as Error).message,
      });
      throw new Error(`Failed to send command: ${(error as Error).message}`);
    }
  },

  /**
   * Get device state history
   * @param id Device ID
   * @param tenantId Tenant ID
   * @param limit Maximum number of records to return
   * @returns Device state history
   */
  async getHistory(id: string, tenantId: string, limit: number = 100) {
    // Check if device exists and belongs to tenant
    const device = await prisma.device.findFirst({
      where: {
        id,
        tenantId,
      },
    });

    if (!device) {
      throw new Error('Device not found');
    }

    // Get device state history
    return prisma.deviceState.findMany({
      where: {
        deviceId: id,
        tenantId,
      },
      orderBy: {
        updatedAt: 'desc',
      },
      take: limit,
    });
  },
};

export default deviceService;