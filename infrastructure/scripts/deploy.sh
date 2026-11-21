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

# Les valeurs de .env sont exportées pour Bash et Docker Compose.
set -a
source ./.env
set +a

: "${DOMAIN:?Renseignez DOMAIN dans .env}"
: "${DB_PASSWORD:?Renseignez DB_PASSWORD dans .env}"
: "${REDIS_PASSWORD:?Renseignez REDIS_PASSWORD dans .env}"
: "${MQTT_API_USER:?Renseignez MQTT_API_USER dans .env}"

acl_file="${MQTT_ACL_FILE:-infrastructure/docker/mosquitto.acl}"
password_file="${MQTT_PASSWORD_FILE:-infrastructure/docker/mosquitto_passwd}"
if [ ! -f "$acl_file" ] || ! awk -v user="$MQTT_API_USER" '$1 == "user" && $2 == user { found = 1 } END { exit !found }' "$acl_file"; then
  echo "Préparez le fichier ACL pour le compte API et les passerelles avant de démarrer le broker." >&2
  exit 1
fi
if [ -n "${MQTT_PASSWORD_FILE:-}" ] && [ ! -f "$password_file" ]; then
  echo "Le fichier de mots de passe Mosquitto préparé est introuvable." >&2
  exit 1
fi

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

if [ ! -f "$password_file" ]; then
  : "${MQTT_API_PASSWORD:?Renseignez MQTT_API_PASSWORD dans .env}"

  echo "Création du fichier de mots de passe Mosquitto..."
  temp_password_file=$(mktemp "${password_file}.XXXXXX")
  trap 'rm -f -- "$temp_password_file"' EXIT
  docker run --rm --entrypoint sh eclipse-mosquitto:2 -ec '
    mosquitto_passwd -b -c /tmp/mosquitto_passwd "$1" "$2"
    cat /tmp/mosquitto_passwd
  ' sh "$MQTT_API_USER" "$MQTT_API_PASSWORD" > "$temp_password_file"
  chmod 644 "$temp_password_file"
  mv -- "$temp_password_file" "$password_file"
fi

echo "Démarrage de PostgreSQL et attente du contrôle de santé..."
docker compose up -d --wait --wait-timeout "$wait_timeout" postgres

# Prisma initialise son historique avant la création des tables hors Prisma.
echo "Application des migrations Prisma..."
docker compose run --rm -T --no-deps api ./node_modules/.bin/prisma migrate deploy

echo "Application du schéma TimescaleDB..."
docker compose exec -T postgres sh -ec '
  export PGPASSWORD="$POSTGRES_PASSWORD"
  exec psql -X -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    -v ON_ERROR_STOP=1 -v RETENTION_DAYS="$1" --single-transaction -f -
' sh "$retention_days" < infrastructure/scripts/01_schema.sql

if [ "${1:-}" = "--seed" ]; then
  echo "Initialisation du compte administrateur..."
  docker compose run --rm -T --no-deps api ./node_modules/.bin/prisma db seed
fi

echo "Démarrage des services et attente des contrôles de santé..."
docker compose up -d --wait --wait-timeout "$wait_timeout"
docker compose ps

printf 'Application : https://%s\nAPI : https://api.%s\nGrafana : https://grafana.%s\n' \
  "$DOMAIN" "$DOMAIN" "$DOMAIN"
