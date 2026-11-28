import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createLoader, loadTsx, stubSets } from "../design-rework/load-tsx.mjs";

// Ticket 34: Board(claims, kind) groups the records its claims cite into columns by a reviewed field, behind oakBoardBlock.
globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, location: { search: "" }, addEventListener() {}, removeEventListener() {} };
const flag = loadTsx("src/lib/oakFlags/board.ts");
const { primeOakRecordFacts } = loadTsx("src/lib/oakRecordFacts.ts");
const { OakArrangedAnswer } = loadTsx("src/components/agent/OakOpenUIAnswer.tsx");
const { oakBoardView } = loadTsx("packages/oak-agent-contracts/src/openui/views/board.ts");

const REVISION = "k";
const cite = document => ({ documentId: document, passageId: `${document}:passage-001`, sectionId: document, url: `https://steveoak.com/${document.replace(":", "/")}/` });
const claim = (id, text, document) => ({ id, text, citations: [cite(document)] });
const work = (articleStatus, datePublished) => ({ kind: "work", articleStatus, datePublished });
const STAND = [claim("claim-1", "EcoSmartLoop has a full case study.", "work:ecosmartloop"), claim("claim-2", "The OakMinder write-up is still in progress.", "work:oakminder"),
  claim("claim-3", "Steve Oak Portfolio has a full case study too.", "work:portfolio")];
const STAND_FACTS = { "work:ecosmartloop": work("full", "2025-05-01"), "work:oakminder": work("in-progress-stub", "2026-09-01"), "work:portfolio": work("full", "2026-02-01") };
const SBOARD = [claim("claim-1", "Steve works at Oak Labs on his own.", "experience:oaklabs"), claim("claim-2", "He contracted for Hyperskalers.", "experience:hyperskalers")];
const SBOARD_FACTS = { "experience:oaklabs": { kind: "experience", engagement: "self-employed", dateStart: "2025-06-01" },
  "experience:hyperskalers": { kind: "experience", engagement: "contract", dateStart: "2024-09-01" } };

const seed = records => primeOakRecordFacts(REVISION, { version: 1, knowledgeRevision: REVISION, records });
const render = (claims, ids, kind) => renderToStaticMarkup(createElement(OakArrangedAnswer, { id: "m1", question: "Which case studies are finished?", latest: true,
  answer: { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "c", hardPolicyVersion: "h", knowledgeRevision: REVISION, operations: [], kind: "sourced", acknowledgment: null, claims },
  ui: { requestId: "00000000-0000-4000-8000-0000000000e1", status: "done",
    program: `root = Answer([board])\nboard = Board([${ids.map(id => `"${id}"`).join(", ")}]${kind ? `, "${kind}"` : ""})` } }));
const on = fn => { flag.forceOakBoardBlock(true); try { return fn(); } finally { flag.forceOakBoardBlock(null); } };
const offFlag = fn => { flag.forceOakBoardBlock(false); try { return fn(); } finally { flag.forceOakBoardBlock(null); } };
const count = (html, text) => html.split(text).length - 1;
const ALL = ids => ids.map(item => item.id);

// The block's view loads in its own chunk; one render starts that import, and later renders get the settled view.
on(() => render(STAND, ALL(STAND)));
await new Promise(setImmediate);

test("constant: oakBoardBlock is pinned in flag-pins, and a force flips it both ways", () => {
  flag.forceOakBoardBlock(true);
  assert.equal(flag.oakBoardBlockOn(), true);
  flag.forceOakBoardBlock(null);
  assert.equal(flag.oakBoardBlockOn(), flag.oakBoardBlock);
  flag.forceOakBoardBlock(false);
  assert.equal(flag.oakBoardBlockOn(), false);
  flag.forceOakBoardBlock(null);
  assert.equal(flag.oakBoardBlockOn(), flag.oakBoardBlock);
});

test("view: columns come only from reviewed values in a fixed order, never a team column, and the newest dated record is marked", () => {
  const { columns, newest } = oakBoardView("stand", [{ claim: "a", document: "work:x", column: "in-progress-stub", date: "2026-01-01" },
    { claim: "b", document: "work:y", column: "full", date: "2025-01-01" }, { claim: "c", document: "work:y", column: "full" },
    { claim: "d", document: "work:z", column: "team", date: "2027-01-01" }]);
  assert.deepEqual(columns.map(column => column.key), ["full", "in-progress-stub"]);
  assert.deepEqual(columns[0].items, [{ document: "work:y", claims: ["b", "c"] }], "one card per record, its claims in order");
  assert.equal(newest, "work:x", "an unreviewed value neither forms a column nor wins newest");
  assert.deepEqual(oakBoardView("sboard", []).columns, []);
});

