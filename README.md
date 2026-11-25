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

### Lire et interpréter les résultats

`GET /api/v1/energy/metered?buildingId=…&meteringPointId=…&from=…&to=…` utilise une session JWT et les droits de topologie du bâtiment. La période maximale est de 93 jours et la lecture accepte jusqu’à 50 000 échantillons. Configurer `timeZone` via l’API Bâtiments avec un fuseau IANA et un droit d’écriture sur la topologie du site. Pour une ville reconnue, le fuseau local sert de défaut. L’API V2 demande une configuration explicite si le site est inconnu.

- Pour le **total du bâtiment**, sélectionner le point d’import situé sur le tableau général et ajouter `buildingTotal=true`. Cette requête agrège uniquement ce point. Lire les sous-compteurs séparément. L’exploitant identifie le point représentant le périmètre réel du bâtiment.
- Pour un index cumulatif, le calcul utilise deux relevés consécutifs du même démarrage. Une baisse d’index, un changement de compteur ou de démarrage, un numéro manquant ou une mesure invalide laisse un trou. La première mesure de la période constitue une référence. Un delta traversant minuit figure dans le total de période et dans `energyWithoutDay`.
- Les totaux mesurés et estimés sont séparés. `null` signifie qu’aucune quantité de la catégorie n’a été calculée, et `0` est une valeur explicite. Les réponses d’un point instantané exposent la dernière puissance valide en watts.
- `sourceFeedId` est facultatif et désigne une arrivée du même site. L’origine énergétique est celle déclarée avec le relevé. Pour un delta cumulatif, une arrivée identique aux deux bornes permet l’attribution. Une attribution absente ou un changement d’arrivée dans le delta donne `UNKNOWN`. Le solaire et la batterie apparaissent sous leurs types respectifs. Les points d’export restent consultables séparément.
- Les routes Énergie historiques conservent leur contrat. `/energy/consumption` utilise le fuseau du site, avec UTC comme repli explicite si celui-ci est inconnu. Leur série `energy_kwh` garde la convention historique des valeurs par intervalle, sans conversion rétroactive des index dont la nature est inconnue. Les données V2 sont dans la même hypertable, avec des métadonnées propres aux points. Les relevés et exports CSV historiques gardent leur périmètre.

Installer la migration Prisma du fuseau et exécuter `infrastructure/scripts/01_schema.sql` sur la même **base de test isolée** pour ajouter les colonnes et index TimescaleDB. Pour inclure le test HTTP et SQL V2 dans la recette, lancer `AFRIXORA_TEST_TIMESCALE=true npm test` depuis `backend` après ces deux opérations.

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
