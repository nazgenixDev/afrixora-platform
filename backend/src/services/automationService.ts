import { Prisma, type Automation } from '@prisma/client';
import type { CreateAutomationInput, UpdateAutomationInput } from '../utils/automationSchemas';
import { prisma } from '../utils/database';
import { NotFoundError } from '../utils/errors';
import { assertDeviceCanBeControlled } from '../utils/deviceCommands';

async function verifyDevices(
  tenantId: string,
  buildingId: string,
  { trigger, action }: Pick<UpdateAutomationInput, 'trigger' | 'action'>,
): Promise<void> {
  const deviceIds = new Set<string>();
  if (trigger) deviceIds.add(trigger.deviceId);
  if (action?.type === 'DEVICE_COMMAND') deviceIds.add(action.deviceId);
  if (deviceIds.size === 0) return;

  const devices = await prisma.device.findMany({
    where: { id: { in: [...deviceIds] }, tenantId, buildingId },
    select: { id: true, type: true },
  });
  if (devices.length !== deviceIds.size) throw new NotFoundError('Appareil introuvable dans ce bâtiment');
  if (action?.type === 'DEVICE_COMMAND') {
    assertDeviceCanBeControlled(devices.find(({ id }) => id === action.deviceId)!.type);
  }
}

export default {
  async findAll(tenantId: string): Promise<Automation[]> {
    return prisma.automation.findMany({ where: { tenantId, building: { tenantId } } });
  },
  async create(data: CreateAutomationInput, tenantId: string): Promise<Automation> {
    const { buildingId, name, trigger, conditions, action } = data;
    const building = await prisma.building.findFirst({
      where: { id: buildingId, tenantId, isActive: true },
      select: { id: true },
    });
    if (!building) throw new NotFoundError('Bâtiment introuvable');
    await verifyDevices(tenantId, buildingId, { trigger, action });

    return prisma.automation.create({
      data: { tenantId, buildingId, name, trigger, conditions, action },
    });
  },
  async update(id: string, data: UpdateAutomationInput, tenantId: string): Promise<Automation> {
    const where = { id, tenantId, building: { tenantId, isActive: true } };
    const automation = await prisma.automation.findFirst({ where, select: { buildingId: true } });
    if (!automation) throw new NotFoundError('Automatisation introuvable');

    const { name, trigger, conditions, action, isActive } = data;
    await verifyDevices(tenantId, automation.buildingId, { trigger, action });
    try {
      return await prisma.automation.update({ where, data: { name, trigger, conditions, action, isActive } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundError('Automatisation introuvable');
      }
      throw error;
    }
  },
  async remove(id: string, tenantId: string): Promise<void> {
    const where = { id, tenantId, building: { tenantId } };
    const automation = await prisma.automation.findFirst({ where, select: { id: true } });
    if (!automation) throw new NotFoundError('Automatisation introuvable');

    try {
      await prisma.automation.delete({ where });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundError('Automatisation introuvable');
      }
      throw error;
    }
  },
};
