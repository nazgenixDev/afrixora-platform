BEGIN;
ALTER TABLE "EnergySource" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "EnergyBus" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "SourceFeed" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "DistributionBoard" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "Circuit" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "ElectricalLoad" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "MeteringPoint" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "ControlEndpoint" ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "User_id_tenantId_key" ON "User" ("id", "tenantId");
CREATE TABLE "BuildingAccess" (
  "tenantId" TEXT NOT NULL,
  "buildingId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  PRIMARY KEY ("tenantId", "buildingId", "userId"),
  FOREIGN KEY ("buildingId","tenantId") REFERENCES "Building" ("id","tenantId") ON DELETE CASCADE ON UPDATE RESTRICT,
  FOREIGN KEY ("userId","tenantId") REFERENCES "User" ("id","tenantId") ON DELETE CASCADE ON UPDATE RESTRICT
);
CREATE INDEX "BuildingAccess_userId_tenantId_idx" ON "BuildingAccess" ("userId","tenantId");
COMMIT;
