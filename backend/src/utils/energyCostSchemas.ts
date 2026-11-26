import { z } from 'zod';
import { limitSchema, pageSchema } from './querySchemas';

const id = z.uuid().transform(value => value.toLowerCase());
const time = z.iso.datetime({ offset: true }).transform(value => new Date(value));
const currency = z.enum(['USD', 'CDF']);
const amount = z.string().regex(/^\d{1,12}(?:\.\d{1,8})?$/);
const quantity = z.string().regex(/^\d{1,14}(?:\.\d{1,6})?$/);
const quality = z.enum(['MEASURED', 'ESTIMATED']);
const dates = { effectiveFrom: time, effectiveTo: time.optional() };
const validValidity = (data: { effectiveFrom: Date; effectiveTo?: Date }) =>
  !data.effectiveTo || data.effectiveFrom < data.effectiveTo;

export const tariffInput = z.strictObject({
  buildingId: id, sourceId: id, currency, unit: z.literal('KWH'), unitPrice: amount, ...dates,
}).refine(validValidity, { path: ['effectiveTo'], message: 'La fin doit suivre la date d’effet.' });

export const exchangeRateInput = z.strictObject({
  buildingId: id, cdfPerUsd: amount.refine(value => /[1-9]/.test(value)),
  rateSource: z.string().trim().min(1).max(100), ...dates,
}).refine(validValidity, { path: ['effectiveTo'], message: 'La fin doit suivre la date d’effet.' });

const window = { from: time, to: time };
const validWindow = ({ from, to }: { from: Date; to: Date }) =>
  to > from && to.getTime() - from.getTime() <= 93 * 86_400_000;

export const energyCostQuery = z.strictObject({
  buildingId: id, meteringPointId: id, currency: currency.default('USD'), ...window,
}).refine(validWindow, { path: ['to'], message: 'Une période de 93 jours maximum est requise.' });

const pagination = { buildingId: id, page: pageSchema, limit: limitSchema.default(25) };
export const tariffQuery = z.strictObject({ ...pagination, sourceId: id });
export const exchangeRateQuery = z.strictObject(pagination);
export const generatorQuery = z.strictObject({ ...pagination, sourceId: id, currency: currency.default('USD'), ...window })
  .refine(validWindow, { path: ['to'], message: 'Une période de 93 jours maximum est requise.' });

export const generatorInput = z.strictObject({
  buildingId: id, sourceId: id, currency, periodFrom: time, periodTo: time,
  fuelLitres: quantity.optional(), fuelQuality: quality.optional(), fuelPricePerLitre: amount.optional(),
  engineHours: quantity.optional(), hoursQuality: quality.optional(), maintenanceCostPerHour: amount.optional(),
}).superRefine((entry, ctx) => {
  const invalid = (field: string, message: string) => ctx.addIssue({ code: 'custom', path: [field], message });
  if (!validWindow({ from: entry.periodFrom, to: entry.periodTo })) {
    invalid('periodTo', 'Une période de 93 jours maximum est requise.');
  }
  if (Boolean(entry.fuelLitres) !== Boolean(entry.fuelQuality)) invalid('fuelQuality', 'Indiquez la qualité de la quantité de carburant.');
  if (Boolean(entry.engineHours) !== Boolean(entry.hoursQuality)) invalid('hoursQuality', 'Indiquez la qualité des heures moteur.');
});
