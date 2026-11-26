import { Router, type Request, type RequestHandler, type Response } from 'express';
import { authenticate } from '../middleware/authenticate';
import { authorizeBuildingAdmin } from '../middleware/authorize';
import {
  assessmentInput, calibrationInput, deliveryInput, fuelHistoryQuery, fuelTankInput, fuelTankQuery, levelInput,
} from '../utils/fuelSchemas';
import { addCalibration, addDelivery, addLevel, addTank, evaluateFuel, listFuelHistory, listTanks } from '../services/fuelService';

const router = Router();
router.use(authenticate);

function handle(action: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return async (req, res, next) => {
    try {
      await action(req, res);
    } catch (error) {
      next(error);
    }
  };
}

router.get('/tanks', handle(async (req, res) => {
  res.json(await listTanks(req.user!, fuelTankQuery.parse(req.query)));
}));
router.post('/tanks', authorizeBuildingAdmin, handle(async (req, res) => {
  res.status(201).json(await addTank(req.user!, fuelTankInput.parse(req.body)));
}));
for (const history of ['calibrations', 'readings', 'deliveries', 'assessments'] as const) {
  router.get('/' + history, handle(async (req, res) => {
    res.json(await listFuelHistory(req.user!, fuelHistoryQuery.parse(req.query), history));
  }));
}
router.post('/calibrations', authorizeBuildingAdmin, handle(async (req, res) => {
  res.status(201).json(await addCalibration(req.user!, calibrationInput.parse(req.body)));
}));
router.post('/readings', authorizeBuildingAdmin, handle(async (req, res) => {
  res.status(201).json(await addLevel(req.user!, levelInput.parse(req.body)));
}));
router.post('/deliveries', authorizeBuildingAdmin, handle(async (req, res) => {
  res.status(201).json(await addDelivery(req.user!, deliveryInput.parse(req.body)));
}));
router.get('/balance', handle(async (req, res) => {
  res.json(await evaluateFuel(req.user!, assessmentInput.parse(req.query), false));
}));
router.post('/assessments', authorizeBuildingAdmin, handle(async (req, res) => {
  res.json(await evaluateFuel(req.user!, assessmentInput.parse(req.body), true));
}));

export default router;
