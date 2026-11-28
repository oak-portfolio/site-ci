import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");

test("D102-G1 before a brief is prepared, Prepare is its one action and sits whole in the window; once prepared, Copy and the email draft join it", async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
    const page = await context.newPage();
    await page.goto(`${galleryUrl}/__dev/oak-states?state=contact-brief`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
    const prepare = page.getByRole("button", { name: "Prepare editable brief" });
    await prepare.waitFor();
    assert.equal(await page.getByRole("button", { name: "Copy brief" }).count(), 0, "no disabled Copy under Prepare");
    const fit = await prepare.evaluate(node => {
      const box = node.getBoundingClientRect(), frame = node.closest(".oak-workspace").getBoundingClientRect();
      return { bottom: Math.round(box.bottom), frame: Math.round(frame.bottom) };
    });
    assert.ok(fit.bottom <= fit.frame - 8, `Prepare sits whole inside the window (${fit.bottom} vs ${fit.frame})`);

    await prepare.click();
    await page.locator("#oak-brief-text").waitFor({ timeout: 3000 });
    await page.getByRole("button", { name: "Copy brief" }).waitFor();
    assert.match(await page.locator("a", { hasText: "Open email draft" }).getAttribute("href"), /^mailto:/, "the email draft is the primary once prepared");
  } finally {
    await browser.close();
  }
});
