import type { SimulatedLoad, SimulationPolicy, SimulationRequest } from '../utils/automationSimulationSchemas';

export type PowerSample = {
  value: number;
  unit: string | null;
  capturedAt: string;
  quality: string | null;
  feedId: string | null;
};

export type SimulationLoad = {
  loadId: string;
  circuitId: string;
  priority: 'CRITICAL' | 'IMPORTANT' | 'FLEXIBLE';
  circuitPriority: 'CRITICAL' | 'IMPORTANT' | 'FLEXIBLE';
  isAllowed: boolean;
  maintenanceExcluded: boolean;
  ratedPowerW: number | null;
  minOnSeconds: number;
  minOffSeconds: number;
  maxInterruptionsPerHour: number | null;
  sample: PowerSample | null;
};

export type SimulatedAction = { type: 'SHED' | 'RESTORE'; loadId: string; powerW: number };
type RecentAction = { action: string | null; targetLoadId: string | null; evaluatedAt: string };

export type SimulationInput = {
  ruleEnabled: boolean;
  feedAllowed: boolean;
  topologyAvailable: boolean;
  policy: SimulationPolicy;
  request: SimulationRequest;
  demand: PowerSample | null;
  candidates: SimulationLoad[];
  loads: SimulatedLoad[];
  recentActions: RecentAction[];
};

function power(sample: PowerSample | null, input: SimulationInput): { watts: number } | { reason: string } {
  if (!sample) return { reason: 'MISSING_MEASUREMENT' } as const;
  const watts = sample.unit === 'kW' ? sample.value * 1_000 : sample.value;
  if (sample.quality !== 'MEASURED' || !Number.isFinite(watts) || watts < 0 || watts > Number.MAX_SAFE_INTEGER ||
      (sample.unit !== 'W' && sample.unit !== 'kW')) return { reason: 'INVALID_MEASUREMENT' } as const;
  const age = Date.parse(input.request.evaluatedAt) - Date.parse(sample.capturedAt);
  if (!Number.isFinite(age) || age < 0 || age > input.policy.maxReadingAgeSeconds * 1_000) return { reason: 'STALE_MEASUREMENT' } as const;
  if (sample.feedId !== input.policy.feedId) return { reason: 'UNKNOWN_SOURCE' } as const;
  return { watts };
}

function blockedByPriority(input: SimulationInput): string | null {
  const { request } = input;
  if (!input.ruleEnabled) return 'RULE_DISABLED';
  if (request.protection !== 'CLEAR') return 'PROTECTION_NOT_CLEAR';
  if (request.maintenance !== 'CLEAR') return 'MAINTENANCE_NOT_CLEAR';
  if (request.site !== 'ALLOWED') return 'SITE_PERMISSION_NOT_CLEAR';
  if (request.manual !== 'CLEAR') return 'MANUAL_PRIORITY';
  if (!input.topologyAvailable) return 'TOPOLOGY_UNAVAILABLE';
  if (!input.feedAllowed) return 'FEED_NOT_ALLOWED';
  return null;
}

function classifiedExclusion(candidate: SimulationLoad, load: SimulatedLoad): string | null {
  if (candidate.priority === 'CRITICAL' || candidate.circuitPriority === 'CRITICAL') return 'CRITICAL_SCOPE';
  if (candidate.priority !== 'FLEXIBLE') return 'LOAD_NOT_FLEXIBLE';
  if (candidate.maintenanceExcluded) return 'LOAD_MAINTENANCE_EXCLUDED';
  if (!candidate.isAllowed) return 'LOAD_NOT_ALLOWED';
  if (load.state === 'UNKNOWN' || !load.changedAt) return 'UNKNOWN_LOAD_STATE';
  return null;
}

