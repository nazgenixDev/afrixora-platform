# AFRIXORA — Intégration P0 + V2-001 (candidate non déployée)

Base retenue : archive `afrixora-platform-fix-audit-p0.zip`.

## Ajouts conservatoires
- Conserve les routes, protections multi-tenant, CI, ACL et buffer Redis du lot P0.
- Étend Prisma avec `DeviceCommand` + migration additive (à tester sur une base isolée).
- Ne modifie plus `DeviceState` après publication MQTT ; attend un événement `command_ack`.
- Ajoute un endpoint de suivi `GET /api/v1/devices/:id/commands/:commandId`.
- Rejette les accusés périmés, associés au mauvais appareil ou d'état différent.
- L'automatisation utilise le même chemin de commande journalisé, contrôlé par deux feature flags.
- Supprime la confirmation optimiste dans la page de gestion des appareils.
- Ajoute une protection Origin pour les requêtes mutantes authentifiées par cookie et pour les sockets.
- Ne renvoie plus `accessToken` dans la réponse login en production.
- Adapte la suppression permanente d'un tenant au nouveau journal de commandes.

## Validation requise
1. Sauvegarder la base et créer un environnement de test complètement isolé.
2. `cd backend && npm ci && npx prisma validate && npx prisma generate && npm run typecheck && npm test`.
3. `cd frontend && npm ci && npm run typecheck && npm run build`.
4. Valider sur PostgreSQL de test `npx prisma migrate deploy` et le rollback de la sauvegarde.
5. Tester avec Mosquitto : ACL, appareil valide, usurpation de topic, ACK erroné, ACK tardif, ACK correct.
6. Tester les permissions et les scénarios hors connexion, sans connexion à des contacteurs réels.
7. Garder `AFRIXORA_DEVICE_CONTROL_ENABLED=false`, `AFRIXORA_AUTOMATION_COMMANDS_ENABLED=false`, `NEXT_PUBLIC_AFRIXORA_DEVICE_CONTROL_ENABLED=false`.

## Limites connues
- Un ACK MQTT signé par le compte du périphérique reste une **déclaration logicielle**, pas une preuve physique.
- Pas de compilation intégrée ni de tests matériels garantis ici.
- La branche P0 conserve des configurations de développement à durcir avant toute production.
- Les commandes sont toujours hors service par défaut, quel que soit le bouton frontend.

- Vérifier l’ACL Mosquitto par passerelle ; la présence d’un fichier ACL ne garantit pas que les identifiants de chaque boîtier soient isolés.
- Supprimer physiquement un appareil doté d’un historique de commande retourne 409 ; prévoir un archivage.
