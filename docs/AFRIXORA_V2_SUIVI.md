# AFRIXORA Energy Management V2 — Suivi des phases et garde-fous

**État initial documenté : 21 novembre 2026.** Ce tableau représente des tâches à vérifier dans le dépôt Git ouvert, pas une certification de déploiement. Toute preuve de test ou décision ultérieure doit être datée, liée à la branche/commit correspondant et vérifiable.

## Méthode
- Après chaque phase : enregistrer **branche + commit, livrables, fichiers changés, tests réussis/échoués/non exécutés, risques et décision humaine GO/NO-GO**.
- Ne pas confondre « rapport disponible », « code présent », « test isolé réussi », « test d'intégration réussi » et « prêt pour la production ».
- En cas de désaccord, le code local actuel et les tests réellement exécutés priment sur les rapports historiques.

## Tableau de suivi initial

| Phase | Livrable attendu | État initial à partir des archives | Condition pour avancer |
|---|---|---|---|
| 0 — Audit documentaire/Git | Inventaire des documents, état de `main`, comparaison code/patch et plan | Pack documentaire vérifié ; **état Git local non vérifié** | Rapport Codex en lecture seule approuvé |
| 1 — Stabilisation | Journal des commandes et correctifs P0+V2 sans doublons | P0 présent dans le ZIP `main` reçu ; patch V2 absent dans cet instantané ; **intégration Git non faite ici** | Build, tests, permissions, migration sur base isolée, aucun pilotage réel |
| 2 — Modèle de données | Sources, bus, chemins, tableaux, circuits, charges, points de mesure, endpoints | Architecture proposée ; **schéma V2 non intégré** | Migration additive, FK/tenant, test de restauration, schéma/contraintes validés |
| 3 — API | Services et routes tenant-safe sur topologie et équipements | **À développer** | Tests API, RBAC, isolation clients et validation Zod |
| 4 — Mesures/finances | Provenance, séries, coûts calculés et qualité des données | **À développer ou étendre** | Test d'unités, horodatage, déduplication, non-double-comptage, USD/CDF documentés |
| 5 — Automatisation | Priorités, règles, simulations sans actionneur réel | Automatisation P0 existante ; extension V2 **à développer** | Simulations, limites, conflits de règles, sécurité locale |
| 6 — Frontend | Navigation unifiée Energy Management V2 | Interface existante ; extension V2 **à développer** | Tests navigation, autorisations, états affichés honnêtement |
| 7 — Extensions | Carburant, maintenance, hors-ligne et finance avancée | **Lots séparés, non validés** | Tests par sous-lot, preuves sur matériel, conformité locale |
| 8 — Recette / livraison | Test intégré complet, revue de sécurité, documentation et PR | **Non réalisée** | Checklist GO/NO-GO, tests de restauration et validation humaine |

## Contrôles transversaux à ne pas oublier

- [ ] Isolation tenant/bâtiment/équipement sur REST, MQTT et Socket.IO, y compris ACK usurpés
- [ ] Authentification, cookies, CSRF/Origin, permissions, limites de débit, secrets, logs et sauvegardes
- [ ] `DeviceCommand` : **INTENTION → SENT → ACK logiciel → ÉTAT DÉCLARÉ → ÉTAT PHYSIQUE VÉRIFIÉ** ; aucun raccourci implicite
- [ ] Vérification physique indépendante lorsqu'une commande concerne un circuit électrique réel
- [ ] Aucun contrôle matériel activé dans la configuration par défaut ; protection et interverrouillages autonomes
- [ ] Tests de reconnexion, stockage local du boîtier, horloge RTC, déduplication et perte de réseau
- [ ] Non-double-comptage de l'énergie, différenciation Wh cumulés/périodiques et états de qualité
- [ ] Tarifs datés, types Decimal, coûts mesurés/estimés, devise et taux USD/CDF traçables
- [ ] Carburant : détection d'anomalies plutôt qu'accusation automatique de fraude
- [ ] Maintenance : distinguer rappel horaire et véritable prévision validée
- [ ] Mobile Money/prépaiement reporté après vérifications juridiques, commerciales et matérielles ; **aucune coupure automatique autorisée dans ce chantier**
- [ ] Compatibilité descendante, migrations additives testées et restauration vérifiée
- [ ] Documentation/index/diagramme synchronisés avec la réalité à chaque livraison

## Réserves actuellement ouvertes

1. **Ancien rapport de réconciliation** : son interdiction d'appliquer le patch sur l'ancien `main` a été dépassée par une vérification plus récente de l'archive fusionnée ; revalider toujours sur le clone actuel.
2. **Clés API** : le schéma de l'archive `main` fusionnée utilise `ApiKey.keyHash`, et non l'ancien `ApiKey.key` ; vérifier aussi les services et la sécurité effective.
3. **Commandes** : le `DeviceCommand` du patch de stabilisation utilise `deviceId` et `CONFIRMED` (état déclaré par firmware). La cible V2 envisage `ControlEndpoint` et preuve matérielle distincte. Ne pas interpréter le `CONFIRMED` transitoire comme une vérification physique.
4. **Règles MVP** : l'ancien périmètre excluait AI/ML et les nouveaux secteurs. Le seul changement autorisé ici est **Energy Management V2 dans le module existant**, pas une réécriture de la stack ou une ouverture automatique à d'autres produits.

## Journal de décision à compléter

| Date / commit | Phase | Décision | Tests / preuves | Responsable |
|---|---|---|---|---|
| 2026-11-21 / non vérifié | 0 | Documentation de départ préparée ; audit Git local encore requis | Contrôle de l'archive ZIP et lecture documentaire | À renseigner |
| 2026-11-21 / `8d78b9e` | 1 | Commit local du lot logiciel autorisé. Pilotage réel et mise en production en réserve. | 51 tests backend, 13 tests isolés, build frontend, migration et restauration PostgreSQL, ACL et TLS sur Mosquitto jetable. [Note d’intégration](AFRIXORA_P0_V2_INTEGRATION.md) | Propriétaire du dépôt |
