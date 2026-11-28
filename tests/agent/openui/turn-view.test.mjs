import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createStreamingParser } from "@openuidev/react-lang";
import snapshot from "../../../src/data/generated/knowledgeSnapshot.json" with { type: "json" };
import cardFacts from "../../../src/data/generated/card-facts.json" with { type: "json" };
import { createLoader, loadTsx, stubSets } from "../design-rework/load-tsx.mjs";
import { galleryStates, stateById } from "../premium/gallery.mjs";
import { arrangedView, printerTurn, printerTurnView } from "../../../scripts/quality/quality-bar-core.mjs";
import * as blockView from "../../../packages/oak-agent-contracts/src/openui/block-view.ts";
import { oakOpenUITurnView, oakRecordRow } from "../../../packages/oak-agent-contracts/src/openui/block-view.ts";

// Ticket 344: the printer and the island read one turn view (oakOpenUITurnView), so a `ui` field reaches both sides from the
// turn as given, and the bare record row (tickets 295, 307, 327) is decided once, in oakRecordRow.
globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, location: { search: "" }, addEventListener() {}, removeEventListener() {} };
const { OakArrangedAnswer, oakOpenUIParse } = loadTsx("src/components/agent/OakOpenUIAnswer.tsx");
const { oakRenderLibrary } = loadTsx("src/lib/openui.tsx");

const read = path => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
const messageOf = id => stateById(id).workspace.messages.find(message => message.ui?.status === "done");
const withUi = (message, ui) => ({ ...message, ui: { ...message.ui, ...ui } });
const withoutDated = message => { const { dated, ...ui } = message.ui; return { ...message, ui }; };

const labels = { knowledgeRevision: snapshot.revision, documents: snapshot.documents.map(({ id, title, canonicalUrl }) => {
  const card = cardFacts[canonicalUrl.replace(/\/$/, "")];
  return { documentId: id, title, canonicalUrl, cover: `/${id.replace(/\W/g, "-")}.webp`, ...(card ? { card } : {}) };
}) };

