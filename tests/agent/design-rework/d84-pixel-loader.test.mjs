import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
// R17 (intentional update, Oak review v14 document-parsing: "change the loading indicator to a circle, or make the wrapper
// a rounded rectangle; I have already asked that before"): in the workspace every wait shows a round ring that shares its
// round wrapper's shape, spinning, and still under reduced motion. The 3x3 pixel cells stay in the markup, unshown.
const loaders = page => page.locator(".oak-workspace .ui-spinner").evaluateAll(list => list.map(node => {
  const box = node.getBoundingClientRect(), style = getComputedStyle(node);
  return { size: [Math.round(box.width), Math.round(box.height)], round: parseFloat(style.borderTopLeftRadius) >= box.width / 2 - 0.5,
    name: style.animationName, cellsShown: [...node.querySelectorAll(".ui-spinner__cell")].filter(cell => getComputedStyle(cell).display !== "none").length };
}));

test("R17 every wait in the workspace shows a round ring loader, still under reduced motion", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    for (const state of ["document-parsing", "voice-transcribing"]) {
      await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
      await page.waitForTimeout(600);
      const found = await loaders(page);
      assert.ok(found.length >= 1, `${state}: a loader shows`);
      for (const loader of found) {
        assert.ok(loader.round, `${state}: the loader is a circle`);
        assert.ok(loader.size.every(side => side >= 14 && side <= 24) && loader.size[0] === loader.size[1], `${state}: a 14 to 24px circle (${loader.size})`);
        assert.equal(loader.name, "oak-ring-spin", `${state}: the ring turns`);
        assert.equal(loader.cellsShown, 0, `${state}: no pixel cells show`);
      }
    }
    const still = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    await still.goto(`${galleryUrl}/__dev/oak-states?state=document-parsing`, { waitUntil: "domcontentloaded" });
    await still.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
    assert.deepEqual([...new Set((await loaders(still)).map(loader => loader.name))], ["none"], "reduced motion holds the ring still");
  } finally {
    await browser.close();
  }
});
