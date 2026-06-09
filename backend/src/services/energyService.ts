import { query } from '../utils/database';

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

  async getConsumption(tenantId: string, buildingId: string, period: string) {
    const interval = period === '24h' ? '1 hour' : '1 day';
    const hours = period === '24h' ? '24' : period === '7d' ? '168' : '720';

    const result = await query(
      `SELECT 
         time_bucket($1::interval, time) AS bucket,
         SUM(CASE WHEN sr.metric = 'energy_kwh' THEN sr.value ELSE 0 END) AS total_kwh,
         AVG(CASE WHEN sr.metric = 'power_w' THEN sr.value ELSE NULL END) AS avg_power_w
       FROM sensor_readings sr
       JOIN "Device" d ON sr.device_id = d.id::uuid
       WHERE d."buildingId" = $2
         AND sr.tenant_id = $3::uuid
         AND time > NOW() - ($4 || ' hours')::interval
       GROUP BY bucket
       ORDER BY bucket ASC`,
      [interval, buildingId, tenantId, hours]
    );
    return result.rows;
  }

  async getByDevice(tenantId: string, buildingId: string, period: string) {
    const hours = period === '24h' ? '24' : period === '7d' ? '168' : '720';
    
    const result = await query(
      `SELECT 
         d.id AS "deviceId",
         d.name,
         SUM(CASE WHEN sr.metric = 'energy_kwh' THEN sr.value ELSE 0 END) AS total_kwh
       FROM sensor_readings sr
       JOIN "Device" d ON sr.device_id = d.id::uuid
       WHERE d."buildingId" = $1
         AND sr.tenant_id = $2::uuid
         AND time > NOW() - ($3 || ' hours')::interval
       GROUP BY d.id, d.name
       ORDER BY total_kwh DESC`,
      [buildingId, tenantId, hours]
    );
    return result.rows;
  }

  async getByZone(tenantId: string, buildingId: string, period: string) {
    const hours = period === '24h' ? '24' : period === '7d' ? '168' : '720';
    
    const result = await query(
      `SELECT 
         z.id AS "zoneId",
         z.name,
         SUM(CASE WHEN sr.metric = 'energy_kwh' THEN sr.value ELSE 0 END) AS total_kwh
       FROM sensor_readings sr
       JOIN "Device" d ON sr.device_id = d.id::uuid
       LEFT JOIN "Zone" z ON d."zoneId" = z.id
       WHERE d."buildingId" = $1
         AND sr.tenant_id = $2::uuid
         AND time > NOW() - ($3 || ' hours')::interval
       GROUP BY z.id, z.name
       ORDER BY total_kwh DESC`,
      [buildingId, tenantId, hours]
    );
    return result.rows;
  }

  async getSummary(tenantId: string, buildingId: string, period: string) {
    const hours = period === '24h' ? '24' : period === '7d' ? '168' : '720';
    const costPerKwh = parseFloat(process.env.ENERGY_COST_PER_KWH || '0.12');

    const result = await query(
      `SELECT 
         SUM(CASE WHEN sr.metric = 'energy_kwh' THEN sr.value ELSE 0 END) AS total_kwh,
         MAX(CASE WHEN sr.metric = 'power_w' THEN sr.value ELSE 0 END) AS peak_power_w,
         AVG(CASE WHEN sr.metric = 'power_w' THEN sr.value ELSE NULL END) AS avg_power_w,
         COUNT(DISTINCT sr.device_id) AS device_count
       FROM sensor_readings sr
       JOIN "Device" d ON sr.device_id = d.id::uuid
       WHERE d."buildingId" = $1
         AND sr.tenant_id = $2::uuid
         AND time > NOW() - ($3 || ' hours')::interval`,
      [buildingId, tenantId, hours]
    );

    const row = result.rows[0];
    const totalKwh = parseFloat(row.total_kwh) || 0;
    
    return {
      totalKwh,
      estimatedCostUSD: +(totalKwh * costPerKwh).toFixed(2),
      peakPowerW: parseFloat(row.peak_power_w) || 0,
      avgPowerW: parseFloat(row.avg_power_w) || 0,
      deviceCount: parseInt(row.device_count, 10) || 0
    };
  }
}

export default new EnergyService();
