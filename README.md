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

### Démonstration du parcours client

Dans `.env.demo`, renseignez `SEED_DEMO_CLIENT_PASSWORD` avec un mot de passe propre au compte client. Avec la démo en cours, lancez `./start-demo.sh --sample-data`, puis connectez-vous avec `client@demo.afrixora.test` dans une session de navigateur dédiée.

Le scénario contient le bâtiment fictif **Centre Horizon (démo)**, deux zones, des appareils, 30 jours de mesures simulées et deux alertes. Le client de démonstration utilise l’offre PRO pour accéder aux exports avec les permissions habituelles. Le chargement peut être relancé pour compléter l’historique horaire. Le mot de passe est défini à la création du compte.

Depuis le tableau de bord, ouvrez **Énergie** pour lire les mesures, marquez une alerte comme lue dans **Alertes**, puis ouvrez **Rapports** pour télécharger le PDF avec le logo AFRIXORA.

## Architecture

- Layer 0 → IoT Devices
- Layer 1 → Edge Gateway (Raspberry Pi)
- Layer 2 → Data & Messaging (TimescaleDB / Redis / Mosquitto)
- Layer 3 → Backend API (Express.js + Socket.IO)
- Layer 4 → Tableau de bord (Next.js 16)

### docker-compose.yml

La configuration de production isole PostgreSQL, Redis et MQTT sur des réseaux dédiés. La surcharge de développement publie des ports sur la boucle locale pour les outils du poste. [Configuration de production](docker-compose.yml) · [Surcharge de développement](docker-compose.dev.yml)

## API de topologie énergétique

Préfixe commun `/api/v1/energy/buildings/:buildingId/topology`. Utiliser une session JWT par cookie ou un jeton Bearer issu de `POST /api/v1/auth/token`. Les écritures par cookie exigent une origine autorisée. Le serveur déduit le tenant de la session et vérifie que le bâtiment est actif.

| Rôle | Autorisations sur la topologie |
|---|---|
| `SUPER_ADMIN`, `TENANT_ADMIN` | Lecture, écriture et gestion des affectations dans le tenant sélectionné |
| `BUILDING_ADMIN` | Lecture, écriture et archivage dans les bâtiments attribués |
| `OPERATOR`, `VIEWER` | Lecture dans les bâtiments attribués |

`PUT /access/:userId` attribue le bâtiment à un utilisateur du tenant. `DELETE /access/:userId` révoque cette affectation. Les deux opérations sont idempotentes et renvoient `204`, avec un corps vide ou `{}` en entrée. Les affectations s’appliquent à la topologie. Les API historiques et Socket.IO conservent leurs règles d’accès.

| Méthode et suffixe | Résultat |
|---|---|
| `GET /:ressource` | `200`, liste paginée |
| `GET /:ressource/:id` | `200`, détail de la ressource, avec `archivedAt` si archivée |
| `POST /:ressource` | `201`, ressource créée |
| `PATCH /:ressource/:id` | `200`, ressource mise à jour. Fournir au moins un champ modifiable |
| `DELETE /:ressource/:id` | `204`, archivage idempotent. Archiver d’abord les dépendances actives |

Les listes acceptent `page` (défaut 1), `limit` (1 à 100, défaut 50), `search` (nom, sans distinction de casse) et `archived` (`false` pour les ressources actives, `true` pour les archives). Elles renvoient `{ data, total, page, totalPages }`. Le code d’un circuit reste réservé dans son bâtiment après archivage.

Exemples fictifs de corps `POST`. Remplacer les UUID de référence par ceux renvoyés lors des créations précédentes ou par ceux des appareils et zones du même bâtiment.

| Ressource | Corps JSON |
|---|---|
| `sources` | `{"name":"Réseau fictif","type":"GRID","ratedPowerW":12000}` |
| `buses` | `{"name":"Bus principal"}` |
| `feeds` | `{"name":"Arrivée principale","sourceId":"00000000-0000-4000-8000-000000000001","busId":"00000000-0000-4000-8000-000000000002"}` |
| `boards` | `{"name":"Tableau principal","busId":"00000000-0000-4000-8000-000000000002","nominalVoltageV":230}` |
| `circuits` | `{"name":"Éclairage","boardId":"00000000-0000-4000-8000-000000000004","code":"ECL-01","priority":"FLEXIBLE"}` |
| `loads` | `{"name":"Éclairage du hall","circuitId":"00000000-0000-4000-8000-000000000005","category":"LIGHTING","priority":"FLEXIBLE"}` |
| `metering-points` | `{"name":"Compteur général","deviceId":"00000000-0000-4000-8000-000000000007","scope":"FEED","feedId":"00000000-0000-4000-8000-000000000003","measurementMode":"CUMULATIVE","unit":"Wh"}` |
| `control-endpoints` | `{"name":"Canal déclaré","deviceId":"00000000-0000-4000-8000-000000000008","targetLoadId":"00000000-0000-4000-8000-000000000006","declaredActions":["TURN_ON","TURN_OFF"]}` |

