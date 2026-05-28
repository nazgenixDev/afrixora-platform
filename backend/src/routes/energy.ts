import { Router } from 'express';
import { z } from 'zod';
import energyService from '../services/energyService';

const router = Router();

router.get('/consumption', (req, res, next) => {
  const { buildingId, period } = req.query as { buildingId: string; period: string };
  energyService.getConsumption(req.user!.tenantId, buildingId, period)
    .then(data => res.json(data))
    .catch(next);
});

router.get('/by-device', (req, res, next) => {
  const { buildingId, period } = req.query as { buildingId: string; period: string };
  energyService.getByDevice(req.user!.tenantId, buildingId, period)
    .then(data => res.json(data))
    .catch(next);
});

router.get('/by-zone', (req, res, next) => {
  const { buildingId, period } = req.query as { buildingId: string; period: string };
  energyService.getByZone(req.user!.tenantId, buildingId, period)
    .then(data => res.json(data))
    .catch(next);
});

router.get('/summary', (req, res, next) => {
  const { buildingId, period } = req.query as { buildingId: string; period: string };
  energyService.getSummary(req.user!.tenantId, buildingId, period)
    .then(data => res.json(data))
    .catch(next);
});

export default router;
