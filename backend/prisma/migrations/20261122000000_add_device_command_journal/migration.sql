BEGIN;

CREATE TYPE "DeviceCommandStatus" AS ENUM ('PENDING', 'SENT', 'ACKNOWLEDGED', 'CONFIRMED', 'FAILED', 'EXPIRED', 'REJECTED');

CREATE TABLE "DeviceCommand" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "buildingId" TEXT NOT NULL,
  "deviceId" TEXT NOT NULL,
  "command" TEXT NOT NULL,
  "params" JSONB NOT NULL DEFAULT '{}',
  "origin" TEXT NOT NULL DEFAULT 'MANUAL',
  "requestedByUserId" TEXT,
  "status" "DeviceCommandStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "sentAt" TIMESTAMP(3),
  "acknowledgedAt" TIMESTAMP(3),
  "confirmedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "observedState" JSONB,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeviceCommand_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DeviceCommand_deviceId_tenantId_buildingId_fkey"
    FOREIGN KEY ("deviceId", "tenantId", "buildingId") REFERENCES "Device" ("id", "tenantId", "buildingId")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "DeviceCommand_tenantId_deviceId_createdAt_idx"
  ON "DeviceCommand" ("tenantId", "deviceId", "createdAt" DESC);
CREATE INDEX "DeviceCommand_status_expiresAt_idx"
  ON "DeviceCommand" ("status", "expiresAt");

-- Sérialise les demandes manuelles et automatiques qui ciblent le même appareil.
CREATE UNIQUE INDEX "DeviceCommand_active_device_key" ON "DeviceCommand" ("deviceId")
  WHERE "status" IN ('PENDING', 'SENT', 'ACKNOWLEDGED');

COMMIT;
