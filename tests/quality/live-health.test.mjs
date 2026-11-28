import assert from "node:assert/strict";
import { test } from "node:test";
import { failureCode, formatBars, healthBars, readRunsPage, RUNS_QUERY_PATH, runsQueryBody } from "../../scripts/quality/live-health-core.mjs";
import { PROVIDER_CHARGE_UNREAD, TRACE_RUN } from "../../packages/oak-agent-contracts/src/trace-names.ts";

// Retro arch 3: the live bars are one pure function over the runs the script queries, so each bar has a fixture here.
const at = (second) => new Date(Date.UTC(2026, 9, 26, 12, 0, second)).toISOString();
const turn = (id, { error, kind, reconciliation } = {}) => ({ id, ...(error ? { error } : {}),
  outputs: kind ? { answer: { kind } } : {}, extra: { metadata: { audience: "visitor", ...(reconciliation ? { reconciliation } : {}) } } });
const search = (trace_id, { start = 0, end = 1, retrieval = {} } = {}) => ({ trace_id, start_time: at(start), end_time: at(end),
  extra: { metadata: { retrieval: { embeddingConfigId: "cfg", route: "hybrid", degradation: "none", ...retrieval } } } });
const call = (trace_id, { error, openui } = {}) => ({ id: `${trace_id}-call`, trace_id, ...(error ? { error } : {}), extra: { metadata: openui ? { openui } : {} } });
const bars = (input) => healthBars({ searches: [], ...input });

test("an empty reading is all zeros and prints as one key=value line", () => {
  const empty = bars({ turns: [] });
  assert.equal(empty.turns, 0);
  assert.ok(Object.values(empty).every(value => value === 0), JSON.stringify(empty));
  assert.match(formatBars(empty), /^turns=0 reconciled=0 ledger-outside=0 ledger-worst=0 slow=0 lost-unread=0 invalid=0 failed=0 failed-runtime=0 injection-blocked=0 searches=0 degraded=0 degraded-pct=0 day-max=0 parallel=0 parallel-degraded=0 degraded-quota=0 arranged=0 structured=0 arrange-fallback=0 answered=0 structured-pct=0$/);
});

test("ledger-outside counts turns whose ledger/provider ratio leaves 0.8 to 1.25; ledger-worst is the highest ratio", () => {
  const r = (ledger, provider) => ({ ledgerActualMicroUsd: ledger, providerMicroUsd: provider });
  const result = bars({ turns: [turn("a", { reconciliation: r(100, 100) }), turn("b", { reconciliation: r(80, 100) }), turn("c", { reconciliation: r(126, 100) }),
    turn("d", { reconciliation: r(79, 100) }), turn("e", { reconciliation: r(5, 0) }), turn("f", { reconciliation: { ledgerActualMicroUsd: null, providerMicroUsd: 9 } })] });
  assert.equal(result.reconciled, 4, "a zero provider charge or a missing ledger read is not reconciled");
  assert.equal(result["ledger-outside"], 2);
  assert.equal(result["ledger-worst"], 1.26);
});

test("lost-unread counts Lost copy, Arrange and Web synthesis runs that read 'Provider charge unread', inside the turns only", () => {
  const result = bars({ turns: [turn("t1"), turn("t2")],
    lostCopies: [call("t1", { error: PROVIDER_CHARGE_UNREAD }), call("t1"), call("gone", { error: PROVIDER_CHARGE_UNREAD })],
    arranges: [call("t2", { error: PROVIDER_CHARGE_UNREAD }), call("t2", { error: "other" })],
    webSyntheses: [call("t2", { error: PROVIDER_CHARGE_UNREAD })] });
  assert.equal(result["lost-unread"], 3);
  assert.equal(PROVIDER_CHARGE_UNREAD, "Provider charge unread");
  assert.equal(TRACE_RUN.arrange, "Arrange");
});

test("invalid, failed, failed-runtime and injection-blocked split the failed turns by code", () => {
  const json = message => JSON.stringify({ message });
  const result = bars({ turns: [turn("a", { error: json("invalid-answer") }), turn("b", { error: json("evidence-envelope") }), turn("c", { error: json("cancelled") }),
    turn("d", { error: json("attempt-rate-limited") }), turn("e", { error: json("injection-blocked") }), turn("f", { error: "plain text failure" }), turn("g")] });
  assert.equal(result.failed, 6);
  assert.equal(result.invalid, 1);
  assert.equal(result["injection-blocked"], 1);
  assert.equal(result["failed-runtime"], 3, "invalid-answer, evidence-envelope and the plain failure; Stop, the rate limit and the guardrail are not runtime failures");
  assert.equal(failureCode({ error: "plain text failure" }), "plain text failure");
  assert.equal(failureCode({ error: "x".repeat(60) }), "x".repeat(40));
});

test("searches counts semantic searches in the turns; a stopped search is neither semantic nor degraded", () => {
  const result = bars({ turns: [turn("t")], searches: [search("t"), search("t", { retrieval: { degradation: "deadline" } }), search("t", { retrieval: { outcome: "aborted", degradation: null } }),
    search("t", { retrieval: { embeddingConfigId: undefined } }), search("other")] });
  assert.equal(result.searches, 2);
  assert.equal(result.degraded, 1);
  assert.equal(result["degraded-pct"], 50);
});

