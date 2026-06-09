import { Router } from 'express';
import automationService from '../services/automationService';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';

const router = Router();

router.get('/', authenticate, async (req, res, next) => {
  try {
    const automations = await automationService.findAll(req.user!.tenantId);
    res.json(automations);
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticate, authorize(['SUPER_ADMIN', 'TENANT_ADMIN', 'BUILDING_ADMIN']), async (req, res, next) => {
  try {
    const automation = await automationService.create(req.body, req.user!.tenantId);
    res.status(201).json(automation);
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', authenticate, authorize(['SUPER_ADMIN', 'TENANT_ADMIN', 'BUILDING_ADMIN']), async (req, res, next) => {
  try {
    const automation = await automationService.update(req.params.id, req.body, req.user!.tenantId);
    res.json(automation);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', authenticate, authorize(['SUPER_ADMIN', 'TENANT_ADMIN', 'BUILDING_ADMIN']), async (req, res, next) => {
  try {
    await automationService.remove(req.params.id, req.user!.tenantId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