const bag = text => [...new Set(String(text).toLowerCase().match(/[a-z0-9]+/g) ?? [])].sort().join(" ");
const visible = html => html.replace(/<span class="sr-only">[\s\S]*?<\/span>/g, " ").replace(/<[^>]+>/g, " ").replace(/&[#a-z0-9]+;/gi, " ");

const islandHtml = message => {
  const { ui, answer } = printerTurn(message);
  return renderToStaticMarkup(createElement(OakArrangedAnswer, { id: message.id ?? "m2", answer, ui, question: "q", citationLabels: labels, latest: true }));
};

/** The record rows the island draws: each Role card's head and title chips, each Project card's name block, as word bags. */
function drawnRows(message) {
  return islandHtml(message).split(/<article class="oak-openui-card /).slice(1).map(card => {
    const head = card.match(/<div class="oak-openui-(?:role__head|card__name)">([\s\S]*?)<\/div>/)?.[1] ?? "";
    const titles = card.match(/<ul class="oak-openui-chips oak-openui-role__titles"[^>]*>([\s\S]*?)<\/ul>/)?.[1] ?? "";
    return bag(visible(`${head} ${titles}`));
  }).filter(Boolean).sort();
}

/** The record lines the printer prints for the same turn, as word bags. */
function printedRows(message) {
  const shown = arrangedView(printerTurn(message), message.answer.claims, { shared: false });
  return shown.view.split("\n").flatMap(line => {
    const tag = ["[role card] ", "[project card] "].find(prefix => line.startsWith(prefix));
    return tag ? [bag(line.slice(tag.length))] : [];
  }).filter(Boolean).sort();
}

const YEAR = /\b(?:19|20)\d\d\b/;

let drift = null;
const drifted = createLoader({ use: [stubSets.icons, stubSets.workspaceStore()], interop: true, stubs: { "../../../packages/oak-agent-contracts/src/openui/block-view": {
  ...blockView, oakOpenUITurnView: args => { const view = oakOpenUITurnView(args); return drift ? { ...view, ...drift(view) } : view; },
} } })("src/components/agent/OakOpenUIAnswer.tsx").OakArrangedAnswer;
const driftedHtml = (message, change) => {
  drift = change;
  try {
    const { ui, answer } = printerTurn(message);
    return renderToStaticMarkup(createElement(drifted, { id: message.id ?? "m2", answer, ui, question: "q", citationLabels: labels, latest: true }));
  } finally { drift = null; }
};
const recordRows = html => html.split(/<article class="oak-openui-card /).slice(1).map(card => {
  const head = card.match(/<div class="oak-openui-(?:role__head|card__name)">([\s\S]*?)<\/div>/)?.[1] ?? "";
  const titles = card.match(/<ul class="oak-openui-chips oak-openui-role__titles"[^>]*>([\s\S]*?)<\/ul>/)?.[1] ?? "";
  return bag(visible(`${head} ${titles}`));
}).filter(Boolean).sort();
const compareHead = html => visible(html.match(/<div class="oak-openui__compare-head"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "").trim();

test("T349-1 the island's Compare names its columns from the turn view's claim facts, not its own reading of the claims", () => {
  const compare = messageOf("answer-openui-compare-paired");
  const asIs = driftedHtml(compare, null);
  assert.ok(compareHead(asIs) && !/Drift/.test(compareHead(asIs)), "the paired compare names its two columns from the claim facts");
  const renamed = driftedHtml(compare, view => ({ claimFacts: id => {
    const facts = view.claimFacts(id);
    return facts?.card ? { ...facts, card: { ...facts.card, name: `Drift ${facts.card.name}` } } : facts;
  } }));
  assert.match(compareHead(renamed), /^Drift \S[\s\S]*Drift \S/, "Compare names both columns from the turn view's claim facts");
});

test("T349-2 the island's Project and Role cards read beside-a-Stack from the turn view, not from the Answer's own blocks", () => {
  const dated = messageOf("record-dated");
  assert.ok(recordRows(driftedHtml(dated, null)).length, "record-dated draws its record rows when no Stack stands beside them");
  assert.deepEqual(recordRows(driftedHtml(dated, () => ({ stacked: true }))), [], "with the turn view's word that a Stack stands beside them, each card is bare");
  assert.ok(recordRows(driftedHtml(messageOf("answer-openui-projects"), () => ({ stacked: false }))).length, "and without it, a Stack's cards draw their rows");
});

test("T349-3 while a layout streams, the turn view's beside-a-Stack is the Renderer's own: at every cut of each Stack program, its streaming parser and the island's parse agree", () => {
  const programs = new Set(galleryStates.flatMap(state => (state.workspace?.messages ?? []).map(message => message.ui?.program ?? ""))
    .filter(program => /\bStack\(/.test(program) && /\b(?:Role|Project)\(/.test(program)));
  assert.ok(programs.size >= 4, "the gallery holds Stack programs beside Role or Project cards");
  const rootLast = program => { const lines = program.split("\n"), at = lines.findIndex(line => line.startsWith("root =")); return [...lines.filter((_, k) => k !== at), lines[at]].join("\n"); };
  const held = root => { const blocks = root?.props?.children; return Array.isArray(blocks) && blocks.some(child => child?.typeName === "Stack"); };
  const split = [];
  for (const program of [...programs].flatMap(program => [program, rootLast(program)])) {
    const renderer = createStreamingParser(oakRenderLibrary.toJSONSchema(), "Answer");
    for (let cut = 0; cut <= program.length; cut++) {
      const shown = program.slice(0, cut);
      const island = oakOpenUITurnView({ ui: { status: "streaming", program: shown }, answer: { claims: [] }, question: "q", root: oakOpenUIParse(shown).root, cardOf: () => null }).stacked;
      if (island !== held(renderer.set(shown, false)?.root)) split.push(JSON.stringify(shown.slice(-40)));
    }
  }
  assert.deepEqual(split, [], "no streamed frame draws Role or Project rows under a different beside-a-Stack than the Renderer's blocks hold");
});

test("T344-1 a field added to a gallery message's ui reaches the printer's turn view as given, and the island's scope spreads the same reading", () => {
  const message = withUi(messageOf("record-dated"), { future: "kept" });
  const turn = printerTurn(message);
  assert.equal(turn.ui, message.ui, "the printer's turn carries the message's whole ui");
  const view = printerTurnView(turn, message.answer.claims);
  assert.equal(view.ui.future, "kept", "the printer reads the unknown field through oakOpenUITurnView");
  assert.equal(view.dated, true);
  assert.equal(oakOpenUITurnView({ ui: message.ui, answer: message.answer, question: "", cardOf: () => null }).ui.future, "kept");
  const island = read("src/components/agent/OakOpenUIAnswer.tsx");
  assert.match(island, /\.\.\.oakOpenUITurnView\(\{ ui, answer, question,/, "the island's scope is the same turn view plus its render functions");
  assert.doesNotMatch(island, /dated: ui\?\.dated|claims: new Map\(answer\.claims/, "the island rebuilds none of the turn view's fields");
});

test("T344-2 on the two 327 states, each with its dated word flipped, and a beside-a-Stack state, the printer's record lines are the rows the island draws", () => {
  const undated = messageOf("record-undated"), dated = messageOf("record-dated"), stacked = messageOf("answer-openui-projects");
  assert.equal(undated.ui.dated, false);
  assert.equal(dated.ui.dated, true);
  const cases = { "record-undated": undated, "record-undated without dated": withoutDated(undated), "record-dated": dated,
    "record-dated with dated false": withUi(dated, { dated: false }), "answer-openui-projects": stacked };
  const bare = new Set(["record-dated with dated false", "answer-openui-projects"]);
  for (const [name, message] of Object.entries(cases)) {
    const drawn = drawnRows(message), printed = printedRows(message);
    assert.deepEqual(printed, drawn, `${name}: the printer prints the rows the island draws`);
    if (bare.has(name)) {
      assert.deepEqual(drawn, [], `${name}: each Project claim names its record, so each card is bare on both sides (tickets 307 and 327)`);
      assert.equal(islandHtml(message).match(/class="oak-openui-card__cover"/g)?.length, 2, `${name}: both cards still draw, their covers the links`);
    } else assert.ok(drawn.length, `${name}: the island draws record rows`);
    if (message.ui.dated === false) assert.ok(drawn.every(row => !YEAR.test(row)), `${name}: an undated turn's rows carry no dates`);
    if (message.ui.dated !== false && message !== stacked) assert.ok(drawn.some(row => YEAR.test(row)), `${name}: a dated turn's rows keep their dates`);
  }
});

test("T344-3 card-order and printer parity build a gallery turn only through printerTurn, so their views of the 327 states are one view", () => {
  for (const file of ["tests/agent/openui-browser/card-order.test.mjs", "tests/agent/openui-browser/printer-parity.test.mjs"]) {
    const source = read(file);
    assert.match(source, /arrangedView\(printerTurn\(message\)/, `${file} prints the turn printerTurn gives`);
    assert.doesNotMatch(source, /arrangedView\(\{/, `${file} rebuilds no turn by hand`);
  }
  for (const id of ["record-undated", "record-dated"]) {
    const message = messageOf(id);
    assert.deepEqual(printerTurn(message).ui, message.ui, `${id}: the turn keeps the message's dated word`);
    assert.equal(printerTurn(message).answer.knowledgeRevision, snapshot.revision);
  }
});

test("T344-4 oakRecordRow decides the bare row: beside a Stack or under an undated question, a card whose name the answer says draws no name line", () => {
  const said = name => field => field === name;
  const role = { place: "Oak Labs", role: "Founder", period: "Jan 2024 - Jan 2025" };
  const project = { title: "EcoSmartLoop", role: "Lead", period: "Sep 2025 - Dec 2025" };
  assert.equal(oakRecordRow("role", { ...role, stacked: true }, said("Oak Labs")).bare, true);
  assert.equal(oakRecordRow("role", { ...role, dated: false }, said("Oak Labs")).bare, true);
  assert.equal(oakRecordRow("role", { ...role, stacked: true }, said("x")).bare, false);
  assert.equal(oakRecordRow("role", role, said("Oak Labs")).bare, false);
  assert.equal(oakRecordRow("project", { ...project, dated: false }, said("EcoSmartLoop")).bare, true);
  assert.equal(oakRecordRow("project", { ...project, dated: true }, said("EcoSmartLoop")).bare, false);
  assert.equal(oakRecordRow("source", { host: "steveoak.com", title: "Home", dated: false }, said("steveoak.com")).bare, false);
  for (const file of ["src/lib/openui/components/Role.tsx", "src/lib/openui/components/Project.tsx", "scripts/quality/quality-bar-core.mjs"])
    assert.doesNotMatch(read(file), /dated === false\) && said|stacked \|\| dated/, `${file} reads the row's bare decision`);
});

test("T344-5 the turn view: claims by id, card facts, beside-a-Stack from the parsed root, a tools question's listed Stack, and records by document", () => {
  const claims = [{ id: "claim-1", text: "EcoSmartLoop ships Orbi AI.", citations: [{ documentId: "work:ecosmartloop" }] }];
  const source = { title: "EcoSmartLoop: AI Agent Platform", page: "https://steveoak.com/work/ecosmartloop/", card: { kind: "work" } };
  const root = children => ({ typeName: "Answer", props: { children } });
  const view = oakOpenUITurnView({ ui: { status: "done", program: "root = Answer([a, s])\na = Project([\"claim-1\"])\ns = Stack()" }, answer: { kind: "gap", claims, knowledgeRevision: "k" },
    question: "What tools does he use?", root: root([{ typeName: "Project" }, { typeName: "Stack" }]), cardOf: () => source, records: { "work:ecosmartloop": { kind: "work" } } });
  assert.equal(view.claims.get("claim-1"), claims[0]);
  assert.deepEqual(view.claimFacts("claim-1"), { text: claims[0].text, document: "work:ecosmartloop", card: { page: source.page, name: "EcoSmartLoop" } });
  assert.equal(view.claimFacts("claim-9"), undefined);
  assert.equal(view.stacked, true);
  assert.deepEqual(view.tools, { listed: true });
  assert.equal(view.gap, true);
  assert.equal(view.knowledgeRevision, "k");
  assert.deepEqual(view.recordOf("work:ecosmartloop"), { kind: "work" });
  assert.equal(view.recordOf("work:none"), null);
  const plain = oakOpenUITurnView({ ui: { status: "done", program: "root = Answer([a])" }, answer: { kind: "sourced", claims }, question: "What did he build?", root: root([{ typeName: "Project" }]), cardOf: () => null });
  assert.equal(plain.stacked, false);
  assert.equal(plain.tools, undefined);
  assert.equal(plain.recordOf("work:ecosmartloop"), null);
  assert.deepEqual(plain.claimFacts("claim-1"), { text: claims[0].text, document: "work:ecosmartloop" });
});
