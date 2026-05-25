import { prisma } from '../utils/database';

export const buildingService = {
  async findAll(tenantId: string) {
    return prisma.building.findMany({
      where: { tenantId, isActive: true },
      include: {
        _count: { select: { zones: true, devices: true } }
      }
    });
  },

  async findById(id: string, tenantId: string) {
    const building = await prisma.building.findFirst({
      where: { id, tenantId, isActive: true },
      include: {
        zones: {
          include: { _count: { select: { devices: true } } }
        }
      }
    });
    if (!building) throw new Error('Building not found');
    return building;
  },

  async create(data: any, tenantId: string) {
    return prisma.building.create({
      data: { ...data, tenantId }
    });
  },

  async update(id: string, data: any, tenantId: string) {
    const building = await prisma.building.findFirst({ where: { id, tenantId } });
    if (!building) throw new Error('Building not found');
    return prisma.building.update({ where: { id }, data });
  },

  async softDelete(id: string, tenantId: string) {
    const building = await prisma.building.findFirst({ where: { id, tenantId } });
    if (!building) throw new Error('Building not found');
    return prisma.building.update({ where: { id }, data: { isActive: false } });
  },

  async findZones(buildingId: string, tenantId: string) {
    return prisma.zone.findMany({
      where: { buildingId, tenantId }
    });
  },

  async createZone(buildingId: string, data: any, tenantId: string) {
    return prisma.zone.create({
      data: { ...data, buildingId, tenantId }
    });
  }
};
