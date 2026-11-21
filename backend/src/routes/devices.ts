import { Router, Request, Response, NextFunction } from 'express';
import deviceService from '../services/deviceService';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { checkDeviceLimit } from '../middleware/checkLimits';
import { validate } from '../middleware/validate';
import { DeviceType } from '@prisma/client';
import { z } from 'zod';

const router = Router();

const deviceQuerySchema = z.object({
  query: z.object({
    buildingId: z.string().uuid().optional(),
    zoneId: z.string().uuid().optional(),
    type: z.nativeEnum(DeviceType).optional(),
    isOnline: z.enum(['true', 'false']).transform(val => val === 'true').optional(),
    search: z.string().max(100).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  }),
});

const createDeviceSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100),
    type: z.nativeEnum(DeviceType),
    buildingId: z.string().uuid(),
    zoneId: z.string().uuid().optional(),
    protocol: z.enum(['MQTT', 'ZIGBEE', 'WIFI']).default('MQTT'),
  }).strict(),
});

const updateDeviceSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100).optional(),
    zoneId: z.string().uuid().optional().nullable(),
    config: z.record(z.unknown()).optional(),
  }).strict(),
});

const controlDeviceSchema = z.object({
  body: z.object({
    command: z.string().min(1),
    params: z.record(z.unknown()).optional(),
  }),
});

router.get(
  '/',
  authenticate,
  validate(deviceQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, limit, ...filters }: z.infer<typeof deviceQuerySchema>['query'] = res.locals.validatedQuery;
      const devices = await deviceService.findAll(req.user!.tenantId, filters, { page, limit });
      return res.json(devices);
    } catch (error) {
      return next(error);
    }
  }
);

router.post(
  '/',
  authenticate,
  authorize(['SUPER_ADMIN', 'TENANT_ADMIN', 'BUILDING_ADMIN', 'OPERATOR']),
  checkDeviceLimit,
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