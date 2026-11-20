import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import buildingService from '../services/buildingService';
import { authorize } from '../middleware/authorize';
import { limitSchema, pageSchema } from '../utils/querySchemas';

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

const buildingId = z.guid();
const paginationSchema = z.object({ page: pageSchema, limit: limitSchema.default(50) });

// GET / — liste les bâtiments du tenant
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pagination = paginationSchema.parse(req.query);
    const buildings = await buildingService.findAll(req.user!.tenantId, pagination);
    return res.json(buildings);
  } catch (err) {
    next(err); return;
  }
});

// POST / — créer un bâtiment
router.post('/', authorize(['SUPER_ADMIN', 'TENANT_ADMIN', 'BUILDING_ADMIN']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createBuildingSchema.parse(req.body);
    const building = await buildingService.create(data, req.user!.tenantId);
    return res.status(201).json(building);
  } catch (err) {
    next(err); return;
  }
});

// GET /:id — détail du bâtiment
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const building = await buildingService.findById(buildingId.parse(req.params.id), req.user!.tenantId);
    return res.json(building);
  } catch (err) {
    next(err); return;
  }
});

// PATCH /:id — modifier un bâtiment
router.patch('/:id', authorize(['SUPER_ADMIN', 'TENANT_ADMIN', 'BUILDING_ADMIN']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updateBuildingSchema.parse(req.body);
    const building = await buildingService.update(buildingId.parse(req.params.id), data, req.user!.tenantId);
    return res.json(building);
  } catch (err) {
    next(err); return;
  }
});

// DELETE /:id — désactiver un bâtiment
router.delete('/:id', authorize(['SUPER_ADMIN', 'TENANT_ADMIN']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await buildingService.softDelete(buildingId.parse(req.params.id), req.user!.tenantId);
    return res.status(204).send();
  } catch (err) {
    next(err); return;
  }
});

// GET /:id/zones — liste les zones du bâtiment
router.get('/:id/zones', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const zones = await buildingService.findZones(buildingId.parse(req.params.id), req.user!.tenantId);
    return res.json(zones);
  } catch (err) {
    next(err); return;
  }
});

// POST /:id/zones — créer une zone
router.post('/:id/zones', authorize(['SUPER_ADMIN', 'TENANT_ADMIN', 'BUILDING_ADMIN']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createZoneSchema.parse(req.body);
    const zone = await buildingService.createZone(buildingId.parse(req.params.id), data, req.user!.tenantId);
    return res.status(201).json(zone);
  } catch (err) {
    next(err); return;
  }
});

export default router;
