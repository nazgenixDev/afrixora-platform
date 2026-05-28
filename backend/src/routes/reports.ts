import { Router, Request, Response, NextFunction } from 'express';
import reportService from '../services/reportService';

const router = Router();

router.get('/csv', (req: Request, res: Response, next: NextFunction) => {
  const { buildingId, from, to } = req.query as { buildingId: string; from: string; to: string };
  reportService.generateCSV(req.user!.tenantId, buildingId, new Date(from), new Date(to))
    .then(csv => {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="afrixora_report.csv"');
      return res.send(csv);
    })
    .catch(next);
});

router.get('/pdf', (req: Request, res: Response, next: NextFunction) => {
  const { buildingId, period } = req.query as { buildingId: string; period: string };
  reportService.generatePDF(req.user!.tenantId, buildingId, period as 'day' | 'week' | 'month')
    .then(pdfBuffer => {
      res.setHeader('Content-Type', 'application/pdf');
      return res.send(pdfBuffer);
    })
    .catch(next);
});

export default router;
