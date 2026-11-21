import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { openState } from "../premium/gallery.mjs";
import { assertEquivalent, assertListSwitch, assertNoMotion, assertNoSidewaysScroll, assertNotColorAlone } from "./figure-helpers.mjs";

// Ticket 40 (gallery on OAK_GALLERY_URL): every mode passes the figure helper at 1280 and 390, sankey ribbons meet their bars.
const MODES = ["evidence-proof", "evidence-donut", "evidence-sankey", "evidence-sankey-1"];
const STATES = [...MODES, "evidence-streaming", "evidence-off"];
const FIGURE = ".oak-evidence figure.oak-figure";
const open = async (browser, id, options = {}) => {
  const page = await (await browser.newContext({ viewport: { width: options.width ?? 1280, height: 900 }, forcedColors: options.forcedColors ? "active" : "none",
    reducedMotion: options.reducedMotion ? "reduce" : "no-preference" })).newPage();
  await openState(page, id, { settle: 300 });
  return page;
};

test("gallery: each mode has a named figure whose list holds every drawn label and value, and nothing scrolls sideways at 1280 or 390", async () => {
  const browser = await chromium.launch();
  try {
    for (const width of [1280, 390]) for (const id of STATES) {
      const page = await open(browser, id, { width });
      if (MODES.includes(id)) await assertEquivalent(page, FIGURE);
      await assertNoSidewaysScroll(page, ".oak-openui");
      await page.context().close();
    }
  } finally { await browser.close(); }
});

test("gallery: Show as list swaps the drawing for its list; off and loading draw no figure", async () => {
  const browser = await chromium.launch();
  try {
    for (const id of MODES) { const page = await open(browser, id); await assertListSwitch(page, FIGURE); await page.context().close(); }
    for (const id of ["evidence-off", "evidence-streaming"]) {
      const page = await open(browser, id);
      assert.equal(await page.locator(FIGURE).count(), 0, `${id}: no figure`);
      await page.context().close();
    }
  } finally { await browser.close(); }
});

test("gallery: forced colors keep published and held apart without color; reduced motion stills everything", async () => {
  const browser = await chromium.launch();
  try {
    for (const [id, marks] of [["evidence-proof", ".oak-figure__mark[data-series]"], ["evidence-donut", ".oak-evidence__ring path"], ["evidence-sankey", ".oak-evidence__ribbons path"]]) {
      const page = await open(browser, id, { forcedColors: true });
      await assertNotColorAlone(page, marks, marks.includes("series") ? "data-series" : "data-status");
      await page.context().close();
    }
    for (const id of MODES) { const page = await open(browser, id, { reducedMotion: true }); await assertNoMotion(page, ".oak-evidence"); await page.context().close(); }
  } finally { await browser.close(); }
});

test("gallery: sankey ribbons start on the record bars and end on the status bars, at 1280 and 390", async () => {
  const browser = await chromium.launch();
  try {
    for (const width of [1280, 390]) for (const id of ["evidence-sankey", "evidence-sankey-1"]) {
      const page = await open(browser, id, { width });
      const gap = await page.locator(".oak-evidence__sankey").first().evaluate(root => {
        const box = node => node.getBoundingClientRect();
        const svg = box(root.querySelector(".oak-evidence__ribbons"));
        const source = box(root.querySelector(".oak-evidence__node")), target = box(root.querySelector(".oak-evidence__target"));
        return { left: Math.abs(svg.left - source.right), right: Math.abs(target.left - svg.right), tall: Math.abs(svg.height - root.querySelector(".oak-evidence__targets").getBoundingClientRect().height) };
      });
      assert.ok(gap.left <= 0.5 && gap.right <= 0.5 && gap.tall <= 0.5, `${id} at ${width}: ribbons meet the bars ${JSON.stringify(gap)}`);
      await page.context().close();
    }
  } finally { await browser.close(); }
});

test("gallery: at 390 the donut sits centered in its frame; at 1280 the legend stays beside it", async () => {
  const browser = await chromium.launch();
  try {
    for (const width of [390, 1280]) {
      const page = await open(browser, "evidence-donut", { width });
      const box = await page.locator(".oak-evidence__donut").first().evaluate(root => {
        const frame = root.getBoundingClientRect(), ring = root.querySelector(".oak-evidence__ring").getBoundingClientRect();
        const legend = root.querySelector(".oak-evidence__legend").getBoundingClientRect();
        return { left: ring.left - frame.left, right: frame.right - ring.right, beside: legend.left >= ring.right };
      });
      if (width === 390) assert.ok(Math.abs(box.left - box.right) <= 2, `390: donut gaps differ ${JSON.stringify(box)}`);
      else assert.ok(box.beside, `1280: legend beside the donut ${JSON.stringify(box)}`);
      await page.context().close();
    }
  } finally { await browser.close(); }
});
