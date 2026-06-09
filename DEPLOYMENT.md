# AFRIXORA — Guide de Déploiement (ORICO CF1000 / VPS)

> Cible : serveur local ORICO CF1000 (Intel i5-1240P, 32GB DDR5, 2×NVMe RAID 1 ZFS)
> Exposition HTTPS : Cloudflare Tunnel (cloudflared)

---

## 1. Prérequis

| Composant | Version min | Installation |
|-----------|-------------|--------------|
| Docker | 24.x | `curl -fsSL https://get.docker.com \| sh` |
| Docker Compose | 2.x | Inclus avec Docker |
| Git | 2.x | `apt install git` |
| cloudflared | latest | `wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb && dpkg -i cloudflared-linux-amd64.deb` |
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
cp .env.example .env
# Générer des secrets forts (ne pas utiliser les valeurs par défaut)
openssl rand -base64 48  # JWT_SECRET
openssl rand -base64 48  # JWT_REFRESH_SECRET
openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 32  # DB_PASSWORD
openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24  # REDIS_PASSWORD
openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 32  # MQTT_API_PASSWORD
```

### 2.3 Configurer les variables d'environnement
Éditer `.env` :
```env
NODE_ENV=production
DOMAIN=afrixora.cd
CORS_ORIGINS=https://afrixora.cd
NEXT_PUBLIC_API_URL=https://api.afrixora.cd
CLOUDFLARE_TUNNEL_TOKEN=<votre-token-cloudflare>
```

### 2.4 Configurer Cloudflare Tunnel
```bash
cloudflared tunnel login
cloudflared tunnel create afrixora
# Associer les domaines dans le dashboard Cloudflare :
#   afrixora.cd → traefik:80
#   api.afrixora.cd → traefik:80
#   grafana.afrixora.cd → traefik:80
```

---

## 3. Construction

```bash
# Construire toutes les images
docker compose build

# Vérifier les images
docker images | grep afrixora
```

---

## 4. Lancement

```bash
# Démarrer tous les services en arrière-plan
docker compose up -d

# Vérifier l'état des conteneurs
docker compose ps

# Vérifier les logs
docker compose logs -f api
docker compose logs -f frontend
```

---

## 5. Migrations et Seed

```bash
# Exécuter les migrations Prisma
docker compose exec api npx prisma migrate deploy

# Créer les données initiales (tenant, admin, building, devices)
docker compose exec api npx prisma db seed

# Vérifier l'API
curl https://api.afrixora.cd/health
```

---

## 6. Monitoring

- **Grafana** : `https://grafana.afrixora.cd` (admin / mot de passe dans `.env`)
- **Logs** : `docker compose logs -f`
- **Backups PostgreSQL** : Automatiques à 2h via le conteneur `postgres-backup` (30 jours de rétention)

---

## 7. Maintenance

### 7.1 Mise à jour
```bash
git pull origin main
docker compose build
docker compose up -d
docker compose exec api npx prisma migrate deploy
```

### 7.2 Backup manuel
```bash
docker compose exec postgres-backup /usr/local/bin/backup.sh
```

### 7.3 Restauration
```bash
gunzip -c backups/postgres/afrixora_YYYYMMDD_HHMMSS.sql.gz | docker compose exec -T postgres psql -U afrixora -d afrixora_prod
```

### 7.4 Arrêt propre
```bash
docker compose down
```

---

## 8. Vérifications post-déploiement

- [ ] `curl https://api.afrixora.cd/health` → `{"status":"ok"}`
- [ ] `curl https://afrixora.cd` → page de login
- [ ] Connexion avec `admin@afrixora.cd` / `Admin123!`
- [ ] Dashboard affiche les bâtiments et devices
- [ ] Grafana accessible
- [ ] Backup automatique configuré