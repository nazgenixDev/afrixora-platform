# AFRIXORA_MVP_PROMPTS.md — Guide Opérationnel MVP

> Ce document contient la suite complète des prompts à envoyer à Claude Code pour développer le MVP AFRIXORA étape par étape.
> Chaque phase doit être complétée et validée avant de passer à la suivante.
> Ne jamais envoyer plusieurs phases en même temps.

---

## Comment utiliser ce document

1. Copier le prompt de la phase en cours dans Claude Code.
2. Vérifier les critères de validation avant de passer à la phase suivante.
3. Conserver les fichiers `AFRIXORA_CONTEXT.md` et `AFRIXORA_RULES.md` dans le dossier `docs/` du projet afin que Claude Code puisse les lire avant chaque génération de code.

---

## PHASE 1 — Initialisation du projet

**Objectif :** Créer l'arborescence monorepo de base du projet AFRIXORA.

**Ce que Claude Code doit produire :**
- Structure complète des dossiers racine
- Fichiers de configuration racine (`.gitignore`, `.env.example`, `README.md`)
- `docker-compose.yml` et `docker-compose.dev.yml` vides mais structurés
- Dossier `docs/` créé s'il n'existe pas — **ne pas recréer ni modifier `AFRIXORA_CONTEXT.md` et `AFRIXORA_RULES.md` qui existent déjà**

**Critères de validation :**
- [ ] L'arborescence correspond à celle définie dans `AFRIXORA_CONTEXT.md` (§3.1)
- [ ] Le fichier `.env` est dans `.gitignore`
- [ ] Les dossiers `backend/`, `frontend/`, `gateway/`, `docs/`, `infrastructure/` existent

---

```
Lis entièrement les fichiers suivants avant de faire quoi que ce soit :
- docs/AFRIXORA_CONTEXT.md
- docs/AFRIXORA_RULES.md

Tu travailles sur le projet AFRIXORA développé par NAZGENIX SAS.
Ce projet est développé et maintenu par un seul développeur.
N'implémente que ce qui est demandé dans cette phase. Ne génère pas de code pour les phases suivantes.

PHASE 1 — Initialisation du projet

Crée l'arborescence monorepo complète du projet en respectant la structure définie dans AFRIXORA_CONTEXT.md (section 3.1).

Structure attendue :
afrixora-platform/
├── backend/
├── frontend/
├── gateway/
├── infrastructure/
│   ├── scripts/
│   └── monitoring/
├── docs/
│   ├── AFRIXORA_CONTEXT.md   ← fichier existant, NE PAS recréer ni modifier
│   └── AFRIXORA_RULES.md     ← fichier existant, NE PAS recréer ni modifier
├── docker-compose.yml
├── docker-compose.dev.yml
├── .env.example
├── .gitignore
└── README.md

IMPORTANT sur le dossier docs/ :
- Créer le dossier docs/ uniquement s'il n'existe pas encore.
- Les fichiers AFRIXORA_CONTEXT.md et AFRIXORA_RULES.md existent déjà dans ce dossier.
- Ne pas les recréer, ne pas les modifier, ne pas les écraser.
- Se contenter de s'assurer que le dossier docs/ est bien présent dans la structure.

Produis :
1. La liste exacte des commandes shell pour créer cette structure (mkdir, touch).
2. Le contenu du fichier .gitignore (inclure .env, node_modules, dist, .next, *.log).
3. Le contenu du fichier .env.example avec toutes les variables listées dans AFRIXORA_CONTEXT.md (Quick Reference — Environment Variables), sans aucune valeur réelle.
4. Un README.md minimal avec le nom du projet, la stack, et la commande de démarrage.
5. Un docker-compose.yml squelette avec les services : postgres, redis, mosquitto, api, frontend, traefik, grafana, cloudflared — sans configuration complète pour l'instant.

Ne génère pas encore le code backend ou frontend. Cette phase concerne uniquement la structure du projet.
```

---

## PHASE 2 — Fondation du backend

**Objectif :** Initialiser le backend Node.js + Express + TypeScript avec la structure de dossiers complète.

**Ce que Claude Code doit produire :**
- `backend/package.json` avec uniquement les dépendances de fondation
- `backend/tsconfig.json` configuré pour Node.js 20
- `backend/src/server.ts` minimal avec Express + Socket.IO
- Structure `src/routes/`, `src/services/`, `src/middleware/`, `src/utils/`
- `backend/Dockerfile`

**Critères de validation :**
- [ ] `cd backend && npm install` s'exécute sans erreur
- [ ] `npm run dev` démarre le serveur sur le port 4000
- [ ] `GET http://localhost:4000/health` retourne `{ status: "ok" }`

---

```
Lis entièrement les fichiers suivants avant de faire quoi que ce soit :
- docs/AFRIXORA_CONTEXT.md
- docs/AFRIXORA_RULES.md

Tu travailles sur le projet AFRIXORA développé par NAZGENIX SAS.
Ce projet est développé et maintenu par un seul développeur.
N'implémente que ce qui est demandé dans cette phase. Ne génère pas de code pour les phases suivantes.

PHASE 2 — Fondation du backend

Initialise le backend Node.js + Express + TypeScript dans le dossier backend/.

Produis exactement :

1. backend/package.json
   - Scripts : dev (ts-node-dev), build (tsc), start (node dist/server.js), lint, typecheck
   - Dépendances de fondation uniquement : express, socket.io, zod, winston, cors, helmet
   - DevDependencies : typescript, ts-node-dev, @types/express, @types/node, eslint, @typescript-eslint/eslint-plugin, @typescript-eslint/parser
   - Ne pas inclure dans cette phase : prisma, jsonwebtoken, bcryptjs, mqtt, redis, ioredis, resend, pdfkit
     (ces dépendances seront ajoutées dans leurs phases respectives)

2. backend/tsconfig.json
   - target: ES2022, module: commonjs, strict: true, outDir: dist, rootDir: src

3. backend/src/server.ts
   - Express app avec middleware : cors, helmet, express.json()
   - Socket.IO attaché au serveur HTTP
   - Route GET /health retournant { status: "ok", timestamp: new Date() }
   - Montage des routes avec préfixe /api/v1 (vides pour l'instant, juste les imports commentés)
   - Écoute sur process.env.PORT || 4000

4. Fichiers vides avec export vide pour préparer la structure :
   - src/routes/.gitkeep
   - src/services/.gitkeep
   - src/middleware/.gitkeep
   - src/utils/.gitkeep

5. backend/src/utils/logger.ts
   - Logger Winston avec niveau info en développement, warn en production
   - Format : timestamp + level + message

6. backend/Dockerfile
   - Multi-stage : builder (npm run build) + runner (node dist/server.js)
   - Image node:20-alpine

Commandes d'installation et de test à inclure à la fin.
```

