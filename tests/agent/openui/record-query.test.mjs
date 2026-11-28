import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createQueryManager } from "@openuidev/lang-core";
import * as reactLang from "@openuidev/react-lang";
import { createLoader, loadTsx, stubSets } from "../design-rework/load-tsx.mjs";

// Ticket 72: Query("oak_record", { documentId }) loads a reviewed record's public facts from ticket 05's record-facts asset, behind oakRecordQuery.
globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, location: { search: "" }, addEventListener() {}, removeEventListener() {} };
const flag = loadTsx("src/lib/oakFlags/recordQuery.ts");
const { oakRecordToolProvider, OAK_RECORD_TOOL } = loadTsx("src/lib/openui/query/oakRecordQuery.ts");
const { primeOakRecordFacts } = loadTsx("src/lib/oakRecordFacts.ts");
const { OakArrangedAnswer } = loadTsx("src/components/agent/OakOpenUIAnswer.tsx");

const DOCUMENT = "work:ecosmartloop";
const WORK = {
  kind: "work", dek: "Sorting help at the bin.", category: "Applied AI", badge: "Capstone", articleStatus: "full", datePublished: "2026-05-01",
  period: "2025", cover: { src: "/c.webp", alt: "Cover" }, coverTint: "#7cc4a0",
  systemMap: [{ label: "Classifier", description: "Four classes with confidence." }],
  artifacts: [{ label: "Demo video", status: "verified" }, { label: "Private deck", status: "do-not-publish" }, { label: "Draft numbers", status: "needs-oak" }],
  heldArtifacts: 2, metrics: [{ label: "Dataset", value: "8K images", kind: "scope" }], sections: [{ anchor: "role", title: "Role" }],
  ownership: { oak: ["Product-side full stack"], collaborators: ["Model training"] },
  privateNotes: "never shown",
};
const HELD = { ...WORK, status: "needs-oak" };
// Ticket 342: the empty record, written out: the empty line in every public text field, no rows, nothing from the record.
const LINE = "Record details unavailable";
const NONE = {
  dek: LINE, category: LINE, badge: LINE, statusLabel: LINE, period: LINE, engagement: LINE, dateStart: LINE, dateEnd: LINE, title: LINE,
  name: LINE, path: LINE, privacy: LINE, systemMap: [], artifacts: [], metrics: [], facts: [], pages: [], knowsAbout: [],
};
let revision = 0;
const seed = (records, rev = `r${++revision}`) => (primeOakRecordFacts(rev, { version: 1, knowledgeRevision: rev, records }), rev);
const call = (rev, documentId) => oakRecordToolProvider(rev)[OAK_RECORD_TOOL]({ documentId });
const on = async run => { flag.forceOakRecordQuery(true); try { return await run(); } finally { flag.forceOakRecordQuery(null); } };

// The shipped value (off) is pinned in flag-pins.test.mjs; here a force flips it both ways.
test("constant: a force flips oakRecordQuery both ways", () => {
  flag.forceOakRecordQuery(false);
  assert.equal(flag.oakRecordQueryOn(), false);
  flag.forceOakRecordQuery(true);
  assert.equal(flag.oakRecordQueryOn(), true);
  flag.forceOakRecordQuery(null);
});

test("a resolved record's public fields equal the asset's, and only verified artifacts resolve", () => on(async () => {
  const facts = await call(seed({ [DOCUMENT]: WORK }), DOCUMENT);
  assert.deepEqual(facts, {
    documentId: DOCUMENT, kind: "work", dek: WORK.dek, category: WORK.category, badge: WORK.badge, period: WORK.period,
    systemMap: [{ label: "Classifier", description: "Four classes with confidence." }],
    artifacts: [{ label: "Demo video" }],
    metrics: [{ label: "Dataset", value: "8K images" }],
    ownership: { oak: ["Product-side full stack"], collaborators: ["Model training"] },
  });
}));

test("an unknown id, a held record and a do-not-publish field resolve to the empty record", () => on(async () => {
  const rev = seed({ [DOCUMENT]: WORK, "work:held": HELD });
  assert.deepEqual(await call(rev, "work:nope"), NONE);
  assert.deepEqual(await call(rev, "work:held"), NONE);
  assert.deepEqual(await call(rev, 42), NONE);
  const shown = JSON.stringify(await call(rev, DOCUMENT));
  for (const hidden of ["Private deck", "Draft numbers", "never shown", "heldArtifacts"]) assert.ok(!shown.includes(hidden), hidden);
}));

