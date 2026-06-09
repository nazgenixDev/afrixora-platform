import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../utils/database';

const router = Router();

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const alerts = await prisma.alert.findMany({
      where: { tenantId: req.user!.tenantId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return res.json(alerts);
  } catch (err) {
    next(err); return;
  }
});

router.patch('/:id/read', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const alert = await prisma.alert.update({
      where: { id: req.params.id },
      data: { isRead: true },
    });
    return res.json(alert);
  } catch (err) {
    next(err); return;
  }
});

export default router;