# AFRIXORA Energy Management V2 — Prompts Codex pour VS Code

**Édition :** 21 novembre 2026\
**Référence source :** archive `afrixora-platform-main (1).zip` remise après fusion de `fix-audit-p0` vers `main`, confrontée au rapport de vérification et au patch `AFRIXORA_P0_V2_Patch_Integration.patch`.\
**Statut :** instructions de développement, **aucune modification du dépôt GitHub ni du serveur de production réalisée par ce document**.

## Comment utiliser ce guide

1. Ouvrir dans VS Code **le dépôt Git local AFRIXORA**, branche `main` à jour. Faire une sauvegarde ou assurer la disponibilité d'une copie sûre, et ne pas travailler directement sur la production.
2. Ouvrir l'extension Codex dans VS Code, lui donner accès au dossier du projet et utiliser les prompts **dans l'ordre** ci-dessous. Le premier message est la **charte permanente**, à envoyer au début de la session ; ensuite envoyer **un seul prompt de phase à la fois**. Si la session Codex perd le contexte, renvoyer la charte.
3. **Ne passer à la phase suivante qu'après examen du diff et des résultats des tests.** Si un test échoue ou si une information manque, rester sur la phase en cours.
4. Le patch P0+V2 est un fichier distinct. Si le patch est souhaité, le télécharger sur l'ordinateur et donner son **chemin local réel** à Codex. Ne pas inventer son emplacement. Il ne remplace pas une vérification des différences Git.
5. Conserver les secrets, bases de production, sauvegardes, certificats et identifiants privés **hors du contexte partagé avec Codex**. Des fichiers `.env.example` sans secrets sont autorisés.

### Constat vérifié dans l'archive de référence

- Backend : Express/TypeScript, Prisma 5, PostgreSQL/TimescaleDB, MQTT, Redis, Socket.IO ; frontend : Next.js 14, React, Tailwind, Zustand.
- Le schéma `backend/prisma/schema.prisma` contient `Tenant`, `User`, `Building`, `Zone`, `Device`, `DeviceState`, `Automation`, `Alert`, `Gateway`, `ApiKey`, `ApiLog`, `SubscriptionHistory`.
- Les routes existantes incluent `backend/src/routes/energy.ts`, `devices.ts`, `automations.ts`, `readings.ts`, enregistrées sous `/api/v1` par `backend/src/app.ts`.
- Les données temporelles existent dans `public.sensor_readings` et `public.sensor_readings_hourly`, configurées par `infrastructure/scripts/01_schema.sql`. Ne pas les recréer aveuglément.
- Le `main` reçu possède les corrections P0 mais **pas** le modèle `DeviceCommand` du patch V2 ; le service `deviceService.control` modifie encore `DeviceState` après une simple publication MQTT.
- Le patch de stabilisation a été vérifié sur le ZIP reçu : **14 fichiers modifiés, 4 créés**, aucun supprimé. Toute nouvelle évolution du dépôt Git peut toutefois rendre cette compatibilité obsolète.
- **Écart connu entre patch et cible V2 :** le patch journalise `DeviceCommand` directement par `deviceId` et utilise `CONFIRMED` après déclaration de l'état par le boîtier ; la cible ajoute `ControlEndpoint` et une vérification physique distincte. Codex doit considérer le patch comme un **socle transitoire**, jamais comme l'implémentation terminée des commandes matérielles. Ne pas déclencher ni déclarer vérifiée une coupure réelle sans retour matériel indépendant.
- Les documents `docs/AFRIXORA_CONTEXT.md` et `docs/AFRIXORA_RULES.md` décrivent l'ancien périmètre MVP : conserver leurs règles de sécurité et de simplicité, mais traiter **l'extension Energy Management V2 comme un changement de périmètre validé**, sans changer la pile technologique.

---

# PROMPT 0 — Charte permanente à donner à Codex

