import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const open = async (page, state) => {
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
  await page.waitForTimeout(500);
};

test("D59-G1 voice off is one calm card with its own art and a way back to typing; voice on keeps the recorder", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await open(page, "voice-off");
    const off = await page.evaluate(() => ({
      recorder: document.querySelectorAll(".oak-voice__stage, .oak-voice__meter, .oak-voice__timer").length,
      title: document.querySelector(".oak-voice__off .oak-turn__stopped-title")?.textContent,
      detail: document.querySelector(".oak-voice__off .oak-turn__stopped-detail")?.textContent ?? "",
      art: document.querySelectorAll('.oak-panel-hero [data-pose="voice-off"]').length,
      cardArt: document.querySelectorAll(".oak-voice__off .oak-turn__stopped-art").length }));
    assert.equal(off.recorder, 0, "no recorder, timer or meter while voice is off");
    assert.equal(off.title, "Voice input is off right now");
    assert.ok(off.detail.length > 0 && off.detail.length < 100, `one short line (${off.detail.length})`);
    assert.equal(off.art, 1, "the panel leads with the sleeping-microphone art");
    assert.equal(off.cardArt, 0, "one picture per panel: the card itself is words and one action");
    await page.getByRole("button", { name: "Type instead" }).click();
    await page.waitForTimeout(400);
    assert.equal(await page.getByRole("heading", { name: "Dictate a message" }).count(), 0, "the panel closes");
    assert.equal(await page.evaluate(() => document.activeElement?.id), "oak-composer-input", "the message box has focus");

    for (const state of ["voice-recording", "voice-transcribing", "voice-review"]) {
      await open(page, state);
      assert.equal(await page.locator(".oak-voice__off").count(), 0, `${state}: no off card while voice is on`);
      assert.equal(await page.locator(".oak-voice").count(), 1, `${state}: the recorder renders`);
    }
  } finally {
    await browser.close();
  }
});
