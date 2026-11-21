import { Severity, type Prisma } from '@prisma/client';
import { z } from 'zod';

const jsonValue: z.ZodType<Prisma.JsonValue> = z.lazy(() =>
  z.union([z.string(), z.number().finite(), z.boolean(), z.null(), z.array(jsonValue), z.record(jsonValue)])
);

const automationBody = z.object({
  name: z.string().min(1).max(100),
  trigger: z.object({
    deviceId: z.string().min(1),
    metric: z.string().min(1),
    operator: z.enum(['gt', 'lt', 'eq', 'gte', 'lte']),
    value: z.number().finite(),
  }).strict(),
  conditions: z.array(jsonValue),
  action: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('DEVICE_COMMAND'),
      deviceId: z.string().min(1),
      command: z.string().min(1),
      params: jsonValue.optional(),
    }).strict(),
    z.object({
      type: z.literal('SEND_ALERT'),
      severity: z.nativeEnum(Severity),
      message: z.string().max(300).optional(),
    }).strict(),
  ]),
});

export const createAutomationSchema = z.object({
  body: automationBody.extend({
    buildingId: z.string().min(1),
    conditions: automationBody.shape.conditions.default([]),
  }).strict(),
});

export const updateAutomationSchema = z.object({
  body: automationBody.extend({ isActive: z.boolean() }).partial().strict(),
});

export type CreateAutomationInput = z.infer<typeof createAutomationSchema>['body'];
export type UpdateAutomationInput = z.infer<typeof updateAutomationSchema>['body'];
