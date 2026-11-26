import { Router, type Request, type RequestHandler, type Response } from 'express';
import { authenticate } from '../middleware/authenticate';
import { authorizeBuildingAdmin } from '../middleware/authorize';
import {
  energyCostQuery, tariffInput, tariffQuery, exchangeRateInput, exchangeRateQuery, generatorInput, generatorQuery,
} from '../utils/energyCostSchemas';
import {
  addEnergyTariff, listEnergyTariffs, addEnergyExchangeRate, listEnergyExchangeRates, calculateEnergyCosts,
  addGeneratorCost, listGeneratorCosts,
} from '../services/energyCostService';

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

router.get('/costs', handle(async (req, res) => {
  res.json(await calculateEnergyCosts(req.user!, energyCostQuery.parse(req.query)));
}));
router.get('/tariffs', handle(async (req, res) => {
  res.json(await listEnergyTariffs(req.user!, tariffQuery.parse(req.query)));
}));
router.post('/tariffs', authorizeBuildingAdmin, handle(async (req, res) => {
  res.status(201).json(await addEnergyTariff(req.user!, tariffInput.parse(req.body)));
}));
router.get('/exchange-rates', handle(async (req, res) => {
  res.json(await listEnergyExchangeRates(req.user!, exchangeRateQuery.parse(req.query)));
}));
router.post('/exchange-rates', authorizeBuildingAdmin, handle(async (req, res) => {
  res.status(201).json(await addEnergyExchangeRate(req.user!, exchangeRateInput.parse(req.body)));
}));
router.get('/generator-costs', handle(async (req, res) => {
  res.json(await listGeneratorCosts(req.user!, generatorQuery.parse(req.query)));
}));
router.post('/generator-costs', authorizeBuildingAdmin, handle(async (req, res) => {
  res.status(201).json(await addGeneratorCost(req.user!, generatorInput.parse(req.body)));
}));

export default router;
