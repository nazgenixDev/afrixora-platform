import { Prisma, type ZoneType } from '@prisma/client';
import { prisma } from '../utils/database';
import { NotFoundError } from '../utils/errors';

interface BuildingFilters {
  name?: string;
  city?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
  [key: string]: unknown;
}

interface BuildingCreateData {
  name: string;
  address?: string;
  city?: string;
  unitsCount?: number;
  config?: Prisma.InputJsonValue;
}

interface BuildingUpdateData {
  name?: string;
  address?: string;
  city?: string;
  unitsCount?: number;
  config?: Prisma.InputJsonValue;
  isActive?: boolean;
}

interface ZoneCreateData {
  name: string;
  floor?: number;
  type?: ZoneType;
}

export default {
  async findAll(tenantId: string, filters: BuildingFilters = {}) {
    const { page = 1, limit = 50, ...where } = filters;
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      prisma.building.findMany({
        where: { tenantId, ...where, isActive: true },
        orderBy: { id: 'asc' },
        skip,
        take: limit,
        include: { _count: { select: { zones: true, devices: true } } },
      }),
      prisma.building.count({ where: { tenantId, ...where, isActive: true } }),
    ]);
    return { data, total, page, totalPages: Math.ceil(total / limit) };
  },

  async create(data: BuildingCreateData, tenantId: string) {
    if (!data.name) throw new Error('Building name is required');
    return prisma.building.create({
      data: {
        name: data.name,
        address: data.address || '',
        city: data.city || 'Lubumbashi',
        unitsCount: data.unitsCount || 0,
        tenantId,
        config: data.config || {},
      },
    });
  },

  async update(id: string, data: BuildingUpdateData, tenantId: string) {
    return prisma.building.update({
      where: { id, tenantId },
      data,
    });
  },

  async softDelete(id: string, tenantId: string) {
    return prisma.building.update({
      where: { id, tenantId },
      data: { isActive: false },
    });
  },

  async findZones(buildingId: string, tenantId: string) {
    return prisma.zone.findMany({
      where: { buildingId, tenantId },
    });
  },

  async getZones(buildingId: string, tenantId: string) {
    return this.findZones(buildingId, tenantId);
  },

  async findById(id: string, tenantId: string) {
    const building = await prisma.building.findFirst({
      where: { id, tenantId, isActive: true },
      include: { zones: { include: { _count: { select: { devices: true } } } }, devices: true },
    });
    if (!building) throw new NotFoundError('Bâtiment introuvable');
    return building;
  },

  async createZone(buildingId: string, data: ZoneCreateData, tenantId: string) {
    if (!data.name) throw new Error('Zone name is required');
    try {
      return await prisma.zone.create({
        data: {
          name: data.name,
          building: { connect: { id: buildingId, tenantId } },
          tenantId,
          floor: data.floor ?? 0,
          type: data.type ?? 'ROOM',
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundError('Bâtiment introuvable');
      }
      throw error;
    }
  },
};
