import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { openState } from "../premium/gallery.mjs";

// Ticket 32 (gallery on OAK_GALLERY_URL): StackMap tiles, their disclosure, venn in forced colors, and every state at 390.
const sideways = page => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
const STATES = ["stack-map-tools-4", "stack-map-tools-12", "stack-map-disclosure", "stack-map-venn", "stack-map-streaming", "stack-map-off"];

test("gallery: tools draws one tile per named tool, 4 and 12, and the off state draws the plain chips", async () => {
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    for (const [id, tiles] of [["stack-map-tools-4", 4], ["stack-map-tools-12", 12]]) {
      await openState(page, id, { settle: 300 });
      assert.equal(await page.locator(".oak-stack-map__tool").count(), tiles, id);
      assert.equal(await page.locator(".oak-stack-map__tool .oak-stack-map__name").first().innerText(), "TypeScript", `${id}: the shared tool leads`);
    }
    await openState(page, "stack-map-off", { settle: 300 });
    assert.equal(await page.locator(".oak-stack-map").count(), 0);
    assert.ok(await page.locator(".oak-openui-stack .oak-openui-chip").count() >= 2, "constant off draws the plain chips");
  } finally { await browser.close(); }
});

test("gallery: a tile's disclosure opens in place, keeps focus, names and links its pages, and a closed panel is out of the tab order", async () => {
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await openState(page, "stack-map-tools-4", { settle: 300 });
    const trigger = page.locator(".oak-stack-map__trigger").first();
    assert.equal(await trigger.getAttribute("aria-expanded"), "false");
    assert.equal(await page.locator(".oak-stack-map__panel a:visible").count(), 0, "a closed panel shows no links");
    const [tileH, triggerH] = await page.evaluate(() => [".oak-stack-map__tool", ".oak-stack-map__trigger"]
      .map(s => Math.round(document.querySelector(s).getBoundingClientRect().height)));
    assert.equal(tileH, triggerH, "a closed tile is its trigger's height, padded evenly");
    await trigger.focus();
    await page.keyboard.press("Enter");
    assert.equal(await trigger.getAttribute("aria-expanded"), "true");
    const pages = await page.locator(".oak-stack-map__tool").first().locator(".oak-stack-map__panel a").allInnerTexts();
    assert.equal(pages.length, 2);
    assert.equal(pages[0], "EcoSmartLoop");
    assert.match(pages[1], /LinkedIn/i);
    assert.equal(await page.evaluate(() => document.activeElement?.classList.contains("oak-stack-map__trigger")), true, "focus stays on the tile");
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), "EcoSmartLoop", "the open panel's first link is next in the tab order");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement?.closest(".oak-stack-map__panel") === null), true, "a closed panel's links are skipped");
  } finally { await browser.close(); }
});

test("gallery: venn keeps its zones in forced colors, each bordered and named in words", async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, forcedColors: "active" });
    const page = await context.newPage();
    await openState(page, "stack-map-venn", { settle: 300 });
    const zones = await page.locator(".oak-stack-map__zone").evaluateAll(nodes => nodes.map(node => ({
      border: parseFloat(getComputedStyle(node).borderTopWidth), title: node.querySelector(".oak-stack-map__zone-title")?.textContent })));
    assert.equal(zones.length, 3);
    assert.equal(zones[0].title, "Only Oakminder");
    assert.equal(zones[1].title, "Both");
    assert.match(zones[2].title, /^Only LinkedIn/i);
    for (const zone of zones) assert.ok(zone.border >= 1, `${zone.title}: a border, not a fill alone`);
  } finally { await browser.close(); }
});

test("gallery: every StackMap state fits 390 with no sideways scroll, and reduced motion stills the chevron", async () => {
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" })).newPage();
    for (const id of STATES) {
      await openState(page, id, { settle: 200 });
      assert.equal(await sideways(page), false, `${id}: no sideways scroll at 390`);
    }
    await openState(page, "stack-map-tools-4", { settle: 200 });
    assert.ok(parseFloat(await page.locator(".oak-stack-map__chevron").first().evaluate(node => getComputedStyle(node).transitionDuration)) < 0.01, "no chevron turn");
  } finally { await browser.close(); }
});

// DoD 28: the streaming ghost reserves the settled tiles and claim lines, within 25% of tools-4 at 1280 and 390.
test("gallery: the streaming ghost is within 25% of the settled tools-4 height at 1280 and 390", async () => {
  const browser = await chromium.launch();
  try {
    for (const width of [1280, 390]) {
      const page = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage();
      const height = async id => { await openState(page, id, { settle: 300 }); return (await page.locator(".oak-stack-map").first().boundingBox()).height; };
      const ghost = await height("stack-map-streaming"), settled = await height("stack-map-tools-4");
      assert.ok(Math.abs(ghost - settled) / settled <= 0.25, `${width}: ghost ${ghost} against settled ${settled}`);
    }
  } finally { await browser.close(); }
});
