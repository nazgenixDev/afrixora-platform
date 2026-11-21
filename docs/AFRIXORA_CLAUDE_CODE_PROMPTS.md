# AFRIXORA — Prompts Claude Code : plan de correction (audit)

> À placer dans `docs/` à côté de `AFRIXORA_CONTEXT.md` et `AFRIXORA_RULES.md`.
> Dépôt de référence : `nazgenixDev/afrixora-platform`.
> **Note de nommage :** partout où un fichier ou un document dit « NEXORA », comprendre **AFRIXORA**. Le préfixe de clé API `nxa_live_` est un reliquat à remplacer par `afrx_` (nouvelles clés uniquement).

---

## Comment utiliser ce document

1. Coller d'abord le **Bloc 0 — Contexte permanent** dans Claude Code (ou le copier dans `CLAUDE.md` à la racine).
2. Envoyer **un seul prompt à la fois**, dans l'ordre : P0-0, P0-1, P0-2… Ne jamais envoyer deux prompts ensemble.
3. Après chaque prompt : exécuter les critères de validation, committer (`git commit`), puis passer au suivant.
4. Si Claude Code propose de sortir du périmètre du prompt, répondre : « Reste dans le périmètre de ce prompt ».

Ordre de priorité : **P0 (sécurité, avant toute mise en ligne) → P1 (déploiement et fiabilité) → P2 (cohérence et qualité)**.

---

## Bloc 0 — Contexte permanent (à coller en premier)

```
Lis entièrement les fichiers suivants avant de faire quoi que ce soit :
- docs/AFRIXORA_CONTEXT.md
- docs/AFRIXORA_RULES.md
- docs/ARCHITECTURE_DECISIONS.md
- docs/AFRIXORA_CLAUDE_CODE_PROMPTS.md (ce fichier)

Tu travailles sur le projet AFRIXORA (NAZGENIX SAS, Lubumbashi, RDC), dépôt nazgenixDev/afrixora-platform.
Dans tout document du projet, « NEXORA » signifie « AFRIXORA ».
Le projet est développé et maintenu par un seul développeur. Il est critique : sois précis, jamais vague.

Contexte : un audit complet a identifié des failles de sécurité, des bugs et des incohérences.
Nous les corrigeons par lots, un prompt à la fois.

RÈGLES DE TRAVAIL (obligatoires) :
1. Avant de modifier un fichier, lis-le en entier. Ne suppose jamais son contenu.
2. N'implémente QUE ce que demande le prompt courant. Pas de refactor opportuniste, pas de code pour les prompts suivants.
3. Respecte AFRIXORA_RULES.md : monolithe, TypeScript, async/await, pas de `any` dans le code que tu écris (utilise `unknown` + narrowing), pas de console.log (Winston côté backend, frontend/src/lib/logger.ts côté frontend), aucune valeur de configuration en dur, aucun secret dans le dépôt.
4. Multi-tenant : toute requête Prisma doit contenir le tenantId issu du JWT vérifié (req.user.tenantId). Toute requête SQL brute sur sensor_readings doit contenir AND tenant_id = $n.
5. Les erreurs sont levées par les services (AppError et sous-classes de backend/src/utils/errors.ts) et traitées par errorHandler.ts.
6. À la fin de chaque prompt, donne : (a) la liste exacte des fichiers modifiés/créés/supprimés, (b) les commandes de test avec résultat attendu, (c) ce qui n'a PAS été fait et pourquoi, (d) le message de commit proposé.
7. Si une information manque ou si deux fichiers se contredisent, pose UNE question précise avant de coder.
8. Ne réécris jamais l'historique git et n'exécute aucune commande destructrice (git push --force, rm -rf hors dossiers ciblés, docker volume rm). Propose-les à l'utilisateur à la place.

Réponds « Contexte lu » en résumant en 5 lignes ce que tu as compris, puis attends le prompt suivant.
```

---

## LOT P0 — Sécurité (bloquant avant tout client réel)

### P0-0 — Hygiène du dépôt et secrets

**Objectif :** retirer les secrets et fichiers parasites. Aucun changement fonctionnel.

**Critères de validation :**
- [ ] Aucune chaîne `re_` (clé Resend) ni mot de passe dans le dépôt : `git grep -nE "re_[A-Za-z0-9_]{20,}"` ne renvoie rien
- [ ] `start-demo.sh` lit ses secrets depuis `.env.demo` (non versionné) et un `.env.demo.example` existe
- [ ] `/auth_backup/login` n'existe plus côté Next.js

