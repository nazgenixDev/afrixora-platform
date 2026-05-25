# CLAUDE_RULES.md — AFRIXORA™ Development Rules for Claude Code

> These rules are **mandatory** and apply to every code generation task on this project.
> Non-compliance breaks the architecture and increases maintenance cost for a solo developer.
> When in doubt: do less, not more.

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
```
IoT Devices
  → Edge Gateway (Raspberry Pi)
    → MQTT Broker (Mosquitto)
      → Backend API (Express.js)
        → Database (PostgreSQL + TimescaleDB)
          → Web Dashboard (Next.js 14)
```

Each layer has a defined responsibility. Do not merge layers or bypass them.

---

## 3. Technology Stack (Do Not Change)

Only the technologies listed below are authorized. **Do not introduce new libraries, frameworks, ORMs, or services without explicit written approval from the developer.**

### Backend
| Technology | Version | Purpose |
|-----------|---------|---------|
| Node.js | 20 LTS | Runtime |
| Express.js | 4.x | HTTP framework |
| TypeScript | 5.x | Language |
| Prisma ORM | 5.x | PostgreSQL access |
| Zod | 3.x | Input validation |
| Socket.IO | 4.x | Real-time WebSocket |
| @socket.io/redis-adapter | latest | Redis adapter for Socket.IO scaling |
| express-rate-limit | latest | Brute-force protection — /auth/login (10 req/15min/IP) |
| Winston | — | Logging |
| Resend | — | Transactional email |
| pdfkit | — | PDF report generation |

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
| Traefik v3 | Internal reverse proxy + container routing |
| Grafana | Operational monitoring (datasource TimescaleDB) |
| Cloudflare Tunnel (cloudflared) | External HTTPS — no public IP needed |

> If a task seems to require a technology not in this list, stop and ask the developer before proceeding.

### Security constraints (mandatory)
- JWT signing algorithm : **HS256** (JWT_SECRET). RS256 prévu Phase 2.
- Rate limiting : `express-rate-limit` sur `POST /auth/login` — 10 requêtes / 15 min / IP.
- MQTT gateways distants : **WebSockets port 9001** (Cloudflare Tunnel). TCP 1883 = réseau Docker interne uniquement.

---

## 4. MVP Scope Restrictions

The MVP includes **only two modules**. Code must only be generated for these:

| Module | Status |
|--------|--------|
| ✅ AFRIXORA Building | In scope — build this |
| ✅ AFRIXORA Energy | In scope — build this |
| ❌ AFRIXORA Secure | Out of scope — do not generate |
| ❌ AFRIXORA Industry | Out of scope — do not generate |
| ❌ AFRIXORA Agro | Out of scope — do not generate |
| ❌ AFRIXORA Smart City | Out of scope — do not generate |
| ❌ AI / ML features | Out of scope — do not generate |

**If asked to generate code for an out-of-scope module:** refuse, state the reason, and redirect to the current active step in the development workflow.

**AFRIXORA Building covers:** buildings, zones, devices, device control, real-time state via Socket.IO.

**AFRIXORA Energy covers:** MQTT ingestion, TimescaleDB storage, energy analytics, threshold alerts, CSV/PDF exports.

---

## 5. Development Method

Code is generated **one step at a time**, following the workflow defined in `AFRIXORA_CONTEXT.md`.

**Rules:**
1. Never generate the entire system at once.
2. Each generation task must target one specific component (one route file, one service, one hook, etc.).
3. Every component must be testable in isolation before moving to the next step.
4. Follow this build order strictly:

```
Step 1 → Infrastructure & Auth
Step 2 → Building Module (CRUD buildings, zones, devices)
Step 3 → MQTT Ingestion (mqttWorker + TimescaleDB insert)
Step 4 → Energy Module (time-series queries + energy endpoints)
Step 5 → Automations (rule engine)
Step 6 → Frontend Dashboard
Step 7 → Reports + Production deployment
```

5. After generating each step, state clearly: what was built, what the validation criteria is, and what the next step is.
6. Do not scaffold Step 4 code while the developer is still working on Step 2.

---

## 6. Code Organization Rules

