#!/usr/bin/env bash
set -euo pipefail

# Exerce la validation et le service avec des identifiants fictifs, sans accès réseau.
cd "$(dirname "$0")/.."
node -r ts-node/register/transpile-only <<'NODE'
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { DeviceType } = require('@prisma/client');
const tenantId = randomUUID();
const autreTenant = randomUUID();
const batimentEtranger = randomUUID();
const appareil = randomUUID();
const publications = [];

function substituer(module, exports) {
  const id = require.resolve(module);
  require.cache[id] = { id, loaded: true, exports };
}

const prisma = {
  device: {
    async findMany({ where, take, skip }) {
      assert.equal(where.tenantId, tenantId);
      assert.equal(take, 50);
      assert.equal(skip, 0);
      return [];
    },
    async count({ where }) {
      assert.equal(where.tenantId, tenantId);
      return 0;
    },
    async findFirst({ where }) {
      assert.equal(where.tenantId, tenantId);
      return null;
    },
  },
  building: {
    async findFirst({ where }) {
      assert.deepEqual(where, { id: batimentEtranger, tenantId, isActive: true });
      return null;
    },
  },
};

substituer('./src/utils/database', { prisma });
substituer('./src/utils/logger', { warn() {} });
substituer('./src/services/mqttWorker', { async publishMqtt(topic, command) { publications.push({ topic, command }); } });
const router = require('./src/routes/devices').default;
const service = require('./src/services/deviceService').default;
const { errorHandler } = require('./src/middleware/errorHandler');
function valider(method, path, request) {
  const route = router.stack.find(({ route }) => route.path === path && route.methods[method]).route;
  const validation = route.stack.at(-2).handle;
  const res = { locals: {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
  validation(request, res, (error) => {
    if (error) errorHandler(error, request, res, () => {});
  });
  return res;
}
async function verifier() {
  const validation = valider('get', '/', { query: { tenantId: autreTenant } });
  const { page, limit, ...filters } = validation.locals.validatedQuery;
  assert.deepEqual(filters, {});
  await service.findAll(tenantId, { ...filters, tenantId: autreTenant }, { page, limit });
  for (const online of [true, false]) {
    const { locals } = valider('get', '/', { query: { isOnline: String(online), page: '2', limit: '5' } });
    assert.deepEqual(locals.validatedQuery, { isOnline: online, page: 2, limit: 5 });
  }
  assert.equal(valider('get', '/', { query: { limit: '101' } }).code, 400);
  const champsEtrangers = valider('patch', '/:id', { body: { tenantId: autreTenant } });
  assert.equal(champsEtrangers.code, 400);
  assert.equal(champsEtrangers.body.code, 'VALIDATION_ERROR');
  assert.equal(valider('post', '/:id/control', { body: { command: 'set_state' } }).code, 400);
  assert.equal(valider('post', '/:id/control', { body: { command: 'turn_on', params: { state: 'off' } } }).code, 400);
  const { locals: { validatedBody: commande } } = valider('post', '/:id/control', {
    body: { command: 'set_state', params: { state: 'off' } },
  });
  const absent = { statusCode: 404 };
  await assert.rejects(service.create({ name: 'Test', type: DeviceType.SENSOR, buildingId: batimentEtranger }, tenantId), absent);
  await assert.rejects(service.findById(appareil, tenantId), absent);
  await assert.rejects(service.update(appareil, { name: 'Test' }, tenantId), absent);
  await assert.rejects(service.remove(appareil, tenantId), absent);
  await assert.rejects(service.control(appareil, { command: 'turn_on' }, tenantId), absent);
  const buildingId = randomUUID();
  const zoneId = randomUUID();
  prisma.building.findFirst = async ({ where }) => {
    assert.deepEqual(where, { id: buildingId, tenantId, isActive: true });
    return { id: buildingId };
  };
  prisma.zone = { async findFirst({ where }) {
    assert.equal(where.tenantId, tenantId);
    assert.equal(where.buildingId, buildingId);
    return where.id === zoneId ? { id: zoneId } : null;
  } };
  prisma.device.create = async ({ data }) => {
    assert.equal(data.tenantId, tenantId);
    assert.equal(data.zoneId, zoneId);
    return { id: appareil, ...data };
  };
  const nouveau = { name: 'Sonde', type: DeviceType.SENSOR, buildingId, zoneId };
  assert.equal((await service.create(nouveau, tenantId)).id, appareil);
  await assert.rejects(service.create({ ...nouveau, zoneId: randomUUID() }, tenantId), absent);
  prisma.device.findFirst = async () => ({ id: appareil, buildingId });
  await assert.rejects(service.update(appareil, { zoneId: randomUUID() }, tenantId), absent);
  prisma.device.update = async ({ where, data }) => {
    assert.equal(where.id, appareil);
    assert.equal(where.tenantId, tenantId);
    assert.deepEqual(data, { zoneId: null });
    return { ...nouveau, ...data };
  };
  assert.equal((await service.update(appareil, { zoneId: null }, tenantId)).zoneId, null);

  let type = DeviceType.SENSOR;
  prisma.device.findFirst = async ({ where }) => {
    assert.deepEqual(where, { id: appareil, tenantId, building: { tenantId, isActive: true, tenant: { isActive: true } } });
    return { id: appareil, buildingId, type, config: {} };
  };
  prisma.deviceState = { async upsert({ where, create }) {
    assert.deepEqual(where, { deviceId: appareil, tenantId });
    assert.deepEqual(create.state, { state: 'off' });
  } };
  await assert.rejects(service.control(appareil, commande, tenantId), { statusCode: 400, code: 'INVALID_DEVICE_COMMAND' });
  assert.equal(publications.length, 0);
  for (type of [DeviceType.LIGHT, DeviceType.PLUG]) {
    assert.deepEqual(await service.control(appareil, commande, tenantId), { success: true });
  }
  assert.deepEqual(publications, Array.from({ length: 2 }, () => ({
    topic: `afrixora/${tenantId}/${buildingId}/devices/${appareil}/commands`,
    command: commande,
  })));
  process.stdout.write('Validation Zod, isolation Prisma et commandes simulées vérifiées.\n');
}
void verifier();
NODE
[[ "${1:-}" != "--local" ]] || exit 0

: "${BASE_URL:?URL de la base API de test, avec /api/v1}"
: "${TOKEN:?JWT du compte de test}"
api="${BASE_URL%/}"
get() {
  curl --fail --silent --show-error --header "Authorization: Bearer $TOKEN" "$api/$1"
}

tenant=$(get users/me | jq -er '.tenantId | strings | select(length > 0)')
page=1
while true; do
  result=$(get "devices?page=$page&limit=100")
  jq -e --arg tenant "$tenant" --argjson page "$page" '
    .page == $page and (.totalPages | type == "number") and
    (.data | type == "array") and all(.data[];
      .tenantId == $tenant and
      (.zone == null or .zone.tenantId == $tenant) and
      all(.states[]; .tenantId == $tenant))
  ' <<<"$result" >/dev/null
  (( page > 1 )) || jq -e '.data | length > 0' <<<"$result" >/dev/null || {
    echo "Un appareil de test est nécessaire dans ce tenant." >&2
    exit 1
  }
  (( page < $(jq '.totalPages' <<<"$result") )) || break
  ((page+=1))
done

for online in true false; do
  get "devices?isOnline=$online&limit=100" |
    jq -e --argjson online "$online" 'all(.data[]; .isOnline == $online)' >/dev/null
done
echo "Appartenance des appareils, zones et états vérifiée sur $page page(s). Filtres en ligne et hors ligne validés."
