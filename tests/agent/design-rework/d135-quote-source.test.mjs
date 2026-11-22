import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

// D135: a staged quote remembers the answer it came from; clicking its words scrolls the transcript back to that answer.
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");

test("D135-G1 clicking a staged quote's words brings its source answer back into view", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    await page.goto(`${galleryUrl}/__dev/oak-states?state=long-conversation`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
    const viewport = page.locator(".oak-conversation__viewport");
    await viewport.evaluate(node => node.scrollTo({ top: 0 }));
    await page.waitForTimeout(400);
    // Select the start of the first answer's first point, the way a drag would, and stage it.
    const source = await page.evaluate(() => {
      const node = document.querySelector(".oak-turn__answer .oak-answer__point p");
      const text = document.createTreeWalker(node, NodeFilter.SHOW_TEXT).nextNode();
      const range = document.createRange();
      range.setStart(text, 0); range.setEnd(text, Math.min(30, text.textContent.length));
      document.getSelection().removeAllRanges(); document.getSelection().addRange(range);
      return node.closest("[data-message-id]").getAttribute("data-message-id");
    });
    await page.locator(".oak-pick").waitFor({ timeout: 3000 });
    await page.getByRole("toolbar", { name: "Selected text" }).getByRole("button", { name: "Ask about this" }).click();
    const chip = page.locator(".oak-composer .oak-quote-chip .oak-quote-chip__text");
    await chip.waitFor({ timeout: 3000 });
    await viewport.evaluate(node => node.scrollTo({ top: node.scrollHeight }));
    await page.waitForTimeout(400);
    const inView = () => page.evaluate(id => {
      const answer = document.querySelector(`[data-message-id="${CSS.escape(id)}"]`).getBoundingClientRect();
      const area = document.querySelector(".oak-conversation__viewport").getBoundingClientRect();
      return answer.top >= area.top - 2 && answer.top < area.bottom - 40;
    }, source);
    assert.equal(await inView(), false, "scrolled away from the quoted answer first");
    await chip.click();
    await page.waitForTimeout(500);
    assert.equal(await inView(), true, "the quoted answer is back in view");
    assert.equal(await page.locator(".oak-composer .oak-quote-chip").count(), 1, "and the quote stays staged");
  } finally {
    await browser.close();
  }
});
