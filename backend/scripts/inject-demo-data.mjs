/**
 * AFRIXORA — Demo Data Injector
 * Reads device IDs from PostgreSQL and publishes MQTT readings.
 * Usage: node backend/scripts/inject-demo-data.mjs
 */
import pg from 'pg';
import mqtt from 'mqtt';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env') });

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://afrixora:afrixora_dev@localhost:5432/afrixora_dev';
const MQTT_URL = process.env.MQTT_URL || 'mqtt://localhost:1883';
const MQTT_USER = process.env.MQTT_API_USER || 'afrixora_api';
const MQTT_PASS = process.env.MQTT_API_PASSWORD || '';

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  // Get tenant, building, and devices from seed
  const tenant = await pool.query('SELECT id FROM "Tenant" LIMIT 1');
  if (tenant.rows.length === 0) {
    console.error('❌ No tenant found. Run prisma db seed first.');
    await pool.end();
    process.exit(1);
  }
  const tenantId = tenant.rows[0].id;

  const building = await pool.query('SELECT id FROM "Building" WHERE "tenantId" = $1 LIMIT 1', [tenantId]);
  if (building.rows.length === 0) {
    console.error('❌ No building found.');
    await pool.end();
    process.exit(1);
  }
  const buildingId = building.rows[0].id;

  const devices = await pool.query(
    'SELECT id, type FROM "Device" WHERE "tenantId" = $1 AND "buildingId" = $2',
    [tenantId, buildingId],
  );
  await pool.end();

  if (devices.rows.length === 0) {
    console.log('⚠️ No devices to inject data for.');
    return;
  }

  console.log(`📡 Connecting to MQTT broker at ${MQTT_URL}`);
  const client = mqtt.connect(MQTT_URL, {
    username: MQTT_USER,
    password: MQTT_PASS,
    clientId: `afrixora-injector-${Math.random().toString(16).substring(2, 8)}`,
  });

  await new Promise((resolve, reject) => {
    client.on('connect', resolve);
    client.on('error', reject);
  });

  console.log(`📊 Injecting demo data for ${devices.rows.length} devices...`);

  for (let i = 0; i < 7; i++) {
    for (const device of devices.rows) {
      const topic = `afrixora/${tenantId}/${buildingId}/devices/${device.id}/readings`;

      let metrics = {};
      switch (device.type) {
        case 'ENERGY_METER':
          metrics = { power_w: 1500 + Math.floor(Math.random() * 1000), energy_kwh: 2 + Math.floor(Math.random() * 5) + Math.random() * 0.9 };
          break;
        case 'LIGHT':
        case 'PLUG':
          metrics = { power_w: 50 + Math.floor(Math.random() * 200), state: Math.random() > 0.3 ? 'on' : 'off' };
          break;
        case 'SENSOR':
          metrics = { temp_c: 22 + Math.random() * 8, humidity: 45 + Math.random() * 30 };
          break;
        case 'DOOR_SENSOR':
          metrics = { state: Math.random() > 0.7 ? 'open' : 'closed' };
          break;
        case 'THERMOSTAT':
          metrics = { temp_c: 20 + Math.random() * 5, target_c: 22 };
          break;
      }

      const payload = JSON.stringify({
        metrics,
        units: { power_w: 'W', energy_kwh: 'kWh', temp_c: '°C', humidity: '%' },
        timestamp: new Date(Date.now() - (6 - i) * 86400000).toISOString(),
      });

      client.publish(topic, payload);
    }
  }

  client.end();
  console.log('✅ Demo data injection complete');
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});