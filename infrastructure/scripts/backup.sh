#!/bin/bash
set -euo pipefail
umask 077

backup_dir=${BACKUP_DIR:-/backups/postgres}
certificate=${BACKUP_CERT_FILE:-/run/backup-cert.pem}
stamp=$backup_dir/.last-success

if [[ ${1:-} == --check ]]; then
  [[ -f "$stamp" ]] && (( $(date +%s) - $(stat -c %Y "$stamp") < 26 * 60 * 60 ))
  exit $?
fi

mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
openssl x509 -in "$certificate" -noout -checkend 0 >/dev/null
temporary_file=$(mktemp "$backup_dir/.afrixora_$(date -u +%Y%m%d_%H%M%S)_XXXXXX")
trap 'rm -f -- "$temporary_file"' EXIT
trap 'printf "%s\n" "Échec de la sauvegarde PostgreSQL." >&2' ERR

# Le flux en clair reste dans le tube. Un échec n’expose pas de fichier partiel.
pg_dump --format=custom --no-owner --no-privileges \
  | openssl cms -encrypt -binary -aes-256-gcm -stream -outform DER \
      -out "$temporary_file" "$certificate"
backup_file="$backup_dir/${temporary_file##*/.}.dump.cms"
mv -- "$temporary_file" "$backup_file"
touch "$stamp"

find "$backup_dir" -maxdepth 1 -type f -name 'afrixora_*.dump.cms' -mtime +30 -delete
printf 'Sauvegarde PostgreSQL terminée : %s\n' "$backup_file"
