-- Données fictives à charger manuellement sur une base de démonstration isolée.
-- Initialiser le compte administrateur avec prisma db seed.
BEGIN;

-- 1. Tenant
INSERT INTO "Tenant" (id, name, slug, plan, "isActive", "createdAt")
VALUES ('c0a80121-0000-4000-8000-000000000001', 'Client Démo', 'demo', 'BASIC', true, NOW());

-- 2. Bâtiment
INSERT INTO "Building" (id, "tenantId", name, address, city, "unitsCount", "isActive", "createdAt")
VALUES ('c0a80121-0000-4000-8000-000000000003',
        'c0a80121-0000-4000-8000-000000000001',
        'Immeuble A',
        '123 Avenue du Marché',
        'Lubumbashi',
        10,
        true,
        NOW());

-- 3. Zones
-- Bureau 101
INSERT INTO "Zone" (id, "tenantId", "buildingId", name, floor, type)
VALUES ('c0a80121-0000-4000-8000-000000000004',
        'c0a80121-0000-4000-8000-000000000001',
        'c0a80121-0000-4000-8000-000000000003',
        'Bureau 101', 1, 'ROOM');

-- Bureau 102
INSERT INTO "Zone" (id, "tenantId", "buildingId", name, floor, type)
VALUES ('c0a80121-0000-4000-8000-000000000005',
        'c0a80121-0000-4000-8000-000000000001',
        'c0a80121-0000-4000-8000-000000000003',
        'Bureau 102', 1, 'ROOM');

-- Salle de Réunion
INSERT INTO "Zone" (id, "tenantId", "buildingId", name, floor, type)
VALUES ('c0a80121-0000-4000-8000-000000000006',
        'c0a80121-0000-4000-8000-000000000001',
        'c0a80121-0000-4000-8000-000000000003',
        'Salle de Réunion', 1, 'ROOM');

-- Couloir RDC
INSERT INTO "Zone" (id, "tenantId", "buildingId", name, floor, type)
VALUES ('c0a80121-0000-4000-8000-000000000007',
        'c0a80121-0000-4000-8000-000000000001',
        'c0a80121-0000-4000-8000-000000000003',
        'Couloir RDC', 0, 'CORRIDOR');

-- Parking
INSERT INTO "Zone" (id, "tenantId", "buildingId", name, floor, type)
VALUES ('c0a80121-0000-4000-8000-000000000008',
        'c0a80121-0000-4000-8000-000000000001',
        'c0a80121-0000-4000-8000-000000000003',
        'Parking', -1, 'PARKING');

-- 4. Appareils
-- Lumière Bureau 101
INSERT INTO "Device" (id, "tenantId", "buildingId", "zoneId", name, type, protocol, "macAddress", "isOnline", "lastSeen")
VALUES ('c0a80121-0000-4000-8000-000000000009',
        'c0a80121-0000-4000-8000-000000000001',
        'c0a80121-0000-4000-8000-000000000003',
        'c0a80121-0000-4000-8000-000000000004',
        'Lumière Bureau 101', 'LIGHT', 'MQTT', 'AA:BB:CC:DD:EE:01', true, NOW());

-- Prise Bureau 102
INSERT INTO "Device" (id, "tenantId", "buildingId", "zoneId", name, type, protocol, "macAddress", "isOnline", "lastSeen")
VALUES ('c0a80121-0000-4000-8000-000000000010',
        'c0a80121-0000-4000-8000-000000000001',
        'c0a80121-0000-4000-8000-000000000003',
        'c0a80121-0000-4000-8000-000000000005',
        'Prise Bureau 102', 'PLUG', 'MQTT', 'AA:BB:CC:DD:EE:02', true, NOW());

-- Capteur Température
INSERT INTO "Device" (id, "tenantId", "buildingId", "zoneId", name, type, protocol, "macAddress", "isOnline", "lastSeen")
VALUES ('c0a80121-0000-4000-8000-000000000011',
        'c0a80121-0000-4000-8000-000000000001',
        'c0a80121-0000-4000-8000-000000000003',
        'c0a80121-0000-4000-8000-000000000006',
        'Capteur Température', 'SENSOR', 'MQTT', 'AA:BB:CC:DD:EE:03', true, NOW());

-- Compteur Énergie Principal
INSERT INTO "Device" (id, "tenantId", "buildingId", "zoneId", name, type, protocol, "macAddress", "isOnline", "lastSeen")
VALUES ('c0a80121-0000-4000-8000-000000000012',
        'c0a80121-0000-4000-8000-000000000001',
        'c0a80121-0000-4000-8000-000000000003',
        'c0a80121-0000-4000-8000-000000000007',
        'Compteur Énergie Principal', 'ENERGY_METER', 'MQTT', 'AA:BB:CC:DD:EE:04', true, NOW());

-- Thermostat Salle Réunion
INSERT INTO "Device" (id, "tenantId", "buildingId", "zoneId", name, type, protocol, "macAddress", "isOnline", "lastSeen")
VALUES ('c0a80121-0000-4000-8000-000000000013',
        'c0a80121-0000-4000-8000-000000000001',
        'c0a80121-0000-4000-8000-000000000003',
        'c0a80121-0000-4000-8000-000000000006',
        'Thermostat Salle Réunion', 'THERMOSTAT', 'MQTT', 'AA:BB:CC:DD:EE:05', true, NOW());

-- 5. États des appareils
INSERT INTO "DeviceState" (id, "deviceId", "tenantId", state, "updatedAt")
VALUES ('c0a80121-0000-4000-8000-000000000014',
        'c0a80121-0000-4000-8000-000000000009',
        'c0a80121-0000-4000-8000-000000000001',
        '{"power": "on", "brightness": 80}', NOW());

INSERT INTO "DeviceState" (id, "deviceId", "tenantId", state, "updatedAt")
VALUES ('c0a80121-0000-4000-8000-000000000015',
        'c0a80121-0000-4000-8000-000000000010',
        'c0a80121-0000-4000-8000-000000000001',
        '{"power": "off"}', NOW());

INSERT INTO "DeviceState" (id, "deviceId", "tenantId", state, "updatedAt")
VALUES ('c0a80121-0000-4000-8000-000000000016',
        'c0a80121-0000-4000-8000-000000000012',
        'c0a80121-0000-4000-8000-000000000001',
        '{"power_w": 0, "total_kwh": 1250.5}', NOW());

COMMIT;
