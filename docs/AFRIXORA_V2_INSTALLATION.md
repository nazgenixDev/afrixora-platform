# Installer les documents V2 dans un dépôt AFRIXORA existant

**Ne remplacez pas le dépôt avec un ancien ZIP du projet.** Utilisez votre clone GitHub `main` actuel dans VS Code.

1. Vérifiez `git status` et sauvegardez vos modifications locales. Si un fichier `AGENTS.md` existe déjà à la racine, **fusionnez les instructions manuellement**, sans écraser son contenu.
2. Ouvrez l'archive `AFRIXORA_V2_Documentation_Pour_Codex.zip` et copiez :
   - le fichier `AGENTS.md` dans **la racine du dépôt** ;
   - tous les nouveaux documents du répertoire `docs/` dans **`<racine-du-projet>/docs/`**, en conservant `docs/historique/`.
3. Conservez les fichiers déjà présents dans `docs/` (ne pas supprimer `AFRIXORA_CONTEXT.md`, `AFRIXORA_RULES.md`, `ARCHITECTURE_DECISIONS.md`, `AFRIXORA_CLAUDE_CODE_PROMPTS.md`, `AFRIXORA_MVP_PROMPTS.md`).
4. Dans le terminal VS Code, vérifiez les fichiers nouveaux avec `git status --short` et `git diff --check` (le second ne vérifie que les fichiers suivis).
5. Vérifiez la présence de `docs/AFRIXORA_V2_INDEX.md` et `docs/AFRIXORA_V2_SUIVI.md` ; ces fichiers rendent explicites les réserves documentaires et le suivi des phases. Ouvrez Codex depuis la racine du projet et envoyez le prompt dans `docs/AFRIXORA_V2_PROMPT_DEMARRAGE_CODEX.md`.
6. Après son rapport d'audit, donnez votre accord avant de créer une branche de travail ou de modifier du code.

Ce pack ajoute **seulement des documents et des instructions d'agent**. Aucun correctif P0+V2 n'est appliqué et aucun fichier de code n'est modifié.