```text
Tu es l'ingénieur principal chargé de faire évoluer AFRIXORA, plateforme SaaS IoT multi-tenant de gestion énergétique destinée notamment aux entreprises de RDC.

MISSION
Transformer le module Energy existant en AFRIXORA Energy Management V2, un module UNIFIÉ de surveillance des sources, mesure des circuits et charges, estimation financière, pilotage maîtrisé, automatisation et maintenance, sans remplacer l'application ni dupliquer l'existant.

SOCLE À RESPECTER
- Backend monolithique Express + Node.js + TypeScript + Prisma 5, PostgreSQL/TimescaleDB, Redis, MQTT/Mosquitto et Socket.IO.
- Frontend Next.js 14 App Router + React + TypeScript + Tailwind + Zustand + Recharts.
- Conserver les modèles existants Tenant, Building, Zone, Device, DeviceState, Automation et autres modèles utilisés.
- Conserver les routes actuelles sous /api/v1, l'organisation routes/services/middleware/utils et les données sensor_readings.
- Lire les fichiers réellement présents avant toute intervention. Lire les consignes applicables du dépôt, dont docs/AFRIXORA_CONTEXT.md et docs/AFRIXORA_RULES.md, en notant que leur limite de périmètre MVP est remplacée par l'extension V2 approuvée ; les exigences de sécurité et de simplicité restent valables.
- Travailler par petites modifications testables. Ne pas construire de microservices, Kafka, GraphQL, architecture CQRS ou second backend énergétique.

RÈGLES NON NÉGOCIABLES
1. Ne jamais déployer sur la production, modifier une base de production, exécuter de migrations avec une DATABASE_URL incertaine, ni afficher ou modifier des secrets.
2. Ne jamais supprimer/renommer des tables, fichiers ou données pour faciliter une migration. Migrations additives et compatibles avec l'existant ; sauvegarde et restauration de test obligatoires avant tout déploiement.
3. Ne pas committer, pousser, fusionner, ouvrir une PR ni exécuter de commandes Git destructives sans mon autorisation explicite. Si git status indique des changements non sauvegardés ou des divergences de branche, stoppe-toi et explique la situation.
4. Les commandes physiques sont DÉSACTIVÉES par défaut : AFRIXORA_DEVICE_CONTROL_ENABLED=false et AFRIXORA_AUTOMATION_COMMANDS_ENABLED=false. Aucun actionneur réel ne doit être commandé pendant nos tests logiciels.
5. Ne jamais considérer « MQTT publié », « ACK reçu » et « état physique confirmé » comme équivalents. Pas de modification optimiste de l'état réel d'un appareil.
6. La protection contre les courts-circuits/surtensions, l'interverrouillage SNEL-groupe-onduleur, le délestage de sécurité et l'arrêt d'urgence relèvent de protections matérielles locales validées par un professionnel qualifié, jamais d'une logique cloud.
7. Chaque accès à une donnée doit contrôler tenantId, bâtiment, rôle et droits nécessaires. Toutes les relations entre ressources doivent appartenir au même tenant et au même site. Tester explicitement les tentatives d'accès inter-tenant.
8. APIs validées par Zod côté serveur, erreurs lisibles sans divulgation d'informations sensibles, logs structurés, pagination et validation des paramètres.
9. MQTT : identités et ACL par équipement, TLS en configuration de production, topics stricts, commandes non retenues, expirations, idempotence, horodatages, anti-rejeu et accusés de réception contrôlés.
10. Pas de calcul de consommation fictivement exact : distinguer puissance instantanée, énergie cumulée, énergie de période, mesures manquantes et estimations. Éviter de compter deux fois un compteur général et ses sous-compteurs.
11. Pour les montants, utiliser Decimal et documenter devise, tarif, date d'effet et taux USD/CDF. Ne jamais qualifier une suspicion de carburant de vol avéré.
12. Une nouvelle fonction ne doit pas introduire une régression dans Building, Energy, Administration, Auth, Alertes ou Rapports.

MODE DE TRAVAIL
Pour chaque phase :
A. Inspecte d'abord les fichiers pertinents et présente un plan court avec les risques.
B. Applique UNIQUEMENT le périmètre demandé pour la phase en cours.
C. Ajoute/actualise les tests appropriés ; exécute les commandes possibles avec leurs résultats exacts.
D. Présente : fichiers créés/modifiés ; raisons ; tests réussis/échoués/non exécutés ; migrations éventuelles ; risques restants ; action proposée suivante.
E. Si tu es bloqué, explique pourquoi et propose un correctif circonscrit ; ne prétends jamais qu'une étape est validée si elle ne l'est pas.

CONFIRME d'abord le dépôt, la branche, la propreté du working tree et les fichiers lus. ATTENDS ensuite mon prompt de phase.
```

