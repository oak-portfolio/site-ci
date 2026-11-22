import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseFragment } from "parse5";
import { parse as parseYaml } from "yaml";
import { loadTsx } from "../design-rework/load-tsx.mjs";

// Ticket 52: Explainer(topic, preset) in the labeled lane, the concept preset and the topic map (xmap) as its index.
globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, location: { search: "" }, addEventListener() {}, removeEventListener() {} };
const root = path.resolve(import.meta.dirname, "../../..");
const flag = loadTsx("src/lib/oakFlags/explainer.ts");
const { oakExplainerTopics } = loadTsx("src/data/oakExplainerTopics.ts");
const { Explainer } = loadTsx("src/lib/openui/components/Explainer.tsx");
const { OakArrangedAnswer } = loadTsx("src/components/agent/OakOpenUIAnswer.tsx");

const PROJECTS = ["LinkedIn Growth Loop", "Oakminder", "Agentic Brain", "OmniSocial", "EcoSmartLoop"];
const CLAIM = { id: "claim-1", text: "RAG fetches passages before the model writes.", citations: [{ documentId: "work:agentic-brain", passageId: "work:agentic-brain:passage-001", sectionId: "work:agentic-brain", url: "https://steveoak.com/work/agentic-brain/" }] };
const render = args => renderToStaticMarkup(createElement(OakArrangedAnswer, { id: "m1", question: "What is RAG?", latest: true,
  answer: { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "c", hardPolicyVersion: "h", knowledgeRevision: "k", operations: [], kind: "sourced", acknowledgment: null, claims: [CLAIM] },
  ui: { requestId: "00000000-0000-4000-8000-0000000000e5", status: "done", program: `root = Answer([p, e])\np = Prose("claim-1")\ne = Explainer(${args})` } }));
const on = fn => { flag.forceOakExplainerBlock(true); try { return fn(); } finally { flag.forceOakExplainerBlock(null); } };

const nodes = (node, out = []) => { out.push(node); for (const child of node.childNodes ?? []) nodes(child, out); return out; };
const attr = (node, name) => node.attrs?.find(item => item.name === name)?.value;
const text = node => node.nodeName === "#text" ? node.value : (node.childNodes ?? []).map(text).join("");
const textOutside = (node, skip) => node.nodeName === "#text" ? node.value : skip(node) ? " " : (node.childNodes ?? []).map(child => textOutside(child, skip)).join("");
const tree = html => parseFragment(html);
const block = html => nodes(tree(html)).find(node => attr(node, "class")?.split(" ").includes("oak-explainer"));

on(() => render(`"rag"`));
await new Promise(setImmediate);

test("constant: oakExplainerBlock ships false and a force flips it", () => {
  assert.equal(flag.oakExplainerBlock, false);
  assert.equal(flag.oakExplainerBlockOn(), false);
  flag.forceOakExplainerBlock(true);
  assert.equal(flag.oakExplainerBlockOn(), true);
  flag.forceOakExplainerBlock(null);
});

for (const [args, preset] of [[`"rag"`, "concept"], [`"agent-memory", "concept"`, "concept"], [`"agent-memory", "xmap"`, "xmap"]]) {
  test(`label: ${args} shows "Drawn by Oak AI" and its accessible name carries it`, () => {
    const found = block(on(() => render(args)));
    assert.ok(found, "the explainer drew");
    assert.equal(attr(found, "data-preset"), preset);
    const label = nodes(found).find(node => attr(node, "class") === "oak-explainer__label");
    assert.match(text(label), /Drawn by Oak AI/);
    assert.ok(!nodes(label).some(node => attr(node, "class")?.includes("sr-only")), "the label is visible");
    const named = (attr(found, "aria-labelledby") ?? "").split(" ");
    assert.ok(named.includes(attr(label, "id")), "the block's name includes the label");
  });

  test(`claims: ${args} names Steve and his projects only inside the Bridge line`, () => {
    const found = block(on(() => render(args)));
    const bridges = nodes(found).filter(node => attr(node, "data-bridge") !== undefined);
    assert.ok(bridges.length >= 1, "a Bridge line closes the explainer");
    assert.ok(bridges.some(node => PROJECTS.some(name => text(node).includes(name))), "the Bridge names a project");
    const rest = textOutside(found, node => attr(node, "data-bridge") !== undefined);
    for (const name of ["Steve", ...PROJECTS]) assert.ok(!rest.includes(name), `${name} appears outside the Bridge line`);
  });
}

