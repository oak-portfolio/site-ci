import { z } from 'zod';

/** The GET on the owner evaluation route (ticket 66): the newest 50 cases, no total. POST on the same path runs the owner operations. */
export const ownerEvaluationRunsPath = '/api/oak/owner/evaluation';

const time = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

/** Counts and states only: no prompt, answer or visitor text. */
export const ownerEvaluationRunsSchema = z.strictObject({
  service: z.literal('oak-owner-evaluation-runs-v1'),
  checkedAt: time,
  runs: z.array(z.strictObject({
    caseId: z.string().regex(/^[a-f0-9]{64}$/),
    origin: z.enum(['owner-authored', 'synthetic']),
    state: z.enum(['registered', 'admitted', 'revoked', 'expired']),
    createdAt: time,
    expiresAt: time.nullable(),
  })).max(50),
});
export type OwnerEvaluationRuns = z.infer<typeof ownerEvaluationRunsSchema>;
