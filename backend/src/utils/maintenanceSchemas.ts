import { z } from 'zod';
import { limitSchema, pageSchema } from './querySchemas';

const id = z.uuid().transform(value => value.toLowerCase());
const time = z.iso.datetime({ offset: true }).transform(value => new Date(value));
const observed = time.refine(value => value.getTime() <= Date.now(), 'La date ne peut pas être dans le futur.');
const site = { buildingId: id };
const pagination = { page: pageSchema, limit: limitSchema.default(25) };
const ticket = { ...site, ticketId: id };
const description = z.string().trim().min(1).max(2000);

export const hourReadingInput = z.strictObject({
  ...site, sourceId: id, capturedAt: observed, totalHours: z.string().regex(/^\d{1,11}(?:\.\d{1,3})?$/),
});
export const planInput = z.strictObject({
  ...site, sourceId: id, title: z.string().trim().min(1).max(120),
  manufacturerReference: z.string().trim().min(1).max(240),
  intervalDays: z.number().int().min(1).max(3650).optional(),
  intervalHours: z.string().regex(/^\d{1,7}(?:\.\d{1,3})?$/).refine(value => Number(value) > 0).optional(),
  startsAt: time, initialReadingId: id.optional(),
}).refine(value => value.intervalDays !== undefined || value.intervalHours !== undefined,
  { path: ['intervalDays'], message: 'Indiquez une périodicité en jours ou en heures moteur.' })
  .refine(value => Boolean(value.intervalHours) === Boolean(value.initialReadingId),
    { path: ['initialReadingId'], message: 'Un plan horaire exige le relevé initial correspondant à startsAt.' });

const status = z.enum(['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']);
export const planQuery = z.strictObject({ ...site, sourceId: id.optional(), ...pagination });
export const hourReadingQuery = z.strictObject({ ...site, sourceId: id, ...pagination });
export const ticketQuery = z.strictObject({ ...site, planId: id.optional(), status: status.optional(), ...pagination });
export const eventsQuery = z.strictObject({ ...ticket, ...pagination });
export const ticketInput = z.strictObject({ ...site, planId: id, responsibleUserId: id, description });
export const ticketUpdate = z.discriminatedUnion('action', [
  z.strictObject({ ...ticket, action: z.literal('ASSIGN'), responsibleUserId: id }),
  z.strictObject({ ...ticket, action: z.literal('START') }),
  z.strictObject({ ...ticket, action: z.literal('CANCEL'), reason: description }),
]);
export const interventionInput = z.strictObject({
  ...ticket, performedAt: observed, readingId: id.optional(), work: description,
});
