import { Router } from 'express';
import prisma from '../utils/database';

const router = Router();

router.get('/', (req, res, next) => {
  prisma.alert.findMany({
    where: { tenantId: req.user!.tenantId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
    .then(alerts => res.json(alerts))
    .catch(next);
});

router.patch('/:id/read', (req, res, next) => {
  prisma.alert.update({
    where: { id: req.params.id },
    data: { isRead: true },
  })
    .then(alert => res.json(alert))
    .catch(next);
});

export default router;
