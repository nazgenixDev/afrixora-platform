import { AlertType, Severity } from '@prisma/client';
import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import { alertService } from '../services/alertService';

const router = Router();

const alertQuerySchema = z.object({
  query: z.object({
    isRead: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
    severity: z.nativeEnum(Severity).optional(),
    buildingId: z.string().uuid().optional(),
    type: z.nativeEnum(AlertType).optional(),
    page: z.coerce.number().int().min(1).max(Math.floor(2_147_483_647 / 100)).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  }),
});

const alertParamsSchema = z.object({ params: z.object({ id: z.string().uuid() }) });

// Express 4 exige de transmettre les erreurs asynchrones au middleware global.
const withErrorHandler = (handler: (req: Request, res: Response) => Promise<void>) =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await handler(req, res);
    } catch (error) {
      next(error);
    }
  };

router.get('/', validate(alertQuerySchema), withErrorHandler(async (req, res) => {
  const { page, limit, ...filters }: z.infer<typeof alertQuerySchema>['query'] = res.locals.validatedQuery;
  res.json(await alertService.findAll(req.user!.tenantId, filters, { page, limit }));
}));

router.patch('/:id/read', validate(alertParamsSchema), withErrorHandler(async (req, res) => {
  res.json(await alertService.markAsRead(req.params.id, req.user!.tenantId));
}));

export default router;
