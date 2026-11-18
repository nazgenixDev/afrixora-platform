import { Prisma, type Alert, type AlertType, type Severity } from '@prisma/client';
import prisma from '../utils/database';
import { NotFoundError } from '../utils/errors';

interface AlertFilters {
  isRead?: boolean;
  severity?: Severity;
  buildingId?: string;
  type?: AlertType;
}

interface Pagination {
  page: number;
  limit: number;
}

interface AlertPage {
  data: Alert[];
  total: number;
  page: number;
  totalPages: number;
}

export const alertService = {
  async findAll(tenantId: string, filters: AlertFilters, { page, limit }: Pagination): Promise<AlertPage> {
    const { buildingId, isRead, severity, type } = filters;
    if (buildingId !== undefined) {
      const building = await prisma.building.findFirst({
        where: { id: buildingId, tenantId },
        select: { id: true },
      });
      if (!building) throw new NotFoundError('Bâtiment introuvable');
    }

    const where: Prisma.AlertWhereInput = { buildingId, isRead, severity, type, tenantId };
    const [data, total] = await prisma.$transaction([
      prisma.alert.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.alert.count({ where }),
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });

    return { data, total, page, totalPages: Math.ceil(total / limit) };
  },

  async markAsRead(id: string, tenantId: string): Promise<Alert> {
    const where = { id, tenantId };
    const alert = await prisma.alert.findFirst({ where, select: { id: true } });
    if (!alert) throw new NotFoundError('Alerte introuvable');

    try {
      return await prisma.alert.update({ where, data: { isRead: true } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundError('Alerte introuvable');
      }
      throw error;
    }
  },
};
