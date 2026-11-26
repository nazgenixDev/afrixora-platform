BEGIN;

-- CreateEnum
CREATE TYPE "FuelEngineState" AS ENUM ('RUNNING', 'STOPPED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "FuelAssessmentStatus" AS ENUM ('WITHIN_RANGE', 'LOSS_TO_REVIEW', 'SURPLUS_TO_REVIEW');

-- AlterEnum
ALTER TYPE "AlertType" ADD VALUE 'FUEL_DISCREPANCY';

-- CreateTable
CREATE TABLE "FuelTank" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "probeDeviceId" TEXT NOT NULL,
    "productionPointId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FuelTank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FuelCalibration" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "tankId" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "profile" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FuelCalibration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FuelLevelReading" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "tankId" TEXT NOT NULL,
    "calibrationId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "levelMm" DECIMAL(12,3) NOT NULL,
    "temperatureC" DECIMAL(6,3),
    "quality" "MeasurementQuality" NOT NULL,
    "intervalState" "FuelEngineState" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FuelLevelReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FuelDelivery" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "tankId" TEXT NOT NULL,
    "deliveredAt" TIMESTAMP(3) NOT NULL,
    "litresAt20C" DECIMAL(12,3) NOT NULL,
    "uncertaintyLitres" DECIMAL(12,3) NOT NULL,
    "reference" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FuelDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FuelAssessment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "tankId" TEXT NOT NULL,
    "periodFrom" TIMESTAMP(3) NOT NULL,
    "periodTo" TIMESTAMP(3) NOT NULL,
    "status" "FuelAssessmentStatus" NOT NULL,
    "alertId" TEXT,
    "evidence" JSONB NOT NULL,
    "evidenceHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FuelAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FuelTank_id_tenantId_buildingId_key" ON "FuelTank"("id", "tenantId", "buildingId");

-- CreateIndex
CREATE UNIQUE INDEX "FuelTank_tenantId_buildingId_sourceId_key" ON "FuelTank"("tenantId", "buildingId", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "FuelTank_probeDeviceId_tenantId_buildingId_key" ON "FuelTank"("probeDeviceId", "tenantId", "buildingId");

-- CreateIndex
CREATE UNIQUE INDEX "FuelCalibration_id_tenantId_buildingId_tankId_key" ON "FuelCalibration"("id", "tenantId", "buildingId", "tankId");

-- CreateIndex
CREATE UNIQUE INDEX "FuelCalibration_tenantId_buildingId_tankId_effectiveFrom_key" ON "FuelCalibration"("tenantId", "buildingId", "tankId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "FuelLevelReading_tenantId_buildingId_tankId_capturedAt_key" ON "FuelLevelReading"("tenantId", "buildingId", "tankId", "capturedAt");

-- CreateIndex
CREATE INDEX "FuelDelivery_tenantId_buildingId_tankId_deliveredAt_idx" ON "FuelDelivery"("tenantId", "buildingId", "tankId", "deliveredAt");

-- CreateIndex
CREATE UNIQUE INDEX "FuelDelivery_tenantId_buildingId_tankId_reference_key" ON "FuelDelivery"("tenantId", "buildingId", "tankId", "reference");

-- CreateIndex
CREATE INDEX "FuelAssessment_alertId_tenantId_buildingId_idx" ON "FuelAssessment"("alertId", "tenantId", "buildingId");

-- CreateIndex
CREATE UNIQUE INDEX "FuelAssessment_window_evidence_key" ON "FuelAssessment"("tenantId", "buildingId", "tankId", "periodFrom", "periodTo", "evidenceHash");

-- CreateIndex
CREATE UNIQUE INDEX "MeteringPoint_id_tenantId_buildingId_key" ON "MeteringPoint"("id", "tenantId", "buildingId");

-- CreateIndex
CREATE UNIQUE INDEX "Alert_id_tenantId_buildingId_key" ON "Alert"("id", "tenantId", "buildingId");

-- AddForeignKey
ALTER TABLE "FuelTank" ADD CONSTRAINT "FuelTank_sourceId_tenantId_buildingId_fkey" FOREIGN KEY ("sourceId", "tenantId", "buildingId") REFERENCES "EnergySource"("id", "tenantId", "buildingId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "FuelTank" ADD CONSTRAINT "FuelTank_probeDeviceId_tenantId_buildingId_fkey" FOREIGN KEY ("probeDeviceId", "tenantId", "buildingId") REFERENCES "Device"("id", "tenantId", "buildingId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "FuelTank" ADD CONSTRAINT "FuelTank_productionPointId_tenantId_buildingId_fkey" FOREIGN KEY ("productionPointId", "tenantId", "buildingId") REFERENCES "MeteringPoint"("id", "tenantId", "buildingId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "FuelCalibration" ADD CONSTRAINT "FuelCalibration_tankId_tenantId_buildingId_fkey" FOREIGN KEY ("tankId", "tenantId", "buildingId") REFERENCES "FuelTank"("id", "tenantId", "buildingId") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "FuelLevelReading" ADD CONSTRAINT "FuelLevelReading_calibrationId_tenantId_buildingId_tankId_fkey" FOREIGN KEY ("calibrationId", "tenantId", "buildingId", "tankId") REFERENCES "FuelCalibration"("id", "tenantId", "buildingId", "tankId") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "FuelDelivery" ADD CONSTRAINT "FuelDelivery_tankId_tenantId_buildingId_fkey" FOREIGN KEY ("tankId", "tenantId", "buildingId") REFERENCES "FuelTank"("id", "tenantId", "buildingId") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "FuelAssessment" ADD CONSTRAINT "FuelAssessment_tankId_tenantId_buildingId_fkey" FOREIGN KEY ("tankId", "tenantId", "buildingId") REFERENCES "FuelTank"("id", "tenantId", "buildingId") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "FuelAssessment" ADD CONSTRAINT "FuelAssessment_alertId_tenantId_buildingId_fkey" FOREIGN KEY ("alertId", "tenantId", "buildingId") REFERENCES "Alert"("id", "tenantId", "buildingId") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Contrôles des valeurs brutes indépendants de l’API.
ALTER TABLE "FuelLevelReading" ADD CONSTRAINT "FuelLevelReading_values_check"
  CHECK ("levelMm" >= 0 AND "levelMm" <> 'NaN'::numeric AND "temperatureC" BETWEEN -50 AND 100
    AND "quality" IN ('MEASURED', 'ESTIMATED', 'INVALID'));
ALTER TABLE "FuelDelivery" ADD CONSTRAINT "FuelDelivery_volumes_check"
  CHECK ("litresAt20C" > 0 AND "litresAt20C" <> 'NaN'::numeric
    AND "uncertaintyLitres" BETWEEN 0 AND "litresAt20C");
ALTER TABLE "FuelAssessment" ADD CONSTRAINT "FuelAssessment_period_check"
  CHECK ("periodTo" > "periodFrom" AND "periodTo" - "periodFrom" <= INTERVAL '24 hours');
COMMIT;
