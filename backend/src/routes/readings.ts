import { Router } from 'express';
import { z } from 'zod';
import energyService from '../services/energyService';

const router = Router();

const readingsQuerySchema = z.object({
  deviceId: z.string(),
  from: z.string(),
  to: z.string(),
  metric: z.string()
});

router.get('/', (req, res, next) => {
  const query = readingsQuerySchema.parse(req.query);
  energyService.getReadings(req.user!.tenantId, query.deviceId, query.from, query.to, query.metric)
    .then(readings => res.json(readings))
    .catch(next);
});

export default router;