Un point de mesure exige un appareil `ENERGY_METER` et une seule cible correspondant à `scope`. Un canal vise exactement un circuit ou une charge. Les déclarations de canal commencent en attente d’approbation, désactivées et avec un état physique inconnu. Les pouvoirs d’activation, les états vérifiés et les champs calculés sont exclus des écritures de cette API.

`400` indique une entrée ou une combinaison de champs invalide, `401` une authentification requise, `403` un droit ou une origine insuffisante, `404` une ressource ou référence hors du périmètre accessible, et `409` un conflit, par exemple un code déjà utilisé ou une dépendance active lors d’un archivage.

La migration `20261122030000_energy_topology_access_archive` ajoute les affectations et les dates d’archivage. Vérifier la lignée du journal de commandes avant la mise à niveau et renouveler les droits SQL du compte applicatif selon le guide. [Guide de déploiement](DEPLOYMENT.md)

## Télémétrie énergétique V2

Publier un échantillon par message sur `afrixora/{tenantId}/{buildingId}/devices/{deviceId}/readings`, avec le compte MQTT autorisé sur ce topic. Utiliser QoS 1 et une publication sans rétention. Les messages historiques `{ timestamp, metrics, units }` restent pris en charge.

```json
{
  "schemaVersion": 2,
  "deviceId": "00000000-0000-4000-8000-000000000007",
  "meteringPointId": "00000000-0000-4000-8000-000000000009",
  "capturedAt": "2026-11-25T12:00:00+02:00",
  "metric": "energy",
  "value": 12500,
  "unit": "Wh",
  "measurementMode": "CUMULATIVE",
  "bootId": "00000000-0000-4000-8000-000000000010",
  "sequence": 42,
  "quality": "MEASURED",
  "origin": "DEVICE",
  "sourceFeedId": "00000000-0000-4000-8000-000000000003"
}
```

- `energy` représente un index non négatif (`CUMULATIVE`) ou l’énergie d’une période (`INTERVAL`), en `Wh` ou `kWh`. `power` représente une puissance instantanée en `W` ou `kW`. Déclarer un point de mesure par mode et sens de flux.
- Le point actif, le compteur, le mode et la dimension de l’unité doivent correspondre au site authentifié par l’ACL du broker. `deviceId` doit correspondre au topic. L’origine déclarée (`DEVICE` ou `GATEWAY`) est conservée avec la qualité (`MEASURED`, `ESTIMATED` ou `INVALID`).
- `capturedAt` est l’instant d’acquisition, avec décalage horaire explicite. La fenêtre d’admission V2 couvre les dernières 24 heures et tolère 5 minutes d’avance. Le serveur stocke aussi l’heure de réception. Pour un relevé par période, `capturedAt` marque la fin de la période.
- Incrémenter `sequence` par compteur, point et métrique. Générer un nouvel UUID `bootId` au redémarrage. En cas de retransmission, réutiliser l’identité d’origine. PostgreSQL sérialise les écritures concurrentes d’une même identité et conserve le premier relevé persisté tant qu’il est retenu.
- En cas d’échec SQL, le worker tente une mise en attente Redis puis un rejeu avec délai croissant pendant au plus 24 heures. Le tampon du tenant est limité à 1 000 entrées. Un PUBACK MQTT ne garantit pas la persistance en base. Une indisponibilité de Redis, une éviction ou une expiration peut entraîner une perte. L’ACL reste la première barrière pendant la panne, et le serveur revérifie le périmètre lors de la persistance.

### Rejeu hors connexion et accusés applicatifs (7D)

#### Échange MQTT

Le protocole ajoute une enveloppe `telemetry_batch` au topic V2 existant
`afrixora/{tenantId}/{buildingId}/devices/{deviceId}/readings`.
Le worker répond sur `afrixora/{tenantId}/{buildingId}/devices/{deviceId}/telemetry-ack`.
Les deux messages utilisent MQTT 5, QoS 1 et `retain: false`. Le serveur donne à l’ACK une durée de vie de 10 secondes à partir de sa publication. S’abonner à l’ACK avant d’envoyer un lot.

Un lot contient au plus 32 entrées et sa charge utile MQTT est limitée à 64 Kio. Attribuer un UUID `batchId` par composition de lot et un UUID `itemId` stable par entrée du journal. Les `itemId` sont uniques dans un lot. Chaque `sample` reprend le contrat V2 ci-dessus.

