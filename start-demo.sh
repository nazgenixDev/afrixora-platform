#!/bin/bash
#
# AFRIXORA — Script de démonstration locale.
# Tous les secrets proviennent de .env.demo (non versionné).
# Copier .env.demo.example vers .env.demo puis remplacer les CHANGE_ME.

set -euo pipefail
set -m
umask 077

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_DEMO_FILE="$SCRIPT_DIR/.env.demo"

if [[ $# -gt 1 || ( $# -eq 1 && "$1" != --sample-data ) ]]; then
    echo "Utilisation : ./start-demo.sh [--sample-data]" >&2
    exit 1
fi

if [ ! -f "$ENV_DEMO_FILE" ]; then
    echo "❌ Fichier .env.demo introuvable à la racine du projet."
    echo "   Copie le modèle puis renseigne les valeurs :"
    echo "   cp .env.demo.example .env.demo"
    exit 1
fi

env_mode=$(stat -c %a -- "$ENV_DEMO_FILE")
if (( (8#$env_mode & 0077) != 0 )); then
    echo "Protégez .env.demo avec chmod 600 avant de lancer la démo." >&2
    exit 1
fi

# Charge toutes les variables du fichier dans l'environnement (export automatique)
set -a
# shellcheck disable=SC1090
source "$ENV_DEMO_FILE"
set +a

# Vérification des variables obligatoires (aucune valeur secrète n'est codée dans ce script)
MISSING_VARS=""
for VAR_NAME in POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB DATABASE_URL REDIS_PASSWORD REDIS_URL MQTT_URL \
                MQTT_API_USER MQTT_API_PASSWORD JWT_SECRET JWT_REFRESH_SECRET \
                DOMAIN ENERGY_COST_PER_KWH PORT CORS_ORIGINS NEXT_PUBLIC_API_URL SEED_ADMIN_PASSWORD; do
    VAR_VALUE=${!VAR_NAME:-}
    # Une valeur vide ou contenant encore CHANGE_ME est refusée (couvre aussi
    # les cas imbriqués comme DATABASE_URL=postgresql://user:CHANGE_ME@host/db).
    case "$VAR_VALUE" in
        ""|*CHANGE_ME*)
            MISSING_VARS="$MISSING_VARS $VAR_NAME"
            ;;
    esac
done

if [ -n "$MISSING_VARS" ]; then
    echo "❌ Variables manquantes ou non renseignées dans .env.demo :$MISSING_VARS"
    exit 1
fi

node - <<'JS'
const services = {
  DATABASE_URL: ['postgresql:', '5432'],
  REDIS_URL: ['redis:', '6379'],
  MQTT_URL: ['mqtt:', '1883'],
};
for (const [variable, [protocol, port]] of Object.entries(services)) {
  try {
    const url = new URL(process.env[variable]);
    if (url.protocol === protocol && ['localhost', '127.0.0.1'].includes(url.hostname) && url.port === port) continue;
  } catch {
    // Le diagnostic ne doit pas afficher les identifiants présents dans l’URL.
  }
  console.error(variable + ' doit désigner le service de démonstration sur la boucle locale.');
  process.exitCode = 1;
}
try {
  const api = new URL(process.env.NEXT_PUBLIC_API_URL);
  const origins = process.env.CORS_ORIGINS.split(',').map(origin => origin.trim());
  if (api.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(api.hostname)
      || api.port !== process.env.PORT || api.href !== api.origin + '/'
      || !origins.includes(`http://${api.hostname}:3000`)) throw new Error();
} catch {
  console.error('NEXT_PUBLIC_API_URL doit cibler l’API locale et CORS_ORIGINS doit autoriser le frontend sur le même nom d’hôte.');
  process.exitCode = 1;
}
const password = process.env.SEED_ADMIN_PASSWORD;
if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
  console.error('SEED_ADMIN_PASSWORD doit contenir au moins 12 caractères et tenir dans 72 octets UTF-8.');
  process.exitCode = 1;
}
if (['3000', '5432', '6379', '1883'].includes(process.env.PORT)) {
  console.error('PORT doit être distinct des ports du frontend, de PostgreSQL, de Redis et de MQTT.');
  process.exitCode = 1;
}
JS

if [[ ${1:-} == --sample-data ]]; then
    if [[ $(docker inspect --format '{{index .Config.Labels "com.afrixora.demo.local"}} {{.State.Running}}' \
              afrixora-postgres 2>/dev/null) != 'true true' ]] ||
       [[ $(docker port afrixora-postgres 5432/tcp) != '127.0.0.1:5432' ]]; then
        echo "Démarrez la démo locale avant de charger les données fictives." >&2
        exit 1
    fi
    cd "$SCRIPT_DIR/backend"
    export NODE_ENV=development
    exec node -r ts-node/register prisma/seed-demo.ts
fi

frontend_host=$(node -p 'new URL(process.env.NEXT_PUBLIC_API_URL).hostname')
demo_dir="$SCRIPT_DIR/.afrixora-demo"
mkdir -p -- "$demo_dir"
exec 9>>"$demo_dir/start-demo.lock"
flock -n -E 75 9 || {
    lock_status=$?
    if [[ "$lock_status" == 75 ]]; then
        printf 'Une exécution de la démo est déjà en cours. Une fois prête, ouvrez http://%s:3000/login.\n' "$frontend_host"
        exit 0
    fi
    echo "Impossible d’acquérir le verrou de démarrage de la démo." >&2
    exit "$lock_status"
}

check_demo_ports() {
    node - "$frontend_host" <<'JS'
const { createServer } = require('node:net');

async function checkPort(port) {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`Le port ${port} est déjà utilisé. Si la démo tourne déjà, ouvrez http://${process.argv[2]}:3000/login.`);
      } else {
        console.error(`Impossible de vérifier le port ${port} (${error.code}).`);
      }
      resolve(false);
    });
    probe.listen({ host: '127.0.0.1', port }, () => probe.close(() => resolve(true)));
  });
}

