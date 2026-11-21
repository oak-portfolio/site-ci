import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createLoader, loadTsx, stubSets } from "../design-rework/load-tsx.mjs";

// Ticket 43a: a metric's kind (result, context, scope) decides its chip and whether it is the display tile, behind oakMetricKind.
globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, location: { search: "" }, addEventListener() {}, removeEventListener() {} };
const flag = loadTsx("src/lib/oakFlags/metricKind.ts");
const { primeOakRecordFacts } = loadTsx("src/lib/oakRecordFacts.ts");
const { OakArrangedAnswer } = loadTsx("src/components/agent/OakOpenUIAnswer.tsx");

const REVISION = "k43";
const document = "work:ecosmartloop";
const citation = { documentId: document, passageId: `${document}:passage-001`, sectionId: document, url: "https://steveoak.com/work/ecosmartloop/" };
const CLAIMS = [
  { id: "claim-1", text: "Sorting accuracy rose to 92% in the pilot." },
  { id: "claim-2", text: "LEAF Engine had 8K+ images of training context behind it." },
  { id: "claim-3", text: "UNEP projects $640.3B in annual waste cost by 2050, not an EcoSmartLoop outcome." },
];
const answer = { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "c", hardPolicyVersion: "h", knowledgeRevision: REVISION, operations: [],
  kind: "sourced", acknowledgment: null, claims: CLAIMS.map(claim => ({ ...claim, citations: [citation] })) };
const ALL = [{ label: "Accuracy", value: "92%", kind: "result" }, { label: "Dataset", value: "8K+", kind: "scope" }, { label: "Global problem", value: "$640.3B", kind: "context" }];
const seed = (metrics, extra = {}) => primeOakRecordFacts(REVISION, { version: 1, knowledgeRevision: REVISION, records: metrics ? { [document]: { kind: "work", metrics, ...extra } } : {} });
const STATS = 'root = Answer([nums])\nnums = Stats([a, b, c])\na = Metric("Accuracy", "92%", "claim-1")\nb = Metric("Dataset", "8K+", "claim-2")\nc = Metric("Global problem", "$640.3B", "claim-3")';
const ONE = name => `root = Answer([m])\nm = Metric("${name}", "${ALL.find(metric => metric.label === name).value}", "claim-${ALL.findIndex(metric => metric.label === name) + 1}")`;
const render = (program, on, status = "done", claimsOf = claim => claim) => {
  flag.forceOakMetricKind(on);
  try {
    const claims = answer.claims.filter(claim => program.includes(`"${claim.id}"`)).map(claimsOf);
    return renderToStaticMarkup(createElement(OakArrangedAnswer, { id: "m1", answer: { ...answer, claims }, question: "What results did EcoSmartLoop have?", latest: true,
      ui: { requestId: "00000000-0000-4000-8000-000000004301", status, program } }));
  } finally { flag.forceOakMetricKind(null); }
};
const tiles = html => html.split('class="oak-openui__metric-value"').length - 1;
const text = html => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

test("constant: oakMetricKind ships false and a force flips it", () => {
  assert.equal(flag.oakMetricKind, false);
  assert.equal(flag.oakMetricKindOn(), false);
  flag.forceOakMetricKind(true);
  assert.equal(flag.oakMetricKindOn(), true);
  flag.forceOakMetricKind(null);
  assert.equal(flag.oakMetricKindOn(), false);
});

test("a context or scope metric never renders as the display tile, and its chip says so", () => {
  seed(ALL);
  for (const name of ["Dataset", "Global problem"]) {
    const html = render(ONE(name), true);
    assert.equal(tiles(html), 0, `${name} is not a display tile`);
    assert.match(text(html), name === "Dataset" ? /\bScope\b/ : /\bContext\b/);
    assert.match(html, /data-kind="(scope|context)"/);
  }
  const result = render(ONE("Accuracy"), true);
  assert.equal(tiles(result), 1, "a result is the display tile");
  assert.match(text(result), /\bResult\b/);
});

test("Stats sets the result first as the one display tile, then scope, then context as small rows", () => {
  seed(ALL);
  const html = render(STATS, true);
  assert.equal(tiles(html), 1);
  const order = ["92%", "8K+", "$640.3B"].map(value => html.indexOf(value));
  assert.ok(order[0] < order[1] && order[1] < order[2], `order ${order}`);
  assert.doesNotMatch(html, /No measured result yet/);
});

test("a record with kinds and no result reads No measured result yet, first", () => {
  seed(ALL.filter(metric => metric.kind !== "result"));
  const html = render('root = Answer([nums])\nnums = Stats([b, c])\nb = Metric("Dataset", "8K+", "claim-2")\nc = Metric("Global problem", "$640.3B", "claim-3")', true);
  assert.equal(tiles(html), 0);
  assert.match(html, /No measured result yet/);
  assert.ok(html.indexOf("No measured result yet") < html.indexOf("8K+"));
});

const SCOPE_ONLY = 'root = Answer([nums])\nnums = Stats([b, c])\nb = Metric("Dataset", "8K+", "claim-2")\nc = Metric("Global problem", "$640.3B", "claim-3")';

test("a record with a result that the Stats leaves out shows no No measured result yet row", () => {
  seed(ALL);
  assert.doesNotMatch(render(SCOPE_ONLY, true), /No measured result yet/);
});

