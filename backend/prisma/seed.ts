import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = 'admin@afrixora.cd';
  const adminPassword = 'Admin123!';
  const hash = bcrypt.hashSync(adminPassword, 10);

  // 1. Créer un tenant par défaut
  let tenant = await prisma.tenant.findFirst();
  if (!tenant) {
    tenant = await prisma.tenant.create({
        plan: "BASIC",
        subscriptionStatus: "ACTIVE",
      data: {
        name: 'Default Tenant',
        slug: 'default',
        plan: 'CORE',
        isActive: true,
      },
    });
  }
  console.log(`✅ Tenant: ${tenant.id}`);

  // 2. Créer l'utilisateur admin
  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existingAdmin) {
    await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash: hash,
        name: 'Admin AFRIXORA',
        role: 'SUPER_ADMIN',
        tenantId: tenant.id,
        isActive: true,
      },
    });
    console.log('✅ Admin user created');
  } else {
    console.log('ℹ️ Admin already exists');
  }

  // 3. Créer un bâtiment de démo
  let building = await prisma.building.findFirst({ where: { tenantId: tenant.id } });
  if (!building) {
    building = await prisma.building.create({
      data: {
        tenantId: tenant.id,
        name: 'Immeuble NAZGENIX',
        address: '123 Avenue Lumumba',
        city: 'Lubumbashi',
        unitsCount: 12,
        isActive: true,
      },
    });
    console.log(`✅ Building: ${building.id}`);
  } else {
    console.log(`ℹ️ Building exists: ${building.id}`);
  }

  // 4. Créer des zones
  const zoneNames = [
    { name: 'Rez-de-chaussée', floor: 0, type: 'COMMON_AREA' as const },
    { name: 'Bureau 101', floor: 1, type: 'ROOM' as const },
    { name: 'Bureau 102', floor: 1, type: 'ROOM' as const },
    { name: 'Salle Serveur', floor: 1, type: 'ROOM' as const },
  ];

  const zones: Record<string, string> = {};
  for (const z of zoneNames) {
    let zone = await prisma.zone.findFirst({
      where: { buildingId: building.id, name: z.name },
    });
    if (!zone) {
      zone = await prisma.zone.create({
        data: {
          tenantId: tenant.id,
          buildingId: building.id,
          name: z.name,
          floor: z.floor,
          type: z.type,
        },
      });
    }
    zones[z.name] = zone.id;
  }
  console.log(`✅ ${Object.keys(zones).length} zones created`);

  // 5. Créer des devices de démo
  const deviceDefs = [
    { name: 'Compteur Principal', type: 'ENERGY_METER' as const, zoneName: 'Salle Serveur' },
    { name: 'Lumière Bureau 101', type: 'LIGHT' as const, zoneName: 'Bureau 101' },
    { name: 'Prise Bureau 101', type: 'PLUG' as const, zoneName: 'Bureau 101' },
    { name: 'Capteur Température', type: 'SENSOR' as const, zoneName: 'Bureau 102' },
    { name: 'Porte Entrée', type: 'DOOR_SENSOR' as const, zoneName: 'Rez-de-chaussée' },
    { name: 'Thermostat 101', type: 'THERMOSTAT' as const, zoneName: 'Bureau 101' },
  ];

  for (const d of deviceDefs) {
    const existing = await prisma.device.findFirst({
      where: { buildingId: building.id, name: d.name },
    });
    if (!existing) {
      await prisma.device.create({
        data: {
          tenantId: tenant.id,
          buildingId: building.id,
          zoneId: zones[d.zoneName] || null,
          name: d.name,
          type: d.type,
          protocol: 'MQTT',
          isOnline: true,
          lastSeen: new Date(),
        },
      });
    }
  }
  console.log(`✅ ${deviceDefs.length} devices created`);
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());