Promise.all([checkPort(3000), checkPort(Number(process.env.PORT))]).then((results) => {
  if (!results.every(Boolean)) process.exitCode = 1;
});
JS
}

check_demo_ports

export NODE_ENV=development
export API_BIND_HOST=127.0.0.1
export TRUST_PROXY_HOPS=0
echo "Démarrage de la démo AFRIXORA sur la boucle locale."

# Fonction pour créer ou démarrer un conteneur
ensure_container() {
    local name=$1
    local image=$2
    local ports=$3
    shift 3
    if docker container inspect "$name" >/dev/null 2>&1; then
        if [[ $(docker inspect --format '{{index .Config.Labels "com.afrixora.demo.local"}}' "$name") != true ]]; then
            printf 'Conteneur existant %s à migrer. Consultez DEPLOYMENT.md avant de le remplacer.\n' "$name" >&2
            exit 1
        fi
        echo "✅ Conteneur $name existe, démarrage..."
        docker start "$name" >/dev/null
    else
        echo "📦 Création du conteneur $name..."
        docker run --name "$name" --label com.afrixora.demo.local=true -p "127.0.0.1:$ports" -d \
            "$@" "$image"
    fi
}

# Démarrer PostgreSQL
ensure_container "afrixora-postgres" "timescale/timescaledb-ha:pg15" "5432:5432" \
    -e POSTGRES_USER -e POSTGRES_PASSWORD -e POSTGRES_DB

# Démarrer Redis
ensure_container "afrixora-redis" "redis:7.4-alpine" "6379:6379" -e REDIS_PASSWORD \
    --tmpfs /run/redis-auth --entrypoint /usr/local/bin/redis-start.sh \
    --mount "type=bind,source=$SCRIPT_DIR/infrastructure/docker/redis-start.sh,target=/usr/local/bin/redis-start.sh,readonly"

