import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

// D150: Codex review on PR #119 (dcf35ea9). With the visitor's own account selected, the composer still showed Oak's
// sponsored answers-left ring ("0 left", "Sign in for more") beside a Send that spends the visitor's funds.
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");

test("D150-G1 the answers-left ring shows only while Oak's sponsored answers are selected", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${galleryUrl}/__dev/oak-states?state=allowance-guest`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
    // R17 (intentional update): one meter. With the visitor's own account it stays for conversation memory, with no
    // sponsored answers reading in its name or card.
    const ring = () => page.locator('.oak-composer__meter[aria-label^="Answers left:"]').count();
    assert.equal(await ring(), 1, "sponsored: the ring is there");
    const select = selected => page.evaluate(async selected => {
      const find = name => performance.getEntriesByType("resource").map(entry => entry.name).find(url => new RegExp(`/${name}\\.ts(\\?|$)`).test(url));
      (await import(find("src/lib/oakFundingSession"))).oakFundingMemory.select(selected);
    }, selected);
    await select("visitor");
    await page.waitForTimeout(300);
    assert.equal(await ring(), 0, "the visitor's own account: no sponsored ring");
    assert.equal(await page.locator('.oak-composer__meter[data-lead="memory"]').count(), 1, "the one meter reads memory instead");
    await select("sponsored");
    await page.waitForTimeout(300);
    assert.equal(await ring(), 1, "back on Oak's answers: the ring returns");
  } finally {
    await browser.close();
  }
});
