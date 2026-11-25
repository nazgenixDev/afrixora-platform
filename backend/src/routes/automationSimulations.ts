import { Router, type Request, type RequestHandler, type Response } from 'express';
import { authenticate } from '../middleware/authenticate';
import { authorizeBuildingAdmin } from '../middleware/authorize';
import { checkAutomationLimit } from '../middleware/checkLimits';
import {
  createSimulationRule, simulateAutomation, simulationId, simulationQuery, updateSimulationRule,
} from '../utils/automationSimulationSchemas';
import {
  createEnergySimulationRule, listEnergySimulationRules, listSimulationRuns,
  runEnergySimulation, updateEnergySimulationRule,
} from '../services/automationSimulationService';

const router = Router();
router.use(authenticate, authorizeBuildingAdmin);

function handle(action: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return async (req, res, next) => {
    try {
      await action(req, res);
    } catch (error) {
      next(error);
    }
  };
}

router.post('/rules', checkAutomationLimit, handle(async (req, res) => {
  res.status(201).json(await createEnergySimulationRule(req.user!, createSimulationRule.parse(req.body)));
}));

router.get('/rules', handle(async (req, res) => {
  const { buildingId, ...pagination } = simulationQuery.parse(req.query);
  res.json(await listEnergySimulationRules(req.user!, buildingId, pagination));
}));

router.patch('/rules/:id', handle(async (req, res) => {
  const { buildingId, isActive } = updateSimulationRule.parse(req.body);
  res.json(await updateEnergySimulationRule(req.user!, buildingId, simulationId.parse(req.params.id), isActive));
}));

router.post('/rules/:id/runs', handle(async (req, res) => {
  res.json(await runEnergySimulation(req.user!, simulationId.parse(req.params.id), simulateAutomation.parse(req.body)));
}));

router.get('/rules/:id/runs', handle(async (req, res) => {
  const { buildingId, ...pagination } = simulationQuery.parse(req.query);
  res.json(await listSimulationRuns(req.user!, buildingId, simulationId.parse(req.params.id), pagination));
}));

export default router;
