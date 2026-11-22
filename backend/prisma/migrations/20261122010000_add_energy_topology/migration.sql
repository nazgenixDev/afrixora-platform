BEGIN;

-- Structure générée avec Prisma migrate diff à partir du schéma de stabilisation.
-- Type énuméré
CREATE TYPE "EnergySourceType" AS ENUM ('GRID', 'GENERATOR', 'PV_INVERTER', 'BATTERY_INVERTER', 'OTHER');

-- Type énuméré
CREATE TYPE "EnergySourceStatus" AS ENUM ('UNKNOWN', 'AVAILABLE', 'UNAVAILABLE', 'MAINTENANCE');

-- Type énuméré
CREATE TYPE "FeedSwitchingMode" AS ENUM ('UNKNOWN', 'DIRECT', 'MANUAL', 'AUTOMATIC_TRANSFER');

-- Type énuméré
CREATE TYPE "FeedObservedState" AS ENUM ('UNKNOWN', 'OPEN', 'CLOSED');

-- Type énuméré
CREATE TYPE "ElectricalPhaseConfiguration" AS ENUM ('UNKNOWN', 'SINGLE_PHASE', 'THREE_PHASE', 'DC');

-- Type énuméré
CREATE TYPE "ElectricalPriority" AS ENUM ('CRITICAL', 'IMPORTANT', 'FLEXIBLE');

-- Type énuméré
CREATE TYPE "CircuitStatus" AS ENUM ('UNKNOWN', 'IN_SERVICE', 'OUT_OF_SERVICE');

-- Type énuméré
CREATE TYPE "ElectricalLoadCategory" AS ENUM ('HVAC', 'LIGHTING', 'PUMP', 'REFRIGERATION', 'MACHINERY', 'OTHER');

-- Type énuméré
CREATE TYPE "MeteringScope" AS ENUM ('SOURCE', 'FEED', 'BOARD', 'CIRCUIT', 'LOAD');

-- Type énuméré
CREATE TYPE "MeasurementMode" AS ENUM ('CUMULATIVE', 'INTERVAL', 'INSTANTANEOUS');

-- Type énuméré
CREATE TYPE "MeasurementQuality" AS ENUM ('UNKNOWN', 'MEASURED', 'ESTIMATED', 'INVALID');

-- Type énuméré
CREATE TYPE "MeteringFlowDirection" AS ENUM ('UNSPECIFIED', 'IMPORT', 'EXPORT', 'BIDIRECTIONAL');

-- Type énuméré
CREATE TYPE "ControlAction" AS ENUM ('TURN_ON', 'TURN_OFF');

-- Type énuméré
CREATE TYPE "ControlEndpointApproval" AS ENUM ('PENDING', 'APPROVED', 'REVOKED');

-- Type énuméré
CREATE TYPE "ControlVerificationMethod" AS ENUM ('NONE', 'AUXILIARY_CONTACT', 'INDEPENDENT_METER');

-- Type énuméré
CREATE TYPE "ControlVerifiedState" AS ENUM ('UNKNOWN', 'ON', 'OFF');

-- Création de table
CREATE TABLE "EnergySource" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "EnergySourceType" NOT NULL,
    "ratedPowerW" DECIMAL(14,3),
    "status" "EnergySourceStatus" NOT NULL DEFAULT 'UNKNOWN',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnergySource_pkey" PRIMARY KEY ("id")
);

-- Création de table
CREATE TABLE "EnergyBus" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnergyBus_pkey" PRIMARY KEY ("id")
);

-- Création de table
CREATE TABLE "SourceFeed" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "busId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "switchingMode" "FeedSwitchingMode" NOT NULL DEFAULT 'UNKNOWN',
    "switchingReference" TEXT,
    "isAllowed" BOOLEAN NOT NULL DEFAULT false,
    "observedState" "FeedObservedState" NOT NULL DEFAULT 'UNKNOWN',
    "observedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceFeed_pkey" PRIMARY KEY ("id")
);

