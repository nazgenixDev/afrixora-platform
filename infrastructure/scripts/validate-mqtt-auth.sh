#!/bin/bash
set -euo pipefail

directory=${1:?Indiquez le répertoire des comptes MQTT.}
worker=${2:?Indiquez le nom du compte worker MQTT.}

if [[ ! "$worker" =~ ^[a-zA-Z0-9_-]+$ || "$worker" == gateway-* ]]; then
  echo "Le compte worker MQTT doit être distinct des comptes de passerelle." >&2
  exit 1
fi

for file in "$directory/passwd" "$directory/acl"; do
  if [[ ! -f "$file" || ! -s "$file" || -L "$file" ]]; then
    echo "Fichier MQTT absent, vide ou non régulier : $file" >&2
    exit 1
  fi
  mode=$(stat -c %a -- "$file")
  if (( (8#$mode & 0007) != 0 )); then
    echo "Retirez l’accès aux autres utilisateurs sur le fichier MQTT : $file" >&2
    exit 1
  fi
done

# Vérifie la parité des fichiers, la portée des règles et l’absence de hachages en clair.
awk -v worker="$worker" '
  function invalid(message) {
    print FILENAME ":" FNR " : " message > "/dev/stderr"
    failed = 1
  }

  BEGIN {
    required["read afrixora/+/+/devices/+/readings"] = 1
    required["read afrixora/+/+/devices/+/events"] = 1
    required["read afrixora/+/+/gateways/+/status"] = 1
    required["write afrixora/+/+/devices/+/commands"] = 1
    replay_rule = "write afrixora/+/+/devices/+/telemetry-ack"
  }

  FNR == NR {
    if (split($0, fields, ":") != 2 || fields[1] !~ /^[a-zA-Z0-9_-]+$/ ||
        fields[2] !~ /^\$[67]\$/ || length(fields[2]) < 60 || ++accounts[fields[1]] != 1) {
      invalid("entrée de compte invalide ou dupliquée")
    }
    next
  }

  /^[[:space:]]*(#|$)/ { next }

  $1 == "user" && NF == 2 {
    user = $2
    if (!(user in accounts) || ++blocks[user] != 1 || (user != worker && user !~ /^gateway-[a-zA-Z0-9_-]+$/)) {
      invalid("bloc de compte inconnu, non autorisé ou dupliqué")
    }
    next
  }

  $1 == "topic" && NF == 3 && user != "" {
    rule = $2 " " $3
    if (user == worker) {
      if ((!(rule in required) && rule != replay_rule) || ++worker_rules[rule] != 1) invalid("règle worker invalide ou dupliquée")
      next
    }
    if (split($3, topic, "/") != 6 || topic[1] != "afrixora" ||
        topic[2] !~ /^[a-zA-Z0-9_-]+$/ || topic[3] !~ /^[a-zA-Z0-9_-]+$/ ||
        topic[5] !~ /^[a-zA-Z0-9_-]+$/ || ++gateway_rules[user,rule] != 1) {
      invalid("topic de passerelle invalide ou dupliqué")
      next
    }
    scope = topic[2] "/" topic[3]
    if (user in scopes && scopes[user] != scope) invalid("périmètre de passerelle incohérent")
    scopes[user] = scope
    if (topic[4] == "gateways" && topic[6] == "status" && user == "gateway-" topic[5] && $2 == "write") {
      statuses[user] = 1
    } else if (topic[4] == "devices" && topic[6] == "telemetry-ack" && $2 == "read") {
      replay_devices[user, $3] = "write afrixora/" scope "/devices/" topic[5] "/readings"
    } else if (!(topic[4] == "devices" && (($2 == "write" && topic[6] ~ /^(readings|events)$/) ||
                                          ($2 == "read" && topic[6] == "commands")))) {
      invalid("direction ou type de topic interdit pour la passerelle")
    }
    next
  }

  { invalid("directive ACL inconnue") }

  END {
    for (rule in required) if (!(rule in worker_rules)) invalid("règle worker manquante")
    for (key in replay_devices) {
      split(key, parts, SUBSEP)
      if (!(replay_rule in worker_rules) || !((parts[1], replay_devices[key]) in gateway_rules))
        invalid("accusé de télémétrie sans autorisation de publication correspondante")
    }
    for (name in accounts) {
      if (!(name in blocks) || (name != worker && !(name in statuses))) invalid("compte incomplet")
    }
    exit failed
  }
' "$directory/passwd" "$directory/acl"
