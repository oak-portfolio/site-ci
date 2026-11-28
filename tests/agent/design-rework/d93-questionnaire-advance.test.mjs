import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const open = async (page, state) => {
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
  await page.waitForTimeout(300);
};
const question = page => page.locator(".ui-questionnaire__progress").innerText();

test("D93-G1 choosing a purpose moves to question 2 on its own, other input cancels it, and the last question waits", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await open(page, "account-purpose");
    assert.equal(await question(page), "Question 1 of 3");
    // Measured in the page: the time from the choice to question 2.
    const waited = await page.evaluate(() => new Promise(resolve => {
      const start = performance.now();
      document.querySelectorAll(".ui-questionnaire__item[data-active] .ui-questionnaire__choice")[1].click();
      const poll = () => /Question 2 of 3/.test(document.querySelector(".ui-questionnaire__progress").textContent)
        ? resolve(performance.now() - start) : performance.now() - start > 3000 ? resolve(-1) : requestAnimationFrame(poll);
      requestAnimationFrame(poll);
    }));
    assert.ok(waited >= 400 && waited <= 800, `it waits a beat, then moves on by itself (${Math.round(waited)}ms)`);

    // The beat is timed inside the page, on the same clock as the advance, so a busy test machine cannot blur it.
    // Typing within the beat cancels the move.
    await open(page, "account-purpose");
    await page.evaluate(() => new Promise(resolve => {
      const choice = document.querySelectorAll(".ui-questionnaire__item[data-active] .ui-questionnaire__choice")[0];
      choice.click();
      setTimeout(() => { choice.querySelector("input").dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true })); resolve(); }, 150);
    }));
    await page.waitForTimeout(800);
    assert.equal(await question(page), "Question 1 of 3", "a key press within 480ms cancels the pending advance");

    // Choosing again within the beat cancels the first move; the new choice gets its own beat.
    await open(page, "account-purpose");
    const early = await page.evaluate(() => new Promise(resolve => {
      const labels = () => document.querySelectorAll(".ui-questionnaire__item[data-active] .ui-questionnaire__choice");
      labels()[0].click();
      setTimeout(() => {
        labels()[2].click();
        setTimeout(() => resolve(document.querySelector(".ui-questionnaire__progress").textContent), 240);
      }, 300);
    }));
    assert.match(early, /Question 1 of 3/, "the first choice's advance was cancelled");
    await page.waitForFunction(() => /Question 2 of 3/.test(document.querySelector(".ui-questionnaire__progress").textContent), null, { timeout: 800 });

    // The A to E letters still choose, and the letter's choice moves on the same way.
    await open(page, "account-purpose");
    await page.locator(".ui-questionnaire__item[data-active] input").first().focus();
    await page.keyboard.press("c");
    assert.equal(await page.locator(".ui-questionnaire__item[data-active] input:checked").evaluate(input => input.closest("label").querySelector(".ui-questionnaire__shortcut").textContent), "C");
    await page.waitForFunction(() => /Question 2 of 3/.test(document.querySelector(".ui-questionnaire__progress").textContent), null, { timeout: 800 });

    // The last question never moves or submits by itself.
    await page.getByRole("button", { name: "Skip" }).click();
    assert.equal(await question(page), "Question 3 of 3");
    await page.locator(".ui-questionnaire__item[data-active] input").fill("A friend");
    await page.waitForTimeout(900);
    assert.equal(await question(page), "Question 3 of 3", "the last question stays put");
    assert.equal(await page.locator(".ui-questionnaire").count(), 1, "and nothing was submitted");
  } finally {
    await browser.close();
  }
});