```
[Colle d'abord le Bloc 0 si ce n'est pas déjà fait]

PROMPT P0-0 — Hygiène du dépôt et secrets

Contexte : l'audit a trouvé une clé Resend réelle dans start-demo.sh (en double), des identifiants admin documentés comme valables en production, des fichiers de sauvegarde versionnés et une seconde page de login (frontend/src/app/auth_backup/).

Fais exactement ceci :

1. start-demo.sh
   - Supprime TOUTES les valeurs de secrets codées en dur (RESEND_API_KEY, MQTT_API_PASSWORD, JWT_SECRET, JWT_REFRESH_SECRET).
   - Supprime les lignes `export` dupliquées (MQTT_API_USER, MQTT_API_PASSWORD, RESEND_API_KEY, DOMAIN, ENERGY_COST_PER_KWH apparaissent deux fois).
   - Charge les variables depuis un fichier `.env.demo` à la racine (`set -a; source .env.demo; set +a`). Si le fichier est absent, affiche un message clair et quitte avec le code 1.
   - Crée `.env.demo.example` avec des valeurs factices explicites (CHANGE_ME), sans aucune vraie valeur.
2. .gitignore : ajoute `.env.demo`, `*.save`, `*.backup`, `*.bak`, `*.orig`.
3. Supprime du dépôt (git rm) : backend/prisma/schema.prisma.bak, backend/prisma/schema.prisma.backup, backend/src/routes/auth.ts.bak, backend/src/routes/auth.ts.save, backend/src/routes/users.ts.bak, frontend/next.config.js.bak, frontend/src/app/auth_backup/ (dossier complet), frontend/src/app/(dashboard)/devices/seed-user.sh, package.json et package-lock.json à la RACINE (ils ne contiennent que bcrypt, vérifie avant qu'aucun script racine ne les utilise).
4. Documentation : dans DEPLOYMENT.md et DEMO_CHECKLIST.md, remplace le mot de passe `Admin123!` par « voir .env / seed » et ajoute un avertissement : le compte de démo ne doit jamais exister en production.
5. backend/prisma/seed.ts : lis le mot de passe admin depuis `process.env.SEED_ADMIN_PASSWORD` ; si la variable est absente et NODE_ENV === 'production', refuse de seeder avec une erreur explicite. En développement, garde un défaut documenté. Ajoute SEED_ADMIN_PASSWORD (valeur CHANGE_ME) dans .env.example.
6. backend/src/services/apiKeyService.ts : remplace le préfixe `nxa_live_` par `afrx_live_` pour les NOUVELLES clés (les anciennes restent valides, ne touche pas à apiKeyAuth.ts).

NE FAIS PAS : réécriture de l'historique git, chiffrement/hachage des clés API (prévu en P1), autre correction.

Termine en listant, pour l'utilisateur, les actions manuelles à faire (je les exécuterai moi-même) :
- révoquer la clé Resend exposée sur resend.com ;
- purger la clé de l'historique git (git filter-repo ou BFG) ;
- changer le mot de passe du compte admin existant.
```

---

### P0-1 — Fuite inter-tenants sur `/devices` et mass assignment des appareils

**Objectif :** empêcher `GET /devices?tenantId=<autre tenant>` et toute écriture de champs non autorisés.

**Critères de validation :**
- [ ] `GET /api/v1/devices?tenantId=<id d'un autre tenant>` ne retourne que les appareils du tenant authentifié
- [ ] `PATCH /api/v1/devices/:id` avec `{"tenantId":"x"}` retourne 400
- [ ] `POST /api/v1/devices` avec un `buildingId` d'un autre tenant retourne 404

```
PROMPT P0-1 — Isolation multi-tenant des appareils

Fichiers à lire en entier avant de coder : backend/src/routes/devices.ts, backend/src/services/deviceService.ts, backend/src/middleware/validate.ts, backend/prisma/schema.prisma.

Problèmes confirmés par l'audit :
(a) deviceService.findAll fait `const where = { tenantId, ...filters }` avec filters = req.query : le spread vient APRÈS tenantId, donc ?tenantId=autre écrase l'isolation. Les paramètres page/limit sont aussi traités comme des filtres Prisma.
(b) deviceService.update et create passent des données non filtrées à Prisma (mass assignment : tenantId, buildingId, id modifiables).
(c) create n'a aucune vérification que buildingId et zoneId appartiennent au tenant.

À faire :
1. Dans routes/devices.ts, ajoute un schéma Zod de query (via validate) pour GET / : buildingId?, zoneId?, type? (enum DeviceType), isOnline? ('true'|'false' converti en boolean), search? (string max 100), page? (int >=1, défaut 1), limit? (int 1..100, défaut 50).
2. Réécris deviceService.findAll(tenantId, filters, pagination) :
   - construit `where` explicitement champ par champ depuis une liste blanche ; tenantId est posé EN DERNIER et ne peut jamais être écrasé ;
   - search = name contains (insensitive) ;
   - conserve la forme de réponse { data, total, page, totalPages }.
3. updateDeviceSchema : `.strict()` (champs autorisés : name, zoneId, config). Un champ inconnu doit donner 400. Dans deviceService.update, passe uniquement les champs autorisés ; si zoneId est fourni, vérifie qu'il appartient au tenant et au même bâtiment que l'appareil.
4. createDevice : dans deviceService.create, vérifie par prisma.building.findFirst({ where: { id: buildingId, tenantId, isActive: true } }) et, si zoneId, prisma.zone.findFirst({ where: { id: zoneId, tenantId, buildingId } }) ; sinon lève NotFoundError. N'utilise jamais `...data` : construis l'objet explicitement.
5. deviceService.findById / remove / control : contrôle qu'un id inexistant donne NotFoundError (404) et non un 500 ; remove doit vérifier l'existence avec findFirst({ id, tenantId }) avant delete.

NE FAIS PAS : changement du modèle DeviceState (P1), changement des routes MQTT, correction du frontend.

Écris aussi `backend/scripts/verify-p0-devices.sh` (curl) qui prouve : avant/après, la requête ?tenantId=<autre> ne renvoie que les appareils du tenant courant ; PATCH avec tenantId → 400 ; POST avec buildingId étranger → 404. Le script lit BASE_URL et TOKEN dans l'environnement.
```