---

## PHASE 3 — Base de données & Prisma

**Objectif :** Configurer Prisma, connecter PostgreSQL, générer le schéma complet et créer la hypertable TimescaleDB.

**Ce que Claude Code doit produire :**
- `backend/prisma/schema.prisma` complet (tous les modèles de AFRIXORA_CONTEXT.md)
- `infrastructure/scripts/01_schema.sql` pour la hypertable `sensor_readings`
- `infrastructure/scripts/02_seed.sql` avec données de démonstration
- `backend/src/utils/database.ts` avec le pool PostgreSQL

**Critères de validation :**
- [ ] `npx prisma migrate dev` s'exécute sans erreur
- [ ] Toutes les tables sont créées dans PostgreSQL
- [ ] La hypertable `sensor_readings` est créée dans TimescaleDB
- [ ] `SELECT * FROM timescaledb_information.hypertables;` retourne `sensor_readings`

---

```
Lis entièrement les fichiers suivants avant de faire quoi que ce soit :
- docs/AFRIXORA_CONTEXT.md
- docs/AFRIXORA_RULES.md

Tu travailles sur le projet AFRIXORA développé par NAZGENIX SAS.
Ce projet est développé et maintenu par un seul développeur.
N'implémente que ce qui est demandé dans cette phase. Ne génère pas de code pour les phases suivantes.

PHASE 3 — Base de données & Prisma

Génère la couche base de données complète du projet.

Produis exactement :

1. backend/prisma/schema.prisma
   - Générateur client Prisma standard
   - Datasource PostgreSQL via env("DATABASE_URL")
   - Modèles complets tels que définis dans AFRIXORA_CONTEXT.md (section 5) :
     Tenant, User, Building, Zone, Device, DeviceState, Automation, Alert, Gateway
   - Tous les enums : Plan, Role, ZoneType, DeviceType, Protocol, AlertType, Severity
   - Index sur tenantId pour chaque table concernée
   - Respecter strictement le schéma de AFRIXORA_CONTEXT.md sans ajout ni modification

2. infrastructure/scripts/01_schema.sql
   - Création de la table sensor_readings avec les colonnes : time, tenant_id, device_id, metric, value, unit
   - Appel SELECT create_hypertable('sensor_readings', 'time')
   - Index sur (device_id, time DESC)
   - Index sur (tenant_id, time DESC)

3. infrastructure/scripts/02_seed.sql
   - Insertion d'un tenant de démonstration
   - Insertion d'un utilisateur admin (mot de passe hashé bcrypt)
   - Insertion d'un bâtiment de démonstration
   - Insertion de 3 zones (Bureau, Salle de réunion, Couloir)
   - Insertion de 4 appareils (LIGHT, ENERGY_METER, SENSOR, THERMOSTAT)

4. backend/src/utils/database.ts
   - Pool PostgreSQL avec pg (pour les requêtes raw TimescaleDB)
   - Export de la fonction query(text, params)
   - Export de l'instance prisma (PrismaClient singleton)

5. Mise à jour de backend/package.json si pg n'est pas déjà dans les dépendances.

Inclure les commandes pour exécuter les migrations et le seed.
```

---

## PHASE 4 — Authentification

**Objectif :** Implémenter le système d'authentification JWT HS256 avec gestion multi-tenant.

**Ce que Claude Code doit produire :**
- `src/routes/auth.ts` avec login / refresh / logout
- `src/middleware/authenticate.ts` avec vérification JWT + `jwtVersion`
- `src/middleware/authorize.ts` avec RBAC par rôle
- `src/services/authService.ts` avec la logique métier

**Critères de validation :**
- [ ] `POST /api/v1/auth/login` avec email/password valide retourne `access_token` et `refresh_token`
- [ ] `GET /api/v1/buildings` sans token retourne 401
- [ ] `POST /api/v1/auth/logout` invalide le token (jwtVersion incrémenté)
- [ ] Le `tenantId` est présent dans le payload du JWT décodé

---

```
Lis entièrement les fichiers suivants avant de faire quoi que ce soit :
- docs/AFRIXORA_CONTEXT.md
- docs/AFRIXORA_RULES.md

Tu travailles sur le projet AFRIXORA développé par NAZGENIX SAS.
Ce projet est développé et maintenu par un seul développeur.
N'implémente que ce qui est demandé dans cette phase. Ne génère pas de code pour les phases suivantes.

PHASE 4 — Authentification JWT

Implémente le système d'authentification complet.

Produis exactement :

1. backend/src/services/authService.ts
   - Fonction login(email, password) : vérifie les credentials, retourne access_token (15m) + refresh_token (7d)
   - Fonction refreshToken(token) : vérifie le refresh token, retourne un nouvel access_token
   - Fonction logout(userId) : incrémente jwtVersion dans la base pour invalider tous les tokens
   - JWT payload doit contenir : { userId, tenantId, role, jwtVersion }
   - Utiliser bcryptjs pour vérifier le mot de passe

2. backend/src/middleware/authenticate.ts
   - Extraire le token Bearer du header Authorization
   - Vérifier la signature JWT avec JWT_SECRET
   - Vérifier que jwtVersion dans le token correspond à jwtVersion en base (sinon 401)
   - Attacher req.user = { userId, tenantId, role } pour les routes suivantes
   - Retourner 401 avec message clair si token invalide ou expiré

3. backend/src/middleware/authorize.ts
   - Middleware factory : authorize('OPERATOR') ou authorize(['ADMIN', 'OPERATOR'])
   - Vérifier req.user.role contre les rôles autorisés
   - Retourner 403 si rôle insuffisant

4. backend/src/middleware/errorHandler.ts
   - Global error handler Express (4 paramètres)
   - Gérer les erreurs Zod (400), les erreurs Prisma courantes (409), les erreurs JWT (401)
   - Logger l'erreur avec Winston
   - Retourner { error: string, code: string } en JSON

5. backend/src/routes/auth.ts
   - POST /login : validation Zod { email, password }, appel authService.login
   - POST /refresh : validation Zod { refreshToken }, appel authService.refreshToken
   - POST /logout : route protégée (authenticate), appel authService.logout

6. Mise à jour de backend/src/server.ts
   - Monter auth.ts sur /api/v1/auth
   - Monter errorHandler en dernier middleware

Inclure un exemple de test avec curl pour chaque endpoint.
```

