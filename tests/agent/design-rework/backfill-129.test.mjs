import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

// Ticket 129: the owner console title stays on one line, never over the header controls, from 320 to 1280 (r129 P2).
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");

test("129-61 the owner console title is one line at 390 and 1280", async () => {
  const browser = await chromium.launch();
  try {
    for (const width of [320, 360, 390, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.goto(`${galleryUrl}/owner/console?fixture=signed-in&tab=overview`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector(".oc__title");
      const box = await page.evaluate(() => {
        const title = document.querySelector(".oc__title");
        const rect = title.getBoundingClientRect();
        return { height: rect.height, line: parseFloat(getComputedStyle(title).lineHeight), spill: rect.right - title.closest('.oc__brand').getBoundingClientRect().right };
      });
      assert.ok(box.height <= box.line + 1, `title is ${box.height}px tall at ${width}, one line is ${box.line}px`);
      assert.ok(box.spill <= 0.5, `title spills ${box.spill}px into the header controls at ${width}`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
