# AFRIXORA — Guide de Déploiement (ORICO CF1000 / VPS)

> Cible : serveur local ORICO CF1000 (Intel i5-1240P, 32GB DDR5, 2×NVMe RAID 1 ZFS)
> Exposition HTTPS : Cloudflare Tunnel (cloudflared)

---

## 1. Prérequis

| Composant | Version min | Installation |
|-----------|-------------|--------------|
| Docker | 24.x | `curl -fsSL https://get.docker.com \| sh` |
| Docker Compose | Plugin avec `up --wait` et `--wait-timeout` | Vérifier avec `docker compose version` et `docker compose up --help` |
| Git | 2.x | `apt install git` |
| OpenSSL et mosquitto_passwd | Outils hôte | Paquets `openssl` et `mosquitto-clients` ou `mosquitto` selon la distribution |
| UPS | 1500VA | Obligatoire (protection coupures SNEL) |

---

## 2. Configuration

### 2.1 Cloner le projet
```bash
git clone https://github.com/nazgenixDev/afrixora-platform.git
cd afrixora-platform
```

### 2.2 Générer les secrets
```bash
install -m 600 .env.example .env
# Générer des secrets forts (ne pas utiliser les valeurs par défaut)
openssl rand -base64 48  # JWT_SECRET
openssl rand -base64 48  # JWT_REFRESH_SECRET
openssl rand -hex 32  # DB_PASSWORD
openssl rand -hex 32  # DB_API_PASSWORD
openssl rand -hex 32  # DB_GRAFANA_PASSWORD
openssl rand -hex 32  # DB_BACKUP_PASSWORD
openssl rand -hex 32  # REDIS_PASSWORD
openssl rand -hex 32  # MQTT_API_PASSWORD
openssl rand -hex 32  # GRAFANA_PASSWORD
```

### 2.3 Configurer les variables d'environnement
Renseigner les secrets dans `.env` avec le mode `0600`. Le script charge ce fichier avec Bash. Mettre les valeurs contenant des caractères spéciaux entre apostrophes. Sur une base existante, conserver le mot de passe PostgreSQL d’administration déjà actif dans `DB_PASSWORD`. Sur un volume PostgreSQL initialisé, modifier cette variable ne change pas le mot de passe du rôle.
```env
NODE_ENV=production
DOMAIN=afrixora.cd
CORS_ORIGINS=https://afrixora.cd
NEXT_PUBLIC_API_URL=https://api.afrixora.cd
CLOUDFLARE_TUNNEL_TOKEN='VOTRE_JETON_CLOUDFLARE'
RETENTION_DAYS=365
```

`RETENTION_DAYS` accepte un entier strictement positif. Avec 365 jours par défaut, TimescaleDB supprime les partitions de mesures entièrement expirées. Une modification de la valeur s’applique au redéploiement. `DEPLOY_WAIT_TIMEOUT` fixe, en secondes, la durée maximale de chaque attente Compose (180 par défaut).

Les trois nouveaux mots de passe PostgreSQL doivent être distincts du mot de passe d’administration et les uns des autres. `DB_API_PASSWORD` sert à l’API, `DB_GRAFANA_PASSWORD` à Grafana et `DB_BACKUP_PASSWORD` aux sauvegardes. `RESEND_FROM` peut désigner une adresse d’expédition configurée sur un domaine vérifié.

### 2.4 Configurer Cloudflare Tunnel

Créer un tunnel géré dans Cloudflare et copier son jeton dans `CLOUDFLARE_TUNNEL_TOKEN`. Associer `afrixora.cd`, `api.afrixora.cd` et `grafana.afrixora.cd` au service `http://traefik:80`. Le conteneur `cloudflared` utilise ce jeton pour se connecter au tunnel.

Les trois routes HTTP sont déclarées dans `infrastructure/docker/traefik/routes.yml`. Traefik les résout par les réseaux Compose sans accéder au socket Docker. Pour les passerelles distantes sur WebSocket, configurer séparément une route de tunnel autorisée vers `http://mosquitto:9001`. Valider les certificats, HTTPS/WSS, les redirections et la chaîne `TRUST_PROXY_HOPS` depuis le point d’entrée réellement utilisé. Le trafic entre le tunnel et Traefik utilise le réseau Docker sans port publié sur l’hôte.