---

# PROMPT 1 — Audit de branche et intégration du correctif de stabilisation

**But :** intégrer les 14 modifications et 4 ajouts V2 seulement s'ils manquent, puis valider la base.

```text
PHASE 1 — STABILISATION DU MAIN APRÈS FUSION P0

Contexte : la branche main GitHub a déjà reçu la fusion fix-audit-p0. Nous avons un patch nommé AFRIXORA_P0_V2_Patch_Integration.patch, prévu pour ajouter le journal de commandes V2 et les protections associées. Dans l'archive main précédemment examinée, ces ajouts manquaient. Mon dépôt local peut avoir évolué : vérifie avant d'agir.

1. Sans modifier de fichiers, inspecte : git status, branche, dernier commit, historique pertinent, package.json, backend/prisma/schema.prisma, backend/src/services/deviceService.ts, mqttWorker.ts, automationEngine.ts, backend/src/routes/devices.ts, frontend/src/app/(dashboard)/devices/page.tsx, frontend/src/components/devices/DeviceCard.tsx, docs/AFRIXORA_P0_V2_INTEGRATION.md s'il existe.
2. Si le working tree est propre, propose une branche de travail feature/afrixora-v2-stabilisation créée depuis main à jour. Ne crée pas de branche et ne modifie pas Git si des changements locaux risquent d'être écrasés ; demande alors comment les préserver.
3. Vérifie si DeviceCommand, la migration 20261121000100_device_command_journal et les deux feature flags sont déjà présents. Si oui, n'applique pas de correctif en double.
4. Si je te fournis le chemin local du patch : exécute git apply --check sur cette version du dépôt. Si le check échoue, analyse les différences et prépare une adaptation manuelle ciblée ; ne force pas le patch. Si le check réussit et que le patch n'est pas déjà appliqué, applique-le seulement sur la branche de travail après vérification, puis examine chaque différence.
5. Vérifie particulièrement : tenantId sur commandes et ACK ; séparation SENT / ACKNOWLEDGED / CONFIRMED ; pas de DeviceState mis à jour après simple publish ; gestion de commande périmée, erreur broker, absence d'accusé, mauvais appareil ; pas de commande optimiste en interface ; cookie httpOnly, Origin et Socket.IO ; suppression de tenant et d'appareil avec journal de commandes ; logique DeviceCard.tsx si réutilisable. **Si CONFIRMED n'est qu'un état rapporté par firmware/MQTT, le signaler comme non vérifié physiquement et proposer une distinction explicite avant toute utilisation dans un circuit électrique.**
6. Garantir : AFRIXORA_DEVICE_CONTROL_ENABLED=false et AFRIXORA_AUTOMATION_COMMANDS_ENABLED=false dans tous les environnements de test et de référence ; ne pas envoyer de commande à un équipement physique.
7. Vérifier le schéma Prisma et la migration sur une base locale jetable UNIQUEMENT si la connexion est clairement identifiée comme telle ; ne jamais lancer de migration sur une adresse inconnue.
8. Exécuter les contrôles possibles :
   - backend : npm ci ; npx prisma validate ; npx prisma generate ; npm run typecheck ; npm test ; node --test tests/v2_p0_isolated.test.cjs (si ce fichier existe après intégration)
   - frontend : npm ci ; npm run typecheck ; npm run build
   - à la racine : git diff --check
   Respecter les commandes du projet si leur réalisation nécessite de configurer d'abord un environnement de test.
9. Réponds avec un tableau « déjà présent / ajouté / à corriger », une liste exacte de fichiers touchés, des tests et de toute anomalie bloquante. Ne passe pas à la phase suivante.

CRITÈRE D'ACCEPTATION : zéro commande physique par défaut ; aucune fausse confirmation d'exécution ; patch appliqué ou équivalent validé sans duplication ; pas de régression d'accès inter-tenant.
```