-- Création de table
CREATE TABLE "DistributionBoard" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "busId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "nominalVoltageV" DECIMAL(10,3),
    "phaseConfiguration" "ElectricalPhaseConfiguration" NOT NULL DEFAULT 'UNKNOWN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DistributionBoard_pkey" PRIMARY KEY ("id")
);

-- Création de table
CREATE TABLE "Circuit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priority" "ElectricalPriority" NOT NULL,
    "status" "CircuitStatus" NOT NULL DEFAULT 'UNKNOWN',
    "phaseConfiguration" "ElectricalPhaseConfiguration" NOT NULL DEFAULT 'UNKNOWN',
    "ratedCurrentA" DECIMAL(10,3),
    "protection" JSONB NOT NULL DEFAULT '{}',
    "isControllable" BOOLEAN NOT NULL DEFAULT false,
    "autoSheddingAllowed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Circuit_pkey" PRIMARY KEY ("id")
);

-- Création de table
CREATE TABLE "ElectricalLoad" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "circuitId" TEXT NOT NULL,
    "zoneId" TEXT,
    "name" TEXT NOT NULL,
    "category" "ElectricalLoadCategory" NOT NULL,
    "priority" "ElectricalPriority" NOT NULL,
    "ratedPowerW" DECIMAL(14,3),
    "isControllable" BOOLEAN NOT NULL DEFAULT false,
    "canBeAutomated" BOOLEAN NOT NULL DEFAULT false,
    "minOnSeconds" INTEGER,
    "minOffSeconds" INTEGER,
    "maxInterruptionsPerHour" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ElectricalLoad_pkey" PRIMARY KEY ("id")
);

-- Création de table
CREATE TABLE "MeteringPoint" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "deviceType" "DeviceType" NOT NULL DEFAULT 'ENERGY_METER',
    "sourceId" TEXT,
    "feedId" TEXT,
    "boardId" TEXT,
    "circuitId" TEXT,
    "loadId" TEXT,
    "name" TEXT NOT NULL,
    "scope" "MeteringScope" NOT NULL,
    "unit" TEXT NOT NULL,
    "measurementMode" "MeasurementMode" NOT NULL,
    "quality" "MeasurementQuality" NOT NULL DEFAULT 'UNKNOWN',
    "flowDirection" "MeteringFlowDirection" NOT NULL DEFAULT 'UNSPECIFIED',
    "location" TEXT,
    "calibration" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeteringPoint_pkey" PRIMARY KEY ("id")
);

-- Création de table
CREATE TABLE "ControlEndpoint" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "targetCircuitId" TEXT,
    "targetLoadId" TEXT,
    "name" TEXT NOT NULL,
    "declaredActions" "ControlAction"[] DEFAULT ARRAY[]::"ControlAction"[],
    "allowedActions" "ControlAction"[] DEFAULT ARRAY[]::"ControlAction"[],
    "approvalStatus" "ControlEndpointApproval" NOT NULL DEFAULT 'PENDING',
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "verificationMethod" "ControlVerificationMethod" NOT NULL DEFAULT 'NONE',
    "verifiedState" "ControlVerifiedState" NOT NULL DEFAULT 'UNKNOWN',
    "verifiedAt" TIMESTAMP(3),
    "constraints" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ControlEndpoint_pkey" PRIMARY KEY ("id")
);

-- Création d’index
CREATE INDEX "EnergySource_tenantId_buildingId_idx" ON "EnergySource"("tenantId", "buildingId");

-- Création d’index
CREATE UNIQUE INDEX "EnergySource_id_tenantId_buildingId_key" ON "EnergySource"("id", "tenantId", "buildingId");

-- Création d’index
CREATE INDEX "EnergyBus_tenantId_buildingId_idx" ON "EnergyBus"("tenantId", "buildingId");

-- Création d’index
CREATE UNIQUE INDEX "EnergyBus_id_tenantId_buildingId_key" ON "EnergyBus"("id", "tenantId", "buildingId");

