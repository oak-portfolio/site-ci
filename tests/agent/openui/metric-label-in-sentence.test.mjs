import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTsx } from "../design-rework/load-tsx.mjs";

// Ticket 309: a lone Metric whose sentence holds its label and number shows the sentence alone; inside Stats (ruling 99)
// or with a kind or period (ruling 100) the tile adds something, so it keeps its number.
globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, location: { search: "" }, addEventListener() {}, removeEventListener() {} };
const flag = loadTsx("src/lib/oakFlags/metricKind.ts");
const { primeOakRecordFacts } = loadTsx("src/lib/oakRecordFacts.ts");
const { OakArrangedAnswer } = loadTsx("src/components/agent/OakOpenUIAnswer.tsx");

const REVISION = "k309";
const document = "work:ecosmartloop";
const citation = { documentId: document, passageId: `${document}:passage-001`, sectionId: document, url: "https://steveoak.com/work/ecosmartloop/" };
const claim = { id: "claim-1", text: "Sorting accuracy rose to 92% in the pilot.", citations: [citation] };
const answer = { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "c", hardPolicyVersion: "h", knowledgeRevision: REVISION, operations: [],
  kind: "sourced", acknowledgment: null, claims: [claim] };
const LONE = 'root = Answer([m])\nm = Metric("Accuracy", "92%", "claim-1")';
const IN_STATS = 'root = Answer([s])\ns = Stats([m])\nm = Metric("Accuracy", "92%", "claim-1")';
const seed = metrics => primeOakRecordFacts(REVISION, { version: 1, knowledgeRevision: REVISION, records: { [document]: { kind: "work", metrics } } });
const render = (program, on) => {
  flag.forceOakMetricKind(on);
  try {
    return renderToStaticMarkup(createElement(OakArrangedAnswer, { id: "m309", answer, question: "What results did EcoSmartLoop have?", latest: true,
      ui: { requestId: "00000000-0000-4000-8000-000000030901", status: "done", program } }));
  } finally { flag.forceOakMetricKind(null); }
};
const tile = html => /class="oak-openui__metric"/.test(html);

test("T309-6: a lone Metric with no kind whose sentence holds Accuracy and 92% shows the sentence alone; inside Stats it keeps its tile", () => {
  seed([{ label: "Accuracy", value: "92%" }]);
  assert.equal(tile(render(LONE, true)), false, "no kind: sentence alone");
  assert.equal(tile(render(LONE, false)), false, "constant off: sentence alone");
  assert.equal(tile(render(IN_STATS, false)), true, "ruling 99: a Stats tile keeps its number");
});

test("T309-7: ruling 100, a lone kinded Metric whose sentence holds its label and figure keeps its tile and its kind", () => {
  seed([{ label: "Accuracy", value: "92%", kind: "result" }]);
  const html = render(LONE, true);
  assert.equal(tile(html), true, "the kind adds what the sentence lacks");
  assert.match(html, /data-kind="result"/);
  assert.match(html, /class="oak-openui__metric-value"/, "the result is the display tile");
});