---

### P0-2 — Gestion des rôles (escalade de privilèges)

**Objectif :** un `TENANT_ADMIN` ne peut ni créer ni promouvoir un `SUPER_ADMIN`.

**Critères de validation :**
- [ ] `POST /users` avec `role: SUPER_ADMIN` par un `TENANT_ADMIN` → 403
- [ ] `PATCH /users/:id/role` vers `SUPER_ADMIN` par un `TENANT_ADMIN` → 403
- [ ] Après un changement de rôle, l'ancien JWT de l'utilisateur est refusé (401)
- [ ] Un `TENANT_ADMIN` ne peut pas modifier, désactiver, supprimer ni réinitialiser un `SUPER_ADMIN`

```
PROMPT P0-2 — Contrôle des rôles

Fichiers à lire : backend/src/routes/users.ts, backend/src/middleware/authorize.ts, backend/src/middleware/authenticate.ts, frontend/src/app/(dashboard)/users/page.tsx.

Problèmes confirmés : createUserSchema et la route PATCH /:id/role acceptent SUPER_ADMIN ; la route /:id/role n'utilise pas validate() ; le changement de rôle n'invalide pas les JWT ; rien n'empêche un TENANT_ADMIN d'agir sur un SUPER_ADMIN.

Règles métier à implémenter (dans une fonction utilitaire testable `canAssignRole(actorRole, targetRole)` et `canManageUser(actorRole, targetUserRole)`, placée dans backend/src/utils/rbac.ts) :
- SUPER_ADMIN : peut tout assigner et gérer.
- TENANT_ADMIN : peut assigner BUILDING_ADMIN, OPERATOR, VIEWER (et TENANT_ADMIN pour des collègues de son tenant) ; ne peut JAMAIS assigner ni gérer SUPER_ADMIN.
- Tous les autres rôles : aucun droit de gestion (déjà bloqué par authorize).

À faire :
1. Applique ces règles dans POST /users, PATCH /:id/role, PATCH /:id/toggle, PATCH /:id/reset-password, DELETE /:id (réponse 403 avec message clair en français).
2. PATCH /:id/role : ajoute changeRoleSchema via validate() (il est déjà défini mais non utilisé) ; interdis de modifier son PROPRE rôle ; incrémente jwtVersion de l'utilisateur ciblé pour invalider ses sessions.
3. PATCH /:id/toggle (désactivation) : incrémente aussi jwtVersion.
4. Garde la restriction tenantId déjà présente sur toutes les requêtes ; ne l'affaiblis pas.
5. Frontend (users/page.tsx) : dans la liste déroulante de rôles, n'affiche SUPER_ADMIN que si l'utilisateur connecté est SUPER_ADMIN ; affiche l'erreur 403 renvoyée par l'API dans l'UI pour changeRole (aujourd'hui l'erreur est seulement loguée).

NE FAIS PAS : refonte de l'écran, ajout de nouveaux rôles.

Fournis backend/scripts/verify-p0-roles.sh (curl) couvrant les 4 critères de validation.
```

---

### P0-3 — Authentification Socket.IO

**Objectif :** plus aucune écoute possible sans JWT valide, et uniquement sur les bâtiments de son tenant.

**Critères de validation :**
- [ ] Connexion Socket.IO sans token → refusée (`connect_error`)
- [ ] `join:building` avec un bâtiment d'un autre tenant → refusé, aucun événement reçu
- [ ] Le temps réel continue de fonctionner pour un utilisateur légitime

