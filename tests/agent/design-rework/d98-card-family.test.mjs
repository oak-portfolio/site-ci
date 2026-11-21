import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");

// D116 re-tick: the inline account cards hold an Empty (art large on the panels' halo, then title, line and action centred under
// it), so the shared anatomy is now one centre axis rather than an art column beside a text column.
test("D98-G1 the inline account cards share one anatomy: art on the halo above, then title, line and action on one centre axis", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const measure = () => page.evaluate(() => {
      const card = document.querySelector("section.oak-account-intake:not(.oak-workflow)");
      const box = node => node.getBoundingClientRect(), centre = node => Math.round(box(node).left + box(node).width / 2);
      const art = card.querySelector(".oak-panel-hero"), title = card.querySelector("h2");
      const centres = [art, title, card.querySelector(".ui-empty__content > p"), card.querySelector(".oak-account__actions")].map(centre);
      return { centres, artBottom: box(art).bottom, titleTop: box(title).top, face: getComputedStyle(title).fontFamily };
    });
    for (const state of ["sign-in-again"]) {
      await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
      await page.locator("section.oak-account-intake").waitFor();
      const card = await measure();
      assert.ok(Math.max(...card.centres) - Math.min(...card.centres) <= 2, `${state}: art, title, line and action share a centre (${card.centres})`);
      assert.ok(card.titleTop >= card.artBottom - 1, `${state}: the title sits under the art`);
      assert.match(card.face, /^"?Inter/, `${state}: the card title uses the interface face, like a stopped turn's (${card.face})`);
    }
    // Review v4 supersedes D98 for sign-in being off: a compact inline notice, a small icon tile beside one bold title,
    // one line and two actions (Contact Steve, Check sign-in again); no mascot and no Empty.
    await page.goto(`${galleryUrl}/__dev/oak-states?state=sign-in-unavailable`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
    await page.locator("section.oak-account-notice").waitFor();
    const notice = await page.evaluate(() => {
      const card = document.querySelector("section.oak-account-notice"), box = node => node.getBoundingClientRect();
      const tile = card.querySelector(".oak-account-notice__tile"), title = card.querySelector("h2");
      return { title: title.textContent.trim(), face: getComputedStyle(title).fontFamily, tile: Math.round(box(tile).width), tileRight: box(tile).right,
        titleLeft: box(title).left, lines: card.querySelectorAll(".oak-account-notice__body > p").length,
        actions: [...card.querySelectorAll(".oak-account__actions button")].map(button => button.textContent.trim()),
        empty: card.querySelectorAll(".ui-empty, .oak-panel-hero, [data-pose]").length };
    });
    assert.equal(notice.title, "Sign-in is unavailable right now");
    assert.ok(notice.tile > 0 && notice.tile <= 40 && notice.tileRight <= notice.titleLeft, `a small icon tile leads, beside the text (${notice.tile}px)`);
    assert.equal(notice.lines, 1, "one line under the title");
    assert.deepEqual(notice.actions, ["Contact Steve", "Check sign-in again"]);
    assert.equal(notice.empty, 0, "no mascot, halo or Empty");
    assert.match(notice.face, /^"?Inter/, `the notice title uses the interface face (${notice.face})`);
  } finally {
    await browser.close();
  }
});
