import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { requireActiveBuilding } from '../services/buildingService';
import energyService from '../services/energyService';
import type { EnergyPeriod } from '../services/energyQueries';

const router = Router();
const energyQuery = z.object({
  buildingId: z.guid(),
  period: z.enum(['24h', '7d', '30d', '3m']).default('30d'),
});

function forBuilding(read: (tenantId: string, buildingId: string, period: EnergyPeriod) => Promise<unknown>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { buildingId, period } = energyQuery.parse(req.query);
      const { tenantId } = req.user!;
      await requireActiveBuilding(buildingId, tenantId);
      res.json(await read(tenantId, buildingId, period));
    } catch (error) {
      next(error);
    }
  };
}

router.get('/consumption', forBuilding(energyService.getConsumption));
router.get('/by-device', forBuilding(energyService.getByDevice));
router.get('/by-zone', forBuilding(energyService.getByZone));
router.get('/summary', forBuilding(energyService.getSummary));

export default router;
