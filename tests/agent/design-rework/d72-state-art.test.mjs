import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const open = async (page, state) => {
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
  await page.waitForTimeout(400);
};

test("D72-G1 the saved panel's one picture follows its list, and stopped and sign-in cards lead with a tinted art tile", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    for (const [state, pose] of [["saved-empty", "empty-chest"], ["saved-loading", "hourglass"], ["saved-list", "saved"]]) {
      await open(page, state);
      const art = await page.evaluate(() => ({ hero: document.querySelector(".oak-panel-hero [data-pose]")?.dataset.pose,
        inList: document.querySelectorAll(".oak-saved__panel [data-pose]").length }));
      assert.equal(art.hero, pose, `${state}: the panel picture is ${pose}`);
      assert.equal(art.inList, 0, `${state}: one picture per panel, none repeated in the list`);
    }
    await open(page, "saved-empty");
    // Q12 (intentional update): the empty list says what saving does and offers Save.
    assert.match(await page.locator(".oak-saved__none").innerText(), /^No saved conversations yet\n+Saving keeps a conversation for 30 days, so you can reopen it here on any device you sign in on\.\n+Save this conversation$/);

    const tiles = {};
    // D116 re-tick: the sign-in card's art moved onto the panels' halo (covered by D116-G6); stopped cards keep their tile.
    // Review v4 supersedes D72's 56px floor for retry-only stopped cards: they are one compact row with a 44px tile.
    const compactRow = new Set(["failed", "connection-lost"]);
    for (const state of ["failed", "budget-paused", "connection-lost", "contact-handoff"]) {
      await open(page, state);
      const tile = await page.locator(".oak-turn__stopped .oak-art-tile").last().evaluate(node => {
        const box = node.getBoundingClientRect();
        return { width: Math.round(box.width), height: Math.round(box.height), art: !!node.querySelector("img"), background: getComputedStyle(node).backgroundColor };
      });
      if (compactRow.has(state)) assert.ok(tile.width === 44 && tile.height === 44, `${state}: a square 44px tile in the compact row (${tile.width}x${tile.height})`);
      else assert.ok(tile.width >= 56 && tile.width === tile.height, `${state}: a square tile of 56px or more (${tile.width}x${tile.height})`);
      assert.ok(tile.art, `${state}: the tile holds the state's art`);
      tiles[state] = tile.background;
    }
    // Q03 (intentional update): only a real limit tints its tile gold; a dropped connection shares the neutral tile (brief O4, O5).
    assert.notEqual(tiles["budget-paused"], tiles.failed, "a limit card's tile is tinted gold");
    assert.equal(tiles["connection-lost"], tiles.failed, "a connection card's tile is the neutral one");
    assert.notEqual(tiles["contact-handoff"], tiles.failed, "a handoff card's tile is tinted violet");

    // The ticket's sizes exactly for full stopped cards: 64px in a standard window, 48px in a compact one.
    await open(page, "budget-paused");
    const size = () => page.locator(".oak-turn__stopped .oak-art-tile").last().evaluate(node => Math.round(node.getBoundingClientRect().width));
    assert.equal(await size(), 64, "standard window: a 64px tile");
    await page.evaluate(() => { document.querySelector(".oak-workspace").dataset.compact = "true"; });
    assert.equal(await size(), 48, "compact window: the tile shrinks to 48px");
    // A retry-only row keeps its 44px tile in either window.
    await open(page, "failed");
    assert.equal(await size(), 44, "standard window: the compact row's 44px tile");
    await page.evaluate(() => { document.querySelector(".oak-workspace").dataset.compact = "true"; });
    assert.equal(await size(), 44, "compact window: the compact row keeps 44px");
  } finally {
    await browser.close();
  }
});
