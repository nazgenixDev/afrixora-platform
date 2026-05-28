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
      const totalBuildings = await prisma.building.count();
      const totalTenants = await prisma.tenant.count();
      const totalDevices = await prisma.device.count();
      const onlineDevices = await prisma.device.count({ where: { isOnline: true } });
      const totalAutomations = await prisma.automation.count({ where: { isActive: true } });
      const activeAlerts = await prisma.alert.count({ where: { isRead: false } });
      const criticalAlerts = await prisma.alert.count({ where: { isRead: false, severity: "CRITICAL" } });

      const dailyConsumption = await query(
        `SELECT COALESCE(SUM(CASE WHEN metric = 'energy_kwh' THEN value ELSE 0 END), 0) as total_kwh
         FROM sensor_readings
         WHERE time > NOW() - INTERVAL '24 hours'`
      );
      const weeklyConsumption = await query(
        `SELECT COALESCE(SUM(CASE WHEN metric = 'energy_kwh' THEN value ELSE 0 END), 0) as total_kwh
         FROM sensor_readings
         WHERE time > NOW() - INTERVAL '7 days'`
      );
      const monthlyConsumption = await query(
        `SELECT COALESCE(SUM(CASE WHEN metric = 'energy_kwh' THEN value ELSE 0 END), 0) as total_kwh
         FROM sensor_readings
         WHERE time > NOW() - INTERVAL '30 days'`
      );
      const yearlyConsumption = await query(
        `SELECT COALESCE(SUM(CASE WHEN metric = 'energy_kwh' THEN value ELSE 0 END), 0) as total_kwh
         FROM sensor_readings
         WHERE time > NOW() - INTERVAL '365 days'`
      );

      const currentPower = await query(
        `SELECT COALESCE(AVG(CASE WHEN metric = 'power_w' THEN value ELSE NULL END), 0) as avg_power_w
         FROM sensor_readings
         WHERE time > NOW() - INTERVAL '1 hour'`
      );

      const topBuildings = await query(
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
      );

      // Utiliser uniquement les colonnes disponibles dans Alert (pas de relation building)
      const recentAlerts = await prisma.alert.findMany({
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
      });

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
        topBuildings: topBuildings.rows.map((r: any) => ({
          buildingId: r.building_id,
          buildingName: r.building_name,
          tenantName: r.tenant_name,
          totalKwh: parseFloat(r.total_kwh || "0"),
        })),
        recentAlerts: recentAlerts.map((a: any) => ({
          id: a.id,
          severity: a.severity,
          message: a.message,
          createdAt: a.createdAt,
          buildingId: a.buildingId,
        })),
      });
    } catch (err) {
      return next(err);
    }
  }
);

export default router;