**Point de contrôle humain :** ne poursuivre que si les tests backend/frontend et le statut de migration sont compris. Un test isolé ne suffit pas à qualifier le projet de prêt pour la production.

---

# PROMPT 2 — Modélisation Prisma de la topologie électrique

```text
PHASE 2 — MODÈLES DE DONNÉES ENERGY MANAGEMENT V2

Travaille sur la branche de stabilisation validée. Avant de changer le schéma, inspecte la version ACTUELLE de backend/prisma/schema.prisma, toutes les migrations, et les services Building/Device/Energy. Ne recrée jamais DeviceCommand s'il a été ajouté en phase 1.

Objectif : décrire la distribution d'électricité sans confondre objets physiques et boîtiers IoT.

Créer de façon additive et cohérente avec les conventions Prisma existantes :
- EnergySource : types techniques de référence `GRID`, `GENERATOR`, `PV_INVERTER`, `BATTERY_INVERTER`, `OTHER` (libellés affichés SNEL, groupe, solaire, batterie), avec `tenantId`, `buildingId`, capacité et métadonnées. Réexaminer ces types selon la topologie réelle et l’évolution du modèle.
- EnergyBus : point commun de distribution au sein d'un bâtiment.
- SourceFeed : relation topologique entre source et bus, état/commutation documenté ; ne pas supposer que des sources peuvent être parallélisées.
- DistributionBoard : tableau électrique.
- Circuit : départ électrique, tableau parent, désignation, priorité critique/importante/flexible, informations de protection, indicateur « commandable » initialement faux.
- ElectricalLoad : charge physique consommatrice (climatiseur, éclairage, pompe, froid, machine), zone facultative, puissance nominale, contraintes d'exploitation ; distincte d'un Device IoT.
- Association charge–circuit : privilégier un schéma simple garantissant le circuit effectif ; si un historique est requis, le concevoir explicitement plutôt que d'inventer des relations contradictoires.
- MeteringPoint : point logique de mesure relié à un `Device` compteur existant, rattaché exactement à une portée parmi `SOURCE`, `FEED`, `BOARD`, `CIRCUIT`, `LOAD`, conformément au cahier d’architecture. Pour mesurer un `EnergyBus` directement, documenter et valider d’abord une extension explicite `BUS`. Conserver unité, type de mesure (cumulée, intervalle, instantanée), emplacement et qualité.
- ControlEndpoint : lien entre un circuit/une charge pilotable et un Device/contrôleur approuvé ; séparation des capacités déclarées, autorisations et état réel.

Règles : tenantId et buildingId cohérents ; relations vers les modèles Building/Zone/Device conservées ; index sur tenantId/buildingId et clés utiles ; contraintes sur suppression ; aucune référence inter-tenant possible ; noms normalisés et états explicités. Une relation ne doit pas permettre de relier deux bâtiments différents. Conserver la structure mono-backend.

Livrables : schéma Prisma modifié, migration SQL additive générée et revue, diagramme textuel des relations, exemples de fixtures NON sensibles et tests d'intégrité. Utilise prisma migrate dev exclusivement sur une base locale isolée et contrôlée ; jamais db push sur la production. Si pas de base locale : prépare la migration et marque le test comme « non exécuté », sans présenter un succès fictif.

Critères : l'on peut enregistrer une charge non connectée, puis associer un capteur ; l'on peut décrire une source, un tableau, ses circuits et ses charges ; une relation inter-tenant est rejetée ; les modèles historiques restent intacts.
Ne code pas encore les interfaces ni les règles automatiques.
```

---

# PROMPT 3 — API et services de gestion des sources, circuits et équipements