---

## PHASE 5 — Module Building

**Objectif :** Implémenter le CRUD complet des bâtiments et des zones avec isolation multi-tenant stricte.

**Ce que Claude Code doit produire :**
- `src/services/buildingService.ts`
- `src/routes/buildings.ts`
- Tous les endpoints CRUD buildings + zones

**Critères de validation :**
- [ ] `POST /api/v1/buildings` crée un bâtiment et l'associe au tenant du JWT
- [ ] `GET /api/v1/buildings` retourne uniquement les bâtiments du tenant authentifié
- [ ] Un utilisateur d'un tenant A ne peut pas accéder aux bâtiments du tenant B
- [ ] La validation Zod rejette les payloads invalides avec un message d'erreur clair

---

```
Lis entièrement les fichiers suivants avant de faire quoi que ce soit :
- docs/AFRIXORA_CONTEXT.md
- docs/AFRIXORA_RULES.md

Tu travailles sur le projet AFRIXORA développé par NAZGENIX SAS.
Ce projet est développé et maintenu par un seul développeur.
N'implémente que ce qui est demandé dans cette phase. Ne génère pas de code pour les phases suivantes.

PHASE 5 — Module Building (bâtiments et zones)

Implémente le CRUD complet des bâtiments et zones.

Produis exactement :

1. backend/src/services/buildingService.ts
   - findAll(tenantId) : liste tous les bâtiments du tenant avec count de zones et devices
   - findById(id, tenantId) : détail bâtiment + zones + nombre de devices par zone
   - create(data, tenantId) : création avec tenantId forcé depuis le JWT
   - update(id, data, tenantId) : modification avec vérification d'appartenance au tenant
   - softDelete(id, tenantId) : isActive = false, jamais DELETE réel
   - findZones(buildingId, tenantId) : liste des zones du bâtiment
   - createZone(buildingId, data, tenantId) : création zone avec vérification bâtiment

   IMPORTANT : chaque requête Prisma doit inclure tenantId dans le where. Ne jamais omettre ce filtre.

2. backend/src/routes/buildings.ts
   - GET    /           → authenticate + buildingService.findAll
   - POST   /           → authenticate + authorize('BUILDING_ADMIN') + validation Zod + buildingService.create
   - GET    /:id        → authenticate + buildingService.findById
   - PATCH  /:id        → authenticate + authorize('BUILDING_ADMIN') + validation Zod + buildingService.update
   - DELETE /:id        → authenticate + authorize('TENANT_ADMIN') + buildingService.softDelete
   - GET    /:id/zones  → authenticate + buildingService.findZones
   - POST   /:id/zones  → authenticate + authorize('BUILDING_ADMIN') + validation Zod + buildingService.createZone

3. Schémas Zod pour :
   - createBuildingSchema : { name, address, city?, unitsCount? }
   - updateBuildingSchema : partial de createBuildingSchema
   - createZoneSchema : { name, floor, type }

4. Mise à jour de backend/src/server.ts pour monter buildings.ts sur /api/v1/buildings.

Inclure des exemples curl pour tester chaque endpoint avec un token JWT valide.
```

---

## PHASE 6 — Module Devices

**Objectif :** Implémenter la gestion des appareils IoT, leurs états et l'API de contrôle via MQTT.

**Ce que Claude Code doit produire :**
- `src/services/deviceService.ts`
- `src/routes/devices.ts`
- Endpoint `POST /devices/:id/control` qui publie sur MQTT

**Critères de validation :**
- [ ] `POST /api/v1/devices` enregistre un appareil avec son `tenantId` et `buildingId`
- [ ] `GET /api/v1/devices/:id` retourne l'état courant depuis `DeviceState`
- [ ] `POST /api/v1/devices/:id/control` publie un message MQTT sur le bon topic
- [ ] La commande MQTT respecte la convention de topic de `AFRIXORA_CONTEXT.md`

---

```
Lis entièrement les fichiers suivants avant de faire quoi que ce soit :
- docs/AFRIXORA_CONTEXT.md
- docs/AFRIXORA_RULES.md

Tu travailles sur le projet AFRIXORA développé par NAZGENIX SAS.
Ce projet est développé et maintenu par un seul développeur.
N'implémente que ce qui est demandé dans cette phase. Ne génère pas de code pour les phases suivantes.

PHASE 6 — Module Devices (appareils IoT)

Implémente la gestion complète des appareils.

Produis exactement :

1. backend/src/utils/mqttClient.ts
   - Client MQTT singleton connecté à process.env.MQTT_URL
   - Authentification avec MQTT_API_USER et MQTT_API_PASSWORD
   - Reconnexion automatique (reconnectPeriod: 5000)
   - Export de la fonction publish(topic, payload)
   - Logger Winston sur connect/disconnect/error

2. backend/src/services/deviceService.ts
   - findAll(tenantId, filters: { buildingId?, zoneId?, type? }) : liste avec DeviceState joint
   - findById(id, tenantId) : détail + état courant
   - create(data, tenantId) : enregistrement avec tenantId forcé
   - update(id, data, tenantId) : modification config
   - remove(id, tenantId) : suppression avec vérification d'appartenance
   - control(id, tenantId, command) :
     → vérifier appartenance au tenant
     → construire le topic : afrixora/{tenantId}/{buildingId}/devices/{id}/commands
     → publier via mqttClient.publish
     → retourner { success: true, topic, command }
   - getHistory(id, tenantId, limit) : historique des états depuis DeviceState

   IMPORTANT : toutes les requêtes Prisma doivent inclure tenantId.

3. backend/src/routes/devices.ts
   - GET    /              → authenticate + deviceService.findAll (query params: buildingId, zoneId, type)
   - POST   /              → authenticate + authorize('BUILDING_ADMIN') + validation Zod + deviceService.create
   - GET    /:id           → authenticate + deviceService.findById
   - PATCH  /:id           → authenticate + authorize('BUILDING_ADMIN') + deviceService.update
   - DELETE /:id           → authenticate + authorize('BUILDING_ADMIN') + deviceService.remove
   - POST   /:id/control   → authenticate + authorize('OPERATOR') + validation Zod + deviceService.control
   - GET    /:id/history   → authenticate + deviceService.getHistory

4. Schémas Zod :
   - createDeviceSchema : { name, type, buildingId, zoneId?, protocol?, macAddress?, config? }
   - controlSchema : { command, params? }

5. Mise à jour de server.ts pour monter devices.ts sur /api/v1/devices.

Inclure un exemple curl pour POST /:id/control et montrer le message MQTT attendu.
```

