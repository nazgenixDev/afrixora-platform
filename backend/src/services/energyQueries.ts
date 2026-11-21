import { query } from '../utils/database';

export const energyTimeZone = 'Africa/Kinshasa';

const periodHours: Record<string, number> = { '24h': 24, '7d': 168, '30d': 720, '3m': 2160 };

export const energyPeriodHours = (period: string) =>
  Object.prototype.hasOwnProperty.call(periodHours, period) ? periodHours[period] : periodHours['30d'];

export const buildingDevicesSql = `
  SELECT id, id::uuid AS device_id, name, type, "zoneId"
  FROM "Device"
  WHERE "tenantId" = $1 AND "buildingId" = $2
`;

// Les tranches horaires complètes viennent de l’agrégat. Les deux bords
// partiels sont lus directement pour respecter les bornes à la seconde près.
export function energySamplesSql(from: string, to: string, hourly: boolean, building = true) {
  const deviceJoin = building ? 'JOIN devices d ON d.device_id = sr.device_id' : '';
  const tenantFilter = building ? 'AND sr.tenant_id = $1::uuid' : '';
  const hour = "INTERVAL '1 hour'";
  const fullStart = `time_bucket(${hour}, ${from} - INTERVAL '1 microsecond') + ${hour}`;
  const fullEnd = `time_bucket(${hour}, ${to})`;

  const rawSamples = (start: string, end: string) => `
    SELECT sr.time AS bucket, sr.tenant_id, sr.device_id, sr.metric,
           sr.value AS total, sr.value AS maximum, 1::bigint AS sample_count
    FROM sensor_readings sr
    ${deviceJoin}
    WHERE sr.time >= ${start} AND sr.time < ${end}
      AND sr.metric IN ('energy_kwh', 'power_w')
      ${tenantFilter}
  `;

  return `
    ${building ? `devices AS MATERIALIZED (${buildingDevicesSql}),` : ''}
    samples AS (
      ${rawSamples(from, hourly ? `LEAST(${to}, ${fullStart})` : to)}
      ${hourly ? `
      UNION ALL
      ${rawSamples(`GREATEST(${fullStart}, ${fullEnd})`, to)}
      UNION ALL
      SELECT sr.bucket, sr.tenant_id, sr.device_id, sr.metric,
             sr.sum_value, sr.max_value, sr.sample_count
      FROM sensor_readings_hourly sr
      ${deviceJoin}
      WHERE sr.bucket >= ${fullStart} AND sr.bucket < ${fullEnd}
        AND sr.metric IN ('energy_kwh', 'power_w')
        ${tenantFilter}
      ` : ''}
    )
  `;
}

export const totalEnergySql = "COALESCE(SUM(total) FILTER (WHERE metric = 'energy_kwh'), 0)";
export const avgPowerSql = `
  SUM(total) FILTER (WHERE metric = 'power_w')
  / NULLIF(SUM(sample_count) FILTER (WHERE metric = 'power_w'), 0)
`;

export async function latestPowerW(tenantId?: string, buildingId?: string) {
  const result = tenantId !== undefined && buildingId !== undefined
    ? await query(
      `WITH devices AS MATERIALIZED (${buildingDevicesSql})
       SELECT latest.value
       FROM devices d
       CROSS JOIN LATERAL (
         SELECT sr.time, sr.value
         FROM sensor_readings sr
         WHERE sr.device_id = d.device_id AND sr.tenant_id = $1::uuid
           AND sr.metric = 'power_w' AND sr.time <= NOW()
         ORDER BY sr.time DESC
         LIMIT 1
       ) latest
       ORDER BY latest.time DESC, d.device_id
       LIMIT 1`,
      [tenantId, buildingId]
    )
    : await query(
      `SELECT value
       FROM sensor_readings
       WHERE metric = 'power_w' AND time <= NOW()
       ORDER BY time DESC
       LIMIT 1`
    );

  return result.rows[0]?.value ?? null;
}
