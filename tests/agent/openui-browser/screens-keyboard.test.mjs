import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { openState } from "../premium/gallery.mjs";

// Ticket 156 (gallery on OAK_GALLERY_URL): Next screen pressed to the last screen keeps focus on the arrow, in the strip
// and the viewer at 1280 and 390, and the viewer figure has a name even with its caption hidden.
const focused = page => page.evaluate(() => ({ name: document.activeElement?.getAttribute("aria-label"), disabled: document.activeElement?.getAttribute("aria-disabled") }));

for (const width of [1280, 390]) {
  test(`gallery ${width}: Next screen pressed past the last screen keeps focus on the arrow, strip and viewer`, async () => {
    const browser = await chromium.launch();
    try {
      const page = await (await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" })).newPage();
      for (const [id, scope] of [["screens-three", ".oak-screens__controls"], ["screens-viewer", ".oak-screens-viewer"]]) {
        await openState(page, id, { settle: 400 });
        await page.locator(`${scope} [aria-label="Next screen"]`).focus();
        for (let press = 0; press < 4; press++) { await page.keyboard.press("Enter"); await page.waitForTimeout(150); }
        assert.deepEqual(await focused(page), { name: "Next screen", disabled: "true" }, `${id}: focus stays on the arrow at the end`);
        await page.keyboard.press("Enter");
        assert.equal((await focused(page)).name, "Next screen", `${id}: a press at the end keeps focus`);
      }
    } finally { await browser.close(); }
  });
}

test("gallery: the viewer figure is named by its screen with or without the caption", async () => {
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    for (const id of ["screens-viewer", "screens-viewer-no-caption"]) {
      await openState(page, id, { settle: 300 });
      const viewer = page.locator(".oak-screens-viewer");
      const label = await viewer.getAttribute("aria-label");
      assert.ok(label, `${id}: the viewer has a screen label`);
      assert.equal(await viewer.getByRole("figure", { name: label, exact: true }).count(), 1, `${id}: the figure is named ${label}`);
    }
  } finally { await browser.close(); }
});
