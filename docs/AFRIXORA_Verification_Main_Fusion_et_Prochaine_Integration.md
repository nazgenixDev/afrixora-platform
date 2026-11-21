# AFRIXORA — Vérification du `main` fusionné et procédure d’intégration P0+V2

**Date :** 21 novembre 2026\
**Périmètre :** uniquement les archives transmises ; aucun accès ni changement appliqué au dépôt GitHub ou à la production.

## 1. Résultat de comparaison

- Nouveau `main` : **174 fichiers** ; branche `fix-audit-p0` : **174 fichiers**. Leur contenu est **identique**, fichier par fichier.

- Candidat V2 : **178 fichiers**, soit **14 modifications**, **4 ajouts** et **0 suppression** par rapport au nouveau `main`.

- Le patch existant `AFRIXORA_P0_V2_Patch_Integration.patch` a passé `git apply --check` sur l’archive `main` reçue.

- Le patch a été appliqué à une **copie temporaire** de la nouvelle archive `main` et les 178 fichiers obtenus sont identiques à ceux du candidat P0+V2.

- `node --test backend/tests/v2_p0_isolated.test.cjs` : **4 tests réussis sur 4** (tests isolés, non intégrés).

## 2. Fichiers à modifier dans `main`

1. `.env.example`

2. `backend/prisma/schema.prisma`

3. `backend/src/app.ts`

4. `backend/src/middleware/socketAuth.ts`

5. `backend/src/routes/auth.ts`

6. `backend/src/routes/devices.ts`

7. `backend/src/services/automationEngine.ts`

8. `backend/src/services/deviceService.ts`

9. `backend/src/services/mqttWorker.ts`

10. `backend/src/services/tenantService.ts`

11. `docker-compose.yml`

12. `frontend/.env.example`

13. `frontend/Dockerfile`

14. `frontend/src/app/(dashboard)/devices/page.tsx`

## 3. Fichiers à ajouter dans `main`

1. `backend/prisma/migrations/20261121000100_device_command_journal/migration.sql`

2. `backend/src/middleware/enforceOrigin.ts`

3. `backend/tests/v2_p0_isolated.test.cjs`

4. `docs/AFRIXORA_P0_V2_INTEGRATION.md`

## 4. Procédure recommandée, sans écrire directement dans `main`

1. S’assurer que le dépôt GitHub contient bien **la même version** que le ZIP téléchargé et que `git status` ne signale aucun travail non sauvegardé.

2. Créer une branche dédiée à partir du `main` à jour :

```bash
git switch main
git pull --ff-only origin main
git switch -c feature/afrixora-v2-stabilisation
```

3. Placer le fichier `AFRIXORA_P0_V2_Patch_Integration.patch` à portée du terminal (l’exemple ci-dessous suppose qu’il se trouve dans le répertoire courant du dépôt) et appliquer :

```bash
git apply --check AFRIXORA_P0_V2_Patch_Integration.patch
git apply AFRIXORA_P0_V2_Patch_Integration.patch
git status --short
git diff --check
```

**Important :** si `git apply --check` signale un conflit, ne pas forcer le patch : comparer à nouveau la branche GitHub avec l’archive reçue.

4. Valider d’abord les fichiers et les tests en environnement local ou de staging :

```bash
cd backend
npm ci
npx prisma validate
npx prisma generate
npm run typecheck
npm test
node --test tests/v2_p0_isolated.test.cjs
cd ../frontend
npm ci
npm run typecheck
npm run build
```

5. Vérifier la migration sur **une base PostgreSQL de test isolée**, après sauvegarde. Ne pas pointer `DATABASE_URL` sur la production. Tester également Mosquitto, Redis, Socket.IO et les autorisations multi-tenant.

6. Committer la branche, la publier et ouvrir une Pull Request vers `main` **uniquement après validation**. Les commandes et actions électriques réelles doivent rester désactivées.

## 5. Limites et décision

- L’archive `main` contient les correctifs P0 mais pas encore les correctifs V2 de commandes journalisées.

- Le candidat P0+V2 reste une **version de développement** ; il ne constitue pas l’ensemble du futur AFRIXORA Energy Management V2 (les modèles sources/circuits/charges et fonctions métiers avancées restent à développer).

- Les tests complets (`tsc`, `vitest`, build Next.js, migrations réelles, essais MQTT et équipements) **n’ont pas été exécutés dans cette vérification**. Aucune aptitude à la production n’est affirmée.

**Référence recommandée :** nouvelle branche `main` du dépôt GitHub pour la source, `AFRIXORA_P0_V2_Patch_Integration.patch` pour les correctifs à proposer par Pull Request. Archiver le ZIP P0+V2 candidat et les ZIP historiques, sans les réinjecter aveuglément.

## 6. Empreintes de traçabilité

- `main` reçu — SHA-256 : `f46ed8322578d01ea7f18dfe78a989b62c1f41a6f321b768a075adab435121fe`

- Patch de stabilisation — SHA-256 : `812e2613ca458f2a18352fa4ca5da514de420f2ec1d65e970f5c54ca2ceaba17`
