import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { createLoader } from "../design-rework/load-tsx.mjs";

const root = path.resolve(import.meta.dirname, "../../..");
const systemMapOf = (slug) => parseYaml(readFileSync(path.join(root, `src/content/work/${slug}.mdx`), "utf8").match(/^---\n([\s\S]*?)\n---/)[1]).systemMap;
const { oakGraphLayout } = createLoader()("src/lib/openui/layout/oakGraphLayout.ts");

const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const onBorder = (point, box, slack = 1) => {
  const inside = point.x >= box.x - slack && point.x <= box.x + box.width + slack && point.y >= box.y - slack && point.y <= box.y + box.height + slack;
  const edge = Math.min(Math.abs(point.x - box.x), Math.abs(point.x - box.x - box.width), Math.abs(point.y - box.y), Math.abs(point.y - box.y - box.height));
  return inside && edge <= slack;
};

for (const [slug, count] of [["agentic-brain", 5], ["oakminder", 9]]) {
  test(`lays out the ${count}-node systemMap of ${slug} with no overlap and edges that meet their nodes`, async () => {
    const steps = systemMapOf(slug);
    assert.equal(steps.length, count);
    const layout = await oakGraphLayout(steps);
    assert.equal(layout.nodes.length, count);
    assert.deepEqual(layout.nodes.map((node) => node.label), steps.map((step) => step.label));
    for (const [i, a] of layout.nodes.entries()) {
      assert.ok(a.x >= 0 && a.y >= 0 && a.x + a.width <= layout.width && a.y + a.height <= layout.height, `${a.label} sits inside the canvas`);
      for (const b of layout.nodes.slice(i + 1)) assert.ok(!overlaps(a, b), `${a.label} overlaps ${b.label}`);
    }
    assert.deepEqual(layout.edges.map(({ from, to }) => [from, to]), steps.slice(1).map((_, i) => [i, i + 1]));
    for (const edge of layout.edges) {
      assert.ok(edge.points.length >= 2);
      assert.ok(onBorder(edge.points[0], layout.nodes[edge.from]), `edge ${edge.from}->${edge.to} leaves its source`);
      assert.ok(onBorder(edge.points.at(-1), layout.nodes[edge.to]), `edge ${edge.from}->${edge.to} reaches its target`);
    }
  });
}

test("dagre loads only through the helper's dynamic import, so no eager chunk can carry it", () => {
  const hits = ["src", "packages"].flatMap((dir) => readdirSync(path.join(root, dir), { recursive: true })
    .filter((file) => /\.(tsx?|mjs|js|json|astro|mdx?)$/.test(file) && !/(^|\/)node_modules\//.test(file))
    .flatMap((file) => readFileSync(path.join(root, dir, file), "utf8").split("\n")
      .flatMap((line, index) => /@dagrejs\/(dagre|graphlib)/.test(line) ? [`${dir}/${file}:${index + 1}:${line}`] : [])));
  assert.deepEqual(hits.map((hit) => hit.replace(/:\d+:.*/, "")), ["src/lib/openui/layout/oakGraphLayout.ts"]);
  assert.match(hits[0], /await import\("@dagrejs\/dagre"\)/);
});
