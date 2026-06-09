#!/bin/bash
set -e

BACKUP_DIR="/backups/postgres"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/afrixora_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

PGPASSWORD="${DB_PASSWORD}" pg_dump \
  -h postgres \
  -U "${POSTGRES_USER:-afrixora}" \
  -d "${POSTGRES_DB:-afrixora_prod}" \
  -Z 9 \
  -f "$BACKUP_FILE"

# keep only last 30 days
find "$BACKUP_DIR" -name "afrixora_*.sql.gz" -mtime +30 -delete

echo "[$(date)] Backup completed: $BACKUP_FILE" >> /var/log/backup.log
