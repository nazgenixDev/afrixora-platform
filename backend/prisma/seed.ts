import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// Mot de passe du compte admin de démonstration.
// - En production : obligatoire via SEED_ADMIN_PASSWORD (aucun défaut).
// - En développement : défaut documenté, jamais à réutiliser en production.
const DEV_DEFAULT_ADMIN_PASSWORD = 'Admin123!';

function resolveAdminPassword(): string {
  const fromEnv = process.env.SEED_ADMIN_PASSWORD;
  const isProduction = process.env.NODE_ENV === 'production';

  if (!fromEnv) {
    if (isProduction) {
      throw new Error(
        'SEED_ADMIN_PASSWORD est absent : refus de créer le compte admin en production. ' +
          'Définissez SEED_ADMIN_PASSWORD dans .env avant d’exécuter le seed.'
      );
    }
    return DEV_DEFAULT_ADMIN_PASSWORD;
  }

  if (isProduction && fromEnv === 'CHANGE_ME') {
    throw new Error(
      'SEED_ADMIN_PASSWORD vaut encore CHANGE_ME : refus de créer le compte admin en production.'
    );
  }

  return fromEnv;
}

async function main() {
  const adminEmail = 'admin@afrixora.cd';
  const adminPassword = resolveAdminPassword();
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
