import assert from "node:assert/strict";
import { test } from "node:test";
import { OAK_STATS_SLACK_LIMIT, oakStatsSlacks } from "../../src/lib/oakStatsSlack.ts";

// Retro arch 4: oakStatsSlacks is shipped into Playwright's page.evaluate as source text, so it may not lean on anything
// outside its own body. These tests rebuild it from its source alone, with only DOM globals around it.
const rebuilt = () => new Function(`return (${oakStatsSlacks})`)();

const stubDom = (textNodes, lines) => {
  const saved = Object.fromEntries(["document", "getComputedStyle", "NodeFilter"].map(key => [key, globalThis[key]]));
  const tile = { textContent: "  A tile  ", getBoundingClientRect: () => ({ top: 0, bottom: 200, height: 200 }), querySelectorAll: () => [] };
  const queue = [...textNodes];
  Object.assign(globalThis, {
    NodeFilter: { SHOW_TEXT: 4 },
    getComputedStyle: () => ({ visibility: "visible", paddingTop: "0px", paddingBottom: "0px" }),
    document: { createTreeWalker: () => ({ nextNode: () => queue.shift() ?? null }),
      createRange: () => ({ selectNodeContents() {}, getClientRects: () => lines }) },
  });
  const root = { querySelectorAll: () => [tile] };
  return { root, restore: () => Object.assign(globalThis, saved) };
};

test("the limit is the renderer's 56px", () => assert.equal(OAK_STATS_SLACK_LIMIT, 56));

test("oakStatsSlacks builds from its own source and needs nothing outside its body", () => {
  const fn = rebuilt();
  assert.equal(typeof fn, "function");
  const { root, restore } = stubDom([{ textContent: "claim", parentElement: { closest: () => null } }], [{ top: 10, bottom: 30, height: 20, width: 100 }]);
  try {
    // Empty run: 10px above the line, 170px under it. A reference to a module constant or helper would throw here.
    assert.deepEqual(fn(root), [{ label: "A tile", run: 170 }]);
  } finally { restore(); }
});

test("a text node without a parent element is skipped, not thrown on (the renderer's guard)", () => {
  const { root, restore } = stubDom([{ textContent: "orphan", parentElement: null }], [{ top: 10, bottom: 30, height: 20, width: 100 }]);
  try { assert.deepEqual(rebuilt()(root), []); } finally { restore(); }
});
