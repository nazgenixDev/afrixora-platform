BEGIN;

-- Protéger les nouvelles écritures sans supprimer les relations historiques.
CREATE UNIQUE INDEX "Building_id_tenantId_key" ON "Building" ("id", "tenantId");
CREATE UNIQUE INDEX "Zone_id_tenantId_buildingId_key" ON "Zone" ("id", "tenantId", "buildingId");
CREATE UNIQUE INDEX "Device_id_tenantId_key" ON "Device" ("id", "tenantId");
CREATE UNIQUE INDEX "Device_id_tenantId_buildingId_key" ON "Device" ("id", "tenantId", "buildingId");

ALTER TABLE "Zone" ADD CONSTRAINT "Zone_building_tenant_fkey"
  FOREIGN KEY ("buildingId", "tenantId") REFERENCES "Building" ("id", "tenantId") NOT VALID;
ALTER TABLE "Device" ADD CONSTRAINT "Device_building_tenant_fkey"
  FOREIGN KEY ("buildingId", "tenantId") REFERENCES "Building" ("id", "tenantId") NOT VALID;
-- La FK d'origine efface zoneId si la zone est supprimée, sans modifier le reste.
ALTER TABLE "Device" ADD CONSTRAINT "Device_zone_scope_fkey"
  FOREIGN KEY ("zoneId", "tenantId", "buildingId") REFERENCES "Zone" ("id", "tenantId", "buildingId")
  DEFERRABLE INITIALLY DEFERRED NOT VALID;
ALTER TABLE "DeviceState" ADD CONSTRAINT "DeviceState_device_tenant_fkey"
  FOREIGN KEY ("deviceId", "tenantId") REFERENCES "Device" ("id", "tenantId") NOT VALID;
ALTER TABLE "Automation" ADD CONSTRAINT "Automation_building_tenant_fkey"
  FOREIGN KEY ("buildingId", "tenantId") REFERENCES "Building" ("id", "tenantId") NOT VALID;
ALTER TABLE "Gateway" ADD CONSTRAINT "Gateway_building_tenant_fkey"
  FOREIGN KEY ("buildingId", "tenantId") REFERENCES "Building" ("id", "tenantId") NOT VALID;
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_building_tenant_fkey"
  FOREIGN KEY ("buildingId", "tenantId") REFERENCES "Building" ("id", "tenantId") NOT VALID;
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_device_scope_fkey"
  FOREIGN KEY ("deviceId", "tenantId", "buildingId") REFERENCES "Device" ("id", "tenantId", "buildingId")
  DEFERRABLE INITIALLY DEFERRED NOT VALID;

COMMIT;
