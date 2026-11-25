import { z } from 'zod';
import { prisma } from '../utils/database';

const dayMs = 24 * 60 * 60 * 1000;
const uuid = z.uuid().transform(value => value.toLowerCase());
const Base = z.strictObject({
  schemaVersion: z.literal(2),
  deviceId: uuid,
  meteringPointId: uuid,
  capturedAt: z.iso.datetime({ offset: true }),
  bootId: uuid,
  sequence: z.number().int().min(0).max(2_147_483_647),
  quality: z.enum(['MEASURED', 'ESTIMATED', 'INVALID']),
  origin: z.enum(['DEVICE', 'GATEWAY']),
  sourceFeedId: uuid.optional(),
});

export const telemetrySchema = z.discriminatedUnion('metric', [
  Base.extend({
    metric: z.literal('energy'),
    value: z.number().min(0).max(Number.MAX_SAFE_INTEGER),
    unit: z.enum(['Wh', 'kWh']),
    measurementMode: z.enum(['CUMULATIVE', 'INTERVAL']),
  }),
  Base.extend({
    metric: z.literal('power'),
    value: z.number().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
    unit: z.enum(['W', 'kW']),
    measurementMode: z.literal('INSTANTANEOUS'),
  }),
]);

export type Telemetry = z.infer<typeof telemetrySchema>;
export type TelemetryScope = { tenantId: string; buildingId: string; deviceId: string };

export function parseTelemetry(input: unknown, scope: TelemetryScope, receivedAt: number): Telemetry | undefined {
  const parsed = telemetrySchema.safeParse(input);
  if (!parsed.success || parsed.data.deviceId !== scope.deviceId) return;
  const capturedAt = Date.parse(parsed.data.capturedAt);
  if (!Number.isFinite(capturedAt) || capturedAt < receivedAt - dayMs || capturedAt > receivedAt + 5 * 60_000) return;
  return parsed.data;
}

export async function persistTelemetry(scope: TelemetryScope, sample: Telemetry, receivedAt: number) {
  const { tenantId, buildingId, deviceId } = scope;
  const { meteringPointId, metric, bootId, sequence, unit, value, measurementMode, quality, origin } = sample;
  const feedId = sample.sourceFeedId ?? null;
  const time = new Date(sample.capturedAt);
  const identity = JSON.stringify([tenantId, deviceId, meteringPointId, metric, bootId, sequence]);

  return prisma.$transaction(async tx => {
    // La transaction sérialise la même identité, même si le message rejoué a changé d’horodatage.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${identity}, 0))`;
    const existing = await tx.$queryRaw<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM public.sensor_readings
        WHERE tenant_id = ${tenantId}::uuid AND device_id = ${deviceId}::uuid
          AND metering_point_id = ${meteringPointId}::uuid AND metric = ${metric}
          AND boot_id = ${bootId}::uuid AND sequence = ${sequence}
      ) AS exists`;
    if (existing[0]?.exists) return 'duplicate' as const;

    const inserted = await tx.$executeRaw`
      INSERT INTO public.sensor_readings (
        time, tenant_id, device_id, metric, value, unit, metering_point_id,
        boot_id, sequence, measurement_mode, quality, origin, received_at, source_feed_id, source_id, source_type
      )
      SELECT ${time}, tenant.id::uuid, d.id::uuid, ${metric}, ${value}, ${unit}, p.id::uuid,
             ${bootId}::uuid, ${sequence}, ${measurementMode}, ${quality}, ${origin},
             ${new Date(receivedAt)}, f.id::uuid, s.id::uuid, s.type::text
      FROM "Tenant" tenant
      JOIN "Building" b ON b."tenantId" = tenant.id AND b.id = ${buildingId} AND b."isActive"
      JOIN "Device" d ON d."tenantId" = tenant.id AND d."buildingId" = b.id AND d.id = ${deviceId}
      JOIN "MeteringPoint" p ON p."tenantId" = tenant.id AND p."buildingId" = b.id AND p."deviceId" = d.id
      LEFT JOIN "SourceFeed" f ON f.id = ${feedId} AND f."tenantId" = tenant.id AND f."buildingId" = b.id
        AND f."archivedAt" IS NULL
      LEFT JOIN "EnergySource" s ON s.id = f."sourceId" AND s."tenantId" = tenant.id AND s."buildingId" = b.id
        AND s."archivedAt" IS NULL
      WHERE tenant.id = ${tenantId} AND tenant."isActive" AND p.id = ${meteringPointId}
        AND p."archivedAt" IS NULL AND p."measurementMode"::text = ${measurementMode}
        AND (p.unit = ${unit} OR (p.unit IN ('Wh', 'kWh') AND ${unit} IN ('Wh', 'kWh'))
          OR (p.unit IN ('W', 'kW') AND ${unit} IN ('W', 'kW')))
        AND (${feedId}::text IS NULL OR (s.id IS NOT NULL
          AND (p."feedId" IS NULL OR p."feedId" = f.id)
          AND (p."sourceId" IS NULL OR p."sourceId" = s.id)))
      FOR SHARE OF tenant, b, d, p`;
    return inserted ? 'stored' as const : 'rejected' as const;
  }, { isolationLevel: 'ReadCommitted' });
}