```json
{
  "type": "telemetry_batch",
  "schemaVersion": 2,
  "batchId": "00000000-0000-4000-8000-000000000020",
  "items": [{
    "itemId": "00000000-0000-4000-8000-000000000021",
    "sample": {
      "schemaVersion": 2,
      "deviceId": "00000000-0000-4000-8000-000000000007",
      "meteringPointId": "00000000-0000-4000-8000-000000000009",
      "capturedAt": "2026-11-26T12:00:00+02:00",
      "metric": "energy",
      "value": 12500,
      "unit": "Wh",
      "measurementMode": "CUMULATIVE",
      "bootId": "00000000-0000-4000-8000-000000000010",
      "sequence": 42,
      "quality": "MEASURED",
      "origin": "DEVICE"
    }
  }]
}
```

La réponse `telemetry_ack` (version 2) reprend `batchId` et contient `serverReceivedAt`, `serverSentAt` et `results`. Chaque résultat contient `itemId` et `status`, avec `reason` pour un rejet. Le serveur traite les mesures indépendamment. En cas d’erreur SQL, les mesures valides restantes sont marquées `RETRY`.

```json
{
  "type": "telemetry_ack",
  "schemaVersion": 2,
  "batchId": "00000000-0000-4000-8000-000000000020",
  "serverReceivedAt": "2026-11-26T10:01:00.000Z",
  "serverSentAt": "2026-11-26T10:01:00.120Z",
  "results": [{"itemId": "00000000-0000-4000-8000-000000000021", "status": "STORED"}]
}
```

| Statut | Traitement par le boîtier |
|---|---|
| `STORED` | Enregistrer localement la confirmation avant de libérer l’espace de la mesure. La transaction TimescaleDB a abouti. |
| `DUPLICATE` | Appliquer le même traitement. L’identité et le contenu concordent avec la mesure déjà persistée. |
| `RETRY` ou ACK absent | Conserver la mesure intacte et la renvoyer après temporisation. |
| `REJECTED` | Conserver la mesure et le motif dans le journal des rejets. Les motifs sont `INVALID_SAMPLE`, `CLOCK_AHEAD`, `REPLAY_EXPIRED`, `INCOMPATIBLE_POINT` et `IDENTITY_CONFLICT`. Un rejet n’autorise pas la suppression comme donnée livrée. |

Valider le topic, la version, le lot en cours et chaque `itemId` avant d’appliquer un résultat. Un PUBACK MQTT atteste l’échange avec le broker. Seuls `STORED` et `DUPLICATE` reçus sur le topic autorisé attestent la persistance. Un lot invalide, retenu, hors périmètre ou reçu pendant saturation peut rester sans réponse. Le serveur accepte jusqu’à quatre lots simultanés, à raison d’un par appareil.

#### Journal local et reprise à implémenter dans le firmware

1. Écrire la mesure et son identité dans un journal durable **avant** la première publication. Conserver `bootId`, `sequence`, `capturedAt`, `itemId` et le contenu lors des rejeux. Après redémarrage, relire les mesures en attente avec leur ancien `bootId` et réserver le nouveau `bootId` aux nouvelles acquisitions.
2. Après reconnexion, s’abonner au topic d’ACK et reprendre par les mesures non confirmées les plus anciennes. Garder un seul lot en vol par appareil. Attendre par exemple 15 secondes, puis réessayer avec temporisation exponentielle et une part aléatoire, plafonnée à deux minutes. Après un ACK partiel, rejouer les entrées non confirmées avec un nouveau `batchId` si la composition du lot change.
3. Dater les acquisitions avec la RTC synchronisée sur une référence UTC de confiance. Un lot vide peut vérifier l’échange et fournir les deux temps serveur. Utiliser le temps aller-retour mesuré sur une horloge monotone pour apprécier l’incertitude. La fenêtre d’admission couvre les **24 heures passées** et tolère **5 minutes d’avance**. Conserver l’horodatage d’acquisition lors de la reprise. Si l’acquisition ne peut pas être datée de façon fiable ou si la fenêtre est dépassée, isoler les données pour examen.
4. Dimensionner le journal selon le nombre de mesures par unité de temps et la coupure qu’il doit couvrir. Signaler un journal plein, un dépassement de fenêtre, une RTC invalide et les rejets. Les essais physiques doivent inclure une coupure d’alimentation pendant l’écriture et pendant la confirmation locale.

Le worker utilise les ACL du broker. Accorder l’écriture du topic d’ACK au seul compte worker et la lecture aux passerelles autorisées sur les appareils correspondants. Les ACL historiques restent valides pour les anciens clients. Préparer les deux autorisations sur des copies avant tout essai de rejeu. Installer le firmware ou modifier les ACL réelles nécessite une intervention distincte. Un lot de rejeu traite la télémétrie indépendamment de l’état en ligne, des automatismes et des commandes électriques.

#### Notifications

