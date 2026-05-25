import { Router, Request, Response, NextFunction } from 'express';
import authenticate from '../middleware/authenticate';
import reportService from '../services/reportService';

const router = Router();

router.get('/csv', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { buildingId, from, to } = req.query as { buildingId: string; from: string; to: string };
    const csv = await reportService.generateCSV(
      req.user!.tenantId,
      buildingId,
      new Date(from),
      new Date(to)
    );
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="afrixora_report.csv"');
    return res.send(csv);
  } catch (err) {
    return next(err);
  }
});

router.get('/pdf', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { buildingId, period } = req.query as { buildingId: string; period: string };
    const pdfBuffer = await reportService.generatePDF(
      req.user!.tenantId,
      buildingId,
      period as 'day' | 'week' | 'month'
    );
    res.setHeader('Content-Type', 'application/pdf');
    return res.send(pdfBuffer);
  } catch (err) {
    return next(err);
  }
});

export default router;