```text
PHASE 3 — API ENERGY TOPOLOGY ET SERVICES MÉTIERS

Lis d'abord les routes/services existants : backend/src/app.ts ; routes/buildings.ts, devices.ts, energy.ts ; services/buildingService.ts, deviceService.ts ; middleware/authenticateOrApiKey.ts, authorize.ts, validate.ts ; schéma Prisma réel.

Développe UNIQUEMENT des API REST cohérentes avec /api/v1 et l'architecture existante pour consulter/créer/modifier/archiver : sources d'énergie, bus, tableaux, circuits, charges physiques, points de mesure et canaux de commande (déclaratifs uniquement, pas d'action physique).

Principes :
- Rechercher la convention de route du projet avant d'en ajouter une. Ne pas créer de second serveur ni casser les endpoints /api/v1/energy/summary, /consumption, /by-device et /by-zone.
- Authentifier, appliquer RBAC et vérifier les permissions sur le bâtiment ; tenantId provient du contexte authentifié, jamais du JSON client.
- Valider tous les champs en Zod, rejeter les IDs étrangers, contraintes impossibles et relations inter-tenant/inter-bâtiment.
- Services métier séparés des handlers HTTP ; pagination/filtrage ; soft-delete ou interdiction de suppression si des historiques ou références existent.
- Erreurs HTTP appropriées (400/401/403/404/409), transactions pour mutations multi-objets et logs sans données sensibles.
- Écrire des tests positifs et négatifs incluant tenant A ne pouvant jamais accéder aux ressources du tenant B.
- Documenter les routes et fournir des exemples JSON anonymisés.

Critères : API complète de topologie sans commande réelle, sans duplication de la base d'équipements existante, tests de permissions réussis.
Termine par les fichiers modifiés et résultats exacts, puis arrête-toi.
```

---

# PROMPT 4 — Télémétrie, compteurs et calculs énergétiques

```text
PHASE 4 — MESURES, QUALITÉ DES DONNÉES ET ANALYTIQUE

Inspecte avant modification : infrastructure/scripts/01_schema.sql (sensor_readings, sensor_readings_hourly), backend/src/services/mqttWorker.ts, energyService.ts, energyQueries.ts ; routes/readings.ts et energy.ts ; la nouvelle entité MeteringPoint.

Objectif : relier les mesures existantes à la topologie V2, sans recréer une deuxième table de télémétrie ni casser les anciens capteurs.

Travail :
1. Proposer un contrat de télémétrie versionné supportant deviceId, capturedAt, metric, value, unit, type de mesure, bootId, sequence, qualité et origine, en conservant la compatibilité avec les messages MQTT hérités.
2. Vérifier l'identité/ACL de l'émetteur, la cohérence topic/tenant/building/device, le format, les valeurs non finies et les événements mal horodatés.
3. Conserver les mesures en cas de coupure : ingestion idempotente, déduplication adaptée et stratégie de retry explicite. Ne jamais promettre « aucune perte » sans test matériel. Les mécanismes de cache/buffer ne doivent pas compter comme preuve de persistance garantie.
4. Distinguer puissance W/kW, énergie cumulée kWh et énergie par période. Gérer les resets de compteur et les données manquantes.
5. Éviter l'addition des sous-compteurs et du compteur principal dans une même consommation totale. Traiter explicitement les flux photovoltaïques/batterie et les périodes où la source est inconnue.
6. Corriger les incohérences de calcul actuellement constatées si nécessaire, avec des tests comparant des séries connues. Prendre en charge le fuseau du bâtiment (par défaut adapté au site, pas une conversion fixe implicite Afrique/Kinshasa pour toute la RDC).
7. Ajouter des tests d'échec réseau, MQTT invalide, données égales à zéro, doublons, compteurs cumulés, changement de source.

Livrables : modifications ciblées de service + schéma/indices seulement si nécessaires, documentation du contrat MQTT et des méthodes de calcul, tests et limites. Ne touche ni aux commandes électriques ni au prépaiement.
```

---

# PROMPT 5 — Automatisation, équilibrage et simulation (sans action physique)

