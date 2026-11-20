import { Router, Request, Response, NextFunction } from 'express';
import reportService from '../services/reportService';
import { requireExport } from '../middleware/features';
import { requireActiveBuilding } from '../services/buildingService';
import { dateRangeFields, validDateRange } from '../utils/querySchemas';
import { z } from 'zod';

const router = Router();

const csvQuery = z.object({ buildingId: z.guid(), ...dateRangeFields })
  .refine(validDateRange, { path: ['to'], message: 'La période doit couvrir au plus 93 jours.' });
const pdfQuery = z.object({ buildingId: z.guid(), period: z.enum(['day', 'week', 'month']).default('month') });

router.get('/csv', requireExport, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { buildingId, from, to } = csvQuery.parse(req.query);
    const { tenantId } = req.user!;
    await requireActiveBuilding(buildingId, tenantId);
    const csv = await reportService.generateCSV(tenantId, buildingId, from, to);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="afrixora_report.csv"');
    return res.send(csv);
  } catch (err) {
    next(err); return;
  }
});

router.get('/pdf', requireExport, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { buildingId, period } = pdfQuery.parse(req.query);
    const { tenantId } = req.user!;
    await requireActiveBuilding(buildingId, tenantId);
    const pdfBuffer = await reportService.generatePDF(tenantId, buildingId, period);
    res.setHeader('Content-Type', 'application/pdf');
    return res.send(pdfBuffer);
  } catch (err) {
    next(err); return;
  }
});

export default router;
