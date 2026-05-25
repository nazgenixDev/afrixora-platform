# AFRIXORA™ — Technical Context for AI-Assisted Development

> **READ THIS FILE FIRST** before generating any code for the AFRIXORA project.
> This is the single source of truth for the MVP architecture and development rules.

---

## 1. Project Overview

**Product:** AFRIXORA™ — Global IoT Intelligence Platform
**Company:** NAZGENIX SAS — Lubumbashi, République Démocratique du Congo
**Website:** afrixora.cd · admin@afrixora.cd
**Version:** MVP Phase 1

**What it is:** A B2B SaaS IoT platform for intelligent building management in Africa. It connects IoT sensors and devices to a cloud dashboard, enabling energy monitoring, device control, and automation for commercial buildings.

**Business model:** SaaS subscription — 8/12/15 USD/unit/month + setup fee 1,500–8,000 USD.

**Critical constraints:**
- Offline-first — frequent power cuts (2–8h/day) in RDC. Data must never be lost.
- Single developer — architecture must stay simple and maintainable by one person.
- Deploy target — ORICO CF1000 local server (on-premise, Lubumbashi).
  Specs: Intel i5-1240P · 32GB DDR5 · 2×NVMe SSD RAID 1 (ZFS).
  External access via Cloudflare Tunnel — no public IP required.
  UPS 1500VA obligatoire (protection coupures SNEL).
- Bootstrap budget — under 100 USD/month infrastructure.
- Timeline — production-ready in 12 weeks.

---

## 2. MVP Scope

The MVP includes **only two modules**:

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

### ❌ Out of scope for MVP
Secure · Industry · Agro · Smart City · AI · Machine Learning — **do not implement these**.

---

## 3. System Architecture

```
┌─────────────────────────────────────────────────────┐
│  LAYER 4 — FRONTEND (Next.js 14)                    │
│  Dashboard · Devices · Energy · Automations         │
└──────────────────────┬──────────────────────────────┘
                       │ HTTPS + WebSocket (Socket.IO)
┌──────────────────────▼──────────────────────────────┐
│  LAYER 3 — BACKEND API (Node.js + Express)          │
│  REST API · Socket.IO · MQTT Worker · Rule Engine   │
└────────┬───────────────────────────────┬────────────┘
         │ PostgreSQL + TimescaleDB       │ Redis
┌────────▼───────────────────────────────▼────────────┐
│  LAYER 2 — DATA & MESSAGING                         │
│  TimescaleDB · Redis · Mosquitto MQTT Broker        │
└──────────────────────┬──────────────────────────────┘
                       │ MQTT TCP 1883
┌──────────────────────▼──────────────────────────────┐
│  LAYER 1 — EDGE GATEWAY (Raspberry Pi 4)            │
│  Zigbee2MQTT · Node-RED · SQLite offline · PM2      │
└──────────────────────┬──────────────────────────────┘
                       │ Zigbee / Wi-Fi / RS485
┌──────────────────────▼──────────────────────────────┐
│  LAYER 0 — IoT DEVICES                              │
│  Energy meters · Temp/Humidity · Door · Relays      │
└─────────────────────────────────────────────────────┘
```

**Multi-tenant isolation:** Every database table includes a `tenantId` field. All API queries are scoped to the authenticated tenant automatically via JWT middleware.

---

## 3.1 Project Repository Structure

This is the main repository layout used during development. All code lives in a single monorepo.

```
afrixora-platform/
├── backend/                  # Node.js + Express + TypeScript API
│   ├── src/
│   ├── prisma/
│   ├── Dockerfile
│   └── package.json
├── frontend/                 # Next.js 14 dashboard
│   ├── src/
│   ├── Dockerfile
│   └── package.json
├── gateway/                  # Raspberry Pi edge scripts
│   ├── gateway-sync.js       # Offline SQLite → cloud sync
│   ├── nodered-flows.json
│   └── setup-gateway.sh
├── infrastructure/           # Docker configs, SQL scripts, monitoring
│   ├── scripts/
│   │   ├── 01_schema.sql
│   │   └── 02_seed.sql
│   └── monitoring/
├── docs/                     # Architecture and context documentation
│   ├── AFRIXORA_CONTEXT.md
│   └── AFRIXORA_RULES.md
├── docker-compose.yml        # Full production stack (1 command deploy)
├── docker-compose.dev.yml    # Local development overrides
├── .env.example              # Committed template — no secrets
├── .env                      # Real secrets — gitignored absolutely
└── README.md
```

