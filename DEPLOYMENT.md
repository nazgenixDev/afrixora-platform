# AFRIXORA — Guide de Déploiement (ORICO CF1000 / VPS)

> Cible : serveur local ORICO CF1000 (Intel i5-1240P, 32GB DDR5, 2×NVMe RAID 1 ZFS)
> Exposition HTTPS : Cloudflare Tunnel (cloudflared)

---

## 1. Prérequis

| Composant | Version min | Installation |
|-----------|-------------|--------------|
| Docker | 24.x | `curl -fsSL https://get.docker.com \| sh` |
| Docker Compose | Plugin avec `up --wait` et `--wait-timeout` | Vérifier avec `docker compose version` et `docker compose up --help` |
| Git | 2.x | `apt install git` |
| UPS | 1500VA | Obligatoire (protection coupures SNEL) |

---

## 2. Configuration

### 2.1 Cloner le projet
```bash
git clone https://github.com/nazgenixDev/afrixora-platform.git
cd afrixora-platform
```

### 2.2 Générer les secrets
```bash
cp .env.example .env
# Générer des secrets forts (ne pas utiliser les valeurs par défaut)
openssl rand -base64 48  # JWT_SECRET
openssl rand -base64 48  # JWT_REFRESH_SECRET
openssl rand -hex 32  # DB_PASSWORD
openssl rand -hex 32  # REDIS_PASSWORD
openssl rand -hex 32  # MQTT_API_PASSWORD
openssl rand -hex 32  # GRAFANA_PASSWORD
```

### 2.3 Configurer les variables d'environnement
Renseigner les secrets dans `.env` et configurer les valeurs ci-dessous. Le script charge ce fichier avec Bash. Mettre les valeurs contenant des caractères spéciaux entre apostrophes.
```env
NODE_ENV=production
DOMAIN=afrixora.cd
CORS_ORIGINS=https://afrixora.cd
NEXT_PUBLIC_API_URL=https://api.afrixora.cd
CLOUDFLARE_TUNNEL_TOKEN='VOTRE_JETON_CLOUDFLARE'
RETENTION_DAYS=365
```

`RETENTION_DAYS` accepte un entier strictement positif. Avec 365 jours par défaut, TimescaleDB supprime les partitions de mesures entièrement expirées. Une modification de la valeur s’applique au redéploiement. `DEPLOY_WAIT_TIMEOUT` fixe, en secondes, la durée maximale de chaque attente Compose (180 par défaut).

### 2.4 Configurer Cloudflare Tunnel

Créer un tunnel géré dans Cloudflare et copier son jeton dans `CLOUDFLARE_TUNNEL_TOKEN`. Associer `afrixora.cd`, `api.afrixora.cd` et `grafana.afrixora.cd` au service `http://traefik:80`. Le conteneur `cloudflared` utilise ce jeton pour se connecter au tunnel.

---

## 3. Avant la mise à jour d’une installation existante

```bash
docker compose exec -T postgres printenv PGDATA
docker inspect "$(docker compose ps -q postgres)" \
  --format '{{range .Mounts}}{{println .Name .Destination}}{{end}}'
```

