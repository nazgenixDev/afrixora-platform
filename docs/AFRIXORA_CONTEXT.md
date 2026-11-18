# AFRIXORA — Technical Context for AI-Assisted Development

> **READ THIS FILE FIRST** before generating any code for the AFRIXORA project.
> This is the single source of truth for the MVP architecture and development rules.
> **Version 2.0 — Updated after MVP completion (May 2026)**

---

## 1. Project Overview

**Product:** AFRIXORA — Global IoT Intelligence Platform
**Company:** NAZGENIX SAS — Lubumbashi, République Démocratique du Congo
**Website:** afrixora.cd · admin@afrixora.cd
**Version:** MVP Phase 1 — **COMPLETED**

**What it is:** A B2B SaaS IoT platform for intelligent building management in Africa. It connects IoT sensors and devices to a cloud dashboard, enabling energy monitoring, device control, and automation for commercial buildings.

**Business model:** SaaS subscription — 8/12/15 USD/unit/month + setup fee 1,500–8,000 USD.

**Critical constraints:**
- Offline-first — frequent power cuts (2–8h/day) in RDC. Data must never be lost.
- Single developer — architecture must stay simple and maintainable by one person.
- Deploy target — ORICO CF1000 local server (on-premise, Lubumbashi) OR any Docker-capable server/VPS.
  Specs: Intel i5-1240P · 32GB DDR5 · 2×NVMe SSD RAID 1 (ZFS).
  External access via Cloudflare Tunnel — no public IP required.
  UPS 1500VA obligatoire (protection coupures SNEL).
- Bootstrap budget — under 100 USD/month infrastructure.
- Timeline — production-ready in 12 weeks.

---

## 2. MVP Scope

The MVP includes **only two modules** (plus administration):

### ✅ AFRIXORA Building
- Manage buildings, zones (floors/rooms), and IoT devices.
- Device types: `LIGHT`, `PLUG`, `SENSOR`, `THERMOSTAT`, `ENERGY_METER`, `DOOR_SENSOR`.
- Real-time device control (on/off/set) via MQTT commands.
- Live device state and history via Socket.IO.

### ✅ AFRIXORA Energy
- Collect energy consumption from devices via MQTT.
- Store time-series data in TimescaleDB.
- Analytics: consumption by device, zone, and building.
- Charts: 24h / 7 days / 30 days.
- Threshold alerts and exportable reports (CSV + PDF).

### ✅ Administration (added during MVP)
- User management with RBAC (SUPER_ADMIN, TENANT_ADMIN, BUILDING_ADMIN, OPERATOR, VIEWER)
- API Key management
- Password reset by admin
- Self-service password change
- Settings page (Profile, Appearance, Notifications, About)
- Notification bell with real-time alerts
- User menu with avatar and role display
- Responsive sidebar with role-based filtering
- Request logging middleware

### ❌ Out of scope for MVP
Secure · Industry · Agro · Smart City · AI · Machine Learning — **do not implement these**.

---

## 3. System Architecture
┌─────────────────────────────────────────────────────┐
│ LAYER 4 — FRONTEND (Next.js 14)            │
│ Dashboard · Devices · Energy · Automations │
│ Alerts · Reports · API Dashboard · Users · Settings│
└──────────────────────┬──────────────────────────────┘
│ HTTPS + WebSocket (Socket.IO)
┌──────────────────────▼──────────────────────────────┐
│ LAYER 3 — BACKEND API (Node.js + Express) │
│ REST API · Socket.IO · MQTT Worker · Rule Engine │
│ Request Logger · RBAC Middleware │
└────────┬───────────────────────────────┬────────────┘
│ PostgreSQL + TimescaleDB │ Redis
┌────────▼───────────────────────────────▼────────────┐
│ LAYER 2 — DATA & MESSAGING │
│ TimescaleDB · Redis · Mosquitto MQTT Broker │
└──────────────────────┬──────────────────────────────┘
│ MQTT TCP 1883
┌──────────────────────▼──────────────────────────────┐
│ LAYER 1 — EDGE GATEWAY (Raspberry Pi 4) │
│ Zigbee2MQTT · Node-RED · SQLite offline · PM2 │
└──────────────────────┬──────────────────────────────┘
│ Zigbee / Wi-Fi / RS485
┌──────────────────────▼──────────────────────────────┐
│ LAYER 0 — IoT DEVICES │
│ Energy meters · Temp/Humidity · Door · Relays │
└─────────────────────────────────────────────────────┘


