import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseFragment } from "parse5";
import { loadTsx } from "../design-rework/load-tsx.mjs";

// Ticket 53: the interactive Explainer presets on 52's shell, drawn from reviewed fixtures and gated by taughtPresets.
globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, location: { search: "" }, addEventListener() {}, removeEventListener() {} };
const root = path.resolve(import.meta.dirname, "../../..");
const flag = loadTsx("src/lib/oakFlags/explainer.ts");
const { Explainer } = loadTsx("src/lib/openui/components/Explainer.tsx");
const { OakArrangedAnswer } = loadTsx("src/components/agent/OakOpenUIAnswer.tsx");
const { XRAG } = loadTsx("src/lib/openui/components/explainer/xrag.tsx");
const { XEMB, xembNearest } = loadTsx("src/lib/openui/components/explainer/xemb.tsx");
const { XTOOL } = loadTsx("src/lib/openui/components/explainer/xtool.tsx");
const { STATEDIAG } = loadTsx("src/lib/openui/components/explainer/statediag.tsx");
const { XEVAL, xevalClears } = loadTsx("src/lib/openui/components/explainer/xeval.tsx");
const { XGRAD, xgradPath } = loadTsx("src/lib/openui/components/explainer/xgrad.tsx");
const { XOFFSTEPS } = loadTsx("src/lib/openui/components/explainer/xoffsteps.tsx");

const PRESETS = ["xrag", "xemb", "xtool", "statediag", "xeval", "xgrad", "xoffsteps"];
const NO_BRIDGE = new Set(["xeval", "xgrad", "xoffsteps"]);
const CLAIM = { id: "claim-1", text: "RAG fetches passages before the model writes.", citations: [{ documentId: "work:agentic-brain", passageId: "work:agentic-brain:passage-001", sectionId: "work:agentic-brain", url: "https://steveoak.com/work/agentic-brain/" }] };
const render = args => renderToStaticMarkup(createElement(OakArrangedAnswer, { id: "m1", question: "How does retrieval pick passages?", latest: true,
  answer: { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "c", hardPolicyVersion: "h", knowledgeRevision: "k", operations: [], kind: "sourced", acknowledgment: null, claims: [CLAIM] },
  ui: { requestId: "00000000-0000-4000-8000-0000000000e6", status: "done", program: `root = Answer([p, e])\np = Prose("claim-1")\ne = Explainer(${args})` } }));
const on = (fn, presets = ["concept", "xmap", ...PRESETS]) => {
  flag.forceOakExplainerBlock(true); flag.forceOakExplainerPresets(presets);
  try { return fn(); } finally { flag.forceOakExplainerBlock(null); flag.forceOakExplainerPresets(null); }
};

const nodes = (node, out = []) => { out.push(node); for (const child of node.childNodes ?? []) nodes(child, out); return out; };
const attr = (node, name) => node.attrs?.find(item => item.name === name)?.value;
const text = node => node.nodeName === "#text" ? node.value : (node.childNodes ?? []).map(text).join("");
const block = html => nodes(parseFragment(html)).find(node => attr(node, "class")?.split(" ").includes("oak-explainer"));
const drawn = preset => block(on(() => render(`"rag", "${preset}"`)));

for (const preset of PRESETS) on(() => render(`"rag", "${preset}"`));
await new Promise(setImmediate);

const bridgeText = (preset, topic) => { const found = block(on(() => render(`"${topic}", "${preset}"`))); const line = nodes(found).find(node => attr(node, "data-bridge") !== undefined); return line ? text(line) : null; };
for (const [preset, line] of [["xrag", "Where Steve used this: Agentic Brain"], ["xemb", "Related: Agentic Brain"], ["xtool", "Where Steve used this: Oakminder, Agentic Brain"], ["statediag", "Where Steve used this: Oakminder"]]) {
  test(`${preset}: the Bridge line names the preset's own subject's record, whatever topic the model passed`, () => {
    assert.ok(bridgeText(preset, "image-classification")?.startsWith(line), bridgeText(preset, "image-classification"));
    assert.doesNotMatch(bridgeText(preset, "image-classification"), /EcoSmartLoop/);
  });
}
for (const preset of NO_BRIDGE) {
  test(`${preset}: a preset with no record of its own shows no Bridge line, even under a topic Steve used`, () => {
    assert.equal(bridgeText(preset, "image-classification"), null);
    assert.equal(bridgeText(preset, "rag"), null);
  });
}

for (const preset of PRESETS) {
  test(`${preset}: draws when taught, keeps the "Drawn by Oak AI" label and ${NO_BRIDGE.has(preset) ? "no" : "the"} Bridge line`, () => {
    const found = drawn(preset);
    assert.ok(found, "the explainer drew");
    assert.equal(attr(found, "data-preset"), preset);
    assert.match(text(found), /Drawn by Oak AI/);
    assert.equal(nodes(found).some(node => attr(node, "data-bridge") !== undefined), !NO_BRIDGE.has(preset), "a Bridge line closes it unless the steps make no claim about Steve");
    assert.ok(nodes(found).some(node => node.nodeName === "figure"), "the drawing sits in OakFigure");
  });

  test(`${preset}: an untaught preset draws the concept preset`, () => {
    assert.equal(attr(block(on(() => render(`"rag", "${preset}"`), ["concept", "xmap"])), "data-preset"), "concept");
  });

  test(`${preset}: no autoplay, so reduced motion has nothing to stop`, () => {
    const source = readFileSync(path.join(root, `src/lib/openui/components/explainer/${preset}.tsx`), "utf8");
    assert.doesNotMatch(source, /setInterval|setTimeout|requestAnimationFrame|autoPlay/i);
  });
}

