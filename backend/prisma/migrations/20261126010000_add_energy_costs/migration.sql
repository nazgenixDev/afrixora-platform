BEGIN;
CREATE TYPE "EnergyCurrency" AS ENUM ('USD', 'CDF');

CREATE TABLE "EnergyTariff" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "buildingId" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "currency" "EnergyCurrency" NOT NULL,
  "unit" TEXT NOT NULL DEFAULT 'KWH' CHECK ("unit" = 'KWH'),
  "unitPrice" DECIMAL(20,8) NOT NULL CHECK ("unitPrice" >= 0 AND "unitPrice" <> 'NaN'::numeric),
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3) CHECK ("effectiveTo" > "effectiveFrom"),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnergyTariff_sourceId_tenantId_buildingId_fkey"
    FOREIGN KEY ("sourceId","tenantId","buildingId") REFERENCES "EnergySource"("id","tenantId","buildingId")
    ON DELETE CASCADE ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "EnergyTariff_tenantId_buildingId_sourceId_effectiveFrom_key"
  ON "EnergyTariff"("tenantId","buildingId","sourceId","effectiveFrom");

CREATE TABLE "EnergyExchangeRate" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "buildingId" TEXT NOT NULL,
  "cdfPerUsd" DECIMAL(20,8) NOT NULL CHECK ("cdfPerUsd" > 0 AND "cdfPerUsd" <> 'NaN'::numeric),
  "rateSource" TEXT NOT NULL,
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3) CHECK ("effectiveTo" > "effectiveFrom"),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EnergyExchangeRate_buildingId_tenantId_fkey"
    FOREIGN KEY ("buildingId","tenantId") REFERENCES "Building"("id","tenantId") ON DELETE CASCADE ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "EnergyExchangeRate_tenantId_buildingId_effectiveFrom_key"
  ON "EnergyExchangeRate"("tenantId","buildingId","effectiveFrom");

CREATE TABLE "GeneratorOperatingCost" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL,
  "buildingId" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "periodFrom" TIMESTAMP(3) NOT NULL,
  "periodTo" TIMESTAMP(3) NOT NULL CHECK ("periodTo" > "periodFrom"),
  "currency" "EnergyCurrency" NOT NULL,
  "fuelLitres" DECIMAL(20,6) CHECK ("fuelLitres" >= 0 AND "fuelLitres" <> 'NaN'::numeric),
  "fuelQuality" "MeasurementQuality",
  "fuelPricePerLitre" DECIMAL(20,8) CHECK ("fuelPricePerLitre" >= 0 AND "fuelPricePerLitre" <> 'NaN'::numeric),
  "engineHours" DECIMAL(20,6) CHECK ("engineHours" >= 0 AND "engineHours" <> 'NaN'::numeric),
  "hoursQuality" "MeasurementQuality",
  "maintenanceCostPerHour" DECIMAL(20,8) CHECK ("maintenanceCostPerHour" >= 0 AND "maintenanceCostPerHour" <> 'NaN'::numeric),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GeneratorOperatingCost_fuel_quality_check" CHECK (
    ("fuelLitres" IS NULL AND "fuelQuality" IS NULL) OR
    ("fuelLitres" IS NOT NULL AND "fuelQuality" IS NOT NULL AND "fuelQuality" IN ('MEASURED', 'ESTIMATED'))
  ),
  CONSTRAINT "GeneratorOperatingCost_hours_quality_check" CHECK (
    ("engineHours" IS NULL AND "hoursQuality" IS NULL) OR
    ("engineHours" IS NOT NULL AND "hoursQuality" IS NOT NULL AND "hoursQuality" IN ('MEASURED', 'ESTIMATED'))
  ),
  CONSTRAINT "GeneratorOperatingCost_sourceId_tenantId_buildingId_fkey"
    FOREIGN KEY ("sourceId","tenantId","buildingId") REFERENCES "EnergySource"("id","tenantId","buildingId")
    ON DELETE CASCADE ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "GeneratorOperatingCost_source_period_key"
  ON "GeneratorOperatingCost"("tenantId","buildingId","sourceId","periodFrom");
COMMIT;
