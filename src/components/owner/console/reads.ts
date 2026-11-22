import { z } from 'zod';
import { ownerServicesViewSchema } from '../../../../packages/oak-agent-contracts/src/owner-services.ts';
import { ownerUsageDailyPath, ownerUsageDailySchema } from '../../../../packages/oak-agent-contracts/src/owner/usage-daily.ts';
import { ownerAlertHistoryPath, ownerAlertHistorySchema } from '../../../../packages/oak-agent-contracts/src/owner/alert-history.ts';
import { ownerEvaluationRunsPath, ownerEvaluationRunsSchema } from '../../../../packages/oak-agent-contracts/src/owner/evaluation-runs.ts';

const n = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const nn = n.nullable();

// Plain z.object strips unknown fields, so a key value or grant code a Worker bug might add never reaches the page.
const slotSchema = z.object({ slotId: z.string().max(80), label: z.string().max(120), last4: z.string().max(8),
  state: z.enum(['queued', 'active', 'exhausted', 'disabled', 'retired']), position: n,
  knownCreditMicroUsd: nn, usedMicroUsd: n, remainingMicroUsd: nn, percentUsed: z.number().nullable(), runwayDays: z.number().nullable(),
  testedAt: nn, endedAt: nn, reason: z.string().max(200).nullable() });
const keysSchema = z.object({ view: z.object({
  providers: z.array(z.object({ provider: z.enum(['exa', 'deepgram', 'openrouter']), active: slotSchema.nullable(),
    queue: z.array(slotSchema).max(50), history: z.array(slotSchema).max(50), needsAttention: z.boolean() })).max(3),
  vertex: z.array(z.object({ budgetId: z.string().max(80), name: z.string().max(120), costMicroUsd: n, budgetMicroUsd: n, percentUsed: z.number() })).max(10).optional(),
}) }).transform(body => body.view);
const grantsSchema = z.object({ codes: z.array(z.object({ id: z.string().max(64), answers: n, label: z.string().max(80).nullable(),
  createdAt: n, expiresAt: n, status: z.enum(['active', 'redeemed', 'revoked', 'expired']), redeemedAt: nn })).max(200) }).transform(body => body.codes);
const usageSchema = z.object({ enabled: z.boolean(), totals: z.object({ actualMicroUsd: n, heldMicroUsd: n, availableMicroUsd: n }),
  effectiveLimitMicroUsd: n, checkedAt: n, reset: z.object({ nextAt: n }) });

/** Every owner read the console makes. Mark a read `pending` only while its Worker route is unshipped: then a 404 or 405 means the route is not there yet, not an error. */
export const consoleReads = {
  keys: { path: '/api/oak/owner/keys', schema: keysSchema, pending: false },
  grants: { path: '/api/oak/owner/grants', schema: grantsSchema, pending: false },
  usage: { path: '/api/oak/owner/usage', schema: usageSchema, pending: false },
  services: { path: '/api/oak/owner/services', schema: ownerServicesViewSchema, pending: false },
  usageDaily: { path: ownerUsageDailyPath, schema: ownerUsageDailySchema, pending: false },
  alertHistory: { path: ownerAlertHistoryPath, schema: ownerAlertHistorySchema, pending: false },
  evaluationRuns: { path: ownerEvaluationRunsPath, schema: ownerEvaluationRunsSchema, pending: false },
} as const;
export type ReadName = keyof typeof consoleReads;
export type ReadData<K extends ReadName> = z.output<(typeof consoleReads)[K]['schema']>;
export type ReadBody<K extends ReadName> = z.input<(typeof consoleReads)[K]['schema']>;

export type SignedOutReason = 'no-token' | 'same-origin-only';
export type Snapshot<T> = { data: T; at: number };
export type Read<T> =
  | { kind: 'loading' }
  | ({ kind: 'ready' } & Snapshot<T>)
  | { kind: 'signed-out'; reason: SignedOutReason }
  | { kind: 'not-deployed' }
  | { kind: 'unreachable'; last: Snapshot<T> | null; failedAt: number };
export type Reads = { [K in ReadName]: Read<ReadData<K>> };

export type Outcome = { kind: 'json'; status: number; body: unknown } | { kind: 'other'; status: number } | { kind: 'network' };

export const lastGood = <T>(read: Read<T>): Snapshot<T> | null =>
  read.kind === 'ready' ? { data: read.data, at: read.at } : read.kind === 'unreachable' ? read.last : null;
export const dataOf = <T>(read: Read<T>): T | null => lastGood(read)?.data ?? null;

/** One response, folded into the read it replaces. A failure keeps the last good read so the tab can show it as Stale. */
export function settle<K extends ReadName>(name: K, previous: Read<ReadData<K>>, outcome: Outcome, now: number): Read<ReadData<K>> {
  const { schema, pending } = consoleReads[name];
  const unreachable = { kind: 'unreachable' as const, last: lastGood(previous), failedAt: now };
  if (outcome.kind === 'network') return unreachable;
  const error = outcome.kind === 'json' && typeof (outcome.body as { error?: unknown })?.error === 'string' ? (outcome.body as { error: string }).error : null;
  if (outcome.status === 403 && error === 'owner-proxy-same-origin-only') return { kind: 'signed-out', reason: 'same-origin-only' };
  // No owner token reaches the Worker as a guest: 401, or 403 owner-required. An HTML 403 is the edge spend breaker, not a sign-out.
  if (outcome.status === 401 || outcome.status === 403 && error === 'owner-required') return { kind: 'signed-out', reason: 'no-token' };
  if (pending && (outcome.status === 404 || outcome.status === 405)) return { kind: 'not-deployed' };
  if (outcome.kind !== 'json' || outcome.status < 200 || outcome.status > 299) return unreachable;
  const parsed = (schema as unknown as z.ZodType<ReadData<K>>).safeParse(outcome.body);
  return parsed.success ? { kind: 'ready', data: parsed.data, at: now } : unreachable;
}

/** Same-origin through the dev server's owner proxy, which adds the token. The page itself never holds it. */
export async function fetchOutcome(path: string, signal?: AbortSignal): Promise<Outcome> {
  try {
    const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: signal ?? AbortSignal.timeout(15_000) });
    if (!response.headers.get('content-type')?.startsWith('application/json')) { void response.body?.cancel(); return { kind: 'other', status: response.status }; }
    return { kind: 'json', status: response.status, body: await response.json() };
  } catch {
    return { kind: 'network' };
  }
}

export const initialReads = (): Reads => Object.fromEntries(Object.keys(consoleReads).map(name => [name, { kind: 'loading' }])) as Reads;