---

## PHASE 7 — Intégration MQTT

**Objectif :** Implémenter le worker MQTT qui ingère les données des capteurs, les stocke dans TimescaleDB et diffuse les événements en temps réel via Socket.IO.

**Ce que Claude Code doit produire :**
- `src/services/mqttWorker.ts` complet
- Insertion dans `sensor_readings` (TimescaleDB)
- Mise à jour `isOnline` et `lastSeen` des devices via Prisma
- Broadcast Socket.IO vers la room du bâtiment

**Critères de validation :**
- [ ] Un message MQTT publié sur `afrixora/{tenantId}/{buildingId}/devices/{deviceId}/readings` est inséré dans `sensor_readings`
- [ ] `devices.isOnline` passe à `true` après réception d'un message
- [ ] Le client frontend connecté à la room `building:{buildingId}` reçoit l'event `device:reading`
- [ ] Un message MQTT invalide (JSON malformé) n'est pas inséré et est loggué

---

```
Lis entièrement les fichiers suivants avant de faire quoi que ce soit :
- docs/AFRIXORA_CONTEXT.md
- docs/AFRIXORA_RULES.md

Tu travailles sur le projet AFRIXORA développé par NAZGENIX SAS.
Ce projet est développé et maintenu par un seul développeur.
N'implémente que ce qui est demandé dans cette phase. Ne génère pas de code pour les phases suivantes.

PHASE 7 — Intégration MQTT (mqttWorker)

Implémente le worker MQTT qui ingère les données en temps réel.

Produis exactement :

1. backend/src/services/mqttWorker.ts
   - Déclarer le client MQTT en variable de module (let mqttClient)
   - Exporter getMqttClient() : retourne le client initialisé ou lève une erreur si non initialisé
   - Exporter connectMQTT(io: Server) : initialise mqttClient et démarre les souscriptions
   - Souscriptions :
       afrixora/+/+/devices/+/readings
       afrixora/+/+/devices/+/events
       afrixora/+/+/gateways/+/status
   - Handler on('message') :
     a. Parser le topic pour extraire : tenantId, buildingId, deviceId, msgType
     b. Parser le payload JSON (try/catch — logger l'erreur et ignorer si invalide)
     c. Pour les readings : insérer chaque métrique dans sensor_readings via raw SQL
        INSERT INTO sensor_readings (time, tenant_id, device_id, metric, value, unit) VALUES (...)
     d. Mettre à jour le device via Prisma :
        await prisma.device.update({ where: { id: deviceId }, data: { isOnline: true, lastSeen: new Date() } })
     e. Émettre vers Socket.IO : io.to(`building:${buildingId}`).emit('device:reading', payload)
     f. Pour les events : émettre io.to(`building:${buildingId}`).emit('device:event', payload)
     g. Pour les gateway/status : mettre à jour via Prisma :
        await prisma.gateway.update({ where: { id: gatewayId }, data: { isOnline: true, lastSeen: new Date() } })

2. Gestion Socket.IO rooms dans server.ts
   - Ajouter handler io.on('connection') :
     → socket.on('join:building', (buildingId) => socket.join(`building:${buildingId}`))
     → socket.on('leave:building', (buildingId) => socket.leave(`building:${buildingId}`))

3. Job de détection offline (setInterval toutes les 2 minutes)
   - Utiliser prisma.device.updateMany({ where: { isOnline: true, lastSeen: { lt: new Date(Date.now() - 5 * 60 * 1000) } }, data: { isOnline: false } })
   - Pour chaque device passé offline : émettre io.to(...).emit('device:status', { deviceId, isOnline: false })

4. Mise à jour de server.ts : appeler connectMQTT(io) après initialisation Socket.IO.

Fournir un script de test pour simuler un message MQTT avec mosquitto_pub.
```

---

## PHASE 8 — Module Energy

**Objectif :** Implémenter les endpoints de consommation énergétique avec requêtes TimescaleDB agrégées.

**Ce que Claude Code doit produire :**
- `src/services/energyService.ts` avec requêtes `time_bucket`
- `src/routes/readings.ts` et `src/routes/energy.ts`
- Tous les endpoints analytics définis dans `AFRIXORA_CONTEXT.md`

**Critères de validation :**
- [ ] `GET /api/v1/energy/consumption?buildingId=X&period=24h` retourne des données agrégées
- [ ] `GET /api/v1/readings?deviceId=X&from=...&to=...&metric=power_w` retourne une série temporelle
- [ ] Toutes les requêtes incluent le filtre `tenant_id`
- [ ] Les résultats pour `7d` et `30d` utilisent `time_bucket` avec intervalles adaptés

---