> Each top-level folder maps directly to a deployment layer. A single developer can navigate and maintain this without context-switching overhead.

---

## 4. Technology Stack

> **These choices are final. Do not substitute or add technologies without explicit validation.**

### Backend
| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Node.js | 20 LTS |
| Framework | Express.js | 4.x |
| Language | TypeScript | 5.x |
| ORM | Prisma | 5.x |
| Validation | Zod | 3.x |
| WebSocket | Socket.IO | 4.x |
| Socket.IO Redis adapter | @socket.io/redis-adapter | latest |
| Auth | JWT HS256 | (RS256 prévu Phase 2) |
| Email | Resend | — |
| Logger | Winston | — |

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
| Monitoring | Grafana (datasource TimescaleDB direct - Prometheus prévu phase 2 |
| Host | ORICO CF1000 (on-premise Lubumbashi, RDC) |
| External access | Cloudflare Tunnel (no public IP required) |

---

## 4.1 Versioning Strategy

The project follows semantic versioning tied to development phase.

| Version | Phase | Description |
|---------|-------|-------------|
| `v0.x` | MVP development | Current phase — unstable, breaking changes allowed |
| `v1.x` | Beta releases | Feature-complete, tested with first pilot clients |
| `v2.x+` | Production stable | Multi-tenant, hardened, commercially deployed |

The codebase is currently in **v0 phase**. Breaking changes to the API, schema, and data model are expected and acceptable until v1.0 is tagged.

Git tagging convention:
- `v0.1.0` — Auth + Building module complete
- `v0.2.0` — Energy module + MQTT ingestion complete
- `v0.3.0` — Automations + frontend dashboard complete
- `v1.0.0` — First pilot client deployed

---

## 4.2 MVP Hardware Prototype

The MVP uses off-the-shelf hardware that is available locally in Lubumbashi and replaceable within 24 hours.

| Device | Role | Protocol |
|--------|------|----------|
| ESP32 relay module | Control lights and plugs (on/off) | Wi-Fi → MQTT |
| Zigbee motion sensor | Detect movement for automation triggers | Zigbee → Gateway |
| Zigbee energy meter | Measure real-time power consumption (W, kWh) | Zigbee → Gateway |
| Raspberry Pi 4 (4GB) | Edge gateway: bridges Zigbee + MQTT, local SQLite cache | LAN → Cloud MQTT |

**Communication flow:**
```
ESP32 / Zigbee device → Raspberry Pi Gateway → Mosquitto MQTT Broker → AFRIXORA Backend API
```

All devices publish to MQTT topics defined in Section 6. For the MVP, Wi-Fi simulated devices can replace physical hardware for development and demos.

---

## 4.3 Portabilité et stratégie de migration

AFRIXORA™ est conçu pour être **100% portable**. Le système peut migrer vers n'importe quel serveur compatible Docker (autre NAS, VPS cloud, serveur dédié) en modifiant uniquement le fichier `.env`. Aucune modification de code ni de configuration technique n'est requise.

### Principe : zéro dépendance au matériel

Toute configuration spécifique à la machine hôte est **interdite** dans les fichiers Docker et les images. Les seules valeurs machine-spécifiques vivent dans `.env`.

### Ce qui change lors d'une migration

| Élément | Action requise | Effort |
|---------|---------------|--------|
| Serveur hôte | Installer Docker + Compose | 10 min |
| Données | Restaurer les volumes Docker | 20–60 min |
| Accès externe | Nouveau `CLOUDFLARE_TUNNEL_TOKEN` | 5 min |
| Configuration app | Copier le fichier `.env` | 1 min |
| Code et services | Aucune modification | 0 min |

### Scénarios de migration supportés

- CF1000 → autre NAS ORICO, Synology ou QNAP
- CF1000 → VPS cloud (Hetzner, DigitalOcean, OVH)
- CF1000 → serveur dédié physique
- Environnement de développement → production

Dans tous les cas : `docker compose up -d` suffit.

---

## 5. Core Domain Models

### Prisma Models Summary

```prisma
model Tenant {
  id        String     // UUID PK
  name      String
  slug      String     @unique
  plan      Plan       // CORE | COMFORT | ENTERPRISE
  isActive  Boolean
  users     User[]
  buildings Building[]
}

model User {
  id           String
  tenantId     String     // Multi-tenant isolation
  email        String     @unique
  passwordHash String
  role         Role       // SUPER_ADMIN | TENANT_ADMIN | BUILDING_ADMIN | OPERATOR | VIEWER
  jwtVersion   Int        // Invalidate tokens on logout
}

model Building {
  id         String
  tenantId   String
  name       String
  address    String
  city       String     @default("Lubumbashi")
  unitsCount Int
  config     Json
  zones      Zone[]
  devices    Device[]
}

model Zone {
  id         String
  tenantId   String
  buildingId String
  name       String
  floor      Int
  type       ZoneType   // FLOOR | APARTMENT | ROOM | CORRIDOR | COMMON_AREA | PARKING
  devices    Device[]
}

model Device {
  id         String
  tenantId   String
  buildingId String
  zoneId     String?
  name       String
  type       DeviceType // LIGHT | PLUG | SENSOR | THERMOSTAT | ENERGY_METER | DOOR_SENSOR
  protocol   Protocol   // MQTT | ZIGBEE | WIFI
  isOnline   Boolean
  lastSeen   DateTime?
  config     Json
  states     DeviceState[]
}

model DeviceState {
  id        String
  deviceId  String    @unique
  tenantId  String
  state     Json      // { power: "on", brightness: 80, ... }
  updatedAt DateTime  @updatedAt
}

model Automation {
  id         String
  tenantId   String
  buildingId String
  name       String
  isActive   Boolean
  trigger    Json     // { type, deviceId, metric, operator, value }
  conditions Json     // [{ deviceId, metric, op, value }]
  action     Json     // { type, deviceId, command, params }
  lastFiredAt DateTime?
}

model Alert {
  id         String
  tenantId   String
  buildingId String
  deviceId   String?
  type       AlertType  // ENERGY_THRESHOLD | DEVICE_OFFLINE | AUTOMATION_FIRED | ANOMALY
  severity   Severity   // INFO | WARNING | CRITICAL
  message    String
  isRead     Boolean
  resolvedAt DateTime?
}

model Gateway {
  id         String
  tenantId   String
  buildingId String
  name       String
  isOnline   Boolean
  lastSeen   DateTime?
  version    String?
}
```

### TimescaleDB — sensor_readings (raw SQL, not Prisma)

```sql
CREATE TABLE sensor_readings (
  time       TIMESTAMPTZ    NOT NULL,
  tenant_id  UUID           NOT NULL,
  device_id  UUID           NOT NULL,
  metric     TEXT           NOT NULL,  -- power_w | temp_c | humidity_pct | state | motion
  value      DOUBLE PRECISION NOT NULL,
  unit       TEXT
);

SELECT create_hypertable('sensor_readings', 'time');
CREATE INDEX ON sensor_readings (device_id, time DESC);
```

---

## 6. MQTT Communication Model

### Topic Convention (strict)

```
afrixora/{tenantId}/{buildingId}/devices/{deviceId}/readings    → sensor data from device
afrixora/{tenantId}/{buildingId}/devices/{deviceId}/events      → events (door open, motion)
afrixora/{tenantId}/{buildingId}/devices/{deviceId}/commands    ← API commands to device
afrixora/{tenantId}/{buildingId}/gateways/{gatewayId}/status    → gateway heartbeat
afrixora/system/api_status                                      → API status (retained)
```

### Payload format — readings

```json
{
  "metrics": {
    "power_w": 245.5,
    "voltage_v": 220.1,
    "current_a": 1.12
  },
  "units": {
    "power_w": "W",
    "voltage_v": "V",
    "current_a": "A"
  },
  "timestamp": "2026-03-05T10:00:00Z"
}
```

### Payload format — command

```json
{
  "command": "set_state",
  "params": { "state": "on", "brightness": 80 },
  "correlationId": "uuid"
}
```

### Connectivité gateway distante — MQTT over WebSockets

Les gateways Raspberry Pi dans des bâtiments distants se connectent via **MQTT over WebSockets (port 9001)** proxifié par Cloudflare Tunnel. MQTT TCP raw (port 1883) n'est pas supporté par Cloudflare Tunnel.

```
Gateway bâtiment distant
  → WSS mqtt.afrixora.cd:443
    → Cloudflare Tunnel
      → mosquitto:9001 (WebSockets listener interne)
```

**Configuration `infrastructure/docker/mosquitto.conf` obligatoire en production (Phase 12) :**

```conf
listener 1883          # TCP — usage interne Docker uniquement
listener 9001          # WebSockets — gateways distants via Cloudflare Tunnel
protocol websockets
allow_anonymous false
password_file /mosquitto/config/passwd
persistence true
persistence_location /mosquitto/data/
log_dest stdout
```

**Mapping Cloudflare Tunnel à configurer (Dashboard → Tunnels → Public Hostnames) :**

```
Sous-domaine : mqtt.afrixora.cd
Service      : http://mosquitto:9001
```

**Variables d'environnement :**

```bash
# Gateway Raspberry Pi (bâtiment distant)
MQTT_BROKER_URL=wss://mqtt.afrixora.cd/mqtt

# API backend (réseau Docker interne — inchangé)
MQTT_URL=mqtt://mosquitto:1883
```

> Les appareils ESP32 ou capteurs sur le **même réseau LAN** que le CF1000 utilisent MQTT TCP 1883 directement.

---

## 7. Backend Architecture

### File structure

```
backend/src/
├── server.ts               # Express app + Socket.IO + MQTT worker init
├── routes/
│   ├── auth.ts             # POST /auth/login|register|refresh|logout
│   ├── buildings.ts        # CRUD buildings + zones
│   ├── devices.ts          # CRUD devices + POST /devices/:id/control
│   ├── readings.ts         # GET time-series from TimescaleDB
│   ├── alerts.ts           # GET/PATCH alerts
│   ├── automations.ts      # CRUD automation rules
│   ├── reports.ts          # GET CSV and PDF exports
│   └── gateway.ts          # POST /gateway/provision + /gateway/sync
├── services/
│   ├── mqttWorker.ts       # Subscribe MQTT → insert TimescaleDB → broadcast Socket.IO
│   ├── automationEngine.ts # Evaluate rules on each MQTT message
│   └── emailService.ts     # Send alerts via Resend
├── middleware/
│   ├── authenticate.ts     # Verify JWT HS256 + check jwtVersion
│   ├── authorize.ts        # RBAC by role and buildingId
│   ├── validate.ts         # Zod schema validation
│   └── errorHandler.ts     # Global error handler
└── utils/
    ├── database.ts         # PostgreSQL pool + transaction helpers
    ├── redis.ts            # Redis client
    └── logger.ts           # Winston logger
```

### Key data flow

```
MQTT message received
  → mqttWorker.ts parses topic → extracts tenantId, buildingId, deviceId
  → INSERT INTO sensor_readings (TimescaleDB)
  → prisma.device.update({ isOnline: true, lastSeen: now })
  → io.to(`building:${buildingId}`).emit('device:reading', data)
  → automationEngine.evaluate(tenantId, buildingId, deviceId, metrics)
      → load active rules for this device
      → evaluate trigger condition
      → if triggered: publish MQTT command OR create Alert
```

### REST API — Base URL: `/api/v1`

All routes except `/auth` require `Authorization: Bearer <JWT>`. TenantId is extracted from JWT automatically.

| Method | Endpoint | Description |
|--------|---------|-------------|
| POST | /auth/login | Returns access_token + refresh_token |
| POST | /auth/refresh | Renew access_token |
| POST | /auth/logout | Invalidate token (jwtVersion++) |
| GET | /buildings | List tenant buildings |
| POST | /buildings | Create building |
| GET | /buildings/:id | Building detail + zones + stats |
| PATCH | /buildings/:id | Update building |
| GET | /buildings/:id/zones | List zones |
| POST | /buildings/:id/zones | Create zone |
| GET | /devices | List devices (filter: buildingId, zoneId, type) |
| POST | /devices | Register device |
| GET | /devices/:id | Device detail + current state |
| POST | /devices/:id/control | Send MQTT command (on/off/set) |
| GET | /devices/:id/history | Paginated state history |
| GET | /readings | Time-series query (params: deviceId, from, to, metric) |
| GET | /energy/consumption | Aggregated consumption (24h/7d/30d) |
| GET | /energy/by-device | Breakdown by device |
| GET | /energy/by-zone | Breakdown by zone |
| GET | /energy/summary | KPIs: total kWh, estimated cost, peak |
| GET | /automations | List automation rules |
| POST | /automations | Create rule |
| PATCH | /automations/:id | Update / enable / disable |
| GET | /alerts | List alerts (filter: buildingId, severity, isRead) |
| PATCH | /alerts/:id/read | Mark alert as read |
| GET | /reports/csv | Export CSV (params: buildingId, from, to) |
| GET | /reports/pdf | Monthly PDF report |
| POST | /gateway/provision | Provision Raspberry Pi gateway |
| POST | /gateway/sync | Sync offline SQLite data to cloud |

---

## 8. Frontend Dashboard

### Pages

```
/login                    → Authentication page
/dashboard                → Global KPIs: devices online, total consumption, active alerts
/buildings                → Building list + quick stats
/buildings/[id]           → Building detail: zones map, device list, energy summary
/devices                  → All devices with real-time toggles, filter by building/zone/type
/energy                   → Recharts graphs (24h/7d/30d), breakdown tables, export CSV
/automations              → Rule builder UI (IF trigger THEN action), rules list with toggle
/alerts                   → Real-time alert feed, severity filters, mark as read
/reports                  → Period + building selector, generate PDF, export CSV
```

### Real-time architecture (frontend)

```typescript
// Socket.IO rooms: client joins `building:{buildingId}` room
// Events received:
//   device:reading   → { deviceId, metrics, timestamp }
//   device:status    → { deviceId, isOnline }
//   alert:new        → Alert object
//   automation:fired → { ruleId, ruleName }

// Zustand store holds:
//   devices: Record<id, Device>
//   readings: Record<deviceId, Reading[]>   // last 100 points per device
//   alerts: Alert[]                         // last 50 alerts
```

### Key components

```
components/
├── dashboard/
│   ├── KpiCard.tsx         # Metric card with icon + value + trend
│   ├── EnergyChart.tsx     # Recharts LineChart for time-series
│   └── DeviceStatusGrid.tsx
├── devices/
│   ├── DeviceCard.tsx      # Device name + type + online badge + control toggle
│   └── ControlPanel.tsx    # Commands panel for thermostat/dimmer
├── automations/
│   └── RuleBuilder.tsx     # Visual IF/THEN rule builder
└── layout/
    ├── Sidebar.tsx
    └── Header.tsx          # Alerts bell + tenant name
```

---

## 9. Development Rules for AI Assistants

> **These rules are mandatory. Apply them to every code generation task.**

### Architecture rules
- **Monolithic backend only.** One Express.js application. No microservices. No separate services per module.
- **No new technologies.** Only use what is listed in Section 4. Do not introduce ORMs, frameworks, libraries, or services not in the stack.
- **No complexity creep.** The developer is alone. Every addition must be justified by a real MVP requirement.
- **Multi-tenant always.** Every database query must filter by `tenantId`. Never return data across tenants.

### Scope rules
- **Building module and Energy module only.** Do not implement or scaffold code for Secure, Industry, Agro, Smart City, AI, or ML.
- **MVP features only.** Do not add "nice to have" features. Stick to what is defined in Section 2.

### Code style rules
- Use **TypeScript** everywhere. No plain `.js` files in backend or frontend.
- Validate all request inputs with **Zod** before processing.
- Use **Prisma** for all PostgreSQL queries. Use **raw SQL** only for TimescaleDB time-series queries (`sensor_readings` table).
- Handle errors with the global `errorHandler.ts` middleware. Do not use `try/catch` inline unless necessary.
- Use **async/await** — no callbacks, no `.then()` chains.

### File structure rules
- Follow the directory structure in Section 7 exactly.
- One route file per resource domain (`buildings.ts`, `devices.ts`, etc.).
- Business logic in `services/`, not in route handlers.
- Route handlers should only: validate input → call service → return response.

### MQTT rules
- Always follow the topic convention in Section 6. Never invent new topic formats.
- Commands go to `.../commands` topics. Readings come from `.../readings` topics.

### Socket.IO rules
- Clients join rooms by `building:{buildingId}`. Emit events to rooms, not broadcast globally.
- Events: `device:reading`, `device:status`, `alert:new`, `automation:fired`.

---

## 10. Development Workflow

Build in this order. Do not skip steps. Each step must pass its validation criteria before moving on.

### Step 1 — Infrastructure & Auth (Week 1–2)
- `docker-compose.yml` with postgres/redis/mosquitto → all services healthy
- Prisma schema + migrations + TimescaleDB hypertable
- JWT auth: login / refresh / logout with `jwtVersion` invalidation
- **Criteria:** `docker compose up` starts clean. `POST /auth/login` returns valid JWT.

### Step 2 — Building Module (Week 3–4)
- CRUD buildings + zones (all scoped by tenantId)
- CRUD devices: register, list, get state
- `POST /devices/:id/control` → publishes MQTT command
- **Criteria:** Toggle device from Postman → MQTT command published < 200ms.

### Step 3 — MQTT Ingestion (Week 4–5)
- `mqttWorker.ts` subscribes to `afrixora/#`
- Parses readings → inserts into `sensor_readings` (TimescaleDB)
- Updates `devices.isOnline` + `lastSeen` via Prisma
- Broadcasts via Socket.IO to building room
- **Criteria:** Simulated MQTT publish → row in TimescaleDB + WebSocket event received.

### Step 4 — Energy Module (Week 5–6)
- `/readings` endpoint with TimescaleDB `time_bucket` queries
- `/energy/consumption`, `/energy/by-device`, `/energy/by-zone`, `/energy/summary`
- **Criteria:** Energy API returns correct aggregated data for 24h / 7d / 30d.

### Step 5 — Automations (Week 6–7)
- CRUD automation rules
- `automationEngine.ts` evaluates rules on each MQTT message
- Triggers: `DEVICE_COMMAND` (publish MQTT) or `SEND_ALERT` (create Alert + email)
- **Criteria:** Rule `power_w > 2000 → alert` fires and creates Alert record.

### Step 6 — Frontend Dashboard (Week 7–8)
- Next.js 14 setup + shadcn/ui + Zustand store
- All pages in Section 8 built and connected to API
- Socket.IO `useSocket` hook for real-time updates
- Recharts energy graphs
- **Criteria:** Full demo flow runs live: login → view buildings → control device → see energy chart.

### Step 7 — Reports & Production (Week 9–12)
- CSV export (streaming response)
- PDF report with pdfkit
- Docker production build
- Traefik internal routing on ORICO CF1000
- Cloudflare Tunnel for external HTTPS access
- Grafana monitoring
- Raspberry Pi gateway provisioning + `gateway-sync.js`
- **Criteria:** All items in the Go/No-Go checklist are ✅.

### Correspondance Steps ↔ Phases de développement

| Step (CONTEXT) | Phases (PROMPTS) | Contenu |
|----------------|------------------|---------|
| Step 1 — Infrastructure & Auth | Phases 1, 2, 3, 4 | Init projet · Backend · DB · Auth JWT |
| Step 2 — Building Module | Phase 5 | CRUD buildings, zones, devices |
| Step 3 — MQTT Ingestion | Phases 6, 7 | Devices control · MQTT worker |
| Step 4 — Energy Module | Phase 8 | TimescaleDB queries · analytics |
| Step 5 — Automations | Phase 9 | Rule engine · alerts |
| Step 6 — Frontend Dashboard | Phases 10A, 10B, 10C | Next.js · Socket.IO · Recharts |
| Step 7 — Reports & Production | Phases 11, 12 | CSV/PDF · Docker prod · CF1000 |

Quand ce document mentionne "Step N", il correspond aux Phases indiquées ci-dessus dans `AFRIXORA_MVP_PROMPTS.md`.

---

## 10.1 Security Principles

These rules apply to every part of the system. They are not optional.

**Authentication & Authorization**
- All API endpoints require a valid JWT Bearer token. No exceptions except `/auth/login` and `/auth/refresh`.
- JWT tokens use HS256 signing (HMAC-SHA256 via JWT_SECRET). Token invalidation is handled via `jwtVersion` increment on logout. RS256 (asymmetric) prévu Phase 2 enterprise.
- RBAC is enforced on every route via the `authorize.ts` middleware. Roles: `SUPER_ADMIN · TENANT_ADMIN · BUILDING_ADMIN · OPERATOR · VIEWER`.

**Multi-tenant isolation**
- Every database query must include a `WHERE tenant_id = $tenantId` filter.
- TenantId is always extracted from the verified JWT — never from the request body or query params.
- Never return data across tenants under any circumstances.

**MQTT security**
- The Mosquitto broker requires username/password authentication for all connections.
- The API uses a dedicated MQTT user (`afrixora_api`). Gateways use separate credentials.
- MQTT credentials are stored in `mosquitto_passwd` (gitignored, never in source).

**Secrets management**
- Secrets must never be committed to Git. `.env` is in `.gitignore` absolutely.
- Use `.env.example` as a committed template with empty values.
- On the CF1000 server, set `.env` permissions to `chmod 600`.
- Rotate JWT secrets and MQTT passwords before each new client deployment.

---

## Quick Reference — Environment Variables

```bash
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

# Email (resend.com — free 3000/month)
RESEND_API_KEY=re_

# Frontend
NEXT_PUBLIC_API_URL=https://api.afrixora.cd

# Domain
DOMAIN=afrixora.cd
CORS_ORIGINS=https://afrixora.cd

# Cloudflare Tunnel (expose afrixora.cd sans IP publique)
CLOUDFLARE_TUNNEL_TOKEN=
```

---

## Quick Reference — Useful Commands

```bash
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

# Deploy to CF1000 (or any Docker-capable server)
docker compose up -d --build
```

---

## Quick Reference — Migration vers un nouveau serveur

```bash
# === MIGRATION VERS UN NOUVEAU SERVEUR ===

# ÉTAPE 1 — Sur l'ancien serveur : sauvegarder les données
docker compose down
docker run --rm \
  -v afrixora_postgres_data:/data \
  -v $(pwd)/backup:/backup \
  alpine tar czf /backup/postgres_$(date +%Y%m%d).tar.gz /data

docker run --rm \
  -v afrixora_redis_data:/data \
  -v $(pwd)/backup:/backup \
  alpine tar czf /backup/redis_$(date +%Y%m%d).tar.gz /data

# ÉTAPE 2 — Sur le nouveau serveur : installer Docker
curl -fsSL https://get.docker.com | sh
docker compose version  # vérifier installation

# ÉTAPE 3 — Sur le nouveau serveur : restaurer
git clone <repo> afrixora-platform && cd afrixora-platform
cp /backup/*.tar.gz .
docker run --rm \
  -v afrixora_postgres_data:/data \
  -v $(pwd):/backup \
  alpine tar xzf /backup/postgres_YYYYMMDD.tar.gz -C /
# Idem pour redis

# ÉTAPE 4 — Configurer .env (seule modification requise)
cp .env.example .env
nano .env  # renseigner les variables, nouveau CLOUDFLARE_TUNNEL_TOKEN

# ÉTAPE 5 — Démarrer (identique sur tous les serveurs)
docker compose up -d
docker compose ps  # vérifier que tout est healthy
```

---

*© 2026 NAZGENIX SAS — AFRIXORA™ Intelligent Connected Systems*
*afrixora.cd · Lubumbashi, République Démocratique du Congo*
