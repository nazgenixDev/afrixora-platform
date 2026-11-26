import { Prisma } from '@prisma/client';
import { prisma } from '../utils/database';
import { AppError, ForbiddenError, NotFoundError } from '../utils/errors';
import type { Resource } from '../utils/energyTopologySchemas';

const models = { sources: 'energySource', buses: 'energyBus', feeds: 'sourceFeed', boards: 'distributionBoard',
  circuits: 'circuit', loads: 'electricalLoad', 'metering-points': 'meteringPoint', 'control-endpoints': 'controlEndpoint' } as const;
type Parent = Resource | 'device' | 'zone';
const parents: Record<Resource, Record<string, Parent>> = {
  sources: {}, buses: {}, feeds: { sourceId: 'sources', busId: 'buses' }, boards: { busId: 'buses' },
  circuits: { boardId: 'boards' }, loads: { circuitId: 'circuits', zoneId: 'zone' },
  'metering-points': { deviceId: 'device', sourceId: 'sources', feedId: 'feeds', boardId: 'boards', circuitId: 'circuits', loadId: 'loads' },
  'control-endpoints': { deviceId: 'device', targetCircuitId: 'circuits', targetLoadId: 'loads' },
};
type Data = Record<string, unknown>;
type Row = Data & { id: string; archivedAt: Date | null };
type Args = Record<string, unknown>;
interface Delegate {
  findFirst(args: Args): Promise<Row | null>;
  findMany(args: Args): Promise<Row[]>;
  count(args: Args): Promise<number>;
  create(args: Args): Promise<Row>;
  update(args: Args): Promise<Row>;
}
type Tx = Prisma.TransactionClient;
function table(tx: Tx, resource: Resource): Delegate {
  // Les huit modèles partagent ce contrat. Les champs spécifiques sont validés par leur schéma Zod.
  return tx[models[resource]] as unknown as Delegate;
}
type Actor = { role: string; tenantId: string; userId: string };
type Site = { tenantId: string; buildingId: string };
const conflict = (message: string) => new AppError(message, 409, 'TOPOLOGY_CONFLICT');
const invalid = (message: string) => new AppError(message, 400, 'INVALID_TOPOLOGY');

export async function onSite<T>(actor: Actor, buildingId: string, access: 'read' | 'write' | 'grant',
  work: (tx: Tx, site: Site) => Promise<T>) {
  try {
    return await prisma.$transaction(async tx => {
      const site = { tenantId: actor.tenantId, buildingId };
      const building = await tx.building.findFirst({ where: { id: buildingId, tenantId: actor.tenantId, isActive: true,
        tenant: { isActive: true } }, select: { id: true } });
      if (!building) throw new NotFoundError('Bâtiment introuvable');
      if (!['SUPER_ADMIN', 'TENANT_ADMIN'].includes(actor.role)) {
        if (access === 'grant' || (access === 'write' && actor.role !== 'BUILDING_ADMIN')) throw new ForbiddenError();
        const grant = await tx.buildingAccess.findUnique({ where: { tenantId_buildingId_userId: { ...site, userId: actor.userId } } });
        if (!grant) throw new ForbiddenError();
      }
      return work(tx, site);
    }, { isolationLevel: 'Serializable' });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2034' || error.code === 'P2003') throw conflict('Une référence a changé ou reste utilisée.');
      if (error.code === 'P2004') throw invalid('Les contraintes électriques sont incompatibles.');
    }
    throw error;
  }
}

async function row(tx: Tx, resource: Resource, site: Site, id: string) {
  const result = await table(tx, resource).findFirst({ where: { ...site, id } });
  if (!result) throw new NotFoundError();
  return result;
}

