# AFRIXORA Energy Management V2 — Audit statique du code et plan d'intégration

**Date :** 21 novembre 2026\
**Source :** archive fournie par le propriétaire, `afrixora-platform-main.zip`\
**Nature :** analyse statique des sources (lecture seule, sans modification de l'archive, sans accès à la base en production ni exécution des services).\
**Décision :** **ne pas activer d'automatisation de puissance sur des circuits réels** avant les corrections et validations ci-dessous.

## 1. Inventaire confirmé

L'archive contient **159 fichiers** et les répertoires `backend/`, `frontend/`, `infrastructure/` et `docs/`.

| Domaine | Existant observé | Fichiers de référence |
| --- | --- | --- |
| Modèles métiers | `Tenant`, `User`, `Building`, `Zone`, `Device`, `DeviceState`, `Automation`, `Alert`, `Gateway`, `ApiKey`, `ApiLog`, `SubscriptionHistory` | `backend/prisma/schema.prisma:69-258` |
| API | routes bâtiments, équipements, mesures, énergie, automatisations, alertes, rapports, comptes | `backend/src/server.ts:11-85` |
| Commande IoT | publication MQTT d'une commande vers un topic par appareil | `backend/src/services/deviceService.ts:55-69` |
| Télémétrie | réception MQTT, écriture `sensor_readings`, diffusion Socket.IO, évaluation règles | `backend/src/services/mqttWorker.ts:180-369` |
| Automatisation | déclenchement par métrique, action commande ou alerte | `backend/src/services/automationEngine.ts:14-153` |
| Interface | pages Énergie, Équipements, Automatisations, Bâtiments, Alertes | `frontend/src/app/(dashboard)/...` |
| Infrastructure | Timescale/PostgreSQL, Redis, Mosquitto, API, frontend, Traefik, Cloudflare Tunnel, Grafana | `docker-compose.yml` |

**Non représentés explicitement dans le schéma Prisma fourni :** `EnergySource`, `DistributionBoard`, `Circuit`, `ElectricalLoad`, `MeteringPoint`, `ControlEndpoint`, `DeviceCommand`, suivi des sources d'alimentation, historisation structurée des commandes.

## 2. Constats priorisés

### Critiques — à résoudre avant pilotage réel

**C-01. Absence de contrôle d'accès Socket.IO aux bâtiments.**\
`backend/src/server.ts:89-96` accepte `join:building(buildingId)` sans authentifier la socket ni vérifier l'appartenance du client au bâtiment. Le code montre un risque de réception de données inter-clients si le service est accessible. **Action :** authentification au handshake, autorisation tenant/bâtiment au join, contrôle événementiel et tests négatifs.

**C-02. Absence de vérification d'identité et de rattachement des messages IoT.**\
`backend/src/services/mqttWorker.ts:224-265,290-358` extrait `tenantId`, `buildingId`, `deviceId` du topic et traite les mesures sans vérifier que l'appareil appartient réellement à ce client et à ce bâtiment. `infrastructure/docker/mosquitto.conf:14-15` impose un mot de passe mais ne définit pas d'ACL par client/topic. **Action :** identités distinctes par boîtier, ACL topics, validation en base du couple tenant/bâtiment/appareil, format et plage de valeurs, contrôles anti-rejeu.

**C-03. L'envoi de commande est assimilé à son exécution.**\
`backend/src/services/deviceService.ts:55-69` publie par MQTT puis modifie `DeviceState` et retourne `success: true` sans accusé de réception ou mesure d'état. Le frontend reflète aussi immédiatement la commande dans `frontend/src/app/(dashboard)/devices/page.tsx:177-198`. **Action :** registre `DeviceCommand` avec ID unique, expiration, `PENDING/SENT/ACKNOWLEDGED/CONFIRMED/FAILED/EXPIRED/REJECTED`, état souhaité distinct de l'état constaté, confirmation par retour matériel, interdiction de commandes périmées.

**C-04. Contrôle d'automatisation insuffisant pour les charges.**\
`backend/src/services/automationEngine.ts:53-55` ignore les métriques à zéro (`if (!metrics[trigger.metric])`), et `:94-103` appelle `publishMqtt` sans `await`; `lastFiredAt` est mis à jour ensuite (`:129-133`) même si la publication échoue de manière asynchrone. Les actions n'ont pas de politique centralisée de sécurité des circuits. **Action :** validation du schéma, présence de métrique via `Object.hasOwn` ou `metric in metrics`, `await`, commandes idempotentes, limites de cycle, priorité, exclusion des circuits critiques par défaut, moteur en mode simulation.

**C-05. Authentification et session incohérentes.**\
`backend/src/middleware/authenticateOrApiKey.ts:5-12` refuse les requêtes fondées uniquement sur le cookie `httpOnly` alors que `authenticate.ts:30-41` sait lire ce cookie. `frontend/src/app/(auth)/login/page.tsx:61-69` appelle `http://localhost:4000` et stocke le token dans `localStorage`, `frontend/src/lib/api.ts:3-16` utilise aussi `localhost` et relit ce token, tandis que `frontend/src/lib/auth.ts:1-19` annonce un système cookie-only. `backend/src/routes/auth.ts:62-66` renvoie en outre le token dans le JSON. **Action :** choisir et implémenter de manière cohérente un flux d'authentification, endpoint configurable pour la production, cookies `httpOnly` et protection CSRF si la session par cookie est retenue, tests de login/refresh/logout.

### Élevés — à traiter avant extension V2

**E-01. Intégrité inter-clients des relations à renforcer.**\
`backend/src/services/deviceService.ts:29-33` permet de soumettre un `buildingId`/`zoneId` sans validation explicite de leur rattachement au tenant demandeur. `backend/src/services/automationService.ts:7-11` accepte des données de règles libres avec un rattachement building non vérifié explicitement. **Action :** vérifier que chaque ID lié appartient au tenant, ajouter des contraintes et validations cohérentes, tester les accès inter-clients.

**E-02. Historique des appareils non distinct de leur état courant.**\
`backend/prisma/schema.prisma:156-163` impose `deviceId @unique` dans `DeviceState` ; `backend/src/services/deviceService.ts:71-76` expose une route `history` à partir de cette table, qui ne peut contenir qu'un seul état par appareil. **Action :** conserver `DeviceState` comme dernier état connu et créer un journal append-only des états/commandes.

**E-03. Ingestion Timescale et continuité à durcir.**\
`infrastructure/scripts/01_schema.sql:1-16` crée `sensor_readings`, mais les migrations Prisma ne contiennent pas cette création et `docker-compose.yml` ne monte pas ce SQL dans l'initialisation PostgreSQL. La création effective dépend donc d'une étape distincte à confirmer. En cas d'échec SQL, le buffer Redis `backend/src/services/mqttWorker.ts:50-174` est borné à 1 000 entrées par tenant ; la boucle de rejeu peut redépiler les messages échoués pendant le même passage et les abandonner après 10 tentatives. L'horodatage lors de la réception (`:319`) perd l'heure d'origine des mesures hors ligne. **Action :** migration versionnée de l'hypertable, identifiants d'événements, horodatage appareil + serveur, idempotence, file durable et DLQ, reprise réseau et stockage local du boîtier.

**E-04. Calcul des kWh et des coûts insuffisant pour la facturation.**\
`backend/src/services/energyService.ts:46-135` somme des valeurs portant le nom `energy_kwh` sans distinguer un incrément par intervalle d'un index cumulatif. Le coût est basé sur `ENERGY_COST_PER_KWH`, une valeur globale unique (`:110`), sans différenciation SNEL, groupe, solaire, maintenance ou client. La déduplication des compteurs parent/enfant n'est pas implémentée dans ce service. **Action :** contrat de mesure `ENERGY_DELTA` vs `ENERGY_REGISTER`, topologie de comptage, attribution de source, tarifs versionnés par site/source, calcul monétaire décimal et piste d'audit.

**E-05. Gestion des clés API à renforcer.**\
`backend/prisma/schema.prisma:213-227` enregistre `ApiKey.key` comme chaîne brute et `backend/src/services/apiKeyService.ts:5-20` renvoie les clés complètes à la liste. **Action :** générer et ne montrer la clé qu'une seule fois ; stocker une empreinte adaptée, ne conserver qu'un préfixe d'affichage, rotation/révocation, contrôle du scope et des quotas.

**E-06. Dispositifs de protection non décrits.**\
Le modèle actuel n'exprime ni le circuit, ni la criticité, ni les relais/contacteurs, ni les interverrouillages physiques, ni les limitations temporelles. **Action :** ajouter `Circuit`, `ControlEndpoint`, `ElectricalLoad`, les capacités et contraintes de fonctionnement ; protections physiques indépendantes du logiciel/cloud.

### Moyens — à planifier

**M-01. Configurations et scripts de démonstration à nettoyer avant déploiement.**\
`infrastructure/scripts/02_seed.sql:6` utilise une valeur de plan `CORE` incompatible avec l'enum actuel (`BASIC`, `PRO`, `BUSINESS`, `ENTERPRISE`). Le script inclut un compte de démonstration et un hash connu dans la source ; ne pas utiliser ces données sur un environnement accessible. Les fichiers `*.bak`, `*.save`, doublons de configuration Next et anciens dossiers d'authentification devraient être écartés du paquet de production après contrôle.

**M-02. Vérification de build insuffisante dans la configuration.**\
`frontend/next.config.js:3-8` désactive l'échec de build en cas d'erreur TypeScript ou ESLint. Le dépôt comporte aussi `next.config.mjs`, ce qui mérite un choix unique. **Action :** restaurer les garde-fous de compilation en CI ; tests frontend/backend.

**M-03. Réseau de production et fonctions de sécurité à valider.**\
`docker-compose.yml` utilise Cloudflare Tunnel et un Traefik interne HTTP, ce qui peut être cohérent derrière un tunnel, mais la configuration complète du tunnel, les restrictions Grafana (port hôte 3001), TLS de bout en bout, sauvegardes et restauration ne sont pas démontrées par l'archive. Prévoir validation en environnement réel et fermer les accès non nécessaires.

## 3. Architecture proposée pour V2

Principe **un seul module fonctionnel « Gestion énergétique »**, plusieurs entités techniques indépendantes.

- **Conserver :** `Tenant`, `Building`, `Zone`, `Device`, `DeviceState`, `Automation`, `Alert`, `Gateway` ; enrichir seulement leurs relations nécessaires.
- **Phase A — fondations :** `EnergySource`, `DistributionBoard`, `Circuit`, `ElectricalLoad`, `MeteringPoint` et `MeterReadingDefinition` (type d'index, sens de flux, unité, méthode de calcul) ; `EnergyConnection`/`SourceFeed` pour la topologie réelle si nécessaire.
- **Phase B — commandes :** `ControlEndpoint`, `DeviceCommand`, `CommandAcknowledgment`, `AutomationExecution`, politiques `LoadPriority`, `OperatingConstraint`, avec audit trail et expiration.
- **Phase C — finance et opération :** `EnergyTariff`, `EnergyCostRecord`, `FuelTank`, `FuelReading`, `MaintenanceTask` ; prévoir les unités USD/CDF et taux de change datés.

**Contrainte d'architecture multi-tenant :** `tenantId` cohérent sur chaque relation, clés étrangères et vérifications de relation par client et bâtiment, contrôle d'accès dans les API, MQTT et WebSocket. **Contrainte IoT :** aucune commande physique critique dépendant exclusivement du cloud. **Contrainte financière :** un compteur parent et ses sous-compteurs ne peuvent pas être totalisés deux fois.

## 4. API V2 suggérées (noms à confirmer lors de la conception)

- `GET/POST /api/v1/energy/sources` ; `GET/POST /api/v1/energy/circuits` ; `GET/POST /api/v1/energy/loads` ; `GET/POST /api/v1/energy/meters`.
- `POST /api/v1/energy/commands` retourne `202 Accepted` et `commandId` (jamais un état physique confirmé avant retour matériel).
- `GET /api/v1/energy/commands/:id` fournit l'état et l'historique de la commande.
- `POST /api/v1/energy/automations/simulate` : simulation sans publication MQTT vers un équipement réel.
- `GET /api/v1/energy/source-history` : historique de provenance de l'énergie.

Les routes existantes ne sont pas supprimées ; elles seront maintenues ou adaptées avec compatibilité ascendante.

## 5. Ordre de travail recommandé

| Phase | Travail | Condition de passage |
| --- | --- | --- |
| **0 — Stabiliser** | Corriger isolation Socket.IO/MQTT ; authentification ; confirmation des commandes ; validation de télémétrie ; plan SQL Timescale et tests | Aucun défaut bloquant sur tests de séparation des tenants, commandes et connexion |
| **1 — Modèle** | Migrations additives des sources, tableaux, circuits, charges et points de mesure ; mapping des `Device` existants | Migration avant/arrière vérifiée sur copie de données fictives |
| **2 — API en lecture seule** | CRUD autorisé et lecture des mesures/topologies ; calculs énergétiques cohérents | Tests API et rapports qui ne doublent pas les kWh |
| **3 — Automatisation simulée** | Moteur de décisions, règles de priorité, journalisation, interface de simulation | Scénarios normaux et défaillants testés ; aucun relais réel actionné |
| **4 — Pilotage pilote** | Contrôleur local, mécanismes d'acquittement, commandes expirables et protections matérielles, site d'essai limité | Validation électrique sur banc, tests pertes réseau, arrêt d'urgence et retour d'état |
| **5 — Commercialisation** | Carburant, tarification, maintenance, alertes, prépaiement après conformité | Mesures validées, documentation et obligations commerciales vérifiées |

## 6. Premier ticket de développement prêt à exécuter

**Ticket AFR-V2-001 — Stabilisation des commandes et de l'accès temps réel.**

**Périmètre :** `backend/src/server.ts`, `backend/src/middleware/*`, `backend/src/services/deviceService.ts`, `backend/src/services/automationEngine.ts`, `backend/src/services/mqttWorker.ts`, `frontend/src/lib/api.ts`, `frontend/src/app/(auth)/login/page.tsx`, `frontend/src/app/(dashboard)/devices/page.tsx` et tests nouveaux.

**Règles de livraison :**
1. Authentifier toute socket et autoriser l'accès aux salles par tenant et bâtiment.
2. Refuser les métriques MQTT si tenant, bâtiment ou appareil ne correspondent pas ; développer une stratégie ACL Mosquitto par boîtier.
3. Ne jamais enregistrer une commande comme exécutée tant qu'un acquittement ou état matériel fiable n'est pas reçu ; conserver un journal.
4. Corriger `0` comme valeur de déclenchement valide ; attendre les erreurs MQTT ; empêcher le déclenchement non autorisé.
5. Uniformiser la gestion des cookies JWT et l'URL de l'API entre développement et production ; sécuriser les modifications authentifiées contre les requêtes croisées.
6. Ajouter tests d'isolation inter-clients, d'échec de commande, de reconnexion, de commande expirée, de session cookie et de charge critique non délestable.

**Tests de recette attendus :**
- Un utilisateur du client A ne reçoit aucun événement d'un bâtiment du client B.
- Un appareil usurpant un topic ne peut pas attribuer des mesures à un autre client.
- Une commande MQTT envoyée, mais non acquittée, reste `PENDING/SENT`, jamais `CONFIRMED`.
- Une mesure `0` déclenche correctement une règle `lte/eq` qui la cible.
- Une coupure du broker ne conduit pas à inscrire une commande comme exécutée.
- Les écrans existants fonctionnent toujours et ne présentent plus des états non confirmés comme réels.

## 7. Limites de l'audit et précautions

Cet audit est fondé sur une **lecture statique des fichiers fournis**, et non sur un pentest, un scan de vulnérabilités en ligne, des tests de charge, une compilation complète ou une vérification du serveur réel. Les dépendances `node_modules` ne sont pas incluses dans l'archive, la base de données et les identités matérielles de production ne sont pas accessibles. Les sévérités indiquent le **risque si la fonctionnalité est exposée ou utilisée en réel**, et non une compromission démontrée.

Aucun fichier du dépôt d'origine, aucune donnée de production et aucune configuration de serveur n'ont été modifiés.
