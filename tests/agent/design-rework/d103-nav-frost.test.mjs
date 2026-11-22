import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");

test("D103-G1 a panel that opens already scrolled frosts its nav bar every time, so content never shows sharp under the title", async () => {
  const browser = await chromium.launch();
  try {
    const misses = [];
    // The old observer read the oldest entry of a batch, so this went wrong on about half of fresh loads; eight loads catch it.
    // R12 (intentional update): document-selected now opens at the top so the file name is not under the bar; the over-limit
    // picker still opens scrolled to its meter, so it carries the check.
    for (let run = 0; run < 8; run++) {
      const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
      await page.goto(`${galleryUrl}/__dev/oak-states?state=document-too-long`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
      await page.waitForTimeout(1200);
      const bar = await page.evaluate(() => {
        const nav = document.querySelector(".oak-panel-nav"), sentinel = document.querySelector(".oak-panel-nav__sentinel");
        return { frosted: nav.hasAttribute("data-scrolled"), under: sentinel.getBoundingClientRect().top < nav.getBoundingClientRect().top - 1 };
      });
      if (bar.frosted !== bar.under) misses.push(run);
      await page.close();
    }
    assert.deepEqual(misses, [], "on every load, the bar is frosted exactly when content is under it");
  } finally {
    await browser.close();
  }
});
