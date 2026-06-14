import { prisma } from '../utils/database';
import { publishMqtt } from './mqttWorker';

export interface DeviceFilters {
  type?: string;
  zoneId?: string;
  isOnline?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}
export default {
  async findAll(tenantId: string, filters?: any, pagination?: { page: number; limit: number }) {
    const { page = 1, limit = 50 } = pagination || {};
    const skip = (page - 1) * limit;
    const where = { tenantId, ...filters };
    const [data, total] = await Promise.all([
      prisma.device.findMany({
        where,
        skip,
        take: limit,
        include: { building: { select: { name: true } }, zone: true, states: true },
      }),
      prisma.device.count({ where }),
    ]);
    return { data, total, page, totalPages: Math.ceil(total / limit) };
  },

  async create(data: any, tenantId: string) {
    return prisma.device.create({
      data: { ...data, tenantId },
      include: { building: { select: { name: true } }, zone: true, states: true },
    });
  },

  async findById(id: string, tenantId: string) {
    return prisma.device.findFirst({
      where: { id, tenantId },
      include: { building: { select: { name: true } }, zone: true, states: true },
    });
  },

  async update(id: string, data: any, tenantId: string) {
    return prisma.device.update({
      where: { id, tenantId },
      data,
      include: { building: { select: { name: true } }, zone: true, states: true },
    });
  },

  async remove(id: string, tenantId: string) {
    await prisma.device.delete({ where: { id, tenantId } });
  },

  async control(id: string, command: any, tenantId: string) {
    const device = await prisma.device.findFirst({ where: { id, tenantId } });
    if (!device) throw new Error('Device not found');
    const topic = `afrixora/${tenantId}/${device.buildingId}/devices/${id}/commands`;
    await publishMqtt(topic, command);
    if (command.params?.state) {
      const state = command.params.state === 'on';
      await prisma.deviceState.upsert({
        where: { deviceId: id },
        update: { state: { ...(device.config as object || {}), state: state ? 'on' : 'off' } },
        create: { deviceId: id, tenantId, state: { state: state ? 'on' : 'off' } },
      });
    }
    return { success: true };
  },

  async getHistory(id: string, tenantId: string, limit = 100) {
    return prisma.deviceState.findMany({
      where: { deviceId: id, tenantId },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });
  },
};
