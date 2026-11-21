# AGENTS.md — AFRIXORA (Codex / VS Code)

Projet : AFRIXORA, plateforme SaaS IoT multi-tenant, évolution du module Energy vers Energy Management V2.

## Démarrage d'une nouvelle session de travail
- Lire d'abord `docs/AFRIXORA_V2_INDEX.md`, `docs/AFRIXORA_V2_SUIVI.md`, `docs/AFRIXORA_CONTEXT.md`, `docs/AFRIXORA_RULES.md` et `docs/ARCHITECTURE_DECISIONS.md`.
- Pour la **première vérification V2**, lire aussi les documents V2 recensés dans l'index, y compris les rapports historiques, et les classer entre **état observé**, **proposition** et **historique**.
- Pour une tâche ultérieure, charger uniquement les documents V2 pertinents et la phase correspondante de `docs/AFRIXORA_V2_Guide_Prompts_Codex_VSCode.md`.
- Le dépôt réel prévaut sur les rapports datés ; ne jamais présumer qu'une migration, un patch ou une correction sont déjà appliqués sans vérifier les fichiers et les tests.

## Règles de travail
- Avant de coder, examiner `git status`, la branche, les modifications non commitées, les fichiers concernés, les relations Prisma et les tests existants.
- Ne pas modifier `main` directement ; préparer une branche dédiée seulement après accord et sans écraser de travail local.
- L'audit initial est en **lecture seule** : ne modifier aucun fichier sauf instruction explicite ultérieure.
- Ne jamais exécuter un patch, un `git reset --hard`, un `git push`, une migration de production, un déploiement ou une commande matérielle sans validation explicite.
- Suivre les conventions du monolithe TypeScript, la validation serveur, le cloisonnement tenant et les principes de sécurité décrits dans `docs/AFRIXORA_RULES.md`.
- Lors de futures implémentations, utiliser des migrations additives testées sur base isolée ; préserver les données et APIs existantes.
- Ne jamais déclarer un état électrique confirmé sur la seule base d'une publication MQTT ou d'un ACK de réception.
- Désactiver par défaut les actions matérielles ; n'effectuer aucun essai de puissance sans banc sécurisé, protections indépendantes et autorisation du responsable.
- Après chaque phase : liste des fichiers touchés, tests réellement exécutés et résultats, risques restants, proposition de prochaine phase.
- Ne jamais exposer de secrets, tokens, données privées, fichiers `.env` ou identifiants de production dans les rapports.
