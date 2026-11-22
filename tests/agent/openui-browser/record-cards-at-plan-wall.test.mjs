import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { openState } from "../premium/gallery.mjs";

// Ticket 221: with record cards at plan forced on (the gallery state's flag), an overview plan's ProjectWall draws the wall's
// own tiles, and the arranged wall lands on the same grid: same columns, same covers, each tile within a quarter of its height.
const read = (page, selector) => page.evaluate((selector) => {
  const grid = [...document.querySelectorAll(selector)].at(-1);
  const tiles = grid ? [...grid.querySelectorAll(":scope > .oak-wall__tile")] : [];
  const box = el => el.getBoundingClientRect();
  return { tiles: tiles.map(tile => ({ left: box(tile).left - box(grid).left, width: box(tile).width, height: box(tile).height,
    cover: box(tile.querySelector(".oak-wall__cover")).height, title: tile.querySelector(".oak-wall__title")?.textContent.trim() })),
    sideways: document.documentElement.scrollWidth > window.innerWidth };
}, selector);

test("ticket 221: the plan-time wall tiles hold the landed wall's grid at 1280 and 390, with no sideways scroll", async () => {
  const browser = await chromium.launch();
  try {
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await openState(page, "record-cards-at-plan-wall", { settle: 300 });
      const plan = await read(page, '[data-plan-cards="ProjectWall"] .oak-wall__grid');
      assert.equal(await page.locator('[data-ghost="ProjectWall"]').count(), 0, `${width}: the wall ghost gave way to its tiles`);
      await openState(page, "record-cards-at-plan-wall-landed", { settle: 300 });
      const landed = await read(page, ".oak-openui-answer .oak-wall__grid");
      await page.close();
      assert.equal(plan.tiles.length, 3, `${width}: three plan-time tiles`);
      assert.deepEqual(plan.tiles.map(tile => tile.title), landed.tiles.map(tile => tile.title), `${width}: same tiles, same order`);
      plan.tiles.forEach((tile, index) => {
        const after = landed.tiles[index];
        assert.ok(Math.abs(tile.left - after.left) <= 1 && Math.abs(tile.width - after.width) <= 1, `${width}: tile ${index} keeps its column`);
        assert.ok(Math.abs(tile.cover - after.cover) <= 1, `${width}: tile ${index} keeps its cover height`);
        assert.ok(Math.abs(tile.height - after.height) <= after.height / 4, `${width}: tile ${index} ${tile.height} within a quarter of ${after.height}`);
      });
      assert.equal(plan.sideways || landed.sideways, false, `${width}: no sideways scroll`);
    }
  } finally { await browser.close(); }
});