test("xemb: the slider is a native range input with a visible value and one-step arrow keys", () => {
  const found = drawn("xemb");
  const range = nodes(found).find(node => node.nodeName === "input" && attr(node, "type") === "range");
  assert.ok(range, "a native range input");
  assert.equal(attr(range, "step"), "1");
  assert.equal(attr(range, "min"), "1");
  assert.equal(attr(range, "max"), String(XEMB.points.length));
  const output = nodes(found).find(node => node.nodeName === "output");
  assert.equal(text(output), String(XEMB.start), "the value is shown as text");
  assert.ok(nodes(found).some(node => node.nodeName === "label" && attr(node, "for") === attr(range, "id")), "the slider has a visible label");
});

test("xemb: neighbours come from fixture points by distance, never from the model", () => {
  const near = xembNearest(XEMB.start).map(point => point.word);
  assert.equal(near.length, XEMB.start);
  const html = text(drawn("xemb"));
  for (const word of near) assert.ok(html.includes(word), `${word} is named`);
  const far = XEMB.points.filter(point => !near.includes(point.word));
  const dist = point => Math.hypot(point.x - XEMB.query.x, point.y - XEMB.query.y);
  assert.ok(Math.max(...xembNearest(XEMB.start).map(dist)) <= Math.min(...far.map(dist)));
});

test("xrag: top-k chips are pressed buttons and the kept passages are the fixture's highest scores", () => {
  const found = drawn("xrag");
  const chips = nodes(found).filter(node => node.nodeName === "button" && attr(node, "aria-pressed") !== undefined && /^Top/.test(text(node)));
  assert.deepEqual(chips.map(text), XRAG.ks.map(k => `Top ${k}`));
  assert.deepEqual(chips.filter(node => attr(node, "aria-pressed") === "true").map(text), [`Top ${XRAG.start}`]);
  const kept = nodes(found).filter(node => attr(node, "data-kept") !== undefined).map(text);
  const top = [...XRAG.passages].sort((a, b) => b.score - a.score).slice(0, XRAG.start);
  for (const passage of top) assert.ok(kept.some(row => row.includes(passage.text)), `${passage.text} is kept`);
  assert.equal(kept.length, XRAG.start);
});

test("xeval: round chips are pressed buttons, and each check says in words whether its fixture pass rate clears the bar", () => {
  const found = drawn("xeval");
  const chips = nodes(found).filter(node => node.nodeName === "button" && attr(node, "aria-pressed") !== undefined && /^Round/.test(text(node)));
  assert.deepEqual(chips.map(text), XEVAL.rounds.map(round => round.label));
  assert.deepEqual(chips.filter(node => attr(node, "aria-pressed") === "true").map(text), [XEVAL.rounds[XEVAL.start].label]);
  const round = XEVAL.rounds[XEVAL.start];
  const rows = nodes(found).filter(node => node.nodeName === "li" && attr(node, "data-clears") !== undefined);
  assert.equal(rows.length, xevalClears(round).length);
  for (const check of round.checks) assert.match(text(found), new RegExp(`${check.name}.*${Math.round(check.passed / check.total * 100)}%`));
  assert.match(text(found), /Clears the bar/);
  assert.match(text(found), /Below the bar/);
});

test("xgrad: the learning-rate slider is a native range input over the fixture rates with the rate shown as text", () => {
  const found = drawn("xgrad");
  const range = nodes(found).find(node => node.nodeName === "input" && attr(node, "type") === "range");
  assert.ok(range, "a native range input");
  assert.equal(attr(range, "step"), "1");
  assert.equal(attr(range, "min"), "0");
  assert.equal(attr(range, "max"), String(XGRAD.rates.length - 1));
  assert.equal(text(nodes(found).find(node => node.nodeName === "output")), String(XGRAD.rates[XGRAD.start].rate));
  assert.ok(nodes(found).some(node => node.nodeName === "label" && attr(node, "for") === attr(range, "id")), "the slider has a visible label");
});

test("xgrad: each step follows w minus rate times the slope of w squared, from the fixture start", () => {
  for (const { rate } of XGRAD.rates) {
    const path = xgradPath(rate);
    assert.equal(path[0], XGRAD.from);
    assert.equal(path.length, XGRAD.steps + 1);
    for (let i = 1; i < path.length; i += 1) assert.ok(Math.abs(path[i] - (path[i - 1] - rate * 2 * path[i - 1])) < 1e-9);
  }
  assert.ok(Math.abs(xgradPath(XGRAD.rates.at(-1).rate).at(-1)) > Math.abs(XGRAD.from), "the largest fixture rate runs away");
  assert.ok(Math.abs(xgradPath(XGRAD.rates[XGRAD.start].rate).at(-1)) < 1, "the starting rate settles");
});

for (const [preset, data, noun] of [["xtool", XTOOL, "Step"], ["statediag", STATEDIAG, "State"], ["xoffsteps", XOFFSTEPS, "Step"]]) {
  test(`${preset}: back and next step through fixture rows, and the count names the step in words`, () => {
    const found = drawn(preset);
    const names = nodes(found).filter(node => node.nodeName === "button").map(node => attr(node, "aria-label"));
    assert.ok(names.includes(`Previous ${noun.toLowerCase()}`) && names.includes(`Next ${noun.toLowerCase()}`));
    assert.match(text(found), new RegExp(`${noun} 1 of ${data.steps.length}, ${data.steps[0].label}`));
  });
}

test("fixture: the props take topic and preset, plus ticket 54's spec that only drawn and mermaid read", () => {
  assert.deepEqual(Object.keys(Explainer.props.shape).sort(), ["preset", "spec", "topic"]);
  for (const preset of PRESETS) assert.equal(Explainer.props.safeParse({ topic: "rag", preset }).success, true, `${preset} parses`);
});