```text
PHASE 5 — MOTEUR D'AUTOMATISATION ÉNERGÉTIQUE EN MODE SIMULATION

Lis backend/src/services/automationEngine.ts, automationService.ts, utils/automationSchemas.ts, modèle Automation, DeviceCommand s'il existe, DeviceState, ainsi que Circuit et ElectricalLoad V2.

Objectif : proposer des décisions d'économie d'énergie sans agir sur le réseau électrique pendant cette phase.

Implémente un simulateur « dry-run » de règles, avec historique AutomationExecution, qui permette :
- d'évaluer la demande mesurée par circuit/source et les seuils configurés ;
- de classer les charges CRITICAL / IMPORTANT / FLEXIBLE ;
- de simuler un délestage progressif des charges FLEXIBLE lorsque la puissance disponible devient insuffisante ;
- de respecter les périodes minimales marche/arrêt, l'hystérésis, les délais anti-oscillation, le nombre maximal d'actions par heure et les exclusions de maintenance ;
- de distinguer mesure manquante/stale/invalide et mesure 0, en privilégiant l'inaction en cas de doute ;
- de journaliser « règle, données d'entrée, décision, justification, résultat simulé, date » ;
- d'exposer une route de simulation accessible seulement aux rôles autorisés ;
- de prévoir un interrupteur pour désactiver complètement une règle.

Ordre prioritaire : protections matérielles locales > verrouillage maintenance > autorisations et règles du site > action manuelle autorisée > automatisation > optimisation économique.

Interdictions : aucune commande MQTT d'actionneur depuis ce simulateur ; aucune modification forcée du DeviceState observé ; ne jamais toucher automatiquement un circuit CRITICAL ; ne pas créer un système de transfert de sources piloté depuis le cloud.

Tests obligatoires : surcharge, retour à la normale, seuil oscillant, mesure = 0, donnée obsolète, source inconnue, circuit critique, mauvais tenant et simulation idempotente.
Termine avec un exemple de simulation et son rapport explicatif, sans commande physique.
```

---

# PROMPT 6 — Interface Energy Management V2 intégrée à l'existant

```text
PHASE 6 — INTERFACE UNIFIÉE DE GESTION ÉNERGÉTIQUE

Inspecte les composants existants : frontend/src/app/(dashboard)/energy/page.tsx ; devices/page.tsx ; automations/page.tsx ; buildings/[id]/page.tsx ; frontend/src/app/(dashboard)/layout.tsx ; frontend/src/lib/api.ts ; store, hooks et composants réutilisables.

Élargis LE MODULE ÉNERGIE EXISTANT, sans créer une application distincte :
- Vue globale : kWh, kW, source actuelle confirmée (ou inconnue), coût selon tarif, qualité des données, alertes.
- Sources : SNEL, groupe, solaire, batterie, disponibilité, historique de basculement uniquement lorsque mesuré/confirmé.
- Distribution : tableaux, circuits, charges ; états et priorités ; liens vers compteurs/contrôleurs.
- Appareils : garder le registre Device actuel ; afficher en complément la charge physique correspondante sans duplication des fiches.
- Automatisation : liste des règles, priorités et bouton SIMULER ; historique des décisions et explications.
- Finances : consommation et dépenses estimées selon la source, avec hypothèses et limites visibles.
- Maintenance/alertes : états et historique de fonctionnement sans prétendre remplacer les protections du tableau.

Règles UX : responsive mobile et PC, français professionnel, états loading/empty/error, contrôle d'accès des vues, aucun état fictif présenté comme une mesure réelle, ne pas remplacer les composants fonctionnels ni les routes existantes. Les états 'commande demandée', 'commande envoyée' et 'état physiquement confirmé' doivent être visuellement distincts.

Utilise les services API créés ; ne conserve pas de données de démonstration codées en dur dans le produit. Les données simulées ne doivent apparaître que dans des tests ou démonstrations explicitement signalées.

Valider npm run typecheck et npm run build côté frontend ; ajouter tests d'interaction adaptés aux capacités du dépôt et documenter les pages modifiées.
```

---

# PROMPT 7 — Finances, carburant, maintenance et résilience hors connexion

