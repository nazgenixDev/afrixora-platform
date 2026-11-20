#!/bin/sh
set -eu
umask 077

: "${REDIS_PASSWORD:?Renseignez REDIS_PASSWORD}"
password_hash=$(printf '%s' "$REDIS_PASSWORD" | sha256sum)
password_hash=${password_hash%% *}

# Les scopes couvrent les sessions, le quota API, MQTT et l’adaptateur Socket.IO.
# Redis vérifie littéralement le motif PSUBSCRIBE de l’espace de noms Socket.IO.
cat > /run/redis-auth/users.acl <<EOF
user default off
user afrixora_api on #${password_hash} ~afrixora:* ~api-key:usage:* ~mqtt_buffer:* ~mqtt:buffer-retry-lock &socket.io* &socket.io#/#* +ping +info +client|setinfo +client|setname +auth +hello +select +publish +subscribe +psubscribe +unsubscribe +punsubscribe +pubsub +eval +get +set +del +expire +hget +hset +hmget +sadd +srem +sscan +scan +lpush +lrange +ltrim +lpos +lrem +time
EOF

chown redis:redis /run/redis-auth/users.acl
unset REDIS_PASSWORD REDISCLI_AUTH
exec docker-entrypoint.sh redis-server --aclfile /run/redis-auth/users.acl --appendonly yes
