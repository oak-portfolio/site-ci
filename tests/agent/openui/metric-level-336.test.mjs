import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTsx } from "../design-rework/load-tsx.mjs";

// Ticket 336: when ticket 325 drops a Stats tile's label, the tile renders no label element, and side by side the row
// keeps a label slot so both numbers sit on one line.
globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, location: { search: "" }, addEventListener() {}, removeEventListener() {} };
const flag = loadTsx("src/lib/oakFlags/metricKind.ts");
const { primeOakRecordFacts } = loadTsx("src/lib/oakRecordFacts.ts");
const { OakArrangedAnswer } = loadTsx("src/components/agent/OakOpenUIAnswer.tsx");

const REVISION = "k336";
const document = "work:ecosmartloop";
const citation = { documentId: document, passageId: `${document}:passage-001`, sectionId: document, url: "https://steveoak.com/work/ecosmartloop/" };
const claims = [
  "LEAF Engine was trained on 8K+ training images gathered across the pilot sites.",
  "At Uhttention, shipped systems grew organic traffic about 200% and cut cost per lead about 40%.",
].map((text, i) => ({ id: `claim-${i + 1}`, text, citations: [citation] }));
const answer = { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "c", hardPolicyVersion: "h", knowledgeRevision: REVISION, operations: [],
  kind: "sourced", acknowledgment: null, claims };
const PROGRAM = 'root = Answer([s])\ns = Stats([a, b])\na = Metric("Training images", "8K+", "claim-1")\nb = Metric("Outcomes", "200%", "claim-2")';
const render = () => {
  primeOakRecordFacts(REVISION, { version: 1, knowledgeRevision: REVISION, records: { [document]: { kind: "work", metrics: [] } } });
  flag.forceOakMetricKind(false);
  try {
    return renderToStaticMarkup(createElement(OakArrangedAnswer, { id: "m336", answer, question: "What did LEAF Engine and Uhttention report?", latest: true,
      ui: { requestId: "00000000-0000-4000-8000-000000033601", status: "done", program: PROGRAM } }));
  } finally { flag.forceOakMetricKind(null); }
};

test("T336-1: a dropped label renders no label element; the kept label and both numbers stay", () => {
  const html = render();
  assert.equal((html.match(/class="oak-openui__metric-value"/g) ?? []).length, 2, "both tiles keep their number");
  const labels = [...html.matchAll(/<span class="oak-openui__metric-label">([^<]*)<\/span>/g)].map(match => match[1]);
  assert.deepEqual(labels, ["Outcomes"], "only the kept label renders, and no empty label span");
});

const css = readFileSync(new URL("../../../src/styles/openui/metric.css", import.meta.url), "utf8");

test("T336-2: side by side, a Stats tile's number sits under a fixed label slot, so a dropped label moves no number", () => {
  const block = css.match(/@container oak-openui \(min-width: 520px\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
  const rule = selector => block.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
  const row = ".oak-openui-stats:not([data-uneven]) .oak-openui-stats__tile .oak-openui__metric-value";
  assert.match(rule(row), /display:\s*grid/);
  assert.match(rule(row), /grid-template-rows:\s*minmax\(var\(--leading-ui\), auto\) auto/);
  assert.match(rule(`${row} > .oak-openui__metric-label`), /grid-row:\s*1/);
  assert.match(rule(`${row} > span:first-child`), /grid-row:\s*2/);
  assert.doesNotMatch(css, /letter-spacing:\s*-/);
});
