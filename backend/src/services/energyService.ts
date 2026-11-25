import { query } from '../utils/database';
import {
  avgPowerSql, energyPeriodHours, energySamplesSql, latestBuildingPowerW, totalEnergySql,
  type EnergyPeriod,
} from './energyQueries';

function periodSamplesSql(period: EnergyPeriod) {
  return energySamplesSql("NOW() - $3::integer * INTERVAL '1 hour'", 'NOW()', period !== '24h');
}

export class EnergyService {
  async getReadings(
    tenantId: string,
    deviceId: string,
    from: string,
    to: string,
    metric: string,
    pagination: { page: number; limit: number } = { page: 1, limit: 100 }
  ) {
    const { page, limit } = pagination;
    const offset = (page - 1) * limit;

    const [dataResult, countResult] = await Promise.all([
      query(
        `SELECT time, value, unit
         FROM sensor_readings
         WHERE device_id = $1::uuid
           AND tenant_id = $2::uuid
           AND metering_point_id IS NULL
           AND metric = $3
           AND time BETWEEN $4 AND $5
         ORDER BY time ASC
         LIMIT $6 OFFSET $7`,
        [deviceId, tenantId, metric, from, to, limit, offset]
      ),
      query(
        `SELECT COUNT(*) as total
         FROM sensor_readings
         WHERE device_id = $1::uuid
           AND tenant_id = $2::uuid
           AND metering_point_id IS NULL
           AND metric = $3
           AND time BETWEEN $4 AND $5`,
        [deviceId, tenantId, metric, from, to]
      ),
    ]);

    return {
      data: dataResult.rows,
      total: parseInt(countResult.rows[0]?.total || '0', 10),
      page,
      totalPages: Math.ceil(parseInt(countResult.rows[0]?.total || '0', 10) / limit),
    };
  }

  async getConsumption(tenantId: string, buildingId: string, period: EnergyPeriod, timeZone = 'UTC') {
    const interval = period === '24h' ? '1 hour' : '1 day';
    const result = await query(
      `WITH ${periodSamplesSql(period)}
       SELECT time_bucket($4::interval, bucket, $5::text) AS bucket,
              SUM(total) FILTER (WHERE metric = 'energy_kwh') AS total_kwh,
              ${avgPowerSql} AS avg_power_w
       FROM samples
       GROUP BY 1
       HAVING COUNT(*) FILTER (WHERE metric = 'energy_kwh') > 0
       ORDER BY 1`,
      [tenantId, buildingId, energyPeriodHours(period), interval, timeZone]
    );
    return result.rows;
  }

  async getByDevice(tenantId: string, buildingId: string, period: EnergyPeriod) {
    const result = await query(
      `WITH ${periodSamplesSql(period)}
       SELECT d.id AS "deviceId", d.name, ${totalEnergySql} AS total_kwh
       FROM samples s
       JOIN devices d ON d.device_id = s.device_id
       WHERE s.metric = 'energy_kwh'
       GROUP BY d.id, d.name
       ORDER BY total_kwh DESC`,
      [tenantId, buildingId, energyPeriodHours(period)]
    );
    return result.rows;
  }

  async getByZone(tenantId: string, buildingId: string, period: EnergyPeriod) {
    const result = await query(
      `WITH ${periodSamplesSql(period)}
       SELECT z.id AS "zoneId", z.name, ${totalEnergySql} AS total_kwh
       FROM samples s
       JOIN devices d ON d.device_id = s.device_id
       LEFT JOIN "Zone" z ON d."zoneId" = z.id AND z."tenantId" = $1 AND z."buildingId" = $2
       WHERE s.metric = 'energy_kwh'
       GROUP BY z.id, z.name
       ORDER BY total_kwh DESC`,
      [tenantId, buildingId, energyPeriodHours(period)]
    );
    return result.rows;
  }

  async getSummary(tenantId: string, buildingId: string, period: EnergyPeriod) {
    const costPerKwh = parseFloat(process.env.ENERGY_COST_PER_KWH || '0.12');
    const [result, currentPowerW] = await Promise.all([
      query(
        `WITH ${periodSamplesSql(period)}
         SELECT ${totalEnergySql} AS total_kwh,
                MAX(maximum) FILTER (WHERE metric = 'power_w') AS peak_power_w,
                ${avgPowerSql} AS avg_power_w,
                COUNT(DISTINCT device_id) AS device_count
         FROM samples`,
        [tenantId, buildingId, energyPeriodHours(period)]
      ),
      latestBuildingPowerW(tenantId, buildingId),
    ]);

    const row = result.rows[0];
    const totalKwh = Number(row.total_kwh);
    return {
      totalKwh,
      estimatedCostUSD: +(totalKwh * costPerKwh).toFixed(2),
      peakPowerW: Number(row.peak_power_w),
      avgPowerW: Number(row.avg_power_w),
      currentPowerW,
      deviceCount: Number(row.device_count),
    };
  }
}

export default new EnergyService();
