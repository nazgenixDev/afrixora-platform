import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = 'admin@afrixora.cd';
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('SEED_ADMIN_PASSWORD est obligatoire, avec au moins 12 caractères et 72 octets UTF-8 au maximum.');
  }
  const hash = await bcrypt.hash(password, 10);

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
    if (existingAdmin.role !== 'SUPER_ADMIN') {
      throw new Error('L’adresse de l’administrateur est déjà utilisée par un autre rôle.');
    }
    await prisma.user.update({
      where: { id: existingAdmin.id },
      data: { passwordHash: hash, jwtVersion: { increment: 1 } },
    });
    console.log('Mot de passe de l’administrateur renouvelé. Sessions révoquées.');
  }
}

// Le seed doit échouer avec un code non nul en cas de refus (ex. production
// sans SEED_ADMIN_PASSWORD) pour bloquer un script de déploiement.
// console.error est volontairement conservé ici : ce fichier s'exécute hors du
// serveur (CLI Prisma) et le logger Winston n'y est pas initialisé.
main()
  .catch(e => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => await prisma.$disconnect());
