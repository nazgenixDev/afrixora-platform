BEGIN;

CREATE UNIQUE INDEX "Circuit_id_tenantId_buildingId_isControllable_key"
  ON "Circuit" ("id", "tenantId", "buildingId", "isControllable");

CREATE UNIQUE INDEX "ElectricalLoad_id_tenantId_buildingId_isControllable_key"
  ON "ElectricalLoad" ("id", "tenantId", "buildingId", "isControllable");

-- Les clés étrangères ordinaires vérifient toujours la cible et le périmètre.
-- Les deux clés ci-dessous exigent aussi une cible pilotable pour un canal activé.
ALTER TABLE "ControlEndpoint"
  ADD COLUMN "requiresControllableTarget" BOOLEAN GENERATED ALWAYS AS (
    CASE WHEN "isEnabled" THEN TRUE END
  ) STORED,
  ADD CONSTRAINT "ControlEndpoint_enabled_circuit_fkey"
    FOREIGN KEY ("targetCircuitId", "tenantId", "buildingId", "requiresControllableTarget")
    REFERENCES "Circuit" ("id", "tenantId", "buildingId", "isControllable")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "ControlEndpoint_enabled_load_fkey"
    FOREIGN KEY ("targetLoadId", "tenantId", "buildingId", "requiresControllableTarget")
    REFERENCES "ElectricalLoad" ("id", "tenantId", "buildingId", "isControllable")
    ON DELETE RESTRICT ON UPDATE RESTRICT;

COMMIT;
