import { Router, Request, Response, NextFunction } from 'express';
import deviceService from '../services/deviceService';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { z } from 'zod';

const router = Router();

const createDeviceSchema = z.object({
  body: z.object({
    name: z.string(),
    type: z.enum(['LIGHT', 'PLUG', 'SENSOR', 'THERMOSTAT', 'ENERGY_METER', 'DOOR_SENSOR']),
    buildingId: z.string(),
    zoneId: z.string().optional(),
    protocol: z.enum(['MQTT', 'ZIGBEE', 'WIFI']).default('MQTT'),
  }),
});

const updateDeviceSchema = z.object({
  body: z.object({
    name: z.string().optional(),
    zoneId: z.string().optional(),
    config: z.record(z.any()).optional(),
  }),
});

const controlDeviceSchema = z.object({
  body: z.object({
    command: z.string(),
    params: z.record(z.any()).optional(),
  }),
});

router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const devices = await deviceService.findAll(req.user!.tenantId, req.query);
    return res.json(devices);
  } catch (error) {
    return next(error);
  }
});

router.post(
  '/',
  authenticate,
  authorize(['SUPER_ADMIN', 'TENANT_ADMIN', 'BUILDING_ADMIN', 'OPERATOR']),
  validate(createDeviceSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const device = await deviceService.create(req.body, req.user!.tenantId);
      return res.status(201).json(device);
    } catch (error) {
      return next(error);
    }
  }
);

router.get('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const device = await deviceService.findById(req.params.id, req.user!.tenantId);
    if (!device) return res.status(404).json({ error: 'Device not found' });
    return res.json(device);
  } catch (error) {
    return next(error);
  }
});

router.patch(
  '/:id',
  authenticate,
  authorize(['SUPER_ADMIN', 'TENANT_ADMIN', 'BUILDING_ADMIN', 'OPERATOR']),
  validate(updateDeviceSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const device = await deviceService.update(req.params.id, req.body, req.user!.tenantId);
      return res.json(device);
    } catch (error) {
      return next(error);
    }
  }
);

router.delete(
  '/:id',
  authenticate,
  authorize(['SUPER_ADMIN', 'TENANT_ADMIN', 'BUILDING_ADMIN', 'OPERATOR']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await deviceService.remove(req.params.id, req.user!.tenantId);
      return res.status(204).send();
    } catch (error) {
      return next(error);
    }
  }
);

router.post(
  '/:id/control',
  authenticate,
  authorize(['SUPER_ADMIN', 'TENANT_ADMIN', 'BUILDING_ADMIN', 'OPERATOR']),
  validate(controlDeviceSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await deviceService.control(req.params.id, { command: req.body.command, params: req.body.params }, req.user!.tenantId);
      return res.json(result);
    } catch (error) {
      return next(error);
    }
  }
);

router.get('/:id/history', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
    const history = await deviceService.getHistory(req.params.id, req.user!.tenantId, limit);
    return res.json(history);
  } catch (error) {
    return next(error);
  }
});

export default router;
