import { z } from 'zod';
import logger from '../utils/logger';
import { persistTelemetry, telemetrySchema, telemetryWindow, type TelemetryScope } from './energyTelemetry';

const id = z.uuid().transform(value => value.toLowerCase());
const maxItems = 32;
const maxActiveBatches = 4;
const ackLifetimeMs = 10_000;

const batchSchema = z.strictObject({
  type: z.literal('telemetry_batch'), schemaVersion: z.literal(2), batchId: id,
  items: z.array(z.strictObject({ itemId: id, sample: z.unknown() })).max(maxItems),
}).refine(batch => new Set(batch.items.map(item => item.itemId)).size === batch.items.length, { path: ['items'] });

type Result =
  | { itemId: string; status: 'STORED' | 'DUPLICATE' | 'RETRY' }
  | { itemId: string; status: 'REJECTED'; reason: 'INVALID_SAMPLE' | 'CLOCK_AHEAD' | 'REPLAY_EXPIRED' | 'INCOMPATIBLE_POINT' | 'IDENTITY_CONFLICT' };

const activeBatches = new Set<string>();

async function reconcile(scope: TelemetryScope, items: z.infer<typeof batchSchema>['items'], receivedAt: number) {
  const results: Result[] = [];
  let storageFailed = false;
  for (const { itemId, sample } of items) {
    const parsed = telemetrySchema.safeParse(sample);
    if (!parsed.success || parsed.data.deviceId !== scope.deviceId) {
      results.push({ itemId, status: 'REJECTED', reason: 'INVALID_SAMPLE' });
      continue;
    }
    const capturedAt = Date.parse(parsed.data.capturedAt);
    if (!Number.isFinite(capturedAt)) {
      results.push({ itemId, status: 'REJECTED', reason: 'INVALID_SAMPLE' });
      continue;
    }
    if (capturedAt > receivedAt + telemetryWindow.futureMs) {
      results.push({ itemId, status: 'REJECTED', reason: 'CLOCK_AHEAD' });
      continue;
    }
    if (capturedAt < receivedAt - telemetryWindow.pastMs) {
      results.push({ itemId, status: 'REJECTED', reason: 'REPLAY_EXPIRED' });
      continue;
    }
    if (storageFailed) {
      results.push({ itemId, status: 'RETRY' });
      continue;
    }
    try {
      const result = await persistTelemetry(scope, parsed.data, receivedAt, true);
      if (result === 'stored') results.push({ itemId, status: 'STORED' });
      else if (result === 'duplicate') results.push({ itemId, status: 'DUPLICATE' });
      else results.push({ itemId, status: 'REJECTED', reason: result === 'conflict' ? 'IDENTITY_CONFLICT' : 'INCOMPATIBLE_POINT' });
    } catch {
      storageFailed = true;
      results.push({ itemId, status: 'RETRY' });
      logger.warn('telemetry_replay_storage_unavailable', { ...scope });
    }
  }
  return results;
}

export async function handleTelemetryReplay(
  scope: TelemetryScope, payload: unknown, receivedAt: number,
  verifyScope: (scope: TelemetryScope) => Promise<boolean>,
  publish: (topic: string, payload: unknown, expiresAt: Date) => Promise<void>,
) {
  const batch = batchSchema.safeParse(payload);
  if (!batch.success) {
    logger.warn('telemetry_replay_invalid_batch', { ...scope });
    return;
  }
  const { tenantId, buildingId, deviceId } = scope;
  const key = `${tenantId}/${buildingId}/${deviceId}`;
  if (activeBatches.size >= maxActiveBatches || activeBatches.has(key)) return;
  activeBatches.add(key);
  try {
    if (!await verifyScope(scope)) return;
    const results = await reconcile(scope, batch.data.items, receivedAt);
    const preparedAt = new Date();
    await publish(`afrixora/${tenantId}/${buildingId}/devices/${deviceId}/telemetry-ack`, {
      type: 'telemetry_ack', schemaVersion: 2, batchId: batch.data.batchId,
      serverReceivedAt: new Date(receivedAt).toISOString(), serverSentAt: preparedAt.toISOString(), results,
    }, new Date(preparedAt.getTime() + ackLifetimeMs));
  } catch {
    // Le boîtier conserve son journal si la réponse est perdue ou indisponible.
    logger.warn('telemetry_replay_ack_unavailable', { ...scope });
  } finally {
    activeBatches.delete(key);
  }
}
