import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parse as parseYaml } from "yaml";
import { loadTsx } from "../design-rework/load-tsx.mjs";

// Ticket 45: the record presets (mindmap, treeview, radar, quadrant) draw only what a reviewed record carries.
globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, location: { search: "" }, addEventListener() {}, removeEventListener() {} };
const root = path.resolve(import.meta.dirname, "../../..");
const recordOf = slug => parseYaml(readFileSync(path.join(root, `src/content/work/${slug}.mdx`), "utf8").match(/^---\n([\s\S]*?)\n---/)[1]);
const verified = item => item.status === "verified";
const factsOf = slug => {
  const data = recordOf(slug);
  return {
    kind: "work", dek: data.dek, category: data.card.category, articleStatus: data.articleStatus ?? "full", datePublished: "2026-01-01",
    cover: { src: `/assets/${slug}.webp`, alt: data.card.imageAlt }, coverTint: "#687cee",
    systemMap: data.systemMap.map(({ label, description }) => ({ label, description })),
    artifacts: data.artifacts.filter(verified).map(({ label }) => ({ label, status: "verified" })),
    heldArtifacts: data.artifacts.filter(item => !verified(item)).length,
    metrics: data.metrics.filter(verified).map(({ label, value }) => ({ label, value })),
    sections: [{ anchor: "a", title: "A" }, { anchor: "b", title: "B" }],
  };
};
const held = slug => { const data = recordOf(slug); return [...data.artifacts, ...data.metrics].filter(item => !verified(item)).map(item => item.label); };

const flag = loadTsx("src/lib/oakFlags/diagram.ts");
const { primeOakRecordFacts } = loadTsx("src/lib/oakRecordFacts.ts");
const { OakArrangedAnswer } = loadTsx("src/components/agent/OakOpenUIAnswer.tsx");
const { oakMindmapLayout } = loadTsx("src/lib/openui/components/diagram/mindmap.tsx");
const { OAK_RADAR_AXES, oakRadarCounts, oakRadarLayout } = loadTsx("src/lib/openui/components/diagram/radar.tsx");
const { oakQuadrantPlace, OAK_QUADRANT_AXES } = loadTsx("src/lib/openui/components/diagram/quadrant.tsx");
const { OAK_DIAGRAM_PRESETS, OAK_DIAGRAM_RECORD_PRESETS } = loadTsx("packages/oak-agent-contracts/src/openui/views/diagram.ts");

const REVISION = "k45";
const cite = document => ({ documentId: document, passageId: `${document}:passage-001`, sectionId: document, url: `https://steveoak.com/${document.replace(":", "/")}/` });
const SLUGS = ["agentic-brain", "ecosmartloop", "oakminder", "omnisocial", "linkedin-growth-loop"];
primeOakRecordFacts(REVISION, { version: 1, knowledgeRevision: REVISION, records: Object.fromEntries(SLUGS.map(slug => [`work:${slug}`, factsOf(slug)])) });
const render = (slugs, args) => renderToStaticMarkup(createElement(OakArrangedAnswer, { id: "m1", question: "What are the parts of it?", latest: true,
  answer: { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "c", hardPolicyVersion: "h", knowledgeRevision: REVISION, operations: [], kind: "sourced", acknowledgment: null,
    claims: [{ id: "claim-1", text: "The work splits into parts.", citations: slugs.map(slug => cite(`work:${slug}`)) }] },
  ui: { requestId: "00000000-0000-4000-8000-0000000000e5", status: "done", program: `root = Answer([d])\nd = Diagram(${args})` } }));
const taught = (fn, presets = OAK_DIAGRAM_RECORD_PRESETS) => {
  flag.forceOakDiagramBlock(true); flag.forceOakDiagramPresets(presets);
  try { return fn(); } finally { flag.forceOakDiagramBlock(null); flag.forceOakDiagramPresets(null); }
};
taught(() => render(["oakminder"], `"claim-1"`));
await new Promise(setImmediate);

test("first check: only presets some record carries data for are built; the rest wait on Oak", () => {
  assert.deepEqual([...OAK_DIAGRAM_RECORD_PRESETS], ["mindmap", "treeview", "radar", "quadrant"]);
  for (const preset of OAK_DIAGRAM_RECORD_PRESETS) assert.ok(OAK_DIAGRAM_PRESETS.includes(preset), preset);
  for (const preset of ["er", "requirement", "ishikawa", "sequence", "class", "xychart"]) assert.ok(!OAK_DIAGRAM_PRESETS.includes(preset), `${preset} needs Oak`);
});

