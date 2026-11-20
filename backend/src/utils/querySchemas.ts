import { z } from 'zod';

export const pageSchema = z.string().regex(/^\d+$/).transform(Number)
  .pipe(z.number().int().min(1).max(Math.floor(2_147_483_647 / 100))).default(1);

export const limitSchema = z.string().regex(/^\d+$/).transform(Number)
  .pipe(z.number().int().min(1).max(100));

const dateSchema = z.union([z.iso.datetime({ offset: true }), z.iso.date()])
  .transform((value) => new Date(value));

export const dateRangeFields = { from: dateSchema, to: dateSchema };

export function validDateRange({ from, to }: { from: Date; to: Date }) {
  const duration = to.getTime() - from.getTime();
  return duration >= 0 && duration <= 93 * 24 * 60 * 60 * 1000;
}
