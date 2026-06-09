#!/bin/bash
set -e

echo "🚀 Démarrage de la démo AFRIXORA..."

# Nettoyer les anciens conteneurs (optionnel, commenté pour conserver les données)
# docker stop afrixora-postgres afrixora-redis afrixora-mosquitto 2>/dev/null || true
# docker rm afrixora-postgres afrixora-redis afrixora-mosquitto 2>/dev/null || true

# Démarrer les conteneurs (si non existants, ils seront créés)
docker run --name afrixora-postgres -e POSTGRES_USER=afrixora -e POSTGRES_PASSWORD=afrixora_dev -e POSTGRES_DB=afrixora_dev -p 5432:5432 -d timescale/timescaledb:latest-pg15 2>/dev/null || docker start afrixora-postgres
docker run --name afrixora-redis -p 6379:6379 -d redis:7-alpine 2>/dev/null || docker start afrixora-redis
docker run --name afrixora-mosquitto -p 1883:1883 -d eclipse-mosquitto:2 2>/dev/null || docker start afrixora-mosquitto

# Attendre que PostgreSQL soit prêt
echo "⏳ Attente de PostgreSQL..."
until docker exec afrixora-postgres pg_isready -U afrixora; do sleep 1; done
docker exec -i afrixora-postgres psql -U afrixora -d afrixora_dev -c "CREATE EXTENSION IF NOT EXISTS timescaledb;" 2>/dev/null

# Lancer le backend (port 4000)
echo "🔧 Démarrage du backend (port 4000)..."
cd backend
export DATABASE_URL="postgresql://afrixora:afrixora_dev@localhost:5432/afrixora_dev?schema=public"
export REDIS_URL="redis://localhost:6379"
export MQTT_URL="mqtt://localhost:1883"
export JWT_SECRET="dev_jwt_secret"
export JWT_REFRESH_SECRET="dev_jwt_refresh_secret"
export PORT=4000
export CORS_ORIGINS="http://localhost:3000"
npm run dev &
BACKEND_PID=$!
cd ..

# Lancer le frontend (port 3000)
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