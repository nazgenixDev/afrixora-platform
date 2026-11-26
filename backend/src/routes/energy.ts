import { Router, type Request, type Response, type NextFunction } from 'express';
import energyFinance from './energyFinance';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate';
import { buildingTimeZone } from '../utils/buildingTimeZone';
import { dateRangeFields, validDateRange } from '../utils/querySchemas';
import { getMeteredReadings } from '../services/meteredEnergyService';
import { requireActiveBuilding } from '../services/buildingService';
import energyService from '../services/energyService';
import type { EnergyPeriod } from '../services/energyQueries';

const router = Router();
router.use('/finance', energyFinance);
const energyQuery = z.object({
  buildingId: z.guid(),
  period: z.enum(['24h', '7d', '30d', '3m']).default('30d'),
});

function forBuilding(read: (tenantId: string, buildingId: string, period: EnergyPeriod, timeZone: string) => Promise<unknown>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { buildingId, period } = energyQuery.parse(req.query);
      const { tenantId } = req.user!;
      const building = await requireActiveBuilding(buildingId, tenantId);
      res.json(await read(tenantId, buildingId, period, buildingTimeZone(building) ?? 'UTC'));
    } catch (error) {
      next(error);
    }
  };
}

router.get('/consumption', forBuilding(energyService.getConsumption));
router.get('/by-device', forBuilding(energyService.getByDevice));
router.get('/by-zone', forBuilding(energyService.getByZone));
router.get('/summary', forBuilding(energyService.getSummary));

const meteredQuery = z.strictObject({
  buildingId: z.guid(),
  meteringPointId: z.guid(),
  ...dateRangeFields,
  buildingTotal: z.enum(['true', 'false']).default('false').transform(value => value === 'true'),
}).refine(range => validDateRange(range) && range.to > range.from,
  { path: ['to'], message: 'La fin doit suivre le début et la période être limitée à 93 jours.' });

router.get('/metered', authenticate, async (req, res, next) => {
  try {
    res.json(await getMeteredReadings(req.user!, meteredQuery.parse(req.query)));
  } catch (error) {
    next(error);
  }
});

export default router;
