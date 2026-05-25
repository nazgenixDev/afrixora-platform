import express from 'express';
import { prisma } from '../utils/database';
import authenticate from '../middleware/authenticate';
import logger from '../utils/logger';

const router = express.Router();

/**
 * GET /api/v1/alerts
 * Get all alerts for a tenant, filtered by buildingId and isRead if provided
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const buildingId = req.query.buildingId as string | undefined;
    const isReadFilter = req.query.isRead === 'true' ? false : undefined;
    
    const alerts = await prisma.alert.findMany({
      where: {
        tenantId: req.user!.tenantId,
        ...(buildingId ? { buildingId } : {}),
        ...(isReadFilter !== undefined ? { isRead: isReadFilter } : {})
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    return res.json(alerts);
  } catch (err) {
    return next(err);
  }
});

/**
 * PATCH /api/v1/alerts/:id/read
 * Mark an alert as read
 */
router.patch('/:id/read', authenticate, async (req, res, next) => {
  try {
    // Check if alert exists and belongs to tenant
    const existingAlert = await prisma.alert.findFirst({
      where: {
        id: req.params.id,
        tenantId: req.user!.tenantId
      }
    });
    
    if (!existingAlert) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    
    // Update alert to mark as read
    const updatedAlert = await prisma.alert.update({
      where: { id: req.params.id },
      data: { isRead: true }
    });
    
    logger.debug(`Marked alert as read: ${updatedAlert.id}`, {
      alertId: updatedAlert.id,
      tenantId: req.user!.tenantId
    });
    
    return res.json(updatedAlert);
  } catch (err) {
    return next(err);
  }
});

export default router;