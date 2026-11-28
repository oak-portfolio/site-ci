import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parse as parseYaml } from "yaml";
import { createLoader, loadTsx } from "../design-rework/load-tsx.mjs";
import { figureHarness } from "../openui-browser/figure-helpers.mjs";

// Ticket 44: Diagram(claim, preset, from) draws the cited record's systemMap behind oakDiagramBlock; off, it is Steps.
globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, location: { search: "" }, addEventListener() {}, removeEventListener() {} };
const root = path.resolve(import.meta.dirname, "../../..");
const systemMapOf = slug => parseYaml(readFileSync(path.join(root, `src/content/work/${slug}.mdx`), "utf8").match(/^---\n([\s\S]*?)\n---/)[1]).systemMap;
const flag = loadTsx("src/lib/oakFlags/diagram.ts");
const { primeOakRecordFacts } = loadTsx("src/lib/oakRecordFacts.ts");
const { OakArrangedAnswer } = loadTsx("src/components/agent/OakOpenUIAnswer.tsx");
const { oakDiagramLayout } = createLoader()("src/lib/openui/components/diagram/layout.ts");

const REVISION = "k";
const cite = document => ({ documentId: document, passageId: `${document}:passage-001`, sectionId: document, url: `https://steveoak.com/${document.replace(":", "/")}/` });
const CLAIM = { id: "claim-1", text: "Agentic Brain moves context through five layers.", citations: [cite("work:agentic-brain")] };
const facts = steps => ({ "work:agentic-brain": { kind: "work", articleStatus: "full", datePublished: "2026-01-01", systemMap: steps } });
const seed = records => primeOakRecordFacts(REVISION, { version: 1, knowledgeRevision: REVISION, records });
const render = args => renderToStaticMarkup(createElement(OakArrangedAnswer, { id: "m1", question: "How does Agentic Brain work?", latest: true,
  answer: { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "c", hardPolicyVersion: "h", knowledgeRevision: REVISION, operations: [], kind: "sourced", acknowledgment: null, claims: [CLAIM] },
  ui: { requestId: "00000000-0000-4000-8000-0000000000e4", status: "done", program: `root = Answer([d])\nd = Diagram(${args})` } }));
const on = fn => { flag.forceOakDiagramBlock(true); try { return fn(); } finally { flag.forceOakDiagramBlock(null); } };

on(() => render(`"claim-1"`));
await new Promise(setImmediate);

const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const onBorder = (point, box, slack = 1) => {
  const inside = point.x >= box.x - slack && point.x <= box.x + box.width + slack && point.y >= box.y - slack && point.y <= box.y + box.height + slack;
  return inside && Math.min(Math.abs(point.x - box.x), Math.abs(point.x - box.x - box.width), Math.abs(point.y - box.y), Math.abs(point.y - box.y - box.height)) <= slack;
};

test("constant: oakDiagramBlock is pinned in flag-pins, and a force flips it both ways", () => {
  flag.forceOakDiagramBlock(true);
  assert.equal(flag.oakDiagramBlockOn(), true);
  flag.forceOakDiagramBlock(null);
  assert.equal(flag.oakDiagramBlockOn(), flag.oakDiagramBlock);
  flag.forceOakDiagramBlock(false);
  assert.equal(flag.oakDiagramBlockOn(), false);
  flag.forceOakDiagramBlock(null);
  assert.equal(flag.oakDiagramBlockOn(), flag.oakDiagramBlock);
});