```text
PHASE 7 — FONCTIONS AVANCÉES, EN PETITS LOTS

Ne réalise pas tout d'un coup. Commence par dresser un inventaire de ce qui existe réellement dans Energy, Reports, Alerts et les nouveaux MeteringPoint. Propose 4 sous-lots indépendants à implémenter successivement avec tests propres ; démarre uniquement le premier sous-lot, attends validation avant les autres.

SOUS-LOT 7A — Coûts et tarifs :
- Tarifs de sources avec périodes d'effet, unités, devises USD/CDF et taux historisé ; Decimal, pas Float pour les montants ; calcul distinguant mesure réelle, estimation et donnée manquante.
- Coût du groupe : carburant mesuré ou estimé, prix du litre, heures moteur et coût de maintenance ; éviter les économies garanties.
- Tester plusieurs périodes tarifaires, mesures incomplètes, multi-compteurs et arrondis.

SOUS-LOT 7B — Groupe et carburant :
- Modèle de cuve/sonde/calibration et relevés ; détection d'écarts suspects entre variations de niveau, remplissages déclarés et production électrique.
- Une anomalie n'est PAS une preuve de vol. Tenir compte de la géométrie de cuve, du bruit du capteur, de la température et de la période d'arrêt/marche.
- Alertes et rapports, sans ordre de coupure sur moteur ou alimentation.

SOUS-LOT 7C — Maintenance :
- Heures moteur, calendriers selon constructeur, événements, tickets, responsable, interventions, journal d'audit.
- Distinguer maintenance prédictive validée par modèle de données et rappels d'entretien programmés ; ne pas appeler « prédictif » un simple seuil horaire.

SOUS-LOT 7D — Hors connexion et notifications :
- Contrat edge pour buffer local persistant, RTC, bootId/sequence, ACK applicatif, resynchronisation et déduplication ; pour le firmware non présent dans le dépôt, FOURNIR LA SPÉCIFICATION sans prétendre l'avoir implémenté.
- Notifications SMS/WhatsApp via adaptateurs optionnels si fournisseurs et identifiants sont réellement configurés ; ne pas coder de faux envois réussis.
- Tests de réseau coupé/reprise, livraison en double, lot partiellement confirmé, horloge incorrecte.

Prendre un sous-lot à la fois ; expliquer le changement de schéma/API, les migrations, le coût opérationnel, les risques et les tests avant le lot suivant.
```

