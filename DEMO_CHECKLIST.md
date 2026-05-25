# AFRIXORA™ — Checklist Démonstration Client

## Avant la démo (vérifier chaque point)

- [ ] Docker Desktop est lancé
- [ ] `docker ps` montre `afrixora-postgres` et `afrixora-mosquitto` en "Up"
- [ ] Le backend démarre sans erreur (`cd backend && npm run dev`)
- [ ] Le frontend démarre sans erreur (`cd frontend && npm run dev`)
- [ ] Les données de démo sont injectées (script start-demo.sh)
- [ ] Login fonctionne : admin@afrixora.cd / Admin123!
- [ ] Le dashboard affiche les KPIs et graphiques

## Scénario de démonstration (10 minutes)

1. **Connexion** (30s)
   - Se connecter avec admin@afrixora.cd

2. **Dashboard** (2 min)
   - Montrer les KPIs (puissance, conso, appareils, alertes)
   - Changer de bâtiment avec le sélecteur
   - Montrer le graphique de consommation 7 jours
   - Montrer la répartition par zone (donut)
   - Montrer les mini-cartes appareils avec toggles

3. **Buildings** (1 min)
   - Lister les bâtiments
   - Ouvrir le détail d'un bâtiment (zones + appareils)

4. **Devices** (2 min)
   - Vue tableau avec filtres
   - Vue grille
   - Toggle on/off un appareil
   - Ajouter un appareil (démo du formulaire)

5. **Energy** (1 min30)
   - Changer les périodes (24h/7j/30j)
   - Montrer le graphique principal
   - Montrer le tableau par zone
   - Exporter en CSV

6. **Rapports** (30s)
   - Télécharger un CSV

7. **Utilisateurs & Rôles** (1 min)
   - Créer un utilisateur avec rôle limité
   - Se déconnecter et se reconnecter avec ce compte
   - Montrer que la sidebar est filtrée

8. **Paramètres & Profil** (30s)
   - Ouvrir le menu utilisateur
   - Aller dans Paramètres → À propos

## Points à mettre en avant

- Interface 100% responsive (mobile/tablette/desktop)
- Multi-tenant (chaque client voit ses propres données)
- RBAC (chaque rôle a des permissions différentes)
- Temps réel via MQTT + Socket.IO
- Export CSV/PDF pour la conformité
- Hébergement local (ORICO CF1000) — souveraineté des données

## En cas de problème

- `docker start afrixora-postgres afrixora-mosquitto`
- `cd backend && npm run dev`
- `cd frontend && npm run dev`