### Backend directory structure (fixed)
```
backend/src/
├── routes/       → HTTP handlers only (validate input → call service → return response)
├── services/     → All business logic and database access
├── middleware/   → authenticate.ts · authorize.ts · validate.ts · errorHandler.ts
└── utils/        → database.ts · redis.ts · logger.ts
```

**Rules:**
- Route handlers must not contain business logic. They call services, nothing more.
- Services must not import from routes. Dependency flows one way: routes → services.
- Validation happens in routes using Zod schemas before calling any service.
- Use `prisma` for all PostgreSQL queries.
- Use **raw SQL** for `sensor_readings` TimescaleDB queries only — Prisma does not manage that table.
- Errors are thrown from services and caught by the global `errorHandler.ts` middleware.
- Do not use inline `try/catch` in route handlers unless there is a specific reason.

### Frontend directory structure (fixed)
```
frontend/src/
├── app/          → Next.js 14 App Router pages
├── components/   → Reusable UI components (ui/, dashboard/, devices/, automations/, layout/)
├── hooks/        → useSocket.ts · useBuilding.ts · useAuth.ts
├── lib/          → api.ts · auth.ts · utils.ts
└── store/        → Zustand global store
```

---

## 7. Multi-Tenant Safety

AFRIXORA is a **multi-tenant SaaS platform**. Data isolation is a hard requirement, not optional.

**Rules that must be followed on every database operation:**

1. Every Prisma query must include `where: { tenantId }`.
2. `tenantId` is extracted **only from the verified JWT payload** — never from `req.body`, `req.params`, or `req.query`.
3. Never return data from one tenant to a user of another tenant.
4. When creating resources, always set `tenantId` from the JWT, not from client input.
5. TimescaleDB raw SQL queries must include `AND tenant_id = $1` in every `WHERE` clause.

**Example pattern (always follow this):**
```typescript
// ✅ Correct
const building = await prisma.building.findFirst({
  where: { id: buildingId, tenantId: req.user.tenantId }
});

// ❌ Wrong — missing tenantId filter
const building = await prisma.building.findFirst({
  where: { id: buildingId }
});
```

If a query is missing `tenantId`, it is a critical security bug. Do not generate such code.

---

## 8. MQTT Rules

MQTT is the communication layer between IoT devices and the backend. The topic structure is fixed and must never be changed.

### Topic convention (strict)
```
afrixora/{tenantId}/{buildingId}/devices/{deviceId}/readings   → sensor data (device → cloud)
afrixora/{tenantId}/{buildingId}/devices/{deviceId}/events     → events: motion, door (device → cloud)
afrixora/{tenantId}/{buildingId}/devices/{deviceId}/commands   → control commands (cloud → device)
afrixora/{tenantId}/{buildingId}/gateways/{gatewayId}/status   → gateway heartbeat
afrixora/system/api_status                                     → API health (retained)
```

**Rules:**
- Always use the exact topic format above. Never invent new topic structures.
- Commands are published **to** `.../commands`. Never respond to commands on a readings topic.
- The `mqttWorker.ts` subscribes to `afrixora/#` and routes messages by topic segments — do not change this routing logic without updating all downstream consumers.
- MQTT payloads must follow the JSON format defined in `AFRIXORA_CONTEXT.md` (Section 6).
- Do not add MQTT publish calls inside route handlers. MQTT publishing belongs in `services/`.

---

## 9. Code Quality

### Always do
- Use **TypeScript** everywhere. No `.js` files in `backend/src/` or `frontend/src/`.
- Use **`async/await`** for all asynchronous operations.
- Type all function parameters and return values explicitly.
- Keep functions short and focused on a single responsibility.
- Use named exports. Avoid anonymous default exports for services and utilities.
- Log meaningful messages with Winston. Include `tenantId` and `buildingId` in log context where relevant.

### Never do
- Use callbacks (`function(err, result)` style).
- Use `.then()` / `.catch()` chains — use `async/await` instead.
- Nest logic more than 3 levels deep. Extract to named functions.
- Use `any` type in TypeScript. Use `unknown` and narrow it, or define the type properly.
- Hardcode configuration values. Use environment variables via `process.env`.
- Commit `.env` files, secrets, or credentials to Git.
- Use `console.log` in production code. Use the Winston logger.

