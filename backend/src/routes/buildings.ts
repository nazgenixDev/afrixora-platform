import { Router } from 'express';
import { z } from 'zod';
import { buildingService } from '../services/buildingService';
import authenticate from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';

const router = Router();

const createBuildingSchema = z.object({
  name: z.string().min(1),
  address: z.string().min(1),
  city: z.string().optional(),
  unitsCount: z.number().int().optional()
});

const updateBuildingSchema = createBuildingSchema.partial();

const createZoneSchema = z.object({
  name: z.string().min(1),
  floor: z.number().int().optional(),
  type: z.enum(['FLOOR','APARTMENT','ROOM','CORRIDOR','COMMON_AREA','PARKING']).optional()
});

router.get('/', authenticate, (req, res, next) => {
  buildingService.findAll(req.user!.tenantId)
    .then(buildings => res.json(buildings))
    .catch(next);
});

router.post('/', authenticate, authorize(['SUPER_ADMIN', 'TENANT_ADMIN', 'BUILDING_ADMIN']), (req, res, next) => {
  const data = createBuildingSchema.parse(req.body);
  buildingService.create(data, req.user!.tenantId)
    .then(building => res.status(201).json(building))
    .catch(next);
});

router.get('/:id', authenticate, (req, res, next) => {
  buildingService.findById(req.params.id, req.user!.tenantId)
    .then(building => res.json(building))
    .catch(next);
});

router.patch('/:id', authenticate, authorize(['SUPER_ADMIN', 'TENANT_ADMIN', 'BUILDING_ADMIN']), (req, res, next) => {
  const data = updateBuildingSchema.parse(req.body);
  buildingService.update(req.params.id, data, req.user!.tenantId)
    .then(building => res.json(building))
    .catch(next);
});

router.delete('/:id', authenticate, authorize(['TENANT_ADMIN']), (req, res, next) => {
  buildingService.softDelete(req.params.id, req.user!.tenantId)
    .then(() => res.status(204).send())
    .catch(next);
});

router.get('/:id/zones', authenticate, (req, res, next) => {
  buildingService.findZones(req.params.id, req.user!.tenantId)
    .then(zones => res.json(zones))
    .catch(next);
});

router.post('/:id/zones', authenticate, authorize(['SUPER_ADMIN', 'TENANT_ADMIN', 'BUILDING_ADMIN']), (req, res, next) => {
  const data = createZoneSchema.parse(req.body);
  buildingService.createZone(req.params.id, data, req.user!.tenantId)
    .then(zone => res.status(201).json(zone))
    .catch(next);
});

export default router;