export function simulateEnergy(input: SimulationInput) {
  const { policy, request, loads } = input;
  const exclusions: { loadId: string; reason: string }[] = [];
  let measuredDemandW: number | null = null;
  let beforeW: number | null = null;

  function result(reason: string, action: SimulatedAction | null = null) {
    const afterW = beforeW === null || !action ? beforeW :
      beforeW + (action.type === 'SHED' ? -action.powerW : action.powerW);
    return {
      mode: 'DRY_RUN' as const, decision: action?.type ?? 'NO_ACTION', reason, action, measuredDemandW,
      projectedDemandBeforeW: beforeW, projectedDemandAfterW: afterW,
      availablePowerW: policy.availablePowerW, restoreThresholdW: policy.availablePowerW - policy.hysteresisW,
      exclusions,
      loads: loads.map(load => load.loadId === action?.loadId
        ? { loadId: load.loadId, state: action.type === 'SHED' ? 'OFF' as const : 'ON' as const,
          changedAt: request.evaluatedAt, shedW: action.type === 'SHED' ? action.powerW : null }
        : load),
    };
  }

  const priorityBlock = blockedByPriority(input);
  if (priorityBlock) return result(priorityBlock);
  const demand = power(input.demand, input);
  if ('reason' in demand) return result(demand.reason);
  measuredDemandW = demand.watts;
  beforeW = measuredDemandW;
  const previousCuts = new Map<string, number>();
  const states = new Map(loads.map(load => [load.loadId, load]));
  const candidates = new Map(input.candidates.map(candidate => [candidate.loadId, candidate]));

  // La demande observée représente le site avant les coupures du scénario.
  for (const load of loads) {
    if (load.state !== 'OFF' || load.shedW === null) continue;
    const candidate = candidates.get(load.loadId);
    if (!candidate || classifiedExclusion(candidate, load)) return result('SIMULATED_BASELINE_UNCERTAIN');
    const sample = power(candidate.sample, input);
    if ('reason' in sample) return result('SIMULATED_BASELINE_UNCERTAIN');
    beforeW -= sample.watts;
    previousCuts.set(load.loadId, sample.watts);
  }
  if (beforeW < 0) {
    beforeW = null;
    return result('INCONSISTENT_POWER_TOTAL');
  }

  const now = Date.parse(request.evaluatedAt);
  const lastAction = input.recentActions[0];
  const overload = beforeW > policy.availablePowerW;
  if (!overload && previousCuts.size === 0) return result('DEMAND_WITHIN_LIMIT');
  if (input.recentActions.length >= policy.maxActionsPerHour) return result('HOURLY_ACTION_LIMIT');
  if (lastAction && now - Date.parse(lastAction.evaluatedAt) < policy.cooldownSeconds * 1_000) {
    return result('ACTION_COOLDOWN');
  }

  for (const candidate of input.candidates) {
    const load = states.get(candidate.loadId);
    if (!load) continue;
    const block = classifiedExclusion(candidate, load);
    if (block) {
      exclusions.push({ loadId: load.loadId, reason: block });
      continue;
    }
    const elapsed = now - Date.parse(load.changedAt!);
    if (overload && load.state === 'ON') {
      const interruptions = input.recentActions.filter(action =>
        action.action === 'SHED' && action.targetLoadId === load.loadId).length;
      const sample = power(candidate.sample, input);
      const reason = elapsed < Math.max(policy.minOnSeconds, candidate.minOnSeconds) * 1_000 ? 'MIN_ON_TIME' :
        candidate.maxInterruptionsPerHour !== null && interruptions >= candidate.maxInterruptionsPerHour ? 'LOAD_HOURLY_LIMIT' :
        'reason' in sample ? sample.reason : sample.watts === 0 || sample.watts > beforeW ? 'NO_RELIABLE_REDUCTION' : null;
      if (reason) exclusions.push({ loadId: load.loadId, reason });
      else if ('watts' in sample) {
        return result('DEMAND_EXCEEDS_LIMIT', { type: 'SHED', loadId: load.loadId, powerW: sample.watts });
      }
    } else if (!overload && load.state === 'OFF' && load.shedW !== null) {
      const restoredW = Math.max(previousCuts.get(load.loadId) ?? 0, load.shedW, candidate.ratedPowerW ?? 0);
      if (elapsed < Math.max(policy.minOffSeconds, candidate.minOffSeconds) * 1_000) {
        exclusions.push({ loadId: load.loadId, reason: 'MIN_OFF_TIME' });
      } else if (beforeW + restoredW > policy.availablePowerW - policy.hysteresisW) {
        exclusions.push({ loadId: load.loadId, reason: 'RESTORE_HYSTERESIS' });
      } else {
        return result('DEMAND_RECOVERED_WITH_MARGIN', { type: 'RESTORE', loadId: load.loadId, powerW: restoredW });
      }
    }
  }

  return result(overload ? 'NO_ELIGIBLE_LOAD' : 'RESTORE_BLOCKED');
}