-- Création d’index
CREATE INDEX "SourceFeed_tenantId_buildingId_sourceId_idx" ON "SourceFeed"("tenantId", "buildingId", "sourceId");

-- Création d’index
CREATE INDEX "SourceFeed_tenantId_buildingId_busId_idx" ON "SourceFeed"("tenantId", "buildingId", "busId");

-- Création d’index
CREATE UNIQUE INDEX "SourceFeed_id_tenantId_buildingId_key" ON "SourceFeed"("id", "tenantId", "buildingId");

-- Création d’index
CREATE INDEX "DistributionBoard_tenantId_buildingId_busId_idx" ON "DistributionBoard"("tenantId", "buildingId", "busId");

-- Création d’index
CREATE UNIQUE INDEX "DistributionBoard_id_tenantId_buildingId_key" ON "DistributionBoard"("id", "tenantId", "buildingId");

-- Création d’index
CREATE INDEX "Circuit_tenantId_buildingId_boardId_idx" ON "Circuit"("tenantId", "buildingId", "boardId");

-- Création d’index
CREATE UNIQUE INDEX "Circuit_id_tenantId_buildingId_key" ON "Circuit"("id", "tenantId", "buildingId");

-- Création d’index
CREATE UNIQUE INDEX "Circuit_tenantId_buildingId_code_key" ON "Circuit"("tenantId", "buildingId", "code");

-- Création d’index
CREATE INDEX "ElectricalLoad_tenantId_buildingId_circuitId_idx" ON "ElectricalLoad"("tenantId", "buildingId", "circuitId");

-- Création d’index
CREATE INDEX "ElectricalLoad_tenantId_buildingId_zoneId_idx" ON "ElectricalLoad"("tenantId", "buildingId", "zoneId");

-- Création d’index
CREATE UNIQUE INDEX "ElectricalLoad_id_tenantId_buildingId_key" ON "ElectricalLoad"("id", "tenantId", "buildingId");

-- Création d’index
CREATE INDEX "MeteringPoint_tenantId_buildingId_deviceId_idx" ON "MeteringPoint"("tenantId", "buildingId", "deviceId");

-- Création d’index
CREATE INDEX "MeteringPoint_tenantId_buildingId_sourceId_idx" ON "MeteringPoint"("tenantId", "buildingId", "sourceId");

-- Création d’index
CREATE INDEX "MeteringPoint_tenantId_buildingId_feedId_idx" ON "MeteringPoint"("tenantId", "buildingId", "feedId");

-- Création d’index
CREATE INDEX "MeteringPoint_tenantId_buildingId_boardId_idx" ON "MeteringPoint"("tenantId", "buildingId", "boardId");

-- Création d’index
CREATE INDEX "MeteringPoint_tenantId_buildingId_circuitId_idx" ON "MeteringPoint"("tenantId", "buildingId", "circuitId");

-- Création d’index
CREATE INDEX "MeteringPoint_tenantId_buildingId_loadId_idx" ON "MeteringPoint"("tenantId", "buildingId", "loadId");

-- Création d’index
CREATE INDEX "ControlEndpoint_tenantId_buildingId_deviceId_idx" ON "ControlEndpoint"("tenantId", "buildingId", "deviceId");

-- Création d’index
CREATE INDEX "ControlEndpoint_tenantId_buildingId_targetCircuitId_idx" ON "ControlEndpoint"("tenantId", "buildingId", "targetCircuitId");

-- Création d’index
CREATE INDEX "ControlEndpoint_tenantId_buildingId_targetLoadId_idx" ON "ControlEndpoint"("tenantId", "buildingId", "targetLoadId");

-- Création d’index
CREATE UNIQUE INDEX "Device_id_tenantId_buildingId_type_key" ON "Device"("id", "tenantId", "buildingId", "type");

