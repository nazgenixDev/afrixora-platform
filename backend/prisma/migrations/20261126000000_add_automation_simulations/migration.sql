BEGIN;
ALTER TABLE "Automation" ADD COLUMN "simulationOnly" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "Automation_id_tenantId_buildingId_key"
  ON "Automation"("id", "tenantId", "buildingId");

CREATE TABLE "AutomationExecution" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "buildingId" TEXT NOT NULL,
  "automationId" TEXT NOT NULL,
  "scenarioId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "evaluatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "inputSnapshot" JSONB NOT NULL,
  "decision" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "result" JSONB NOT NULL,
  "action" TEXT,
  "targetLoadId" TEXT,
  CONSTRAINT "AutomationExecution_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AutomationExecution_automationId_tenantId_buildingId_fkey"
    FOREIGN KEY ("automationId", "tenantId", "buildingId")
    REFERENCES "Automation"("id", "tenantId", "buildingId") ON DELETE CASCADE ON UPDATE RESTRICT,
  CONSTRAINT "AutomationExecution_simulated_action_check"
    CHECK (("action" IS NULL AND "targetLoadId" IS NULL) OR
      ("action" IS NOT NULL AND "action" IN ('SHED', 'RESTORE') AND "targetLoadId" IS NOT NULL))
);

CREATE UNIQUE INDEX "AutomationExecution_automationId_scenarioId_requestId_key"
  ON "AutomationExecution"("automationId", "scenarioId", "requestId");
CREATE UNIQUE INDEX "AutomationExecution_automationId_scenarioId_evaluatedAt_key"
  ON "AutomationExecution"("automationId", "scenarioId", "evaluatedAt");
CREATE INDEX "AutomationExecution_site_rule_time_idx"
  ON "AutomationExecution"("tenantId", "buildingId", "automationId", "evaluatedAt" DESC);
COMMIT;
