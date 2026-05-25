import express from 'express';
import { z } from 'zod';
import { prisma } from '../utils/database';
import authenticate from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import logger from '../utils/logger';

const router = express.Router();

// Zod schema for creating automation rules
const createAutomationSchema = z.object({
  body: z.object({
    name: z.string(),
    buildingId: z.string(),
    trigger: z.object({ 
      deviceId: z.string(), 
      metric: z.string(), 
      operator: z.enum(['gt','lt','eq','gte','lte']), 
      value: z.number() 
    }),
    conditions: z.array(z.any()).optional(),
    action: z.object({ 
      type: z.enum(['DEVICE_COMMAND','SEND_ALERT']), 
      deviceId: z.string().optional(), 
      command: z.string().optional(), 
      params: z.any().optional(), 
      severity: z.enum(['INFO','WARNING','CRITICAL']).optional(), 
      message: z.string().optional() 
    }),
    isActive: z.boolean().default(true)
  })
});

// Zod schema for updating automation rules
const updateAutomationSchema = z.object({
  body: z.object({
    name: z.string().optional(),
    isActive: z.boolean().optional(),
    trigger: z.object({ 
      deviceId: z.string(), 
      metric: z.string(), 
      operator: z.enum(['gt','lt','eq','gte','lte']), 
      value: z.number() 
    }).optional(),
    conditions: z.array(z.any()).optional(),
    action: z.object({ 
      type: z.enum(['DEVICE_COMMAND','SEND_ALERT']), 
      deviceId: z.string().optional(), 
      command: z.string().optional(), 
      params: z.any().optional(), 
      severity: z.enum(['INFO','WARNING','CRITICAL']).optional(), 
      message: z.string().optional() 
    }).optional()
  })
});

/**
 * GET /api/v1/automations
 * Get all automation rules for a tenant, filtered by buildingId if provided
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const buildingId = req.query.buildingId as string | undefined;
    
    const automations = await prisma.automation.findMany({
      where: {
        tenantId: req.user!.tenantId,
        ...(buildingId ? { buildingId } : {})
      }
    });
    
    return res.json(automations);
  } catch (err) {
    return next(err);
  }
});

/**
 * POST /api/v1/automations
 * Create a new automation rule
 */
router.post('/', 
  authenticate, 
  authorize(['SUPER_ADMIN', 'TENANT_ADMIN', 'BUILDING_ADMIN']), 
  validate(createAutomationSchema), 
  async (req, res, next) => {
    try {
      const automation = await prisma.automation.create({
        data: {
          ...req.body,
          tenantId: req.user!.tenantId
        }
      });
      
      logger.info(`Created automation rule: ${automation.name}`, {
        automationId: automation.id,
        tenantId: req.user!.tenantId,
        buildingId: automation.buildingId
      });
      
      return res.status(201).json(automation);
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * GET /api/v1/automations/:id
 * Get a specific automation rule
 */
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const automation = await prisma.automation.findFirst({
      where: {
        id: req.params.id,
        tenantId: req.user!.tenantId
      }
    });
    
    if (!automation) {
      return res.status(404).json({ error: 'Automation rule not found' });
    }
    
    return res.json(automation);
  } catch (err) {
    return next(err);
  }
});

/**
 * PATCH /api/v1/automations/:id
 * Update an automation rule
 */
router.patch('/:id', 
  authenticate, 
  authorize(['SUPER_ADMIN', 'TENANT_ADMIN', 'BUILDING_ADMIN']), 
  validate(updateAutomationSchema), 
  async (req, res, next) => {
    try {
      // Check if automation exists and belongs to tenant
      const existingAutomation = await prisma.automation.findFirst({
        where: {
          id: req.params.id,
          tenantId: req.user!.tenantId
        }
      });
      
      if (!existingAutomation) {
        return res.status(404).json({ error: 'Automation rule not found' });
      }
      
      // Update automation
      const updatedAutomation = await prisma.automation.update({
        where: { id: req.params.id },
        data: req.body
      });
      
      logger.info(`Updated automation rule: ${updatedAutomation.name}`, {
        automationId: updatedAutomation.id,
        tenantId: req.user!.tenantId
      });
      
      return res.json(updatedAutomation);
    } catch (err) {
      return next(err);
    }
  }
);

/**
 * DELETE /api/v1/automations/:id
 * Delete an automation rule
 */
router.delete('/:id', 
  authenticate, 
  authorize(['SUPER_ADMIN', 'TENANT_ADMIN', 'BUILDING_ADMIN']), 
  async (req, res, next) => {
    try {
      // Check if automation exists and belongs to tenant
      const existingAutomation = await prisma.automation.findFirst({
        where: {
          id: req.params.id,
          tenantId: req.user!.tenantId
        }
      });
      
      if (!existingAutomation) {
        return res.status(404).json({ error: 'Automation rule not found' });
      }
      
      // Delete automation
      await prisma.automation.delete({
        where: { id: req.params.id }
      });
      
      logger.info(`Deleted automation rule: ${existingAutomation.name}`, {
        automationId: existingAutomation.id,
        tenantId: req.user!.tenantId
      });
      
      return res.status(204).send();
    } catch (err) {
      return next(err);
    }
  }
);

export default router;