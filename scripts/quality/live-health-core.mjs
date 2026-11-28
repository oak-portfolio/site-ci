// The counting behind `live-health.mjs --bars`, as pure functions over the runs the script queries (retro arch 3).
// No I/O here: the script fetches LangSmith runs and prints; tests/quality/live-health.test.mjs feeds fixtures to each bar.
// Run names, markers and metadata keys come from the trace vocabulary the Worker writes (trace-names.ts).
import {
  ANSWERED_KINDS, FAILURE_INJECTION_BLOCKED, FAILURE_INVALID_ANSWER, PROVIDER_CHARGE_UNREAD, SELF_INFLICTED_FAILURES, STRUCTURED_COMPONENTS,
  TRACE_MARKERS, TRACE_META,
} from '../../packages/oak-agent-contracts/src/trace-names.ts';

// A model step past 7 s may have started a hedge copy (it does when no data came by then), so these turns exercise hedge settlement.
const HEDGE_STEP_MS = 7000;
// The ledger and the provider agree when their ratio stays inside this band.
const LEDGER_BAND = [0.8, 1.25];

// LangSmith's SmithDB runs query; POST /api/v1/runs/query stops working on 2027-01-31.
// v2 renames session -> project_ids, start_time -> min_start_time, limit -> page_size, and takes uppercase selects.
export const RUNS_QUERY_PATH = '/api/v2/runs/query';
export const RUNS_PAGE_SIZE = 100;

export function runsQueryBody({ project, since, query: { select, ...rest }, cursor }) {
  return {
    project_ids: [project], min_start_time: since, page_size: RUNS_PAGE_SIZE, ...rest,
    ...(select ? { selects: select.map(field => field.toUpperCase()) } : {}),
    ...(cursor ? { cursor } : {}),
  };
}

export const readRunsPage = page => ({ runs: page.items ?? [], next: page.next_cursor ?? null });

export const meta = run => run.extra?.metadata ?? {};
export const count = (list, key) => list.reduce((acc, item) => { const k = key(item); if (k) acc[k] = (acc[k] ?? 0) + 1; return acc; }, {});

// The arrange call's fallback reason when its program passed the byte cap (workers/oak-agent/src/openui/arrange.ts read).
export const BYTE_CUT = 'size';

/**
 * Ticket 08 (ARCH-REVIEW A12): picks, fallbacks and byte-cap cuts per component over `{ outcome, components, reason }` items,
 * the Arrange run's `openui` metadata or a probe run. A fallback that names no component is counted as unattributed.
 */
export function componentCounts(items) {
  const components = {}, unattributed = { fallbacks: 0, byteCuts: 0 };
  for (const { outcome, components: names = [], reason } of items) {
    const fell = outcome === TRACE_MARKERS.arrangeFallback, cut = fell && reason === BYTE_CUT;
    if (fell && !names.length) { unattributed.fallbacks++; if (cut) unattributed.byteCuts++; }
    for (const name of new Set(names)) {
      const entry = components[name] ??= { picks: 0, fallbacks: 0, byteCuts: 0 };
      if (!fell) entry.picks++;
      else { entry.fallbacks++; if (cut) entry.byteCuts++; }
    }
  }
  return { components, unattributed };
}

/** `--components`: per-component counts over the turns' Arrange runs; a run with no `openui` metadata is unrecorded. */
export function componentHealth(arranges) {
  const recorded = arranges.map(run => meta(run)[TRACE_META.openui]).filter(openui => openui?.outcome);
  return { arranged: arranges.length, ...componentCounts(recorded), unrecorded: arranges.length - recorded.length };
}

/** A failed root run's code: the JSON error's message, else the first 40 characters of the error text. */
export const failureCode = run => { try { return JSON.parse(run.error).message; } catch { return String(run.error).slice(0, 40); } };

/** The failed and answered root runs, failed turns by code, and the answered turns' answer kinds. */
export function turnFacts(turns) {
  const failed = turns.filter(run => run.error);
  const answered = turns.filter(run => run.outputs?.answer);
  return { failed, answered, failedBy: count(failed, failureCode), kinds: count(answered, run => run.outputs.answer.kind) };
}

/**
 * The round's live gates from the queried runs. `turns` are root "Oak turn" runs and `searches` the "search" tool runs, both
 * already filtered (visitors only, when asked); `steps` are "Model step" runs; `lostCopies`, `arranges` and `webSyntheses`
 * are the provider call runs by name. Steps and provider calls count only inside one of `turns`.
 * Returns the bar object, keys in print order.
 */