### Code pattern for route handlers
```typescript
// Every route handler follows this exact pattern
router.post('/:id/control', authenticate, authorize('OPERATOR'), async (req, res, next) => {
  try {
    const body = controlSchema.parse(req.body);           // 1. Validate with Zod
    const result = await deviceService.control(           // 2. Call service
      req.params.id,
      req.user.tenantId,
      body
    );
    res.json(result);                                     // 3. Return response
  } catch (err) {
    next(err);                                            // 4. Forward to errorHandler
  }
});
```

---

## 10. Final Instruction for Claude

Before generating any code for the AFRIXORA project, execute these steps in order:

```
1. Read AFRIXORA_CONTEXT.md fully.
2. Read AFRIXORA_RULES.md fully (this file).
3. Identify which development step is currently active (Steps 1–7 in AFRIXORA_CONTEXT.md §10).
4. Generate only the code requested for that specific step.
5. Do not generate code for future steps.
6. Do not modify the architecture.
7. Do not introduce unlisted technologies.
```

**After each code generation, confirm:**
- [ ] All database queries include `tenantId`
- [ ] No new technologies were introduced
- [ ] Code is scoped to Building or Energy module only
- [ ] TypeScript types are explicit — no `any`
- [ ] MQTT topics follow the defined convention
- [ ] Business logic is in `services/`, not in route handlers

> If the developer's request conflicts with these rules, **do not comply silently**.
> State the conflict clearly, explain why it violates the rules, and propose a compliant alternative.

---

## 11. Docker Portability Rules

AFRIXORA™ doit rester portable sur n'importe quel serveur Docker. Ces règles s'appliquent à tous les fichiers d'infrastructure générés.

### Règles obligatoires

**1. Zéro chemin absolu hôte.** Ne jamais monter de volumes avec des chemins absolus spécifiques à la machine.

```yaml
# ❌ Interdit — chemin spécifique au CF1000
volumes:
  - /mnt/nvme0/afrixora/postgres:/var/lib/postgresql/data

# ✅ Correct — volume Docker nommé, portable partout
volumes:
  - afrixora_postgres_data:/var/lib/postgresql/data
```

**2. Volumes Docker nommés obligatoires** pour toutes les données persistantes : postgres, redis, mosquitto, grafana. Déclarés dans la section `volumes:` racine du `docker-compose.yml`.

**3. Zéro configuration réseau hôte.** Ne jamais utiliser `network_mode: host`. Toujours utiliser le réseau Docker interne `afrixora_net` de type bridge.

**4. Zéro port exposé inutilement.** PostgreSQL, Redis et Mosquitto ne sont **jamais** exposés sur l'interface hôte.

```yaml
# ❌ Interdit — PostgreSQL exposé sur le réseau hôte
postgres:
  ports:
    - "5432:5432"

# ✅ Correct — accessible uniquement via réseau Docker
postgres:
  expose:
    - "5432"
```

**5. Variables d'environnement uniquement.** Toute valeur qui peut changer selon la machine (domaine, mots de passe, tokens, URLs) doit venir du fichier `.env` via `${VAR}`. Ne jamais hardcoder ces valeurs dans `docker-compose.yml`.

**6. Images officielles avec tag explicite.** Ne jamais utiliser une image sans tag de version.

```yaml
# ❌ Interdit
image: postgres:latest

# ✅ Correct
image: timescale/timescaledb:latest-pg15
```

**7. Healthchecks obligatoires** sur postgres et redis. Les autres services utilisent `depends_on` avec condition `service_healthy` pour garantir le bon ordre de démarrage, quelle que soit la rapidité du serveur.

**8. `restart: unless-stopped`** sur tous les services. Garantit le redémarrage automatique après coupure SNEL ou reboot du serveur, sans intervention manuelle.

### Ce que cette règle permet

Un développeur peut migrer AFRIXORA™ vers un nouveau serveur en moins d'une heure, avec zéro connaissance de la configuration interne. C'est un actif commercial : proposer cette garantie aux clients enterprise justifie un SLA premium.

---

*AFRIXORA™ — © 2026 NAZGENIX SAS · afrixora.cd · Lubumbashi, RDC*
*This file is part of the project documentation. Keep this file in the `docs/` folder alongside `AFRIXORA_CONTEXT.md`.*