Le chemin actif de l’image TimescaleDB HA est `/home/postgres/pgdata/data`. Le script bloque le déploiement si le conteneur PostgreSQL existant utilise un autre stockage que le volume nommé attendu. Sauvegarder la base depuis l’ancien conteneur avant toute recréation, vérifier la restauration sur un projet Compose isolé, puis restaurer dans le volume nommé avant de relancer le déploiement. [Procédure TimescaleDB de sauvegarde et restauration](https://github.com/timescale/docs/blob/latest/self-hosted/backup-and-restore/logical-backup.md)

```bash
umask 077
docker compose exec -T postgres pg_dump -Fc -U afrixora -d afrixora_prod \
  > ../afrixora-avant-p1-1.dump
docker compose exec -T postgres pg_restore --list < ../afrixora-avant-p1-1.dump
```

Si la migration Prisma `20260608234433_add_subscription_plans` est encore en attente sur une base existante, examiner les valeurs de `Alert.type` et sauvegarder les plans des tenants. Cette migration échoue si d’anciennes valeurs `AlertType` sont utilisées et recrée la colonne `Tenant.plan` avec la valeur `BASIC`.

---

## 4. Construction et déploiement

```bash
./infrastructure/scripts/deploy.sh
```

Le script utilise le code déjà présent sur le serveur et déroule les opérations suivantes.

1. Charge `.env`, construit les images et génère le fichier d’identifiants Mosquitto s’il est absent.
2. Démarre PostgreSQL et attend que son contrôle de santé TCP soit au vert.
3. Applique les migrations Prisma dans un conteneur API temporaire. Sur une installation neuve, Prisma exige d’initialiser son historique avant la création des tables TimescaleDB.
4. Applique `infrastructure/scripts/01_schema.sql` avec `psql` dans une transaction. Le fichier initialise l’hypertable `sensor_readings`, la rétention et l’agrégat `sensor_readings_hourly`, qui remplit les tranches horaires terminées en arrière-plan.
5. Démarre les services et attend la réussite des contrôles de santé, dont le contrôle HTTP de Grafana. Les services sans contrôle doivent être démarrés. `docker compose ps` affiche leur état.

---

## 5. Initialisation optionnelle du compte administrateur

```bash
./infrastructure/scripts/deploy.sh --seed
```

Le seed crée le tenant initial si la base est vide et initialise `admin@afrixora.cd` à partir de `SEED_ADMIN_PASSWORD`. En production, utiliser un mot de passe fort et unique. Relancer le seed avec un mot de passe explicite réinitialise celui du compte existant et invalide ses sessions.

---

## 6. Monitoring

- **Grafana** est accessible sur `https://grafana.afrixora.cd` via Traefik. Le port hôte `3001` est réservé à `docker-compose.dev.yml`.
- **Traefik** utilise l’image `v3.7.19`, qui négocie la version d’API avec le démon Docker. L’ancienne image `v3.0` utilisait l’API 1.24, refusée par Docker 29. [Correctif Traefik](https://github.com/traefik/traefik/releases/tag/v3.6.1)
- **Logs** : `docker compose logs -f`
- **Backups PostgreSQL** : Automatiques à 2h via le conteneur `postgres-backup` (30 jours de rétention)

---

## 7. Maintenance

### 7.1 Mise à jour
```bash
git pull --ff-only origin main
./infrastructure/scripts/deploy.sh
```

### 7.2 Backup manuel
```bash
docker compose exec postgres-backup /usr/local/bin/backup.sh
```

### 7.3 Restauration
```bash
gunzip -c backups/postgres/afrixora_YYYYMMDD_HHMMSS.sql.gz | docker compose exec -T postgres psql -U afrixora -d afrixora_prod
```

### 7.4 Arrêt propre
```bash
docker compose down
```

---

## 8. Vérifications post-déploiement

- [ ] `curl https://api.afrixora.cd/health` → `{"status":"ok"}`
- [ ] `curl -fsS https://afrixora.cd/login` → page de connexion
- [ ] Connexion avec `admin@afrixora.cd` (mot de passe : voir .env / seed)
- [ ] ⚠️ Le compte de démo ne doit jamais exister en production — utiliser un compte administrateur réel avec un mot de passe unique
- [ ] Dashboard affiche les bâtiments et devices
- [ ] Grafana accessible et requête `SELECT 1` réussie dans Explore avec la source TimescaleDB
- [ ] Backup automatique configuré

### Vérifier l’idempotence et la persistance sur un projet isolé

Exécuter depuis la racine du dépôt dans Bash. Le test démarre uniquement PostgreSQL et utilise les valeurs de `.env.example`.

```bash
set -e
projet="afrixora-p11-persistance-$(date +%s)"
compose_test() {
  docker compose --env-file .env.example -p "$projet" "$@"
}
psql_test() {
  compose_test exec -T postgres psql -X -U afrixora -d afrixora_prod \
    -v ON_ERROR_STOP=1 "$@"
}

compose_test up --wait --wait-timeout 180 postgres
psql_test --single-transaction -f - < infrastructure/scripts/01_schema.sql
psql_test --single-transaction -f - < infrastructure/scripts/01_schema.sql
psql_test -c "INSERT INTO sensor_readings (time, tenant_id, device_id, metric, value, unit)
  VALUES (now(), '00000000-0000-4000-8000-000000000001',
          '00000000-0000-4000-8000-000000000002', 'power_w', 42, 'W');"
compose_test down
compose_test up --wait --wait-timeout 180 postgres
test "$(psql_test -Atc "SELECT count(*) FROM sensor_readings
  WHERE metric = 'power_w' AND tenant_id = '00000000-0000-4000-8000-000000000001';")" = 1
compose_test down
```

Les deux applications du schéma doivent réussir. Après recréation du conteneur, le relevé de test doit être présent dans le volume nommé.
