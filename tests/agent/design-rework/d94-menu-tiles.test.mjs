import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");

test("D94-G1 every tools menu row leads with a tinted tile, the tints differ by meaning, and the glide still sits on the lit row", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${galleryUrl}/__dev/oak-states?state=tools-menu`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
    await page.waitForTimeout(400);
    const rows = await page.evaluate(() => [...document.querySelectorAll(".ui-menu__popup .ui-menu__item")].map(row => {
      const tile = row.firstElementChild, box = row.getBoundingClientRect(), lead = tile.getBoundingClientRect();
      return { name: row.textContent.trim(), tile: tile.classList.contains("oak-starter-glyph"), fill: getComputedStyle(tile).backgroundColor, inset: lead.left - box.left };
    }));
    // R11 (intentional update): Tools is three message modes, each with its own tint.
    assert.ok(rows.length >= 3, "the tools menu has its rows");
    for (const row of rows) {
      assert.ok(row.tile, `${row.name} leads with a tile`);
      assert.notEqual(row.fill, "rgba(0, 0, 0, 0)", `${row.name}'s tile is filled`);
      assert.ok(row.inset >= 12, `${row.name} keeps 12px from the row edge (${row.inset})`);
    }
    assert.equal(new Set(rows.map(row => row.fill)).size, rows.length, `every row has its own tint (${[...new Set(rows.map(row => row.fill))].length})`);

    for (const index of [1, rows.length - 1]) {
      await page.locator(".ui-menu__popup .ui-menu__item").nth(index).hover();
      await page.waitForTimeout(350);
      const glide = await page.evaluate(() => {
        const g = document.querySelector(".ui-menu__popup > .ui-menu__glide").getBoundingClientRect(), l = document.querySelector(".ui-menu__popup .ui-menu__item[data-highlighted]").getBoundingClientRect();
        return { top: g.top - l.top, height: g.height - l.height };
      });
      assert.ok(Math.abs(glide.top) <= 1 && Math.abs(glide.height) <= 1, `the glide sits on lit row ${index} within 1px (${glide.top}, ${glide.height})`);
    }
  } finally {
    await browser.close();
  }
});