```
Lis entièrement les fichiers suivants avant de faire quoi que ce soit :
- docs/AFRIXORA_CONTEXT.md
- docs/AFRIXORA_RULES.md

Tu travailles sur le projet AFRIXORA développé par NAZGENIX SAS.
Ce projet est développé et maintenu par un seul développeur.
N'implémente que ce qui est demandé dans cette phase. Ne génère pas de code pour les phases suivantes.

PHASE 8 — Module Energy (analytics énergétiques)

Implémente les endpoints d'analyse de la consommation énergétique.

Produis exactement :

1. backend/src/services/energyService.ts
   Toutes les fonctions utilisent raw SQL sur sensor_readings (pas Prisma).
   Chaque requête inclut AND tenant_id = $tenantId.

   - getReadings(tenantId, deviceId, from, to, metric) :
     SELECT time, value, unit FROM sensor_readings
     WHERE device_id=$1 AND tenant_id=$2 AND metric=$3 AND time BETWEEN $4 AND $5
     ORDER BY time ASC

   - getConsumption(tenantId, buildingId, period: '24h'|'7d'|'30d') :
     Utiliser time_bucket('1 hour' pour 24h, '1 day' pour 7d et 30d)
     JOIN avec devices WHERE building_id=$buildingId
     Retourner tableau { bucket, total_kwh, avg_power_w }

   - getByDevice(tenantId, buildingId, period) :
     Agrégation par device_id, retourner [{ deviceId, name, total_kwh }] trié desc

   - getByZone(tenantId, buildingId, period) :
     Agrégation par zone via JOIN devices → zones

   - getSummary(tenantId, buildingId, period) :
     Retourner { totalKwh, estimatedCostUSD, peakPowerW, avgPowerW, deviceCount }
     Coût estimé : totalKwh * 0.12 (configurable via env ENERGY_COST_PER_KWH)

2. backend/src/routes/readings.ts
   - GET / → authenticate + params: deviceId, from, to, metric + energyService.getReadings

3. backend/src/routes/energy.ts
   - GET /consumption → authenticate + params: buildingId, period + energyService.getConsumption
   - GET /by-device   → authenticate + params: buildingId, period + energyService.getByDevice
   - GET /by-zone     → authenticate + params: buildingId, period + energyService.getByZone
   - GET /summary     → authenticate + params: buildingId, period + energyService.getSummary

4. Mise à jour server.ts pour monter les deux nouvelles routes.

Fournir 2 exemples curl pour tester les endpoints et un exemple de réponse JSON attendue.
```

---

## PHASE 9 — Automatisations

**Objectif :** Implémenter le moteur de règles SI/ET/ALORS avec évaluation en temps réel sur chaque message MQTT.

**Ce que Claude Code doit produire :**
- `src/services/automationEngine.ts`
- `src/routes/automations.ts`
- Intégration du moteur dans `mqttWorker.ts`

**Critères de validation :**
- [ ] Une règle `power_w > 2000 → SEND_ALERT` est évaluée à chaque message MQTT
- [ ] L'alerte est créée en base avec le bon `tenantId` et `buildingId`
- [ ] Une règle `DEVICE_COMMAND` publie bien sur le topic MQTT `.../commands`
- [ ] `lastFiredAt` est mis à jour après déclenchement d'une règle

---

```
Lis entièrement les fichiers suivants avant de faire quoi que ce soit :
- docs/AFRIXORA_CONTEXT.md
- docs/AFRIXORA_RULES.md

Tu travailles sur le projet AFRIXORA développé par NAZGENIX SAS.
Ce projet est développé et maintenu par un seul développeur.
N'implémente que ce qui est demandé dans cette phase. Ne génère pas de code pour les phases suivantes.

PHASE 9 — Automatisations (moteur de règles)

Implémente le moteur d'automatisation et le CRUD des règles.

Produis exactement :

1. backend/src/services/automationEngine.ts
   - Fonction evaluate(tenantId, buildingId, deviceId, metrics) appelée par mqttWorker
   - Charger les règles actives via Prisma (pas de raw SQL) :
     prisma.automation.findMany({
       where: {
         tenantId,
         buildingId,
         isActive: true,
         trigger: { path: ['deviceId'], equals: deviceId }
       }
     })
   - Pour chaque règle :
     a. Extraire trigger : { metric, operator, value } — opérateurs : gt, lt, eq, gte, lte
     b. Évaluer la condition : metrics[trigger.metric] [op] trigger.value
     c. Si déclenchée et action.type === 'DEVICE_COMMAND' :
        → importer getMqttClient depuis mqttWorker.ts
        → publier sur afrixora/{tenantId}/{buildingId}/devices/{action.deviceId}/commands
     d. Si déclenchée et action.type === 'SEND_ALERT' :
        → créer une Alert en base avec Prisma (tenantId, buildingId, deviceId, message, severity)
        → émettre io.to(`building:${buildingId}`).emit('alert:new', alert)
     e. Mettre à jour lastFiredAt de la règle
   - Éviter les doublons : ne pas déclencher si lastFiredAt < NOW() - 5 minutes (cooldown)

2. backend/src/routes/automations.ts
   - GET    /      → authenticate + lister règles du tenant/bâtiment (query: buildingId)
   - POST   /      → authenticate + authorize('BUILDING_ADMIN') + validation Zod + créer règle
   - GET    /:id   → authenticate + détail règle
   - PATCH  /:id   → authenticate + authorize('BUILDING_ADMIN') + modifier ou toggle isActive
   - DELETE /:id   → authenticate + authorize('BUILDING_ADMIN') + supprimer

3. backend/src/routes/alerts.ts
   - GET    /          → authenticate + lister alertes (query: buildingId, severity, isRead)
   - PATCH  /:id/read  → authenticate + marquer comme lue

4. Schéma Zod pour createAutomationSchema :
   { name, buildingId, trigger: { deviceId, metric, operator, value },
     conditions?, action: { type, deviceId?, command?, params?, severity?, message? } }

5. Intégrer automationEngine.evaluate() à la fin du handler MQTT dans mqttWorker.ts.
   Passer l'instance io en paramètre.

6. Mise à jour server.ts pour monter automations.ts et alerts.ts.

Fournir un exemple de règle JSON complète et le curl pour la créer.
```

---

## PHASE 10A — Fondation Frontend

**Objectif :** Initialiser Next.js 14, configurer la stack frontend et créer la page de login ainsi que le layout principal.

**Ce que Claude Code doit produire :**
- `frontend/package.json` avec les dépendances de base
- Configuration Tailwind CSS + shadcn/ui
- `src/lib/api.ts` (client Axios + intercepteurs JWT)
- Page `/login` fonctionnelle
- Layout dashboard avec sidebar et header

**Critères de validation :**
- [ ] `npm run dev` démarre le frontend sur le port 3000
- [ ] La page `/login` s'affiche correctement
- [ ] Le formulaire login appelle `POST /api/v1/auth/login` et stocke le token
- [ ] La redirection vers `/dashboard` fonctionne après connexion

---

