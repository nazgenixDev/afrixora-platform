import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = 'admin@afrixora.cd';
  const adminPassword = 'Admin123!';
  const hash = bcrypt.hashSync(adminPassword, 10);

  // Créer un tenant par défaut avec plan BASIC
  let tenant = await prisma.tenant.findFirst();
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        name: 'Default Tenant',
        slug: 'default',
        plan: 'BASIC',
        subscriptionStatus: 'ACTIVE',
        isActive: true,
      },
    });
    console.log('✅ Tenant créé');
  }

  // Créer l'utilisateur admin
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
    console.log('✅ Admin créé');
  } else {
    console.log('ℹ️ Admin existe déjà');
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
