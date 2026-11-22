import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");

test("D110-G1 the selection bar appears only for text inside one answer, never for a drag across answers and the visitor's messages", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${galleryUrl}/__dev/oak-states?state=long-conversation`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
    await page.waitForTimeout(300);
    // Selects from the start of answer `from` to the end of answer `to`'s first text, the way a drag would.
    const select = (from, to) => page.evaluate(([a, b]) => {
      const answers = [...document.querySelectorAll(".oak-turn__answer")];
      const text = node => document.createTreeWalker(node, NodeFilter.SHOW_TEXT).nextNode();
      const start = text(answers[a]), end = text(answers[b]);
      const range = document.createRange();
      range.setStart(start, 0);
      range.setEnd(end, Math.min(12, end.textContent.length));
      const selection = document.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      return { answers: answers.length, text: selection.toString().length };
    }, [from, to]);
    const across = await select(0, 1);
    assert.ok(across.answers >= 2, `the conversation has two answers (${across.answers})`);
    await page.waitForTimeout(400);
    assert.equal(await page.locator(".oak-pick").count(), 0, "no bar for a selection that spans two answers and the question between them");
    await select(1, 1);
    await page.locator(".oak-pick").waitFor({ timeout: 3000 });
  } finally {
    await browser.close();
  }
});
