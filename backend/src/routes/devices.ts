import { Router, Request, Response, NextFunction } from 'express';
import deviceService from '../services/deviceService';
import { authorizeBuildingAdmin, authorizeOperator } from '../middleware/authorize';
import { checkDeviceLimit } from '../middleware/checkLimits';
import { validate } from '../middleware/validate';
import { DeviceType } from '@prisma/client';
import { z } from 'zod';
import { limitSchema, pageSchema } from '../utils/querySchemas';
import { deviceCommandSchema } from '../utils/deviceCommands';

const router = Router();

const deviceQuerySchema = z.object({
  query: z.object({
    buildingId: z.guid().optional(),
    zoneId: z.guid().optional(),
    type: z.nativeEnum(DeviceType).optional(),
    isOnline: z.enum(['true', 'false']).transform(val => val === 'true').optional(),
    search: z.string().max(100).optional(),
    page: pageSchema,
    limit: limitSchema.default(50),
  }),
});

const createDeviceSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100),
    type: z.nativeEnum(DeviceType),
    buildingId: z.guid(),
    zoneId: z.guid().optional(),
    protocol: z.enum(['MQTT', 'ZIGBEE', 'WIFI']).default('MQTT'),
  }).strict(),
});

const updateDeviceSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100).optional(),
    zoneId: z.guid().optional().nullable(),
    config: z.record(z.string(), z.unknown()).optional(),
  }).strict(),
});

const controlDeviceSchema = z.object({ body: deviceCommandSchema });
const deviceId = z.guid();
const historyQuerySchema = z.object({ limit: limitSchema.default(100) });

router.get(
  '/',
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
  authorizeBuildingAdmin,
  validate(createDeviceSchema),
  checkDeviceLimit,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const device = await deviceService.create(res.locals.validatedBody, req.user!.tenantId);
      return res.status(201).json(device);
    } catch (error) {
      return next(error);
    }
  }
);

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const device = await deviceService.findById(deviceId.parse(req.params.id), req.user!.tenantId);
    return res.json(device);
  } catch (error) {
    return next(error);
  }
});

router.patch(
  '/:id',
  authorizeBuildingAdmin,
  validate(updateDeviceSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const device = await deviceService.update(deviceId.parse(req.params.id), res.locals.validatedBody, req.user!.tenantId);
      return res.json(device);
    } catch (error) {
      return next(error);
    }
  }
);

router.delete(
  '/:id',
  authorizeBuildingAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await deviceService.remove(deviceId.parse(req.params.id), req.user!.tenantId);
      return res.status(204).send();
    } catch (error) {
      return next(error);
    }
  }
);

router.post(
  '/:id/control',
  authorizeOperator,
  validate(controlDeviceSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { tenantId, userId } = req.user!;
      const result = await deviceService.control(deviceId.parse(req.params.id), res.locals.validatedBody, tenantId,
        { requestedByUserId: userId });
      return res.status(202).json(result);
    } catch (error) {
      return next(error);
    }
  }
);

router.get('/:id/commands/:commandId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await deviceService.getCommand(
      deviceId.parse(req.params.id), z.uuid().parse(req.params.commandId), req.user!.tenantId,
    );
    return res.set('Cache-Control', 'no-store').json(result);
  } catch (error) {
    return next(error);
  }
});

router.get('/:id/history', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { limit } = historyQuerySchema.parse(req.query);
    const history = await deviceService.getHistory(deviceId.parse(req.params.id), req.user!.tenantId, limit);
    return res.json(history);
  } catch (error) {
    return next(error);
  }
});

export default router;
