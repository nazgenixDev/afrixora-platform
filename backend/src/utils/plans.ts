export type PlanLimits = {
  maxDevices: number;
  maxAutomations: number;
  hasApi: boolean;
  hasExport: boolean;
  sla: string;
};

export const PLAN_LIMITS: Record<string, PlanLimits> = {
  BASIC: { maxDevices: 10, maxAutomations: 5, hasApi: false, hasExport: false, sla: "standard" },
  PRO: { maxDevices: 50, maxAutomations: 20, hasApi: true, hasExport: true, sla: "prioritaire" },
  BUSINESS: { maxDevices: 200, maxAutomations: Infinity, hasApi: true, hasExport: true, sla: "99.5%" },
  ENTERPRISE: { maxDevices: Infinity, maxAutomations: Infinity, hasApi: true, hasExport: true, sla: "contractuel" },
};

export function getPlanLimits(plan: string): PlanLimits {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.BASIC;
}
