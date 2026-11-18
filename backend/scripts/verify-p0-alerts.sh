#!/usr/bin/env bash
set -euo pipefail

# Ce contrôle marque comme lue une alerte CRITICAL du tenant de test.
: "${BASE_URL:?Indiquer l’URL de base de l’API de test (sans /api/v1).}"
: "${TOKEN:?Fournir le JWT du tenant de test.}"
: "${BUILDING_ID:?Indiquer un bâtiment du tenant de test.}"

alerts_url="${BASE_URL%/}/api/v1/alerts"
auth_header="Authorization: Bearer $TOKEN"

list_alerts() {
  curl --silent --show-error --fail-with-body --header "$auth_header" --get "$alerts_url" "$@"
}

unread=$(list_alerts --data-urlencode 'isRead=false')
jq -e '
  .page == 1 and (.data | length) > 0 and (.data | length) <= 50 and
  .total >= (.data | length) and .totalPages == ((.total / 50) | ceil) and
  all(.data[]; .isRead == false)
' <<< "$unread" > /dev/null
printf '%s\n' 'OK — filtre des alertes non lues et pagination par défaut.'

critical=$(list_alerts --data-urlencode 'severity=CRITICAL' --data-urlencode "buildingId=$BUILDING_ID")
jq -e --arg building "$BUILDING_ID" '
  (.data | length) > 0 and
  all(.data[]; .severity == "CRITICAL" and .buildingId == $building)
' <<< "$critical" > /dev/null
printf '%s\n' 'OK — filtres combinés de sévérité et de bâtiment.'

fixture=$(list_alerts --data-urlencode 'severity=CRITICAL' --data-urlencode "buildingId=$BUILDING_ID" \
  --data-urlencode 'isRead=false' --data-urlencode 'limit=1')
alert_id=$(jq -er --arg building "$BUILDING_ID" '
  .data[] | select(.isRead == false and .severity == "CRITICAL" and .buildingId == $building) | .id
' <<< "$fixture")

updated=$(curl --silent --show-error --fail-with-body --header "$auth_header" \
  --request PATCH "$alerts_url/$alert_id/read")
jq -e --arg id "$alert_id" '.id == $id and .isRead == true' <<< "$updated" > /dev/null
printf '%s\n' 'OK — marquage comme lue d’une alerte retournée pour le tenant de test.'
