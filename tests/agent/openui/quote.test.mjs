import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTsx } from "../design-rework/load-tsx.mjs";

// Ticket 29: Quote(claims, mode) is Steve's own words (quote, quotes) and the Bridge (bridge), behind oakQuoteBlock.
globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, location: { search: "" }, addEventListener() {}, removeEventListener() {} };
const flag = loadTsx("src/lib/oakFlags/quote.ts");
// Ticket 229: the invitation tests read the next-step card main draws, so the Contact card switch is pinned off for them.
loadTsx("src/lib/oakFlags/contactCard.ts").forceOakContactCard(false);
const { primeOakRecordFacts } = loadTsx("src/lib/oakRecordFacts.ts");
const { OakArrangedAnswer, oakOpenUIProposes } = loadTsx("src/components/agent/OakOpenUIAnswer.tsx");
const { oakBridgeTopics, oakBridgeAreas } = loadTsx("src/data/oakBridgeTopics.ts");
const once = loadTsx("src/lib/oakBridgeOnce.ts");
const workspace = loadTsx("src/lib/oakWorkspace.ts");

const REVISION = "k";
const slugOf = documentId => documentId.replace(/^work:/, "");
const mdx = documentId => readFileSync(`src/content/work/${slugOf(documentId)}.mdx`, "utf8");
const dekOf = documentId => JSON.parse(/^dek: (".*")$/m.exec(mdx(documentId))[1]);
const cite = documentId => ({ documentId, passageId: `${documentId}:passage-001`, sectionId: documentId, url: `https://steveoak.com/work/${slugOf(documentId)}/` });
const answerOf = (text, documentId = "work:ecosmartloop", nextTool = "brief") => ({ schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "c",
  hardPolicyVersion: "h", knowledgeRevision: REVISION, operations: [], kind: "sourced", acknowledgment: null, nextTool,
  claims: [{ id: "claim-1", text, citations: [cite(documentId)] }] });
const seed = ids => primeOakRecordFacts(REVISION, { version: 1, knowledgeRevision: REVISION, records: Object.fromEntries(ids.map(id => [id,
  { kind: "work", dek: dekOf(id), category: "Case study", cover: { src: "/c.webp", alt: "cover" }, artifacts: [{ label: "Screens", status: "verified", image: { src: "/a.webp", alt: "artifact" } }], sections: [] }])) });
const render = (id, text, mode = "bridge", documentId) => renderToStaticMarkup(createElement(OakArrangedAnswer, { id, answer: answerOf(text, documentId), question: "q", latest: true,
  ui: { requestId: "00000000-0000-4000-8000-0000000000e1", status: "done", program: `root = Answer([q])\nq = Quote(["claim-1"], "${mode}")` } }));
const on = fn => { flag.forceOakQuoteBlock(true); try { return fn(); } finally { flag.forceOakQuoteBlock(null); } };
const off = fn => { flag.forceOakQuoteBlock(false); try { return fn(); } finally { flag.forceOakQuoteBlock(null); } };
const flat = html => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ");
const count = (html, text) => flat(html).split(text).length - 1;
const EVALS = "Steve checks agent runs with evals.";
const MEMORY = "Steve works on agent memory systems.";
const VISION = "Steve cares about image recognition.";

beforeEach(() => once.resetOakBridgeOnce());

test("every bridge quote and every dek is an exact substring of its public page, and the page names the topic", () => {
  assert.ok(oakBridgeTopics.length >= 5);
  for (const row of oakBridgeTopics) {
    const text = mdx(row.documentId);
    assert.ok(text.includes(row.quote), `${row.topic}: quote is on ${row.page}`);
    assert.ok(row.keywords.some(word => text.toLowerCase().includes(word)), `${row.topic}: the record names a keyword`);
    assert.ok(text.includes(dekOf(row.documentId)));
    assert.ok(row.page.endsWith(`/${slugOf(row.documentId)}/`));
  }
});

test("every Related phrase is an exact substring of its public page", () => {
  for (const row of oakBridgeAreas) assert.ok(mdx(row.documentId).includes(row.phrase), `${row.area}: "${row.phrase}" is on ${row.page}`);
});

test("a Related area never claims use: no area keyword is named by any record, and the line says related, never used or built", () => {
  seed(["work:ecosmartloop", "work:linkedin-growth-loop"]);
  for (const row of oakBridgeAreas) {
    for (const record of ["ecosmartloop", "linkedin-growth-loop", "oakminder", "agentic-brain", "omnisocial"])
      for (const word of row.keywords) assert.ok(!readFileSync(`src/content/work/${record}.mdx`, "utf8").toLowerCase().includes(word), `${row.area}: ${record} names "${word}"`);
    const html = on(() => render("m1", `Steve cares about ${row.keywords[0]}.`));
    const line = html.replace(/<[^>]+>/g, " ");
    assert.match(line, /Related:/);
    assert.doesNotMatch(line.slice(line.indexOf("Related:")), /\b(used|uses|built with|worked with)\b/i);
    once.resetOakBridgeOnce();
  }
});

test("the invitation shows once per conversation: the first answer carries it, a later one does not", () => {
  seed(["work:linkedin-growth-loop"]);
  const first = on(() => render("m1", EVALS, "bridge", "work:linkedin-growth-loop"));
  const again = on(() => render("m1", EVALS, "bridge", "work:linkedin-growth-loop"));
  const later = on(() => render("m2", EVALS, "bridge", "work:linkedin-growth-loop"));
  assert.match(first, /oak-next-step/);
  assert.match(first, /exact quote|The team became more reliable/);
  assert.match(again, /oak-next-step/, "a re-render of the same answer keeps it");
  assert.doesNotMatch(later, /oak-next-step/);
  assert.match(later, /The team became more reliable/, "the card still shows, only the invitation is spent");
});

