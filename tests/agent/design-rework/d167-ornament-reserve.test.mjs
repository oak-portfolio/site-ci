import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { launchSlowLazy } from "../support/slow-lazy.mjs";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");

const contentHeight = page => page.evaluate(() => Math.round(document.querySelector(".oak-conversation__viewport").firstElementChild.getBoundingClientRect().height));
// Linux CI sets the capsule wider than a Mac does: at 390 its labels wrap to two lines there, and in this wide face here.
const WIDE = ".oak-workspace, .oak-workspace * { font-family: monospace !important; letter-spacing: 0.5px !important; }";

for (const width of [390, 1280]) for (const font of [undefined, WIDE]) {
  test(`167-G2 the answer ornament's lazy placeholder reserves the capsule's height at ${width}px${font ? " in a wide face" : ""}, so the transcript does not grow when it loads`, async () => {
    const browser = await launchSlowLazy();
    try {
      const page = await browser.newPage({ viewport: { width, height: 800 }, reducedMotion: "reduce" });
      // Hold the ornament's chunk (dev serves it as its own module) until the placeholder has been measured.
      let release;
      const held = new Promise(resolve => { release = resolve; });
      await page.route(/\/src\/components\/agent\/OakAnswerOrnament\.tsx/, async route => { await held; await route.continue(); });
      await page.goto(`${galleryUrl}/__dev/oak-states?state=answer-ornament-focus`, { waitUntil: "domcontentloaded" });
      if (font) await page.addStyleTag({ content: font });
      await page.waitForSelector(".oak-turn__footer", { timeout: 20000 });
      await page.waitForTimeout(1500);
      const before = await contentHeight(page);
      release();
      await page.waitForSelector(".oak-ornament[role=toolbar]", { timeout: 20000 });
      await page.waitForTimeout(500);
      const after = await contentHeight(page);
      assert.ok(Math.abs(after - before) <= 1, `transcript height ${before}px with the placeholder, ${after}px with the ornament`);
    } finally {
      await browser.close();
    }
  });
}
