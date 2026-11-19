import { Router, Request, Response, NextFunction } from "express";
import authenticate from "../middleware/authenticate";
import { authorize } from "../middleware/authorize";
import prisma from "../utils/database";
import { query } from "../utils/database";
import { energySamplesSql, energyTimeZone, latestPowerW, totalEnergySql } from "../services/energyQueries";

const dailyStart = `time_bucket(INTERVAL '1 day', NOW(), '${energyTimeZone}')`;
const rollingStart = "NOW() - $1::integer * INTERVAL '1 hour'";

const globalConsumption = (from: string, hourly: boolean, params: number[] = []) =>
  query(
    `WITH ${energySamplesSql(from, "NOW()", hourly, false)}
     SELECT ${totalEnergySql} AS total_kwh FROM samples`,
    params
  );

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
        globalConsumption(dailyStart, false),
        globalConsumption(rollingStart, true, [168]),
        globalConsumption(rollingStart, true, [720]),
        globalConsumption(rollingStart, true, [8760]),
        latestPowerW(),
        query(
          `WITH ${energySamplesSql(rollingStart, "NOW()", true, false)},
           device_totals AS (
             SELECT device_id, tenant_id, SUM(total) AS total_kwh
             FROM samples
             WHERE metric = 'energy_kwh'
             GROUP BY device_id, tenant_id
           )
           SELECT b.id AS building_id, b.name AS building_name, t.name AS tenant_name,
                  SUM(dt.total_kwh) AS total_kwh
           FROM device_totals dt
           JOIN "Device" d ON d.id = dt.device_id::text AND d."tenantId" = dt.tenant_id::text
           JOIN "Building" b ON d."buildingId" = b.id AND d."tenantId" = b."tenantId"
           JOIN "Tenant" t ON b."tenantId" = t.id
           GROUP BY b.id, b.name, t.name
           ORDER BY total_kwh DESC
           LIMIT 5`,
          [168]
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
        total_kwh: number;
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
        currentPower,
        topBuildings: topBuildings.rows.map((r: BuildingConsumptionRow) => ({
          buildingId: r.building_id,
          buildingName: r.building_name,
          tenantName: r.tenant_name,
          totalKwh: r.total_kwh,
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
