#!/bin/bash

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
    local env=$4
    if docker ps -a --format '{{.Names}}' | grep -q "^${name}$"; then
        echo "✅ Conteneur $name existe, démarrage..."
        docker start "$name" >/dev/null
    else
        echo "📦 Création du conteneur $name..."
        docker run --name "$name" $env -p "$ports" -d "$image"
    fi
}

# Démarrer PostgreSQL
ensure_container "afrixora-postgres" "timescale/timescaledb-ha:pg15" "5432:5432" "-e POSTGRES_USER=afrixora -e POSTGRES_PASSWORD=afrixora_dev -e POSTGRES_DB=afrixora_dev"

# Démarrer Redis
ensure_container "afrixora-redis" "redis:7-alpine" "6379:6379" ""

# Démarrer Mosquitto
ensure_container "afrixora-mosquitto" "eclipse-mosquitto:2" "1883:1883" ""

echo "⏳ Attente de PostgreSQL..."
until docker exec afrixora-postgres pg_isready -U afrixora; do sleep 1; done
docker exec -i afrixora-postgres psql -U afrixora -d afrixora_dev -c "CREATE EXTENSION IF NOT EXISTS timescaledb;" 2>/dev/null

# Migrations et seed
cd backend
export DATABASE_URL="postgresql://afrixora:afrixora_dev@localhost:5432/afrixora_dev?schema=public"
npx prisma migrate deploy || { echo "⚠️ Migration échouée, tentative avec db push"; npx prisma db push; }
npx prisma db seed
cd ..

# Backend
echo "🔧 Démarrage du backend (port 4000)..."
cd backend
export DATABASE_URL="postgresql://afrixora:afrixora_dev@localhost:5432/afrixora_dev?schema=public"
export REDIS_URL="redis://localhost:6379"
export MQTT_URL="mqtt://localhost:1883"
export JWT_SECRET="dev_jwt_secret"
export JWT_REFRESH_SECRET="dev_jwt_refresh_secret"
export PORT=4000
export CORS_ORIGINS="http://localhost:3000"
export MQTT_API_USER="afrixora_api"
export MQTT_API_PASSWORD="afrixora_mqtt_2026"
export RESEND_API_KEY="re_RkYk717v_Gv5LRMUZggpXLPbZDoLPC1VG"
export DOMAIN="localhost"
export ENERGY_COST_PER_KWH="0.12"
export MQTT_API_USER="afrixora_api"
export MQTT_API_PASSWORD="afrixora_mqtt_2026"
export RESEND_API_KEY="re_RkYk717v_Gv5LRMUZggpXLPbZDoLPC1VG"
export DOMAIN="localhost"
export ENERGY_COST_PER_KWH="0.12"
npm run dev &
BACKEND_PID=$!
cd ..

# Frontend
echo "🎨 Démarrage du frontend (port 3000)..."
cd frontend
export NEXT_PUBLIC_API_URL="http://localhost:4000"
npm run dev -- -p 3000 &
FRONTEND_PID=$!
cd ..

echo ""
echo "✅ Démo AFRIXORA prête !"
echo "🌐 Frontend : http://localhost:3000/login"
echo "⚙️ Backend  : http://localhost:4000/health"
echo "👤 Login    : admin@afrixora.cd / Admin123!"
echo ""
echo "Appuie sur Ctrl+C pour arrêter."

wait $BACKEND_PID $FRONTEND_PID