**Multi-tenant isolation:** Every database table includes a `tenantId` field. All API queries are scoped to the authenticated tenant automatically via JWT middleware.

---

## 3.1 Project Repository Structure
afrixora-platform/
├── backend/ # Node.js + Express + TypeScript API
│ ├── src/
│ │ ├── server.ts
│ │ ├── routes/
│ │ │ ├── auth.ts
│ │ │ ├── buildings.ts
│ │ │ ├── devices.ts
│ │ │ ├── readings.ts
│ │ │ ├── alerts.ts
│ │ │ ├── automations.ts
│ │ │ ├── reports.ts
│ │ │ ├── gateway.ts
│ │ │ ├── apiKeys.ts # NEW: API Key management
│ │ │ ├── apiLogs.ts # NEW: Request logs
│ │ │ └── users.ts # NEW: User management
│ │ ├── services/
│ │ │ ├── mqttWorker.ts
│ │ │ ├── automationEngine.ts
│ │ │ ├── emailService.ts
│ │ │ ├── apiKeyService.ts # NEW
│ │ │ └── reportService.ts
│ │ ├── middleware/
│ │ │ ├── authenticate.ts
│ │ │ ├── authorize.ts
│ │ │ ├── validate.ts
│ │ │ ├── errorHandler.ts
│ │ │ └── requestLogger.ts # NEW
│ │ └── utils/
│ │ ├── database.ts
│ │ ├── redis.ts
│ │ └── logger.ts
│ ├── prisma/
│ ├── Dockerfile
│ └── package.json
├── frontend/ # Next.js 14 dashboard
│ ├── src/
│ │ ├── app/
│ │ │ ├── (auth)/login/
│ │ │ ├── (dashboard)/
│ │ │ │ ├── page.tsx (Dashboard)
│ │ │ │ ├── buildings/
│ │ │ │ ├── devices/
│ │ │ │ ├── energy/
│ │ │ │ ├── automations/
│ │ │ │ ├── alerts/
│ │ │ │ ├── reports/
│ │ │ │ ├── users/ # NEW
│ │ │ │ ├── api-dashboard/ # NEW
│ │ │ │ └── settings/ # NEW
│ │ │ └── layout.tsx
│ │ ├── components/
│ │ │ ├── ui/ (shadcn)
│ │ │ ├── dashboard/
│ │ │ ├── devices/
│ │ │ ├── layout/
│ │ │ │ ├── NotificationBell.tsx # NEW
│ │ │ │ ├── HeaderInfo.tsx # NEW
│ │ │ │ └── UserMenu.tsx # NEW
│ │ │ └── users/
│ │ │ └── ChangePasswordDialog.tsx # NEW
│ │ ├── hooks/
│ │ │ └── useSocket.ts
│ │ ├── lib/
│ │ │ ├── api.ts
│ │ │ ├── auth.ts
│ │ │ ├── jwt.ts # NEW
│ │ │ └── utils.ts
│ │ ├── store/
│ │ │ └── index.ts
│ │ └── types/
│ │ └── index.ts # NEW
│ ├── public/
│ │ ├── afrixora_logo1.svg # Sidebar logo
│ │ └── iconAfrixora.svg # Favicon
│ ├── Dockerfile
│ └── package.json
├── gateway/
├── infrastructure/
├── docs/
├── docker-compose.yml
├── docker-compose.dev.yml
├── .env.example
├── .gitignore
├── start-demo.sh # NEW: One-click demo script
└── README.md


## 4. Technology Stack

### Backend
| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Node.js | 20 LTS |
| Framework | Express.js | 4.x |
| Language | TypeScript | 5.x |
| ORM | Prisma | 5.x |
| Validation | Zod | 3.x |
| WebSocket | Socket.IO | 4.x |
| Auth | JWT HS256 | (RS256 prévu Phase 2) |
| Email | Resend | — |
| Logger | Winston | — |
| PDF Generation | pdfkit | — |

### Frontend
| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Components | shadcn/ui |
| Charts | Recharts |
| State | Zustand |
| WebSocket | Socket.IO client |
| HTTP client | Axios |
| Icons | Lucide React |

### Data
| Role | Technology | Version |
|------|-----------|---------|
| Primary DB | PostgreSQL | 15 |
| Time-series | TimescaleDB | 2.x |
| Cache / Pub-Sub | Redis | 7 |

