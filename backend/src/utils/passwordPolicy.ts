import { z } from 'zod';

export const newPasswordSchema = z.string()
  .min(12, 'Le mot de passe doit contenir au moins 12 caractères.')
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Le mot de passe doit tenir dans 72 octets UTF-8.');
