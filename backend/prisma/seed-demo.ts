import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { newPasswordSchema } from '../src/utils/passwordPolicy';

const clientEmail = 'client@demo.afrixora.test';
const tenantSlug = 'afrixora-scenario-demo';
const demoId = (number: number) => `afb10000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const tenantId = demoId(1);
const buildingId = demoId(2);

const zones = [
  { id: demoId(3), name: 'Bureaux', floor: 1, type: 'ROOM' },
  { id: demoId(4), name: 'Espaces communs', floor: 0, type: 'COMMON_AREA' },
] as const;

const devices = [
  { id: demoId(5), zoneId: zones[0].id, name: 'Compteur bureaux', type: 'ENERGY_METER' },
  { id: demoId(6), zoneId: zones[1].id, name: 'Compteur espaces communs', type: 'ENERGY_METER' },
  { id: demoId(7), zoneId: zones[1].id, name: 'Éclairage du hall', type: 'LIGHT' },
] as const;

async function main() {
  const database = new URL(process.env.DATABASE_URL ?? '');
  if (process.env.NODE_ENV !== 'development' || database.protocol !== 'postgresql:'
      || !['localhost', '127.0.0.1'].includes(database.hostname) || database.port !== '5432'
      || decodeURIComponent(database.pathname.slice(1)) !== process.env.POSTGRES_DB) {
    throw new Error('La base doit être celle du conteneur PostgreSQL de démonstration locale.');
  }
  const password = newPasswordSchema.parse(process.env.SEED_DEMO_CLIENT_PASSWORD);
  if (password.includes('CHANGE_ME') || password === process.env.SEED_ADMIN_PASSWORD) {
    throw new Error('Choisis un mot de passe propre au compte client dans SEED_DEMO_CLIENT_PASSWORD.');
  }
  const passwordHash = await bcrypt.hash(password, 10);

  const prisma = new PrismaClient();
  try {
    const end = new Date();
    end.setUTCMinutes(0, 0, 0);
    const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    await prisma.$transaction(async (db) => {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('afrixora.seed-demo'))`;
      const tenant = await db.tenant.upsert({
        where: { id: tenantId },
        update: {},
        create: { id: tenantId, slug: tenantSlug, name: 'Client fictif AFRIXORA', plan: 'PRO' },
      });
      if (tenant.slug !== tenantSlug) throw new Error('Identifiant du client de démonstration déjà utilisé.');

      const user = await db.user.findUnique({ where: { email: clientEmail } });
      if (user && (user.tenantId !== tenantId || user.role !== 'TENANT_ADMIN')) {
        throw new Error('Adresse du client de démonstration déjà utilisée.');
      }
      if (!user) {
        await db.user.create({
          data: {
            tenantId, email: clientEmail, name: 'Gestionnaire de démo', role: 'TENANT_ADMIN',
            passwordHash,
          },
        });
      }

      const building = await db.building.upsert({
        where: { id_tenantId: { id: buildingId, tenantId } },
        update: {},
        create: {
          id: buildingId, tenantId, name: 'Centre Horizon (démo)', city: 'Lubumbashi',
          address: 'Site fictif de démonstration', unitsCount: 2, config: { demo: true },
        },
      });
      if (!building.isActive) throw new Error('Le bâtiment de démonstration a été désactivé.');

      await db.zone.createMany({
        data: zones.map((zone) => ({ ...zone, tenantId, buildingId })),
        skipDuplicates: true,
      });
      await db.device.createMany({
        data: devices.map((device) => ({ ...device, tenantId, buildingId, metadata: { demo: true } })),
        skipDuplicates: true,
      });
      await db.alert.createMany({
        data: [
          {
            id: demoId(8), deviceId: devices[0].id, tenantId, buildingId,
            type: 'THRESHOLD', severity: 'WARNING', metadata: { demo: true },
            message: '[Démo] Consommation des bureaux au-dessus du seuil.',
          },
          {
            id: demoId(9), deviceId: devices[1].id, tenantId, buildingId,
            type: 'THRESHOLD', severity: 'INFO', metadata: { demo: true },
            message: '[Démo] Pic de puissance détecté dans les espaces communs.',
          },
        ],
        skipDuplicates: true,
      });

      await db.$executeRaw`
        WITH meters AS MATERIALIZED (
          SELECT device.id::uuid, fixture.base_power
          FROM "Device" AS device
          JOIN (VALUES (${devices[0].id}, 460), (${devices[1].id}, 680))
            AS fixture(id, base_power) ON fixture.id = device.id
          WHERE device."tenantId" = ${tenantId} AND device."buildingId" = ${buildingId}
        ), existing AS MATERIALIZED (
          SELECT reading.time, reading.device_id, reading.metric
          FROM public.sensor_readings AS reading
          JOIN meters ON meters.id = reading.device_id
          WHERE reading.tenant_id = ${tenantId}::uuid
            AND reading.time >= ${start}::timestamptz AND reading.time < ${end}::timestamptz
        )
        INSERT INTO public.sensor_readings (time, tenant_id, device_id, metric, value, unit)
        SELECT sample.time, ${tenantId}::uuid, meters.id, metric.name,
                 (meters.base_power + 43 * EXTRACT(HOUR FROM sample.time AT TIME ZONE 'Africa/Lubumbashi')
                   + 67 * EXTRACT(ISODOW FROM sample.time AT TIME ZONE 'Africa/Lubumbashi')) * metric.factor,
                 metric.unit
        FROM meters
        CROSS JOIN generate_series(${start}::timestamptz, ${end}::timestamptz - INTERVAL '1 hour', INTERVAL '1 hour')
          AS sample(time)
        CROSS JOIN (VALUES ('power_w', 1.0, 'W'), ('energy_kwh', 0.001, 'kWh')) AS metric(name, factor, unit)
        WHERE NOT EXISTS (
          SELECT 1 FROM existing
          WHERE existing.device_id = meters.id AND existing.time = sample.time AND existing.metric = metric.name
        )
      `;
    }, { timeout: 90_000 });

    // TimescaleDB rafraîchit les tranches complètes hors de la transaction d’initialisation.
    await prisma.$executeRaw`CALL refresh_continuous_aggregate(
      'public.sensor_readings_hourly'::regclass, ${start}::timestamptz, ${end}::timestamptz
    )`;
    console.log(`Données fictives prêtes. Compte client : ${clientEmail}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Erreur inconnue';
  console.error('Initialisation du scénario de démonstration impossible.', message);
  process.exitCode = 1;
});
