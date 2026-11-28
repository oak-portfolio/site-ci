import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");

test("D104-G1 content a panel scrolls to, or a control that takes focus, lands below the sticky nav bar instead of under it", async () => {
  const browser = await chromium.launch();
  try {
    for (const viewport of [{ width: 1280, height: 800 }, { width: 1440, height: 900 }]) {
      const page = await browser.newPage({ viewport });
      await page.goto(`${galleryUrl}/__dev/oak-states?state=ocr-consent`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
      await page.waitForTimeout(600);
      const size = `${viewport.width}x${viewport.height}`;
      // The gallery reveals the review with scrollIntoView({ block: "start" }), as any in-page jump would.
      const revealed = await page.evaluate(() => ({
        card: document.querySelector(".oak-documents__preview").getBoundingClientRect().top,
        nav: document.querySelector(".oak-panel-nav").getBoundingClientRect().bottom,
      }));
      assert.ok(revealed.card >= revealed.nav, `${size}: the revealed review starts below the nav (card ${revealed.card}, nav ${revealed.nav})`);
      // P12: the scan card has no terms toggle; its last action, Remove, is the control. Put it just under the bar, then focus it as Shift+Tab would (WCAG 2.4.11, focus not obscured).
      const focused = await page.evaluate(() => {
        const reading = document.querySelector(".oak-workspace__reading"), nav = document.querySelector(".oak-panel-nav");
        const toggle = [...document.querySelectorAll(".oak-ocr .oak-documents__actions .ui-button")].at(-1);
        reading.scrollTop += toggle.getBoundingClientRect().top - nav.getBoundingClientRect().top - 4;
        toggle.focus();
        return { toggle: toggle.getBoundingClientRect().top, nav: nav.getBoundingClientRect().bottom };
      });
      assert.ok(focused.toggle >= focused.nav, `${size}: a focused control scrolls fully below the nav (control ${focused.toggle}, nav ${focused.nav})`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