```
Lis entièrement les fichiers suivants avant de faire quoi que ce soit :
- docs/AFRIXORA_CONTEXT.md
- docs/AFRIXORA_RULES.md

Tu travailles sur le projet AFRIXORA développé par NAZGENIX SAS.
Ce projet est développé et maintenu par un seul développeur.
N'implémente que ce qui est demandé dans cette phase. Ne génère pas de code pour les phases suivantes.

PHASE 10A — Fondation Frontend

Initialise le projet frontend Next.js 14 et crée la structure de base.

Produis exactement :

1. frontend/package.json
   - Dependencies : next@14, react, react-dom, typescript, tailwindcss, postcss, autoprefixer,
     axios, zustand, lucide-react, @radix-ui/react-slot, class-variance-authority, clsx, tailwind-merge
   - DevDependencies : @types/react, @types/react-dom, @types/node, eslint, eslint-config-next
   - Ne pas inclure recharts et socket.io-client dans cette phase (phases 10B et 10C)

2. Configuration Tailwind + shadcn/ui
   - tailwind.config.ts standard Next.js 14 avec content paths
   - Installer les composants shadcn/ui utilisés : Button, Input, Label, Card, Badge, Switch, DropdownMenu

3. frontend/src/lib/api.ts
   - Instance Axios avec baseURL: process.env.NEXT_PUBLIC_API_URL
   - Intercepteur request : ajouter Bearer token depuis localStorage (clé : afrixora_access_token)
   - Intercepteur response : si 401 → effacer token + redirect /login

4. frontend/src/lib/auth.ts
   - Fonctions : getToken(), setToken(token), clearToken()
   - Fonction isAuthenticated() : vérifie présence du token

5. app/(auth)/login/page.tsx
   - Formulaire email + password avec composants shadcn/ui
   - Appel POST /api/v1/auth/login via api.ts
   - Stockage token + redirect vers /dashboard
   - Gestion d'erreur affichée sous le formulaire

6. app/(dashboard)/layout.tsx
   - Sidebar avec liens : Dashboard, Buildings, Devices, Energy, Automations, Alerts, Reports
   - Header avec nom du tenant + icône cloche (alerts)
   - Vérification auth côté client (redirect /login si pas de token)

Fournir les commandes d'installation et de démarrage.
```

---

## PHASE 10B — Dashboard, Buildings et Devices

**Objectif :** Implémenter le dashboard principal, les pages buildings et devices avec le store Zustand et l'intégration API.

**Ce que Claude Code doit produire :**
- Store Zustand global
- Page dashboard avec KpiCards
- Pages buildings et devices
- Composants `KpiCard` et `DeviceCard`

**Critères de validation :**
- [ ] Le dashboard affiche 4 KPIs récupérés depuis l'API
- [ ] La liste des bâtiments s'affiche avec les stats
- [ ] Les devices s'affichent avec leur état online/offline
- [ ] Le toggle on/off d'un device appelle `POST /devices/:id/control`

---

```
Lis entièrement les fichiers suivants avant de faire quoi que ce soit :
- docs/AFRIXORA_CONTEXT.md
- docs/AFRIXORA_RULES.md

Tu travailles sur le projet AFRIXORA développé par NAZGENIX SAS.
Ce projet est développé et maintenu par un seul développeur.
N'implémente que ce qui est demandé dans cette phase. Ne génère pas de code pour les phases suivantes.

PHASE 10B — Dashboard, Buildings et Devices

Implémente les pages principales du dashboard et l'intégration API.

Produis exactement :

1. frontend/src/store/index.ts
   - Store Zustand avec les slices suivants :
     → auth : { user, token, setAuth, clearAuth }
     → devices : Record<string, Device> + updateDevice(id, data)
     → readings : Record<deviceId, Reading[]> (max 100 par device) + setReading(deviceId, metrics)
     → alerts : Alert[] (max 50) + addAlert(alert)
   - Typage TypeScript explicite pour chaque slice

2. app/(dashboard)/page.tsx (Overview)
   - 4 KpiCards : devices online, consommation totale (kWh/jour), alertes actives, bâtiments
   - Données chargées via GET /api/v1/energy/summary et GET /api/v1/devices
   - Composant KpiCard réutilisable

3. app/(dashboard)/buildings/page.tsx
   - Liste des bâtiments depuis GET /api/v1/buildings
   - Chaque carte affiche : nom, adresse, nombre de zones, nombre de devices, statut
   - Lien vers le détail (page buildings/[id] — laisser vide pour l'instant)

4. app/(dashboard)/devices/page.tsx
   - Liste des devices depuis GET /api/v1/devices
   - Filtre par bâtiment (dropdown)
   - Chaque DeviceCard affiche : nom, type, badge online/offline, toggle Switch
   - Toggle appelle POST /api/v1/devices/:id/control avec { command: 'set_state', params: { state } }

5. Composants :
   - components/dashboard/KpiCard.tsx : props { label, value, unit?, icon, trend? }
   - components/devices/DeviceCard.tsx : props { device } + toggle Switch shadcn
   - components/layout/PageHeader.tsx : titre de page + breadcrumb optionnel

Fournir un exemple du type Device TypeScript utilisé dans le store.
```

---

## PHASE 10C — Energy, Alerts et Automations UI

**Objectif :** Implémenter les pages Energy, Alerts et Automations avec les graphiques Recharts et les mises à jour temps réel via Socket.IO.

**Ce que Claude Code doit produire :**
- Hook `useSocket.ts` pour les événements temps réel
- Page Energy avec graphiques Recharts
- Page Alerts avec feed temps réel
- Page Automations avec liste et toggle

**Critères de validation :**
- [ ] La page Energy affiche un graphique LineChart pour 24h / 7j / 30j
- [ ] Un message MQTT reçu met à jour le graphique en temps réel via Socket.IO
- [ ] La page Alerts affiche les nouvelles alertes sans rechargement
- [ ] Le toggle d'une règle d'automatisation appelle `PATCH /automations/:id`

---

