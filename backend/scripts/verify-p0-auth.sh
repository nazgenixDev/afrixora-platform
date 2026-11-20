#!/usr/bin/env bash
set -euo pipefail

# Exécuter depuis l’extérieur, via le proxy réel, avec un compte admin de test.
# Partir de quotas vierges sur une instance en mode production. Le test utilise les deux quotas.
: "${BASE_URL:?Indiquer l’origine publique de l’API (sans /api/v1)}"
: "${AUTH_EMAIL:?Indiquer l’adresse du compte admin de test}"
: "${AUTH_PASSWORD:?Indiquer le mot de passe du compte admin de test}"
api="${BASE_URL%/}/api/v1"
# Indiquer l’origine du frontend lorsqu’elle diffère de celle de l’API.
app_origin="${APP_ORIGIN:-${BASE_URL%/}}"

tmp="$(mktemp -d)"
body="$tmp/body"
cookies="$tmp/cookies"
trap 'rm -f -- "$body" "$cookies"; rmdir -- "$tmp"' EXIT

export AUTH_EMAIL AUTH_PASSWORD
valid_login="$(jq -cn '{email: env.AUTH_EMAIL, password: env.AUTH_PASSWORD}')"
wrong_password="verify-p0-auth-invalid-$RANDOM-$RANDOM"
if [[ "$wrong_password" == "$AUTH_PASSWORD" ]]; then
  wrong_password="$wrong_password-invalid"
fi
invalid_login="$(jq -cn --arg password "$wrong_password" '{email: env.AUTH_EMAIL, password: $password}')"
unset AUTH_PASSWORD

fail() {
  printf 'Échec — %s\n' "$*" >&2
  exit 1
}

expect_status() {
  local expected="$1" description="$2" status
  shift 2
  status="$(curl --silent --show-error --max-time 15 --header "Origin: $app_origin" --output "$body" --write-out '%{http_code}' "$@")" ||
    fail "$description — requête curl impossible"
  [[ "$status" == "$expected" ]] || fail "$description — HTTP $status, attendu $expected"
}

expect_invalid_credentials() {
  jq -e '. == {error: "Identifiants invalides", code: "INVALID_CREDENTIALS"}' "$body" >/dev/null ||
    fail "corps d’erreur d’authentification inattendu"
}

expect_status 401 "mauvais mot de passe" -H 'Content-Type: application/json' \
  --data-binary @- "$api/auth/login" <<< "$invalid_login"
expect_invalid_credentials
expect_status 200 "connexion du compte admin de test" -H 'Content-Type: application/json' \
  --cookie-jar "$cookies" --data-binary @- "$api/auth/login" <<< "$valid_login"
unset valid_login
user_id="$(jq -er '.user.id' "$body")"
jq -e 'has("accessToken") | not' "$body" >/dev/null ||
  fail "la réponse navigateur divulgue le jeton d’accès"

latest_me_log() {
  expect_status 200 "consultation des ApiLog" --cookie "$cookies" --get \
    --data-urlencode 'endpoint=/api/v1/auth/me' --data-urlencode 'method=GET' "$api/api-logs"
  jq -c --arg user_id "$user_id" \
    'first(.data[] | select(.endpoint == "/api/v1/auth/me" and .userId == $user_id and .statusCode == 200)) // {}' \
    "$body"
}

wait_for_me_log() {
  local previous_id="$1" entry
  for ((attempt = 0; attempt < 15; attempt++)); do
    entry="$(latest_me_log)" || return 1
    if jq -e --arg previous_id "$previous_id" '.id != null and .id != $previous_id' <<< "$entry" >/dev/null; then
      printf '%s\n' "$entry"
      return
    fi
    sleep 1
  done
  fail "nouvelle entrée ApiLog introuvable"
}

previous_log="$(latest_me_log)"
expect_status 200 "lecture du profil de référence" --cookie "$cookies" "$api/auth/me"
baseline="$(wait_for_me_log "$(jq -r '.id // ""' <<< "$previous_log")")"
baseline_ip="$(jq -er '.ip | select(. != "" and . != "unknown")' <<< "$baseline")"
if [[ -n "${EXPECTED_CLIENT_IP:-}" && "$baseline_ip" != "$EXPECTED_CLIENT_IP" ]]; then
  fail "ApiLog contient $baseline_ip, IP cliente attendue $EXPECTED_CLIENT_IP"
fi

expect_status 200 "lecture du profil avec X-Forwarded-For forgé" --cookie "$cookies" \
  -H 'X-Forwarded-For: 198.51.100.10, 203.0.113.20' "$api/auth/me"
forged="$(wait_for_me_log "$(jq -r '.id' <<< "$baseline")")"
forged_ip="$(jq -er '.ip' <<< "$forged")"
[[ "$forged_ip" == "$baseline_ip" ]] || fail "X-Forwarded-For change l’IP d’ApiLog : $baseline_ip → $forged_ip"
printf 'OK — erreur 401 générique et IP ApiLog identique (%s)\n' "$baseline_ip"

for ((attempt = 3; attempt <= 11; attempt++)); do
  expected=401
  if ((attempt == 11)); then expected=429; fi
  expect_status "$expected" "connexion $attempt avec X-Forwarded-For forgé" \
    -H "X-Forwarded-For: 198.51.100.$attempt" -H 'Content-Type: application/json' \
    --data-binary @- "$api/auth/login" <<< "$invalid_login"
done
printf 'OK — la 11e connexion renvoie 429 malgré les variations de X-Forwarded-For\n'

expect_status 401 "rafraîchissement sans cookie" --request POST "$api/auth/refresh"
expect_invalid_credentials
for ((attempt = 2; attempt <= 31; attempt++)); do
  expected=200
  if ((attempt == 31)); then expected=429; fi
  expect_status "$expected" "rafraîchissement $attempt" --cookie "$cookies" --cookie-jar "$cookies" +    --request POST "$api/auth/refresh"
done
printf 'OK — quota de rafraîchissement indépendant, 429 à la 31e requête\n'