Les alertes restent consultables dans l’application. Les canaux SMS et WhatsApp restent à intégrer après identification et configuration d’un fournisseur et des destinataires autorisés. Le serveur n’émet aucun résultat d’envoi pour ces canaux. Aucun changement de schéma ni migration dédiée n’est nécessaire pour le rejeu.

### Lire et interpréter les résultats

`GET /api/v1/energy/metered?buildingId=…&meteringPointId=…&from=…&to=…` utilise une session JWT et les droits de topologie du bâtiment. La période maximale est de 93 jours et la lecture accepte jusqu’à 50 000 échantillons. Configurer `timeZone` via l’API Bâtiments avec un fuseau IANA et un droit d’écriture sur la topologie du site. Pour une ville reconnue, le fuseau local sert de défaut. L’API V2 demande une configuration explicite si le site est inconnu.

- Pour le **total du bâtiment**, sélectionner le point d’import situé sur le tableau général et ajouter `buildingTotal=true`. Cette requête agrège uniquement ce point. Lire les sous-compteurs séparément. L’exploitant identifie le point représentant le périmètre réel du bâtiment.
- Pour un index cumulatif, le calcul utilise deux relevés consécutifs du même démarrage. Une baisse d’index, un changement de compteur ou de démarrage, un numéro manquant ou une mesure invalide laisse un trou. La première mesure de la période constitue une référence. Un delta traversant minuit figure dans le total de période et dans `energyWithoutDay`.
- Les totaux mesurés et estimés sont séparés. `null` signifie qu’aucune quantité de la catégorie n’a été calculée, et `0` est une valeur explicite. Les réponses d’un point instantané exposent la dernière puissance valide en watts.
- `sourceFeedId` est facultatif et désigne une arrivée du même site. L’origine énergétique est celle déclarée avec le relevé. Pour un delta cumulatif, une arrivée identique aux deux bornes permet l’attribution. Une attribution absente ou un changement d’arrivée dans le delta donne `UNKNOWN`. Le solaire et la batterie apparaissent sous leurs types respectifs. Les points d’export restent consultables séparément.
- Les routes Énergie historiques conservent leur contrat. `/energy/consumption` utilise le fuseau du site, avec UTC comme repli explicite si celui-ci est inconnu. Leur série `energy_kwh` garde la convention historique des valeurs par intervalle, sans conversion rétroactive des index dont la nature est inconnue. Les données V2 sont dans la même hypertable, avec des métadonnées propres aux points. Les relevés et exports CSV historiques gardent leur périmètre.

Installer la migration Prisma du fuseau et exécuter `infrastructure/scripts/01_schema.sql` sur la même **base de test isolée** pour ajouter les colonnes et index TimescaleDB. Pour inclure le test HTTP et SQL V2 dans la recette, lancer `AFRIXORA_TEST_TIMESCALE=true npm test` depuis `backend` après ces deux opérations.

## Simulation énergétique V2

Les routes privées sont sous `/api/v1/automations/energy-simulation`. Elles exigent un JWT et les droits du bâtiment. Les rôles `SUPER_ADMIN` et `TENANT_ADMIN` travaillent dans le tenant sélectionné. Le rôle `BUILDING_ADMIN` doit être affecté au site. Un appel à la simulation écrit uniquement l’historique `AutomationExecution` et la projection des charges.

| Méthode | Chemin | Entrée |
|---|---|---|
| GET | `/rules` | `buildingId`, `page`, `limit` en query |
| POST | `/rules` | `buildingId`, `name`, `policy`. La règle est créée désactivée |
| PATCH | `/rules/:id` | `buildingId` et `isActive` |
| POST | `/rules/:id/runs` | Instant, scénario, clé de rejeu et états hypothétiques |
| GET | `/rules/:id/runs` | `buildingId`, `page`, `limit` en query |

Une politique de version `1` configure `feedId`, `demandPointId`, `availablePowerW`, `hysteresisW`, `maxReadingAgeSeconds`, `cooldownSeconds`, `minOnSeconds`, `minOffSeconds`, `maxActionsPerHour` et la liste ordonnée `loads`. Chaque entrée fournit `loadId`, `meteringPointId` et éventuellement `maintenanceExcluded`. Le point de demande et les points des charges sont des points d’import instantanés en W ou kW, rattachés à la même arrivée et aux charges incluses dans le périmètre de mesure. Le plafond disponible est une hypothèse configurée. La puissance nominale de la source, lorsqu’elle est renseignée, borne ce plafond.

Sur le site fictif, créer la règle avec le corps suivant, puis l’activer par `PATCH /rules/:id`. Remplacer les UUID et les dates par ceux du site de recette et de ses mesures.

