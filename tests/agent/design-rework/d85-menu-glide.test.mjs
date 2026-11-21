import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const read = page => page.evaluate(() => {
  const glide = document.querySelector(".ui-menu__popup > .ui-menu__glide"), lit = document.querySelector(".ui-menu__popup .ui-menu__item[data-highlighted]");
  const g = glide.getBoundingClientRect(), l = lit?.getBoundingClientRect();
  return { top: Math.round(g.top), height: Math.round(g.height), opacity: Number(getComputedStyle(glide).opacity),
    lit: l ? { top: Math.round(l.top), height: Math.round(l.height), fill: getComputedStyle(lit).backgroundColor } : null };
});

test("D85-G1 the tools menu's highlight glides between rows under the pointer and the arrow keys, and lands on the lit row", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${galleryUrl}/__dev/oak-states?state=tools-menu`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
    await page.waitForTimeout(400);
    const items = page.locator(".ui-menu__popup .ui-menu__item");
    // R11 (intentional update): Tools is three message modes now, so the far row is the third.
    assert.ok(await items.count() >= 3, "the tools menu has its rows");
    const far = (await items.count()) - 1;
    // Reopened by pointer, nothing is lit: the first row the pointer lights gets the glide at once, without sliding in from the top.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    await page.locator("[data-oak-tools-trigger]").click();
    await page.waitForTimeout(300);
    await page.locator(".ui-menu__popup .ui-menu__item").nth(far).hover();
    await page.waitForTimeout(30);
    const appear = await read(page);
    assert.ok(appear.lit && Math.abs(appear.top - appear.lit.top) <= 1, `the first highlight appears in place (${appear.top}/${appear.lit?.top})`);
    await items.nth(0).hover();
    await page.waitForTimeout(300);
    const first = await read(page);
    assert.ok(first.lit && first.opacity > 0.95, "a lit row shows the glide");
    assert.ok(Math.abs(first.top - first.lit.top) <= 1 && Math.abs(first.height - first.lit.height) <= 1, `the glide sits on the lit row (${first.top}/${first.lit.top})`);
    assert.equal(first.lit.fill, "rgba(0, 0, 0, 0)", "the row itself stays clear; the glide is the highlight");

    await items.nth(far).hover();
    const path = [];
    for (let tick = 0; tick < 10; tick++) { path.push((await read(page)).top); await page.waitForTimeout(25); }
    const target = (await read(page)).lit.top;
    assert.ok(path.some(top => top > first.top + 4 && top < target - 4), `the glide travels through the rows between (${path} to ${target})`);
    await page.waitForTimeout(300);
    const landed = await read(page);
    assert.ok(Math.abs(landed.top - landed.lit.top) <= 1, "and lands on the new row");

    // R11 (intentional update): the hovered row is now the last one, so the key step goes up a row.
    await page.keyboard.press("ArrowUp");
    await page.waitForTimeout(320);
    const keyed = await read(page);
    assert.ok(keyed.lit.top < landed.lit.top && Math.abs(keyed.top - keyed.lit.top) <= 1, "the arrow keys move it too");
    const still = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    await still.goto(`${galleryUrl}/__dev/oak-states?state=tools-menu`, { waitUntil: "domcontentloaded" });
    await still.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
    assert.equal(await still.locator(".ui-menu__glide").evaluate(node => getComputedStyle(node).transitionProperty === "none" || getComputedStyle(node).transitionDuration.split(",").every(value => parseFloat(value) < 0.001)), true,
      "reduced motion: the glide moves without a slide");
  } finally {
    await browser.close();
  }
});
