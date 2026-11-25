import { Router, type RequestHandler, type Request, type Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authenticate';
import { energyTopology } from '../services/energyTopologyService';
import { topologySchemas, type Resource } from '../utils/energyTopologySchemas';
import { limitSchema, pageSchema } from '../utils/querySchemas';

const router = Router();
const topologyPath = '/buildings/:buildingId/topology';
const id = z.guid();
const listQuery = z.strictObject({ page: pageSchema, limit: limitSchema.default(50),
  search: z.string().trim().max(100).optional(), archived: z.enum(['true', 'false']).default('false').transform(v => v === 'true') });

function handle(action: (req: Request, res: Response, building: string) => Promise<void>): RequestHandler {
  return async (req, res, next) => {
    try {
      await action(req, res, id.parse(req.params.buildingId));
    } catch (error) {
      next(error);
    }
  };
}

for (const resource of Object.keys(topologySchemas) as Resource[]) {
  const path = topologyPath + '/' + resource;
  const schema = topologySchemas[resource];
  router.get(path, authenticate, handle(async (req, res, building) => {
    res.json(await energyTopology.list(req.user!, building, resource, listQuery.parse(req.query)));
  }));
  router.get(path + '/:id', authenticate, handle(async (req, res, building) => {
    res.json(await energyTopology.get(req.user!, building, resource, id.parse(req.params.id)));
  }));
  router.post(path, authenticate, handle(async (req, res, building) => {
    res.status(201).json(await energyTopology.save(req.user!, building, resource, schema.parse(req.body)));
  }));
  router.patch(path + '/:id', authenticate, handle(async (req, res, building) => {
    const data = schema.partial().refine(value => Object.keys(value).length > 0).parse(req.body);
    res.json(await energyTopology.save(req.user!, building, resource, data, id.parse(req.params.id)));
  }));
  router.delete(path + '/:id', authenticate, handle(async (req, res, building) => {
    await energyTopology.archive(req.user!, building, resource, id.parse(req.params.id));
    res.sendStatus(204);
  }));
}

for (const method of ['put', 'delete'] as const) {
  router[method](topologyPath + '/access/:userId', authenticate, handle(async (req, res, building) => {
    z.strictObject({}).optional().parse(req.body);
    await energyTopology.grant(req.user!, building, id.parse(req.params.userId), method === 'put');
    res.sendStatus(204);
  }));
}

export default router;
