import type { DeviceType } from '@prisma/client';
import { z } from 'zod';
import { AppError } from './errors';

export const commandFields = {
  command: z.enum(['set_state', 'turn_on', 'turn_off']),
  params: z.strictObject({ state: z.enum(['on', 'off']).optional() }).optional(),
};

export function hasValidCommandParams({ command, params }: DeviceCommand) {
  return command === 'set_state' ? params?.state !== undefined : params?.state === undefined;
}

export const deviceCommandSchema = z.strictObject(commandFields)
  .refine(hasValidCommandParams, { path: ['params'], message: 'Paramètres de commande invalides.' });

export type DeviceCommand = {
  command: z.infer<typeof commandFields.command>;
  params?: z.infer<typeof commandFields.params>;
};

export function assertDeviceCanBeControlled(type: DeviceType) {
  if (type !== 'LIGHT' && type !== 'PLUG') {
    throw new AppError('Cet appareil ne prend pas en charge les commandes marche/arrêt.', 400, 'INVALID_DEVICE_COMMAND');
  }
}
