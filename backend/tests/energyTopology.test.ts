import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { deleteTenantPermanently } from '../src/services/tenantService';
import { createEnergyTopologyFixture } from './fixtures/energyTopology';

vi.mock('../src/utils/redis', () => ({ default: {} }));

const prisma = new PrismaClient();
const tenantA = randomUUID();
const tenantB = randomUUID();
const sites = {
  principal: { tenantId: tenantA, buildingId: randomUUID() },
  secondBatiment: { tenantId: tenantA, buildingId: randomUUID() },
  autreTenant: { tenantId: tenantB, buildingId: randomUUID() },
};

async function createSite(scope: (typeof sites)['principal']) {
  return prisma.$transaction(async (db) => {
    await db.building.create({ data: {
      id: scope.buildingId, tenantId: scope.tenantId, name: 'Bâtiment fictif', address: 'Adresse fictive',
    } });
    const topology = await createEnergyTopologyFixture(db, scope);
    const zone = await db.zone.create({ data: { ...scope, name: 'Zone fictive' } });
    const meter = await db.device.create({ data: { ...scope, name: 'Compteur fictif', type: 'ENERGY_METER' } });
    const controller = await db.device.create({ data: { ...scope, name: 'Contrôleur fictif', type: 'PLUG' } });
    return { ...topology, zone, meter, controller };
  });
}

type SiteFixture = Awaited<ReturnType<typeof createSite>>;
let fixtures: Record<keyof typeof sites, SiteFixture>;
let tenantsCreated = false;

beforeAll(async () => {
  await prisma.tenant.createMany({ data: [tenantA, tenantB].map(id => ({ id, name: 'Client fictif', slug: `topologie-${id}` })) });
  tenantsCreated = true;
  fixtures = {
    principal: await createSite(sites.principal),
    secondBatiment: await createSite(sites.secondBatiment),
    autreTenant: await createSite(sites.autreTenant),
  };
});

afterAll(async () => {
  try {
    if (tenantsCreated) {
      for (const id of [tenantA, tenantB]) await deleteTenantPermanently(id);
    }
  } finally {
    await prisma.$disconnect();
  }
});

const pointData = { name: 'Point fictif', unit: 'kWh', measurementMode: 'CUMULATIVE' } as const;

