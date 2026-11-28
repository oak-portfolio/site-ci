/**
 * The AI trace's vocabulary in one place (retro arch 3): the run names the Worker writes and the markers a live reading
 * matches on. The Worker's tracing/types.ts and turn.ts write these names; scripts/quality/live-health-core.mjs reads them.
 * Erasable TypeScript only (no enums), so Node loads this file straight from a script.
 */
import { OAK_OPENUI_BLOCKS } from './openui/blocks.generated.ts';

/** Run names in the "Oakfolio diagnostics" project. */
export const TRACE_RUN = {
  turn: 'Oak turn',
  modelStep: 'Model step',
  search: 'search',
  lostCopy: 'Lost copy',
  arrange: 'Arrange',
  webSynthesis: 'Web synthesis',
} as const;

/** A billed provider call outside a model step's own run, by run name. */
export type ProviderCallName = typeof TRACE_RUN.lostCopy | typeof TRACE_RUN.arrange | typeof TRACE_RUN.webSynthesis;
export const PROVIDER_CALL_NAMES: readonly ProviderCallName[] = [TRACE_RUN.lostCopy, TRACE_RUN.arrange, TRACE_RUN.webSynthesis];

/** The error a provider call run carries when its charge was never read. */
export const PROVIDER_CHARGE_UNREAD = 'Provider charge unread';

/** Metadata keys a reading looks at on a run (`extra.metadata`). */
export const TRACE_META = { audience: 'audience', reconciliation: 'reconciliation', retrieval: 'retrieval', openui: 'openui' } as const;

/** Metadata values a reading matches on. */
export const TRACE_MARKERS = {
  ownerTestAudience: 'owner-test',
  reconciliationMismatch: 'mismatch',
  arrangeFallback: 'fallback',
  searchAborted: 'aborted',
  noDegradation: 'none',
  privateContext: 'private-context',
  quotaStage: 'quota',
} as const;

/** R16: the blocks that count as structure in an arranged answer (cards and their companions included): each fragment's `structured`. */
export const STRUCTURED_COMPONENTS: readonly string[] = Object.values(OAK_OPENUI_BLOCKS).filter(block => block.structured).map(block => block.name);

/** Answer kinds that reached a visitor as an answer. */
export const ANSWERED_KINDS: readonly string[] = ['sourced', 'gap', 'clarify', 'proposal', 'role-fit', 'advice', 'contact', 'declined', 'document'];

/** Failure codes that are not runtime failures: a visitor's own Stop, the attempt rate limit, and the injection guardrail working. */
export const SELF_INFLICTED_FAILURES: readonly string[] = ['cancelled', 'attempt-rate-limited', 'injection-blocked'];
export const FAILURE_INVALID_ANSWER = 'invalid-answer';
export const FAILURE_INJECTION_BLOCKED = 'injection-blocked';