test("stand: each column is a labeled list with its count, no team column, one card per record, the newest outlined once", () => {
  seed(STAND_FACTS);
  const html = on(() => render(STAND, ALL(STAND)));
  assert.match(html, /<section[^>]*aria-label="Full case study, 2"/);
  assert.match(html, /<section[^>]*aria-label="In progress, 1"/);
  assert.equal(count(html, 'class="oak-board__list"'), 2, "each column holds a list");
  assert.equal(count(html, "<li class=\"oak-board__card\""), 3);
  assert.equal(count(html, "data-newest"), 1, "only the newest card carries the accent");
  assert.match(html, /data-newest=""[^>]*>[\s\S]*?Most recent/, "the newest card says so in words, not color alone");
  assert.doesNotMatch(html.replace(/<[^>]+>/g, " "), /\bteam\b/i);
  for (const item of STAND) assert.equal(count(html, item.text), 1, `${item.id} placed once`);
});

test("sboard: kind follows the first cited record, columns are the reviewed engagement labels", () => {
  seed(SBOARD_FACTS);
  const html = on(() => render(SBOARD, ALL(SBOARD)));
  assert.match(html, /data-kind="sboard"/);
  assert.match(html, /aria-label="Contract, 1"[\s\S]*aria-label="Self-employed, 1"/, "fixed order: contract before self-employed");
  assert.doesNotMatch(html, /Full-time|Part-time/, "an empty column is not drawn");
});

test("sboard draws engagement columns from the built record facts, not fixture facts", async () => {
  const build = createLoader({ use: [stubSets.icons], stubs: { "@/lib/workContent": { getWorkEntries: async () => [], getWorkSlug: () => "" } }, interop: true });
  const { records } = await build("src/lib/oakRecordFacts.server.ts").oakRecordFacts();
  seed(records);
  const claims = [claim("claim-1", "Steve builds client AI at Oak Labs.", "experience:oaklabs"), claim("claim-2", "He contracted for Hyperskalers.", "experience:hyperskalers"),
    claim("claim-3", "He built enterprise software at PNPP.", "experience:pnppsolutions")];
  const html = on(() => render(claims, ALL(claims)));
  assert.match(html, /data-kind="sboard"/);
  assert.match(html, /aria-label="Full-time, 1"[\s\S]*aria-label="Contract, 1"[\s\S]*aria-label="Self-employed, 1"/);
  assert.doesNotMatch(html, /oak-openui__points/, "every claim lands in a column, none falls back to Points");
});

test("a claim whose record has no facts is placed once under the board", () => {
  seed({ "work:ecosmartloop": STAND_FACTS["work:ecosmartloop"], "work:oakminder": STAND_FACTS["work:oakminder"] });
  const html = on(() => render(STAND, ALL(STAND)));
  assert.match(html, /oak-board__columns/);
  assert.match(html, /<ul class="oak-openui__points"[\s\S]*Steve Oak Portfolio has a full case study too\./);
  for (const item of STAND) assert.equal(count(html, item.text), 1, `${item.id} placed once`);
});

test("the prompt description names no other component", () => {
  const { Board } = loadTsx("src/lib/openui/components/Board.tsx");
  const description = Board.description ?? Board.spec?.description ?? "";
  assert.ok(description.length > 0, "description is readable");
  assert.doesNotMatch(description, /\b(Stack|Prose|Points|Project|Role|Profile|Quote|Steps|Sources|Ownership|Timeline|Stats)\b/);
});

test("constant off, no facts, or facts from another revision degrade to Points with every claim placed once", () => {
  seed(STAND_FACTS);
  const off = offFlag(() => render(STAND, ALL(STAND)));
  seed({});
  const missing = on(() => render(STAND, ALL(STAND)));
  // The loader settles another revision's file to null (readFacts), so that is what the block sees.
  primeOakRecordFacts(REVISION, null);
  const stale = on(() => render(STAND, ALL(STAND)));
  for (const [name, html] of [["constant off", off], ["no facts", missing], ["another revision", stale]]) {
    assert.match(html, /<ul class="oak-openui__points"/, `${name}: the plain Points list`);
    assert.doesNotMatch(html, /oak-board/, `${name}: no board drawing`);
    for (const item of STAND) assert.equal(count(html, item.text), 1, `${name}: ${item.id} placed once`);
  }
});
