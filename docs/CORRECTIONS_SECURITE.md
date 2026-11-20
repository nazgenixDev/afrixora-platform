# Mise en service des correctifs de sécurité

Les procédures d’exploitation et de migration des passerelles sont décrites dans [DEPLOYMENT.md](../DEPLOYMENT.md). Appliquer les migrations avec le compte propriétaire en préproduction. Vérifier la restauration d’une sauvegarde chiffrée avant la bascule.

## Authentification et clients API

- Le navigateur utilise `POST /api/v1/auth/login` et reçoit le profil et des cookies `HttpOnly`. Définir `CORS_ORIGINS` avec les origines exactes, et des secrets distincts pour l’accès et le renouvellement. Le renouvellement est rotatif et Redis doit être disponible. L’ancien cookie de renouvellement demandera une reconnexion.
- Les intégrations Bearer doivent appeler `POST /api/v1/auth/token`. La valeur est remise à un client hors navigateur, avec une durée de vie de 15 minutes. Les clés API se transmettent dans `X-Api-Key`.
- La révocation d’une clé passe par `PATCH /api/v1/api-keys/:id/revoke` et reste accessible après un changement de plan. Un abonnement expiré ou suspendu perd les droits API et export. La désactivation d’un tenant révoque ses clés et ses sessions non administratives de plateforme. La réactivation nécessite de nouvelles clés et une reconnexion des utilisateurs.
- `read` couvre la lecture, `write` ajoute le pilotage des appareils autorisés, et `full` ajoute la gestion des appareils et bâtiments. La gestion des clés et des comptes reste réservée aux sessions administratives. Les commandes marche/arrêt sont réservées aux lampes et aux prises. Examiner les anciennes automatisations et adapter celles qui utilisaient d’autres commandes ou paramètres.
- Les nouveaux mots de passe doivent contenir au moins 12 caractères et tenir dans 72 octets UTF-8. Les anciens mots de passe restent utilisables pour se connecter et les changer.

## Données historiques

Les nouvelles clés étrangères vérifient les relations entre tenant, bâtiment, zone et appareil pour les nouvelles écritures. Elles ont été ajoutées avec `NOT VALID` afin de conserver les lignes historiques. Les chemins de lecture concernés appliquent aussi le périmètre en application.

Après sauvegarde, inventorier les écarts en rapprochant `Zone`, `Device`, `DeviceState`, `Automation`, `Gateway` et `Alert` de leurs parents et en comparant les identifiants de tenant et de bâtiment applicables. Faire valider chaque rattachement par l’exploitant. Corriger les associations confirmées, puis valider les contraintes de la migration `20261120000000_enforce_tenant_relations` avec `ALTER TABLE … VALIDATE CONSTRAINT …`. Conserver ces contraintes SQL explicites dans les migrations Prisma ultérieures.

Le résumé énergétique exige un bâtiment actif du tenant. Les relevés et exports acceptent des périodes de 93 jours au maximum. Un export CSV de plus de 50 000 lignes demande une période plus courte.

## Rotation Resend et anciens secrets

1. Dans Resend, relever les intégrations et l’historique d’envoi de la clé exposée dans l’historique Git. Si un usage suspect est constaté, révoquer l’ancienne clé immédiatement.
2. Créer une clé limitée à l’envoi depuis le domaine choisi. Configurer `RESEND_API_KEY` et `RESEND_FROM` dans le gestionnaire de secrets du déploiement.
3. Valider un envoi autorisé en préproduction, basculer et confirmer la réception. Révoquer l’ancienne clé puis contrôler son statut dans Resend. Examiner aussi la réutilisation éventuelle des anciennes identités MQTT, PostgreSQL et JWT.
4. Rechercher les copies dans les références Git, forks, journaux CI et images. Le nettoyage de l’historique distant est une opération distincte qui doit être coordonnée avec les propriétaires du dépôt.

## Surveillance

Relier les journaux JSON du backend à l’astreinte existante. Surveiller `security_http_request_denied`, `auth.refresh_replayed`, `mqtt_device_scope_rejected`, `mqtt_gateway_scope_rejected`, `api_log_write_failed` et `subscription_email_failed`. Valider le destinataire, les seuils et la livraison sur des événements fictifs. Les logs d’accès en base utilisent le modèle de route et omettent les paramètres et le corps des requêtes.