test("the provider reads only the versioned asset: one request, no Worker and no model call", () => on(async () => {
  const real = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (url, init) => {
    urls.push(String(url));
    assert.equal(init?.credentials, "omit");
    return new Response(JSON.stringify({ version: 1, knowledgeRevision: "net1", records: { [DOCUMENT]: WORK } }), { status: 200 });
  };
  try {
    assert.equal((await call("net1", DOCUMENT)).badge, "Capstone");
    assert.deepEqual(await call("net1", "work:nope"), NONE);
    assert.deepEqual(urls, ["/oak/record-facts.net1.json"]);
  } finally { globalThis.fetch = real; }
}));

test("a failed asset load settles to the empty record, never a rejection", () => on(async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("offline"); };
  try { assert.deepEqual(await call("down1", DOCUMENT), NONE); } finally { globalThis.fetch = real; }
}));

const settle = async (provider, documentId, defaults = { badge: "Model words" }) => {
  const manager = createQueryManager({ callTool: (name, args) => provider[name](args) });
  const node = { statementId: "rec", toolName: OAK_RECORD_TOOL, args: { documentId }, defaults, deps: null, complete: true };
  manager.activate();
  manager.evaluateQueries([node]);
  const loading = manager.getSnapshot().rec;
  for (let i = 0; i < 20 && manager.isLoading("rec"); i++) await new Promise(resolve => setTimeout(resolve, 5));
  const settled = manager.getSnapshot().rec;
  manager.dispose();
  return { loading, settled };
};

test("model-written defaults show only while loading and never once settled", () => on(async () => {
  const rev = seed({ [DOCUMENT]: WORK });
  const found = await settle(oakRecordToolProvider(rev), DOCUMENT);
  assert.deepEqual(found.loading, { badge: "Model words" });
  assert.equal(found.settled.badge, "Capstone");
  const missing = await settle(oakRecordToolProvider(rev), "work:nope");
  assert.deepEqual(missing.settled, NONE);
}));

test("constant off: every Query settles to the empty record without a request", async () => {
  const real = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests++; return new Response("{}"); };
  try {
    const off = await settle(oakRecordToolProvider("off1"), DOCUMENT);
    assert.deepEqual(off.settled, NONE);
    assert.equal(requests, 0);
  } finally { globalThis.fetch = real; }
});

test("constant off: a program using Query still renders its claims", () => {
  const rev = seed({ [DOCUMENT]: WORK });
  const CLAIM = "Steve built the product side of EcoSmartLoop.";
  const citation = { documentId: DOCUMENT, passageId: `${DOCUMENT}:passage-001`, sectionId: DOCUMENT, url: "https://steveoak.com/work/ecosmartloop/" };
  const answer = { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "c", hardPolicyVersion: "h", knowledgeRevision: rev, operations: [],
    kind: "sourced", acknowledgment: null, claims: [{ id: "claim-1", text: CLAIM, citations: [citation] }] };
  const program = `root = Answer([about])\nrec = Query("${OAK_RECORD_TOOL}", { documentId: "${DOCUMENT}" }, null)\nabout = Prose("claim-1")`;
  const html = renderToStaticMarkup(createElement(OakArrangedAnswer, { id: "m1", answer, question: "What is EcoSmartLoop?", latest: true,
    ui: { requestId: "00000000-0000-4000-8000-0000000000c2", status: "done", program } }));
  const text = html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ");
  assert.ok(text.includes(CLAIM), text.slice(0, 200));
  assert.ok(!text.includes("Capstone"));
});

// Ruling 123: the answer passes the provider to the Renderer only while the constant is on; off, its props are main's.
test("Renderer wiring: off passes main's props and no toolProvider; on passes the oak_record provider", () => {
  const seen = [];
  const Renderer = props => (seen.push(props), null);
  const load = createLoader({ use: [stubSets.icons, stubSets.workspaceStore()], interop: true, stubs: { "@openuidev/react-lang": { ...reactLang, Renderer } } });
  const wiredFlag = load("src/lib/oakFlags/recordQuery.ts");
  const { OakArrangedAnswer: Wired } = load("src/components/agent/OakOpenUIAnswer.tsx");
  const rev = seed({ [DOCUMENT]: WORK });
  const citation = { documentId: DOCUMENT, passageId: `${DOCUMENT}:passage-001`, sectionId: DOCUMENT, url: "https://steveoak.com/work/ecosmartloop/" };
  const answer = { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "c", hardPolicyVersion: "h", knowledgeRevision: rev, operations: [],
    kind: "sourced", acknowledgment: null, claims: [{ id: "claim-1", text: "Steve built it.", citations: [citation] }] };
  const draw = () => renderToStaticMarkup(createElement(Wired, { id: "m2", answer, question: "What is EcoSmartLoop?", latest: true,
    ui: { requestId: "00000000-0000-4000-8000-0000000000c3", status: "done", program: "root = Answer([about])\nabout = Prose(\"claim-1\")" } }));
  wiredFlag.forceOakRecordQuery(false);
  try { draw(); } finally { wiredFlag.forceOakRecordQuery(null); }
  // Off: the props main passes, and no provider (an undefined prop reads the same as an absent one to the Renderer).
  const off = seen.at(-1);
  assert.deepEqual(Object.keys(off).filter(key => off[key] !== undefined).sort(), ["isStreaming", "library", "onAction", "onError", "response"]);
  assert.equal(off.toolProvider, undefined);
  wiredFlag.forceOakRecordQuery(true);
  try { draw(); } finally { wiredFlag.forceOakRecordQuery(null); }
  assert.equal(typeof seen.at(-1).toolProvider?.[OAK_RECORD_TOOL], "function");
});

