
---

## 2. AFRIXORA_RULES.md (Version 2.0)

```markdown
# CLAUDE_RULES.md — AFRIXORA™ Development Rules for Claude Code

> These rules are **mandatory** and apply to every code generation task on this project.
> Non-compliance breaks the architecture and increases maintenance cost for a solo developer.
> When in doubt: do less, not more.
> **Version 2.0 — Updated after MVP completion (May 2026)**

---

## 1. General Principles

- AFRIXORA is built and maintained by **a single developer**. Every decision must reflect that reality.
- Architecture must remain **simple, maintainable, modular, and monolithic**.
- Each piece of generated code must solve one specific problem. No speculative abstractions.
- Never add complexity that is not required by a current MVP task.
- Prefer boring, readable code over clever, compact code.
- If a requirement is ambiguous, ask for clarification before generating code.

---

## 2. Architecture Rules

The backend is a **single monolithic Express.js application**. It will not be split.

**Forbidden patterns — do not implement under any circumstances:**
- Microservices or separate deployable services
- Service mesh (Istio, Consul, Linkerd, etc.)
- CQRS or Event Sourcing
- Message queues (RabbitMQ, Kafka, SQS) — MQTT is already the message layer
- Saga pattern or distributed transactions
- GraphQL — REST only
- gRPC — REST only

**System layers (fixed, do not restructure):**


---

## 3. Technology Stack (Do Not Change)

### Backend
| Technology | Version | Purpose |
|-----------|---------|---------|
| Node.js | 20 LTS | Runtime |
| Express.js | 4.x | HTTP framework |
| TypeScript | 5.x | Language |
| Prisma ORM | 5.x | PostgreSQL access |
| Zod | 3.x | Input validation |
| Socket.IO | 4.x | Real-time WebSocket |
| express-rate-limit | latest | Brute-force protection |
| Winston | — | Logging |
| Resend | — | Transactional email |
| pdfkit | — | PDF report generation |
| bcryptjs | — | Password hashing |
| jsonwebtoken | — | JWT signing/verification |

### Frontend
| Technology | Purpose |
|-----------|---------|
| Next.js 14 (App Router) | Framework |
| TypeScript | Language |
| Tailwind CSS | Styling |
| shadcn/ui | Component library |
| Zustand | Global state |
| Recharts | Data visualization |
| Axios | HTTP client |
| Socket.IO client | Real-time events |
| Lucide React | Icons |

### Data
| Technology | Version | Purpose |
|-----------|---------|---------|
| PostgreSQL | 15 | Primary database |
| TimescaleDB | 2.x | IoT time-series storage |
| Redis | 7 | Cache + Socket.IO adapter |

### IoT
| Technology | Purpose |
|-----------|---------|
| MQTT | IoT communication protocol |
| Mosquitto | MQTT broker |

### Infrastructure
| Technology | Purpose |
|-----------|---------|
| Docker + Docker Compose | Containerization |
| Traefik v3 | Internal reverse proxy |
| Grafana | Operational monitoring |
| Cloudflare Tunnel (cloudflared) | External HTTPS |

---

## 4. MVP Scope Restrictions

### ✅ In scope
- AFRIXORA Building: buildings, zones, devices, device control, Socket.IO
- AFRIXORA Energy: MQTT ingestion, TimescaleDB, analytics, alerts, CSV/PDF exports
- Administration: user management (RBAC), API keys, request logs, settings

### ❌ Out of scope
- Secure · Industry · Agro · Smart City · AI / ML

---

## 5. Development Method

Code is generated **one step at a time**, following the workflow defined in `AFRIXORA_CONTEXT.md`.

1. Never generate the entire system at once.
2. Each generation task must target one specific component.
3. Every component must be testable in isolation.
4. Follow the build order strictly (Steps 1–7).
5. After generating each step, state clearly: what was built, validation criteria, and next step.
6. Do not scaffold future steps while working on current step.

---

## 6. Code Organization Rules

### Backend directory structure (fixed)

backend/src/
├── routes/ → HTTP handlers only (validate → call service → return response)
├── services/ → All business logic and database access
├── middleware/ → authenticate.ts · authorize.ts · validate.ts · errorHandler.ts · requestLogger.ts
└── utils/ → database.ts · redis.ts · logger.ts


**Rules:**
- Route handlers must not contain business logic.
- Validation happens in routes using Zod schemas.
- Use `prisma` for all PostgreSQL queries.
- Use **raw SQL** only for `sensor_readings` TimescaleDB queries.
- Errors are thrown from services and caught by `errorHandler.ts`.
- Do not use inline `try/catch` in route handlers unless necessary.

### Frontend directory structure (fixed)

frontend/src/
├── app/ → Next.js 14 App Router pages
├── components/ → Reusable UI components (ui/, dashboard/, devices/, layout/, users/)
├── hooks/ → useSocket.ts
├── lib/ → api.ts · auth.ts · jwt.ts · utils.ts
├── store/ → Zustand global store
└── types/ → Shared TypeScript interfaces


---

## 7. Multi-Tenant Safety

1. Every Prisma query must include `where: { tenantId }`.
2. `tenantId` is extracted **only from the verified JWT payload**.
3. Never return data from one tenant to a user of another tenant.
4. When creating resources, set `tenantId` from the JWT, not client input.
5. TimescaleDB raw SQL queries must include `AND tenant_id = $1`.

---

## 8. MQTT Rules

### Topic convention (strict)

afrixora/{tenantId}/{buildingId}/devices/{deviceId}/readings → sensor data
afrixora/{tenantId}/{buildingId}/devices/{deviceId}/events → events
afrixora/{tenantId}/{buildingId}/devices/{deviceId}/commands ← API commands
afrixora/{tenantId}/{buildingId}/gateways/{gatewayId}/status → gateway heartbeat
afrixora/system/api_status → API health


---

## 9. Code Quality

### Always do
- Use **TypeScript** everywhere. No `.js` files.
- Use **`async/await`** for all asynchronous operations.
- Type all function parameters and return values explicitly.
- Keep functions short and focused.
- Use named exports.
- Log meaningful messages with Winston.

### Never do
- Use callbacks.
- Use `.then()` / `.catch()` chains.
- Nest logic more than 3 levels deep.
- Use `any` type. Use `unknown` and narrow it.
- Hardcode configuration values. Use environment variables.
- Commit `.env` files, secrets, or credentials to Git.
- Use `console.log` in production code.

---

## 10. New Patterns Established During MVP

### JWT Profile Restoration
When a user reloads the page, restore their profile from the JWT payload:
```typescript
const payload = decodeJwtPayload(token);
if (payload) {
  useStore.getState().setAuth({ id: payload.userId, role: payload.role, tenantId: payload.tenantId }, token);
}
// If email/name missing, fetch from GET /users/me

Request Logging Middleware
All authenticated requests are logged to ApiLog table:

app.use("/api/v1", requestLogger);

RBAC Sidebar Filtering
Sidebar navigation items are filtered based on user role:

const isAdmin = ['SUPER_ADMIN', 'TENANT_ADMIN'].includes(role);
const navItems = isAdmin ? [...baseNav, ...adminNav] : baseNav;

Password Reset Flow
Admins reset user passwords via PATCH /users/:id/reset-password

Users change own password via PATCH /users/change-password

Both endpoints increment jwtVersion to invalidate existing tokens

11. Docker Portability Rules
Zéro chemin absolu hôte. Use named Docker volumes.

Volumes Docker nommés obligatoires for all persistent data.

Zéro configuration réseau hôte. Use internal Docker network afrixora_net.

Zéro port exposé inutilement. PostgreSQL, Redis, Mosquitto use expose, not ports.

Variables d'environnement uniquement. All values from .env.

Images officielles avec tag explicite.

Healthchecks obligatoires on postgres and redis.

restart: unless-stopped on all services.

12. Demo Script
Use start-demo.sh to launch the full stack with demo data:

./start-demo.sh