const inside = (box, width, height) => box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height;
const hit = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
for (const slug of ["agentic-brain", "oakminder", "linkedin-growth-loop"]) for (const width of [720, 342]) {
  test(`mindmap: ${slug} at ${width} keeps every node and label inside, apart, and joined to the hub`, () => {
    const labels = recordOf(slug).systemMap.map(step => step.label);
    const layout = oakMindmapLayout(labels, width);
    assert.ok(layout.width <= width);
    assert.equal(layout.nodes.length, labels.length);
    assert.equal(layout.branches.length, labels.length);
    const boxes = layout.nodes.flatMap(node => [node.dot, node.text]);
    boxes.push({ x: layout.hub.x - layout.hub.r, y: layout.hub.y - layout.hub.r, width: 2 * layout.hub.r, height: 2 * layout.hub.r });
    for (const [i, box] of boxes.entries()) {
      assert.ok(inside(box, layout.width, layout.height), `box ${i} inside`);
      for (const other of boxes.slice(i + 1)) assert.ok(!hit(box, other), `box ${i} clear`);
    }
    for (const [i, node] of layout.nodes.entries()) {
      assert.deepEqual(node.lines.join(" "), labels[i]);
      assert.ok(node.lines.length <= 2 && node.lines.every(line => line.length <= layout.chars), `${labels[i]} wraps in ${layout.chars}`);
      assert.match(layout.branches[i], /^M[\d. -]+C/);
    }
    assert.equal(layout.radial, width >= 560);
  });
}

test("radar: every axis says what it counts, and a record's values are those counts", () => {
  assert.deepEqual(OAK_RADAR_AXES.map(axis => axis.label), ["System map steps", "Published artifacts", "Metrics", "Case study sections"]);
  const facts = factsOf("ecosmartloop");
  assert.deepEqual(oakRadarCounts(facts), [facts.systemMap.length, facts.artifacts.length, facts.metrics.length, facts.sections.length]);
});

test("quadrant: across is the published artifact count, up is a full case study", () => {
  assert.deepEqual(OAK_QUADRANT_AXES, { x: "Published artifacts (count)", y: "Case study status" });
  const places = oakQuadrantPlace([{ name: "EcoSmartLoop", facts: factsOf("ecosmartloop") }, { name: "Agentic Brain", facts: factsOf("agentic-brain") }]);
  assert.deepEqual(places.map(place => [place.count, place.full]), [[factsOf("ecosmartloop").artifacts.length, true], [factsOf("agentic-brain").artifacts.length, false]]);
  assert.ok(places[0].x > places[1].x && places[0].y < places[1].y);
});

const box = label => { const x0 = label.anchor === "end" ? label.x - label.width : label.anchor === "middle" ? label.x - label.width / 2 : label.x; return { x0, x1: x0 + label.width, y0: label.y - 13, y1: label.y + 4 }; };
const meets = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

test("quadrant: EcoSmartLoop and Oakminder labels never overlap and stay inside the chart, at every width", () => {
  const records = [["EcoSmartLoop", "ecosmartloop"], ["OmniSocial", "omnisocial"], ["Oakminder", "oakminder"]].map(([name, slug]) => ({ name, facts: factsOf(slug) }));
  for (const width of [320, 358, 420, 640, 1000]) {
    const boxes = oakQuadrantPlace(records, width).map(place => box(place.label));
    for (const [at, one] of boxes.entries()) {
      assert.ok(one.x0 >= 0 && one.x1 <= width, `label ${at} inside ${width}`);
      for (const other of boxes.slice(at + 1)) assert.ok(!meets(one, other), `labels overlap at ${width}: ${JSON.stringify([one, other])}`);
    }
  }
});

test("radar and quadrant draw at the measured width, so 13px text stays 13px at 390", () => {
  assert.match(readFileSync(path.join(root, "src/styles/global.css"), "utf8"), /--text-ui-sm: 13px;/);
  const css = readFileSync(path.join(root, "src/styles/openui/diagram-record.css"), "utf8");
  assert.doesNotMatch(css.match(/\.oak-diagram-chart__svg \{[^}]*\}/)[0], /\s\swidth: 100%|height: auto/);
  const counts = [oakRadarCounts(factsOf("ecosmartloop")), oakRadarCounts(factsOf("agentic-brain"))];
  for (const width of [320, 358, 640]) {
    const radar = oakRadarLayout(counts, width);
    assert.equal(radar.width, width);
    for (const label of radar.labels) assert.ok(box(label).x0 >= 0 && box(label).x1 <= width, `radar label inside ${width}`);
  }
});

test("radar: three records with two-digit counts keep every label inside the canvas down to 280", () => {
  const counts = [[12, 14, 10, 11], [10, 10, 10, 10], [9, 12, 11, 10]];
  for (let width = 280; width <= 1000; width += 2) {
    for (const label of oakRadarLayout(counts, width).labels) assert.ok(box(label).x0 >= 0 && box(label).x1 <= width, `radar label inside ${width}: ${JSON.stringify(box(label))}`);
  }
});

