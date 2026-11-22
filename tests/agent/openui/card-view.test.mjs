// Ticket 227: cards, dates, labels, the Framing line and the proposal read one Block view on both sides (renderer and printer).
// Run: node --test tests/agent/openui/card-view.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTsx } from "../design-rework/load-tsx.mjs";
import { arrangedView } from "../../../scripts/quality/quality-bar-core.mjs";
import snapshot from "../../../src/data/generated/knowledgeSnapshot.json" with { type: "json" };
import { oakCardView, oakMetricView, oakOpenUIProposalOf } from "../../../packages/oak-agent-contracts/src/openui/block-view.ts";
import { oakOpenUIFramingLine } from "../../../packages/oak-agent-contracts/src/openui/verdict.ts";

const claim = (id, ...pages) => ({ id, text: `Claim ${id}.`, citations: pages.map(documentId => ({ documentId })) });
const viewOf = (claims, hasCard = () => true) => {
  const byId = new Map(claims.map(c => [c.id, c]));
  const view = oakCardView(claims.map(c => c.id), id => byId.get(id), hasCard);
  return { ...view, lead: view.lead?.id ?? null };
};

test("card view: claims about one page are the card's own, the first shown and the rest folded", () => {
  assert.deepEqual(viewOf([claim("a", "work:oakminder"), claim("b", "work:oakminder")]),
    { lead: "a", page: "work:oakminder", own: ["a", "b"], shown: "a", folded: ["b"], others: [] });
});

test("card view: two pages of one project are two pages, so the second page's claim follows the card as a plain point", () => {
  assert.deepEqual(viewOf([claim("a", "work:agentic-brain"), claim("b", "legacy:agentic-brain")]),
    { lead: "a", page: "work:agentic-brain", own: ["a"], shown: "a", folded: [], others: ["b"] });
  assert.deepEqual(viewOf([claim("a", "work:agentic-brain", "legacy:agentic-brain")]),
    { lead: null, page: null, own: [], shown: null, folded: [], others: ["a"] });
});

test("card view: a claim citing several pages is owned by no card, even when its first citation is the card's page", () => {
  assert.deepEqual(viewOf([claim("a", "work:oakminder", "work:ecosmartloop", "work:omnisocial")]),
    { lead: null, page: null, own: [], shown: null, folded: [], others: ["a"] });
  assert.deepEqual(viewOf([claim("a", "work:oakminder", "work:ecosmartloop"), claim("b", "work:oakminder")]),
    { lead: "b", page: "work:oakminder", own: ["b"], shown: "b", folded: [], others: ["a"] });
});

test("card view: with no card for the page (another revision) nothing is owned and every claim is a plain point", () => {
  assert.deepEqual(viewOf([claim("a", "work:oakminder"), claim("b", "work:oakminder")], () => false),
    { lead: null, page: null, own: [], shown: null, folded: [], others: ["a", "b"] });
});

test("card view: a card over three one-page claims shows one and folds two, and every claim is placed once", () => {
  const view = viewOf([claim("a", "work:oakminder"), claim("b", "work:oakminder"), claim("c", "work:oakminder"), claim("d", "work:omnisocial")]);
  assert.equal(view.shown, "a");
  assert.deepEqual(view.folded, ["b", "c"]);
  assert.deepEqual([view.shown, ...view.folded, ...view.others].sort(), ["a", "b", "c", "d"]);
});

const block = (typeName, ...claims) => ({ typeName, props: { claims: claims.map(c => c.id) } });
const framing = (children, claims, counted = true) => {
  const byId = new Map(claims.map(c => [c.id, c]));
  return oakOpenUIFramingLine(children, id => byId.get(id)?.citations.map(c => c.documentId) ?? [], counted);
};
const sources = { typeName: "Sources", props: {} };

test("Framing line, counted: one project keeps today's line", () => {
  const a = claim("claim-1", "work:oakminder");
  assert.equal(framing([block("Project", a), sources], [a]), "From one of Steve's case studies:");
});

test("Framing line, counted: two pages of one project count as one project", () => {
  const a = claim("claim-1", "work:agentic-brain", "legacy:agentic-brain");
  assert.equal(framing([block("Project", a), sources], [a]), "From one of Steve's case studies:");
});

test("Framing line, counted: one block naming two or three projects reads as several", () => {
  const two = claim("claim-1", "work:oakminder", "work:ecosmartloop");
  assert.equal(framing([block("Project", two), sources], [two]), "From Steve's case studies:");
  const three = claim("claim-1", "work:oakminder", "work:ecosmartloop", "work:omnisocial");
  assert.equal(framing([block("Project", three), sources], [three]), "From Steve's case studies:");
  const roles = claim("claim-1", "experience:oaklabs", "experience:uhttention");
  assert.equal(framing([block("Role", roles)], [roles]), "From Steve's roles:");
});

test("Framing line, counted: a claim that cites no project page keeps today's line", () => {
  const a = claim("claim-1", "profile:steve-oak");
  assert.equal(framing([block("Project", a), sources], [a]), "From one of Steve's case studies:");
});

test("Framing line: blocks that each hold their own project keep the counted line, and the flag off keeps today's line", () => {
  const a = claim("claim-1", "work:oakminder"), b = claim("claim-2", "work:omnisocial");
  assert.equal(framing([block("Project", a), block("Project", b)], [a, b]), "From two of Steve's case studies:");
  const three = claim("claim-1", "work:oakminder", "work:ecosmartloop", "work:omnisocial");
  assert.equal(framing([block("Project", three), sources], [three], false), "From one of Steve's case studies:");
  assert.equal(framing([{ typeName: "Prose", props: { claim: "claim-1" } }], [three]), null);
});

