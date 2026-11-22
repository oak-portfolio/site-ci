// Run: OAK_GALLERY_URL=http://127.0.0.1:<port> node --test tests/agent/owner/console-fit.test.mjs (this worktree's astro dev)
// No owner console tab may scroll the page sideways at 1280 or 390; wide tables scroll inside their own frame.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { chromium } from "playwright";
import { ownServer } from "../support/own-server.mjs";

const base = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const skip = existsSync(chromium.executablePath()) ? false : "no Playwright browser on this runner";
const tabs = ["overview", "keys", "usage", "health", "content", "assets", "traces", "quality", "release", "public"];

for (const width of [1280, 390]) {
  test(`owner console at ${width}: no tab scrolls the page sideways`, { skip, timeout: 180_000 }, async () => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const wide = [];
      for (const tab of tabs) {
        await page.goto(`${base}/owner/console?fixture=signed-in&tab=${tab}`, { waitUntil: "networkidle" });
        await page.locator(".oc__main").waitFor();
        await page.waitForFunction(() => !document.querySelector(".oc__main [aria-busy='true']"), null, { timeout: 30_000 }).catch(() => {});
        const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
        if (scroll > client) wide.push(`${tab} ${scroll} > ${client}`);
      }
      assert.deepEqual(wide, [], "tabs wider than the window");
    } finally {
      await browser.close();
    }
  });
}