# La démo dispose de ses propres comptes, sur un broker lié uniquement à la boucle locale.
mqtt_demo_dir="$demo_dir/mqtt-auth"
if [[ ! -s "$mqtt_demo_dir/passwd" || ! -s "$mqtt_demo_dir/acl" ]]; then
    [[ "$MQTT_API_USER" =~ ^[a-zA-Z0-9_-]+$ ]] || { echo "Nom de compte MQTT de démo invalide." >&2; exit 1; }
    mkdir -p "$mqtt_demo_dir"
    docker run --rm -e MQTT_API_USER -e MQTT_API_PASSWORD --entrypoint sh \
        --mount "type=bind,source=$mqtt_demo_dir,target=/run/mqtt-auth" eclipse-mosquitto:2 -ec '
            umask 077
            mosquitto_passwd -b -c /run/mqtt-auth/passwd "$MQTT_API_USER" "$MQTT_API_PASSWORD"
            printf "user %s\ntopic readwrite afrixora/#\n" "$MQTT_API_USER" > /run/mqtt-auth/acl
            chgrp 1883 /run/mqtt-auth /run/mqtt-auth/passwd /run/mqtt-auth/acl
            chmod 750 /run/mqtt-auth
            chmod 640 /run/mqtt-auth/passwd /run/mqtt-auth/acl
        '
fi
ensure_container "afrixora-mosquitto" "eclipse-mosquitto:2" "1883:1883" \
    --mount "type=bind,source=$SCRIPT_DIR/infrastructure/docker/mosquitto.conf,target=/mosquitto/config/mosquitto.conf,readonly" \
    --mount "type=bind,source=$mqtt_demo_dir,target=/run/mqtt-auth,readonly"

echo "⏳ Attente de PostgreSQL..."
ready=false
for ((attempt = 0; attempt < 60; attempt++)); do
    if docker exec afrixora-postgres pg_isready -h 127.0.0.1 -U "$POSTGRES_USER"; then
        ready=true
        break
    fi
    sleep 1
done
if [[ "$ready" != true ]]; then
    echo "PostgreSQL de démonstration n’est pas prêt après une minute." >&2
    exit 1
fi

# Migrations et seed
cd "$SCRIPT_DIR/backend"
npx prisma migrate deploy
npx prisma db seed
cd "$SCRIPT_DIR"

docker exec -i afrixora-postgres psql -X -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    -v ON_ERROR_STOP=1 --single-transaction -f - < infrastructure/scripts/01_schema.sql || exit 1

check_demo_ports

backend_pid=
frontend_pid=
cleanup() {
    for pid in "$backend_pid" "$frontend_pid"; do
        if [[ -n "$pid" ]]; then kill -- "-$pid" 2>/dev/null || true; fi
    done
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

(cd "$SCRIPT_DIR/backend" && exec npm run dev) 9>&- &
backend_pid=$!
(cd "$SCRIPT_DIR/frontend" && exec npm run dev -- --hostname 127.0.0.1 -p 3000) 9>&- &
frontend_pid=$!

if ! node - "$backend_pid" "$frontend_pid" <<'JS'
const { setTimeout: wait } = require('node:timers/promises');
const checks = [
  [Number(process.argv[2]), `http://127.0.0.1:${process.env.PORT}/ready`],
  [Number(process.argv[3]), 'http://127.0.0.1:3000/login'],
];

function processesAreRunning() {
  try {
    for (const [pid] of checks) process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForServices() {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (!processesAreRunning()) return false;
    const statuses = await Promise.all(checks.map(async ([, url]) => {
      try {
        const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(5_000) });
        await response.body?.cancel();
        return response.ok;
      } catch {
        return false;
      }
    }));
    if (statuses.every(Boolean)) return processesAreRunning();
    await wait(1000);
  }
  return false;
}

waitForServices().then(ready => { if (!ready) process.exitCode = 1; });
JS
then
    echo "La démo n’est pas prête. Vérifiez les messages de l’API et du frontend ci-dessus." >&2
    exit 1
fi

echo ""
echo "✅ Démo AFRIXORA prête !"
echo "🌐 Frontend : http://${frontend_host}:3000/login"
echo "⚙️ Backend  : http://${frontend_host}:${PORT}/health"
echo "👤 Login    : admin@afrixora.cd (mot de passe : SEED_ADMIN_PASSWORD défini dans .env.demo)"
echo ""
echo "Appuie sur Ctrl+C pour arrêter."

wait -n "$backend_pid" "$frontend_pid"
