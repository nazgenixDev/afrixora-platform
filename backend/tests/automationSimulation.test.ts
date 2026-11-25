import { describe, expect, it } from 'vitest';
import { simulateEnergy, type SimulationInput, type SimulationLoad } from '../src/services/automationSimulationEngine';
import type { SimulatedLoad } from '../src/utils/automationSimulationSchemas';

const at = '2026-11-26T12:00:00.000Z';
const previous = '2026-11-26T11:50:00.000Z';
const buildingId = '00000000-0000-4000-8000-000000000001';
const feedId = '00000000-0000-4000-8000-000000000002';
const loadId = '00000000-0000-4000-8000-000000000003';
const otherLoad = '00000000-0000-4000-8000-000000000004';
const sample = { value: 250, unit: 'W', capturedAt: at, quality: 'MEASURED', feedId };

function candidate(id: string, options: Partial<SimulationLoad> = {}): SimulationLoad {
  return { loadId: id, circuitId: buildingId, circuitPriority: 'FLEXIBLE', priority: 'FLEXIBLE',
    isAllowed: true, maintenanceExcluded: false, ratedPowerW: 250, minOnSeconds: 60,
    minOffSeconds: 120, maxInterruptionsPerHour: 2, sample, ...options };
}

function state(id: string, options: Partial<SimulatedLoad> = {}): SimulatedLoad {
  return { loadId: id, state: 'ON', changedAt: previous, shedW: null, ...options };
}

function input(options: Partial<SimulationInput> = {}): SimulationInput {
  return {
    ruleEnabled: true, topologyAvailable: true, feedAllowed: true,
    policy: { version: 1, feedId, demandPointId: buildingId, availablePowerW: 1000, hysteresisW: 100,
      cooldownSeconds: 30, maxReadingAgeSeconds: 60, minOnSeconds: 10, minOffSeconds: 10, maxActionsPerHour: 4, loads: [] },
    request: { buildingId, scenarioId: buildingId, requestId: buildingId, evaluatedAt: at, initialLoads: [],
      protection: 'CLEAR', maintenance: 'CLEAR', site: 'ALLOWED', manual: 'CLEAR' },
    demand: { ...sample, value: 1300 },
    candidates: [candidate(loadId), candidate(otherLoad)],
    loads: [state(loadId), state(otherLoad)],
    recentActions: [],
    ...options,
  };
}

