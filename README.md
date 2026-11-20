# AFRIXORA — Global IoT Intelligence Platform

**NAZGENIX SAS** — Lubumbashi, République Démocratique du Congo
https://afrixora.cd

## Stack
- Backend : Node.js 20 LTS + Express.js + TypeScript + Prisma + Socket.IO
- Frontend : Next.js 14 + Tailwind CSS + shadcn/ui + Zustand + Recharts
- Base de données : PostgreSQL 15 / TimescaleDB 2.x + Redis 7
- IoT : MQTT (Mosquitto 2.x)
- Infrastructure : Docker + Docker Compose + Traefik v3 + Cloudflare Tunnel

## Démarrage rapide

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

Pour lancer les processus de développement locaux, exécutez chaque commande dans un terminal distinct.

```bash
(cd backend && npm run dev)
(cd frontend && npm run dev)
```

## Architecture

- Layer 0 → IoT Devices
- Layer 1 → Edge Gateway (Raspberry Pi)
- Layer 2 → Data & Messaging (TimescaleDB / Redis / Mosquitto)
- Layer 3 → Backend API (Express.js + Socket.IO)
- Layer 4 → Frontend Dashboard (Next.js 14)

### docker-compose.yml

Exemple de structure. La configuration du dépôt se trouve dans [docker-compose.yml](docker-compose.yml).

```yaml
services:
  postgres:
    image: timescale/timescaledb:latest-pg15
    restart: unless-stopped
    expose:
      - "5432"
    networks:
      - afrixora_net

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    expose:
      - "6379"
    networks:
      - afrixora_net

  mosquitto:
    image: eclipse-mosquitto:2
    restart: unless-stopped
    expose:
      - "1883"
      - "9001"
    networks:
      - afrixora_net

  api:
    build: ./backend
    restart: unless-stopped
    networks:
      - afrixora_net

  frontend:
    build: ./frontend
    restart: unless-stopped
    networks:
      - afrixora_net

  traefik:
    image: traefik:v3
    restart: unless-stopped
    expose:
      - "80"
    networks:
      - afrixora_net

  cloudflared:
    image: cloudflare/cloudflared:latest
    restart: unless-stopped
    networks:
      - afrixora_net

  grafana:
    image: grafana/grafana:latest
    restart: unless-stopped
    networks:
      - afrixora_net

volumes:
  afrixora_postgres_data:
  afrixora_redis_data:
  afrixora_mosquitto_data:
  afrixora_grafana_data:

networks:
  afrixora_net:
    driver: bridge
```

## Tests backend

Les tests unitaires RBAC et les tests d’intégration HTTP s’exécutent avec `npm test` depuis `backend`. Les tests HTTP utilisent une base PostgreSQL de test dédiée, déjà créée. Prisma y applique les migrations avant l’exécution. Le seed, TimescaleDB, Redis et MQTT ne sont pas requis.

```bash
cd backend
npm ci
export DATABASE_URL='postgresql://utilisateur:mot_de_passe@127.0.0.1:5432/afrixora_test'
npx prisma migrate deploy
npm test
```

Remplacez les identifiants d’exemple par ceux de la base de test. La suite crée quatre tenants avec des identifiants uniques et supprime ses données après les tests. Les secrets JWT de test sont générés par la suite.