test("topic map: the selected topic and every wire read as text, not highlight only", () => {
  const found = block(on(() => render(`"agent-memory", "xmap"`)));
  const pressed = nodes(found).filter(node => node.nodeName === "button" && attr(node, "aria-pressed") === "true");
  assert.deepEqual(pressed.map(text), ["Agent memory"]);
  const rows = nodes(found).filter(node => node.nodeName === "dt").map(dt => `${text(dt)}: ${text(dt.parentNode.childNodes.find(node => node.nodeName === "dd"))}`);
  for (const topic of oakExplainerTopics) for (const link of topic.used)
    assert.ok(rows.some(row => row.startsWith(`${topic.name}:`) && row.includes(link.name)), `${topic.name} to ${link.name} is a text row`);
  const panel = nodes(found).find(node => attr(node, "class") === "oak-explainer__panel");
  const links = nodes(panel).filter(node => node.nodeName === "a").map(text);
  assert.deepEqual(links, oakExplainerTopics.find(topic => topic.id === "agent-memory").used.map(link => link.name));
});

test("fixture: presets draw fixed reviewed text; the only model-written prop is ticket 54's spec, which fixture presets never read", () => {
  const shape = Explainer.props.shape;
  assert.deepEqual(Object.keys(shape).sort(), ["preset", "spec", "topic"]);
  assert.doesNotMatch(on(() => render(`"rag", "concept", "Model words\\nA -> B"`)), /Model words/);
  assert.equal(Explainer.props.safeParse({ topic: "rag", preset: "concept", steps: ["x"] }).success, true, "extra keys are dropped");
  assert.equal(Explainer.props.safeParse({ topic: "made up" }).success, false, "topics are the reviewed list only");
  const html = on(() => render(`"rag"`));
  const rag = oakExplainerTopics.find(topic => topic.id === "rag");
  for (const step of rag.steps) assert.ok(html.includes(step.label) && html.includes(step.line), `${step.label} comes from the fixture`);
});

test("record links: a 'used' link names a record whose stack or systemMap names the topic; 'related' never claims use", () => {
  for (const topic of oakExplainerTopics) {
    assert.ok(topic.used.length || topic.related, `${topic.id} ends with a Bridge line`);
    for (const link of topic.used) {
      const slug = link.documentId.replace(/^work:/, "");
      const front = parseYaml(readFileSync(path.join(root, `src/content/work/${slug}.mdx`), "utf8").match(/^---\n([\s\S]*?)\n---/)[1]);
      const named = JSON.stringify([front.stack, front.systemMap]).toLowerCase();
      assert.ok(topic.keywords.some(word => new RegExp(`\\b${word}\\b`).test(named)), `${slug} stack or systemMap names ${topic.id}`);
      assert.equal(link.page, `/work/${slug}/`);
    }
  }
  const html = on(() => render(`"embeddings"`));
  const bridge = nodes(block(html)).find(node => attr(node, "data-bridge") !== undefined);
  assert.match(text(bridge), /^Related/);
  assert.doesNotMatch(text(bridge), /used/i);
});

test("off: the constant off degrades to Prose with the topic's fixed summary", () => {
  const html = render(`"rag"`);
  const rag = oakExplainerTopics.find(topic => topic.id === "rag");
  assert.equal(block(html), undefined);
  const prose = nodes(tree(html)).filter(node => attr(node, "class") === "oak-openui__prose").map(text);
  assert.ok(prose.includes(rag.summary), "the summary is a Prose paragraph");
});