test("proposal view: only the app's next tool, or none", () => {
  assert.equal(oakOpenUIProposalOf("role"), "compareRole");
  assert.equal(oakOpenUIProposalOf("brief"), "prepareBrief");
  assert.equal(oakOpenUIProposalOf(null), null);
});

test("dated view: a Metric label is own words the claim does not repeat", () => {
  assert.deepEqual(oakMetricView("Response time fell 40% after the rewrite.", "Faster replies", " 40% "), { stated: true, value: "40%", label: "Faster replies" });
  assert.deepEqual(oakMetricView("Response time fell 40% after the rewrite.", "Response time", "40%"), { stated: true, value: "40%", label: "" });
  assert.deepEqual(oakMetricView("Response time fell 40% after the rewrite.", "Top 2 metric", "40%"), { stated: true, value: "40%", label: "" });
  assert.equal(oakMetricView(undefined, "Faster", "40%").stated, false);
});

// Parity, no browser: the renderer and the printer read one view, so the drawn Framing line and fold equal the printed ones.
globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, location: { search: "" }, addEventListener() {}, removeEventListener() {} };
const framingFlag = loadTsx("src/lib/oakFlags/framingLineCount.ts");
const { OakArrangedAnswer } = loadTsx("src/components/agent/OakOpenUIAnswer.tsx");
const STATES = JSON.parse(readFileSync(new URL("../../../src/data/dev/oak-states/one-claim-card.json", import.meta.url), "utf8"));
const unescape = html => html.replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"');
const drawn = (answer, ui, labels, counted) => {
  framingFlag.forceOakFramingLineCount(counted);
  try {
    return unescape(renderToStaticMarkup(createElement(OakArrangedAnswer, { id: "m1", answer: { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "c", hardPolicyVersion: "h",
      knowledgeRevision: snapshot.revision, operations: [], ...answer }, question: "Q", latest: true, citationLabels: labels, ui })));
  } finally { framingFlag.forceOakFramingLineCount(null); }
};
const introOf = html => /class="oak-openui__prose oak-openui__intro">([^<]*)</.exec(html)?.[1] ?? null;

for (const id of ["answer-openui-project-multi-cite", "answer-openui-project-two-pages", "answer-openui-project-multi-cite-counted", "answer-openui-project-two-pages-counted"]) {
  test(`parity: ${id} draws the Framing line the printer prints`, () => {
    const state = STATES.find(entry => entry.id === id);
    const { answer, ui } = state.workspace.messages[1];
    const counted = Boolean(state.framingLineCount);
    const printed = arrangedView({ ui, answer: { ...answer, knowledgeRevision: snapshot.revision } }, answer.claims, { counted }).view.split("\n")[0];
    const html = drawn(answer, ui, { knowledgeRevision: snapshot.revision, documents: [] }, counted);
    assert.equal(introOf(html), printed);
    assert.equal(printed, id === "answer-openui-project-multi-cite-counted" ? "From Steve's case studies:" : "From one of Steve's case studies:");
    assert.equal(html.split(answer.claims[0].text).length - 1, 1, "the claim is drawn once");
  });
}

test("parity: a Project card over three one-page claims draws its lead and folds two, as the printer marks them", () => {
  const cite = { documentId: "work:oakminder", passageId: "work:oakminder:section-001:passage-001", sectionId: "work:oakminder:section-001", url: "https://steveoak.com/work/oakminder/" };
  const claims = ["Oakminder turns notes into reminders.", "It runs on the lock screen.", "It ships through the App Store."].map((text, i) => ({ id: `claim-${i + 1}`, text, citations: [cite] }));
  const ui = { requestId: "00000000-0000-4000-8000-000000000230", status: "done", program: 'root = Answer([card])\ncard = Project(["claim-1", "claim-2", "claim-3"])' };
  const labels = { knowledgeRevision: snapshot.revision, documents: [{ documentId: "work:oakminder", title: "Oakminder: case study", canonicalUrl: "https://steveoak.com/work/oakminder/", card: { kind: "work", title: "Oakminder" } }] };
  const html = drawn({ kind: "sourced", acknowledgment: null, claims }, ui, labels, false);
  const rows = arrangedView({ ui, answer: { knowledgeRevision: snapshot.revision } }, claims, { shared: false, tags: false }).view.split("\n");
  assert.equal(introOf(html), rows[0]);
  assert.ok(/oak-openui-card__lead[^>]*>[^]*?Oakminder turns notes into reminders\./.test(html), "the lead is drawn visible");
  assert.ok(html.includes(">2 more<"), "the fold control reads 2 more");
  // Ticket 214: the lead claim prints first, then the record line (the title the lead states dropped), then the fold.
  assert.deepEqual(rows.slice(-5), [`- ${claims[0].text}`, "Solo founder-engineer / AI product engineer; January to March 2026", "2 more", `- ${claims[1].text}`, `- ${claims[2].text}`]);
  const panel = html.slice(html.indexOf("oak-openui-card__more"));
  for (const claim of claims.slice(1)) assert.ok(panel.includes(claim.text), `${claim.id} is inside the fold`);
});
