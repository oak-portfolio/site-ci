import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { openState } from "../premium/gallery.mjs";

// Ticket 33 (gallery on OAK_GALLERY_URL): columns never squeeze, 390 stacks rows into cards, off and streaming keep their shape.
const SETTLED = ["table-matrix-2", "table-matrix-4", "table-sctable", "table-smap"];
const sideways = page => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
// A cell whose content is wider than the cell is a squeezed column (a word that cannot fit).
const squeezed = page => page.evaluate(() => [...document.querySelectorAll(".oak-table__grid th, .oak-table__grid td")]
  .filter(cell => cell.scrollWidth > cell.clientWidth + 1).map(cell => cell.textContent.slice(0, 40)));

test("gallery 1280: a captioned table, every column at least as wide as its longest word, one row per record", async () => {
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    for (const id of SETTLED) {
      await openState(page, id, { settle: 300 });
      assert.equal(await page.locator(".oak-table__grid caption").count(), 1, `${id}: one caption`);
      assert.ok(await page.locator(".oak-table__grid thead th[scope='col']").count() >= 2, `${id}: scope=col heads`);
      assert.deepEqual(await squeezed(page), [], `${id}: no squeezed cell`);
      assert.equal(await sideways(page), false, `${id}: no sideways scroll`);
    }
    await openState(page, "table-matrix-4", { settle: 300 });
    const heights = await page.locator(".oak-table__grid tbody tr").evaluateAll(rows => rows.map(row => row.getBoundingClientRect().height));
    assert.equal(heights.length, 4);
  } finally { await browser.close(); }
});

test("gallery 390: every row is a stacked card with labelled cells, nothing squeezed or sideways", async () => {
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    for (const id of SETTLED) {
      await openState(page, id, { settle: 300 });
      assert.equal(await sideways(page), false, `${id}: no sideways scroll at 390`);
      assert.deepEqual(await squeezed(page), [], `${id}: no squeezed cell at 390`);
      const shape = await page.locator(".oak-table__grid tbody tr").first().evaluate(row => ({ display: getComputedStyle(row).display, label: getComputedStyle(row.querySelector("td"), "::before").content }));
      assert.equal(shape.display, "grid", `${id}: the row is a card grid`);
      assert.notEqual(shape.label, "none", `${id}: each cell shows its column label`);
      assert.equal(await page.locator(".oak-table__grid thead").evaluate(head => head.getBoundingClientRect().height <= 1), true, `${id}: the head row is visually hidden, kept for readers`);
      const lonely = await page.locator(".oak-table__grid tbody td").evaluateAll(cells => cells.filter(cell => {
        const box = cell.getBoundingClientRect(), row = cell.closest("tr").getBoundingClientRect();
        return box.width / row.width < 0.9 && ![...cell.parentElement.children].some(peer => peer !== cell && Math.abs(peer.getBoundingClientRect().top - box.top) < 1);
      }).map(cell => cell.dataset.label));
      assert.deepEqual(lonely, [], `${id}: a half-width cell always has a partner beside it`);
    }
    await openState(page, "table-matrix-2", { settle: 300 });
    const spans = await page.locator(".oak-table__grid td[data-wide]").evaluateAll(cells => cells.map(cell => cell.getBoundingClientRect().width / cell.closest("tr").getBoundingClientRect().width));
    assert.ok(spans.length > 0 && spans.every(share => share > 0.9), "a long value spans the whole card, never a half-width strip");
  } finally { await browser.close(); }
});

test("gallery: constant off draws Points, streaming draws the ghost within 25% of the settled height, reduced motion stills it", async () => {
  const browser = await chromium.launch();
  try {
    for (const width of [1280, 390]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
      const page = await context.newPage();
      await openState(page, "table-off", { settle: 200 });
      assert.equal(await page.locator(".oak-table").count(), 0, "constant off draws no table");
      assert.ok(await page.locator(".oak-openui__points").count() > 0);
      const height = async id => { await openState(page, id, { settle: 300 }); return (await page.locator(".oak-table").first().boundingBox()).height; };
      const ghost = await height("table-streaming");
      assert.ok(await page.locator(".oak-table[data-pending]").count() > 0, "a streaming Table draws its ghost");
      const animation = await page.locator(".oak-table[data-pending] .oak-openui-card__bar").first().evaluate(node => getComputedStyle(node).animationName);
      assert.equal(animation, "none", `${width}: reduced motion stops the shimmer`);
      const settled = await height("table-matrix-2");
      assert.ok(Math.abs(ghost - settled) / settled <= 0.25, `${width}: ghost ${ghost} against settled ${settled}`);
      await context.close();
    }
  } finally { await browser.close(); }
});
