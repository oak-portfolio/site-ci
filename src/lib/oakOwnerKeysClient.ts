import { oakAuthorizationHeaders } from './oakAccountClient';

/** Mirrors KeyQueueView in workers/oak-agent/src/keys/ProviderKeyQueue.ts. Never carries a key value, only the last 4 characters. */
export type OakKeyProvider = 'exa' | 'deepgram' | 'openrouter';
export type OakKeySlot = { slotId: string; label: string; last4: string; state: 'queued' | 'active' | 'exhausted' | 'disabled' | 'retired';
  position: number; knownCreditMicroUsd: number | null; usedMicroUsd: number; remainingMicroUsd: number | null; percentUsed: number | null;
  runwayDays: number | null; expiresAt: number | null; addedAt: number; testedAt: number; promotedAt: number | null; endedAt: number | null; reason: string | null };
export type OakKeyQueueView = { sealing: 'ready' | 'master-key-missing';
  providers: { provider: OakKeyProvider; active: OakKeySlot | null; queue: OakKeySlot[]; history: OakKeySlot[]; needsAttention: boolean;
    events: { kind: string; slotId: string | null; detail: string | null; at: number }[] }[];
  vertex?: { budgetId: string; name: string; costMicroUsd: number; budgetMicroUsd: number; percentUsed: number; intervalStart: string; at: number }[];
  alerts: { id: number; provider: OakKeyProvider; kind: string; message: string; at: number; delivery: string }[] };
export type OakKeyAction =
  | { action: 'add'; provider: OakKeyProvider; label: string; key: string; knownCreditMicroUsd?: number | null; record?: string }
  | { action: 'test' | 'disable' | 'retire'; slotId: string }
  | { action: 'promote'; provider: OakKeyProvider; slotId?: string }
  | { action: 'reorder'; provider: OakKeyProvider; slotIds: string[] };

export class OakOwnerKeysError extends Error {
  constructor(readonly code: string, readonly status: number) { super(code); }
}

/** GET reads the queue; POST runs one action and returns the fresh view. The key in an `add` leaves the browser once, over HTTPS. */
export async function requestOakOwnerKeys(action?: OakKeyAction, signal?: AbortSignal): Promise<{ result: unknown; view: OakKeyQueueView }> {
  const response = await fetch('/api/oak/owner/keys', { method: action ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
    signal: signal ?? AbortSignal.timeout(15_000), headers: { ...await oakAuthorizationHeaders(), ...(action ? { 'Content-Type': 'application/json' } : {}) },
    ...(action ? { body: JSON.stringify(action) } : {}) });
  const body = await response.json().catch(() => null) as { result?: unknown; view?: OakKeyQueueView; error?: string } | null;
  if (!response.ok || !body?.view) throw new OakOwnerKeysError(body?.error ?? 'unavailable', response.status);
  return { result: body.result ?? null, view: body.view };
}
