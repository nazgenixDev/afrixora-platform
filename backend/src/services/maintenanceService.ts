import type { MaintenanceEventType, MaintenanceTicketStatus, Prisma } from '@prisma/client';
import type { z } from 'zod';
import { buildingTimeZone } from '../utils/buildingTimeZone';
import { AppError, NotFoundError } from '../utils/errors';
import type { hourReadingInput, interventionInput, planInput, ticketInput, ticketUpdate } from '../utils/maintenanceSchemas';
import { onSite } from './energyTopologyService';
import { maintenanceSchedule, validHourProgress } from './maintenanceSchedule';
import { EnergyDecimal } from './meteredEnergyService';

type Actor = Parameters<typeof onSite>[0];
type Tx = Prisma.TransactionClient;
type Site = { tenantId: string; buildingId: string };
type Page = { page: number; limit: number };
type ScopeQuery = Page & { buildingId: string };

function conflict(message: string) {
  return new AppError(message, 409, 'MAINTENANCE_CONFLICT');
}

async function paginate<T>(query: Page, list: (paging: { skip: number; take: number }) => Promise<T[]>, count: () => Promise<number>) {
  const { page, limit } = query;
  const [data, total] = await Promise.all([list({ skip: (page - 1) * limit, take: limit }), count()]);
  return { data, total, page, totalPages: Math.ceil(total / limit) };
}

async function requireGenerator(tx: Tx, site: Site, sourceId: string) {
  if (!await tx.energySource.findFirst({ where: { ...site, id: sourceId, type: 'GENERATOR', archivedAt: null }, select: { id: true } })) {
    throw new NotFoundError('Groupe électrogène actif introuvable.');
  }
}

async function requireResponsible(tx: Tx, site: Site, id: string) {
  const user = await tx.user.findFirst({
    where: { id, tenantId: site.tenantId, isActive: true, OR: [
      { role: { in: ['SUPER_ADMIN', 'TENANT_ADMIN'] } },
      { role: { in: ['BUILDING_ADMIN', 'OPERATOR'] }, buildingAccess: { some: site } },
    ] }, select: { id: true },
  });
  if (!user) throw new NotFoundError('Responsable habilité introuvable dans ce bâtiment.');
}

function audit(tx: Tx, site: Site, ticketId: string, actor: Actor, type: MaintenanceEventType, details: Prisma.InputJsonObject) {
  return tx.maintenanceEvent.create({ data: { ...site, ticketId, actorUserId: actor.userId, type, details } });
}

export function addHourReading(actor: Actor, { buildingId, ...input }: z.infer<typeof hourReadingInput>) {
  return onSite(actor, buildingId, 'write', async (tx, site) => {
    await requireGenerator(tx, site, input.sourceId);
    const where = { ...site, sourceId: input.sourceId };
    const [previous, next] = await Promise.all([
      tx.maintenanceHourReading.findFirst({ where: { ...where, capturedAt: { lt: input.capturedAt } }, orderBy: { capturedAt: 'desc' } }),
      tx.maintenanceHourReading.findFirst({ where: { ...where, capturedAt: { gt: input.capturedAt } }, orderBy: { capturedAt: 'asc' } }),
    ]);
    const reading = { ...input, totalHours: new EnergyDecimal(input.totalHours) };
    if ((previous && !validHourProgress(previous, reading)) || (next && !validHourProgress(reading, next))) {
      throw conflict('Le relevé est incompatible avec les heures cumulées et les dates voisines.');
    }
    return tx.maintenanceHourReading.create({ data: { ...site, ...reading, recordedBy: actor.userId } });
  });
}

export function listHourReadings(actor: Actor, query: ScopeQuery & { sourceId: string }) {
  return onSite(actor, query.buildingId, 'read', async (tx, site) => {
    const where = { ...site, sourceId: query.sourceId };
    return paginate(query, paging => tx.maintenanceHourReading.findMany({ where, ...paging, orderBy: { capturedAt: 'desc' } }),
      () => tx.maintenanceHourReading.count({ where }));
  });
}

export function addPlan(actor: Actor, { buildingId, ...input }: z.infer<typeof planInput>) {
  return onSite(actor, buildingId, 'write', async (tx, site) => {
    await requireGenerator(tx, site, input.sourceId);
    let initialTotalHours;
    if (input.initialReadingId) {
      const initial = await tx.maintenanceHourReading.findFirst({
        where: { ...site, sourceId: input.sourceId, id: input.initialReadingId, capturedAt: input.startsAt },
      });
      if (!initial) throw new NotFoundError('Relevé initial du groupe introuvable à cette date.');
      initialTotalHours = initial.totalHours;
    }
    return tx.maintenancePlan.create({ data: { ...site, ...input, initialTotalHours, createdBy: actor.userId } });
  });
}

export function listPlans(actor: Actor, query: ScopeQuery & { sourceId?: string }) {
  return onSite(actor, query.buildingId, 'read', async (tx, site) => {
    const building = await tx.building.findFirstOrThrow({ where: { id: site.buildingId, tenantId: site.tenantId },
      select: { city: true, timeZone: true } });
    const timeZone = buildingTimeZone(building) ?? 'UTC';
    const now = new Date();
    const where = { ...site, sourceId: query.sourceId };
    const { data, ...page } = await paginate(query,
      paging => tx.maintenancePlan.findMany({ where, ...paging, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], include: {
        source: { select: { name: true, archivedAt: true, maintenanceHours: { where: site, orderBy: { capturedAt: 'desc' }, take: 1 } } },
        tickets: { where: { ...site, status: 'COMPLETED' }, orderBy: { performedAt: 'desc' }, take: 1,
          select: { performedAt: true, performedTotalHours: true } },
      } }), () => tx.maintenancePlan.count({ where }));
    return { ...page, data: data.map(({ source, tickets, ...plan }) => {
      const last = tickets[0];
      const schedule = maintenanceSchedule({ ...plan, now, timeZone, latest: source.maintenanceHours[0] ?? null,
        lastService: last?.performedAt ? { performedAt: last.performedAt, totalHours: last.performedTotalHours } : null });
      return { ...plan, sourceName: source.name, sourceArchived: source.archivedAt !== null, schedule };
    }) };
  });
}