// Ruling 123: the loading and settled gallery states force the constant on with a hand-written program whose Heading reads the Query.
test("gallery: every record-query state covers its claim; loading holds the placeholder, settled swaps in the fixture's badge", () => on(async () => {
  const { readFileSync } = await import("node:fs");
  const states = JSON.parse(readFileSync(new URL("../../../src/data/dev/oak-states/record-query.json", import.meta.url), "utf8"));
  const { oakOpenUIProgramCovers } = loadTsx("packages/oak-agent-contracts/src/openui/verdict.ts");
  const byId = Object.fromEntries(states.map(state => [state.id, state]));
  assert.deepEqual(Object.keys(byId).sort(), ["record-query-failed", "record-query-loading", "record-query-off", "record-query-settled"]);
  for (const state of states) {
    assert.equal(state.recordQuery, state.id !== "record-query-off");
    const message = state.workspace.messages.at(-1);
    assert.ok(oakOpenUIProgramCovers(message.ui.program, message.answer.claims.map(claim => claim.id)), state.id);
  }
  // The runtime registers a Query in an effect, so the query manager is where loading and settled live (as the browser runs it).
  assert.equal(byId["record-query-loading"].recordFacts, "pending");
  const defaults = { badge: "Loading the record" };
  const pending = await settle({ [OAK_RECORD_TOOL]: () => new Promise(() => {}) }, DOCUMENT, defaults);
  assert.deepEqual(pending.loading, defaults);
  assert.deepEqual(pending.settled, defaults);
  const done = await settle(oakRecordToolProvider(seed(byId["record-query-settled"].recordFacts)), DOCUMENT, defaults);
  assert.equal(done.settled.badge, "Applied AI");
  assert.ok(!JSON.stringify(done.settled).includes("Loading the record"));
  assert.match(byId["record-query-settled"].workspace.messages.at(-1).ui.program, /Query\("oak_record", \{ "documentId": "work:ecosmartloop" \}, \{ "badge": "Loading the record" \}\)\nhead = Heading\(rec\.badge\)/);
}));

// Ticket 342 (r72 N1, ruling 124): a Query that cannot read its record shows the block's own empty line, never the model's words.
const QUERY_PROGRAM = `root = Answer([head, about])\nrec = Query("${OAK_RECORD_TOOL}", { "documentId": "${DOCUMENT}" }, { "badge": "Loading the record" })\nhead = Heading(rec.badge)\nabout = Prose("claim-1")`;
const drawQueryHtml = (rev, program = QUERY_PROGRAM) => {
  const citation = { documentId: DOCUMENT, passageId: `${DOCUMENT}:passage-001`, sectionId: DOCUMENT, url: "https://steveoak.com/work/ecosmartloop/" };
  const answer = { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "c", hardPolicyVersion: "h", knowledgeRevision: rev, operations: [],
    kind: "sourced", acknowledgment: null, claims: [{ id: "claim-1", text: "Steve built the product side.", citations: [citation] }] };
  return renderToStaticMarkup(createElement(OakArrangedAnswer, { id: "m342", answer, question: "What is EcoSmartLoop?", latest: true,
    ui: { requestId: "00000000-0000-4000-8000-0000000003a2", status: "done", program } }));
};
const drawQuery = (rev, program) => drawQueryHtml(rev, program).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

// d342 (Magic Patterns 33a2f8db, root ruling on HANDOFF item 3): the empty line draws muted, with no icon tile and no hairline.
test("the empty line draws as a muted heading with no icon tile; a record heading keeps its tile", () => {
  flag.forceOakRecordQuery(false);
  try {
    const html = drawQueryHtml(seed({ [DOCUMENT]: WORK }));
    assert.match(html, /<h4 class="oak-openui__heading oak-openui__heading--empty" data-picture-ok="[^"]+">Record details unavailable<\/h4>/);
    assert.ok(!html.includes("oak-openui__heading-mark"));
  } finally { flag.forceOakRecordQuery(null); }
  const named = drawQueryHtml(seed({ [DOCUMENT]: WORK }), `root = Answer([head, about])\nhead = Heading("What it does")\nabout = Prose("claim-1")`);
  assert.ok(named.includes("oak-openui__heading-mark"));
  assert.ok(!named.includes("oak-openui__heading--empty"));
});

