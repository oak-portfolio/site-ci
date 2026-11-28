import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTsx } from "../design-rework/load-tsx.mjs";

// Ticket 325: a Stats tile whose sentence holds every word of its label keeps its number and drops the label; a label
// that adds a word stays, and a tile with a kind (ruling 100) keeps its label.
globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, location: { search: "" }, addEventListener() {}, removeEventListener() {} };
const flag = loadTsx("src/lib/oakFlags/metricKind.ts");
const { primeOakRecordFacts } = loadTsx("src/lib/oakRecordFacts.ts");
const { OakArrangedAnswer } = loadTsx("src/components/agent/OakOpenUIAnswer.tsx");

const REVISION = "k325";
const document = "work:ecosmartloop";
const citation = { documentId: document, passageId: `${document}:passage-001`, sectionId: document, url: "https://steveoak.com/work/ecosmartloop/" };
const claims = [
  "At San Francisco Bay University, the chatbot reached 1,000+ users and saw a reported 60% reduction in response time.",
  "At Uhttention, shipped systems grew organic traffic about 200% and cut cost per lead about 40%.",
].map((text, i) => ({ id: `claim-${i + 1}`, text, citations: [citation] }));
const answer = { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "c", hardPolicyVersion: "h", knowledgeRevision: REVISION, operations: [],
  kind: "sourced", acknowledgment: null, claims };
const PROGRAM = 'root = Answer([s])\ns = Stats([a, b])\na = Metric("Response time reduction", "60%", "claim-1")\nb = Metric("Organic traffic growth", "200%", "claim-2")';
const seed = metrics => primeOakRecordFacts(REVISION, { version: 1, knowledgeRevision: REVISION, records: { [document]: { kind: "work", metrics } } });
const render = on => {
  flag.forceOakMetricKind(on);
  try {
    return renderToStaticMarkup(createElement(OakArrangedAnswer, { id: "m325", answer, question: "What results did the chatbot and growth work report?", latest: true,
      ui: { requestId: "00000000-0000-4000-8000-000000032502", status: "done", program: PROGRAM } }));
  } finally { flag.forceOakMetricKind(null); }
};
const labels = html => [...html.matchAll(/class="oak-openui__metric-label">([^<]*)</g)].map(match => match[1]);
const numbers = html => (html.match(/class="oak-openui__metric"/g) ?? []).length;

test("T325-3: a Stats tile drops a label its sentence holds and keeps one that adds a word; both keep their number", () => {
  seed([]);
  const html = render(false);
  assert.equal(numbers(html), 2, "every tile keeps its number");
  assert.deepEqual(labels(html).filter(Boolean), ["Organic traffic growth"]);
});

test("T325-4: ruling 100, a kinded Stats tile keeps its label even when its sentence holds it", () => {
  seed([{ label: "Response time reduction", value: "60%", kind: "result" }]);
  const html = render(true);
  assert.ok(labels(html).includes("Response time reduction"), html);
});
