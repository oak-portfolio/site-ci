import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { loadTsx } from "../design-rework/load-tsx.mjs";
import { oakBlockFragments, oakBlockProblems, oakBlocksSource } from "../../../scripts/openui/build-prompt.mjs";

globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, location: { search: "" }, addEventListener() {}, removeEventListener() {} };
const { oakRenderLibrary } = loadTsx("src/lib/openui.tsx");
const fragments = oakBlockFragments();
const generated = "packages/oak-agent-contracts/src/openui/blocks.generated.ts";
const stats = () => structuredClone(fragments.find(fragment => fragment.name === "Stats"));
const without = (key) => { const fragment = stats(); delete fragment[key]; if (key === "planned") delete fragment.plan; return fragment; };

test("registry: every library component has exactly one fragment, named as its file", () => {
  assert.deepEqual(fragments.map(fragment => fragment.name).sort(), Object.keys(oakRenderLibrary.components).sort());
});

test("registry: every fragment passes the fragment rules", () => {
  assert.deepEqual(fragments.flatMap(oakBlockProblems), []);
});

test("registry: a fragment fails without judgeView, structure, an explicit structured flag or a plan field", () => {
  for (const key of ["judgeView", "structure", "structured", "planned"]) {
    assert.ok(oakBlockProblems(without(key)).some(problem => problem.includes(key === "planned" ? "plan" : key)), `missing ${key} is reported`);
  }
  assert.ok(oakBlockProblems({ ...without("planned"), plan: { in: { "results-metrics": 2 }, count: "hits" } }).length === 0, "a plan field stands in for planned: false");
  assert.ok(oakBlockProblems({ ...stats(), planned: true }).some(problem => problem.includes("plan")), "planned must be false when there is no plan");
  assert.ok(oakBlockProblems({ ...stats(), structured: "yes" }).some(problem => problem.includes("structured")), "structured is a boolean");
  assert.ok(oakBlockProblems({ ...stats(), judgeView: {} }).some(problem => problem.includes("judgeView")), "a judgeView names its kind");
  assert.ok(oakBlockProblems({ ...stats(), pendingCap: null }).some(problem => problem.includes("pendingCap")), "a pending kind carries its cap");
  assert.ok(oakBlockProblems({ ...stats(), view: "views/missing.ts" }).some(problem => problem.includes("view")), "a view names a file that exists");
});

test("registry: a plan field that is not a plan rule is reported", () => {
  const stack = fragments.find(fragment => fragment.name === "Stack");
  const bad = [{ kinds: ["about"] }, { in: { about: 1 } }, { in: { stack: 6 } }, { in: { stack: 2 }, kinds: ["stack"] },
    { in: { stack: 2 }, count: "words" }, { in: { stack: 2 }, leadsFor: ["visitor"] }];
  for (const plan of bad) assert.ok(oakBlockProblems({ ...structuredClone(stack), plan }).some(problem => problem.includes("plan")), JSON.stringify(plan));
});

test("registry: blocks.generated.ts is what the fragments generate", () => {
  assert.equal(readFileSync(generated, "utf8"), oakBlocksSource(fragments), "run npm run openui:prompt");
});

test("registry: each declared view file exists beside the contracts", () => {
  const views = fragments.filter(fragment => fragment.view).map(fragment => fragment.view);
  assert.ok(views.length >= 2, "Stats and Compare declare their views");
  for (const view of views) assert.ok(existsSync(`packages/oak-agent-contracts/src/openui/${view}`), view);
});