export function openTicket(actor: Actor, { buildingId, ...input }: z.infer<typeof ticketInput>) {
  return onSite(actor, buildingId, 'write', async (tx, site) => {
    const plan = await tx.maintenancePlan.findFirst({ where: { ...site, id: input.planId, source: { archivedAt: null, type: 'GENERATOR' } },
      select: { id: true, startsAt: true } });
    if (!plan) throw new NotFoundError('Plan de maintenance actif introuvable.');
    if (plan.startsAt > new Date()) throw conflict('Le plan de maintenance n’a pas encore commencé.');
    await requireResponsible(tx, site, input.responsibleUserId);
    const ticket = await tx.maintenanceTicket.create({ data: { ...site, ...input } });
    await audit(tx, site, ticket.id, actor, 'OPENED', { responsibleUserId: input.responsibleUserId, description: input.description });
    return ticket;
  });
}

async function requireTicket(tx: Tx, site: Site, id: string) {
  const ticket = await tx.maintenanceTicket.findFirst({ where: { ...site, id }, include: { plan: true } });
  if (!ticket) throw new NotFoundError('Ticket de maintenance introuvable.');
  return ticket;
}

export function updateTicket(actor: Actor, input: z.infer<typeof ticketUpdate>) {
  return onSite(actor, input.buildingId, 'write', async (tx, site) => {
    const ticket = await requireTicket(tx, site, input.ticketId);
    if (ticket.status === 'COMPLETED' || ticket.status === 'CANCELLED') throw conflict('Le ticket est clôturé.');
    const where = { ...site, id: ticket.id };
    if (input.action === 'ASSIGN') {
      await requireResponsible(tx, site, input.responsibleUserId);
      if (ticket.responsibleUserId === input.responsibleUserId) return ticket;
      const updated = await tx.maintenanceTicket.update({ where, data: { responsibleUserId: input.responsibleUserId } });
      await audit(tx, site, ticket.id, actor, 'ASSIGNED', { previousUserId: ticket.responsibleUserId, responsibleUserId: input.responsibleUserId });
      return updated;
    }
    if (input.action === 'START' && ticket.status !== 'OPEN') throw conflict('Le ticket est déjà en cours.');
    if (input.action === 'START') await requireResponsible(tx, site, ticket.responsibleUserId);
    const updated = await tx.maintenanceTicket.update({ where, data: { status: input.action === 'START' ? 'IN_PROGRESS' : 'CANCELLED' } });
    if (input.action === 'START') await audit(tx, site, ticket.id, actor, 'STARTED', {});
    else await audit(tx, site, ticket.id, actor, 'CANCELLED', { reason: input.reason });
    return updated;
  });
}

export function completeTicket(actor: Actor, input: z.infer<typeof interventionInput>) {
  return onSite(actor, input.buildingId, 'write', async (tx, site) => {
    const ticket = await requireTicket(tx, site, input.ticketId);
    if (ticket.status !== 'IN_PROGRESS' || input.performedAt < ticket.createdAt) {
      throw conflict('Une intervention requiert un ticket en cours et une date au plus tôt à son ouverture.');
    }
    await requireResponsible(tx, site, ticket.responsibleUserId);
    if (ticket.plan.intervalHours !== null && !input.readingId) {
      throw new AppError('Ce plan exige le relevé d’heures moteur à la date de l’intervention.', 400, 'MAINTENANCE_READING_REQUIRED');
    }
    const reading = input.readingId ? await tx.maintenanceHourReading.findFirst({
      where: { ...site, id: input.readingId, sourceId: ticket.plan.sourceId, capturedAt: input.performedAt },
    }) : null;
    if (input.readingId && !reading) throw new NotFoundError('Relevé d’intervention introuvable pour ce groupe et cette date.');
    const performedTotalHours = reading?.totalHours ?? null;
    const updated = await tx.maintenanceTicket.update({ where: { ...site, id: ticket.id },
      data: { status: 'COMPLETED', performedAt: input.performedAt, performedTotalHours } });
    await audit(tx, site, ticket.id, actor, 'INTERVENTION', { work: input.work, responsibleUserId: ticket.responsibleUserId,
      performedAt: input.performedAt.toISOString(), readingId: input.readingId ?? null, totalHours: performedTotalHours?.toFixed() ?? null });
    return updated;
  });
}

export function listTickets(actor: Actor, query: ScopeQuery & { planId?: string; status?: MaintenanceTicketStatus }) {
  return onSite(actor, query.buildingId, 'read', (tx, site) => {
    const where = { ...site, planId: query.planId, status: query.status };
    return paginate(query, paging => tx.maintenanceTicket.findMany({ where, ...paging,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], include: { plan: { select: { title: true } } } }),
      () => tx.maintenanceTicket.count({ where }));
  });
}

export function listEvents(actor: Actor, query: ScopeQuery & { ticketId: string }) {
  return onSite(actor, query.buildingId, 'read', async (tx, site) => {
    await requireTicket(tx, site, query.ticketId);
    const where = { ...site, ticketId: query.ticketId };
    return paginate(query, paging => tx.maintenanceEvent.findMany({ where, ...paging, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
      () => tx.maintenanceEvent.count({ where }));
  });
}
