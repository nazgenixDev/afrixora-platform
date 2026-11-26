import { Router, type Request, type RequestHandler, type Response } from 'express';
import { authenticate } from '../middleware/authenticate';
import { authorizeBuildingAdmin } from '../middleware/authorize';
import { eventsQuery, hourReadingInput, hourReadingQuery, interventionInput, planInput, planQuery,
  ticketInput, ticketQuery, ticketUpdate } from '../utils/maintenanceSchemas';
import { addHourReading, addPlan, completeTicket, listEvents, listHourReadings, listPlans, listTickets,
  openTicket, updateTicket } from '../services/maintenanceService';

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

router.get('/hours', handle(async (req, res) => {
  res.json(await listHourReadings(req.user!, hourReadingQuery.parse(req.query)));
}));
router.post('/hours', authorizeBuildingAdmin, handle(async (req, res) => {
  res.status(201).json(await addHourReading(req.user!, hourReadingInput.parse(req.body)));
}));
router.get('/plans', handle(async (req, res) => {
  res.json(await listPlans(req.user!, planQuery.parse(req.query)));
}));
router.post('/plans', authorizeBuildingAdmin, handle(async (req, res) => {
  res.status(201).json(await addPlan(req.user!, planInput.parse(req.body)));
}));
router.get('/tickets', handle(async (req, res) => {
  res.json(await listTickets(req.user!, ticketQuery.parse(req.query)));
}));
router.post('/tickets', authorizeBuildingAdmin, handle(async (req, res) => {
  res.status(201).json(await openTicket(req.user!, ticketInput.parse(req.body)));
}));
router.patch('/tickets', authorizeBuildingAdmin, handle(async (req, res) => {
  res.json(await updateTicket(req.user!, ticketUpdate.parse(req.body)));
}));
router.post('/interventions', authorizeBuildingAdmin, handle(async (req, res) => {
  res.status(201).json(await completeTicket(req.user!, interventionInput.parse(req.body)));
}));
router.get('/events', handle(async (req, res) => {
  res.json(await listEvents(req.user!, eventsQuery.parse(req.query)));
}));

export default router;