async function checkRelations(tx: Tx, site: Site, resource: Resource, data: Data) {
  for (const [field, parent] of Object.entries(parents[resource])) {
    const id = data[field];
    if (typeof id !== 'string') continue;
    const where = { ...site, id };
    let exists;
    if (parent === 'device') {
      exists = await tx.device.findFirst({ where, select: { type: true } });
      if (exists && resource === 'metering-points' && exists.type !== 'ENERGY_METER') throw invalid('Un compteur est requis.');
    } else if (parent === 'zone') {
      exists = await tx.zone.findFirst({ where, select: { id: true } });
    } else {
      exists = await table(tx, parent).findFirst({ where: { ...where, archivedAt: null }, select: { id: true } });
    }
    if (!exists) throw new NotFoundError('Référence active introuvable dans ce bâtiment.');
  }
  if (resource === 'metering-points') {
    const targets = ['sourceId', 'feedId', 'boardId', 'circuitId', 'loadId'].filter(key => data[key]);
    if (targets.length !== 1 || targets[0] !== String(data.scope).toLowerCase() + 'Id') throw invalid('Portée et cible de mesure incompatibles.');
  }
  if (resource === 'control-endpoints' && Boolean(data.targetCircuitId) === Boolean(data.targetLoadId)) throw invalid('Une cible de commande est requise.');
  if ((data.autoSheddingAllowed || data.canBeAutomated) && (!data.isControllable || data.priority === 'CRITICAL')) throw invalid('Automatisation incompatible avec la cible.');
}

export const energyTopology = {
  list(actor: Actor, building: string, resource: Resource, query: { page: number; limit: number; archived: boolean; search?: string }) {
    return onSite(actor, building, 'read', async (tx, site) => {
      const { page, limit, archived, search } = query;
      const where = { ...site, archivedAt: archived ? { not: null } : null, name: { contains: search, mode: 'insensitive' } };
      const repository = table(tx, resource);
      const total = await repository.count({ where });
      const data = await repository.findMany({ where, orderBy: { id: 'asc' }, skip: (page - 1) * limit, take: limit });
      return { data, total, page, totalPages: Math.ceil(total / limit) };
    });
  },
  get(actor: Actor, building: string, resource: Resource, id: string) {
    return onSite(actor, building, 'read', (tx, site) => row(tx, resource, site, id));
  },
  save(actor: Actor, building: string, resource: Resource, data: Data, id?: string) {
    return onSite(actor, building, 'write', async (tx, site) => {
      const current = id ? await row(tx, resource, site, id) : undefined;
      if (current?.archivedAt || current?.isEnabled) throw conflict('Cette ressource est archivée ou son canal est actif.');
      await checkRelations(tx, site, resource, { ...current, ...data });
      return id ? table(tx, resource).update({ where: { id, ...site }, data }) :
        table(tx, resource).create({ data: { ...site, ...data } });
    });
  },
  archive(actor: Actor, building: string, resource: Resource, id: string) {
    return onSite(actor, building, 'write', async (tx, site) => {
      const current = await row(tx, resource, site, id);
      if (current.archivedAt) return;
      if (current.isEnabled) throw conflict('Le canal est actif.');
      for (const child of Object.keys(parents) as Resource[]) {
        for (const [field, parent] of Object.entries(parents[child])) {
          if (parent === resource && await table(tx, child).count({ where: { ...site, archivedAt: null, [field]: id } })) {
            throw conflict('Une ressource active utilise encore cet objet.');
          }
        }
      }
      await table(tx, resource).update({ where: { ...site, id }, data: { archivedAt: new Date() } });
    });
  },
  grant(actor: Actor, building: string, userId: string, enabled: boolean) {
    return onSite(actor, building, 'grant', async (tx, site) => {
      if (!await tx.user.findFirst({ where: { id: userId, tenantId: site.tenantId }, select: { id: true } })) throw new NotFoundError();
      const data = { ...site, userId };
      if (enabled) await tx.buildingAccess.upsert({ where: { tenantId_buildingId_userId: data }, create: data, update: {} });
      else await tx.buildingAccess.deleteMany({ where: data });
    });
  },
};
