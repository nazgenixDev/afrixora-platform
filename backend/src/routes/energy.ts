import { Router, Request, Response, NextFunction } from 'express';
import energyService from '../services/energyService';

const router = Router();

router.get('/consumption', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { buildingId, period } = req.query as { buildingId: string; period: string };
    const data = await energyService.getConsumption(req.user!.tenantId, buildingId, period);
    return res.json(data);
  } catch (err) {
    next(err); return;
  }
});

router.get('/by-device', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { buildingId, period } = req.query as { buildingId: string; period: string };
    const data = await energyService.getByDevice(req.user!.tenantId, buildingId, period);
    return res.json(data);
  } catch (err) {
    next(err); return;
  }
});

router.get('/by-zone', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { buildingId, period } = req.query as { buildingId: string; period: string };
    const data = await energyService.getByZone(req.user!.tenantId, buildingId, period);
    return res.json(data);
  } catch (err) {
    next(err); return;
  }
});

router.get('/summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { buildingId, period } = req.query as { buildingId: string; period: string };
    const data = await energyService.getSummary(req.user!.tenantId, buildingId, period);
    return res.json(data);
  } catch (err) {
    next(err); return;
  }
});

export default router;