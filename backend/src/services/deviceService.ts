import type { DeviceType, Prisma, Protocol } from '@prisma/client';
import { prisma } from '../utils/database';
import { publishMqtt } from './mqttWorker';
import { AppError, NotFoundError } from '../utils/errors';

export interface DeviceFilters {
  buildingId?: string;
  zoneId?: string;
  type?: DeviceType;
  isOnline?: boolean;
  search?: string;
}

export interface Pagination {
  page: number;
  limit: number;
}

// Certaines données antérieures peuvent référencer une zone ou un bâtiment étranger.
function relationsDuTenant(tenantId: string): Pick<Prisma.DeviceWhereInput, 'building' | 'OR'> {
  return { building: { tenantId }, OR: [{ zoneId: null }, { zone: { tenantId } }] };
}

export default {
  async findAll(tenantId: string, filters: DeviceFilters = {}, pagination: Pagination = { page: 1, limit: 50 }) {
    const { page = 1, limit = 50 } = pagination;
    const skip = (page - 1) * limit;

    const where: Prisma.DeviceWhereInput = relationsDuTenant(tenantId);

    if (filters.buildingId) where.buildingId = filters.buildingId;
    if (filters.zoneId) where.zoneId = filters.zoneId;
    if (filters.type) where.type = filters.type;
    if (filters.isOnline !== undefined) where.isOnline = filters.isOnline;
    if (filters.search) {
      const match = { contains: filters.search, mode: 'insensitive' } as const;
      where.AND = [{ OR: [{ name: match }, { id: match }, { zone: { name: match } }] }];
    }

    where.tenantId = tenantId;

    const [data, total] = await Promise.all([
      prisma.device.findMany({
        where,
        orderBy: { id: 'asc' },
        skip,
        take: limit,
        include: { building: { select: { name: true } }, zone: true, states: { where: { tenantId } } },
      }),
      prisma.device.count({ where }),
    ]);

    return { data, total, page, totalPages: Math.ceil(total / limit) };
  },

  async create(data: {
    name: string;
    type: DeviceType;
    buildingId: string;
    zoneId?: string;
    protocol?: Protocol;
  }, tenantId: string) {
    // Verify building belongs to tenant and is active
    const building = await prisma.building.findFirst({
      where: { id: data.buildingId, tenantId, isActive: true },
    });
    if (!building) {
      throw new NotFoundError('Building not found or not accessible');
    }

    // If zoneId provided, verify it belongs to tenant and same building
    if (data.zoneId) {
      const zone = await prisma.zone.findFirst({
        where: { id: data.zoneId, tenantId, buildingId: data.buildingId },
      });
      if (!zone) {
        throw new NotFoundError('Zone not found or not accessible');
      }
    }

    // Explicitly construct data object - never use ...data
    const createData = {
      name: data.name,
      type: data.type,
      buildingId: data.buildingId,
      zoneId: data.zoneId ?? null,
      protocol: data.protocol ?? 'MQTT',
      tenantId,
      config: {},
      metadata: {},
    };

    return prisma.device.create({
      data: createData,
      include: { building: { select: { name: true } }, zone: true, states: { where: { tenantId } } },
    });
  },

  async findById(id: string, tenantId: string) {
    const device = await prisma.device.findFirst({
      where: { ...relationsDuTenant(tenantId), id, tenantId },
      include: { building: { select: { name: true } }, zone: true, states: { where: { tenantId } } },
    });
    if (!device) {
      throw new NotFoundError('Device not found');
    }
    return device;
  },

  async update(id: string, data: {
    name?: string;
    zoneId?: string | null;
    config?: Record<string, unknown>;
  }, tenantId: string) {
    // First verify device exists and belongs to tenant
    const existingDevice = await prisma.device.findFirst({
      where: { ...relationsDuTenant(tenantId), id, tenantId },
      include: { zone: true },
    });
    if (!existingDevice) {
      throw new NotFoundError('Device not found');
    }

    // If zoneId is provided, verify it belongs to tenant and same building
    if (data.zoneId !== undefined) {
      if (data.zoneId !== null) {
        const zone = await prisma.zone.findFirst({
          where: { id: data.zoneId, tenantId, buildingId: existingDevice.buildingId },
        });
        if (!zone) {
          throw new NotFoundError('Zone not found or not accessible');
        }
      }
    }

    // Explicitly construct update data - only allowed fields
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.zoneId !== undefined) updateData.zoneId = data.zoneId;
    if (data.config !== undefined) updateData.config = data.config;

    return prisma.device.update({
      where: { id, tenantId },
      data: updateData,
      include: { building: { select: { name: true } }, zone: true, states: { where: { tenantId } } },
    });
  },

  async remove(id: string, tenantId: string) {
    // Verify existence with findFirst before delete
    const device = await prisma.device.findFirst({ where: { ...relationsDuTenant(tenantId), id, tenantId } });
    if (!device) {
      throw new NotFoundError('Device not found');
    }
    if (await prisma.deviceCommand.count({ where: { deviceId: id, tenantId } })) {
      throw new AppError('Device with command history cannot be deleted without archival', 409, 'DEVICE_AUDIT_HISTORY');
    }
    await prisma.device.delete({ where: { ...relationsDuTenant(tenantId), id, tenantId } });
  },

  // Le journal distingue la publication MQTT et les déclarations du boîtier.
  async control(
    id: string,
    command: { command: 'set_state'; params: { state: 'on' | 'off' } },
    tenantId: string,
    context: { origin?: 'MANUAL' | 'AUTOMATION'; requestedByUserId?: string; buildingId?: string } = {}
  ) {
    if (process.env.AFRIXORA_DEVICE_CONTROL_ENABLED !== 'true' ||
        (context.origin === 'AUTOMATION' && process.env.AFRIXORA_AUTOMATION_COMMANDS_ENABLED !== 'true')) {
      throw new AppError('Pilotage physique désactivé en attente de validation', 503, 'CONTROL_DISABLED');
    }
    const device = await prisma.device.findFirst({
      where: { ...relationsDuTenant(tenantId), id, tenantId, buildingId: context.buildingId,
        building: { tenantId, isActive: true } },
    });
    if (!device) throw new NotFoundError('Device not found');
    if (!device.isOnline) throw new AppError('Device offline', 409, 'DEVICE_OFFLINE');
    if (command.command !== 'set_state' || !['on', 'off'].includes(command.params?.state)) {
      throw new AppError('Unsupported command', 400, 'INVALID_COMMAND');
    }
    const expiresAt = new Date(Date.now() + 30_000);
    const journal = await prisma.deviceCommand.create({
      data: {
        tenantId, buildingId: device.buildingId, deviceId: id,
        command: command.command, params: command.params,
        origin: context.origin ?? 'MANUAL', requestedByUserId: context.requestedByUserId,
        expiresAt, status: 'PENDING',
      },
    });
    const scope = { id: journal.id, tenantId, buildingId: device.buildingId, deviceId: id };
    if (expiresAt.getTime() <= Date.now()) {
      await prisma.deviceCommand.updateMany({
        where: { ...scope, status: 'PENDING' },
        data: { status: 'EXPIRED' },
      });
      throw new AppError('Délai de commande dépassé', 409, 'COMMAND_EXPIRED');
    }

    const topic = `afrixora/${tenantId}/${device.buildingId}/devices/${id}/commands`;
    try {
      await publishMqtt(topic, {
        commandId: journal.id, command: command.command,
        params: command.params, expiresAt: expiresAt.toISOString(),
      }, expiresAt);
    } catch {
      const failedAt = new Date();
      const expired = failedAt >= expiresAt;
      await prisma.deviceCommand.updateMany({
        where: { ...scope, status: 'PENDING' },
        data: expired
          ? { status: 'EXPIRED' }
          : { status: 'FAILED', failedAt, error: 'Échec de publication MQTT' },
      });
      if (expired) throw new AppError('Délai de commande dépassé', 409, 'COMMAND_EXPIRED');
      throw new AppError('Broker MQTT indisponible', 503, 'MQTT_UNAVAILABLE');
    }
    const sentAt = new Date();
    const sent = await prisma.deviceCommand.updateMany({
      where: { ...scope, status: 'PENDING', expiresAt: { gt: sentAt } },
      data: { status: 'SENT', sentAt },
    });
    if (sent.count) return { accepted: true, commandId: journal.id, status: 'SENT', expiresAt };

    // Le boîtier peut répondre avant la confirmation de publication du broker.
    await prisma.deviceCommand.updateMany({
      where: { ...scope, sentAt: null },
      data: { sentAt },
    });
    const result = await this.getCommand(id, journal.id, tenantId);
    return { accepted: true, commandId: journal.id, status: result.status, expiresAt };
  },

  async getCommand(deviceId: string, commandId: string, tenantId: string) {
    const device = await prisma.device.findFirst({
      where: { ...relationsDuTenant(tenantId), id: deviceId, tenantId }, select: { buildingId: true },
    });
    if (!device) throw new NotFoundError('Device not found');

    const scope = { id: commandId, deviceId, tenantId, buildingId: device.buildingId };
    await prisma.deviceCommand.updateMany({
      where: { ...scope, expiresAt: { lte: new Date() }, status: { in: ['PENDING', 'SENT', 'ACKNOWLEDGED'] } },
      data: { status: 'EXPIRED' },
    });
    const command = await prisma.deviceCommand.findFirst({ where: scope });
    if (!command) throw new NotFoundError('Command not found');
    return command;
  },

  async getHistory(id: string, tenantId: string, limit = 100) {
    // Verify device exists and belongs to tenant
    const device = await prisma.device.findFirst({ where: { ...relationsDuTenant(tenantId), id, tenantId } });
    if (!device) {
      throw new NotFoundError('Device not found');
    }
    return prisma.deviceState.findMany({
      where: { deviceId: id, tenantId },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });
  },
};