test("constant off: a block that reads a Query renders its empty line and never the program's default words", () => {
  flag.forceOakRecordQuery(false);
  try {
    const text = drawQuery(seed({ [DOCUMENT]: WORK }));
    assert.ok(text.includes(LINE), text.slice(0, 200));
    assert.ok(!text.includes("Loading the record"));
    assert.ok(!text.includes("Capstone"));
    assert.ok(text.includes("Steve built the product side."));
  } finally { flag.forceOakRecordQuery(null); }
});

test("a read that fails or finds nothing settles to the same empty line the constant-off block shows", () => on(async () => {
  const rev = seed({ [DOCUMENT]: WORK, "work:held": HELD });
  const missing = await settle(oakRecordToolProvider(rev), "work:nope", { badge: "Loading the record" });
  const held = await settle(oakRecordToolProvider(rev), "work:held", { badge: "Loading the record" });
  const real = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("offline"); };
  let failed;
  try { failed = await settle(oakRecordToolProvider("down342"), DOCUMENT, { badge: "Loading the record" }); } finally { globalThis.fetch = real; }
  for (const settled of [missing.settled, held.settled, failed.settled]) {
    assert.equal(settled?.badge, LINE);
    assert.ok(!JSON.stringify(settled).includes("Loading the record"));
  }
  assert.deepEqual(missing.settled, failed.settled);
  flag.forceOakRecordQuery(false);
  try { assert.ok(drawQuery(rev).includes(missing.settled.badge)); } finally { flag.forceOakRecordQuery(true); }
}));

test("constant off: a program with no Query reaches the Renderer unchanged", () => {
  const seen = [];
  const Renderer = props => (seen.push(props), null);
  const load = createLoader({ use: [stubSets.icons, stubSets.workspaceStore()], interop: true, stubs: { "@openuidev/react-lang": { ...reactLang, Renderer } } });
  const wiredFlag = load("src/lib/oakFlags/recordQuery.ts");
  const { OakArrangedAnswer: Wired } = load("src/components/agent/OakOpenUIAnswer.tsx");
  const plain = "root = Answer([about])\nabout = Prose(\"claim-1\")";
  const citation = { documentId: DOCUMENT, passageId: `${DOCUMENT}:passage-001`, sectionId: DOCUMENT, url: "https://steveoak.com/work/ecosmartloop/" };
  const answer = { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "c", hardPolicyVersion: "h", knowledgeRevision: seed({ [DOCUMENT]: WORK }), operations: [],
    kind: "sourced", acknowledgment: null, claims: [{ id: "claim-1", text: "Steve built it.", citations: [citation] }] };
  wiredFlag.forceOakRecordQuery(false);
  try {
    renderToStaticMarkup(createElement(Wired, { id: "m342b", answer, question: "q", latest: true, ui: { requestId: "00000000-0000-4000-8000-0000000003a3", status: "done", program: plain } }));
    assert.equal(seen.at(-1).response, plain);
    renderToStaticMarkup(createElement(Wired, { id: "m342c", answer, question: "q", latest: true, ui: { requestId: "00000000-0000-4000-8000-0000000003a4", status: "done", program: QUERY_PROGRAM } }));
    assert.doesNotMatch(seen.at(-1).response, /Query\(|Loading the record/);
  } finally { wiredFlag.forceOakRecordQuery(null); }
});

test("gallery: record-query-failed reads an id the fixture lacks with the constant on; record-query-off runs the same program with it off", async () => {
  const { readFileSync } = await import("node:fs");
  const states = JSON.parse(readFileSync(new URL("../../../src/data/dev/oak-states/record-query.json", import.meta.url), "utf8"));
  const byId = Object.fromEntries(states.map(state => [state.id, state]));
  const failed = byId["record-query-failed"], off = byId["record-query-off"];
  assert.ok(failed && off, "both states exist");
  assert.equal(failed.recordQuery, true);
  assert.equal(off.recordQuery, false);
  const programOf = state => state.workspace.messages.at(-1).ui.program;
  assert.match(programOf(failed), /Query\("oak_record", \{ "documentId": "work:ecosmartloop" \}/);
  assert.ok(!Object.keys(failed.recordFacts).includes(DOCUMENT));
  assert.equal(programOf(off), programOf(byId["record-query-loading"]));
  flag.forceOakRecordQuery(false);
  try {
    const text = drawQuery("off342", programOf(off));
    assert.ok(text.includes(LINE) && !text.includes("Loading the record"), text.slice(0, 200));
  } finally { flag.forceOakRecordQuery(null); }
});