**Prépaiement (travail séparé, non autorisé à commuter l'alimentation)** : après la validation juridique, commerciale et matérielle en RDC, concevoir dans un ticket futur un portefeuille/ledger d'énergie et une intégration Mobile Money vérifiant cryptographiquement les webhooks, l'idempotence et la réconciliation. Aucune coupure automatique d'un locataire n'est autorisée dans ce chantier sans validation supplémentaire.

---

# PROMPT 8 — Validation intégrée, sécurité et préparation de la livraison

```text
PHASE 8 — REVUE D'INTÉGRATION ET PRÉPARATION D'UNE PULL REQUEST

Tu agis comme relecteur qualité/sécurité du travail effectué dans AFRIXORA Energy Management V2, pas comme générateur de nouvelles fonctionnalités.

1. Inventorie les modifications par rapport au main initial : modèles, migrations, routes, services, frontend, MQTT, automatisations, documentation, flags.
2. Vérifie compilation/types/lint/test avec les scripts réellement disponibles dans package.json :
   backend : npm ci, npx prisma validate, npx prisma generate, npm run typecheck, npm test, npm run build ;
   frontend : npm ci, npm run typecheck, npm run build ;
   tests isolés V2 si disponibles ; validation docker compose config avec environnement de test anonymisé.
3. Vérifie une BASE DE TEST ISOLÉE : migrations Prisma additives, sauvegarde/restauration testées, absence de perte/altération des données historiques, possibilité de revenir à l'application précédente sans suppression de tables. Ne PAS exécuter migrate deploy sur la production.
4. Tests intégrés : PostgreSQL/TimescaleDB, Redis, Mosquitto avec ACL d'essai, API REST, Socket.IO, frontend ; permissions tenant A/tenant B ; mauvais bâtiment, rôle insuffisant, JWT expiré, relecture/duplication MQTT, ACK d'un autre appareil et injection de données invalides.
5. Test de commande sans actionneur réel : disabled flag, SENT sans confirmation, ACK, CONFIRMED en tant que retour déclaré si seul le boîtier l’atteste, vérification physique distincte si des capteurs fiables sont disponibles, EXPIRED/FAILED, commandes duplicatives et périmées.
6. Vérifie que les calculs de coûts/énergie sont cohérents, qu'on n'additionne pas les sous-compteurs au total, et que les données estimées sont identifiées comme telles.
7. Inspecte les risques de sécurité : injection SQL, XSS, CSRF/origine, cookies, CORS, ACL MQTT, rate limiting, secrets, privilèges, logs, limites upload, accès API, autorisations Socket.IO, et état des scripts CI.
8. Documente le mode configuration/test, les nouvelles routes, la stratégie de migration de staging, les rollback applicatifs et les fonctions volontairement désactivées ; conserve une seule documentation V2 centrale.
9. Fournis une CHECKLIST GO/NO-GO avec trois colonnes : réussi, échoué, non testé. Tout point non testé doit rester explicitement non validé. Prépare le titre, la description et le résumé de Pull Request, mais NE CRÉE PAS la PR et ne pousse rien sans mon autorisation.

CRITÈRES D'ACCEPTATION : aucune erreur critique connue non expliquée, tests reproduisibles, aucun contrôle électrique actif sans procédure de validation terrain, pas de régression sur les fonctions existantes, et rapport de limites transparent.
```

---

## Commandes utiles dans le terminal VS Code (à exécuter après vérification du dossier)

```bash
# À la racine du dépôt Git, AVANT toute modification
pwd
git status --short
git branch --show-current
git log -1 --oneline

# Les commandes suivantes nécessitent un arbre de travail propre
# et un main local aligné avec origin/main.
git switch main
git pull --ff-only origin main
git switch -c feature/afrixora-v2-stabilisation

# Vérifier un patch téléchargé, en donnant son vrai chemin sur l'ordinateur :
git apply --check "<chemin_local_reel>/AFRIXORA_P0_V2_Patch_Integration.patch"
# NE PAS lancer git apply tant que le check n'a pas réussi et que Codex n'a pas
# vérifié que les modifications ne sont pas déjà présentes.

# Backend (sur environnement de développement seulement)
cd backend
npm ci
npx prisma validate
npx prisma generate
npm run typecheck
npm test
npm run build

# Frontend
cd ../frontend
npm ci
npm run typecheck
npm run build

# Revenir à la racine
cd ..
git diff --check
git status --short
```

**Attention :** ne copiez pas littéralement `<chemin_local_reel>` ; remplacez-le par le vrai dossier du patch, ou demandez à Codex de trouver le fichier si vous l'avez ajouté à votre espace de travail. Les scripts qui exigent la base, Redis ou le broker peuvent nécessiter les services de test avant d'être lancés.

## Contrôle à envoyer à Codex à la fin de chaque phase

```text
STOP. Avant que nous passions à l'étape suivante, donne-moi un bilan vérifiable :
1) fichiers modifiés/créés/supprimés et rôle de chacun ;
2) commandes de test réellement exécutées, résultats exacts et logs d'erreur utiles ;
3) tests non réalisés et raisons ;
4) changements de base de données, migrations et compatibilité avec les données existantes ;
5) vulnérabilités/risques restants, en particulier multi-tenant, MQTT et commandes électriques ;
6) preuve que les contrôles physiques restent désactivés ;
7) proposition du prochain petit lot.
Ne passe pas à la phase suivante sans mon feu vert.
```

## Références de travail

- `backend/prisma/schema.prisma` et `backend/prisma/migrations/`.
- `backend/src/services/{deviceService,mqttWorker,automationEngine,energyService,energyQueries}.ts`.
- `backend/src/routes/{devices,energy,automations,readings}.ts`.
- `frontend/src/app/(dashboard)/{energy,devices,automations}/page.tsx`.
- `infrastructure/scripts/01_schema.sql`.
- `docs/AFRIXORA_CONTEXT.md`, `docs/AFRIXORA_RULES.md` ; rapport d'architecture AFRIXORA V2, rapport de vérification main fusionné et patch V2 fournis séparément.
- Documentation officielle Prisma Migrate : https://docs.prisma.io/docs/cli/migrate/dev et https://docs.prisma.io/docs/cli/migrate/deploy.
- Documentation OpenAI Codex : https://developers.openai.com/learn/codex.

**Rappel final :** « développer » et « avoir des tests unitaires réussis » ne signifie pas « prêt pour production ». Le déploiement réel nécessite des essais intégrés, des protections matérielles, un pilote sur charges non critiques et la validation opérationnelle des exploitants.
