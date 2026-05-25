import { Router } from 'express';
import { z } from 'zod';
import deviceService from '../services/deviceService';
import authenticate from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { DeviceType, Protocol } from '@prisma/client';

const router = Router();

// Zod schemas for validation
export const createDeviceSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Device name is required'),
    buildingId: z.string().uuid('Invalid building ID'),
    zoneId: z.string().uuid('Invalid zone ID').optional(),
    type: z.enum([
      DeviceType.LIGHT,
      DeviceType.PLUG,
      DeviceType.SENSOR,
      DeviceType.THERMOSTAT,
      DeviceType.ENERGY_METER,
      DeviceType.DOOR_SENSOR
    ], {
      errorMap: () => ({ message: 'Invalid device type' })
    }),
    protocol: z.enum([
      Protocol.MQTT,
      Protocol.ZIGBEE,
      Protocol.WIFI
    ], {
      errorMap: () => ({ message: 'Invalid protocol' })
    }).default(Protocol.MQTT),
    macAddress: z.string().optional(),
    config: z.record(z.any()).optional(),
    metadata: z.record(z.any()).optional(),
  })
});

export const updateDeviceSchema = z.object({
  body: createDeviceSchema.shape.body.partial()
});

export const controlSchema = z.object({
  body: z.object({
    command: z.string().min(1, 'Command is required'),
    params: z.record(z.any()).default({})
  })
});

// Routes
// GET /api/v1/devices - List all devices with optional filters
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { buildingId, zoneId, type } = req.query;
    const filters: any = {};
    
    if (buildingId) filters.buildingId = buildingId as string;
    if (zoneId) filters.zoneId = zoneId as string;
    if (type) filters.type = type as DeviceType;
    
    const devices = await deviceService.findAll(req.user!.tenantId, filters);
    res.json(devices);
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/devices - Create a new device
router.post(
  '/',
  authenticate,
  authorize(['SUPER_ADMIN', 'TENANT_ADMIN', 'BUILDING_ADMIN']),
  validate(createDeviceSchema),
  async (req, res, next) => {
    try {
      const device = await deviceService.create(req.body, req.user!.tenantId);
      res.status(201).json(device);
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/v1/devices/:id - Get a device by ID
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const device = await deviceService.findById(req.params.id, req.user!.tenantId);
    res.json(device);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/v1/devices/:id - Update a device
router.patch(
  '/:id',
  authenticate,
  authorize(['SUPER_ADMIN', 'TENANT_ADMIN', 'BUILDING_ADMIN']),
  validate(updateDeviceSchema),
  async (req, res, next) => {
    try {
      const device = await deviceService.update(
        req.params.id,
        req.body,
        req.user!.tenantId
      );
      res.json(device);
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/v1/devices/:id - Delete a device
router.delete(
  '/:id',
  authenticate,
  authorize(['SUPER_ADMIN', 'TENANT_ADMIN', 'BUILDING_ADMIN']),
  async (req, res, next) => {
    try {
      await deviceService.remove(req.params.id, req.user!.tenantId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/v1/devices/:id/control - Control a device
router.post(
  '/:id/control',
  authenticate,
  authorize(['SUPER_ADMIN', 'TENANT_ADMIN', 'BUILDING_ADMIN', 'OPERATOR']),
  validate(controlSchema),
  async (req, res, next) => {
    try {
      const result = await deviceService.control(
        req.params.id,
        req.user!.tenantId,
        req.body
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/v1/devices/:id/history - Get device state history
router.get(
  '/:id/history',
  authenticate,
  async (req, res, next) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
      const history = await deviceService.getHistory(
        req.params.id,
        req.user!.tenantId,
        limit
      );
      res.json(history);
    } catch (error) {
      next(error);
    }
  }
);

export default router;