```
PROMPT P0-3 — Authentification et autorisation Socket.IO

Fichiers à lire : backend/src/server.ts, backend/src/middleware/authenticate.ts, frontend/src/hooks/useSocket.ts, frontend/src/lib/api.ts.

Problème confirmé : io.on('connection') accepte n'importe quel client et socket.on('join:building') accepte n'importe quel buildingId. N'importe qui peut donc recevoir les mesures et alertes de n'importe quel tenant.

À faire :
1. Crée backend/src/middleware/socketAuth.ts : un middleware `io.use(...)` qui
   - lit le token dans le cookie `access_token` du header handshake (parse du header Cookie) ou, à défaut, dans `socket.handshake.auth.token` ;
   - vérifie la signature avec JWT_SECRET, puis vérifie en base (comme authenticate.ts) : utilisateur actif, jwtVersion identique, tenant actif (sauf SUPER_ADMIN) ;
   - attache { userId, tenantId, role } à `socket.data.user` ;
   - refuse la connexion (next(new Error('Unauthorized'))) sinon.
   Factorise la logique de vérification du JWT avec authenticate.ts si cela évite la duplication sans changer son comportement.
2. Dans server.ts : branche ce middleware, puis dans `join:building` vérifie par prisma.building.findFirst({ where: { id: buildingId, tenantId: socket.data.user.tenantId } }) avant `socket.join`. Si refus : émets 'error:join' avec un message générique et ne rejoins pas. Valide le type de buildingId (string UUID) avant toute requête.
3. SUPER_ADMIN : peut rejoindre n'importe quel bâtiment (comportement documenté en commentaire).
4. frontend/src/hooks/useSocket.ts : conserve withCredentials ; ajoute `auth: { token }` avec le token localStorage `afrixora_token` UNIQUEMENT s'il existe (fallback développement cross-port, déjà documenté dans ADR-001) ; supprime les console.log (utilise logger).
5. Mets à jour ADR-001 (docs/ARCHITECTURE_DECISIONS.md) avec 3 lignes décrivant l'authentification des sockets.

NE FAIS PAS : changement du format des événements émis, ajout de rooms par tenant (prévu plus tard si nécessaire).

Fournis backend/scripts/verify-p0-socket.mjs (Node + socket.io-client) qui teste les 3 critères.
```

---

### P0-4 — Alertes : isolation, filtres et marquage « lu »

**Objectif :** corriger l'IDOR et rendre fonctionnels les filtres (la cloche et la page Alertes en dépendent).

**Critères de validation :**
- [ ] `PATCH /alerts/:id/read` sur une alerte d'un autre tenant → 404
- [ ] `GET /alerts?isRead=false` ne retourne que les non lues
- [ ] `GET /alerts?severity=CRITICAL&buildingId=<id>` filtre correctement

```
PROMPT P0-4 — Module alertes

Fichiers à lire : backend/src/routes/alerts.ts, backend/prisma/schema.prisma, frontend/src/app/(dashboard)/alerts/page.tsx, frontend/src/components/layout/NotificationBell.tsx, frontend/src/store/index.ts, frontend/src/types/index.ts.

Problèmes confirmés : PATCH /:id/read fait update({ where: { id } }) sans tenantId (IDOR) ; GET / ignore tous les paramètres de requête (isRead, severity, buildingId) ; le front et le store utilisent encore les anciens AlertType (ENERGY_THRESHOLD, DEVICE_OFFLINE, AUTOMATION_FIRED, ANOMALY) alors que Prisma définit THRESHOLD, OFFLINE, AUTOMATION, SYSTEM.

À faire :
1. Crée backend/src/services/alertService.ts (la logique métier ne doit pas rester dans la route, cf. RULES) :
   - findAll(tenantId, filters, pagination) avec filtres Zod : isRead?, severity?, buildingId? (vérifié dans le tenant), type?, page, limit (défaut 50, max 100). Réponse { data, total, page, totalPages }.
   - markAsRead(id, tenantId) : findFirst({ id, tenantId }) puis update ; NotFoundError sinon.
2. Routes alerts.ts : utilise validate() + le service ; ne garde pas de try/catch superflu. Pas de changement d'URL.
3. Frontend : aligne les types AlertType (store/index.ts et la fonction getAlertTypeLabel de alerts/page.tsx) sur THRESHOLD/OFFLINE/AUTOMATION/SYSTEM avec libellés français.
4. NotificationBell.tsx et alerts/page.tsx : adapte-les à la réponse paginée { data } (utilise `res.data.data ?? res.data` pour rester compatible), calcule le compteur de non lues depuis `total` de la requête isRead=false.
5. alerts/page.tsx : corrige la boucle d'effet (fetchAlerts dépend de storeAlerts qui est modifié par addAlert). Sépare le chargement initial (dépendant des filtres uniquement) de la fusion des alertes temps réel.

NE FAIS PAS : création d'un nouveau type d'alerte, notifications email.

Fournis backend/scripts/verify-p0-alerts.sh (curl).
```

---

### P0-5 — Validation Zod : automatisations, tenants, clés API

**Objectif :** fermer le mass assignment restant et tenir la promesse de l'ADR-005.

