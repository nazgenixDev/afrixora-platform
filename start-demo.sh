#!/bin/bash
echo "🚀 Démarrage de la démo AFRIXORA..."

# Vérifier Docker
if ! docker ps &>/dev/null; then
    echo "❌ Docker n'est pas lancé. Lance Docker Desktop d'abord."
    exit 1
fi

# Démarrer les conteneurs
echo "📦 Démarrage PostgreSQL + Mosquitto..."
docker start afrixora-postgres afrixora-mosquitto 2>/dev/null || {
    docker run --name afrixora-postgres -e POSTGRES_USER=afrixora -e POSTGRES_PASSWORD=afrixora_dev -e POSTGRES_DB=afrixora_dev -p 5432:5432 -d timescale/timescaledb:latest-pg15
    docker run --name afrixora-mosquitto -p 1883:1883 -d eclipse-mosquitto:2
}

# Activer TimescaleDB + créer hypertable
sleep 3
psql postgresql://afrixora:afrixora_dev@localhost:5432/afrixora_dev -c "CREATE EXTENSION IF NOT EXISTS timescaledb; DROP TABLE IF EXISTS sensor_readings; CREATE TABLE sensor_readings (time TIMESTAMPTZ NOT NULL, tenant_id UUID NOT NULL, device_id UUID NOT NULL, metric TEXT NOT NULL, value DOUBLE PRECISION NOT NULL, unit TEXT); SELECT create_hypertable('sensor_readings','time');" 2>/dev/null

# Injecter des données de démo
echo "📊 Injection de données de démonstration..."
for i in 1 2 3 4 5 6 7; do
    mosquitto_pub -h localhost -p 1883 -t "afrixora/c0a80121-0000-4000-8000-000000000001/c0a80121-0000-4000-8000-000000000003/devices/c0a80121-0000-4000-8000-000000000012/readings" -m "{\"metrics\":{\"power_w\":$((1500+RANDOM%1000)),\"energy_kwh\":$((2+RANDOM%5)).$((RANDOM%10))},\"units\":{\"power_w\":\"W\",\"energy_kwh\":\"kWh\"},\"timestamp\":\"2026-05-0${i}T10:00:00Z\"}"
done

# Démarrer backend
echo "🔧 Démarrage du backend..."
cd ~/afrixora-platform/backend && npm run dev &
BACKEND_PID=$!

# Démarrer frontend
echo "🎨 Démarrage du frontend..."
cd ~/afrixora-platform/frontend && npm run dev &
FRONTEND_PID=$!

echo ""
echo "✅ Démo AFRIXORA prête !"
echo "🔗 Frontend : http://localhost:3000"
echo "🔗 Backend  : http://localhost:4000/health"
echo "👤 Login    : admin@afrixora.cd / Admin123!"
echo ""
echo "Appuie sur Ctrl+C pour arrêter."

wait $BACKEND_PID $FRONTEND_PID
