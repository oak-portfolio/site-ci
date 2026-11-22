import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const longAnswer = "The EcoSmartLoop article credits Frank Baah and Glenn Marvin Musoke with primarily pushing LEAF Engine training and serving. ".repeat(22);

test("D06-G7 a whole answer that lands while the reader follows opens on its question; a reader who scrolled away stays put", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const open = async state => {
      await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
    };
    const question = () => page.evaluate(() => {
      const viewport = document.querySelector(".oak-conversation__viewport").getBoundingClientRect();
      const asked = [...document.querySelectorAll(".oak-conversation__content [data-align=end]")].at(-1).getBoundingClientRect();
      const answer = [...document.querySelectorAll(".oak-conversation__content [data-align=start]")].at(-1)?.getBoundingClientRect();
      return { visible: asked.top >= viewport.top && asked.bottom <= viewport.bottom, top: Math.round(asked.top - viewport.top),
        answerTop: answer ? Math.round(answer.top - viewport.top) : null, height: Math.round(viewport.height) };
    });

    await open("long-conversation");
    await page.evaluate(() => window.__oakGallery.sendUser("Who built the EcoSmartLoop classifier, and what did Steve own?"));
    await page.waitForTimeout(500);
    const asked = await question();
    await page.evaluate(text => window.__oakGallery.completeAssistant(text), longAnswer);
    await page.waitForTimeout(1200);
    const landed = await question();
    // The answer rises in place: the question stays where the reader saw it, near the top, and the answer starts on screen under it.
    assert.ok(landed.visible && landed.top <= 96, `question sits near the top after the answer lands (${JSON.stringify(landed)})`);
    assert.ok(Math.abs(landed.top - asked.top) <= 4, `the view does not jump when the answer lands (${asked.top} -> ${landed.top})`);
    assert.ok(landed.answerTop !== null && landed.answerTop > landed.top && landed.answerTop < landed.height / 2, `the answer starts on screen under its question (${JSON.stringify(landed)})`);

    await open("long-conversation");
    await page.evaluate(() => window.__oakGallery.sendUser("Second question?"));
    await page.waitForTimeout(500);
    await page.locator(".oak-conversation__viewport").hover();
    await page.mouse.wheel(0, -900);
    await page.waitForTimeout(500);
    const before = await page.evaluate(() => document.querySelector(".oak-conversation__viewport").scrollTop);
    await page.evaluate(text => window.__oakGallery.completeAssistant(text), longAnswer);
    await page.waitForTimeout(1200);
    assert.equal(await page.evaluate(() => document.querySelector(".oak-conversation__viewport").scrollTop), before, "a reader who scrolled up is not moved");

    await open("answer-sourced");
    assert.ok((await question()).visible, "the answer-sourced gallery state shows the question it answers");
  } finally {
    await browser.close();
  }
});