**Critères de validation :**
- [ ] `PATCH /automations/:id` avec `{"tenantId":"x"}` → 400
- [ ] `POST /automations` avec un `buildingId` ou un `deviceId` d'un autre tenant → 404
- [ ] `POST /api-keys` avec un scope inconnu → 400
- [ ] `POST /tenants` valide tous les champs (slug, email, plan, mot de passe ≥ 8)

```
PROMPT P0-5 — Validation des entrées restantes

Fichiers à lire : backend/src/routes/automations.ts, backend/src/services/automationService.ts, backend/src/routes/tenants.ts, backend/src/routes/apiKeys.ts, backend/src/services/apiKeyService.ts, backend/src/middleware/checkLimits.ts, backend/src/services/automationEngine.ts.

Problèmes confirmés : automationService.update/create passent req.body brut à Prisma (tenantId, lastFiredAt, id modifiables), aucun Zod, aucun contrôle d'appartenance de buildingId/deviceId ; POST /tenants sans validation (plan par défaut 'CORE' incohérent avec l'enum SubscriptionPlan) ; POST /api-keys accepte n'importe quel scope.

À faire :
1. Automatisations
   - createAutomationSchema : name (1..100), buildingId (string), trigger { deviceId, metric, operator ∈ gt|lt|eq|gte|lte, value: number }, conditions? (tableau, défaut []), action : union discriminée sur `type` — DEVICE_COMMAND { deviceId, command, params? } ou SEND_ALERT { severity ∈ INFO|WARNING|CRITICAL, message? (max 300) }.
   - updateAutomationSchema : `.strict()`, tous champs optionnels, buildingId NON modifiable ; isActive autorisé.
   - Dans automationService : vérifie que buildingId appartient au tenant, et que trigger.deviceId (et action.deviceId) appartiennent au tenant ET au bâtiment ; sinon NotFoundError. Construis les données explicitement.
   - update/remove : findFirst({ id, tenantId }) avant action.
2. Tenants (POST /tenants) : schéma Zod (name, slug regex ^[a-z0-9-]{3,40}$, plan ∈ BASIC|PRO|BUSINESS|ENTERPRISE, adminEmail email, adminName, adminPassword min 8). Supprime le mapping CORE/COMFORT et aligne le formulaire de frontend/src/app/(dashboard)/tenants/page.tsx sur les 4 plans réels.
3. Clés API : schéma Zod { name (1..60), scope ∈ read|write|full|gateway } ; valide aussi côté front (déjà limité par le select).
4. Dans automationEngine.ts, corrige UNIQUEMENT ces deux défauts : (a) `if (!metrics[trigger.metric]) continue;` ignore la valeur 0 → utilise `typeof metrics[trigger.metric] !== 'number'` ; (b) `publishMqtt(...)` pour DEVICE_COMMAND doit être `await`.

NE FAIS PAS : refonte du moteur de règles, gestion de `conditions`, hachage des clés API (P1).

Fournis backend/scripts/verify-p0-validation.sh.
```

---

### P0-6 — Login (401), proxy de confiance, rate limiting

**Objectif :** un mauvais mot de passe renvoie 401, et les IP ne sont plus falsifiables.

**Critères de validation :**
- [ ] Mauvais mot de passe → 401 `{ error, code: 'INVALID_CREDENTIALS' }` (et non 500)
- [ ] `X-Forwarded-For` forgé depuis l'extérieur n'altère pas l'IP du rate-limit ni celle de `ApiLog`
- [ ] 11 tentatives de login en 15 min en production → 429

```
PROMPT P0-6 — Authentification : codes d'erreur, proxy, limites

Fichiers à lire : backend/src/services/authService.ts, backend/src/routes/auth.ts, backend/src/middleware/errorHandler.ts, backend/src/utils/errors.ts, backend/src/server.ts, backend/src/middleware/requestLogger.ts, frontend/src/lib/api.ts, frontend/src/app/(auth)/login/page.tsx.

Problèmes confirmés : authService lève `new Error('Invalid credentials')` sans statusCode → errorHandler répond 500 ; `app.set("trust proxy", true)` fait confiance à tout X-Forwarded-For (contournement du rate limit, IP falsifiables dans ApiLog) ; /auth/refresh partage le même limiteur strict que /auth/login ; le front a `http://localhost:4000` codé en dur (api.ts et page login) et aucun refresh automatique.

À faire :
1. errors.ts : ajoute UnauthorizedError (401, 'INVALID_CREDENTIALS' par défaut) et ForbiddenError (403). authService.login/refreshToken lèvent ces erreurs. Message public volontairement générique (« Identifiants invalides »), jamais « email inconnu » vs « mot de passe faux ».
2. server.ts : remplace `trust proxy: true` par un nombre de sauts configurable `TRUST_PROXY_HOPS` (défaut 1 ; documente dans .env.example que la chaîne Cloudflare Tunnel → Traefik → API demande généralement 2, à valider sur le serveur). Utilise la même IP (req.ip) dans requestLogger au lieu de lire x-forwarded-for à la main.
3. auth.ts : limiteur dédié et plus souple pour /refresh (30 par 15 min), strict conservé pour /login.
4. Frontend :
   - crée `frontend/src/lib/config.ts` exportant API_URL = process.env.NEXT_PUBLIC_API_URL avec repli http://localhost:4000 en développement uniquement ;
   - api.ts et la page de login utilisent API_URL (la page login doit passer par `api`, avec withCredentials) ;
   - ajoute un intercepteur de réponse : sur 401 (hors /auth/login), tente UNE fois POST /api/v1/auth/refresh puis rejoue la requête ; si échec, redirectToLogin() ;
   - supprime le console.log du token dans api.ts.