export function healthBars({ turns, searches, steps = [], lostCopies = [], arranges: allArranges = [], webSyntheses = [] }) {
  const ids = new Set(turns.map(run => run.id));
  const inTurns = runs => runs.filter(run => ids.has(run.trace_id));
  const { failed, failedBy, kinds } = turnFacts(turns);

  const reconciled = turns.map(run => meta(run)[TRACE_META.reconciliation]).filter(r => r && r.providerMicroUsd > 0 && Number.isInteger(r.ledgerActualMicroUsd));
  const outside = reconciled.filter(r => { const ratio = r.ledgerActualMicroUsd / r.providerMicroUsd; return ratio < LEDGER_BAND[0] || ratio > LEDGER_BAND[1]; }).length;
  const worst = reconciled.reduce((max, r) => Math.max(max, r.ledgerActualMicroUsd / r.providerMicroUsd), 0);
  const hedged = new Set(inTurns(steps).filter(run => Date.parse(run.end_time) - Date.parse(run.start_time) > HEDGE_STEP_MS).map(run => run.trace_id)).size;

  // R8: a search the visitor stopped (outcome "aborted", degradation null) never reached a route, so it is neither a semantic
  // answer nor a fallback; counting it read three QA Stop clicks as 7.9% degraded.
  const retrieval = run => meta(run)[TRACE_META.retrieval];
  const semantic = inTurns(searches).filter(run => retrieval(run)?.embeddingConfigId && retrieval(run)?.outcome !== TRACE_MARKERS.searchAborted);
  // Any fallback counts (unavailable, or a named stage such as deadline since Q20-G3); private-context is the privacy rule, not a failure.
  const fellBack = run => ![TRACE_MARKERS.noDegradation, TRACE_MARKERS.privateContext, undefined, null].includes(retrieval(run)?.degradation);
  const degradedCount = semantic.filter(fellBack).length;
  const perDay = count(semantic, run => run.start_time?.slice(0, 10));
  const byTrace = Object.groupBy(semantic, run => run.trace_id);
  const overlapping = Object.values(byTrace).flatMap(group => group.filter(run => group.some(other => other !== run &&
    Date.parse(other.start_time) < Date.parse(run.end_time) && Date.parse(other.end_time) > Date.parse(run.start_time))));

  // RETRO Q19: a lost copy whose charge was never read settles on an estimate, so live reconciliation cannot vouch for it.
  // R24 (live trace 132693ba): an Arrange or Web synthesis call cut off mid-stream reads "Provider charge unread" too;
  // every provider call run with that error counts.
  const arranges = inTurns(allArranges);
  const lostUnread = [...inTurns(lostCopies), ...arranges, ...inTurns(webSyntheses)].filter(run => run.error === PROVIDER_CHARGE_UNREAD).length;
  // R16: the cards (Project, Role, Source) and their companions (Stack, Stats) are structure too.
  const structured = arranges.filter(run => (meta(run)[TRACE_META.openui]?.components ?? []).some(name => STRUCTURED_COMPONENTS.includes(name))).length;
  // R16: the share of answered turns that reached the visitor with structure; the round's bar is structured-pct >= 50.
  const answeredTurns = ANSWERED_KINDS.reduce((sum, kind) => sum + (kinds[kind] ?? 0), 0);
  const arrangeFallback = arranges.filter(run => meta(run)[TRACE_META.openui]?.outcome === TRACE_MARKERS.arrangeFallback).length;
  // RETRO Q24 round 12: two evidence-envelope failures sat inside failed=8 next to five rate-limited turns from a QA burst,
  // and no bar named them. failed-runtime counts every failure except a visitor's own Stop and the attempt rate limit.
  // R19: a blocked injection is the guardrail working, reported on its own, not a runtime failure.
  const runtimeFailed = Object.entries(failedBy).filter(([code]) => !SELF_INFLICTED_FAILURES.includes(code)).reduce((sum, [, n]) => sum + n, 0);

  return {
    turns: turns.length, reconciled: reconciled.length, 'ledger-outside': outside, 'ledger-worst': Math.round(worst * 100) / 100, slow: hedged, 'lost-unread': lostUnread,
    invalid: failedBy[FAILURE_INVALID_ANSWER] ?? 0, failed: failed.length, 'failed-runtime': runtimeFailed, 'injection-blocked': failedBy[FAILURE_INJECTION_BLOCKED] ?? 0,
    searches: semantic.length, degraded: degradedCount, 'degraded-pct': semantic.length ? Math.round(degradedCount / semantic.length * 1000) / 10 : 0,
    'day-max': Math.max(0, ...Object.values(perDay)), parallel: overlapping.length, 'parallel-degraded': overlapping.filter(fellBack).length,
    // RETRO Q20/Q24: QA traffic spent the per-visitor day once; name the quota stage so a reading shows why it fell back.
    'degraded-quota': semantic.filter(run => retrieval(run)?.degradationStage === TRACE_MARKERS.quotaStage).length,
    arranged: arranges.length, structured, 'arrange-fallback': arrangeFallback,
    answered: answeredTurns, 'structured-pct': answeredTurns ? Math.round(structured / answeredTurns * 1000) / 10 : 0,
  };
}

/** The bar object as the one `key=value` line `--bars` prints. */
export const formatBars = bars => Object.entries(bars).map(([key, value]) => `${key}=${value}`).join(' ');
