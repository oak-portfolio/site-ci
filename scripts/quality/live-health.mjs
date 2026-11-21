#!/usr/bin/env node
// Production health of the Oak AI Agent from its LangSmith traces, in one call.
// Usage: node scripts/quality/live-health.mjs [--hours 24 | --since <ISO time>] [--visitors] [--json | --bars | --components]
// Reads root "Oak turn" runs and "search" tool runs through the signed-in `langsmith` CLI.
// --visitors drops owner-test turns. Prints counts only; never answer text or keys.
// --bars prints one key=value line for the round's live gates (Q19-Q24): ledger ratio band, invalid answers, runtime failures,
// degraded searches, the busiest UTC day, parallel searches, arranged answers and the structured share of answered turns.
// --components prints one JSON line: picks, fallbacks and byte cuts per component from the turns' Arrange runs (ticket 08).
import { execFileSync } from 'node:child_process';
import { TRACE_MARKERS, TRACE_META, TRACE_RUN } from '../../packages/oak-agent-contracts/src/trace-names.ts';
import { componentHealth, count, formatBars, healthBars, meta, turnFacts } from './live-health-core.mjs';

const PROJECT = '1e150573-20a8-4ac6-a75b-6722468adb7a'; // "Oakfolio diagnostics"
const args = process.argv.slice(2);
const flag = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const hours = Number(flag('--hours')) || 24;
const visitorsOnly = args.includes('--visitors');
const sinceArg = flag('--since');
if (sinceArg !== undefined && Number.isNaN(Date.parse(sinceArg))) throw new Error('--since needs an ISO time');
const since = sinceArg ? new Date(sinceArg).toISOString() : new Date(Date.now() - hours * 3600e3).toISOString();

function query(body, cap = 1000) {
  const runs = [];
  let cursor;
  do {
    const page = JSON.parse(execFileSync('langsmith', ['api', 'runs/query', '--format', 'json', '-X', 'POST', '--input', '-'],
      { input: JSON.stringify({ session: [PROJECT], start_time: since, limit: 100, ...body, ...(cursor ? { cursor } : {}) }), encoding: 'utf8' }));
    runs.push(...page.runs);
    cursor = page.runs.length === 100 ? page.cursors?.next : null;
  } while (cursor && runs.length < cap);
  return runs;
}

const keep = run => !visitorsOnly || meta(run)[TRACE_META.audience] !== TRACE_MARKERS.ownerTestAudience;
const turns = query({ is_root: true, select: ['id', 'error', 'outputs', 'extra'] }).filter(keep);
const searches = query({ is_root: false, filter: `eq(name, "${TRACE_RUN.search}")`, select: ['id', 'trace_id', 'extra', 'start_time', 'end_time'] }).filter(keep);

const { failed, answered, failedBy, kinds } = turnFacts(turns);
const mismatches = turns.map(run => ({ id: run.id, r: meta(run)[TRACE_META.reconciliation] }))
  .filter(({ r }) => r?.state === TRACE_MARKERS.reconciliationMismatch)
  .map(({ id, r }) => ({ trace: id.slice(0, 8), ledger: r.ledgerActualMicroUsd, provider: r.providerMicroUsd,
    ratio: r.providerMicroUsd ? Math.round(r.ledgerActualMicroUsd / r.providerMicroUsd * 10) / 10 : null }));
const routes = count(searches, run => meta(run)[TRACE_META.retrieval]?.route);
const degraded = count(searches, run => { const d = meta(run)[TRACE_META.retrieval]?.degradation; return d && d !== TRACE_MARKERS.noDegradation ? d : null; });

const report = {
  hours, since, turns: turns.length, audiences: count(turns, run => meta(run)[TRACE_META.audience] ?? 'unknown'),
  failed: { count: failed.length, by: failedBy },
  kinds,
  ledgerMismatch: { count: mismatches.length, worst: mismatches.sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0)).slice(0, 3) },
  retrieval: { searches: searches.length, routes, degraded },
};

if (args.includes('--components')) {
  const ids = new Set(turns.map(run => run.id));
  const arranges = query({ is_root: false, filter: `eq(name, "${TRACE_RUN.arrange}")`, select: ['id', 'trace_id', 'extra'] }).filter(run => ids.has(run.trace_id));
  console.log(JSON.stringify({ hours, since, ...componentHealth(arranges) }));
} else if (args.includes('--json')) {
  console.log(JSON.stringify(report));
} else if (args.includes('--bars')) {
  // A model step past 7 s may have started a hedge copy, so the bars need the steps and each provider call by name.
  const steps = query({ is_root: false, filter: `eq(name, "${TRACE_RUN.modelStep}")`, select: ['trace_id', 'start_time', 'end_time'] });
  const providerCalls = name => query({ is_root: false, filter: `eq(name, "${name}")`, select: ['id', 'trace_id', 'extra', 'error'] });
  const lostCopies = providerCalls(TRACE_RUN.lostCopy), arranges = providerCalls(TRACE_RUN.arrange), webSyntheses = providerCalls(TRACE_RUN.webSynthesis);
  console.log(formatBars(healthBars({ turns, searches, steps, lostCopies, arranges, webSyntheses })));
} else {
  const pct = (n, of) => of ? `${Math.round(n / of * 100)}%` : 'n/a';
  const list = obj => Object.entries(obj).map(([k, v]) => `${k} ${v}`).join(', ') || 'none';
  console.log(`Live health, last ${hours} h${visitorsOnly ? ' (visitors only)' : ''}: ${report.turns} turns (${list(report.audiences)})`);
  console.log(`failed ${failed.length} (${list(report.failed.by)}); answers ${list(report.kinds)}; gap share ${pct(report.kinds.gap ?? 0, answered.length)}`);
  console.log(`ledger mismatch ${mismatches.length}${mismatches.length ? ` (worst ${report.ledgerMismatch.worst.map(m => `${m.ratio}x ${m.trace}`).join(', ')})` : ''}`);
  console.log(`retrieval ${searches.length} searches: ${list(routes)}; degraded ${list(degraded)} (${pct(Object.values(degraded).reduce((a, b) => a + b, 0), searches.length)})`);
}
