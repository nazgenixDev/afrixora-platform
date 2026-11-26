import { z } from 'zod';
import { limitSchema, pageSchema } from './querySchemas';

const id = z.uuid().transform(value => value.toLowerCase());
const time = z.iso.datetime({ offset: true }).transform(value => new Date(value));
const observed = time.refine(value => value.getTime() <= Date.now(), 'Un relevé ne peut pas être daté dans le futur.');
const quantity = z.string().regex(/^\d{1,9}(?:\.\d{1,3})?$/);
const temperature = z.string().regex(/^-?\d{1,3}(?:\.\d{1,3})?$/)
  .refine(value => Number(value) >= -50 && Number(value) <= 100);
const coefficient = z.string().regex(/^0(?:\.\d{1,6})?$/).refine(value => Number(value) <= 0.005);
const building = { buildingId: id };
const tank = { ...building, tankId: id };
const pagination = { page: pageSchema, limit: limitSchema.default(25) };

export const fuelTankInput = z.strictObject({
  ...building, sourceId: id, probeDeviceId: id, productionPointId: id, name: z.string().trim().min(1).max(100),
});
export const fuelTankQuery = z.strictObject({ ...building, ...pagination });

export const fuelProfile = z.strictObject({
  points: z.array(z.strictObject({ levelMm: quantity, litres: quantity })).min(2).max(64),
  noiseMm: quantity,
  toleranceLitres: quantity,
  thermalCoefficientPerC: coefficient,
  minLitresPerKWh: quantity,
  maxLitresPerKWh: quantity,
  maxIdleLitresPerHour: quantity,
  maxIntervalMinutes: z.number().int().min(1).max(1440),
}).superRefine((profile, ctx) => {
  for (const [index, point] of profile.points.entries()) {
    const previous = profile.points[index - 1];
    if (previous && (Number(point.levelMm) <= Number(previous.levelMm) || Number(point.litres) <= Number(previous.litres))) {
      ctx.addIssue({ code: 'custom', path: ['points', index], message: 'Hauteurs et volumes doivent être strictement croissants.' });
    }
  }
  if (Number(profile.minLitresPerKWh) > Number(profile.maxLitresPerKWh)) {
    ctx.addIssue({ code: 'custom', path: ['maxLitresPerKWh'], message: 'La consommation maximale doit couvrir le minimum.' });
  }
});

export const calibrationInput = z.strictObject({ ...tank, effectiveFrom: time, profile: fuelProfile });
export const fuelHistoryQuery = z.strictObject({ ...tank, ...pagination });
export const levelInput = z.strictObject({
  ...tank, capturedAt: observed, levelMm: quantity, temperatureC: temperature.optional(),
  quality: z.enum(['MEASURED', 'ESTIMATED', 'INVALID']),
  intervalState: z.enum(['RUNNING', 'STOPPED', 'UNKNOWN']),
});
export const deliveryInput = z.strictObject({
  ...tank, deliveredAt: observed, litresAt20C: quantity.refine(value => Number(value) > 0),
  uncertaintyLitres: quantity, reference: z.string().trim().min(1).max(120),
}).refine(value => Number(value.uncertaintyLitres) <= Number(value.litresAt20C), {
  path: ['uncertaintyLitres'], message: 'L’incertitude ne peut pas dépasser la quantité livrée.',
});
export const assessmentInput = z.strictObject({ ...tank, from: observed, to: observed })
  .refine(value => value.to > value.from && value.to.getTime() - value.from.getTime() <= 86_400_000,
    { path: ['to'], message: 'La période doit être positive et durer au plus 24 heures.' });