for (const [slug, count] of [["agentic-brain", 5], ["oakminder", 9]]) for (const preset of ["flow", "layers", "blockdiag"]) for (const width of [720, 342]) {
  test(`layout: ${preset} of ${slug} (${count}) at ${width} fits, never overlaps, and its edges meet their nodes`, async () => {
    const steps = systemMapOf(slug);
    assert.equal(steps.length, count);
    const layout = await oakDiagramLayout(steps, preset, width);
    assert.ok(layout.width <= width, `canvas ${layout.width} fits ${width}`);
    assert.deepEqual(layout.nodes.map(node => node.label), steps.map(step => step.label));
    for (const [i, a] of layout.nodes.entries()) {
      assert.ok(a.x >= 0 && a.y >= 0 && a.x + a.width <= layout.width && a.y + a.height <= layout.height, `${a.label} inside`);
      for (const b of layout.nodes.slice(i + 1)) assert.ok(!overlaps(a, b), `${a.label} overlaps ${b.label}`);
    }
    for (const edge of layout.edges) {
      assert.ok(onBorder(edge.points[0], layout.nodes[edge.from]), `edge ${edge.from} leaves its source`);
      assert.ok(onBorder(edge.points.at(-1), layout.nodes[edge.to]), `edge ${edge.to} reaches its target`);
    }
    const expected = width === 342 || preset === "layers" || count === 9 ? "TB" : preset === "flow" ? "LR" : layout.direction;
    assert.equal(layout.direction, expected);
  });
}

test("on: the figure names the project, its list holds every step in order, and the drawing waits for its width", () => {
  const steps = systemMapOf("agentic-brain");
  seed(facts(steps));
  const html = on(() => render(`"claim-1", "layers"`));
  assert.match(html, /<figure class="oak-figure"/);
  assert.match(html, /data-preset="layers"/);
  let at = -1;
  for (const step of steps) { const next = html.indexOf(step.label, at + 1); assert.ok(next > at, `${step.label} in order`); at = next; }
  assert.match(html, /oak-diagram__panel/);
});

test("an untaught preset draws as flow", () => {
  seed(facts(systemMapOf("agentic-brain")));
  assert.match(on(() => render(`"claim-1", "swimlanes"`)), /data-preset="flow"/);
});

test("off: Steps with from kept, holding the claim", () => {
  flag.forceOakDiagramBlock(false);
  const html = render(`"claim-1", "flow", 3`);
  flag.forceOakDiagramBlock(null);
  assert.match(html, /<ol class="oak-openui__steps" start="3" data-from=""/);
  assert.ok(html.includes(CLAIM.text));
  assert.doesNotMatch(html, /oak-diagram/);
});

test("facts missing or a one-step map degrade to Steps with the claim placed once", () => {
  seed({});
  for (const html of [on(() => render(`"claim-1"`)), (seed(facts(systemMapOf("agentic-brain").slice(0, 1))), on(() => render(`"claim-1"`)))]) {
    assert.match(html, /oak-openui__steps/);
    assert.equal(html.split(CLAIM.text).length - 1, 1);
    assert.doesNotMatch(html, /oak-figure/);
  }
});

test("dagre and the drawing load only in their own chunks", async () => {
  const { chunks, entry } = await figureHarness(`import { Diagram } from "@/lib/openui/components/Diagram"; console.log(Diagram.name);`);
  const main = chunks.find(chunk => chunk.file === entry);
  assert.doesNotMatch(main.text, /network-simplex|oak-diagram__canvas/);
  assert.ok(chunks.some(chunk => chunk.file !== entry && /network-simplex/.test(chunk.text)), "dagre is in a lazy chunk");
  assert.ok(chunks.some(chunk => chunk.file !== entry && /oak-diagram__canvas/.test(chunk.text)), "the view is in a lazy chunk");
});

test("the prompt description names no other component", () => {
  const { Diagram } = loadTsx("src/lib/openui/components/Diagram.tsx");
  assert.ok(Diagram.description.length > 0);
  assert.doesNotMatch(Diagram.description, /\b(Stack|Prose|Points|Project|Role|Profile|Quote|Steps|Sources|Ownership|Timeline|Stats|Board)\b/);
});

test("142: forced colors draws a CanvasText rule between diagram list rows, since it drops the inset-shadow divider", () => {
  const css = readFileSync("src/styles/openui/diagram.css", "utf8");
  const forced = css.slice(css.indexOf("@media (forced-colors: active)"));
  assert.match(forced, /\.oak-diagram \.oak-figure__row:not\(:first-child\)\s*\{[^}]*border-top:\s*1px solid CanvasText/, "each step row after the first keeps a system-color hairline");
});