test("degraded counts any named fallback but not none or private-context; degraded-quota names the quota stage", () => {
  const result = bars({ turns: [turn("t")], searches: [search("t", { retrieval: { degradation: "private-context" } }), search("t", { retrieval: { degradation: "unavailable" } }),
    search("t", { retrieval: { degradation: "deadline", degradationStage: "quota" } }), search("t", { retrieval: { degradation: "deadline", degradationStage: "embed" } }), search("t")] });
  assert.equal(result.searches, 5);
  assert.equal(result.degraded, 3);
  assert.equal(result["degraded-quota"], 1);
  assert.equal(result["degraded-pct"], 60);
});

test("day-max is the busiest UTC day; parallel counts searches that overlap inside one turn", () => {
  const day = (date, id) => ({ ...search(id), start_time: `${date}T10:00:00.000Z`, end_time: `${date}T10:00:01.000Z` });
  const result = bars({ turns: [turn("t"), turn("u")], searches: [day("2026-10-25", "t"), day("2026-10-26", "t"), day("2026-10-26", "u"),
    search("t", { start: 0, end: 5 }), search("t", { start: 3, end: 8, retrieval: { degradation: "deadline" } })] });
  assert.equal(result["day-max"], 4, "four of the five searches fall on the 26th");
  assert.equal(result.parallel, 2);
  assert.equal(result["parallel-degraded"], 1);
  assert.equal(bars({ turns: [turn("t")], searches: [search("t", { start: 0, end: 2 }), search("t", { start: 2, end: 4 })] }).parallel, 0, "touching is not overlapping");
});

test("slow counts turns with a model step over 7 s, once per turn", () => {
  const step = (trace_id, seconds) => ({ trace_id, start_time: at(0), end_time: at(seconds) });
  assert.equal(bars({ turns: [turn("t"), turn("u")], steps: [step("t", 8), step("t", 9), step("u", 7), step("gone", 20)] }).slow, 1);
});

test("arranged, structured and arrange-fallback read the Arrange runs' openui metadata", () => {
  const arrange = (id, openui) => call(id, { openui });
  const result = bars({ turns: [turn("a", { kind: "sourced" }), turn("b", { kind: "gap" }), turn("c", { kind: "advice" }), turn("d", { kind: "sourced" })],
    arranges: [arrange("a", { outcome: "done", components: ["Prose", "Steps"] }), arrange("b", { outcome: "done", components: ["Prose", "Callout"] }),
      arrange("c", { outcome: "fallback", components: [] }), arrange("d", { outcome: "done", components: ["Project"] }), arrange("gone", { outcome: "done", components: ["Steps"] })] });
  assert.equal(result.arranged, 4);
  assert.equal(result.structured, 2, "Steps and Project are structure; Prose and Callout alone are not");
  assert.equal(result["arrange-fallback"], 1);
});

test("structured-pct is structured arranges over answered turns, rounded to one decimal", () => {
  const turns = [turn("a", { kind: "sourced" }), turn("b", { kind: "gap" }), turn("c", { kind: "advice" }), turn("d", { kind: "document" }), turn("e", { kind: "nonsense" }), turn("f")];
  const result = bars({ turns, arranges: [call("a", { openui: { outcome: "done", components: ["Steps"] } }), call("b", { openui: { outcome: "done", components: ["Meter"] } }),
    call("c", { openui: { outcome: "done", components: ["Role"] } })] });
  assert.equal(result.answered, 4, "only the listed answer kinds count");
  assert.equal(result["structured-pct"], 75);
  assert.equal(bars({ turns: [turn("a", { kind: "sourced" }), turn("b", { kind: "gap" }), turn("c", { kind: "advice" })],
    arranges: [call("a", { openui: { outcome: "done", components: ["Steps"] } })] })["structured-pct"], 33.3);
});

// LangSmith removes POST /api/v1/runs/query on 2027-01-31 (SmithDB migration guide, "Query runs").
test("runs query uses the v2 endpoint and its body fields", () => {
  assert.equal(RUNS_QUERY_PATH, "/api/v2/runs/query");
  const body = runsQueryBody({ project: "p-1", since: "2026-11-25T00:00:00.000Z",
    query: { is_root: false, filter: 'eq(name, "search")', select: ["id", "trace_id", "extra", "start_time", "end_time"] } });
  assert.deepEqual(body, { project_ids: ["p-1"], min_start_time: "2026-11-25T00:00:00.000Z", page_size: 100,
    is_root: false, filter: 'eq(name, "search")', selects: ["ID", "TRACE_ID", "EXTRA", "START_TIME", "END_TIME"] });
  for (const old of ["session", "start_time", "limit", "select"]) assert.equal(old in body, false, `no v1 field ${old}`);
  assert.equal(runsQueryBody({ project: "p-1", since: "t", query: { is_root: true }, cursor: "c2" }).cursor, "c2");
});

test("a v2 runs page reads items and next_cursor", () => {
  assert.deepEqual(readRunsPage({ items: [{ id: "a" }], next_cursor: "n" }), { runs: [{ id: "a" }], next: "n" });
  assert.deepEqual(readRunsPage({ items: [], next_cursor: null }), { runs: [], next: null });
  assert.deepEqual(readRunsPage({ items: [{ id: "a" }] }), { runs: [{ id: "a" }], next: null });
});