test("a result tile shows the record's period beside its kind, and no period on the record means no period line", () => {
  seed(ALL, { period: "September to December 2025" });
  const html = render(ONE("Accuracy"), true);
  assert.match(html, /class="oak-openui__metric-period"[^>]*>September to December 2025</);
  assert.doesNotMatch(render(ONE("Dataset"), true), /oak-openui__metric-period/);
  seed(ALL);
  assert.doesNotMatch(render(ONE("Accuracy"), true), /oak-openui__metric-period/);
});

test("one page across every tile still keeps the result tile's source chip", () => {
  seed(ALL, { period: "September to December 2025" });
  const html = render(STATS, true);
  assert.match(html, /data-one-page/);
  const result = html.slice(html.indexOf('data-kind="result"'), html.indexOf('data-kind="scope"'));
  assert.match(result, /oak-source-chip/);
  const css = readFileSync("src/styles/openui/stats.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const hides = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter(([, selector, body]) => /\[data-one-page\]/.test(selector) && /oak-source-chip/.test(selector) && /display:\s*none/.test(body));
  assert.ok(hides.length > 0, "the one-page rule still hides the other tiles' chips");
  for (const [, selector] of hides) for (const part of selector.split(","))
    assert.match(part, /:not\([^{]*\[data-kind="result"\]/, `a one-page hide spares the result tile: ${part.trim()}`);
});

test("a value takes its kind by the whole value, never by a shared prefix", () => {
  seed([{ label: "Dataset", value: "8K+", kind: "scope" }, { label: "Labels", value: "8K+ labeled images", kind: "result" }]);
  assert.match(render(ONE("Dataset"), true), /data-kind="scope"/);
  seed([{ label: "Dataset", value: "8K+ images", kind: "scope" }]);
  assert.match(render(ONE("Dataset"), true), /data-kind="scope"/, "the number of a value with its unit still matches");
  seed([{ label: "Images", value: "8K+ images", kind: "scope" }, { label: "Labels", value: "8K+ labels", kind: "result" }]);
  assert.doesNotMatch(render(ONE("Dataset"), true), /data-kind=/, "two values sharing the number decide no kind");
});

test("every citation of a claim is read, not only the first", () => {
  const other = "work:oakminder";
  seed(null);
  primeOakRecordFacts(REVISION, { version: 1, knowledgeRevision: REVISION, records: { [other]: { kind: "work", metrics: [] }, [document]: { kind: "work", metrics: ALL } } });
  const first = { documentId: other, passageId: `${other}:passage-001`, sectionId: other, url: "https://steveoak.com/work/oakminder/" };
  const html = render(ONE("Accuracy"), true, "done", claim => ({ ...claim, citations: [first, citation] }));
  assert.match(html, /data-kind="result"/);
});

test("tile order does not change when the stream settles", () => {
  seed(ALL);
  const program = 'root = Answer([nums])\nnums = Stats([c, b, a])\na = Metric("Accuracy", "92%", "claim-1")\nb = Metric("Dataset", "8K+", "claim-2")\nc = Metric("Global problem", "$640.3B", "claim-3")';
  const order = html => ["92%", "8K+", "$640.3B"].map(value => html.indexOf(value)).map((at, index, all) => all.filter(other => other < at).length);
  assert.deepEqual(order(render(program, true, "streaming")), order(render(program, true, "done")));
  assert.deepEqual(order(render(program, true, "done")), [0, 1, 2]);
});

test("a metric with no kind renders as today", () => {
  seed(ALL.map(({ label, value }) => ({ label, value })));
  assert.equal(render(STATS, true), render(STATS, false));
  seed(null);
  assert.equal(render(STATS, true), render(STATS, false));
});

test("with the constant off, a kinded record renders every Metric and Stats program as before", () => {
  seed(null);
  const before = [render(STATS, false), ...ALL.map(metric => render(ONE(metric.label), false))];
  seed(ALL);
  assert.deepEqual([render(STATS, false), ...ALL.map(metric => render(ONE(metric.label), false))], before);
  assert.doesNotMatch(before.join(""), /data-kind=|No measured result yet/);
});

test("the record-facts asset carries kind, and a do-not-publish metric never appears", async () => {
  const entry = { id: "fixture.mdx", data: { dek: "d", card: { category: "c", image: "/assets/work/ecosmartloop/ecosmartloop-cover.png", imageAlt: "a" }, articleStatus: "full", timeline: "September to December 2025",
    datePublished: new Date("2026-01-01"), systemMap: [], artifacts: [], metrics: [
      { label: "Accuracy", value: "92%", status: "verified", note: "n", kind: "result" },
      { label: "Dataset", value: "8K+ images", status: "verified", note: "n" },
      { label: "Revenue", value: "$1M", status: "do-not-publish", note: "n", kind: "result" },
      { label: "Reach", value: "10K", status: "needs-oak", note: "n", kind: "result" }] } };
  const load = createLoader({ use: [stubSets.icons], interop: true, stubs: {
    "@/lib/workContent": { getWorkEntries: async () => [entry], getWorkSlug: () => "ecosmartloop" } } });
  const { oakRecordFacts } = load("src/lib/oakRecordFacts.server.ts");
  const facts = (await oakRecordFacts()).records[document];
  assert.deepEqual(facts.metrics, [{ label: "Accuracy", value: "92%", kind: "result" }, { label: "Dataset", value: "8K+ images" }]);
  assert.equal(facts.period, "September to December 2025");
  assert.doesNotMatch(JSON.stringify(facts), /Revenue|\$1M|Reach/);
});

test("the content schema takes an optional kind of result, context or scope", () => {
  const config = readFileSync("src/content.config.ts", "utf8");
  assert.match(config, /kind: z\.enum\(\["result", "context", "scope"\]\)\.optional\(\)/);
});
