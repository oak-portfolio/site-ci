import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { openState } from "../premium/gallery.mjs";

// Ticket 31 (gallery on OAK_GALLERY_URL): filter and sort announce the count, stay in the block, and every state fits 390.
const STATES = ["project-wall-two", "project-wall-filter", "project-wall-three", "project-wall-five", "project-wall-path", "project-wall-legacy", "project-wall-streaming", "project-wall-off"];
const sideways = page => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
const listen = page => page.evaluate(() => {
  window.__said = [];
  new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => window.__said.push(node.textContent))))
    .observe(document.querySelector("[aria-live='polite']"), { childList: true, subtree: true });
});
const said = async page => { await page.waitForTimeout(150); return page.evaluate(() => window.__said.filter(Boolean)); };

test("gallery: chips filter with AND, each change announces the count, zero offers Clear filters which returns focus, and the URL never changes", async () => {
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await openState(page, "project-wall-filter", { settle: 400 });
    const url = page.url();
    await listen(page);
    const wall = page.locator(".oak-wall").first(), tiles = wall.locator(".oak-wall__tile");
    const group = wall.getByRole("group", { name: "Filter projects" });
    const chip = name => group.getByRole("button", { name, exact: true });
    await chip("Agents").click();
    assert.equal(await tiles.count(), 2);
    assert.equal(await chip("Agents").getAttribute("aria-pressed"), "true");
    await chip("Convex").click();
    assert.equal(await tiles.count(), 1, "filtered to one: Agents and Convex");
    await chip("Mobile").click();
    assert.equal(await tiles.count(), 0, "filtered to zero: Agents and Mobile never meet");
    assert.match(await wall.innerText(), /No projects match Agents, Convex, and Mobile\./);
    const spoken = await said(page);
    assert.deepEqual(spoken, ["2 of 4 projects shown.", "1 of 4 projects shown.", "0 of 4 projects shown."]);
    await wall.getByRole("button", { name: "Clear filters" }).click();
    assert.equal(await tiles.count(), 4);
    assert.equal(await page.evaluate(() => document.activeElement?.closest(".oak-wall__chips") !== null), true, "focus returns to the filter group");
    await wall.getByRole("radio", { name: "Recent" }).click();
    assert.equal(await wall.locator(".oak-wall__title").first().innerText(), "OmniSocial", "Recent puts the newest first (May 2026)");
    assert.equal((await said(page)).at(-1), "4 of 4 projects shown.");
    assert.equal(page.url(), url, "filter and sort state never leaves the block");
  } finally { await browser.close(); }
});

test("gallery: tiles in a row share a height, covers keep their ratio, and each tile has its own tint", async () => {
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await openState(page, "project-wall-five", { settle: 600 });
    const tiles = await page.locator(".oak-wall__tile").evaluateAll(nodes => nodes.map(node => {
      const box = node.getBoundingClientRect(), cover = node.querySelector(".oak-wall__cover"), img = cover.querySelector("img");
      const frame = cover.getBoundingClientRect();
      return { top: Math.round(box.top), height: Math.round(box.height), frame: frame.width / frame.height, ratio: Number(getComputedStyle(cover).getPropertyValue("--oak-art-ratio")),
        fit: img ? getComputedStyle(img).objectFit : "", tint: node.style.getPropertyValue("--oak-wall-tint") };
    }));
    assert.equal(tiles.length, 5);
    const rows = Object.groupBy(tiles, tile => tile.top);
    for (const row of Object.values(rows)) assert.equal(new Set(row.map(tile => tile.height)).size, 1, "one height per row");
    for (const tile of tiles) {
      assert.ok(Math.abs(tile.frame - tile.ratio) < 0.02, `cover frame ${tile.frame} keeps ratio ${tile.ratio}`);
      assert.equal(tile.fit, "contain", "the cover is never cropped");
      assert.match(tile.tint, /^#[0-9a-f]{6}$/i);
    }
    assert.equal(new Set(tiles.map(tile => tile.tint)).size, 5, "one accent per tile");
  } finally { await browser.close(); }
});

test("gallery: every state fits 390; off is the Project list; streaming draws ghosts within 25% of the settled height", async () => {
  const browser = await chromium.launch();
  try {
    for (const width of [1280, 390]) {
      const page = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage();
      for (const id of STATES) {
        await openState(page, id, { settle: 300 });
        assert.equal(await sideways(page), false, `${id}: no sideways scroll at ${width}`);
      }
      await openState(page, "project-wall-off", { settle: 300 });
      assert.equal(await page.locator(".oak-wall").count(), 0);
      assert.ok(await page.locator(".oak-openui-project").count() > 0, "constant off draws the existing Project list");
      const height = async id => { await openState(page, id, { settle: 400 }); return (await page.locator(".oak-wall").first().boundingBox()).height; };
      const ghost = await height("project-wall-streaming"), settled = await height("project-wall-three");
      assert.ok(await page.locator(".oak-wall").count() > 0);
      assert.ok(Math.abs(ghost - settled) / settled <= 0.25, `${width}: ghost ${ghost} against settled ${settled}`);
    }
  } finally { await browser.close(); }
});

test("gallery: forced colors draw real tile borders, and a pressed chip is told apart without color", async () => {
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, forcedColors: "active" })).newPage();
    await openState(page, "project-wall-three", { settle: 400 });
    assert.notEqual(await page.locator(".oak-wall__tile").first().evaluate(node => getComputedStyle(node).borderTopStyle), "none");
    const chip = page.locator(".oak-wall__chip").first();
    const before = await chip.evaluate(node => getComputedStyle(node).borderTopWidth);
    await chip.click();
    assert.equal(await chip.getAttribute("aria-pressed"), "true", "pressed state is in the accessibility tree");
    assert.notEqual(await chip.evaluate(node => getComputedStyle(node).borderTopWidth), before, "pressed is a thicker border, not only a color");
  } finally { await browser.close(); }
});
