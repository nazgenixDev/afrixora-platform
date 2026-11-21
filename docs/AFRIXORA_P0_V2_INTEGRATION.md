# AFRIXORA — Stabilisation des commandes Energy V2

Branche de travail `feature/afrixora-v2-stabilisation`, issue de `origin/main` au commit `4ea3e6d`. Le patch d’intégration P0 + V2-001 a été appliqué puis adapté sur cette branche.

## Journal de commandes

- `POST /api/v1/devices/:id/control` accepte `set_state` avec `on` ou `off`. HTTP 202 indique que la commande a été acceptée pour le traitement. Les anciennes règles `turn_on` et `turn_off` sont interprétées comme `set_state` au déclenchement, sans réécriture en base.
- `GET /api/v1/devices/:id/commands/:commandId` consulte la commande dans le périmètre de l’appareil et du tenant. Une commande ouverte sans retour suffisant devient `EXPIRED` à la consultation lorsque le délai est dépassé.
- `SENT` indique que la publication MQTT a abouti. `ACKNOWLEDGED` indique un accusé de réception du boîtier. `CONFIRMED` signifie **état déclaré par le boîtier**. Une confirmation physique devra disposer d’un état distinct et d’une preuve indépendante.
- L’ACK doit correspondre au tenant, au bâtiment, à l’appareil et à l’identifiant de commande. Un état déclaré doit également correspondre à l’état demandé. L’écriture de la déclaration et celle du journal font partie de la même transaction.
- Les états antérieurs sans provenance `device_reported` sont affichés comme inconnus. La page et la carte Appareils utilisent uniquement le dernier état déclaré disponible.
- La clé étrangère composée garantit que le journal référence un appareil du tenant et du bâtiment déclarés. Un appareil avec un historique de commandes renvoie HTTP 409 à la suppression directe. La suppression définitive du tenant purge ses commandes dans la transaction existante.

## Configuration et limites

- Les flags `AFRIXORA_DEVICE_CONTROL_ENABLED`, `AFRIXORA_AUTOMATION_COMMANDS_ENABLED` et `NEXT_PUBLIC_AFRIXORA_DEVICE_CONTROL_ENABLED` sont désactivés par défaut. Une commande automatique exige les deux flags backend.
- Les requêtes de mutation sous session cookie exigent une origine autorisée par `CORS_ORIGINS`. Le handshake Socket.IO contrôle l’origine lorsqu’elle est fournie et vérifie le JWT et la session. Le login navigateur utilise les cookies `HttpOnly`. Le jeton JSON de connexion est disponible en mode développement. Les clients hors navigateur obtiennent un Bearer avec `POST /api/v1/auth/token`.
- Le backend utilise MQTT 5. Une publication QoS 1 attend le PUBACK, porte une durée de validité MQTT et est retirée du magasin local si le délai expire ou si la connexion se ferme. Une reconnexion rétablit les abonnements avant d’accepter de nouvelles commandes. Le firmware doit respecter l’échéance absolue et dédupliquer les commandes par identifiant.
- Le Compose charge l’ACL Mosquitto en lecture seule. Préparer les comptes et les règles des passerelles avant installation. Une connexion de production à un broker distant exige MQTT sur TLS ou WebSocket sur TLS. Le certificat du tunnel déployé et le retour matériel indépendant restent à valider sur site.

## Reproduire les vérifications

1. Configurer les flags à `false` et utiliser un PostgreSQL local jetable. Tester la sauvegarde et la restauration avant la migration additive.
2. Dans `backend`, lancer `npm ci`, `npx prisma validate`, `npx prisma generate`, `npm run typecheck`, `npm test` et `node --test tests/v2_p0_isolated.test.cjs`. Les vérifications de publication et d’ACK du dernier fichier simulent le broker.
3. Dans `frontend`, lancer `npm ci`, `npm run typecheck` et `npm run build`. À la racine, lancer `git diff --check`.

## Vérification du 21 novembre 2026

- Prisma 5.22.0 validé et généré. Vérification TypeScript réussie côté backend et frontend. Build Next.js réussi avec quatre avertissements ESLint déjà présents sur la base P0.
- Backend sur PostgreSQL 15 jetable, 51 tests Vitest réussis. Treize tests isolés couvrent les commandes, les automatisations, le transport et les ACK.
- Sauvegarde P0 et restauration sur une seconde base jetable. Migration V2 appliquée sur la première base. Les données témoins sont conservées dans les deux bases. Prisma ne signale aucun écart entre la base migrée et le schéma attendu.
- Mosquitto jetable testé avec deux passerelles fictives. Les ACL isolent les appareils sur TCP et WebSocket. Le worker se connecte en MQTT 5 sur TLS et refuse un certificat non approuvé. Une coupure avant le PUBACK annule la publication en attente et la reconnexion permet un nouvel envoi sans rejouer le précédent. Aucun équipement réel n’a été connecté ou commandé.
- Le propriétaire a autorisé le commit local du lot logiciel de phase 1. Les réserves de mise en production et de pilotage réel restent ouvertes.
