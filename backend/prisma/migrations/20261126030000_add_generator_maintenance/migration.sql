BEGIN;

-- CreateEnum
CREATE TYPE "MaintenanceTicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MaintenanceEventType" AS ENUM ('OPENED', 'ASSIGNED', 'STARTED', 'INTERVENTION', 'CANCELLED');

-- CreateTable
CREATE TABLE "MaintenanceHourReading" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "totalHours" DECIMAL(14,3) NOT NULL,
    "recordedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaintenanceHourReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenancePlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "manufacturerReference" TEXT NOT NULL,
    "intervalDays" INTEGER,
    "intervalHours" DECIMAL(10,3),
    "startsAt" TIMESTAMP(3) NOT NULL,
    "initialTotalHours" DECIMAL(14,3),
    "initialReadingId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaintenancePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceTicket" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "responsibleUserId" TEXT NOT NULL,
    "status" "MaintenanceTicketStatus" NOT NULL DEFAULT 'OPEN',
    "description" TEXT NOT NULL,
    "performedAt" TIMESTAMP(3),
    "performedTotalHours" DECIMAL(14,3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaintenanceTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "type" "MaintenanceEventType" NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaintenanceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceHourReading_source_time_key" ON "MaintenanceHourReading"("tenantId", "buildingId", "sourceId", "capturedAt");

-- CreateIndex
CREATE INDEX "MaintenancePlan_tenantId_buildingId_sourceId_idx" ON "MaintenancePlan"("tenantId", "buildingId", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenancePlan_id_tenantId_buildingId_key" ON "MaintenancePlan"("id", "tenantId", "buildingId");

-- CreateIndex
CREATE INDEX "MaintenanceTicket_tenantId_buildingId_planId_performedAt_idx" ON "MaintenanceTicket"("tenantId", "buildingId", "planId", "performedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceTicket_id_tenantId_buildingId_key" ON "MaintenanceTicket"("id", "tenantId", "buildingId");

-- CreateIndex
CREATE INDEX "MaintenanceEvent_tenantId_buildingId_ticketId_createdAt_idx" ON "MaintenanceEvent"("tenantId", "buildingId", "ticketId", "createdAt");

-- AddForeignKey
ALTER TABLE "MaintenanceHourReading" ADD CONSTRAINT "MaintenanceHourReading_sourceId_tenantId_buildingId_fkey" FOREIGN KEY ("sourceId", "tenantId", "buildingId") REFERENCES "EnergySource"("id", "tenantId", "buildingId") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "MaintenancePlan" ADD CONSTRAINT "MaintenancePlan_sourceId_tenantId_buildingId_fkey" FOREIGN KEY ("sourceId", "tenantId", "buildingId") REFERENCES "EnergySource"("id", "tenantId", "buildingId") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "MaintenanceTicket" ADD CONSTRAINT "MaintenanceTicket_planId_tenantId_buildingId_fkey" FOREIGN KEY ("planId", "tenantId", "buildingId") REFERENCES "MaintenancePlan"("id", "tenantId", "buildingId") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "MaintenanceEvent" ADD CONSTRAINT "MaintenanceEvent_ticketId_tenantId_buildingId_fkey" FOREIGN KEY ("ticketId", "tenantId", "buildingId") REFERENCES "MaintenanceTicket"("id", "tenantId", "buildingId") ON DELETE CASCADE ON UPDATE RESTRICT;


-- Les historiques restent append-only au niveau de l’API.
ALTER TABLE "MaintenanceHourReading" ADD CONSTRAINT "MaintenanceHourReading_total_check"
  CHECK ("totalHours" >= 0 AND "totalHours" <> 'NaN'::numeric);
ALTER TABLE "MaintenancePlan" ADD CONSTRAINT "MaintenancePlan_intervals_check"
  CHECK (("intervalDays" IS NOT NULL OR "intervalHours" IS NOT NULL)
    AND ("intervalDays" IS NULL OR "intervalDays" BETWEEN 1 AND 3650)
    AND ("intervalHours" IS NULL OR ("intervalHours" > 0 AND "intervalHours" <> 'NaN'::numeric))
    AND (("intervalHours" IS NULL) = ("initialTotalHours" IS NULL))
    AND (("intervalHours" IS NULL) = ("initialReadingId" IS NULL))
    AND ("initialTotalHours" IS NULL OR ("initialTotalHours" >= 0 AND "initialTotalHours" <> 'NaN'::numeric)));
ALTER TABLE "MaintenanceTicket" ADD CONSTRAINT "MaintenanceTicket_completion_check"
  CHECK ((("status" = 'COMPLETED') = ("performedAt" IS NOT NULL))
    AND ("performedAt" IS NULL OR "performedAt" >= "createdAt")
    AND ("performedTotalHours" IS NULL OR ("performedAt" IS NOT NULL AND "performedTotalHours" >= 0 AND "performedTotalHours" <> 'NaN'::numeric)));
CREATE UNIQUE INDEX "MaintenanceTicket_one_active_per_plan"
  ON "MaintenanceTicket"("tenantId","buildingId","planId") WHERE "status" IN ('OPEN','IN_PROGRESS');
COMMIT;
