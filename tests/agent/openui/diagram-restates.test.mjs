import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTsx } from "../design-rework/load-tsx.mjs";

// Ticket 326 (ruling A): a flow or layers Diagram draws no figure in a gap answer, or when its lead holds every step label.
globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, location: { search: "" }, addEventListener() {}, removeEventListener() {} };
const flag = loadTsx("src/lib/oakFlags/diagram.ts");
const { primeOakRecordFacts } = loadTsx("src/lib/oakRecordFacts.ts");
const { OakArrangedAnswer } = loadTsx("src/components/agent/OakOpenUIAnswer.tsx");

const REVISION = "k326";
const STEPS = ["Scan", "Classify", "Explain", "Record", "Repeat"];
const cite = { documentId: "work:ecosmartloop", passageId: "work:ecosmartloop:passage-001", sectionId: "work:ecosmartloop", url: "https://steveoak.com/work/ecosmartloop/" };
primeOakRecordFacts(REVISION, { version: 1, knowledgeRevision: REVISION,
  records: { "work:ecosmartloop": { kind: "work", systemMap: STEPS.map(label => ({ label, description: `${label} step.` })) } } });
const render = (lead, kind = "sourced", preset = "flow") => renderToStaticMarkup(createElement(OakArrangedAnswer, { id: "m326", question: "How does EcoSmartLoop work?", latest: true,
  answer: { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "c", hardPolicyVersion: "h", knowledgeRevision: REVISION, operations: [], kind,
    acknowledgment: kind === "gap" ? "The pages do not define its layers." : null, claims: [{ id: "claim-1", text: lead, citations: [cite] }] },
  ui: { requestId: "00000000-0000-4000-8000-000000000326", status: "done", program: `root = Answer([d])\nd = Diagram("claim-1", "${preset}")` } }));
const taught = fn => {
  flag.forceOakDiagramBlock(true); flag.forceOakDiagramPresets(["flow", "layers", "blockdiag"]);
  try { return fn(); } finally { flag.forceOakDiagramBlock(null); flag.forceOakDiagramPresets(null); }
};
const ADDS = "EcoSmartLoop scans an item at the bin and explains the answer.";
const HELD = "EcoSmartLoop runs scan, classify, explain, record and repeat at the bin.";
taught(() => render(ADDS));
await new Promise(setImmediate);

const figure = html => html.includes("oak-diagram__canvas");

test("T326 a flow whose labels add words its lead lacks draws its figure after the lead", () => taught(() => {
  const html = render(ADDS);
  assert.ok(figure(html), html);
  assert.ok(html.indexOf("oak-diagram__lead") < html.indexOf("oak-diagram__canvas"));
}));

test("T326 a flow or layers Diagram whose lead holds every label is the lead alone", () => taught(() => {
  for (const preset of ["flow", "layers"]) {
    const html = render(HELD, "sourced", preset);
    assert.ok(!figure(html), preset);
    assert.ok(html.includes("oak-diagram__lead") && html.includes("record and repeat"), preset);
  }
}));

test("T326 a gap answer draws no flow or layers figure; blockdiag is unchanged", () => taught(() => {
  for (const preset of ["flow", "layers"]) assert.ok(!figure(render(ADDS, "gap", preset)), preset);
  assert.ok(figure(render(ADDS, "gap", "blockdiag")), "blockdiag still draws");
}));

const NAMED = "EcoSmartLoop works by having users scan an item at the waste bin to get an explanation for sorting decisions, which is saved to guide future choices for both the individual and the reviewing organization.";

test("T335 a flow whose lead names every step by meaning is the lead alone; one step it misses keeps the figure", () => taught(() => {
  const html = render(NAMED);
  assert.ok(!figure(html), html);
  assert.ok(html.includes("oak-diagram__lead") && html.includes("guide future choices"));
  assert.ok(figure(render(NAMED.replace("which is saved to guide future choices", "which guides the organization"))), "a lead that drops Record and Repeat keeps the figure");
}));

test("T326 the ticket 225 gallery state still draws its Oakminder Diagram above the gap note", () => taught(() => {
  const state = JSON.parse(readFileSync("src/data/dev/oak-states/gap-note-below.json", "utf8")).find(entry => entry.id === "diagram-gap-note-below-oakminder");
  primeOakRecordFacts("k225", { version: 1, knowledgeRevision: "k225", records: state.recordFacts });
  const reply = state.workspace.messages.find(message => message.role === "assistant");
  const html = renderToStaticMarkup(createElement(OakArrangedAnswer, { id: "m225", question: state.workspace.messages[0].text, latest: true, ui: reply.ui,
    answer: { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "c", hardPolicyVersion: "h", knowledgeRevision: "k225", operations: [], ...reply.answer } }));
  assert.ok(figure(html), "the state's Diagram draws a figure");
}));