test("mindmap: no label clips at 560 to 566, or anywhere up to 1000", () => {
  for (const slug of SLUGS) for (let width = 560; width <= 1000; width += 1) {
    for (const node of oakMindmapLayout(factsOf(slug).systemMap.map(step => step.label), width).nodes) {
      assert.ok(node.text.x >= 0 && node.text.x + node.text.width <= width, `${slug} at ${width}: ${node.lines.join(" ")}`);
    }
  }
});

test("quadrant: a crowd of dots stays inside its own status band", () => {
  const same = (full, at) => ({ name: `Record ${at}`, facts: { ...factsOf("ecosmartloop"), articleStatus: full ? "full" : "stub" } });
  const records = [...Array.from({ length: 7 }, (_, at) => same(true, at)), ...Array.from({ length: 7 }, (_, at) => same(false, at + 7))];
  for (const width of [280, 420, 1000]) for (const place of oakQuadrantPlace(records, width)) {
    assert.ok(place.full ? place.y - 6 >= 16 && place.y + 6 <= 124 : place.y - 6 >= 124 && place.y + 6 <= 232, `dot at ${place.y} leaves its band at ${width}`);
  }
});

test("forced colors: mind map dots fill Canvas and the selected number is HighlightText", async () => {
  const { default: postcss } = await import("postcss");
  const sheet = postcss.parse(readFileSync(path.join(root, "src/styles/openui/diagram-record.css"), "utf8"));
  const forced = new Map();
  sheet.walkAtRules("media", rule => {
    if (rule.params.includes("forced-colors: active")) rule.walkDecls("fill", decl => decl.parent.selectors.forEach(selector => forced.set(selector, decl.value)));
  });
  assert.equal(forced.get(".oak-diagram-map__node circle"), "Canvas");
  assert.equal(forced.get(".oak-diagram-map__node[data-selected] circle"), "Highlight");
  assert.equal(forced.get(".oak-diagram-map__node[data-selected] .oak-diagram-map__num"), "HighlightText");
});

test("the Diagram description names only taught presets, and the radar never claims strengths", () => {
  const { Diagram, oakDiagramPresetSentence } = loadTsx("src/lib/openui/components/Diagram.tsx");
  assert.equal(oakDiagramPresetSentence(["flow", "layers", "blockdiag"]),
    "preset: flow (default, steps in order), layers (stacked layers, for a layers question) or blockdiag (boxes with a line each).");
  const description = Diagram.description ?? Diagram.spec?.description ?? "";
  for (const preset of OAK_DIAGRAM_RECORD_PRESETS) assert.doesNotMatch(description, new RegExp(`\\b${preset} \\(`), preset);
  const radar = oakDiagramPresetSentence(["flow", "radar"]);
  assert.match(radar, /radar \(/);
  assert.doesNotMatch(radar, /strength/i);
});

for (const [preset, slugs] of [["mindmap", ["oakminder"]], ["treeview", ["agentic-brain"]], ["radar", ["ecosmartloop", "agentic-brain"]], ["quadrant", ["ecosmartloop", "omnisocial", "oakminder"]]]) {
  test(`${preset}: draws as itself, its list names each part, and no held item reaches the DOM`, () => {
    const html = taught(() => render(slugs, `"claim-1", "${preset}"`));
    assert.match(html, new RegExp(`data-preset="${preset}"`));
    assert.match(html, /<figure class="oak-figure"/);
    for (const slug of slugs) for (const label of held(slug)) assert.ok(!html.includes(label), `${slug} held "${label}" stays out`);
    assert.doesNotMatch(html, /do-not-publish|needs-oak|held/i);
    if (preset === "mindmap" || preset === "treeview") for (const step of recordOf(slugs[0]).systemMap) assert.ok(html.includes(step.label), step.label);
  });
}

test("radar and quadrant on one record draw its flow instead", () => {
  for (const preset of ["radar", "quadrant"]) assert.match(taught(() => render(["ecosmartloop"], `"claim-1", "${preset}"`)), /data-preset="flow"/);
});

test("a record preset nobody taught draws as flow", () => {
  assert.match(taught(() => render(["oakminder"], `"claim-1", "mindmap"`), ["flow"]), /data-preset="flow"/);
});

test("off: a record preset is the Steps list with the claim", () => {
  flag.forceOakDiagramBlock(false);
  const html = render(["oakminder"], `"claim-1", "mindmap"`);
  flag.forceOakDiagramBlock(null);
  assert.match(html, /oak-openui__steps/);
  assert.doesNotMatch(html, /oak-diagram|oak-figure/);
});
