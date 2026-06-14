import { prisma } from '../utils/database';

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
  config?: any;
}

interface BuildingUpdateData {
  name?: string;
  address?: string;
  city?: string;
  unitsCount?: number;
  config?: any;
  isActive?: boolean;
}

interface ZoneCreateData {
  name: string;
  floor?: number;
  type?: string;
}

export default {
  async findAll(tenantId: string, filters: BuildingFilters = {}) {
    const { page = 1, limit = 50, ...where } = filters;
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      prisma.building.findMany({
        where: { tenantId, ...where, isActive: true },
        skip,
        take: limit,
        include: { zones: true, devices: true },
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
    return prisma.building.findFirst({
      where: { id, tenantId, isActive: true },
      include: { zones: true, devices: true },
    });
  },

  async createZone(buildingId: string, data: ZoneCreateData, tenantId: string) {
    if (!data.name) throw new Error('Zone name is required');
    // Le champ 'type' est un string, Prisma acceptera une valeur correspondant à l'enum ZoneType
    const zoneType = data.type || 'ROOM';
    return prisma.zone.create({
      data: {
        name: data.name,
        buildingId,
        tenantId,
        floor: data.floor || 0,
        type: zoneType as any,
      },
    });
  },
};
