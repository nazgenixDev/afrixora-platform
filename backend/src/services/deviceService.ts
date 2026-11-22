import { Prisma, type DeviceType, type Protocol } from '@prisma/client';
import { prisma } from '../utils/database';
import { publishMqtt } from './mqttWorker';
import { AppError, NotFoundError } from '../utils/errors';
import { assertDeviceCanBeControlled, type DeviceCommandInput } from '../utils/deviceCommands';

const activeCommandStatuses = ['PENDING', 'SENT', 'ACKNOWLEDGED'] as const;

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
    const where = { ...relationsDuTenant(tenantId), id, tenantId };
    if (await prisma.deviceCommand.count({ where: { deviceId: id, tenantId } })) {
      throw new AppError('Cet appareil possède un historique de commandes.', 409, 'DEVICE_AUDIT_HISTORY');
    }
    try {
      await prisma.device.delete({ where });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003' &&
          await prisma.deviceCommand.count({ where: { deviceId: id, tenantId } })) {
        throw new AppError('Cet appareil possède un historique de commandes.', 409, 'DEVICE_AUDIT_HISTORY');
      }
      throw error;
    }
  },

  async control(
    id: string,
    command: DeviceCommandInput,
    tenantId: string,
    context: { origin?: 'MANUAL' | 'AUTOMATION'; requestedByUserId?: string; buildingId?: string } = {},
  ) {
    if (process.env.AFRIXORA_DEVICE_CONTROL_ENABLED !== 'true' ||
        (context.origin === 'AUTOMATION' && process.env.AFRIXORA_AUTOMATION_COMMANDS_ENABLED !== 'true')) {
      throw new AppError('Le pilotage des appareils est désactivé.', 503, 'CONTROL_DISABLED');
    }
    const device = await prisma.device.findFirst({
      where: { id, tenantId, buildingId: context.buildingId,
        building: { tenantId, isActive: true, tenant: { isActive: true } } },
    });
    if (!device) {
      throw new NotFoundError('Device not found');
    }
    assertDeviceCanBeControlled(device.type);
    if (!device.isOnline) throw new AppError('Appareil hors ligne.', 409, 'DEVICE_OFFLINE');

    const state = command.command === 'set_state' ? command.params?.state : command.command === 'turn_on' ? 'on' : 'off';
    if (!state) throw new AppError('État demandé manquant.', 400, 'INVALID_DEVICE_COMMAND');
    const scope = { tenantId, buildingId: device.buildingId, deviceId: id };
    const requestedAt = new Date();
    const expiresAt = new Date(requestedAt.getTime() + 30_000);
    await prisma.deviceCommand.updateMany({
      where: { ...scope, expiresAt: { lte: requestedAt }, status: { in: [...activeCommandStatuses] } },
      data: { status: 'EXPIRED' },
    });
    let journal;
    try {
      journal = await prisma.deviceCommand.create({
        data: { ...scope, command: 'set_state', params: { state }, expiresAt,
          origin: context.origin ?? 'MANUAL', requestedByUserId: context.requestedByUserId },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError('Une commande est déjà en cours pour cet appareil.', 409, 'COMMAND_IN_PROGRESS');
      }
      throw error;
    }

    const where = { ...scope, id: journal.id };
    const topic = `afrixora/${tenantId}/${device.buildingId}/devices/${id}/commands`;
    try {
      await publishMqtt(topic, {
        commandId: journal.id, command: command.command, params: command.params, expiresAt: expiresAt.toISOString(),
      }, expiresAt);
    } catch {
      const failedAt = new Date();
      const expired = failedAt >= expiresAt;
      const result = await prisma.deviceCommand.updateMany({
        where: { ...where, status: 'PENDING' },
        data: expired ? { status: 'EXPIRED' } : { status: 'FAILED', failedAt, error: 'Échec de publication MQTT' },
      });
      if (!result.count) {
        const current = await this.getCommand(id, journal.id, tenantId);
        if (current.status !== 'EXPIRED') return { accepted: true, commandId: journal.id, status: current.status, expiresAt };
      }
      if (expired || !result.count) throw new AppError('Délai de commande dépassé.', 409, 'COMMAND_EXPIRED');
      throw new AppError('Transport MQTT indisponible.', 503, 'MQTT_UNAVAILABLE');
    }

    const sentAt = new Date();
    const sent = await prisma.deviceCommand.updateMany({
      where: { ...where, status: 'PENDING', expiresAt: { gt: sentAt } },
      data: { status: 'SENT', sentAt },
    });
    if (sent.count) return { accepted: true, commandId: journal.id, status: 'SENT' as const, expiresAt };

    // Un accusé du boîtier peut précéder l'accusé de publication du broker.
    await prisma.deviceCommand.updateMany({ where: { ...where, sentAt: null }, data: { sentAt } });
    const current = await this.getCommand(id, journal.id, tenantId);
    return { accepted: true, commandId: journal.id, status: current.status, expiresAt };
  },

  async getCommand(deviceId: string, commandId: string, tenantId: string) {
    const device = await prisma.device.findFirst({
      where: { ...relationsDuTenant(tenantId), id: deviceId, tenantId }, select: { buildingId: true },
    });
    if (!device) throw new NotFoundError('Appareil introuvable.');

    const where = { id: commandId, deviceId, tenantId, buildingId: device.buildingId };
    await prisma.deviceCommand.updateMany({
      where: { ...where, expiresAt: { lte: new Date() }, status: { in: [...activeCommandStatuses] } },
      data: { status: 'EXPIRED' },
    });
    const command = await prisma.deviceCommand.findFirst({ where });
    if (!command) throw new NotFoundError('Commande introuvable.');
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
