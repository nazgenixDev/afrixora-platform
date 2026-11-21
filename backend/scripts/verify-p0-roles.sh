#!/usr/bin/env bash
set -euo pipefail

# Exécuter sur une API de test, avec deux comptes administrateurs du même tenant.
: "${BASE_URL:?URL de l’API de test, avec /api/v1}"
: "${SUPER_ADMIN_TOKEN:?JWT du SUPER_ADMIN de test}"
: "${TENANT_ADMIN_TOKEN:?JWT du TENANT_ADMIN de test}"

api="${BASE_URL%/}"
fixture_ids=()
suffix=$(openssl rand -hex 12)
password=$(openssl rand -hex 24)
reset_password=$(openssl rand -hex 24)
body=
status=

request() {
  local method="$1" path="$2" token="$3" response
  local -a args=(--silent --show-error --max-time 20 --request "$method"
    --write-out $'\n%{http_code}')
  if [[ -n "$token" ]]; then args+=(--header "Authorization: Bearer $token"); fi
  if [[ $# -eq 4 ]]; then args+=(--header 'Content-Type: application/json' --data "$4"); fi
  response=$(curl "${args[@]}" "$api/$path") || return 1
  status="${response##*$'\n'}"
  body="${response%$'\n'*}"
}

expect_status() {
  local expected="$1" label="$2"
  if [[ "$status" != "$expected" ]]; then
    printf 'Échec — %s (HTTP %s, attendu %s)\n' "$label" "$status" "$expected" >&2
    exit 1
  fi
  if [[ "$expected" == 403 ]]; then
    jq -e '.code == "FORBIDDEN" and (.error | strings | length > 0)' <<<"$body" >/dev/null
  fi
  printf 'OK — %s (HTTP %s)\n' "$label" "$status"
}

cleanup() {
  local result="$?" id
  for id in "${fixture_ids[@]}"; do
    if ! request DELETE "users/$id" "$SUPER_ADMIN_TOKEN" || [[ "$status" != 200 && "$status" != 404 ]]; then
      printf 'Échec du nettoyage du compte de test %s.\n' "$id" >&2
      result=1
    fi
  done
  exit "$result"
}
trap cleanup EXIT

user_payload() {
  jq -nc --arg email "$1" --arg role "$2" --arg password "$password" \
    '{email: $email, role: $role, password: $password, name: "Vérification P0-2"}'
}

remember_created_user() {
  if [[ "$status" == 201 ]]; then
    created_id=$(jq -er '.id | strings | select(length > 0)' <<<"$body")
    fixture_ids+=("$created_id")
  fi
}

request GET users/me "$SUPER_ADMIN_TOKEN"
expect_status 200 'Session du SUPER_ADMIN'
tenant_id=$(jq -er 'select(.role == "SUPER_ADMIN") | .tenantId | strings | select(length > 0)' <<<"$body")

request GET users/me "$TENANT_ADMIN_TOKEN"
expect_status 200 'Session du TENANT_ADMIN'
jq -e --arg tenant "$tenant_id" '.role == "TENANT_ADMIN" and .tenantId == $tenant' <<<"$body" >/dev/null

request POST users "$TENANT_ADMIN_TOKEN" "$(user_payload "p0-refus-$suffix@example.invalid" SUPER_ADMIN)"
remember_created_user
expect_status 403 'Création d’un SUPER_ADMIN par le TENANT_ADMIN'

request POST users "$SUPER_ADMIN_TOKEN" "$(user_payload "p0-super-$suffix@example.invalid" SUPER_ADMIN)"
remember_created_user
expect_status 201 'Création du SUPER_ADMIN temporaire'
super_id="$created_id"

member_email="p0-membre-$suffix@example.invalid"
request POST users "$TENANT_ADMIN_TOKEN" "$(user_payload "$member_email" VIEWER)"
remember_created_user
expect_status 201 'Création du VIEWER temporaire'
member_id="$created_id"
login_payload=$(jq -nc --arg email "$member_email" --arg password "$password" '{email: $email, password: $password}')

request PATCH "users/$member_id/role" "$TENANT_ADMIN_TOKEN" '{"role":"SUPER_ADMIN"}'
expect_status 403 'Promotion d’un VIEWER en SUPER_ADMIN'
request PATCH "users/$member_id/role" "$TENANT_ADMIN_TOKEN" '{"role":"INCONNU"}'
expect_status 400 'Rôle invalide rejeté par Zod'

request PATCH "users/$super_id/role" "$TENANT_ADMIN_TOKEN" '{"role":"VIEWER"}'
expect_status 403 'Modification du rôle d’un SUPER_ADMIN'
request PATCH "users/$super_id/toggle" "$TENANT_ADMIN_TOKEN"
expect_status 403 'Désactivation d’un SUPER_ADMIN'
request PATCH "users/$super_id/reset-password" "$TENANT_ADMIN_TOKEN" \
  "$(jq -nc --arg password "$reset_password" '{newPassword: $password}')"
expect_status 403 'Réinitialisation du mot de passe d’un SUPER_ADMIN'
request DELETE "users/$super_id" "$TENANT_ADMIN_TOKEN"
expect_status 403 'Suppression d’un SUPER_ADMIN'

request POST auth/login '' "$login_payload"
expect_status 200 'Connexion du VIEWER'
old_token=$(jq -er '.accessToken | strings | select(length > 0)' <<<"$body")
request GET users/me "$old_token"
expect_status 200 'JWT valide avant le changement de rôle'

request PATCH "users/$member_id/role" "$TENANT_ADMIN_TOKEN" '{"role":"OPERATOR"}'
expect_status 200 'Changement autorisé de VIEWER en OPERATOR'
jq -e '.role == "OPERATOR"' <<<"$body" >/dev/null
request GET users/me "$old_token"
expect_status 401 'Ancien JWT refusé après le changement de rôle'

request POST auth/login '' "$login_payload"
expect_status 200 'Reconnexion de l’OPERATOR'
operator_token=$(jq -er '.accessToken | strings | select(length > 0)' <<<"$body")
request GET users/me "$operator_token"
expect_status 200 'Nouveau JWT valide avant la désactivation'
jq -e '.role == "OPERATOR"' <<<"$body" >/dev/null

request PATCH "users/$member_id/toggle" "$TENANT_ADMIN_TOKEN"
expect_status 200 'Désactivation du compte de test'
jq -e '.isActive == false' <<<"$body" >/dev/null
request PATCH "users/$member_id/toggle" "$TENANT_ADMIN_TOKEN"
expect_status 200 'Réactivation du compte de test'
jq -e '.isActive == true' <<<"$body" >/dev/null
request GET users/me "$operator_token"
expect_status 401 'JWT d’avant la désactivation toujours refusé après réactivation'

request PATCH "users/$member_id/role" "$TENANT_ADMIN_TOKEN" '{"role":"TENANT_ADMIN"}'
expect_status 200 'Attribution de TENANT_ADMIN dans le même tenant'
jq -e '.role == "TENANT_ADMIN"' <<<"$body" >/dev/null
request POST auth/login '' "$login_payload"
expect_status 200 'Connexion du TENANT_ADMIN temporaire'
member_admin_token=$(jq -er '.accessToken | strings | select(length > 0)' <<<"$body")
request PATCH "users/$member_id/role" "$member_admin_token" '{"role":"VIEWER"}'
expect_status 403 'Modification de son propre rôle'