```json
{
  "buildingId": "00000000-0000-4000-8000-000000000001",
  "name": "Simulation de surcharge",
  "policy": {
    "version": 1,
    "feedId": "00000000-0000-4000-8000-000000000005",
    "demandPointId": "00000000-0000-4000-8000-000000000006",
    "availablePowerW": 1000,
    "hysteresisW": 100,
    "maxReadingAgeSeconds": 60,
    "cooldownSeconds": 30,
    "minOnSeconds": 60,
    "minOffSeconds": 120,
    "maxActionsPerHour": 4,
    "loads": [
      {
        "loadId": "00000000-0000-4000-8000-000000000004",
        "meteringPointId": "00000000-0000-4000-8000-000000000007"
      }
    ]
  }
}
```

Corps de la première évaluation :

```json
{
  "buildingId": "00000000-0000-4000-8000-000000000001",
  "scenarioId": "00000000-0000-4000-8000-000000000002",
  "requestId": "00000000-0000-4000-8000-000000000003",
  "evaluatedAt": "2026-11-26T10:00:00+02:00",
  "protection": "CLEAR",
  "maintenance": "CLEAR",
  "site": "ALLOWED",
  "manual": "CLEAR",
  "initialLoads": [
    {
      "loadId": "00000000-0000-4000-8000-000000000004",
      "state": "ON",
      "changedAt": "2026-11-26T09:55:00+02:00"
    }
  ]
}
```

- **Entrées et priorités.** Les quatre indicateurs décrivent des hypothèses du scénario et prennent la valeur `UNKNOWN` si omis. Le moteur applique l’ordre protection, maintenance, autorisation du site, priorité manuelle, puis règle de simulation. Une source non attribuée ou incohérente, une mesure absente, obsolète, invalide ou estimée conduit à l’abstention pour la décision concernée. Une mesure de 0 W reste valide.
- **Délestage.** Le moteur propose au plus une action par évaluation, dans l’ordre des charges de la règle. Il ne sélectionne que les charges `FLEXIBLE` autorisées au niveau charge et circuit. Toute charge ou tout circuit `CRITICAL` est exclu. Les exclusions de maintenance, les temps minimaux et les limites horaires de la règle et des charges bornent les décisions dans un scénario.
- **Retour à la normale.** Le scénario suit sa propre projection. Elle retranche la puissance mesurée des charges déjà délestées dans la simulation. Elle rétablit uniquement une charge que le scénario a délestée et vérifie que sa reprise prévue tient sous le plafond moins l’hystérésis. Le délai anti-oscillation s’applique aux deux sens. Le test suppose que la demande mesurée de référence reste indépendante des coupures simulées.
- **Historique.** Les évaluations successives d’un scénario ont des dates strictement croissantes. Fournir `initialLoads` à la première évaluation. Un rejeu du même `requestId` dans le scénario renvoie la même exécution. Une demande différente avec la même clé renvoie `409`. L’historique expose la règle, les mesures, les hypothèses, les motifs et l’état projeté, identifié par `mode: DRY_RUN`.

Avec une demande mesurée de **1 350 W**, un plafond de **1 000 W** et une charge flexible mesurée à **400 W** dont le temps de marche minimal est atteint, la décision `SHED` ramène la demande **projetée** à **950 W**. Quand la référence mesurée revient à **850 W**, la reprise est simulée après le temps d’arrêt minimal si elle reste sous le seuil de **900 W**, marge de 100 W incluse. État matériel et commandes demeurent indépendants du résultat simulé.

La migration `20261126000000_add_automation_simulations` ajoute l’indicateur `simulationOnly` et l’historique des exécutions. Utiliser `AFRIXORA_TEST_TIMESCALE=true npm test` sur une base isolée pour inclure la recette HTTP avec mesures V2.

## Interface de gestion énergétique

Ouvrir **Énergie** depuis le menu existant ou **Voir l’énergie** depuis la fiche d’un bâtiment. Le sélecteur de bâtiment et les boutons de période pilotent les vues. Les vues V2 utilisent les droits de topologie du bâtiment. Le serveur continue de contrôler les accès aux données.

| Vue | Données affichées |
|---|---|
| Vue d’ensemble | Choix du point d’import du tableau général et du point de puissance. Énergie mesurée et estimée séparées, dernière puissance en kW et sa date, coût historique estimé, lacunes et alertes non lues. |
| Sources | Type, disponibilité déclarée et dernière position horodatée par arrivée. La source courante est inconnue tant que l’API ne fournit pas de confirmation du transfert. |
| Distribution | Tableaux, circuits, charges, priorités, compteurs et contrôleurs. Les liens ouvrent le détail de l’appareil dans le registre existant. |
| Simulations | Règles et ordre des charges, hypothèses du scénario, exécution et historique. Accessible aux rôles administrateurs selon les droits du site. Les règles se configurent via l’API de phase 5. |
| Finances | Valorisation par source du point d’import sélectionné, couverture, tarifs et taux appliqués, en USD ou CDF. Les relevés de groupe et l’estimation historique au tarif global apparaissent séparément. |
| Alertes et maintenance | Alertes du bâtiment, sources signalées en maintenance, échéances d’entretien des groupes, heures relevées et tickets. |
| Analyses historiques | Courbes, répartition par zone et indicateurs historiques. L’export CSV conserve ses droits d’abonnement. |

