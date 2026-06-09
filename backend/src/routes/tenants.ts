import { Router } from 'express';
import { prisma } from '../utils/database';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';

const router = Router();

// GET /tenants - super admin only
router.get('/', authenticate, authorize(['SUPER_ADMIN']), async (req, res, next) => {
  try {
    const tenants = await prisma.tenant.findMany();
    res.json(tenants);
  } catch (error) {
    next(error);
  }
});

// GET /tenants/:id - super admin only
router.get('/:id', authenticate, authorize(['SUPER_ADMIN']), async (req, res, next) => {
  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: req.params.id } });
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    res.json(tenant);
  } catch (error) {
    next(error);
  }
});

export default router;
