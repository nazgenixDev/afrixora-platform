# AFRIXORA — Architecture Decision Records (ADR)

> Documente les choix techniques structurants pour le MVP Phase 1.
> Maintenu par NAZGENIX SAS — développeur unique.

---

## ADR-001 — Authentification par cookie httpOnly (JWT HS256)

**Date** : Mai 2026  
**Décision** : Les tokens JWT sont stockés dans des cookies `httpOnly` posés par le backend.

**Contexte** :
- Sécurité XSS : un token en `localStorage` est accessible à tout script JavaScript malveillant.
- Production cible : domaine unique via Cloudflare Tunnel + Traefik.

**Détail** :
- `POST /auth/login` → backend pose `access_token` (15 min) et `refresh_token` (7 jours) en cookies `httpOnly`.
- Middleware `authenticate.ts` lit le cookie ou le header `Authorization` (fallback API keys).
- En développement cross-port (`localhost:3000` → `localhost:4000`), le navigateur bloque le cookie `SameSite=Lax`. Solution temporaire : le backend renvoie aussi `accessToken` dans le JSON, stocké dans `localStorage` et envoyé en header `Authorization`.

**Conséquences** :
- En production (même domaine), seul le cookie est utilisé.
- Le refresh token est renouvelé via `POST /auth/refresh` (cookie `refresh_token`).
- Logout → `jwtVersion++` dans la DB, cookie clear.

---

## ADR-002 — Client MQTT unique

**Date** : Juin 2026  
**Décision** : Un seul client MQTT partagé dans `mqttWorker.ts`.

**Contexte initial** :
- Deux connexions MQTT distinctes coexistaient : `mqttWorker.ts` (ingestion + souscriptions) et `mqttClient.ts` (publications devices/automatisations).
- Problèmes : double connexion, deux clientId, gaspillage de ressources.

**Décision** :
- `mqttClient.ts` supprimé.
- Fonction `publishMqtt(topic, payload)` exportée par `mqttWorker.ts`.
- `deviceService.ts` et `automationEngine.ts` importent `publishMqtt`.

**Architecture résultante** :
```
mqttWorker.ts
├── mqtt.connect()        → 1 client unique
├── connectMQTT(io)        → souscriptions + ingestion
├── publishMqtt(topic, p)  → publications
└── bufferMessage()        → Redis offline buffer
```

---

## ADR-003 — Stratégie de pagination

**Date** : Juin 2026  
**Décision** : Pagination par `page` et `limit` sur toutes les listes.

**Contexte** :
- Sans pagination, `findMany()` sans `take` peut retourner des milliers d'enregistrements.
- Impact performance PostgreSQL et mémoire.

**Implémentation** :
- Format standard : `{ page: number, limit: number }` (défaut : `page=1, limit=50`).
- Retour structuré : `{ data: T[], total: number, page: number, totalPages: number }`.
- Endpoints paginés :
  - `GET /buildings` → `buildingService.findAll`
  - `GET /users` → `prisma.user.findMany` + count
  - `GET /readings?deviceId=...` → `energyService.getReadings` (LIMIT/OFFSET SQL brut)
  - `GET /devices` → `deviceService.findAll`

**Cas non paginés (volontairement)** :
- `GET /alerts` : limité à ~100 alertes actives max.
- `GET /energy/summary`, `/consumption`, `/by-zone` : agrégats TimescaleDB, peu de lignes.

---

## ADR-004 — Logger unique (Winston backend, custom frontend)

**Date** : Juin 2026  
**Décision** : Winston `info` level en production, logger structuré frontend.

**Backend** :
- Niveau `'info'` en production (traçabilité des connexions, actions).
- Fichiers : `logs/error.log`, `logs/combined.log`.
- Pas de `console.log` dans le code de production.

**Frontend** :
- `frontend/src/lib/logger.ts` : wrapper avec timestamps ISO.
- Méthodes : `debug`, `info`, `warn`, `error`.
- `debug` masqué en production.

---

## ADR-005 — Validation Zod systématique

**Date** : Juin 2026  
**Décision** : Toutes les routes POST/PATCH utilisent `validate(schema)` middleware.

**Routes validées** :
- `POST /auth/login` → `loginSchema`
- `POST /users` → `createUserSchema`
- `PATCH /users/:id/role` → `changeRoleSchema`
- `PATCH /users/:id/reset-password` → `resetPasswordSchema`
- `PATCH /users/change-password` → `changePasswordSchema`
- `POST /buildings` → `createBuildingSchema`
- `PATCH /buildings/:id` → `updateBuildingSchema`
- `POST /buildings/:id/zones` → `createZoneSchema`

**Erreurs Zod** → interceptées par `errorHandler.ts` → 400 JSON structuré.

---

## ADR-006 — Offline-first : buffer Redis MQTT

**Date** : Mai 2026  
**Décision** : Les lectures MQTT sont bufferisées dans Redis si TimescaleDB est indisponible.

**Mécanisme** :
- Échec `INSERT INTO sensor_readings` → `LPUSH` dans Redis (`mqtt_buffer:{tenantId}`).
- Job toutes les 10 secondes : `RPOP` + retry INSERT.
- Max 10 tentatives par message, puis discard.
- Limite 1000 messages par tenant (LTRIM).