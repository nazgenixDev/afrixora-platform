import { prisma } from '../utils/database';

export default {
  async findAll(tenantId: string, filters?: any) {
    // Extraire page et limit des filtres
    const { page = 1, limit = 50, ...where } = filters || {};
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

  async create(data: any, tenantId: string) {
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

  async update(id: string, data: any, tenantId: string) {
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

  async createZone(buildingId: string, data: any, tenantId: string) {
    if (!data.name) throw new Error('Zone name is required');
    return prisma.zone.create({
      data: {
        name: data.name,
        buildingId,
        tenantId,
        floor: data.floor || 0,
        type: data.type || 'ROOM',
      },
    });
  },
};