### IoT
| Role | Technology |
|------|-----------|
| Protocol | MQTT |
| Broker | Mosquitto 2.x |
| Gateway OS | Raspberry Pi OS Lite 64-bit |
| Gateway flows | Node-RED 3.x |
| Zigbee hub | Zigbee2MQTT |

### Infrastructure
| Role | Technology |
|------|-----------|
| Containers | Docker + Docker Compose 24.x |
| Reverse proxy | Traefik v3 (internal routing only) |
| Monitoring | Grafana (datasource TimescaleDB direct) |
| Host | ORICO CF1000 or any Docker-capable server/VPS |
| External access | Cloudflare Tunnel (no public IP required) |

---

## 5. Core Domain Models (Updated)

### Prisma Models

```prisma
model Tenant {
  id        String   @id @default(uuid())
  name      String
  slug      String   @unique
  plan      Plan     @default(CORE)
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  users     User[]
  buildings Building[]
}

model User {
  id           String   @id @default(uuid())
  tenantId     String
  email        String   @unique
  passwordHash String
  name         String
  role         Role     @default(OPERATOR)
  jwtVersion   Int      @default(0)
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now())
  @@index([tenantId])
}

model Building {
  id         String   @id @default(uuid())
  tenantId   String
  name       String
  address    String
  city       String   @default("Lubumbashi")
  unitsCount Int      @default(0)
  config     Json     @default("{}")
  isActive   Boolean  @default(true)
  createdAt  DateTime @default(now())
  zones      Zone[]
  devices    Device[]
  @@index([tenantId])
}

model Zone {
  id         String   @id @default(uuid())
  tenantId   String
  buildingId String
  name       String
  floor      Int      @default(0)
  type       ZoneType @default(ROOM)
  devices    Device[]
  @@index([tenantId])
  @@index([buildingId])
}

model Device {
  id         String     @id @default(uuid())
  tenantId   String
  buildingId String
  zoneId     String?
  name       String
  type       DeviceType
  protocol   Protocol   @default(MQTT)
  macAddress String?    @unique
  isOnline   Boolean    @default(false)
  lastSeen   DateTime?
  config     Json       @default("{}")
  metadata   Json       @default("{}")
  createdAt  DateTime   @default(now())
  states     DeviceState[]
  @@index([tenantId, buildingId])
  @@index([isOnline])
}

model DeviceState {
  id        String   @id @default(uuid())
  deviceId  String   @unique
  tenantId  String
  state     Json
  updatedAt DateTime @updatedAt
}

model Automation {
  id          String    @id @default(uuid())
  tenantId    String
  buildingId  String
  name        String
  isActive    Boolean   @default(true)
  trigger     Json
  conditions  Json      @default("[]")
  action      Json
  lastFiredAt DateTime?
  createdAt   DateTime  @default(now())
  @@index([tenantId, buildingId, isActive])
}

model Alert {
  id         String    @id @default(uuid())
  tenantId   String
  buildingId String
  deviceId   String?
  type       AlertType
  severity   Severity  @default(WARNING)
  message    String
  metadata   Json      @default("{}")
  isRead     Boolean   @default(false)
  resolvedAt DateTime?
  createdAt  DateTime  @default(now())
  @@index([tenantId, buildingId, isRead])
}

model Gateway {
  id         String    @id @default(uuid())
  tenantId   String
  buildingId String
  name       String
  isOnline   Boolean   @default(false)
  lastSeen   DateTime?
  version    String?
  @@index([tenantId])
  @@index([buildingId])
}

// NEW: API Key management
model ApiKey {
  id        String    @id @default(uuid())
  tenantId  String
  name      String
  key       String    @unique
  scope     String    @default("full")
  isActive  Boolean   @default(true)
  requests  Int       @default(0)
  limit     Int       @default(50000)
  lastUsed  DateTime?
  createdAt DateTime  @default(now())
  @@index([tenantId])
}

// NEW: API request logging
model ApiLog {
  id         String   @id @default(uuid())
  tenantId   String
  method     String
  endpoint   String
  statusCode Int
  durationMs Int
  ip         String
  userId     String?
  createdAt  DateTime @default(now())
  @@index([tenantId, createdAt(sort: Desc)])
}

TimescaleDB — sensor_readings

CREATE TABLE sensor_readings (
  time       TIMESTAMPTZ    NOT NULL,
  tenant_id  UUID           NOT NULL,
  device_id  UUID           NOT NULL,
  metric     TEXT           NOT NULL,
  value      DOUBLE PRECISION NOT NULL,
  unit       TEXT
);
SELECT create_hypertable('sensor_readings', 'time');
CREATE INDEX ON sensor_readings (device_id, time DESC);
CREATE INDEX ON sensor_readings (tenant_id, time DESC);

6. REST API — Complete Endpoints
Authentication
Method	Endpoint	Description
POST	/auth/login	Pose les cookies `access_token` et `refresh_token`, renvoie `{ user, accessToken }`
POST	/auth/refresh	Vérifie le cookie `refresh_token` et renouvelle `access_token`
GET	/auth/me	Renvoie le profil courant sous la forme `{ user }`
POST	/auth/logout	Incrémente `jwtVersion` et efface les deux cookies
Buildings & Zones
Method	Endpoint	Description
GET	/buildings	List tenant buildings (paginated: ?page=1&limit=50, returns { data, total, page, totalPages })
POST	/buildings	Create building
GET	/buildings/:id	Building detail + zones + stats
PATCH	/buildings/:id	Update building
DELETE	/buildings/:id	Soft delete building
GET	/buildings/:id/zones	List zones
POST	/buildings/:id/zones	Create zone
Devices
Method	Endpoint	Description
GET	/devices	List devices
POST	/devices	Register device
GET	/devices/:id	Device detail + state
PATCH	/devices/:id	Update device config
DELETE	/devices/:id	Remove device
POST	/devices/:id/control	Send MQTT command
GET	/devices/:id/history	State history
Energy & Readings
Method	Endpoint	Description
GET	/readings	Time-series query (paginated: ?page=1&limit=100)
GET	/energy/consumption	Aggregated consumption
GET	/energy/by-device	Breakdown by device
GET	/energy/by-zone	Breakdown by zone
GET	/energy/summary	KPIs
Automations & Alerts
Method	Endpoint	Description
GET	/automations	List rules
POST	/automations	Create rule
PATCH	/automations/:id	Update/toggle rule
DELETE	/automations/:id	Delete rule
GET	/alerts	Liste les alertes du tenant et renvoie `{ data, total, page, totalPages }`
PATCH	/alerts/:id/read	Marque une alerte du tenant comme lue. Renvoie 404 si elle est introuvable dans ce tenant.

`GET /alerts` accepte `isRead` (`true` ou `false`), `severity` (`INFO`, `WARNING`, `CRITICAL`), `buildingId` (UUID d’un bâtiment du tenant) et `type` (`THRESHOLD`, `OFFLINE`, `AUTOMATION`, `SYSTEM`). `page` vaut 1 par défaut et `limit` vaut 50 par défaut, avec un maximum de 100 par page. `total` compte toutes les alertes correspondant aux filtres, sur l’ensemble des pages. La cloche utilise `total` avec `isRead=false` pour afficher le nombre d’alertes non lues.

Reports
Method	Endpoint	Description
GET	/reports/csv	Export CSV
GET	/reports/pdf	Monthly PDF report
User Management (NEW)
Method	Endpoint	Description
GET	/users/me	Get current user profile
GET	/users	List all users (paginated: ?page=1&limit=50, returns { data, total, page, totalPages })
POST	/users	Create user (admin)
PATCH	/users/:id/toggle	Toggle active status
PATCH	/users/:id/role	Change user role
PATCH	/users/:id/reset-password	Reset password (admin)
DELETE	/users/:id	Delete user (admin)
PATCH	/users/change-password	Change own password
API Keys (NEW)
Method	Endpoint	Description
GET	/api-keys	List API keys
POST	/api-keys	Generate new key
PATCH	/api-keys/:id/toggle	Revoke/reactivate key
API Logs (NEW)
Method	Endpoint	Description
GET	/api-logs	List recent API requests

7. Frontend Dashboard (Updated)

/login                    → Authentication page
/ (dashboard)             → Global KPIs, charts, device cards
/buildings                → Building list + add dialog
/buildings/[id]           → Building detail: zones, devices, energy summary
/devices                  → Table/grid view, filters, drawer, add dialog
/energy                   → Recharts graphs, KPIs, heatmap, export CSV
/automations              → Rule builder (SI/ALORS), list with toggles
/alerts                   → Real-time alert feed, severity filters
/reports                  → Period + building selector, CSV/PDF download
/users                    → User management with RBAC, password reset
/api-dashboard            → API key management, request logs
/settings                 → Profile, appearance, notifications, about

Key Components

components/
├── dashboard/
│   ├── KpiCard.tsx
│   └── EnergyChart.tsx
├── devices/
│   ├── DeviceCard.tsx
│   ├── DeviceTable.tsx
│   ├── DeviceGrid.tsx
│   ├── DeviceDrawer.tsx
│   ├── AddDeviceDialog.tsx
│   └── StatsBar.tsx
├── layout/
│   ├── NotificationBell.tsx  # Real-time alert bell with badge
│   ├── HeaderInfo.tsx        # Building name + clock + gateway status
│   └── UserMenu.tsx          # Avatar + name + role + dropdown
├── users/
│   └── ChangePasswordDialog.tsx
└── ui/ (shadcn components)

Real-time architecture

Socket.IO authentifie chaque connexion au handshake. Le serveur lit d’abord le cookie `access_token`, puis `handshake.auth.token` si le cookie est absent. Le JWT doit être signé en HS256, l’utilisateur doit être actif et sa `jwtVersion` doit correspondre à celle en base. Le tenant doit aussi être actif, sauf pour `SUPER_ADMIN`. Une connexion refusée déclenche `connect_error` côté client.

`join:building` vérifie l’UUID puis l’existence du bâtiment dans le tenant authentifié avant de rejoindre `building:{buildingId}`. `SUPER_ADMIN` peut rejoindre tout bâtiment existant. En cas de refus, le serveur émet `error:join`. Le client conserve `withCredentials` et renseigne `auth.token` uniquement en développement si `afrixora_token` est disponible.

// Événements du canal bâtiment :
//   device:reading    → { deviceId, ...payload }
//   device:event      → { deviceId, ...payload }
//   alert:new         → Alert object

// Client connection (useSocket.ts):
//   socketInstance.emit('join:building', buildingId)
//   socketInstance.on('device:reading', ...)
//   socketInstance.on('alert:new', ...)

// Zustand store holds:
//   auth: { user, token, setAuth, clearAuth }
//   devices: Record<id, Device>
//   readings: Record<deviceId, Reading[]> (max 100)
//   alerts: Alert[] (max 50)

8. Security & RBAC (Updated)

Roles
Role	Permissions
SUPER_ADMIN	Peut attribuer tous les rôles et gérer les utilisateurs de tout rôle dans le tenant courant de la requête. Certaines routes d’administration ont une portée globale.
TENANT_ADMIN	Gère les bâtiments, appareils et automatisations de son tenant. Peut attribuer `TENANT_ADMIN`, `BUILDING_ADMIN`, `OPERATOR` et `VIEWER` et gérer les comptes de ces rôles dans son tenant. Toute attribution du rôle `SUPER_ADMIN` ou tentative de gestion d’un compte `SUPER_ADMIN` est refusée avec 403.
BUILDING_ADMIN	Gère les bâtiments, appareils et automatisations selon les autorisations des routes. Aucun droit de gestion des utilisateurs.
OPERATOR	Pilote les appareils et consulte les données. Aucun droit de gestion des utilisateurs.
VIEWER	Accès en lecture. Aucun droit de gestion des utilisateurs.

Les règles de gestion s’appliquent à la création, au changement de rôle, à l’activation et à la désactivation, à la réinitialisation de mot de passe et à la suppression. Tout utilisateur se voit refuser le changement de son propre rôle (403). Un changement de rôle, une désactivation ou une réinitialisation de mot de passe incrémente `jwtVersion` et invalide les JWT précédents lors de leur prochaine vérification. Le formulaire propose `SUPER_ADMIN` uniquement à un `SUPER_ADMIN` et affiche le message 403 renvoyé par l’API lors d’un changement de rôle.

Sidebar filtering
Admin roles see: Dashboard, Buildings, Devices, Energy, Reports, Automations, Alerts, Users, API Dashboard

Non-admin roles see: Dashboard, Buildings, Devices, Energy, Reports, Settings

Settings page available to all authenticated users

Authentification après le lot P0

- `POST /auth/login` pose `access_token` (15 minutes) et `refresh_token` (7 jours) dans des cookies `HttpOnly` et `SameSite=Lax`, avec `Secure` en production. Le JSON de connexion contient également `accessToken`. En développement uniquement, le frontend conserve cette valeur dans `localStorage` sous `afrixora_token` et l’envoie dans `Authorization: Bearer …`.
- `authenticate.ts` privilégie le cookie d’accès, puis lit le Bearer en son absence. Il vérifie la signature, l’activité de l’utilisateur, sa `jwtVersion` et l’activité du tenant, avec une exception sur l’activité du tenant pour `SUPER_ADMIN`. Les routes montées avec `authenticateOrApiKey` exigent actuellement un en-tête Bearer ou `x-api-key` pour sélectionner leur middleware, même lorsque le cookie est présent.
- Pour un JWT valide de `SUPER_ADMIN`, `authenticate.ts` accepte actuellement `x-tenant-id` comme tenant courant de la requête sans vérifier l’existence du tenant demandé. Les routes compatibles avec les clés API utilisent le tenant associé à la clé vérifiée.
- Au chargement du tableau de bord, le frontend récupère le profil via `GET /api/v1/auth/me`. Axios utilise `withCredentials`. Après un 401 hors connexion et rafraîchissement, l’intercepteur tente une fois `POST /api/v1/auth/refresh`, puis rejoue la requête initiale. Si le rafraîchissement échoue ou que la requête rejouée renvoie 401, il redirige vers `/login`.
- Le rafraîchissement vérifie la signature et la session associée au cookie `refresh_token`, puis pose un nouveau cookie d’accès. En développement, le JSON du rafraîchissement fournit aussi `accessToken` pour mettre à jour le repli local. Un mauvais identifiant à la connexion ou un jeton de rafraîchissement invalide produit une erreur 401 `INVALID_CREDENTIALS` avec le message générique « Identifiants invalides ».
- La connexion est limitée à 10 tentatives par IP sur 15 minutes en production et à 100 hors production. Le rafraîchissement a sa propre limite de 30 tentatives par IP sur 15 minutes. Les limiteurs et le journal des requêtes utilisent `req.ip`. `TRUST_PROXY_HOPS` vaut 1 par défaut. Pour la chaîne Cloudflare Tunnel → Traefik → API, il faut valider en déploiement si la valeur 2 correspond au trajet réel.

9. Development Workflow (Completed)
Step	Phase	Status
Step 1	Infrastructure & Auth	✅
Step 2	Building Module	        ✅
Step 3	MQTT Ingestion	        ✅
Step 4	Energy Module	        ✅
Step 5	Automations	        ✅
Step 6	Frontend Dashboard	✅
Step 7	Reports & Production	✅
Bonus	API Dashboard, Users, RBAC, Notifications, Settings	✅

Quick Reference — Environment Variables

# Database
DATABASE_URL=postgresql://afrixora:${DB_PASSWORD}@postgres:5432/afrixora_prod

# Redis
REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379

# JWT (HS256)
JWT_SECRET=
JWT_REFRESH_SECRET=
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# MQTT
MQTT_URL=mqtt://mosquitto:1883
MQTT_API_USER=afrixora_api
MQTT_API_PASSWORD=

# Email (resend.com)
RESEND_API_KEY=re_

# Frontend
NEXT_PUBLIC_API_URL=https://api.afrixora.cd

# Domain
DOMAIN=afrixora.cd
CORS_ORIGINS=https://afrixora.cd

# Cloudflare Tunnel
CLOUDFLARE_TUNNEL_TOKEN=

# Monitoring
GRAFANA_PASSWORD=

# Business
ENERGY_COST_PER_KWH=0.12
===============================================================================================
Quick Reference — Useful Commands

# Start demo (one-click)
./start-demo.sh

# Start local dev stack
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
cd backend && npm run dev
cd frontend && npm run dev

# Run migrations
cd backend && npx prisma migrate dev

# Check TimescaleDB
docker exec -it afrixora_postgres psql -U afrixora -d afrixora_prod \
  -c "SELECT * FROM timescaledb_information.hypertables;"

# Monitor MQTT traffic
docker exec -it afrixora_mqtt \
  mosquitto_sub -u afrixora_api -P "$MQTT_API_PASSWORD" -t "afrixora/#" -v

# Deploy to production
docker compose up -d --build

# Inject demo data
for i in 1 2 3 4 5 6 7; do
  mosquitto_pub -h localhost -p 1883 \
    -t "afrixora/{tenant}/{building}/devices/{device}/readings" \
    -m '{"metrics":{"power_w":'$((1500+RANDOM%1000))',"energy_kwh":'$((2+RANDOM%5))'.'$((RANDOM%10))'},"units":{"power_w":"W","energy_kwh":"kWh"}}'
done

=================================================================================================