```
Lis entièrement les fichiers suivants avant de faire quoi que ce soit :
- docs/AFRIXORA_CONTEXT.md
- docs/AFRIXORA_RULES.md

Tu travailles sur le projet AFRIXORA développé par NAZGENIX SAS.
Ce projet est développé et maintenu par un seul développeur.
N'implémente que ce qui est demandé dans cette phase. Ne génère pas de code pour les phases suivantes.

PHASE 10C — Energy, Alerts et Automations UI

Implémente les pages Energy, Alerts et Automations avec le temps réel.

Produis exactement :

1. Ajouter recharts et socket.io-client aux dépendances frontend/package.json

2. frontend/src/hooks/useSocket.ts
   - Hook tel que défini dans AFRIXORA_CONTEXT.md
     (Section 8 — Frontend Dashboard, Real-time architecture)
   - Connexion Socket.IO avec auth token
   - Rejoindre la room building:{buildingId} via socket.emit('join:building', buildingId)
   - Écouter les événements : device:reading → store.setReading, device:status → store.updateDevice,
     alert:new → store.addAlert, automation:fired → toast notification
   - Déconnexion propre au unmount

3. app/(dashboard)/energy/page.tsx
   - Sélecteur de période : 24h / 7j / 30j (boutons radio)
   - Sélecteur de bâtiment (dropdown)
   - Recharts LineChart : axe X = temps, axe Y = kWh, données depuis GET /api/v1/energy/consumption
   - Tableau breakdown par appareil depuis GET /api/v1/energy/by-device
   - Bouton export CSV qui appelle GET /api/v1/reports/csv et déclenche le téléchargement

4. components/dashboard/EnergyChart.tsx
   - Recharts LineChart responsive avec Tooltip et Legend
   - Props : { data: { bucket: string, total_kwh: number }[], period: string }

5. app/(dashboard)/alerts/page.tsx
   - Liste d'alertes depuis GET /api/v1/alerts
   - Mises à jour temps réel via useSocket (alert:new pousse dans la liste)
   - Badge sévérité coloré : INFO (bleu), WARNING (orange), CRITICAL (rouge)
   - Bouton "Marquer comme lu" → PATCH /api/v1/alerts/:id/read
   - Filtre par sévérité et statut lu/non-lu

6. app/(dashboard)/automations/page.tsx
   - Liste des règles depuis GET /api/v1/automations
   - Chaque ligne : nom, bâtiment, résumé du trigger, dernière exécution, toggle actif
   - Toggle appelle PATCH /api/v1/automations/:id avec { isActive: boolean }
   - Bouton supprimer → DELETE /api/v1/automations/:id avec confirmation

Fournir un exemple de test : simuler un message MQTT et vérifier la mise à jour du graphique.
```

---

## PHASE 11 — Rapports

**Objectif :** Implémenter l'export CSV et la génération de rapports PDF avec envoi par email.

**Ce que Claude Code doit produire :**
- `src/services/reportService.ts` (CSV streaming + PDF pdfkit)
- `src/routes/reports.ts`
- Page `/reports` dans le frontend

**Critères de validation :**
- [ ] `GET /api/v1/reports/csv?buildingId=X&from=...&to=...` retourne un fichier `.csv` téléchargeable
- [ ] `GET /api/v1/reports/pdf?buildingId=X&period=30d` retourne un PDF avec les KPIs
- [ ] Le PDF contient : en-tête AFRIXORA, période, KPIs, tableau de consommation par appareil

---

```
Lis entièrement les fichiers suivants avant de faire quoi que ce soit :
- docs/AFRIXORA_CONTEXT.md
- docs/AFRIXORA_RULES.md

Tu travailles sur le projet AFRIXORA développé par NAZGENIX SAS.
Ce projet est développé et maintenu par un seul développeur.
N'implémente que ce qui est demandé dans cette phase. Ne génère pas de code pour les phases suivantes.

PHASE 11 — Rapports (CSV + PDF)

Implémente la génération de rapports exportables.

Produis exactement :

1. backend/src/services/reportService.ts
   - generateCSV(tenantId, buildingId, from, to) :
     → Requête SQL : sensor_readings jointure devices, filtré par building et période
     → Retourner un stream ou string CSV avec colonnes : timestamp, device_name, metric, value, unit
   - generatePDF(tenantId, buildingId, period) :
     → Utiliser pdfkit (déjà dans les dépendances)
     → En-tête : logo texte AFRIXORA + nom du bâtiment + période
     → Section KPIs : totalKwh, coût estimé, peak power (depuis energyService.getSummary)
     → Tableau breakdown par appareil (depuis energyService.getByDevice)
     → Pied de page : date de génération + NAZGENIX SAS
     → Retourner un Buffer

2. backend/src/routes/reports.ts
   - GET /csv → authenticate + params: buildingId, from, to
     → res.setHeader('Content-Type', 'text/csv')
     → res.setHeader('Content-Disposition', 'attachment; filename="afrixora_report.csv"')
     → streamer le CSV
   - GET /pdf → authenticate + params: buildingId, period
     → res.setHeader('Content-Type', 'application/pdf')
     → envoyer le Buffer PDF

3. frontend/src/app/(dashboard)/reports/page.tsx
   - Sélecteur de bâtiment (dropdown)
   - Sélecteur de période (date range ou radio 7j/30j/90j)
   - Bouton "Télécharger CSV" → appel GET /reports/csv + download automatique
   - Bouton "Générer PDF" → appel GET /reports/pdf + ouverture dans nouvel onglet

4. Mise à jour server.ts pour monter reports.ts sur /api/v1/reports.

Fournir un exemple curl pour tester chaque endpoint.
```

---

## PHASE 12 — Production & Monitoring

**Objectif :** Finaliser la configuration Docker de production, configurer Traefik en routing interne, Cloudflare Tunnel pour l'accès externe, Grafana et préparer le déploiement sur ORICO CF1000.

