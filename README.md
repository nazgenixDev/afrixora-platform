# AFRIXORA — Global IoT Intelligence Platform

**NAZGENIX SAS** — Lubumbashi, République Démocratique du Congo
https://afrixora.cd

## Stack
- Backend : Node.js 22 LTS + Express.js + TypeScript + Prisma + Socket.IO
- Frontend : Next.js 16 + React 19 + Tailwind CSS + shadcn/ui + Zustand + Recharts
- Base de données : PostgreSQL 15 / TimescaleDB 2.x + Redis 7
- IoT : MQTT (Mosquitto 2.x)
- Infrastructure : Docker + Docker Compose + Traefik v3 + Cloudflare Tunnel

## Démarrage rapide

Pour une démonstration locale, préparez les dépendances et le fichier de configuration privé.

```bash
npm ci --prefix backend
npm ci --prefix frontend
install -m 600 .env.demo.example .env.demo
```

Renseignez les valeurs d’exemple dans `.env.demo`, puis lancez `./start-demo.sh`. Les services de démo écoutent uniquement sur la boucle locale. Si la démo tourne déjà, ouvrez la page de connexion indiquée par le script. La configuration des anciens conteneurs de démo et le déploiement avec Docker Compose sont décrits dans le guide. [Guide de déploiement](DEPLOYMENT.md)

## Architecture

- Layer 0 → IoT Devices
- Layer 1 → Edge Gateway (Raspberry Pi)
- Layer 2 → Data & Messaging (TimescaleDB / Redis / Mosquitto)
- Layer 3 → Backend API (Express.js + Socket.IO)
- Layer 4 → Tableau de bord (Next.js 16)

### docker-compose.yml

La configuration de production isole PostgreSQL, Redis et MQTT sur des réseaux dédiés. La surcharge de développement publie des ports sur la boucle locale pour les outils du poste. [Configuration de production](docker-compose.yml) · [Surcharge de développement](docker-compose.dev.yml)

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
