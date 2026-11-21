# AFRIXORA V2 — Index documentaire pour Codex

**Statut :** dossier documentaire de travail préparé le 21 novembre 2026. Il ne prouve pas l'état actuel de GitHub et ne déploie aucune modification.

## Pourquoi ce fichier ?

Centraliser les références de la mise à niveau **AFRIXORA Energy Management V2** et éviter les confusions entre l'ancienne branche `main`, le correctif `fix-audit-p0` et les versions candidates locales.

## Sources existantes à préserver sans les écraser

1. `docs/AFRIXORA_CONTEXT.md` — contexte initial du MVP ; certaines mentions d'étapes passées peuvent être historiques.
2. `docs/AFRIXORA_RULES.md` — conventions du projet.
3. `docs/ARCHITECTURE_DECISIONS.md` — décisions d'architecture existantes.
4. `docs/AFRIXORA_CLAUDE_CODE_PROMPTS.md` — ancien plan P0 ; ne pas le rejouer sans vérifier que les corrections sont absentes.
5. `docs/AFRIXORA_MVP_PROMPTS.md` — historique de développement du MVP.

## Nouveaux documents V2 — à lire selon la tâche

| Document | Usage | Statut |
|---|---|---|
| `docs/AFRIXORA_Energy_Management_V2_Architecture.md` | Cible métier, entités et contraintes électriques | **Proposition V2 approuvée sur le principe**, pas implémentation |
| `docs/AFRIXORA_V2_Diagramme_ER.mmd` | Diagramme conceptuel de la topologie et des relations | **Conceptuel**, ne pas confondre avec Prisma |
| `docs/AFRIXORA_V2_Guide_Prompts_Codex_VSCode.md` | Feuille de route par phases pour Codex | **Plan proposé**, lire la phase pertinente |
| `docs/AFRIXORA_Verification_Main_Fusion_et_Prochaine_Integration.md` | Comparaison du `main` ZIP fusionné et correctifs V2 manquants | **Constat daté sur une archive**, à revérifier dans le dépôt actuel |
| `docs/AFRIXORA_Rapport_Reconciliation_Branches_P0_V2.md` | Origine et justification des changements P0/V2 | **Historique de comparaison**, ne prouve pas un merge GitHub |
| `docs/AFRIXORA_V2_PROMPT_DEMARRAGE_CODEX.md` | Prompt d'orientation pour première session Codex | **Mode d'emploi actif** |
| `docs/AFRIXORA_V2_SUIVI.md` | Registre des étapes, critères GO/NO-GO, réserves et décisions | **Suivi vivant : à actualiser après chaque phase** |
| `docs/AFRIXORA_V2_INDEX.md` | Priorités et classement des sources | **Point d'entrée** |

## Documents historiques — lecture de référence uniquement

- `docs/historique/AFRIXORA_V2_Rapport_Audit_Statique_et_Plan_Integration.md` : audit de l'ancien `main`, avant fusion P0. **Les vulnérabilités qui y sont décrites peuvent avoir été corrigées depuis**.
- `docs/historique/AFRIXORA_P0_V2_INTEGRATION.md` : notes d'une version *candidate locale*, non déployée ; **ne signifie pas que ses changements sont présents sur GitHub**.

## Clarifications obligatoires avant de coder

- **Patch historique :** le rapport de réconciliation P0 avait été écrit avant la fusion de `main` et indiquait de ne pas appliquer le patch à l'ancien `main`. La vérification datée du `main` fusionné montre qu'il était applicable à **cette archive précise**. Sur le Git local actuel, cela reste à revérifier ; ne jamais appliquer automatiquement.
- **ApiKey :** le schéma de l'archive `main` fusionnée possède `keyHash`, pas le champ `key` de l'ancien audit. Vérifier ensuite la logique de services et de rotation ; ne pas régresser vers le stockage des clés en clair.
- **Commandes V2 :** le patch transitoire lie `DeviceCommand` à `deviceId` avec l'état `CONFIRMED` issu d'une déclaration du boîtier. L'architecture cible propose `ControlEndpoint` / `endpointId` et **une vérification physique distincte**. Une confirmation logicielle n'est jamais, à elle seule, une preuve de coupure électrique.
- **Périmètre :** les interdictions de nouvelles fonctions dans `AFRIXORA_RULES.md` décrivaient le MVP historique. L'extension **Energy Management V2 uniquement** est approuvée au niveau du projet ; sécurité, monolithe et simplicité demeurent obligatoires.
- **Suivi :** avant de commencer une phase, consulter et actualiser `docs/AFRIXORA_V2_SUIVI.md` une fois les résultats validés ; les lignes initiales ne constituent pas des validations de production.

## Règle de vérité en cas de contradiction

1. **État réel du dépôt Git local** : branche, commits, `git status`, contenu actuel des fichiers, schéma Prisma et migrations.
2. **Tests exécutés maintenant** sur un environnement isolé, avec leur sortie réelle.
3. **Conventions actives** : `AFRIXORA_RULES.md`, `ARCHITECTURE_DECISIONS.md`, sous réserve de cohérence avec le code.
4. **Cible V2 validée sur le principe** : cahier d'architecture + diagramme (ne pas supposer qu'ils sont implémentés).
5. **Rapports datés et anciens prompts** : éléments d'historique, jamais preuve de l'état présent.

**Ne jamais exécuter automatiquement le patch P0+V2 ni copier une ancienne archive dans le dépôt.** Vérifier d'abord les modifications déjà présentes, puis obtenir la validation du propriétaire. Le fichier `.patch` historique doit rester hors de `docs/` ; si nécessaire, fournir explicitement son chemin local réel.

## Invariants obligatoires

- Ne pas toucher à `main`, à la production, aux secrets ni au matériel électrique pendant un audit documentaire.
- Maintenir l'isolation multi-tenant, l'authentification des commandes, les ACL MQTT et la vérification des droits.
- Séparer **commande demandée**, **commande envoyée**, **ACK logiciel** et **état physique confirmé**.
- Le contrôle électrique réel reste désactivé par défaut ; les protections et commutations doivent être autonomes et validées matériellement.
- Préserver le monolithe modulaire existant ; éviter la duplication de `Device`, `EnergySource`, `Circuit` et des séries de mesures.
- Une phase = un périmètre documenté, preuves de tests, revue des changements et accord pour la phase suivante.
