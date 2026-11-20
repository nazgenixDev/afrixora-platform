#!/bin/bash
set -euo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.."

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker et le plugin Docker Compose sont requis." >&2
  exit 1
fi

if [ ! -f .env ]; then
  echo "Fichier .env absent. Copiez .env.example et renseignez les valeurs du serveur." >&2
  exit 1
fi
env_mode=$(stat -c %a -- .env)
if (( (8#$env_mode & 0077) != 0 )); then
  echo "Protégez .env avec chmod 600 avant le déploiement." >&2
  exit 1
fi

# Les valeurs de .env sont exportées pour Bash et Docker Compose.
set -a
source ./.env
set +a

for name in DOMAIN DB_PASSWORD DB_API_PASSWORD DB_GRAFANA_PASSWORD DB_BACKUP_PASSWORD \
  REDIS_PASSWORD MQTT_API_USER MQTT_API_PASSWORD JWT_SECRET JWT_REFRESH_SECRET CORS_ORIGINS \
  GRAFANA_PASSWORD CLOUDFLARE_TUNNEL_TOKEN; do
  if [[ -z "${!name:-}" || "${!name}" == *CHANGE_ME* ]]; then
    printf 'Renseignez %s dans .env.\n' "$name" >&2
    exit 1
  fi
done

if [[ "$DB_PASSWORD" == "$DB_API_PASSWORD" || "$DB_PASSWORD" == "$DB_GRAFANA_PASSWORD" ||
      "$DB_PASSWORD" == "$DB_BACKUP_PASSWORD" || "$DB_API_PASSWORD" == "$DB_GRAFANA_PASSWORD" ||
      "$DB_API_PASSWORD" == "$DB_BACKUP_PASSWORD" || "$DB_GRAFANA_PASSWORD" == "$DB_BACKUP_PASSWORD" ]]; then
  echo "Attribuez un mot de passe distinct à chaque rôle PostgreSQL." >&2
  exit 1
fi

case "${1:-}" in
  "") ;;
  --seed)
    if [[ -z "${SEED_ADMIN_PASSWORD:-}" || "$SEED_ADMIN_PASSWORD" == *CHANGE_ME* ]]; then
      echo "Renseignez SEED_ADMIN_PASSWORD pour initialiser le compte administrateur." >&2
      exit 1
    fi
    ;;
  *)
    echo "Usage : $0 [--seed]" >&2
    exit 1
    ;;
esac

if [[ ! "$DOMAIN" =~ ^[[:alnum:]]([[:alnum:].-]*[[:alnum:]])?$ ]]; then
  echo "DOMAIN doit être un nom d’hôte, sans protocole ni chemin." >&2
  exit 1
fi

auth_path="${MQTT_AUTH_PATH:-./infrastructure/docker/mqtt-auth}"
bash infrastructure/scripts/validate-mqtt-auth.sh "$auth_path" "$MQTT_API_USER"
backup_cert="${BACKUP_CERT_PATH:-./infrastructure/docker/backup-cert.pem}"
if ! openssl x509 -in "$backup_cert" -noout -checkend 0 >/dev/null; then
  echo "Installez un certificat de sauvegarde valide avant le déploiement." >&2
  exit 1
fi
if awk '/-----BEGIN .*PRIVATE KEY-----/ { found = 1 } END { exit !found }' "$backup_cert"; then
  echo "BACKUP_CERT_PATH doit contenir uniquement le certificat public." >&2
  exit 1
fi

encode_uri_password() {
  local LC_ALL=C value=$1 result='' character index
  for ((index = 0; index < ${#value}; index++)); do
    character="${value:index:1}"
    case "$character" in
      [a-zA-Z0-9.~_-]) result+="$character" ;;
      *) printf -v result '%s%%%02X' "$result" "'$character" ;;
    esac
  done
  printf '%s' "$result"
}

DB_API_URL_PASSWORD=$(encode_uri_password "$DB_API_PASSWORD")
REDIS_URL_PASSWORD=$(encode_uri_password "$REDIS_PASSWORD")
export DB_API_URL_PASSWORD REDIS_URL_PASSWORD
migration_url="postgresql://afrixora:$(encode_uri_password "$DB_PASSWORD")@postgres:5432/afrixora_prod"

retention_days="${RETENTION_DAYS:-365}"
if [[ ! "$retention_days" =~ ^[1-9][0-9]*$ ]]; then
  echo "RETENTION_DAYS doit être un entier strictement positif." >&2
  exit 1
fi

wait_timeout="${DEPLOY_WAIT_TIMEOUT:-180}"

# Un ancien montage peut laisser les données dans le conteneur ou un volume anonyme.
postgres_container=$(docker compose ps --all --quiet postgres)
if [ -n "$postgres_container" ]; then
  postgres_volume=$(docker inspect --format \
    '{{range .Mounts}}{{if eq .Destination "/home/postgres/pgdata/data"}}{{.Name}}{{end}}{{end}}' \
    "$postgres_container")
  if [ -z "$postgres_volume" ] || [ "$(docker volume inspect --format \
    '{{index .Labels "com.docker.compose.volume"}}' "$postgres_volume")" != afrixora_postgres_data ]; then
    echo "PostgreSQL utilise un ancien stockage. Suivez la procédure de sauvegarde et de restauration dans DEPLOYMENT.md avant de redéployer." >&2
    exit 1
  fi
fi

echo "Construction des images applicatives..."
docker compose build

echo "Démarrage de PostgreSQL et attente du contrôle de santé..."
docker compose up -d --wait --wait-timeout "$wait_timeout" postgres

# Prisma initialise son historique avant la création des tables hors Prisma.
echo "Application des migrations Prisma..."
docker compose stop api
DATABASE_URL="$migration_url" docker compose run --rm -T --no-deps --env DATABASE_URL \
  api ./node_modules/.bin/prisma migrate deploy

# Les mots de passe des rôles sont lus par psql depuis l’environnement de cette session.
apply_sql() {
  docker compose exec -T --env DB_API_PASSWORD --env DB_GRAFANA_PASSWORD --env DB_BACKUP_PASSWORD \
    postgres sh -ec '
      export PGPASSWORD="$POSTGRES_PASSWORD"
      exec psql -X -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
        -v ON_ERROR_STOP=1 -v RETENTION_DAYS="$1" --single-transaction -f -
    ' sh "$retention_days" < "$1"
}

echo "Application du schéma TimescaleDB et des droits PostgreSQL..."
apply_sql infrastructure/scripts/01_schema.sql
apply_sql infrastructure/scripts/03_roles.sql

if [ "${1:-}" = "--seed" ]; then
  echo "Initialisation du compte administrateur..."
  docker compose run --rm -T --no-deps --env SEED_ADMIN_PASSWORD api ./node_modules/.bin/prisma db seed
fi

echo "Démarrage des services et attente des contrôles de santé..."
docker compose up -d --wait --wait-timeout "$wait_timeout"
docker compose ps

printf 'Application : https://%s\nAPI : https://api.%s\nGrafana : https://grafana.%s\n' \
  "$DOMAIN" "$DOMAIN" "$DOMAIN"
