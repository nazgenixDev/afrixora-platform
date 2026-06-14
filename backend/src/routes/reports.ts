import { Router, Request, Response, NextFunction } from 'express';
import reportService from '../services/reportService';
import { requireExport } from '../middleware/features';

const router = Router();

router.get('/csv', requireExport, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { buildingId, from, to } = req.query as { buildingId: string; from: string; to: string };
    const csv = await reportService.generateCSV(req.user!.tenantId, buildingId, new Date(from), new Date(to));
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="afrixora_report.csv"');
    return res.send(csv);
  } catch (err) {
    next(err); return;
  }
});

router.get('/pdf', requireExport, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { buildingId, period } = req.query as { buildingId: string; period: string };
    const pdfBuffer = await reportService.generatePDF(req.user!.tenantId, buildingId, period as 'day' | 'week' | 'month');
    res.setHeader('Content-Type', 'application/pdf');
    return res.send(pdfBuffer);
  } catch (err) {
    next(err); return;
  }
});

export default router;