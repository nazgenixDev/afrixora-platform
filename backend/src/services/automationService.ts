import { prisma } from '../utils/database';

export default {
  async findAll(tenantId: string) {
    return prisma.automation.findMany({ where: { tenantId } });
  },
  async create(data: any, tenantId: string) {
    return prisma.automation.create({ data: { ...data, tenantId } });
  },
  async update(id: string, data: any, tenantId: string) {
    return prisma.automation.update({ where: { id, tenantId }, data });
  },
  async remove(id: string, tenantId: string) {
    await prisma.automation.delete({ where: { id, tenantId } });
  },
};