Traefik reconnaît les en-têtes de transfert uniquement sur le réseau interne réservé à cloudflared. Son sous-réseau `TUNNEL_INGRESS_SUBNET` vaut `10.253.247.0/29` par défaut. Choisir un autre CIDR privé s’il chevauche un réseau du serveur. Conserver `TRUST_PROXY_HOPS=2` pour ce chemin et vérifier avec deux clients de test que leurs compteurs de limitation sont distincts.

### 2.5 Préparer le chiffrement des sauvegardes

Générer une clé de restauration sur le poste ou dans le coffre destiné à la restauration. Conserver la clé privée hors du serveur applicatif. Copier uniquement le certificat public au chemin `BACKUP_CERT_PATH`, par défaut `infrastructure/docker/backup-cert.pem`.

```bash
umask 077
openssl req -newkey rsa:3072 -x509 -sha256 -days 365 -subj '/CN=AFRIXORA Backup' \
  -keyout /chemin/protege/backup-key.pem -out /chemin/protege/backup-cert.pem
```

Renouveler le certificat avant son expiration. Garder les anciennes clés privées dans le coffre tant que des archives correspondantes sont conservées. `BACKUP_STORAGE_PATH` permet de choisir un répertoire dédié, par défaut `./backups`, ignoré par Git.

---

## 3. Avant la mise à jour d’une installation existante

```bash
docker compose exec -T postgres printenv PGDATA
docker inspect "$(docker compose ps -q postgres)" \
  --format '{{range .Mounts}}{{println .Name .Destination}}{{end}}'
```

