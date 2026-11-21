# Journal des changements AFRIXORA

## Lot P0 — Proposition de notes de version

- Suppression des secrets de démonstration codés en dur dans le script de démarrage, des sauvegardes versionnées et de la page de connexion de secours. Les nouvelles clés API utilisent le préfixe `afrx_live_`.
- Appareils et alertes filtrés par le tenant authentifié. Les écritures d’appareils valident les champs acceptés et l’appartenance des références. Les alertes disposent de filtres, d’une pagination et d’un compteur de non-lues basé sur le total filtré.
- Protection des comptes `SUPER_ADMIN` contre les opérations de gestion par un `TENANT_ADMIN`. Le changement de rôle et la désactivation révoquent les JWT précédents.
- Authentification des connexions Socket.IO et contrôle de l’accès à chaque canal de bâtiment.
- Validation Zod des automatisations, de la création des tenants et des scopes des clés API. Le moteur d’automatisation traite les mesures égales à zéro et attend la publication des commandes MQTT.
- Les identifiants invalides renvoient 401. La connexion et le rafraîchissement ont des limites distinctes. Le nombre de sauts proxy de confiance est configurable et le frontend rejoue une requête après un rafraîchissement réussi.

La revue de clôture relève trois erreurs de syntaxe TypeScript côté frontend et des écarts d’isolation dans plusieurs routes. La validation du lot reste ouverte.
