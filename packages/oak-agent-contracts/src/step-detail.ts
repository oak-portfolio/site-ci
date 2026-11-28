import { z } from 'zod';
import { oakPublicUrlSchema } from './transport.ts';

/**
 * Ticket 26: the passages one search or read step read, sent once per step as a transient `data-step-detail` part with id
 * `<requestId>:step:<step>`. A record passage carries its title, section and a link to that section, never the visitor's
 * words or the model's tool query: the schema has no field to hold either. Web pages ride the existing `data-research` part.
 */
export const OAK_STEP_PEEK_LIMITS = { passages: 5, more: 94, label: 120 } as const;

const label = z.string().min(1).max(OAK_STEP_PEEK_LIMITS.label);
export const oakRecordPassageSchema = z.strictObject({
  kind: z.literal('record'),
  documentId: z.string().max(80).regex(/^(?:[a-z]+:[a-z0-9-]+(?::[a-z0-9-]+)?|legacy-[a-z0-9-]+)$/),
  title: label,
  section: label,
  url: oakPublicUrlSchema,
});
export type OakRecordPassage = z.infer<typeof oakRecordPassageSchema>;

export const oakStepDetailSchema = z.strictObject({
  requestId: z.uuid(),
  step: z.number().int().min(1).max(20),
  operation: z.enum(['search', 'read']),
  passages: z.array(oakRecordPassageSchema).min(1).max(OAK_STEP_PEEK_LIMITS.passages),
  more: z.number().int().min(0).max(OAK_STEP_PEEK_LIMITS.more),
}).refine(detail => detail.more === 0 || detail.passages.length === OAK_STEP_PEEK_LIMITS.passages, 'more only after the shown cap');
export type OakStepDetail = z.infer<typeof oakStepDetailSchema>;

export const oakStepDetailId = (requestId: string, step: number) => `${requestId}:step:${step}`;
