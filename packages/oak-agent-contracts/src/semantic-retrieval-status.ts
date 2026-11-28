import { z } from 'zod';
import { retrievalQueryHealthSchema, retrievalGenerationKeySchema, unobservedRetrievalQueryHealth } from './retrieval-query-health.ts';

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable();
const quality = z.enum(['verified', 'estimated', 'stale', 'unknown']);
const resource = {
  localBudgetLimit: count.optional(), localBudgetRemainingBound: count.optional(),
  limit: count, providerHighWater: count, localBound: count, conservativeUsed: count, remainingBound: count,
  settingsQuality: quality, usageQuality: quality, localQuality: quality,
  settingsObservedAt: count, usageObservedAt: count, periodStart: count, periodEnd: count,
};
const compatibility = z.enum(['compatible', 'incompatible', 'unknown']);
const sqlDaily = (unit: string) => z.strictObject({ ...resource, unit: z.literal(unit), reset: z.literal('utc-calendar-day') });
const sqlPersistent = (unit: string) => z.strictObject({ ...resource, unit: z.literal(unit), reset: z.literal('persistent'), periodStart: z.null(), periodEnd: z.null() });
export const sqliteSemanticStatusSchema = z.strictObject({
  resourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  durationBasis: z.literal('conservative-reserved-bound'),
  resources: z.strictObject({ readRows: sqlDaily('sql-read-rows'), writeRows: sqlDaily('sql-write-rows'),
    requests: sqlDaily('do-requests'), durationMs: sqlDaily('do-duration-ms'), queries: sqlDaily('semantic-queries'),
    batches: sqlDaily('publication-batches'), embeddingTokens: sqlDaily('embedding-input-tokens'),
    bytes: sqlPersistent('persistent-bytes'), generations: sqlPersistent('retained-generations') }),
  concurrency: z.strictObject({ limit: count, activeOperations: count, heldOperations: count, remainingBound: count }),
});
/** Capacity/configuration budgets stay separate from nested provider-pipeline observations. */
export const semanticRetrievalStatusSchema = z.strictObject({
  scope: z.literal('capacity-and-configuration'),
  backend: z.enum(['vectorize', 'sqlite-do']).optional(),
  sqlite: sqliteSemanticStatusSchema.optional(),
  metering: z.strictObject({ basis: z.enum(['conservative-provider-plus-local-bound', 'conditional-local-budget']), upstreamHardCapEstablished: z.boolean() }),
  certificate: z.strictObject({ state: z.enum(['absent', 'active', 'invalidated', 'expired', 'incompatible']),
    revision: count, expiresAt: count, proofLane: z.enum(['native', 'controlled']).nullable() }).optional(),
  resources: z.strictObject({
    dailyEmbedding: z.strictObject({ ...resource, unit: z.literal('embedding-milli-neurons'), reset: z.literal('utc-calendar-day') }),
    monthlyQueries: z.strictObject({ ...resource, unit: z.literal('queried-dimensions'), reset: z.literal('utc-calendar-month') }),
    persistentStorage: z.strictObject({ ...resource, unit: z.literal('stored-dimensions'), reset: z.literal('persistent'), periodStart: z.null(), periodEnd: z.null() }),
  }),
  concurrency: z.strictObject({ limit: count, activeOperations: count, remainingBound: count }),
  refresh: z.strictObject({ state: z.enum(['disabled', 'ready', 'refreshing', 'unavailable']),
    reason: z.enum(['none', 'dependency', 'account', 'evidence', 'timeout', 'aborted', 'read', 'recovery', 'storage']),
    fetchedAt: count, settingsObservedAt: count, usageObservedAt: count, nextDueAt: count, evidenceRevision: count }),
  queryHealth: retrievalQueryHealthSchema.default(unobservedRetrievalQueryHealth),
  generation: z.strictObject({ key: retrievalGenerationKeySchema.nullable().default(null), contentRevision: z.string().regex(/^oak-[a-f0-9]{64}$/).nullable(),
    revocationGeneration: count, configurationSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable() }),
  compatibility: z.strictObject({ state: compatibility, content: compatibility, revocation: compatibility,
    configuration: compatibility, index: compatibility, dimensions: compatibility, metric: compatibility, readiness: compatibility }),
  degradation: z.enum(['policy-invalid', 'off', 'producer-unavailable', 'incompatible-generation', 'capacity-unknown', 'capacity-stale',
    'capacity-refreshing', 'capacity-unavailable', 'quota', 'concurrency', 'none']),
}).superRefine((s, ctx) => {
  const local = s.metering.basis === 'conditional-local-budget';
  if (s.backend === 'sqlite-do' && (!local || !s.sqlite) || s.sqlite && s.backend !== 'sqlite-do' ||
    s.backend === 'sqlite-do' && [s.resources.monthlyQueries, s.resources.persistentStorage].some(r =>
      r.localBound !== null || r.localBudgetLimit !== null || r.localBudgetRemainingBound !== null) ||
    s.sqlite && Object.values(s.sqlite.resources).some(r => r.providerHighWater !== null || r.usageQuality !== 'unknown' ||
      r.usageObservedAt !== null || r.limit !== null || r.remainingBound !== null || r.conservativeUsed !== null ||
      r.localBudgetLimit === undefined || r.localBudgetRemainingBound === undefined))
    ctx.addIssue({ code: 'custom', message: 'sqlite retrieval budget mismatch' });
  if (local && (!s.certificate || Object.values(s.resources).some(r => r.limit !== null || r.remainingBound !== null || r.providerHighWater !== null || r.conservativeUsed !== null || r.usageQuality !== 'unknown' || r.usageObservedAt !== null ||
    r.localBudgetLimit === undefined || r.localBudgetRemainingBound === undefined)) ||
    !local && (s.certificate !== undefined || Object.values(s.resources).some(r => r.localBudgetLimit !== undefined || r.localBudgetRemainingBound !== undefined)) ||
    s.certificate?.state === 'active' && (s.certificate.revision === null || s.certificate.revision < 1 || s.certificate.expiresAt === null || s.certificate.proofLane === null) ||
    s.metering.upstreamHardCapEstablished && (!local || s.certificate?.state !== 'active' || s.certificate.proofLane !== 'native'))
    ctx.addIssue({ code: 'custom', message: 'retrieval admission basis mismatch' });
});
export type SemanticRetrievalStatus = z.infer<typeof semanticRetrievalStatusSchema>;
