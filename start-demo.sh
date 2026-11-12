#!/bin/bash
#
# AFRIXORA — Script de démonstration locale.
# Tous les secrets proviennent de .env.demo (non versionné).
# Copier .env.demo.example vers .env.demo puis remplacer les CHANGE_ME.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_DEMO_FILE="$SCRIPT_DIR/.env.demo"

if [ ! -f "$ENV_DEMO_FILE" ]; then
    echo "❌ Fichier .env.demo introuvable à la racine du projet."
    echo "   Copie le modèle puis renseigne les valeurs :"
    echo "   cp .env.demo.example .env.demo"
    exit 1
fi

# Charge toutes les variables du fichier dans l'environnement (export automatique)
set -a
# shellcheck disable=SC1090
source "$ENV_DEMO_FILE"
set +a

# Vérification des variables obligatoires (aucune valeur secrète n'est codée dans ce script)
MISSING_VARS=""
for VAR_NAME in POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB DATABASE_URL REDIS_URL MQTT_URL \
                MQTT_API_USER MQTT_API_PASSWORD JWT_SECRET JWT_REFRESH_SECRET RESEND_API_KEY \
                DOMAIN ENERGY_COST_PER_KWH PORT CORS_ORIGINS NEXT_PUBLIC_API_URL SEED_ADMIN_PASSWORD; do
    eval "VAR_VALUE=\"\${$VAR_NAME:-}\""
    if [ -z "$VAR_VALUE" ] || [ "$VAR_VALUE" = "CHANGE_ME" ] || [ "$VAR_VALUE" = "re_CHANGE_ME" ]; then
        MISSING_VARS="$MISSING_VARS $VAR_NAME"
    fi
done

if [ -n "$MISSING_VARS" ]; then
    echo "❌ Variables manquantes ou non renseignées dans .env.demo :$MISSING_VARS"
    exit 1
fi

echo "🚀 Démarrage de la démo AFRIXORA..."

# Nettoyage des processus précédents
pkill -f "ts-node-dev" 2>/dev/null
pkill -f "next" 2>/dev/null
fuser -k 3000/tcp 4000/tcp 2>/dev/null
kill -9 $(lsof -ti :3000) 2>/dev/null
kill -9 $(lsof -ti :4000) 2>/dev/null

# Fonction pour créer ou démarrer un conteneur
ensure_container() {
    local name=$1
    local image=$2
    local ports=$3
    shift 3
    if docker ps -a --format '{{.Names}}' | grep -q "^${name}$"; then
        echo "✅ Conteneur $name existe, démarrage..."
        docker start "$name" >/dev/null
    else
        echo "📦 Création du conteneur $name..."
        docker run --name "$name" "$@" -p "$ports" -d "$image"
    fi
}

# Démarrer PostgreSQL
ensure_container "afrixora-postgres" "timescale/timescaledb-ha:pg15" "5432:5432" \
    -e "POSTGRES_USER=${POSTGRES_USER}" \
    -e "POSTGRES_PASSWORD=${POSTGRES_PASSWORD}" \
    -e "POSTGRES_DB=${POSTGRES_DB}"

# Démarrer Redis
ensure_container "afrixora-redis" "redis:7-alpine" "6379:6379"

# Démarrer Mosquitto
ensure_container "afrixora-mosquitto" "eclipse-mosquitto:2" "1883:1883"

echo "⏳ Attente de PostgreSQL..."
until docker exec afrixora-postgres pg_isready -U "$POSTGRES_USER"; do sleep 1; done
docker exec -i afrixora-postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "CREATE EXTENSION IF NOT EXISTS timescaledb;" 2>/dev/null

# Migrations et seed
cd "$SCRIPT_DIR/backend"
npx prisma migrate deploy || { echo "⚠️ Migration échouée, tentative avec db push"; npx prisma db push; }
npx prisma db seed
cd "$SCRIPT_DIR"

# Backend
echo "🔧 Démarrage du backend (port ${PORT})..."
cd "$SCRIPT_DIR/backend"
npm run dev &
BACKEND_PID=$!
cd "$SCRIPT_DIR"

# Frontend
echo "🎨 Démarrage du frontend (port 3000)..."
cd "$SCRIPT_DIR/frontend"
npm run dev -- -p 3000 &
FRONTEND_PID=$!
cd "$SCRIPT_DIR"

echo ""
echo "✅ Démo AFRIXORA prête !"
echo "🌐 Frontend : http://localhost:3000/login"
echo "⚙️ Backend  : http://localhost:${PORT}/health"
echo "👤 Login    : admin@afrixora.cd (mot de passe : SEED_ADMIN_PASSWORD défini dans .env.demo)"
echo ""
echo "Appuie sur Ctrl+C pour arrêter."

wait $BACKEND_PID $FRONTEND_PID