La fiche **Appareils** affiche les charges reliées directement par un point de mesure ou un canal de commande. L’état déclaré, le suivi de la demande et de l’envoi, et la vérification physique horodatée sont présentés séparément. Le suivi de commande s’affiche quand l’API a rendu un identifiant de commande pendant la session.

### Recette navigateur

Avec Node 22 et Chrome installés, lancer depuis `frontend` :

```bash
npm run typecheck
NEXT_PUBLIC_API_URL=/ NEXT_PUBLIC_AFRIXORA_DEVICE_CONTROL_ENABLED=false npm run build
node tests/energy-v2.browser.cjs
```

Le test démarre Next.js sur la boucle locale et fournit une API fictive aux requêtes Chrome. Il couvre les mesures, la navigation mobile et bureau, les permissions, la simulation et l’ouverture de la fiche d’un appareil. Le test n’utilise ni base de production ni équipement. `AFRIXORA_CHROME_BIN` permet de préciser le binaire Chrome ou Chromium.

## Coûts et tarifs énergétiques V2 (7A)

Les routes suivantes sont sous `/api/v1/energy/finance`. Elles requièrent une session authentifiée et les droits du bâtiment. La saisie est réservée aux administrateurs autorisés sur le site. Le tenant est déterminé par la session.

| Méthode et chemin | Paramètres ou objet |
|---|---|
| `GET /costs` | `buildingId`, `meteringPointId`, `from`, `to`, `currency` (`USD` par défaut ou `CDF`). |
| `GET /tariffs` | `buildingId`, `sourceId`, `page`, `limit`. |
| `POST /tariffs` | `buildingId`, `sourceId`, `unit: "KWH"`, `unitPrice`, `currency`, `effectiveFrom`, `effectiveTo` facultatif. |
| `GET /exchange-rates` | `buildingId`, `page`, `limit`. |
| `POST /exchange-rates` | `buildingId`, `cdfPerUsd`, `rateSource`, `effectiveFrom`, `effectiveTo` facultatif. |
| `GET /generator-costs` | `buildingId`, `sourceId`, `from`, `to`, `currency`, `page`, `limit`. Renvoie les relevés entièrement compris dans la plage. |
| `POST /generator-costs` | `buildingId`, `sourceId` (groupe), `periodFrom`, `periodTo`, `currency`, `fuelLitres`, `fuelQuality`, `fuelPricePerLitre`, `engineHours`, `hoursQuality`, `maintenanceCostPerHour`. Les relevés et prix indisponibles peuvent être omis. Si une quantité est indiquée, sa qualité est requise (`MEASURED` ou `ESTIMATED`). |

Exemples fictifs, dans l’ordre tarif, taux, relevé d’exploitation du groupe.

```json
{"buildingId":"00000000-0000-4000-8000-000000000001","sourceId":"00000000-0000-4000-8000-000000000002","unit":"KWH","unitPrice":"0.335","currency":"USD","effectiveFrom":"2026-11-26T00:00:00+02:00"}
```

```json
{"buildingId":"00000000-0000-4000-8000-000000000001","cdfPerUsd":"2500","rateSource":"Référence fictive","effectiveFrom":"2026-11-26T00:00:00+02:00"}
```

```json
{"buildingId":"00000000-0000-4000-8000-000000000001","sourceId":"00000000-0000-4000-8000-000000000003","periodFrom":"2026-11-26T06:00:00+02:00","periodTo":"2026-11-26T08:00:00+02:00","currency":"USD","fuelLitres":"10.5","fuelQuality":"MEASURED","fuelPricePerLitre":"1.25","engineHours":"2","hoursQuality":"ESTIMATED","maintenanceCostPerHour":"0.25"}
```

- Les dates acceptent un décalage explicite ou `Z`. Les périodes tarifaires et les taux sont valables de la date d’effet incluse à la fin exclue. Une nouvelle version peut fermer la version précédente ouverte. Un autre chevauchement renvoie `409`.
- Chaque demande de coûts utilise un seul compteur d’import sur tableau (`BOARD`). Vérifier que le compteur couvre bien le bâtiment. Les autres compteurs, dont les sous-compteurs, sont exclus. Une mesure d’index à la borne de fin sert à fermer le dernier intervalle.
- Un prix et, si nécessaire, un taux historisé doivent couvrir l’intervalle entier. Les changements de source non attribuables, les traversées de version et les autres lacunes sont signalés. Les kWh connus sans valorisation sont conservés dans `unpricedKWh`. Pour les relevés d’énergie de période, la borne déduite du relevé précédent rend le coût estimé.
- Les montants sont calculés en Decimal et sérialisés en chaînes, arrondies au centième après accumulation, à la moitié supérieure. Les sous-totaux affichés peuvent différer d’un centime du total arrondi. `null` signifie indisponible, tandis que `"0.00"` représente un montant valorisé à zéro. `references` fournit les versions appliquées, leurs dates et la provenance déclarée du taux.
- Le coût du groupe distingue carburant (litres × prix au litre) et provision de maintenance (heures moteur × coût horaire). Il se consulte séparément de la dépense valorisée au kWh. Ces montants servent à l’estimation, avec une couverture dépendante des données et des prix renseignés.

