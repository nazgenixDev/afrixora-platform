import { Router } from 'express';
import { z } from 'zod';
import { deviceService } from '../services/deviceService';
import { authorize } from '../middleware/authorize';

const router = Router();

const createDeviceSchema = z.object({
  name: z.string(),
  type: z.enum(['LIGHT','PLUG','SENSOR','THERMOSTAT','ENERGY_METER','DOOR_SENSOR']),
  buildingId: z.string(),
  zoneId: z.string().optional(),
  protocol: z.enum(['MQTT','ZIGBEE','WIFI']).optional(),
  config: z.any().optional()
});

const controlSchema = z.object({
  command: z.string(),
  params: z.any().optional()
});

// GET / — lister les appareils
router.get('/', (req, res, next) => {
  deviceService.findAll(req.user!.tenantId, req.query as any)
    .then(devices => res.json(devices))
    .catch(next);
});

// POST / — créer un appareil
router.post('/', authorize(['SUPER_ADMIN', 'TENANT_ADMIN', 'BUILDING_ADMIN', 'OPERATOR']), (req, res, next) => {
  const data = createDeviceSchema.parse(req.body);
  deviceService.create(data, req.user!.tenantId)
    .then(device => res.status(201).json(device))
    .catch(next);
});

// GET /:id — détail
router.get('/:id', (req, res, next) => {
  deviceService.findById(req.params.id, req.user!.tenantId)
    .then(device => res.json(device))
    .catch(next);
});

// PATCH /:id — modifier
router.patch('/:id', authorize(['SUPER_ADMIN', 'TENANT_ADMIN', 'BUILDING_ADMIN', 'OPERATOR']), (req, res, next) => {
  deviceService.update(req.params.id, req.body, req.user!.tenantId)
    .then(device => res.json(device))
    .catch(next);
});

// DELETE /:id — supprimer
router.delete('/:id', authorize(['SUPER_ADMIN', 'TENANT_ADMIN', 'BUILDING_ADMIN', 'OPERATOR']), (req, res, next) => {
  deviceService.remove(req.params.id, req.user!.tenantId)
    .then(() => res.status(204).send())
    .catch(next);
});

// POST /:id/control — contrôler un appareil
router.post('/:id/control', authorize(['SUPER_ADMIN', 'TENANT_ADMIN', 'BUILDING_ADMIN', 'OPERATOR']), (req, res, next) => {
  const body = controlSchema.parse(req.body);
  deviceService.control(req.params.id, req.user!.tenantId, body)
    .then(result => res.json(result))
    .catch(next);
});

// GET /:id/history — historique des états
router.get('/:id/history', (req, res, next) => {
  deviceService.getHistory(req.params.id, req.user!.tenantId, parseInt(req.query.limit as string) || 10)
    .then(history => res.json(history))
    .catch(next);
});

export default router;
