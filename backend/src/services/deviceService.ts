import type { DeviceType, Prisma, Protocol } from '@prisma/client';
import { prisma } from '../utils/database';
import { publishMqtt } from './mqttWorker';
import { NotFoundError } from '../utils/errors';

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
    if (filters.search) where.name = { contains: filters.search, mode: 'insensitive' as const };

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
    await prisma.device.delete({ where: { ...relationsDuTenant(tenantId), id, tenantId } });
  },

  async control(id: string, command: { command: string; params?: Record<string, unknown> }, tenantId: string) {
    const device = await prisma.device.findFirst({ where: { ...relationsDuTenant(tenantId), id, tenantId } });
    if (!device) {
      throw new NotFoundError('Device not found');
    }
    const topic = `afrixora/${tenantId}/${device.buildingId}/devices/${id}/commands`;
    await publishMqtt(topic, command);
    if (command.params?.state) {
      const state = command.params.state === 'on';
      await prisma.deviceState.upsert({
        where: { deviceId: id, tenantId },
        update: { state: { ...(device.config as object || {}), state: state ? 'on' : 'off' } },
        create: { deviceId: id, tenantId, state: { state: state ? 'on' : 'off' } },
      });
    }
    return { success: true };
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