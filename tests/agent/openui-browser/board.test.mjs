import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { openState } from "../premium/gallery.mjs";

// Ticket 34 (gallery on OAK_GALLERY_URL): columns sit side by side at 1280 and stack at 390, cards keep Oak's room, the ghost holds the height.
const STATES = ["board-stand-2", "board-stand-5", "board-sboard-2", "board-sboard-5", "board-streaming", "board-off"];
const sideways = page => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
const columnLefts = page => page.locator(".oak-board:not([data-pending]) .oak-board__column").evaluateAll(nodes => nodes.map(node => Math.round(node.getBoundingClientRect().left)));

test("gallery: at 1280 columns sit side by side as equal tracks; at 390 they stack; no state scrolls sideways", async () => {
  const browser = await chromium.launch();
  try {
    const wide = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await openState(wide, "board-stand-5", { settle: 300 });
    const lefts = await columnLefts(wide);
    assert.equal(lefts.length, 2);
    assert.notEqual(lefts[0], lefts[1], "side by side at 1280");
    const widths = await wide.locator(".oak-board__column").evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().width));
    assert.ok(Math.abs(widths[0] - widths[1]) <= 1, `equal tracks: ${widths}`);
    const narrow = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    for (const id of STATES) {
      await openState(narrow, id, { settle: 200 });
      assert.equal(await sideways(narrow), false, `${id}: no sideways scroll at 390`);
    }
    await openState(narrow, "board-sboard-5", { settle: 200 });
    const stacked = await columnLefts(narrow);
    assert.ok(stacked.length >= 2 && new Set(stacked).size === 1, `columns stack at 390: ${stacked}`);
  } finally { await browser.close(); }
});

test("gallery: each column is a labeled list with a count, cards pad 32 with 16 between, one newest card, no team column", async () => {
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await openState(page, "board-stand-5", { settle: 300 });
    const columns = page.locator(".oak-board section.oak-board__column");
    for (const column of await columns.all()) {
      const label = await column.getAttribute("aria-label");
      assert.match(label, /^(Full case study|In progress), \d+$/);
      assert.equal(Number(label.split(", ")[1]), await column.locator("li.oak-board__card").count(), "the count matches the cards");
    }
    assert.doesNotMatch(await page.locator(".oak-board").first().innerText(), /\bteam\b/i);
    const card = page.locator(".oak-board__card").first();
    assert.equal(await card.evaluate(node => getComputedStyle(node).paddingTop), "32px");
    assert.equal(await card.evaluate(node => getComputedStyle(node).paddingLeft), "32px");
    assert.equal(await page.locator(".oak-board__list").first().evaluate(node => getComputedStyle(node).rowGap), "16px");
    assert.equal(await page.locator(".oak-board__card[data-newest]").count(), 1);
    const [red, , blue] = (await page.locator(".oak-board__head").first().evaluate(node => getComputedStyle(node).color)).match(/\d+/g).map(Number);
    assert.ok(Math.abs(red - blue) < 16, "the column header is neutral");
  } finally { await browser.close(); }
});

test("gallery: constant off draws the Points list, streaming draws the ghost, reduced motion stills the shimmer", async () => {
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" })).newPage();
    await openState(page, "board-off", { settle: 200 });
    assert.equal(await page.locator(".oak-board").count(), 0);
    assert.ok(await page.locator(".oak-openui__points").count() > 0);
    await openState(page, "board-streaming", { settle: 200 });
    assert.ok(await page.locator(".oak-board[data-pending]").count() > 0, "a streaming Board draws its ghost");
    assert.equal(await page.locator(".oak-board[data-pending] .oak-openui-card__bar").first().evaluate(node => getComputedStyle(node).animationName), "none");
  } finally { await browser.close(); }
});

test("gallery: the streaming ghost is within 25% of the settled stand-5 height at 1280 and 390", async () => {
  const browser = await chromium.launch();
  try {
    for (const width of [1280, 390]) {
      const page = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage();
      const height = async id => { await openState(page, id, { settle: 300 }); return (await page.locator(".oak-board").first().boundingBox()).height; };
      const ghost = await height("board-streaming"), settled = await height("board-stand-5");
      assert.ok(Math.abs(ghost - settled) / settled <= 0.25, `${width}: ghost ${ghost} against settled ${settled}`);
    }
  } finally { await browser.close(); }
});