La migration additive `20261126010000_add_energy_costs` ajoute trois tables. Le coût opérationnel porte sur la saisie des versions, la vérification de leur provenance, le stockage des relevés et les lectures TimescaleDB bornées à 93 jours et 50 000 mesures par demande. Aucun abonnement à un fournisseur de change n’est requis. La recette HTTP de ce lot requiert `AFRIXORA_TEST_TIMESCALE=true` sur une base isolée.

## Suivi du carburant des groupes (7B)

Le suivi associe une cuve et une sonde du registre `Device` à un groupe et à son point V2 de production (`SOURCE`, `EXPORT`, `CUMULATIVE`). Cette version suit une cuve et une sonde par groupe. Les index électriques restent dans `sensor_readings`. Les relevés de niveau, la température et l’état du moteur sont déclarés par API. La sonde et le compteur doivent être étalonnés sur site pour interpréter les écarts.

Les routes sous `/api/v1/energy/fuel` exigent une session et les droits du bâtiment. Les écritures requièrent un administrateur habilité. Le tenant est déterminé par la session.

| Route | Données attendues |
|---|---|
| `GET /tanks` | `buildingId`, `page`, `limit`. |
| `POST /tanks` | `buildingId`, `name`, `sourceId`, `probeDeviceId`, `productionPointId`. |
| `GET /calibrations`, `/readings`, `/deliveries`, `/assessments` | `buildingId`, `tankId`, `page`, `limit`. |
| `POST /calibrations` | `buildingId`, `tankId`, `effectiveFrom` et `profile`. |
| `POST /readings` | `buildingId`, `tankId`, `capturedAt`, `levelMm`, `temperatureC` si mesurée, `quality`, `intervalState`. |
| `POST /deliveries` | `buildingId`, `tankId`, `deliveredAt`, `litresAt20C`, `uncertaintyLitres` et `reference` unique par cuve. |
| `GET /balance` | `buildingId`, `tankId`, `from`, `to`. Prévisualise le bilan. |
| `POST /assessments` | Mêmes champs dans le JSON. Archive les bilans exploitables et crée ou actualise l’alerte associée. Un rejeu des mêmes éléments retourne le même rapport. |

Profil fictif pour trois points d’étalonnage. Les grandeurs décimales sont fournies sous forme de chaînes. Le coefficient thermique, le bruit de la sonde et le modèle de consommation doivent provenir du site.

```json
{
  "buildingId": "00000000-0000-4000-8000-000000000001",
  "tankId": "00000000-0000-4000-8000-000000000002",
  "effectiveFrom": "2026-11-26T06:00:00+02:00",
  "profile": {
    "points": [
      {"levelMm": "0", "litres": "0"},
      {"levelMm": "50", "litres": "20"},
      {"levelMm": "100", "litres": "120"}
    ],
    "noiseMm": "0.25",
    "toleranceLitres": "1",
    "thermalCoefficientPerC": "0.001",
    "minLitresPerKWh": "0.25",
    "maxLitresPerKWh": "0.4",
    "maxIdleLitresPerHour": "2",
    "maxIntervalMinutes": 90
  }
}
```