**Ce que Claude Code doit produire :**
- `docker-compose.yml` de production complet (avec cloudflared, sans acme/Let's Encrypt)
- `infrastructure/scripts/deploy.sh` pour le serveur ORICO CF1000
- Configuration Grafana avec datasource TimescaleDB
- Checklist de déploiement finale

**Critères de validation :**
- [ ] `docker compose up -d` démarre tous les services en bonne santé
- [ ] Services accessibles via Cloudflare Tunnel sur `afrixora.cd`
- [ ] Traefik routing interne opérationnel sur le réseau `afrixora_net`
- [ ] Grafana accessible via `grafana.afrixora.cd`
- [ ] `CLOUDFLARE_TUNNEL_TOKEN` configuré et tunnel connecté
- [ ] Toutes les cases de la checklist Go/No-Go de `AFRIXORA_CONTEXT.md` sont cochées

---

```
Lis entièrement les fichiers suivants avant de faire quoi que ce soit :
- docs/AFRIXORA_CONTEXT.md
- docs/AFRIXORA_RULES.md

Tu travailles sur le projet AFRIXORA développé par NAZGENIX SAS.
Ce projet est développé et maintenu par un seul développeur.
N'implémente que ce qui est demandé dans cette phase. C'est la dernière phase du MVP.

PHASE 12 — Production & Monitoring

Finalise la configuration pour le déploiement production sur serveur local ORICO CF1000 avec accès externe via Cloudflare Tunnel.

Produis exactement :

1. docker-compose.yml (version finale complète)
   - Services : postgres (timescale/timescaledb:latest-pg15), redis:7-alpine,
     eclipse-mosquitto:2, api (build ./backend), frontend (build ./frontend),
     traefik:v3, grafana/grafana:latest, cloudflare/cloudflared:latest
   - Volumes nommés Docker pour toutes les données persistantes (pas de chemins absolus hôte)
   - Labels Traefik pour routing interne uniquement — PAS de certificats SSL, PAS d'acme.json,
     PAS d'entrypoint websecure sur port 443. Traefik écoute uniquement sur afrixora_net.
   - Le SSL est terminé côté Cloudflare, pas par Traefik.
   - Service cloudflared :
       image: cloudflare/cloudflared:latest
       command: tunnel --no-autoupdate run
       environment: TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}
       restart: unless-stopped
   - Healthchecks sur postgres et redis avec condition service_healthy dans depends_on
   - restart: unless-stopped sur tous les services
   - Réseau Docker interne afrixora_net (type bridge)
   - Variables d'environnement via ${VAR} depuis .env — aucun secret hardcodé

2. infrastructure/docker/mosquitto.conf
   - Listener 1883 avec require_certificate false
   - password_file /mosquitto/config/passwd
   - allow_anonymous false
   - persistence true

3. infrastructure/scripts/deploy.sh
   - Vérifications préalables : docker, docker compose, .env présent, CLOUDFLARE_TUNNEL_TOKEN non vide
   - Pull des images, build, migrate Prisma, seed conditionnel
   - docker compose up -d --build
   - Attendre healthchecks + vérifier tunnel cloudflared connecté + afficher statut final

4. infrastructure/monitoring/datasources.yml
   - Datasource Grafana pour PostgreSQL/TimescaleDB (provisioning automatique)

5. backend/Dockerfile final (production)
   - Stage builder : npm ci + npm run build
   - Stage runner : node:20-alpine + COPY dist + CMD

6. frontend/Dockerfile final (production)
   - next build + next start

7. Récapitulatif de la checklist de déploiement complète tirée de AFRIXORA_CONTEXT.md,
   reformatée en liste de commandes shell à exécuter dans l'ordre sur le CF1000.

Aucun secret ne doit apparaître dans les fichiers Docker ou les scripts. Tout passe par .env.
```

---

## Rappel : ordre de validation par phase

| Phase | Durée estimée | Critère de passage |
|-------|--------------|-------------------|
| 1 — Init projet | 1h | Arborescence créée, .gitignore OK |
| 2 — Backend fondation | 2h | Serveur démarre, `/health` répond |
| 3 — Base de données | 3h | Migrations OK, hypertable créée |
| 4 — Auth | 4h | Login retourne JWT, logout invalide |
| 5 — Building | 3h | CRUD isolé par tenant |
| 6 — Devices | 3h | Commande MQTT publiée |
| 7 — MQTT Worker | 4h | Lecture insérée TimescaleDB + Socket.IO |
| 8 — Energy | 3h | Analytics 24h/7j/30j corrects |
| 9 — Automations | 4h | Règle déclenchée + alerte créée |
| 10A — Frontend fondation | 3h | Login fonctionnel, layout en place |
| 10B — Dashboard, Buildings, Devices | 3h | KPIs affichés, toggle device < 200ms |
| 10C — Energy, Alerts, Automations UI | 3h | Graphiques live, alertes temps réel |
| 11 — Rapports | 3h | CSV et PDF téléchargeables |
| 12 — Production | 4h | `docker compose up` + Cloudflare Tunnel actif |


---

## 3. AFRIXORA_MVP_PROMPTS.md — Nouvelle section Phase 13-14

Ajoute ce bloc à la fin de ton fichier `AFRIXORA_MVP_PROMPTS.md` existant :

```markdown
---

## PHASE 13 — API Dashboard & Request Logging

**Objectif :** Ajouter la gestion des clés API et le logging des requêtes.

**Ce que Claude Code doit produire :**
- Modèle Prisma `ApiKey` et `ApiLog`
- `backend/src/services/apiKeyService.ts`
- `backend/src/routes/apiKeys.ts`
- `backend/src/routes/apiLogs.ts`
- `backend/src/middleware/requestLogger.ts`
- Page frontend `/api-dashboard`

**Critères de validation :**
- [ ] Création/révocation de clés API fonctionnelle
- [ ] Les requêtes authentifiées sont loggées dans `ApiLog`
- [ ] La page `/api-dashboard` affiche les clés et les logs

---

## PHASE 14 — User Management & RBAC UI

**Objectif :** Ajouter la gestion complète des utilisateurs avec contrôle d'accès basé sur les rôles.

**Ce que Claude Code doit produire :**
- `backend/src/routes/users.ts` avec endpoints CRUD
- `GET /users/me` pour le profil courant
- `PATCH /users/change-password` pour changement de mot de passe
- `PATCH /users/:id/reset-password` pour reset admin
- `DELETE /users/:id` pour suppression
- Page frontend `/users` avec tableau, création, édition de rôle
- Dialog de réinitialisation de mot de passe
- Dialog de confirmation de suppression
- `ChangePasswordDialog` pour le self-service
- Filtrage de la sidebar selon le rôle
- Restauration du profil JWT après rechargement

**Critères de validation :**
- [ ] Création d'utilisateurs avec différents rôles
- [ ] Changement de rôle fonctionnel
- [ ] Réinitialisation de mot de passe par admin
- [ ] Changement de mot de passe par l'utilisateur
- [ ] Suppression d'utilisateur avec confirmation
- [ ] Sidebar filtrée selon le rôle connecté
- [ ] Message d'erreur si email déjà existant
---

*AFRIXORA — © 2026 NAZGENIX SAS · afrixora.cd · Lubumbashi, RDC*
*Ce fichier est à conserver dans docs/ aux côtés de AFRIXORA_CONTEXT.md et AFRIXORA_RULES.md.*
