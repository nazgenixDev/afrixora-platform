# AFRIXORA V2 — Prompt de démarrage Codex (lecture seule)

Copier intégralement le bloc ci-dessous dans Codex **après** avoir placé les documents sous `docs/` et `AGENTS.md` à la racine. Ouvrir le dossier racine du dépôt dans VS Code.

---

Tu es mon ingénieur principal sur AFRIXORA Energy Management V2. Tu travailles sur le dépôt Git actuellement ouvert dans VS Code.

**MISSION 0 — LECTURE DOCUMENTAIRE ET COMPARAISON, SANS ÉCRITURE.**

1. Localise et lis `AGENTS.md`, `docs/AFRIXORA_V2_INDEX.md` et `docs/AFRIXORA_V2_SUIVI.md`.
2. Lis les documents existants :
   - `docs/AFRIXORA_CONTEXT.md`
   - `docs/AFRIXORA_RULES.md`
   - `docs/ARCHITECTURE_DECISIONS.md`
   - `docs/AFRIXORA_CLAUDE_CODE_PROMPTS.md`
   - `docs/AFRIXORA_MVP_PROMPTS.md`
3. Lis les documents V2 que nous avons ajoutés :
   - `docs/AFRIXORA_Energy_Management_V2_Architecture.md`
   - `docs/AFRIXORA_V2_Diagramme_ER.mmd`
   - `docs/AFRIXORA_V2_Guide_Prompts_Codex_VSCode.md`
   - `docs/AFRIXORA_Rapport_Reconciliation_Branches_P0_V2.md`
   - `docs/AFRIXORA_Verification_Main_Fusion_et_Prochaine_Integration.md`
   - `docs/historique/AFRIXORA_V2_Rapport_Audit_Statique_et_Plan_Integration.md`
   - `docs/historique/AFRIXORA_P0_V2_INTEGRATION.md`
4. Dresse un inventaire de chaque fichier lu et précise son rôle, son statut (actif, proposition, historique) et les contradictions éventuelles. Vérifie explicitement les trois réserves de l'index (patch historique, ApiKey keyHash, DeviceCommand transitoire versus cible). S'il manque un fichier, signale-le sans inventer de contenu.
5. Consulte la branche active, les commits récents et `git status` sans changer de branche. Inspecte les fichiers applicatifs concernés (`backend/prisma/schema.prisma`, migrations, services de commandes, MQTT, automatisations, routes, authentification, frontend) pour vérifier **l'état réel** du dépôt.
6. Compare ce qui est **déjà implémenté** aux correctifs P0, au journal `DeviceCommand` proposé et à l'architecture électrique V2. Ne considère pas les ZIP, rapports ou fichiers Markdown comme une preuve que le code a changé.
7. Rédige un rapport clair : fonctionnalités présentes, corrections encore absentes, risques prioritaires, fichiers concernés, ordre d'intégration, tests à réaliser et questions bloquantes.

**RÈGLES IMPÉRATIVES**
- Audit en lecture seule : ne crée, ne modifie, ne supprime aucun fichier ; n'applique aucun patch.
- Ne fais aucune migration, aucun déploiement, aucune commande vers des équipements et aucun changement Git distant.
- Ne publie ni n'affiche aucun secret ou valeur de fichier `.env`.
- Ne crée pas de commit et ne pousse rien sur GitHub.
- Signale expressément tout désaccord entre documentation historique et code courant.
- À la fin, présente ton rapport et attends ma validation pour la phase de stabilisation.
