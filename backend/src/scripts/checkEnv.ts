/**
 * AFRIXORA — Environment Check
 * Vérifie la présence de toutes les variables critiques au démarrage.
 * Appelé au début de server.ts avant app.listen().
 */

const REQUIRED_VARS = [
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'DATABASE_URL',
  'REDIS_URL',
  'MQTT_URL',
  'CORS_ORIGINS',
];

const OPTIONAL_VARS = [
  'MQTT_API_USER',
  'MQTT_API_PASSWORD',
  'RESEND_API_KEY',
  'DOMAIN',
  'ENERGY_COST_PER_KWH',
];

export function checkEnv(): void {
  const missing: string[] = [];

  for (const key of REQUIRED_VARS) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    console.error('❌ Variables d\'environnement manquantes :');
    for (const key of missing) {
      console.error(`   - ${key}`);
    }
    console.error('');
    console.error('Assurez-vous que le fichier .env est correctement configuré.');
    process.exit(1);
  }

  const missingOptional: string[] = [];
  for (const key of OPTIONAL_VARS) {
    if (!process.env[key]) {
      missingOptional.push(key);
    }
  }

  if (missingOptional.length > 0) {
    console.warn('⚠️  Variables d\'environnement optionnelles manquantes :');
    for (const key of missingOptional) {
      console.warn(`   - ${key}`);
    }
  }

  console.log('✅ Toutes les variables d\'environnement critiques sont présentes.');
  console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   DOMAIN:   ${process.env.DOMAIN || 'non défini'}`);
  console.log(`   CORS:     ${process.env.CORS_ORIGINS || 'non défini'}`);
}