describe('Intégrité de la topologie électrique', () => {
  it('décrit une charge sans appareil et rattache ensuite un compteur existant', async () => {
    const { load, meter, source, feed, bus, board, circuit } = fixtures.principal;
    const physicalLoad = await prisma.electricalLoad.findUniqueOrThrow({
      where: { id: load.id },
      include: { meteringPoints: true, controlEndpoints: true, circuit: { include: { board: { include: { bus: true } } } } },
    });
    expect(physicalLoad).toMatchObject({
      zoneId: null, isControllable: false, canBeAutomated: false, meteringPoints: [], controlEndpoints: [],
      circuit: { id: circuit.id, isControllable: false, autoSheddingAllowed: false, board: { id: board.id, bus: { id: bus.id } } },
    });
    expect(feed).toMatchObject({ sourceId: source.id, busId: bus.id, isAllowed: false, observedState: 'UNKNOWN' });

    const targets = [
      { scope: 'SOURCE', sourceId: source.id },
      { scope: 'FEED', feedId: feed.id },
      { scope: 'BOARD', boardId: board.id },
      { scope: 'CIRCUIT', circuitId: circuit.id },
      { scope: 'LOAD', loadId: load.id },
    ] as const;
    await prisma.meteringPoint.createMany({ data: targets.map(target => ({
      ...sites.principal, ...pointData, ...target, deviceId: meter.id,
    })) });

    const measured = await prisma.electricalLoad.findUniqueOrThrow({
      where: { id: load.id }, include: { meteringPoints: true },
    });
    expect(measured.meteringPoints).toMatchObject([{ deviceId: meter.id, scope: 'LOAD', quality: 'UNKNOWN' }]);
    expect(await prisma.meteringPoint.count({ where: { ...sites.principal, deviceId: meter.id } })).toBe(5);
  });

  it.each(['secondBatiment', 'autreTenant'] as const)('rejette les liens vers %s', async (site) => {
    const scope = sites.principal;
    const local = fixtures.principal;
    const foreign = fixtures[site];
    const fkViolation = { code: 'P2003' };

    await expect(prisma.sourceFeed.create({ data: {
      ...scope, sourceId: foreign.source.id, busId: local.bus.id, name: 'Arrivée invalide',
    } })).rejects.toMatchObject(fkViolation);
    await expect(prisma.sourceFeed.create({ data: {
      ...scope, sourceId: local.source.id, busId: foreign.bus.id, name: 'Arrivée invalide',
    } })).rejects.toMatchObject(fkViolation);
    await expect(prisma.distributionBoard.create({ data: {
      ...scope, busId: foreign.bus.id, name: 'Tableau invalide',
    } })).rejects.toMatchObject(fkViolation);
    await expect(prisma.circuit.create({ data: {
      ...scope, boardId: foreign.board.id, code: 'INV-01', name: 'Départ invalide', priority: 'IMPORTANT',
    } })).rejects.toMatchObject(fkViolation);
    await expect(prisma.electricalLoad.update({ where: { id: local.load.id }, data: { circuitId: foreign.circuit.id } }))
      .rejects.toMatchObject(fkViolation);
    await expect(prisma.electricalLoad.update({ where: { id: local.load.id }, data: { zoneId: foreign.zone.id } }))
      .rejects.toMatchObject(fkViolation);
    await expect(prisma.meteringPoint.create({ data: {
      ...scope, ...pointData, deviceId: local.meter.id, scope: 'LOAD', loadId: foreign.load.id,
    } })).rejects.toMatchObject(fkViolation);
    await expect(prisma.meteringPoint.create({ data: {
      ...scope, ...pointData, deviceId: foreign.meter.id, scope: 'LOAD', loadId: local.load.id,
    } })).rejects.toMatchObject(fkViolation);
    await expect(prisma.controlEndpoint.create({ data: {
      ...scope, deviceId: local.controller.id, name: 'Canal invalide', targetCircuitId: foreign.circuit.id,
    } })).rejects.toMatchObject(fkViolation);
    await expect(prisma.controlEndpoint.create({ data: {
      ...scope, deviceId: foreign.controller.id, name: 'Canal invalide', targetLoadId: local.load.id,
    } })).rejects.toMatchObject(fkViolation);
  });

  it('refuse le tenant d’un autre bâtiment sur une source racine', async () => {
    await expect(prisma.energySource.create({ data: {
      ...sites.principal, tenantId: tenantB, name: 'Source invalide', type: 'BATTERY_INVERTER',
    } })).rejects.toMatchObject({ code: 'P2003' });
  });

  it('rejette les cibles de mesure absentes, multiples ou incompatibles avec la portée', async () => {
    const { load, source, meter } = fixtures.principal;
    const data = { ...sites.principal, ...pointData, deviceId: meter.id, scope: 'LOAD' as const };
    const violation = /MeteringPoint_scope_target_check/;
    await expect(prisma.meteringPoint.create({ data })).rejects.toThrow(violation);
    await expect(prisma.meteringPoint.create({ data: { ...data, sourceId: source.id, loadId: load.id } }))
      .rejects.toThrow(violation);
    await expect(prisma.meteringPoint.create({ data: { ...data, sourceId: source.id } })).rejects.toThrow(violation);
  });

  it('réserve un point de mesure aux appareils de type compteur', async () => {
    const { load, controller } = fixtures.principal;
    const data = { ...sites.principal, ...pointData, deviceId: controller.id, scope: 'LOAD' as const, loadId: load.id };
    await expect(prisma.meteringPoint.create({ data })).rejects.toMatchObject({ code: 'P2003' });
    await expect(prisma.meteringPoint.create({ data: { ...data, deviceType: 'PLUG' } }))
      .rejects.toThrow(/MeteringPoint_device_type_check/);
  });

  it('sépare la cible, la capacité, l’autorisation et la preuve physique du canal', async () => {
    const { circuit, load, controller } = fixtures.principal;
    const data = { ...sites.principal, deviceId: controller.id, name: 'Canal fictif' };
    await expect(prisma.controlEndpoint.create({ data })).rejects.toThrow(/ControlEndpoint_target_check/);
    await expect(prisma.controlEndpoint.create({ data: { ...data, targetCircuitId: circuit.id, targetLoadId: load.id } }))
      .rejects.toThrow(/ControlEndpoint_target_check/);

    const endpoint = await prisma.controlEndpoint.create({ data: {
      ...data, targetCircuitId: circuit.id, declaredActions: ['TURN_OFF'],
    } });
    expect(endpoint).toMatchObject({ isEnabled: false, approvalStatus: 'PENDING', allowedActions: [], verifiedState: 'UNKNOWN' });
    const where = { id: endpoint.id };
    await expect(prisma.controlEndpoint.update({ where, data: { allowedActions: ['TURN_ON'] } }))
      .rejects.toThrow(/ControlEndpoint_action_subset_check/);
    await expect(prisma.controlEndpoint.update({ where, data: { isEnabled: true } }))
      .rejects.toThrow(/ControlEndpoint_enablement_check/);
    await expect(prisma.controlEndpoint.update({ where, data: { verifiedState: 'OFF' } }))
      .rejects.toThrow(/ControlEndpoint_verified_state_check/);
    expect(await prisma.controlEndpoint.create({ data: { ...data, targetLoadId: load.id } }))
      .toMatchObject({ targetLoadId: load.id, targetCircuitId: null, isEnabled: false });
  });

  it.each(['circuit', 'charge'] as const)('réserve les canaux activés à une cible pilotable (%s)', async (type) => {
    const { circuit, load, controller } = fixtures.principal;
    const target = type === 'circuit' ? { targetCircuitId: circuit.id } : { targetLoadId: load.id };
    const endpoint = await prisma.controlEndpoint.create({ data: {
      ...sites.principal, ...target, deviceId: controller.id, name: 'Canal à approuver',
      declaredActions: ['TURN_OFF'], allowedActions: ['TURN_OFF'], approvalStatus: 'APPROVED',
      verificationMethod: 'AUXILIARY_CONTACT',
    } });
    const where = { id: endpoint.id };
    const setControllable = (isControllable: boolean) => type === 'circuit'
      ? prisma.circuit.update({ where: { id: circuit.id }, data: { isControllable } })
      : prisma.electricalLoad.update({ where: { id: load.id }, data: { isControllable } });
    const setEnabled = (isEnabled: boolean) => prisma.controlEndpoint.update({ where, data: { isEnabled } });

    await expect(setEnabled(true)).rejects.toMatchObject({ code: 'P2003' });
    await setControllable(true);
    await expect(setEnabled(true)).resolves.toMatchObject({ isEnabled: true });
    await expect(setControllable(false)).rejects.toMatchObject({ code: 'P2003' });
    await setEnabled(false);
    await setControllable(false);
  });

  it('protège les références et les codes des départs électriques', async () => {
    const { board, circuit } = fixtures.principal;
    const data = { ...sites.principal, boardId: board.id, name: 'Départ fictif', priority: 'CRITICAL' } as const;
    await expect(prisma.circuit.create({ data: { ...data, code: circuit.code } })).rejects.toMatchObject({ code: 'P2002' });
    await expect(prisma.circuit.create({ data: { ...data, code: 'ecl-02' } })).rejects.toThrow(/Circuit_code_check/);
    await expect(prisma.circuit.create({ data: {
      ...data, code: 'ECL-02', isControllable: true, autoSheddingAllowed: true,
    } })).rejects.toThrow(/Circuit_auto_shedding_check/);
    await expect(prisma.distributionBoard.delete({ where: { id: board.id } })).rejects.toMatchObject({ code: 'P2003' });
  });
});