Le chemin actif de l’image TimescaleDB HA est `/home/postgres/pgdata/data`. Le script bloque le déploiement si le conteneur PostgreSQL existant utilise un autre stockage que le volume nommé attendu. Sauvegarder la base depuis l’ancien conteneur avant toute recréation, vérifier la restauration sur un projet Compose isolé, puis restaurer dans le volume nommé avant de relancer le déploiement. [Procédure TimescaleDB de sauvegarde et restauration](https://github.com/timescale/docs/blob/latest/self-hosted/backup-and-restore/logical-backup.md)

```bash
umask 077
docker compose exec -T postgres pg_dump -Fc -U afrixora -d afrixora_prod \
  > ../afrixora-avant-p1-1.dump
docker compose exec -T postgres pg_restore --list < ../afrixora-avant-p1-1.dump
```

Si la migration Prisma `20260608234433_add_subscription_plans` est encore en attente sur une base existante, examiner les valeurs de `Alert.type` et sauvegarder les plans des tenants. Cette migration échoue si d’anciennes valeurs `AlertType` sont utilisées et recrée la colonne `Tenant.plan` avec la valeur `BASIC`.

Reporter les secrets dans le fichier `.env` protégé, préparer les identifiants MQTT et le certificat public avant la fenêtre de maintenance. Les nouveaux réseaux et rôles s’appliquent sans recréer les volumes PostgreSQL, Redis, MQTT et Grafana. Si Redis fonctionne encore en RDB seul, suivre la préparation AOF de la section 10. Les processus API doivent redémarrer ensemble avec le nouveau compte Redis.

---

## 4. Construction et déploiement

```bash
./infrastructure/scripts/deploy.sh
```

Le script utilise le code déjà présent sur le serveur et déroule les opérations suivantes.

1. Charge `.env` et vérifie les fichiers d’identifiants et l’ACL Mosquitto ainsi que le certificat public avant de modifier les services.
2. Démarre PostgreSQL et attend que son contrôle de santé TCP soit au vert.
3. Arrête l’API et applique les migrations Prisma dans un conteneur temporaire avec le compte d’administration. Sur une installation neuve, Prisma initialise son historique avant la création des tables TimescaleDB.
4. Applique `infrastructure/scripts/01_schema.sql` puis `infrastructure/scripts/03_roles.sql` avec `psql`. L’API obtient les droits de lecture et d’écriture nécessaires. Grafana ne reçoit que des vues de supervision. Le rôle de sauvegarde dispose de `pg_read_all_data` pour inclure les données et relations TimescaleDB internes. Ces rôles ne peuvent pas administrer le serveur.
5. Démarre les services et attend la réussite des contrôles de santé, dont ceux de Grafana, Redis, Mosquitto et de la sauvegarde. `docker compose ps` affiche leur état.

---

## 5. Initialisation optionnelle du compte administrateur

```bash
./infrastructure/scripts/deploy.sh --seed
```

Le seed crée le tenant initial si la base est vide et initialise `admin@afrixora.cd` à partir de `SEED_ADMIN_PASSWORD`. En production, utiliser un mot de passe fort et unique. Relancer le seed avec un mot de passe explicite réinitialise celui du compte existant et invalide ses sessions.

---

## 6. Monitoring

- **Grafana** est accessible sur `https://grafana.afrixora.cd` via Traefik. Le port hôte `3001` est réservé à `docker-compose.dev.yml`.
- **Traefik** charge les routes depuis un fichier local monté en lecture seule.
- **API** expose `/health` pour la vivacité. Le contrôle d’état Docker utilise `/ready` sur la boucle locale du conteneur et attend PostgreSQL, Redis et les abonnements MQTT du worker. En cas d’échec, examiner les journaux de l’API et du broker avant de poursuivre la bascule.
- **Images** : les références de Grafana et cloudflared sont versionnées. Sur une installation existante, vérifier la version en service avant de changer d’image. `GRAFANA_IMAGE` et `CLOUDFLARED_IMAGE` peuvent référencer les digests des images validées par l’exploitant.
- **Logs** : `docker compose logs -f`
- **Sauvegardes PostgreSQL** : à 2 h, heure de Lubumbashi. Le conteneur effectue aussi une sauvegarde au démarrage si sa dernière réussite remonte à plus de 26 heures. Configurer la supervision pour alerter sur son état de santé et l’absence de copie hors hôte. Les archives chiffrées locales expirent au bout de 30 jours. Exporter régulièrement les archives chiffrées vers le stockage hors hôte.

---

## 7. Maintenance

### 7.1 Mise à jour
```bash
git pull --ff-only origin main
./infrastructure/scripts/deploy.sh
```

### 7.2 Backup manuel
```bash
docker compose exec postgres-backup /usr/local/bin/backup.sh
```

### 7.3 Restauration

Tester sur une instance isolée compatible TimescaleDB. Effectuer les opérations de préparation et de finalisation de la restauration requises par TimescaleDB. La clé privée reste sur le poste qui réalise la restauration.

```bash
(
  set -e
  umask 077
  fichier_restauration=$(mktemp)
  trap 'rm -f "$fichier_restauration"' EXIT
  openssl cms -decrypt -binary -inform DER -in "$archive" -recip "$certificat_public" \
    -inkey "$cle_privee" -out "$fichier_restauration"
  docker compose exec -T postgres pg_restore --exit-on-error --no-owner --no-acl \
    -U afrixora -d afrixora_prod < "$fichier_restauration"
)
```

Les anciennes sauvegardes `*.sql.gz` suivent la procédure de l’ancien déploiement et peuvent contenir des données en clair. Les protéger pendant la transition, vérifier les nouvelles restaurations, puis traiter leur conservation séparément. Après restauration, reprovisionner les rôles par le déploiement.

### 7.4 Arrêt propre
```bash
docker compose down
```

---

## 8. Vérifications post-déploiement

- [ ] `curl https://api.afrixora.cd/health` → `{"status":"ok"}`
- [ ] `docker compose exec -T api wget -qO- http://127.0.0.1:4000/ready` → `{"status":"ready"}`
- [ ] `curl -fsS https://afrixora.cd/login` → page de connexion
- [ ] Connexion avec `admin@afrixora.cd` (mot de passe : voir .env / seed)
- [ ] ⚠️ Le compte de démo ne doit jamais exister en production — utiliser un compte administrateur réel avec un mot de passe unique
- [ ] Dashboard affiche les bâtiments et devices
- [ ] Grafana affiche les quatre panneaux du tableau de bord. Sa source ne peut lire que les vues de supervision
- [ ] Redis répond avec le compte interne. Le volume AOF et les compteurs survivent à un redémarrage
- [ ] Une sauvegarde locale chiffrée peut être restaurée sur une instance de test et est exportée hors hôte
- [ ] Le tunnel et le cloisonnement MQTT réussissent les contrôles de la section 9

### Vérifier l’idempotence et la persistance sur un projet isolé

Exécuter depuis la racine du dépôt dans Bash. Le test démarre uniquement PostgreSQL et utilise les valeurs de `.env.example`. Choisir un sous-réseau de tunnel libre si un projet Compose est déjà présent.

```bash
set -e
projet="afrixora-p11-persistance-$(date +%s)"
compose_test() {
  TUNNEL_INGRESS_SUBNET=10.253.247.8/29 docker compose --env-file .env.example -p "$projet" "$@"
}
psql_test() {
  compose_test exec -T postgres psql -X -U afrixora -d afrixora_prod \
    -v ON_ERROR_STOP=1 "$@"
}

compose_test up --wait --wait-timeout 180 postgres
psql_test --single-transaction -f - < infrastructure/scripts/01_schema.sql
psql_test --single-transaction -f - < infrastructure/scripts/01_schema.sql
psql_test -c "INSERT INTO sensor_readings (time, tenant_id, device_id, metric, value, unit)
  VALUES (now(), '00000000-0000-4000-8000-000000000001',
          '00000000-0000-4000-8000-000000000002', 'power_w', 42, 'W');"
compose_test down
compose_test up --wait --wait-timeout 180 postgres
test "$(psql_test -Atc "SELECT count(*) FROM sensor_readings
  WHERE metric = 'power_w' AND tenant_id = '00000000-0000-4000-8000-000000000001';")" = 1
compose_test down
```

Les deux applications du schéma doivent réussir. Après recréation du conteneur, le relevé de test doit être présent dans le volume nommé.

## 9. Préparer les comptes MQTT

Le broker applique l’ACL sur TCP et WebSocket. Avant de remplacer une installation existante, inventorier les clients qui partagent le compte API, les bâtiments desservis et les appareils attribués à chaque passerelle. Sauvegarder la configuration et le fichier d’identifiants existants dans un emplacement privé. Préparer l’ensemble des nouveaux comptes avant la fenêtre de maintenance.

Depuis la racine du dépôt, créer le compte du worker. Renseigner `MQTT_API_USER` avec le nom du compte de service, choisir un mot de passe distinct de ceux des passerelles et reporter le même mot de passe dans `MQTT_API_PASSWORD`. `mosquitto_passwd` demande le mot de passe au terminal.

```bash
stage=$(mktemp -d)
umask 077
sed "s/^user afrixora_api$/user $MQTT_API_USER/" infrastructure/docker/mosquitto.acl > "$stage/acl"
mosquitto_passwd -c "$stage/passwd" "$MQTT_API_USER"
infrastructure/scripts/create-mqtt-gateway-user.sh "$stage" "$tenant_id" "$building_id" "$gateway_id" "$device_id"
bash infrastructure/scripts/validate-mqtt-auth.sh "$stage" "$MQTT_API_USER"
```

Répéter la création pour chaque passerelle en passant tous ses identifiants d’appareil après son identifiant. Le compte `gateway-<gatewayId>` publie le statut de cette passerelle et les relevés ou événements de ses appareils, et reçoit leurs commandes. Le worker reçoit la télémétrie et publie les commandes. [Documentation Mosquitto](https://mosquitto.org/man/mosquitto-conf-5.html)

Valider les accès sur un broker isolé avec des comptes fictifs, sur TCP et WebSocket. Confirmer les publications et les abonnements autorisés, le refus des accès inter-clients et le refus des connexions anonymes. Vérifier la répartition des appareils par passerelle dans l’inventaire.

Installer ensuite les fichiers dans le chemin de déploiement. Les commandes ci-dessous utilisent le groupe `1883` du broker officiel, à adapter si Docker utilise un remappage d’identités. Le dossier doit rester lisible par le groupe du broker et par l’opérateur de déploiement.

```bash
auth_path=${MQTT_AUTH_PATH:-./infrastructure/docker/mqtt-auth}
sudo install -d -m 750 -o "$(id -u)" -g 1883 "$auth_path"
sudo install -m 640 -o "$(id -u)" -g 1883 "$stage/passwd" "$stage/acl" "$auth_path/"
```

Distribuer les identifiants individuels par un canal sécurisé. À la bascule, déployer les fichiers avec l’API et le broker, puis confirmer la reconnexion de chaque passerelle et le bon fonctionnement des commandes. Lors d’une rotation ultérieure, recréer le broker pour que toutes les connexions utilisent le nouveau fichier. En cas de retour arrière, restaurer l’ensemble cohérent de la précédente configuration, des comptes et des clients. Si l’ancienne version partageait un mot de passe, limiter sa durée d’utilisation au rétablissement du service.

## 10. Migrer et renouveler les clés API

Prévoir une fenêtre de maintenance et sauvegarder PostgreSQL avant la migration. Les sauvegardes et journaux PostgreSQL antérieurs peuvent contenir des clés en clair. Protéger leur accès et appliquer les règles de conservation prévues.

Si Redis est déjà en service avec la seule persistance RDB, activer l’AOF sur l’ancienne instance avant de la recréer. Avec un accès d’administration Redis, lancer `CONFIG SET appendonly yes`, puis attendre que `INFO persistence` indique `aof_enabled=1`, `aof_rewrite_in_progress=0`, `aof_rewrite_scheduled=0` et `aof_last_bgrewrite_status=ok`. Le compte Redis utilisé par l’API après la migration est dédié aux sessions, aux quotas, aux files MQTT et à Socket.IO.

Depuis la racine du dépôt, lancer le déploiement de la section 4. Le script arrête l’API avant les migrations et conserve PostgreSQL en service.

```bash
./infrastructure/scripts/deploy.sh
```

Le script applique les migrations Prisma en attente. La migration des clés hache chaque secret existant en SHA-256 et supprime la colonne en clair dans la même transaction. Elle conserve les identifiants, statuts et compteurs. Le préfixe affiché correspond aux huit premiers caractères de la partie aléatoire pour les formats `afrx_live_` et `nxa_live_`. Les clients qui détiennent déjà le secret peuvent continuer à l’utiliser, sauf pour la portée `gateway`, réservée à de futures routes HTTP dédiées. Les passerelles continuent à utiliser leurs identifiants MQTT.

Renouveler manuellement les anciennes clés, en priorité celles qui ont été exposées ou copiées dans des exports. Pour chaque intégration, créer une clé de portée adaptée, copier son secret depuis la réponse de création ou la fenêtre du tableau de bord, le placer dans le gestionnaire de secrets du client, vérifier un appel, puis révoquer l’ancienne clé. Révoquer immédiatement les clés compromises. Une clé perdue doit être remplacée.

Le quota est cumulatif sur la durée de vie de la clé. Redis applique la limite partagée entre les instances de l’API et PostgreSQL reçoit les compteurs toutes les 30 secondes. Redis doit conserver son volume et son journal AOF. Après une perte de ces données, le comptage reprend au dernier total synchronisé dans PostgreSQL. Une indisponibilité de Redis bloque les appels par clé API avec HTTP 503.

## 11. Reprendre une démonstration locale existante

Ajouter `REDIS_PASSWORD` et mettre à jour `REDIS_URL` dans `.env.demo` selon le modèle, puis appliquer le mode `0600`. Le script de démo lie les services à `127.0.0.1` et refuse de reprendre les anciens conteneurs sans la configuration locale. Si d’anciens conteneurs `afrixora-postgres`, `afrixora-redis` ou `afrixora-mosquitto` sont présents, sauvegarder les données à conserver, puis les arrêter et les renommer avant de relancer `start-demo.sh`. Les nouveaux conteneurs peuvent recevoir les données utiles à la démo par restauration. Le script ne supprime pas les anciens conteneurs et ne ferme que les processus frontend/backend qu’il a lancés. Le broker de démo utilise des comptes et des fichiers locaux dédiés.

La surcharge `docker-compose.dev.yml` ajoute des ports limités à la boucle locale au Compose principal. Elle réutilise le provisionnement des rôles, les comptes MQTT et les sauvegardes du projet auquel elle est appliquée.
