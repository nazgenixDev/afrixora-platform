import { Router, Request, Response, NextFunction } from "express";
import authenticate from "../middleware/authenticate";
import { authorize } from "../middleware/authorize";
import prisma from "../utils/database";
import { query } from "../utils/database";

const router = Router();

router.get(
  "/summary",
  authenticate,
  authorize(["SUPER_ADMIN"]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const [
        totalBuildings,
        totalTenants,
        totalDevices,
        onlineDevices,
        totalAutomations,
        activeAlerts,
        criticalAlerts,
        dailyConsumption,
        weeklyConsumption,
        monthlyConsumption,
        yearlyConsumption,
        currentPower,
        topBuildings,
        recentAlerts,
      ] = await Promise.all([
        prisma.building.count(),
        prisma.tenant.count(),
        prisma.device.count(),
        prisma.device.count({ where: { isOnline: true } }),
        prisma.automation.count({ where: { isActive: true } }),
        prisma.alert.count({ where: { isRead: false } }),
        prisma.alert.count({ where: { isRead: false, severity: "CRITICAL" } }),
        query(
          `SELECT COALESCE(SUM(CASE WHEN metric = 'energy_kwh' THEN value ELSE 0 END), 0) as total_kwh
           FROM sensor_readings
           WHERE time > NOW() - INTERVAL '24 hours'`
        ),
        query(
          `SELECT COALESCE(SUM(CASE WHEN metric = 'energy_kwh' THEN value ELSE 0 END), 0) as total_kwh
           FROM sensor_readings
           WHERE time > NOW() - INTERVAL '7 days'`
        ),
        query(
          `SELECT COALESCE(SUM(CASE WHEN metric = 'energy_kwh' THEN value ELSE 0 END), 0) as total_kwh
           FROM sensor_readings
           WHERE time > NOW() - INTERVAL '30 days'`
        ),
        query(
          `SELECT COALESCE(SUM(CASE WHEN metric = 'energy_kwh' THEN value ELSE 0 END), 0) as total_kwh
           FROM sensor_readings
           WHERE time > NOW() - INTERVAL '365 days'`
        ),
        query(
          `SELECT COALESCE(AVG(CASE WHEN metric = 'power_w' THEN value ELSE NULL END), 0) as avg_power_w
           FROM sensor_readings
           WHERE time > NOW() - INTERVAL '1 hour'`
        ),
        query(
          `SELECT d."buildingId" as building_id, b.name as building_name, t.name as tenant_name,
                  COALESCE(SUM(CASE WHEN sr.metric = 'energy_kwh' THEN sr.value ELSE 0 END), 0) as total_kwh
           FROM sensor_readings sr
           JOIN "Device" d ON sr.device_id = d.id::uuid
           JOIN "Building" b ON d."buildingId" = b.id
           JOIN "Tenant" t ON b."tenantId" = t.id
           WHERE sr.time > NOW() - INTERVAL '7 days'
           GROUP BY d."buildingId", b.name, t.name
           ORDER BY total_kwh DESC
           LIMIT 5`
        ),
        prisma.alert.findMany({
          where: { isRead: false },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            id: true,
            severity: true,
            message: true,
            createdAt: true,
            buildingId: true,
          },
        }),
      ]);

      interface BuildingConsumptionRow {
        building_id: string;
        building_name: string;
        tenant_name: string;
        total_kwh: string;
      }

      return res.json({
        kpis: {
          totalTenants,
          totalBuildings,
          totalDevices,
          onlineDevices,
          totalAutomations,
          activeAlerts,
          criticalAlerts,
        },
        consumption: {
          daily: parseFloat(dailyConsumption.rows[0]?.total_kwh || "0"),
          weekly: parseFloat(weeklyConsumption.rows[0]?.total_kwh || "0"),
          monthly: parseFloat(monthlyConsumption.rows[0]?.total_kwh || "0"),
          yearly: parseFloat(yearlyConsumption.rows[0]?.total_kwh || "0"),
        },
        currentPower: parseFloat(currentPower.rows[0]?.avg_power_w || "0"),
        topBuildings: topBuildings.rows.map((r: BuildingConsumptionRow) => ({
          buildingId: r.building_id,
          buildingName: r.building_name,
          tenantName: r.tenant_name,
          totalKwh: parseFloat(r.total_kwh || "0"),
        })),
        recentAlerts: recentAlerts.map((alert: typeof recentAlerts[number]) => ({
          id: alert.id,
          severity: alert.severity,
          message: alert.message,
          createdAt: alert.createdAt,
          buildingId: alert.buildingId,
        })),
      });
    } catch (err) {
      return next(err);
    }
  }
);

export default router;
