# AFRIXORA — Comparaison des branches et fusion préparatoire P0 + V2

> **AVERTISSEMENT HISTORIQUE — LIRE AVANT LE RESTE :** ce rapport a été écrit **avant** réception de la branche `main` fusionnée. Son §6 dit de ne pas appliquer le patch sur l'ancien `main`. Cette phrase décrit alors l'ancien état et **ne doit pas être utilisée comme une instruction actuelle**. Le rapport ultérieur `docs/AFRIXORA_Verification_Main_Fusion_et_Prochaine_Integration.md` constate que le patch s'appliquait à **l'archive `main` fusionnée du 21/11/2026**. Une compatibilité passée ne garantit PAS celle de l'actuel clone Git : exiger une comparaison du diff, `git apply --check`, puis autorisation avant toute application. Ne jamais réinjecter ce patch automatiquement.


**Date : 21 novembre 2026**\
**Statut : candidat de développement non déployé, non validé en intégration complète.**

## 1. Périmètre inspecté

Archives reçues : `afrixora-platform-main.zip` (159 fichiers), `afrixora-platform-fix-audit-p0.zip` (174 fichiers), et précédent livrable `AFRIXORA_V2_001_Source_Modifiee.zip` (165 fichiers). Les trois ont été extraites et comparées à contenu égal, sans exécuter de code issu des archives.

La branche P0 diverge fortement de main : **73 fichiers modifiés, 32 ajoutés, 17 supprimés**. Le livrable V2-001 diverge de main : **21 modifiés, 6 ajoutés, 0 supprimé**. **15 fichiers modifiés par les deux branches se recoupent**. Une copie intégrale de l'un sur l'autre aurait écrasé des améliorations.

## 2. Décision de fusion

**Base retenue : `fix-audit-p0`.** Elle apporte notamment authentification de Socket.IO, restrictions multi-tenant, validations Zod supplémentaires, gestion des rôles, ACL et scripts Mosquitto, plusieurs tests et un pipeline CI, traitement MQTT/Redis avec retries améliorés. Ces mécanismes ont été conservés dans le candidat.

La première version V2 conservait de son côté une fonction non présente sur P0 : un journal de commandes séparant publication, accusé de réception et confirmation. La branche P0 mettait encore à jour `DeviceState` après un simple envoi MQTT ; son interface appliquait aussi un changement d'état optimiste. Ces éléments ont été adaptés dans le candidat.

## 3. Contenu de la fusion préparatoire

**14 fichiers de P0 modifiés, 4 fichiers nouveaux, 0 suppression** dans le candidat :

| Sous-système | Modification candidate |
|---|---|
| Prisma | Enum `DeviceCommandStatus`, modèle `DeviceCommand`, migration additive et relation vers `Device` |
| API équipements | `POST /:id/control` valide `set_state`, renvoie HTTP 202 ; `GET /:id/commands/:commandId` consulte le journal |
| Commandes | Feature flag `AFRIXORA_DEVICE_CONTROL_ENABLED=false`, expiration de 30 s, statut `SENT` sans fausse confirmation |
| MQTT | Accepte `command_ack` autorisé par périmètre et journal ; refuse les confirmations d'état contradictoires |
| Automatisations | Règles passant par le service journalisé ; blocage par défaut via `AFRIXORA_AUTOMATION_COMMANDS_ENABLED=false` |
| Frontend | Plus de changement optimiste de `config.state` dans la page des appareils ; la lecture affichée dépend de `DeviceState` |
| Cookies / sockets | Protection Origin sur les requêtes mutantes et les connexions Socket.IO |
| Auth | `accessToken` absent du JSON de login en production ; fallback développement conservé |
| Suppression | Suppression des journaux en suppression permanente de tenant ; suppression d'appareil avec historique refusée (409) |
| Configuration | Variables de sécurité documentées et propagées dans Docker Compose / Dockerfile |

## 4. Contrôles effectués sur la copie

- **4 tests unitaires isolés réussis** : commandes éteintes par défaut, publication sans changement d'état observé, échec MQTT enregistré, accusés MQTT cohérents.
- **106 fichiers TS/TSX analysés syntaxiquement : 0 erreur de parsing.**
- Fichier `docker-compose.yml` parsé en YAML ; neuf services reconnus.
- **Diff Git sans erreur d'espacement ; patch applicable sans conflit** sur la copie P0 reçue.
- Archive ZIP créée et vérifiée (pas de corruption signalée).

**Non effectué :** installation complète des dépendances, génération du client Prisma, `tsc --noEmit` complet, tests backend `vitest`, build Next.js, migration sur PostgreSQL, broker MQTT réel, tests matériels et audit d'intrusion.

## 5. Points à résoudre avant toute mise en production

1. **Prisma :** exécuter `prisma validate`, `prisma generate`, `prisma migrate deploy` sur base de test avec sauvegarde et stratégie de reprise.
2. **Permissions :** réexécuter les tests multi-tenant/API P0 et vérifier que l'ajout de l'historique ne casse pas la gestion des clients et la suppression.
3. **Commandes :** distinguer une confirmation logicielle MQTT d'une confirmation d'un contact auxiliaire de contacteur. Les sorties physiques restent bloquées.
4. **MQTT :** tester réellement le chiffrement et les ACL par boîtier, notamment l'interdiction de publier des ACK au nom d'un autre appareil.
5. **Interface :** la page des équipements est adaptée ; `frontend/src/components/devices/DeviceCard.tsx`, composant non référencé par la page P0, contient encore de la logique optimiste et devra être corrigé avant réutilisation.
6. **Auth de développement :** un fallback `localStorage` persiste en développement dans P0 ; ne pas exposer ce mode sur un domaine de production.
7. **Contrôle électrique :** prévoir des sécurités matérielles locales certifiées, une gestion de reprise, l'interverrouillage des sources et des règles de délestage testées sur site.
8. **Tests d'intégration :** compiler le backend et le frontend et tester MQTT/Redis/PostgreSQL/Socket.IO ensemble avant déploiement.

## 6. Application sûre du patch sur P0

Sur une **copie locale** de `fix-audit-p0`, extraire l'archive, conserver une sauvegarde, puis appliquer le patch à la racine du projet :

```bash
git apply --check AFRIXORA_P0_V2_Patch_Integration.patch
git apply AFRIXORA_P0_V2_Patch_Integration.patch
```

Ne pas appliquer au dépôt `main` : le patch est établi spécifiquement par rapport à `fix-audit-p0` et n'est pas destiné à remplacer ses protections.

Pour contrôler la version candidate :

```bash
cd backend
npm ci
npx prisma validate
npx prisma generate
npm run typecheck
npm test
# À exécuter uniquement sur une base PostgreSQL de TEST
npx prisma migrate deploy

cd ../frontend
npm ci
npm run typecheck
npm run build
```

**La branche P0 d'origine et la production n'ont pas été modifiées.**

## 7. Étape suivante : domaine électrique AFRIXORA V2

Une fois les tests de réconciliation réussis, engager de manière additive les entités `EnergySource`, `DistributionBoard`, `Circuit`, `ElectricalLoad`, `MeteringPoint` et leurs flux, puis brancher un moteur de scénarios **en simulation** avant tout contrôle réel.