5. Docker : dans docker-compose.yml, passe NEXT_PUBLIC_API_URL au frontend en `build.args` (et ajoute `ARG/ENV NEXT_PUBLIC_API_URL` dans frontend/Dockerfile avant `npm run build`), car cette variable est figée au build.
6. .env.example : ajoute TRUST_PROXY_HOPS=1.

NE FAIS PAS : suppression complète du fallback localStorage (nécessaire au développement cross-port, cf. ADR-001), 2FA, rotation des refresh tokens.

Fournis backend/scripts/verify-p0-auth.sh (curl, y compris un test avec en-tête X-Forwarded-For forgé).
```

---

### Clôture du lot P0

```
PROMPT P0-FIN — Revue de clôture du lot P0

1. Exécute `cd backend && npm run typecheck && npm run build` et `cd frontend && npm run typecheck` ; liste toutes les erreurs (ne les masque pas avec ts-ignore).
2. Exécute `git grep -nE "re_[A-Za-z0-9_]{20,}|Admin123!|localhost:4000"` et classe chaque résultat (autorisé/à corriger).
3. Vérifie que chaque route de backend/src/routes/*.ts qui lit ou écrit une donnée de tenant filtre par req.user.tenantId ; produis un tableau route → fichier → verdict. Signale sans corriger toute route non conforme.
4. Mets à jour docs/AFRIXORA_CONTEXT.md : sections Authentification, Rôles (règles de P0-2), Socket.IO (P0-3) et API (réponses paginées des alertes).
5. Propose un résumé de version (CHANGELOG.md) pour le lot P0.
```

---

## LOT P1 — Déploiement et fiabilité

### P1-1 — Déploiement Docker fiable

```
PROMPT P1-1 — Déploiement : Docker, base de données, scripts

Fichiers à lire : docker-compose.yml, backend/Dockerfile, frontend/Dockerfile, infrastructure/scripts/deploy.sh, infrastructure/scripts/01_schema.sql, infrastructure/scripts/backup.sh, infrastructure/monitoring/datasources/timescaledb.yaml, DEPLOYMENT.md.

Problèmes confirmés par l'audit :
- deploy.sh : `command_exists docker compose` échoue toujours (command -v ne gère pas deux mots) ; ${DOMAIN} non chargé ; 01_schema.sql n'est jamais appliqué.
- backend/Dockerfile : `prisma` est en devDependencies mais `prisma migrate deploy` est lancé dans le conteneur ; l'utilisateur non-root ne peut pas écrire dans logs/ (Winston en production).
- Grafana : le datasource utilise ${DB_PASSWORD} mais le conteneur ne reçoit pas cette variable ; le port 3001 est publié en plus de Traefik.
- Image timescale/timescaledb-ha : vérifie son répertoire de données réel et corrige le volume nommé en conséquence (ou passe à l'image timescale/timescaledb:latest-pg15 déjà utilisée dans le README) ; teste que les données persistent après `docker compose down && up`.
- Aucune création automatique de l'hypertable sensor_readings.

À faire :
1. Corrige deploy.sh (détection `docker compose version`, chargement de .env, application idempotente de 01_schema.sql via psql avec `CREATE TABLE IF NOT EXISTS` et `create_hypertable(..., if_not_exists => TRUE)`, attente active des healthchecks au lieu de sleep 10).
2. Rends 01_schema.sql idempotent ; ajoute une politique de rétention configurable (variable RETENTION_DAYS, défaut 365) et un agrégat continu horaire (`sensor_readings_hourly`) SANS modifier encore les requêtes de energyService.
3. Dockerfile backend : installe prisma pour la migration (stage dédié ou dépendance de production), crée /app/logs avec les bonnes permissions avant `USER`.
4. Grafana : fournis DB_PASSWORD au conteneur, retire `ports: 3001:3000` en production (conserve-le dans docker-compose.dev.yml).
5. Met à jour DEPLOYMENT.md avec la séquence exacte et testée.

NE FAIS PAS : changement de technologie, ajout de services non demandés.
```

### P1-2 — Ingestion MQTT fiable et sécurisée

```
PROMPT P1-2 — Fiabilité et sécurité de l'ingestion MQTT

Fichiers à lire : backend/src/services/mqttWorker.ts, infrastructure/docker/mosquitto.conf, backend/scripts/inject-demo-data.mjs, docs/ARCHITECTURE_DECISIONS.md (ADR-002, ADR-006).

Problèmes confirmés :
(a) retryBuffer : un message en échec est ré-empilé (lpush) puis re-dépilé (rpop) dans la même boucle ; retryCount > 10 est atteint en quelques secondes, donc le buffer est jeté après une courte panne. Pas de verrou anti-chevauchement ; redis.keys() toutes les 10 s.
(b) Les valeurs non numériques (ex. state: 'on') sont insérées dans value DOUBLE PRECISION, échouent, puis sont bufferisées inutilement.
(c) Le timestamp du payload est ignoré (NOW()).
(d) Aucune vérification que deviceId appartient au tenantId/buildingId du topic ; un seul compte MQTT partagé, sans ACL.
(e) startOfflineDetectionJob ne notifie personne (ni device:status, ni alerte OFFLINE).

À faire :
1. Valide chaque métrique : number fini uniquement dans sensor_readings ; les valeurs textuelles ('on'/'open'…) sont converties (on/open=1, off/closed=0) ou ignorées avec un log de niveau warn, jamais bufferisées.
2. Utilise le timestamp du payload s'il est valide et pas plus de 24 h dans le futur ; sinon NOW().
3. Vérifie l'appartenance de l'appareil (id + tenantId + buildingId) avant tout traitement ; cache court (Map avec TTL 60 s) pour éviter une requête par message. Rejette et loggue sinon.
4. Buffer : rejeu temporisé (backoff exponentiel basé sur un horodatage `nextRetryAt` stocké dans le message, et non sur une boucle), verrou Redis (SET NX EX) contre le chevauchement, SCAN à la place de KEYS, nombre maximal de tentatives exprimé en durée (ex. 24 h), journalisation des messages définitivement abandonnés.
5. Détection hors-ligne : émets device:status via Socket.IO et crée une Alert de type OFFLINE (sévérité WARNING) une seule fois par passage hors-ligne.
6. Mosquitto : propose un fichier acl (topic pattern par utilisateur) et un script de création d'utilisateur MQTT par passerelle ; ne l'active pas sans valider avec l'utilisateur la procédure de migration des clients existants.

NE FAIS PAS : changement de broker, ajout d'une file de messages (interdit par RULES).
```

### P1-3 — Sécurité des clés API et sessions

```
PROMPT P1-3 — Clés API hachées, quotas, contrôles

Fichiers à lire : backend/src/middleware/apiKeyAuth.ts, backend/src/services/apiKeyService.ts, backend/src/routes/apiKeys.ts, backend/prisma/schema.prisma, frontend/src/app/(dashboard)/api-dashboard/page.tsx.

À faire :
1. Stocke un hash SHA-256 de la clé (nouveau champ keyHash unique, plus un keyPrefix de 8 caractères pour l'affichage). La clé complète n'est montrée qu'à la création (réponse 201), jamais ensuite. Migration Prisma + script de migration des clés existantes (documente la rotation attendue).
2. apiKeyAuth : recherche par hash ; applique le quota `limit` (HTTP 429 au dépassement) ; ne fais pas un UPDATE à chaque requête (incrémente via Redis puis synchronise périodiquement).
3. Le scope `gateway` doit correspondre à de vraies routes (voir P1-2) ; refuse proprement sinon.
4. Frontend : affiche uniquement le préfixe + une modale de « copie unique » à la création.
5. Ajoute requireApi aux routes /api-logs.

NE FAIS PAS : OAuth, rotation automatique.
```

---

## LOT P2 — Cohérence fonctionnelle et qualité

### P2-1 — Alignement frontend / backend

```
PROMPT P2-1 — Alignement front/back

Corrige UNIQUEMENT les désalignements suivants (un commit par point) :
1. buildingService.findAll : renvoie `_count: { zones, devices }` (select/_count Prisma) au lieu d'inclure toutes les zones et tous les appareils ; findById renvoie 404 (NotFoundError) si inexistant, et inclut zones avec _count.devices.
2. Pagination côté front : buildings, devices, users — gestion de { data, total, page, totalPages } avec contrôles Précédent/Suivant. devices/page.tsx : corrige `bRes.data.length` (objet paginé) et `STATS_COLORS[key]` utilisé comme className (objet).
3. Page API (api-dashboard) : le filtre « Toutes/Toutes » envoie `__all__` ; ne l'envoie pas. Le filtre de statut (2xx/4xx/5xx) doit être une plage côté backend (statusCode gte/lt) et non une égalité exacte.
4. Page Tenants : supprime l'appel à PATCH /tenants/:id inexistant OU crée-le (activation/désactivation, SUPER_ADMIN uniquement) ; GET /tenants renvoie _count { buildings, users } ; DELETE /tenants/:id doit supprimer dans l'ordre correct (alerts, automations, device states, devices, zones, gateways, buildings, api keys, history, users, tenant) dans une transaction — ou passe à une désactivation logique, au choix de l'utilisateur (pose-lui la question).
5. Impersonation SUPER_ADMIN : l'intercepteur d'api.ts envoie `x-tenant-id` depuis le store ; côté backend (authenticate.ts) vérifie que le tenant existe et loggue chaque usage (logger.info avec userId et tenantId cible).
6. Alignement des rôles dans le menu : BUILDING_ADMIN voit Automations et Alertes si le backend l'autorise (ou restreins le backend, au choix après question à l'utilisateur).
7. Période « 3m » : supporte-la dans energyService (2160 h) ou retire-la du front.

NE FAIS PAS : nouvelles fonctionnalités.
```

### P2-2 — Énergie : exactitude des données

```
PROMPT P2-2 — Exactitude des mesures d'énergie

Fichiers à lire : backend/src/services/energyService.ts, backend/src/services/reportService.ts, backend/src/routes/admin.ts, frontend/src/app/(dashboard)/energy/page.tsx, frontend/src/app/(dashboard)/page.tsx, infrastructure/scripts/01_schema.sql.

Problèmes confirmés : `SUM(energy_kwh)` suppose des deltas alors que les compteurs envoient généralement un index cumulé ; `JOIN ... sr.device_id = d.id::uuid` empêche l'usage des index ; la « puissance actuelle » est une moyenne 7 jours affichée en kW alors qu'elle est en W ; graphique « Avant/Avec AFRIXORA » et tendances codés en dur.

D'abord, pose-moi la question : « les compteurs réels envoient-ils un index cumulé (kWh total) ou une consommation par intervalle ? » et attends la réponse avant de coder.

Ensuite :
1. Si cumulatif : calcule la consommation par bucket comme MAX - MIN (ou LAST - FIRST) par appareil puis somme, en gérant les remises à zéro de compteur. Si delta : conserve SUM.
2. Utilise les agrégats continus (P1-1) pour 7d/30d/3m.
3. Corrige les unités (W vs kW) et affiche la vraie dernière valeur de puissance pour « Puissance actuelle ».
4. Supprime ou rends réelles les données codées en dur (graphique « Avant/Avec », tendances, seuils) ; sans données fiables, masque le bloc.
5. Ajoute le support du fuseau Africa/Kinshasa dans time_bucket (time_bucket avec timezone) pour des jours cohérents.

NE FAIS PAS : modèle de tarification, nouvelles métriques.
```

### P2-3 — Tests, CI, qualité

```
PROMPT P2-3 — Tests et intégration continue

À faire, dans cet ordre :
1. Backend : ajoute Vitest + Supertest (devDependencies) ; script `npm test`. Tests minimaux obligatoires : isolation tenant (devices, alerts, automations, users, buildings), règles RBAC (canAssignRole/canManageUser), login 401, validation Zod (cas passants et refusés). Base de test via DATABASE_URL de test (documente-le).
2. Frontend : retire `ignoreBuildErrors: true` et `ignoreDuringBuilds: true` de next.config.js ; corrige les erreurs TypeScript révélées (notamment frontend/src/components/devices/DeviceTable.tsx), ou supprime les composants morts (StatsBar, DeviceGrid, DeviceTable, DeviceDrawer, AddDeviceDialog) s'ils ne sont pas importés ; supprime next.config.mjs (garde un seul fichier de configuration).
3. CI GitHub Actions (`.github/workflows/ci.yml`) : install, typecheck, lint, build, tests backend, `git grep` de secrets.
4. Dépendances : mets Next.js à jour vers la dernière 14.2.x corrigée, retire bcrypt (garde bcryptjs) après vérification du seed (seed.ts importe bcrypt → passe-le à bcryptjs).
5. Documentation : corrige README.md racine (bloc de code non fermé), aligne AFRIXORA_CONTEXT.md sur le schéma Prisma réel (SubscriptionPlan BASIC/PRO/BUSINESS/ENTERPRISE, AlertType THRESHOLD/OFFLINE/AUTOMATION/SYSTEM), et documente l'écart entre le modèle commercial (prix par unité) et les plans codés (demande-moi laquelle des deux versions est la bonne).

NE FAIS PAS : tests e2e navigateur.
```

---

## Rappels pour l'utilisateur (hors Claude Code)

- **À faire à la main, tout de suite :** révoquer la clé Resend exposée, purger l'historique git, changer le mot de passe admin.
- **À valider sur le serveur :** nombre de sauts proxy (`TRUST_PROXY_HOPS`), répertoire de données de l'image Timescale, procédure de migration des clients MQTT avant activation des ACL.
- **À décider :** suppression ou désactivation logique d'un tenant, droits du rôle `BUILDING_ADMIN`, modèle de prix réel (par unité ou par plan).

*AFRIXORA — © 2026 NAZGENIX SAS · afrixora.cd · Lubumbashi, RDC*
