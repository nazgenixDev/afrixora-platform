import { Router } from 'express';
import { z } from 'zod';
import { buildingService } from '../services/buildingService';
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

// GET / — liste les bâtiments du tenant
router.get('/', (req, res, next) => {
  buildingService.findAll(req.user!.tenantId)
    .then(buildings => res.json(buildings))
    .catch(next);
});

// POST / — créer un bâtiment
router.post('/', authorize(['SUPER_ADMIN', 'TENANT_ADMIN', 'BUILDING_ADMIN']), (req, res, next) => {
  const data = createBuildingSchema.parse(req.body);
  buildingService.create(data, req.user!.tenantId)
    .then(building => res.status(201).json(building))
    .catch(next);
});

// GET /:id — détail du bâtiment
router.get('/:id', (req, res, next) => {
  buildingService.findById(req.params.id, req.user!.tenantId)
    .then(building => res.json(building))
    .catch(next);
});

// PATCH /:id — modifier un bâtiment
router.patch('/:id', authorize(['SUPER_ADMIN', 'TENANT_ADMIN', 'BUILDING_ADMIN']), (req, res, next) => {
  const data = updateBuildingSchema.parse(req.body);
  buildingService.update(req.params.id, data, req.user!.tenantId)
    .then(building => res.json(building))
    .catch(next);
});

// DELETE /:id — désactiver un bâtiment
router.delete('/:id', authorize(['SUPER_ADMIN', 'TENANT_ADMIN']), (req, res, next) => {
  buildingService.softDelete(req.params.id, req.user!.tenantId)
    .then(() => res.status(204).send())
    .catch(next);
});

// GET /:id/zones — liste les zones du bâtiment
router.get('/:id/zones', (req, res, next) => {
  buildingService.findZones(req.params.id, req.user!.tenantId)
    .then(zones => res.json(zones))
    .catch(next);
});

// POST /:id/zones — créer une zone
router.post('/:id/zones', authorize(['SUPER_ADMIN', 'TENANT_ADMIN', 'BUILDING_ADMIN']), (req, res, next) => {
  const data = createZoneSchema.parse(req.body);
  buildingService.createZone(req.params.id, data, req.user!.tenantId)
    .then(zone => res.status(201).json(zone))
    .catch(next);
});

export default router;
