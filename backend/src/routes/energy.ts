import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import energyService from '../services/energyService';
import authenticate from '../middleware/authenticate';

const router = Router();

const consumptionQuerySchema = z.object({
  buildingId: z.string().uuid(),
  period: z.enum(['24h', '7d', '30d'])
});

const summaryQuerySchema = z.object({
  buildingId: z.string().uuid(),
  period: z.enum(['24h', '7d', '30d'])
});

router.get('/consumption', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = consumptionQuerySchema.parse(req.query);
    const result = await energyService.getConsumption(req.user!.tenantId, query.buildingId, query.period);
    return res.json(result);
  } catch (err) {
    return next(err);
  }
});

router.get('/by-device', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = consumptionQuerySchema.parse(req.query);
    const result = await energyService.getByDevice(req.user!.tenantId, query.buildingId, query.period);
    return res.json(result);
  } catch (err) {
    return next(err);
  }
});

router.get('/by-zone', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = consumptionQuerySchema.parse(req.query);
    const result = await energyService.getByZone(req.user!.tenantId, query.buildingId, query.period);
    return res.json(result);
  } catch (err) {
    return next(err);
  }
});

router.get('/summary', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = summaryQuerySchema.parse(req.query);
    const result = await energyService.getSummary(req.user!.tenantId, query.buildingId, query.period);
    return res.json(result);
  } catch (err) {
    return next(err);
  }
});

export default router;
