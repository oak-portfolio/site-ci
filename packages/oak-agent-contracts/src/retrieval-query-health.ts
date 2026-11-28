import { z } from 'zod';

const timestamp = z.number().int().nonnegative().max(8_640_000_000_000_000);
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable();
export const retrievalGenerationKeySchema = z.string().regex(/^[a-f0-9]{64}$/);
export const retrievalQueryOutcomeSchema = z.enum(['success', 'admission-blocked', 'configuration-blocked',
  'embedding-failure', 'vector-query-failure', 'invalid-response', 'accounting-failure', 'deadline', 'cancelled', 'superseded']);
export const retrievalQueryStageSchema = z.enum(['preflight', 'embedding', 'vector-query', 'complete']);
export const retrievalObservationStartSchema = z.strictObject({ eventId: z.uuid(), generationKey: retrievalGenerationKeySchema, startedAt: timestamp });
export const retrievalQueryEventSchema = z.strictObject({ ...retrievalObservationStartSchema.shape,
  sequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), finishedAt: timestamp,
  outcome: retrievalQueryOutcomeSchema, stage: retrievalQueryStageSchema,
  admissionReason: z.enum(['unknown', 'stale', 'quota', 'refused']).nullable(),
}).superRefine((value, ctx) => {
  if (value.finishedAt < value.startedAt || value.finishedAt - value.startedAt > 60_000)
    ctx.addIssue({ code: 'custom', message: 'Bounded terminal interval required' });
  if ((value.outcome === 'admission-blocked') !== (value.admissionReason !== null))
    ctx.addIssue({ code: 'custom', message: 'Admission reason belongs to admission outcome' });
  if (value.outcome === 'success' && value.stage !== 'complete')
    ctx.addIssue({ code: 'custom', message: 'Success requires completed pipeline' });
});
/** Observations describe the provider pipeline only, never relevance or answer quality. */
export const retrievalQueryHealthSchema = z.strictObject({
  scope: z.literal('provider-pipeline'), state: z.enum(['unobserved', 'healthy', 'degraded']),
  lastAttemptAt: timestamp.nullable(), lastSuccessAt: timestamp.nullable(), lastTerminalAt: timestamp.nullable(),
  lastOutcome: retrievalQueryOutcomeSchema.nullable(), lastStage: retrievalQueryStageSchema.nullable(),
  attempts: count, successes: count, failures: count, deadlines: count, activeFailure: z.boolean(),
});
export type RetrievalObservationStart = z.infer<typeof retrievalObservationStartSchema>;
export type RetrievalQueryEvent = z.infer<typeof retrievalQueryEventSchema>;
export type RetrievalQueryHealth = z.infer<typeof retrievalQueryHealthSchema>;
export type RetrievalQueryOutcome = z.infer<typeof retrievalQueryOutcomeSchema>;
export type RetrievalQueryStage = z.infer<typeof retrievalQueryStageSchema>;
export const unobservedRetrievalQueryHealth = (): RetrievalQueryHealth => ({ scope: 'provider-pipeline', state: 'unobserved',
  lastAttemptAt: null, lastSuccessAt: null, lastTerminalAt: null, lastOutcome: null, lastStage: null,
  attempts: null, successes: null, failures: null, deadlines: null, activeFailure: false });
export const isRetrievalQueryFailure = (outcome: RetrievalQueryOutcome) => !['success', 'admission-blocked', 'cancelled', 'superseded'].includes(outcome);
