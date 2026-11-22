import type { Prisma } from '@prisma/client';

type BuildingScope = { tenantId: string; buildingId: string };

export async function createEnergyTopologyFixture(db: Prisma.TransactionClient, scope: BuildingScope) {
  const source = await db.energySource.create({ data: {
    ...scope, name: 'Réseau fictif', type: 'GRID', ratedPowerW: '12000', metadata: { usage: 'test' },
  } });
  const bus = await db.energyBus.create({ data: { ...scope, name: 'Bus principal fictif' } });
  const feed = await db.sourceFeed.create({ data: {
    ...scope, sourceId: source.id, busId: bus.id, name: 'Arrivée réseau fictive',
    switchingMode: 'AUTOMATIC_TRANSFER', switchingReference: 'Inverseur fictif',
  } });
  const board = await db.distributionBoard.create({ data: {
    ...scope, busId: bus.id, name: 'Tableau fictif', nominalVoltageV: '230', phaseConfiguration: 'SINGLE_PHASE',
  } });
  const circuit = await db.circuit.create({ data: {
    ...scope, boardId: board.id, name: 'Départ éclairage fictif', code: 'ECL-01', priority: 'FLEXIBLE',
    protection: { designation: 'Protection fictive' },
  } });
  const load = await db.electricalLoad.create({ data: {
    ...scope, circuitId: circuit.id, name: 'Éclairage fictif', category: 'LIGHTING', priority: 'FLEXIBLE',
    ratedPowerW: '90',
  } });
  return { source, bus, feed, board, circuit, load };
}
