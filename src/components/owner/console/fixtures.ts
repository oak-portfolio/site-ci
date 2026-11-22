import { consoleReads, settle, initialReads, type Outcome, type ReadBody, type ReadName, type Reads } from './reads.ts';
import type { ServiceStatus } from '../../../../packages/oak-agent-contracts/src/service-status.ts';
import { unobservedRetrievalQueryHealth } from '../../../../packages/oak-agent-contracts/src/retrieval-query-health.ts';

/** Dev-only fixture states (`?fixture=`) for stills and design review. Made-up numbers; the page says so. */
export const fixtureNames = ['signed-in', 'signed-out', 'unreachable'] as const;
export type FixtureName = (typeof fixtureNames)[number];

const day = 864e5, M = 1e6;
const spendByDay = [0.21, 1.4, 0, 1.7, 0.6, 2.2, 0.9, 3.1, 1.1, 4.8, 2.6, 1.0, 1.6, 0.7, 2.3, 1.2, 0.8, 1.9, 1.4, 0.0, 2.1, 1.0, 0.9];

function usageDailyBody(now: number): ReadBody<'usageDaily'> {
  const today = new Date(now), month = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, '0')}`;
  return { service: 'oak-owner-usage-daily-v1', checkedAt: now, month,
    days: Array.from({ length: today.getUTCDate() }, (_, i) => ({ day: `${month}-${String(i + 1).padStart(2, '0')}`,
      actualMicroUsd: Math.round(spendByDay[i % spendByDay.length] * M), heldMicroUsd: i % 9 === 4 ? Math.round(2.1 * M) : 0 })),
    pace: { dailyPoolMicroUsd: 90 * M, paceMicroUsd: 3 * M }, saver: { state: 'off', thresholdPercent: 90 }, rereadBacklog: 3 };
}

type Slot = NonNullable<ReadBody<'keys'>['view']['providers'][number]['active']>;
type Row = ReadBody<'services'>['services'][number];
type Status = ServiceStatus;
type Incident = ReadBody<'services'>['alerting']['incidents'][number];
const incident = (id: number, service: Incident['service'], from: Incident['from'], to: Incident['to'], createdAt: number, delivery: Incident['delivery']): Incident => ({ id, service, from, to,
  transition: id, createdAt, thresholdPercent: 80, configurationRevision: 1, delivery, attempts: 1, lastAttemptAt: createdAt, acceptedAt: createdAt, providerDeliveredAt: createdAt, inboxObservedAt: null });

function alertHistoryBody(now: number): ReadBody<'alertHistory'> {
  const rows: [Incident['service'], Incident['from'], Incident['to'], number, Incident['delivery'], boolean][] = [
    ['semantic-retrieval', 'ready', 'near-limit', 0.2, 'queued', true], ['public-research', 'ready', 'near-limit', 2, 'inbox-observed', false],
    ['transcription', 'near-limit', 'exhausted', 5, 'provider-delivered', false], ['transcription', 'ready', 'near-limit', 6, 'inbox-observed', false],
    ['model-generation', 'near-limit', 'ready', 9, 'accepted', false], ['semantic-retrieval', 'ready', 'stale', 11, 'failed', true],
    ['model-generation', 'ready', 'near-limit', 13, 'inbox-observed', false]];
  return { service: 'oak-owner-alert-history-v1', checkedAt: now, nextCursor: null,
    items: rows.map(([service, from, to, ago, delivery, held], i) => ({ incident: incident(rows.length - i, service, from, to, now - ago * day, delivery), held })) };
}

function evaluationRunsBody(now: number): ReadBody<'evaluationRuns'> {
  const caseId = (seed: number) => Array.from({ length: 64 }, (_, j) => '0123456789abcdef'[(seed * 7 + j * 5) % 16]).join('');
  const runs: [ReadBody<'evaluationRuns'>['runs'][number]['origin'], ReadBody<'evaluationRuns'>['runs'][number]['state'], number, number | null][] = [
    ['owner-authored', 'admitted', 1, 29], ['synthetic', 'admitted', 2, null], ['owner-authored', 'registered', 3, 27], ['synthetic', 'revoked', 6, null],
    ['owner-authored', 'admitted', 8, 22], ['synthetic', 'expired', 34, -4]];
  return { service: 'oak-owner-evaluation-runs-v1', checkedAt: now,
    runs: runs.map(([origin, state, ago, expiresIn], i) => ({ caseId: caseId(i + 1), origin, state, createdAt: now - ago * day, expiresAt: expiresIn === null ? null : now + expiresIn * day })) };
}

function bodies(now: number): { [K in ReadName]: ReadBody<K> } {
  const slot = (slotId: string, label: string, last4: string, state: Slot['state'], position: number, credit: number | null, used: number, extra = {}) => ({ slotId, label, last4, state, position,
    knownCreditMicroUsd: credit, usedMicroUsd: used, remainingMicroUsd: credit === null ? null : Math.max(0, credit - used),
    percentUsed: credit ? Math.round(used * 100 / credit) : null, runwayDays: null, testedAt: now - day, endedAt: null, reason: null, ...extra });
  return {
    keys: { view: { providers: [
      { provider: 'openrouter', needsAttention: true, active: slot('a1', 'Oakfolio sponsor', 'a91f', 'active', 0, 110 * M, 96.4 * M, { runwayDays: 3 }),
        queue: [slot('q1', 'Oakfolio sponsor 2', 'c3d2', 'queued', 1, 110 * M, 0)], history: [slot('h1', 'Launch key', '0e11', 'exhausted', 0, 20 * M, 20 * M, { endedAt: now - 12 * day })] },
      { provider: 'exa', needsAttention: false, active: slot('e1', 'Exa account 1', '5b20', 'active', 0, 10 * M, 2.1 * M, { runwayDays: 15 }), queue: [slot('e2', 'Exa account 2', '9f0c', 'queued', 1, 10 * M, 0)], history: [] },
      { provider: 'deepgram', needsAttention: true, active: slot('d1', 'Deepgram main', '71aa', 'exhausted', 0, 200 * M, 200 * M), queue: [], history: [] },
    ], vertex: [{ budgetId: 'b1', name: 'oakfoliocredits', costMicroUsd: 172 * M, budgetMicroUsd: 200 * M, percentUsed: 86 }] } },
    grants: { codes: [
      { id: 'g1', answers: 20, label: 'Recruiter follow-up', createdAt: now - 2 * day, expiresAt: now + 5 * day, status: 'active', redeemedAt: null },
      { id: 'g2', answers: 40, label: 'Hackathon judges', createdAt: now - 9 * day, expiresAt: now - 2 * day, status: 'redeemed', redeemedAt: now - 8 * day },
    ] },
    usage: { enabled: true, totals: { actualMicroUsd: 41.2 * M, heldMicroUsd: 2.1 * M, availableMicroUsd: 46.7 * M }, effectiveLimitMicroUsd: 90 * M, checkedAt: now,
      reset: { nextAt: Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth() + 1, 1) } },
    services: servicesView(now),
    usageDaily: usageDailyBody(now),
    alertHistory: alertHistoryBody(now),
    evaluationRuns: evaluationRunsBody(now),
  };
}

/** A body that passes `ownerServicesViewSchema`: every owner service once, the full alerting block, and the SQLite retrieval detail. */
function servicesView(now: number): ReadBody<'services'> {
  const status = (service: Status['service'], unit: Status['allowance']['unit'], limit: number | null, used: number | null, reserved: number | null, extra: Partial<Status> = {}): Status => ({ schemaVersion: 1, service, enabled: true, admission: 'available', failure: 'none',
    evidence: { settings: 'verified', providerUsage: 'verified', localReservations: 'verified' },
    allowance: { unit, limit, providerObserved: used, reserved, conservativeUsed: used, remainingBound: limit === null || used === null ? null : limit - used - (reserved ?? 0),
      periodStart: null, periodEnd: null, reset: 'utc-calendar-month' },
    health: { lastCheckAt: now, settingsObservedAt: now, usageObservedAt: now, lastAttemptAt: null, lastSuccessAt: null, accepted: null, failed: null, timedOut: null }, ...extra });
  const row = (condition: Row['condition'], status: Status): Row => ({ condition, status });
  const sqlResource = <U extends string, R extends string>(unit: U, reset: R, extra: { localBound?: number } = {}) => ({ localBudgetLimit: null, localBudgetRemainingBound: null, limit: null, providerHighWater: null, localBound: null, conservativeUsed: null,
    remainingBound: null, settingsQuality: 'unknown' as const, usageQuality: 'unknown' as const, localQuality: 'verified' as const, settingsObservedAt: null, usageObservedAt: null, periodStart: null, periodEnd: null, unit, reset, ...extra });
  const daily = <U extends string>(unit: U) => sqlResource(unit, 'utc-calendar-day');
  const compatible = 'compatible';
  const retrieval = status('semantic-retrieval', 'embedding-milli-neurons', null, null, null, { evidence: { settings: 'verified', providerUsage: 'unknown', localReservations: 'verified' },
    allowance: { unit: 'embedding-milli-neurons', limit: null, providerObserved: null, reserved: null, conservativeUsed: null, remainingBound: null, periodStart: null, periodEnd: null, reset: 'utc-calendar-day' },
    health: { lastCheckAt: now, settingsObservedAt: now, usageObservedAt: null, lastAttemptAt: null, lastSuccessAt: null, accepted: null, failed: null, timedOut: null },
    semanticRetrieval: { scope: 'capacity-and-configuration', backend: 'sqlite-do',
      sqlite: { resourceSha256: '0'.repeat(64), durationBasis: 'conservative-reserved-bound', concurrency: { limit: 1, activeOperations: 0, heldOperations: 0, remainingBound: 1 },
        resources: { readRows: daily('sql-read-rows'), writeRows: daily('sql-write-rows'), requests: daily('do-requests'), durationMs: daily('do-duration-ms'), queries: daily('semantic-queries'),
          batches: daily('publication-batches'), embeddingTokens: daily('embedding-input-tokens'), bytes: sqlResource('persistent-bytes', 'persistent'),
          generations: sqlResource('retained-generations', 'persistent', { localBound: 13 }) } },
      metering: { basis: 'conditional-local-budget', upstreamHardCapEstablished: false }, certificate: { state: 'active', revision: 1, expiresAt: now + 30 * day, proofLane: 'controlled' },
      resources: { dailyEmbedding: daily('embedding-milli-neurons'), monthlyQueries: sqlResource('queried-dimensions', 'utc-calendar-month'), persistentStorage: sqlResource('stored-dimensions', 'persistent') },
      concurrency: { limit: 1, activeOperations: 0, remainingBound: 1 },
      refresh: { state: 'ready', reason: 'none', fetchedAt: now, settingsObservedAt: now, usageObservedAt: null, nextDueAt: now + 120_000, evidenceRevision: 1 },
      queryHealth: unobservedRetrievalQueryHealth(),
      generation: { key: null, contentRevision: null, revocationGeneration: null, configurationSha256: null },
      compatibility: { state: compatible, content: compatible, revocation: compatible, configuration: compatible, index: compatible, dimensions: compatible, metric: compatible, readiness: compatible },
      degradation: 'none' } });
  return { schemaVersion: 1, checkedAt: now,
    modelReset: { period: 'utc-month', startsAt: null, nextAt: Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth() + 1, 1), heldCarryOver: true, keyRotationResetsUsage: false },
    alerting: { featureEnabled: true, started: true, senderReady: true, thresholdPercent: 80, configurationRevision: 1, droppedTransitions: 0, lastPollAt: now - 6 * 60_000, nextPollAt: now + 9 * 60_000,
      incidents: [incident(2, 'public-research', 'ready', 'near-limit', now - 2 * day, 'inbox-observed'), incident(1, 'transcription', 'near-limit', 'exhausted', now - 5 * day, 'provider-delivered')] },
    services: [
      row('ready', status('model-generation', 'micro-usd', 90 * M, 41.2 * M, 2.1 * M)),
      row('ready', status('diagnostic-traces', 'root-traces', 5000, 1204, null)),
      row('exhausted', status('transcription', 'audio-seconds', 720_000, 720_000, null, { admission: 'exhausted' })),
      row('near-limit', status('public-research', 'micro-usd', 10 * M, 8.4 * M, 0.3 * M)),
      row('ready', status('document-extraction', 'conversion-attempts', 500, 42, null)),
      row('ready', status('document-ocr', 'micro-usd', 5 * M, 0.8 * M, null)),
      row('ready', status('error-telemetry', 'telemetry-events', 5000, 310, null)),
      row('disabled', status('product-analytics', 'telemetry-events', null, null, null, { enabled: false, admission: 'disabled' })),
      row('ready', retrieval),
    ] };
}

const ok = (body: unknown): Outcome => ({ kind: 'json', status: 200, body });

export function fixtureReads(name: FixtureName, now: number): Reads {
  const all = bodies(now);
  let reads = initialReads();
  for (const read of Object.keys(consoleReads) as ReadName[]) {
    const body = all[read];
    const step = (outcome: Outcome, at: number) => { reads = { ...reads, [read]: settle(read, reads[read], outcome, at) } as Reads; };
    if (name === 'signed-out') step({ kind: 'json', status: 403, body: { error: 'owner-required' } }, now);
    else if (name === 'unreachable') { step(ok(body), now - 6 * 60_000); step({ kind: 'network' }, now); }
    else step(ok(body), now);
  }
  return reads;
}