- **Période.** Utiliser deux relevés de niveau consécutifs, à la même calibration, et des index de production mesurés, continus et présents aux deux mêmes bornes. Le relevé final déclare l’état moteur pendant l’intervalle entier. Indiquer `UNKNOWN` pour une transition ou une période incertaine. Toute production positive lors d’un arrêt déclaré rend le bilan indéterminé. La requête porte sur 24 h au plus et le profil peut fixer une limite plus courte.
- **Volume.** Interpoler les points de hauteur-volume et convertir les volumes à 20 °C. Le bruit de la sonde définit une plage autour de chaque niveau. Une mesure hors courbe, estimée ou sans température rend le bilan indéterminé. Les livraisons sont déjà exprimées à 20 °C, avec leur incertitude. Une livraison à la même heure qu’un relevé est supposée déjà incluse dans ce relevé, d’où la fenêtre `(from, to]`.
- **Interprétation.** Comparer le volume de départ plus les livraisons moins le volume final à la plage attendue. En marche, la plage utilise les kWh, les coefficients et la provision maximale de consommation au ralenti. À l’arrêt, elle correspond à la marge de tolérance. Seules les plages disjointes produisent un écart à vérifier. Un écart peut refléter une livraison manquante, un problème de mesure ou une consommation différente des hypothèses.
- **Historique.** Les rapports conservent les plages et les références ayant servi au calcul. Après saisie d’une livraison tardive, relancer l’évaluation. Elle crée une nouvelle version si les éléments changent. Une période expliquée clôt l’alerte existante. Les alertes restent visibles selon les droits du site dans le module Alertes. Les rapports de carburant sont consultables via l’API paginée.
- **Exploitation.** La calibration et la saisie des événements exigent un suivi par site. Les rapports ne modifient ni les coûts de 7A ni le fonctionnement du groupe. La migration `20261126020000_add_generator_fuel_monitoring` ajoute cinq tables et le type d’alerte `FUEL_DISCREPANCY`. La recette HTTP utilise `AFRIXORA_TEST_TIMESCALE=true` sur une base isolée.

## Entretien programmé des groupes (7C)

Le suivi rattache les compteurs d’heures et les plans aux groupes existants. L’onglet **Énergie → Alertes et maintenance** affiche les échéances programmées et les tickets. Les saisies et le journal complet passent par l’API. Les heures de la phase 7A restent des quantités de période dédiées aux coûts. Ici, l’exploitant saisit un index cumulatif de durée de marche.

Les routes sous `/api/v1/energy/maintenance` utilisent la session et les droits du bâtiment. Les mutations sont réservées aux administrateurs habilités. Les listes acceptent `page` et `limit`.

| Route | Paramètres ou corps JSON |
|---|---|
| `GET /hours` | `buildingId`, `sourceId`. |
| `POST /hours` | `buildingId`, `sourceId`, `capturedAt`, `totalHours` sous forme de chaîne décimale. |
| `GET /plans` | `buildingId`, `sourceId` facultatif. Renvoie chaque plan et l’état calculé de son échéance. |
| `POST /plans` | `buildingId`, `sourceId`, `title`, `manufacturerReference`, `startsAt`, `intervalDays` et/ou `intervalHours`. Pour un plan horaire, fournir l’`initialReadingId` du groupe à la date exacte `startsAt`. |
| `GET /tickets` | `buildingId`, filtres facultatifs `planId` et `status`. |
| `POST /tickets` | `buildingId`, `planId`, `responsibleUserId`, `description`. Un ticket ouvert ou en cours par plan. |
| `PATCH /tickets` | `buildingId`, `ticketId`, `action` parmi `ASSIGN` (avec `responsibleUserId`), `START` et `CANCEL` (avec `reason`). |
| `POST /interventions` | `buildingId`, `ticketId`, `performedAt`, `work` et `readingId` du groupe à la date exacte de l’intervention pour une échéance horaire. La clôture du ticket et l’événement d’audit forment une seule transaction. |
| `GET /events` | `buildingId`, `ticketId`. Journal paginé avec l’acteur, l’horodatage et le détail. |

Exemple de plan fictif avec un seuil suivant la première des deux échéances.

```json
{
  "buildingId": "00000000-0000-4000-8000-000000000001",
  "sourceId": "00000000-0000-4000-8000-000000000002",
  "title": "Vidange programmée",
  "manufacturerReference": "Notice fictive, chapitre Entretien",
  "startsAt": "2026-11-26T08:00:00+02:00",
  "initialReadingId": "00000000-0000-4000-8000-000000000003",
  "intervalDays": 180,
  "intervalHours": "250"
}
```

- Saisir des index cumulatifs cohérents, y compris après remplacement d’un compteur en conservant le décalage vers l’index total. Un relevé rétroactif doit être compatible avec les relevés voisins. Un index de zéro est valide.
- Le calendrier utilise les jours civils du fuseau du bâtiment, avec UTC comme repli. La dernière intervention terminée sert de nouvelle référence. `DUE` indique qu’un seuil calendaire ou horaire est atteint. `CHECK_HOURS` demande un relevé lorsque le temps écoulé ne permet plus d’écarter l’échéance horaire. Les seuils sont des rappels d’entretien programmé.
- Les interventions portent sur un ticket démarré et sont enregistrées par un administrateur habilité. Le responsable doit avoir les droits du site au moment de son affectation et de l’intervention. Les identifiants du responsable et de l’acteur sont conservés dans l’audit, y compris après suppression d’un compte.
- Le coût opérationnel tient à la tenue du registre d’heures et à la validation des intervalles à partir de la notice réelle. La migration additive `20261126030000_add_generator_maintenance` ajoute quatre tables. Les états et interventions sont déclaratifs et indépendants des commandes physiques.

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
