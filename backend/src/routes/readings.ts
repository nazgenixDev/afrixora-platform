import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import energyService from '../services/energyService';
import authenticate from '../middleware/authenticate';

const router = Router();

const readingsQuerySchema = z.object({
  deviceId: z.string().uuid(),
  from: z.string().datetime(),
  to: z.string().datetime(),
  metric: z.string().min(1)
});

router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = readingsQuerySchema.parse(req.query);
    const result = await energyService.getReadings(
      req.user!.tenantId,
      query.deviceId,
      query.from,
      query.to,
      query.metric
    );
    return res.json(result);
  } catch (err) {
    return next(err);
  }
});

export default router;