test("a new conversation in the same page shows the invitation and Related again", () => {
  seed(["work:ecosmartloop", "work:linkedin-growth-loop"]);
  assert.match(on(() => render("m1", EVALS, "bridge", "work:linkedin-growth-loop")), /oak-next-step/);
  assert.match(on(() => render("m1", VISION)), /Related:/);
  workspace.setOakWorkspaceFixture({ conversationId: "c1" });
  workspace.startNewOakConversation();
  assert.match(on(() => render("n1", EVALS, "bridge", "work:linkedin-growth-loop")), /oak-next-step/);
  assert.match(on(() => render("n1", VISION)), /Related:/);
});

test("the bridge invitation is the answer's proposal: the next-step card steps aside and the invitation shows once", () => {
  seed(["work:linkedin-growth-loop"]);
  const ui = { requestId: "00000000-0000-4000-8000-0000000000e1", status: "done", program: 'root = Answer([q])\nq = Quote(["claim-1"], "bridge")' };
  const answer = answerOf(EVALS, "work:linkedin-growth-loop");
  assert.equal(oakOpenUIProposes(answer, ui, "m1"), true);
  const html = on(() => render("m1", EVALS, "bridge", "work:linkedin-growth-loop"));
  assert.equal(count(html, "Draft a contact brief"), 1);
  assert.equal(oakOpenUIProposes(answer, ui, "m1"), true, "the answer that drew it keeps it");
  assert.equal(oakOpenUIProposes(answer, ui, "m2"), false, "a spent invitation leaves the card");
});

test("the card steps aside only for a bridge that draws its invitation", () => {
  seed(["work:ecosmartloop", "work:linkedin-growth-loop"]);
  const ui = { requestId: "00000000-0000-4000-8000-0000000000e1", status: "done", program: 'root = Answer([q])\nq = Quote(["claim-1"], "bridge")' };
  const proposes = (text, documentId) => oakOpenUIProposes(answerOf(text, documentId), ui, "m1");
  assert.equal(proposes(VISION, "work:ecosmartloop"), false, "a bridge with an area match draws Related, so the card stays");
  assert.equal(proposes("Steve likes tea.", "work:ecosmartloop"), false, "a bridge matching nothing draws nothing, so the card stays");
  assert.equal(proposes(EVALS, "work:linkedin-growth-loop"), true, "a drawn invitation hides the card");
  primeOakRecordFacts(REVISION, { version: 1, knowledgeRevision: REVISION, records: {} });
  assert.equal(proposes(EVALS, "work:linkedin-growth-loop"), false, "a topic match with its record facts missing draws nothing, so the card stays");
});

test("a Proposal block beside a bridge Quote shows the offer once", () => {
  seed(["work:linkedin-growth-loop"]);
  const program = 'root = Answer([q, offer])\nq = Quote(["claim-1"], "bridge")\noffer = Proposal("prepareBrief", "Write to Steve about this")';
  const ui = { requestId: "00000000-0000-4000-8000-0000000000e1", status: "done", program };
  const answer = answerOf(EVALS, "work:linkedin-growth-loop");
  assert.equal(oakOpenUIProposes(answer, ui, "m1"), true);
  const html = on(() => renderToStaticMarkup(createElement(OakArrangedAnswer, { id: "m1", answer, question: "q", latest: true, ui })));
  assert.equal(count(html, "Draft a contact brief"), 1);
});

test("Related shows only with no topic match, once, and not in a later answer", () => {
  seed(["work:ecosmartloop", "work:linkedin-growth-loop"]);
  const matched = on(() => render("m1", EVALS));
  assert.doesNotMatch(matched, /Related:/);
  once.resetOakBridgeOnce();
  const first = on(() => render("m1", VISION));
  const later = on(() => render("m2", VISION));
  assert.match(first, /Related:/);
  assert.doesNotMatch(first, /oak-bridge__quote|<blockquote/, "no quote on a Related line");
  assert.doesNotMatch(later, /Related:/);
  assert.equal(count(later, VISION), 1, "the claim still shows once");
});

test("constant off, or record facts missing, degrade to Points with every claim placed once", () => {
  seed(["work:linkedin-growth-loop"]);
  const offHtml = off(() => render("m1", EVALS, "bridge", "work:linkedin-growth-loop"));
  primeOakRecordFacts(REVISION, { version: 1, knowledgeRevision: REVISION, records: {} });
  const missing = on(() => render("m1", MEMORY, "quote", "work:agentic-brain"));
  for (const [name, html, text] of [["constant off", offHtml, EVALS], ["facts missing", missing, MEMORY]]) {
    assert.match(html, /<ul class="oak-openui__points"/, `${name}: the plain Points list`);
    assert.equal(count(html, text), 1, `${name}: the claim is placed once`);
    assert.doesNotMatch(html, /oak-quote|oak-bridge/, `${name}: no quote drawing`);
  }
});

test("constant: oakQuoteBlock is pinned in flag-pins, and a force flips it both ways", () => {
  assert.equal(on(() => flag.oakQuoteBlockOn()), true);
  assert.equal(flag.oakQuoteBlockOn(), flag.oakQuoteBlock);
  assert.equal(off(() => flag.oakQuoteBlockOn()), false);
  assert.equal(flag.oakQuoteBlockOn(), flag.oakQuoteBlock);
});
