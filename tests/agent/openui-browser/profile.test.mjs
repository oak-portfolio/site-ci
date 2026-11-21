import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { openState } from "../premium/gallery.mjs";

// Ticket 28 (gallery on OAK_GALLERY_URL): brief and full fit 1280 and 390, the portrait loads, streaming holds a ghost, off is the Points list, reduced motion holds still.
const sideways = page => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

for (const width of [1280, 390]) {
  test(`gallery: brief and full fit ${width} and the portrait is the one image`, async () => {
    const browser = await chromium.launch();
    try {
      const page = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage();
      for (const id of ["profile-brief", "profile-full"]) {
        await openState(page, id, { settle: 300 });
        assert.equal(await sideways(page), false, `${id}: no sideways scroll at ${width}`);
        assert.equal(await page.locator(".oak-profile").count(), 1);
        const art = page.locator(".oak-profile__art img");
        assert.equal(await art.count(), 1, `${id}: one portrait`);
        assert.ok(await art.evaluate(img => img.complete && img.naturalWidth > 0), `${id}: the portrait loaded`);
      }
      assert.equal(await page.locator(".oak-profile .oak-openui-chip").count() > 0, true, "full lists what Steve knows about");
      await openState(page, "profile-brief", { settle: 300 });
      assert.equal(await page.locator(".oak-profile .oak-openui-chip").count(), 0, "brief leaves the chips out");
      assert.equal(await page.locator(".oak-profile__fact").count(), 4);
    } finally { await browser.close(); }
  });
}

test("gallery: streaming draws the ghost, constant off draws the Points list, reduced motion holds the ghost still", async () => {
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" })).newPage();
    await openState(page, "profile-streaming", { settle: 200 });
    assert.ok(await page.locator(".oak-profile[data-pending]").count() > 0, "a streaming Profile draws its ghost");
    assert.equal(await page.locator(".oak-profile__art img").count(), 0, "the ghost carries no portrait yet");
    assert.equal(await sideways(page), false);
    await openState(page, "profile-off", { settle: 200 });
    assert.equal(await page.locator(".oak-profile").count(), 0, "constant off draws no profile card");
    assert.ok(await page.locator(".oak-openui__points").count() > 0);
  } finally { await browser.close(); }
});