describe('Décisions de simulation énergétique', () => {
  it('déleste progressivement une charge par simulation et reprend depuis l’état simulé précédent', () => {
    const first = simulateEnergy(input());
    expect(first).toMatchObject({ decision: 'SHED', action: { loadId, powerW: 250 }, projectedDemandAfterW: 1050 });
    const next = simulateEnergy(input({ loads: [state(loadId, { state: 'OFF', shedW: 250 }), state(otherLoad)] }));
    expect(next).toMatchObject({ decision: 'SHED', action: { loadId: otherLoad }, projectedDemandBeforeW: 1050, projectedDemandAfterW: 800 });
  });

  it('rétablit une seule charge précédemment délestée après le retour de la marge', () => {
    const outcome = simulateEnergy(input({ demand: { ...sample, value: 800 }, loads: [
      state(loadId, { state: 'OFF', shedW: 250 }), state(otherLoad, { state: 'OFF' }),
    ] }));
    expect(outcome).toMatchObject({ decision: 'RESTORE', projectedDemandAfterW: 800, action: { loadId } });
    expect(outcome.loads[1]).toMatchObject({ state: 'OFF', shedW: null });
  });

  it('évite les oscillations autour du seuil, même après la fin de la temporisation', () => {
    for (const measured of [990, 1010, 995]) {
      const outcome = simulateEnergy(input({ demand: { ...sample, value: measured },
        loads: [state(loadId, { state: 'OFF', shedW: 250 }), state(otherLoad)] }));
      expect(outcome).toMatchObject({ decision: 'NO_ACTION', reason: 'RESTORE_BLOCKED',
        exclusions: [{ loadId, reason: 'RESTORE_HYSTERESIS' }] });
    }
  });

  it.each([
    [null, 'MISSING_MEASUREMENT'],
    [{ ...sample, capturedAt: previous }, 'STALE_MEASUREMENT'],
    [{ ...sample, quality: 'INVALID' }, 'INVALID_MEASUREMENT'],
    [{ ...sample, quality: 'ESTIMATED' }, 'INVALID_MEASUREMENT'],
    [{ ...sample, feedId: null }, 'UNKNOWN_SOURCE'],
  ] as const)('s’abstient sur une mesure douteuse (%s)', (demand, reason) => {
    expect(simulateEnergy(input({ demand }))).toMatchObject({ decision: 'NO_ACTION', reason });
  });

  it('traite une mesure de zéro comme valide et normalise les kilowatts', () => {
    expect(simulateEnergy(input({ demand: { ...sample, value: 0 } })))
      .toMatchObject({ reason: 'DEMAND_WITHIN_LIMIT', measuredDemandW: 0 });
    expect(simulateEnergy(input({ demand: { ...sample, value: 1.3, unit: 'kW' } })))
      .toMatchObject({ measuredDemandW: 1300, decision: 'SHED' });
  });

  it('exclut les circuits critiques, les charges importantes et la maintenance', () => {
    const outcome = simulateEnergy(input({ candidates: [
      candidate(loadId, { circuitPriority: 'CRITICAL' }), candidate(otherLoad, { priority: 'IMPORTANT' }),
    ] }));
    expect(outcome).toMatchObject({ reason: 'NO_ELIGIBLE_LOAD', exclusions: [
      { loadId, reason: 'CRITICAL_SCOPE' }, { loadId: otherLoad, reason: 'LOAD_NOT_FLEXIBLE' },
    ] });
    expect(simulateEnergy(input({ candidates: [candidate(loadId, { maintenanceExcluded: true })] })))
      .toMatchObject({ reason: 'NO_ELIGIBLE_LOAD', exclusions: [{ loadId, reason: 'LOAD_MAINTENANCE_EXCLUDED' }] });
  });

  it('applique l’ordre protection, maintenance, site, action manuelle et désactivation', () => {
    const request = { ...input().request, protection: 'BLOCKED', maintenance: 'LOCKED', site: 'BLOCKED', manual: 'HOLD' } as const;
    expect(simulateEnergy(input({ request })).reason).toBe('PROTECTION_NOT_CLEAR');
    expect(simulateEnergy(input({ request: { ...request, protection: 'CLEAR' } })).reason).toBe('MAINTENANCE_NOT_CLEAR');
    expect(simulateEnergy(input({ request: { ...request, protection: 'CLEAR', maintenance: 'CLEAR' } })).reason).toBe('SITE_PERMISSION_NOT_CLEAR');
    expect(simulateEnergy(input({ request: { ...request, protection: 'CLEAR', maintenance: 'CLEAR', site: 'ALLOWED' } })).reason).toBe('MANUAL_PRIORITY');
    expect(simulateEnergy(input({ ruleEnabled: false })).reason).toBe('RULE_DISABLED');
  });

  it('respecte les durées de marche, d’arrêt, le délai anti-oscillation et les plafonds par heure', () => {
    const justNow = '2026-11-26T11:59:45.000Z';
    const recent = { targetLoadId: loadId, action: 'SHED', evaluatedAt: justNow };
    expect(simulateEnergy(input({ recentActions: [recent] })).reason).toBe('ACTION_COOLDOWN');
    expect(simulateEnergy(input({ recentActions: [recent, recent, recent, recent] })).reason).toBe('HOURLY_ACTION_LIMIT');
    expect(simulateEnergy(input({ loads: [state(loadId, { changedAt: justNow })] })))
      .toMatchObject({ exclusions: [{ loadId, reason: 'MIN_ON_TIME' }] });
    expect(simulateEnergy(input({
      demand: { ...sample, value: 700 }, loads: [state(loadId, { state: 'OFF', changedAt: justNow, shedW: 250 })],
    }))).toMatchObject({ exclusions: [{ loadId, reason: 'MIN_OFF_TIME' }] });
    expect(simulateEnergy(input({ candidates: [candidate(loadId)], recentActions: [
      { ...recent, evaluatedAt: previous }, { ...recent, evaluatedAt: previous },
    ] }))).toMatchObject({ exclusions: [{ loadId, reason: 'LOAD_HOURLY_LIMIT' }] });
  });
});
