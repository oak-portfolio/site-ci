import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const sample = page => page.evaluate(() => {
  const card = document.querySelector(".oak-turn__answer :is(.oak-advice-card, .oak-role-review, .oak-document-answer)");
  const footer = document.querySelector(".oak-turn__answer [data-slot='message-footer']");
  if (!card) return null;
  const timing = animation => animation.effect.getComputedTiming();
  const last = card.lastElementChild.getAnimations().find(animation => animation.animationName === "oak-card-part");
  const lands = last ? timing(last).endTime : null;
  const footerDelays = footer ? footer.getAnimations().map(animation => timing(animation).delay) : [];
  return { parts: [...card.children].map(node => Number(getComputedStyle(node).opacity)), footer: footer ? Number(getComputedStyle(footer).opacity) : null,
    lands, opens: footerDelays.length ? Math.min(...footerDelays) : null };
});

test("D73-G1 advice, role fit and document answers build part by part after the trail folds, and their actions wait for the last part", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    for (const state of ["advice", "role-fit-answer", "answer-document"]) {
      await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
      const samples = [];
      // Sample until the card is at rest (its actions in), so a cold page load cannot push the build outside the window.
      for (let tick = 0; tick < 150; tick++) {
        const value = await sample(page);
        if (value) samples.push(value);
        if (value && value.footer !== null && value.footer > 0.99) break;
        await page.waitForTimeout(60);
      }
      // Somewhere mid-build the first part is in while the last is still on its way.
      assert.ok(samples.some(value => value.parts[0] > 0.95 && value.parts.at(-1) < 0.5), `${state}: parts arrive in order`);
      assert.ok(samples.every(value => !(value.footer > 0.5 && value.parts.at(-1) < 0.95)), `${state}: actions wait for the last part`);
      const timed = samples.find(value => value.lands !== null && value.opens !== null);
      assert.ok(timed && timed.opens >= timed.lands, `${state}: the actions are timed to open after the last part has landed (${timed?.opens}ms vs ${timed?.lands}ms)`);
      await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
      const rest = await sample(page);
      assert.ok(rest.parts.every(value => value > 0.95), `${state}: every part at rest`);
    }
    const still = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    for (const [state, card] of [["advice", ".oak-advice-card"], ["role-fit-answer", ".oak-role-review"], ["answer-document", ".oak-document-answer"]]) {
      await still.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
      await still.waitForSelector(card);
      assert.ok((await sample(still)).parts.every(value => value > 0.95), `${state}: reduced motion shows the whole card at once`);
    }
  } finally {
    await browser.close();
  }
});

test("D73-G2 the scanned-page facts lead with their meaning and the delete confirmation leads with its art tile", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${galleryUrl}/__dev/oak-states?state=ocr-consent`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
    // R12 (intentional update): the four-row facts table repeated what the card already says, so it is gone. The reader
    // (Gemini) and the payer are the two short lines, the payer line leads with its lock, and today's pages lead with a clock.
    assert.equal(await page.locator(".oak-ocr__facts").count(), 0, "no facts table");
    const lines = await page.locator(".oak-ocr__lines p").allInnerTexts();
    assert.equal(lines.length, 2, "two short lines");
    assert.match(lines[0], /Oak turns them into text/); assert.doesNotMatch(lines.join(" "), /Gemini/);
    assert.match(lines[1], /Oak pays.*never saved/);
    assert.equal(await page.locator(".oak-ocr__privacy svg[data-icon='lock']").count(), 1, "the cost line leads with its meaning");
    assert.equal(await page.locator(".oak-ocr__allowance-head svg[data-icon='clock']").count(), 1, "today's pages lead with a clock");
    await page.goto(`${galleryUrl}/__dev/oak-states?state=delete-confirm`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
    const art = await page.locator(".oak-saved-delete__art .oak-art-tile").evaluate(tile => {
      const box = tile.getBoundingClientRect(), title = tile.closest("[role=dialog], [role=alertdialog]").querySelector("h2").getBoundingClientRect();
      return { size: Math.round(box.width), img: !!tile.querySelector("img"), left: Math.round(box.left - title.left) };
    });
    assert.ok(art.size >= 56 && art.img, `the dialog leads with its art in a tile (${art.size}px)`);
    assert.ok(Math.abs(art.left) <= 2, `the tile shares the title's left edge (${art.left}px)`);
  } finally {
    await browser.close();
  }
});
