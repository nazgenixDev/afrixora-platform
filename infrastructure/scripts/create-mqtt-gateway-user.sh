#!/usr/bin/env bash
set -euo pipefail

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

if (( $# < 4 )); then
  fail "Usage : $0 <répertoire-de-préparation> <tenantId> <buildingId> <gatewayId> [deviceId ...]"
fi

stage=$1
tenant_id=$2
building_id=$3
gateway_id=$4
shift 4

for id in "$tenant_id" "$building_id" "$gateway_id" "$@"; do
  [[ $id =~ ^[a-zA-Z0-9_-]+$ ]] || fail "Identifiant MQTT invalide : $id"
done

password_file=$stage/passwd
acl_file=$stage/acl
broker_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../docker" && pwd)
[[ -f $password_file && ! -L $password_file && -f $acl_file && ! -L $acl_file ]] ||
  fail "Le répertoire de préparation doit contenir deux fichiers ordinaires : passwd et acl."
if [[ $password_file -ef $broker_dir/mosquitto_passwd || $acl_file -ef $broker_dir/mosquitto.acl ]]; then
  fail "Utilisez des copies de préparation pour passwd et acl."
fi
command -v mosquitto_passwd >/dev/null || fail "Installez l’utilitaire mosquitto_passwd."

username=gateway-$gateway_id
if awk -v user="$username" '$1 == "user" && $2 == user { found = 1 } END { exit !found }' "$acl_file" ||
   awk -F: -v user="$username" '$1 == user { found = 1 } END { exit !found }' "$password_file"; then
  fail "Le compte $username existe déjà dans les fichiers de préparation."
fi

umask 077
tmp=$(mktemp -d -- "$stage/.mqtt-gateway.XXXXXX")
trap 'rm -f -- "$tmp/passwd" "$tmp/acl"; rmdir -- "$tmp"' EXIT
cp -- "$password_file" "$tmp/passwd"
cp -- "$acl_file" "$tmp/acl"
mosquitto_passwd "$tmp/passwd" "$username"

prefix="afrixora/$tenant_id/$building_id"
{
  printf '\nuser %s\n' "$username"
  printf 'topic write %s/gateways/%s/status\n' "$prefix" "$gateway_id"
  for device_id in "$@"; do
    printf 'topic write %s/devices/%s/readings\n' "$prefix" "$device_id"
    printf 'topic write %s/devices/%s/events\n' "$prefix" "$device_id"
    printf 'topic read %s/devices/%s/commands\n' "$prefix" "$device_id"
  done
} >> "$tmp/acl"

mv -- "$tmp/passwd" "$password_file"
mv -- "$tmp/acl" "$acl_file"
printf 'Compte %s préparé dans %s.\n' "$username" "$stage"