-- Clé étrangère
ALTER TABLE "EnergySource" ADD CONSTRAINT "EnergySource_buildingId_tenantId_fkey" FOREIGN KEY ("buildingId", "tenantId") REFERENCES "Building"("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Clé étrangère
ALTER TABLE "EnergyBus" ADD CONSTRAINT "EnergyBus_buildingId_tenantId_fkey" FOREIGN KEY ("buildingId", "tenantId") REFERENCES "Building"("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Clé étrangère
ALTER TABLE "SourceFeed" ADD CONSTRAINT "SourceFeed_buildingId_tenantId_fkey" FOREIGN KEY ("buildingId", "tenantId") REFERENCES "Building"("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Clé étrangère
ALTER TABLE "SourceFeed" ADD CONSTRAINT "SourceFeed_sourceId_tenantId_buildingId_fkey" FOREIGN KEY ("sourceId", "tenantId", "buildingId") REFERENCES "EnergySource"("id", "tenantId", "buildingId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Clé étrangère
ALTER TABLE "SourceFeed" ADD CONSTRAINT "SourceFeed_busId_tenantId_buildingId_fkey" FOREIGN KEY ("busId", "tenantId", "buildingId") REFERENCES "EnergyBus"("id", "tenantId", "buildingId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Clé étrangère
ALTER TABLE "DistributionBoard" ADD CONSTRAINT "DistributionBoard_buildingId_tenantId_fkey" FOREIGN KEY ("buildingId", "tenantId") REFERENCES "Building"("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Clé étrangère
ALTER TABLE "DistributionBoard" ADD CONSTRAINT "DistributionBoard_busId_tenantId_buildingId_fkey" FOREIGN KEY ("busId", "tenantId", "buildingId") REFERENCES "EnergyBus"("id", "tenantId", "buildingId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Clé étrangère
ALTER TABLE "Circuit" ADD CONSTRAINT "Circuit_buildingId_tenantId_fkey" FOREIGN KEY ("buildingId", "tenantId") REFERENCES "Building"("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Clé étrangère
ALTER TABLE "Circuit" ADD CONSTRAINT "Circuit_boardId_tenantId_buildingId_fkey" FOREIGN KEY ("boardId", "tenantId", "buildingId") REFERENCES "DistributionBoard"("id", "tenantId", "buildingId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Clé étrangère
ALTER TABLE "ElectricalLoad" ADD CONSTRAINT "ElectricalLoad_buildingId_tenantId_fkey" FOREIGN KEY ("buildingId", "tenantId") REFERENCES "Building"("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Clé étrangère
ALTER TABLE "ElectricalLoad" ADD CONSTRAINT "ElectricalLoad_circuitId_tenantId_buildingId_fkey" FOREIGN KEY ("circuitId", "tenantId", "buildingId") REFERENCES "Circuit"("id", "tenantId", "buildingId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Clé étrangère
ALTER TABLE "ElectricalLoad" ADD CONSTRAINT "ElectricalLoad_zoneId_tenantId_buildingId_fkey" FOREIGN KEY ("zoneId", "tenantId", "buildingId") REFERENCES "Zone"("id", "tenantId", "buildingId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Clé étrangère
ALTER TABLE "MeteringPoint" ADD CONSTRAINT "MeteringPoint_buildingId_tenantId_fkey" FOREIGN KEY ("buildingId", "tenantId") REFERENCES "Building"("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Clé étrangère
ALTER TABLE "MeteringPoint" ADD CONSTRAINT "MeteringPoint_deviceId_tenantId_buildingId_deviceType_fkey" FOREIGN KEY ("deviceId", "tenantId", "buildingId", "deviceType") REFERENCES "Device"("id", "tenantId", "buildingId", "type") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Clé étrangère
ALTER TABLE "MeteringPoint" ADD CONSTRAINT "MeteringPoint_sourceId_tenantId_buildingId_fkey" FOREIGN KEY ("sourceId", "tenantId", "buildingId") REFERENCES "EnergySource"("id", "tenantId", "buildingId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Clé étrangère
ALTER TABLE "MeteringPoint" ADD CONSTRAINT "MeteringPoint_feedId_tenantId_buildingId_fkey" FOREIGN KEY ("feedId", "tenantId", "buildingId") REFERENCES "SourceFeed"("id", "tenantId", "buildingId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Clé étrangère
ALTER TABLE "MeteringPoint" ADD CONSTRAINT "MeteringPoint_boardId_tenantId_buildingId_fkey" FOREIGN KEY ("boardId", "tenantId", "buildingId") REFERENCES "DistributionBoard"("id", "tenantId", "buildingId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Clé étrangère
ALTER TABLE "MeteringPoint" ADD CONSTRAINT "MeteringPoint_circuitId_tenantId_buildingId_fkey" FOREIGN KEY ("circuitId", "tenantId", "buildingId") REFERENCES "Circuit"("id", "tenantId", "buildingId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Clé étrangère
ALTER TABLE "MeteringPoint" ADD CONSTRAINT "MeteringPoint_loadId_tenantId_buildingId_fkey" FOREIGN KEY ("loadId", "tenantId", "buildingId") REFERENCES "ElectricalLoad"("id", "tenantId", "buildingId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Clé étrangère
ALTER TABLE "ControlEndpoint" ADD CONSTRAINT "ControlEndpoint_buildingId_tenantId_fkey" FOREIGN KEY ("buildingId", "tenantId") REFERENCES "Building"("id", "tenantId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Clé étrangère
ALTER TABLE "ControlEndpoint" ADD CONSTRAINT "ControlEndpoint_deviceId_tenantId_buildingId_fkey" FOREIGN KEY ("deviceId", "tenantId", "buildingId") REFERENCES "Device"("id", "tenantId", "buildingId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Clé étrangère
ALTER TABLE "ControlEndpoint" ADD CONSTRAINT "ControlEndpoint_targetCircuitId_tenantId_buildingId_fkey" FOREIGN KEY ("targetCircuitId", "tenantId", "buildingId") REFERENCES "Circuit"("id", "tenantId", "buildingId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Clé étrangère
ALTER TABLE "ControlEndpoint" ADD CONSTRAINT "ControlEndpoint_targetLoadId_tenantId_buildingId_fkey" FOREIGN KEY ("targetLoadId", "tenantId", "buildingId") REFERENCES "ElectricalLoad"("id", "tenantId", "buildingId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Les noms sont saisis sans espaces périphériques. Les codes de départ sont normalisés.
ALTER TABLE "EnergySource"
  ADD CONSTRAINT "EnergySource_name_check"
    CHECK (char_length("name") BETWEEN 1 AND 120 AND "name" !~ '^[[:space:]]|[[:space:]]$'),
  ADD CONSTRAINT "EnergySource_rated_power_check"
    CHECK ("ratedPowerW" > 0 AND "ratedPowerW" <> 'NaN'::numeric);

ALTER TABLE "EnergyBus" ADD CONSTRAINT "EnergyBus_name_check"
  CHECK (char_length("name") BETWEEN 1 AND 120 AND "name" !~ '^[[:space:]]|[[:space:]]$');

ALTER TABLE "SourceFeed"
  ADD CONSTRAINT "SourceFeed_name_check"
    CHECK (char_length("name") BETWEEN 1 AND 120 AND "name" !~ '^[[:space:]]|[[:space:]]$'),
  ADD CONSTRAINT "SourceFeed_observation_check"
    CHECK (("observedState" = 'UNKNOWN') = ("observedAt" IS NULL));

ALTER TABLE "DistributionBoard"
  ADD CONSTRAINT "DistributionBoard_name_check"
    CHECK (char_length("name") BETWEEN 1 AND 120 AND "name" !~ '^[[:space:]]|[[:space:]]$'),
  ADD CONSTRAINT "DistributionBoard_nominal_voltage_check"
    CHECK ("nominalVoltageV" > 0 AND "nominalVoltageV" <> 'NaN'::numeric);

ALTER TABLE "Circuit"
  ADD CONSTRAINT "Circuit_name_check"
    CHECK (char_length("name") BETWEEN 1 AND 120 AND "name" !~ '^[[:space:]]|[[:space:]]$'),
  ADD CONSTRAINT "Circuit_code_check" CHECK ("code" ~ '^[A-Z0-9][A-Z0-9_-]{0,31}$'),
  ADD CONSTRAINT "Circuit_rated_current_check"
    CHECK ("ratedCurrentA" > 0 AND "ratedCurrentA" <> 'NaN'::numeric),
  ADD CONSTRAINT "Circuit_auto_shedding_check"
    CHECK (NOT "autoSheddingAllowed" OR ("isControllable" AND "priority" <> 'CRITICAL'));

ALTER TABLE "ElectricalLoad"
  ADD CONSTRAINT "ElectricalLoad_name_check"
    CHECK (char_length("name") BETWEEN 1 AND 120 AND "name" !~ '^[[:space:]]|[[:space:]]$'),
  ADD CONSTRAINT "ElectricalLoad_rated_power_check"
    CHECK ("ratedPowerW" > 0 AND "ratedPowerW" <> 'NaN'::numeric),
  ADD CONSTRAINT "ElectricalLoad_operating_limits_check"
    CHECK ("minOnSeconds" >= 0 AND "minOffSeconds" >= 0 AND "maxInterruptionsPerHour" >= 0),
  ADD CONSTRAINT "ElectricalLoad_automation_check"
    CHECK (NOT "canBeAutomated" OR ("isControllable" AND "priority" <> 'CRITICAL'));

-- La base vérifie la portée même pour les écritures SQL directes.
ALTER TABLE "MeteringPoint"
  ADD CONSTRAINT "MeteringPoint_name_unit_check"
    CHECK (char_length("name") BETWEEN 1 AND 120 AND "name" !~ '^[[:space:]]|[[:space:]]$'
      AND char_length("unit") BETWEEN 1 AND 32 AND "unit" !~ '^[[:space:]]|[[:space:]]$'),
  ADD CONSTRAINT "MeteringPoint_device_type_check" CHECK ("deviceType" = 'ENERGY_METER'),
  ADD CONSTRAINT "MeteringPoint_scope_target_check"
    CHECK (
      num_nonnulls("sourceId", "feedId", "boardId", "circuitId", "loadId") = 1
      AND CASE "scope"
        WHEN 'SOURCE' THEN "sourceId" IS NOT NULL
        WHEN 'FEED' THEN "feedId" IS NOT NULL
        WHEN 'BOARD' THEN "boardId" IS NOT NULL
        WHEN 'CIRCUIT' THEN "circuitId" IS NOT NULL
        WHEN 'LOAD' THEN "loadId" IS NOT NULL
        ELSE false
      END
    );

ALTER TABLE "ControlEndpoint"
  ADD CONSTRAINT "ControlEndpoint_name_check"
    CHECK (char_length("name") BETWEEN 1 AND 120 AND "name" !~ '^[[:space:]]|[[:space:]]$'),
  ADD CONSTRAINT "ControlEndpoint_target_check"
    CHECK (num_nonnulls("targetCircuitId", "targetLoadId") = 1),
  ALTER COLUMN "declaredActions" SET NOT NULL,
  ALTER COLUMN "allowedActions" SET NOT NULL,
  ADD CONSTRAINT "ControlEndpoint_action_subset_check"
    CHECK (
      array_position("declaredActions", NULL) IS NULL
      AND array_position("allowedActions", NULL) IS NULL
      AND "allowedActions" <@ "declaredActions"
    ),
  ADD CONSTRAINT "ControlEndpoint_enablement_check"
    CHECK (NOT "isEnabled" OR (
      "approvalStatus" = 'APPROVED' AND cardinality("allowedActions") > 0
      AND "verificationMethod" <> 'NONE'
    )),
  ADD CONSTRAINT "ControlEndpoint_verified_state_check"
    CHECK (
      ("verifiedState" = 'UNKNOWN' AND "verifiedAt" IS NULL)
      OR ("verifiedState" <> 'UNKNOWN' AND "verifiedAt" IS NOT NULL AND "verificationMethod" <> 'NONE')
    );

COMMIT;
