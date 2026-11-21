import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const open = async (page, state) => {
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
};

test("D13-G4 every workspace field keeps 16px text on a touch screen, so iOS focus never zooms into the small-window notice", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    let checked = 0;
    for (const state of ["composing", "funding", "role-fit", "contact-brief", "document-upload", "question-draft", "advice-intake", "voice-review", "account-purpose"]) {
      await open(page, state);
      // Questionnaire text answers sit on later steps; walk to them so the hidden-step filter does not skip them.
      if (state === "account-purpose") { await page.getByText("Hiring or recruiting").click(); await page.getByRole("button", { name: "Next" }).click(); }
      assert.ok(await page.evaluate(() => matchMedia("(hover: none) and (pointer: coarse)").matches), "touch emulation matches the coarse-pointer rule");
      const sizes = await page.locator(".oak-workspace :is(input:not([type=checkbox], [type=radio], [type=file], [hidden]), textarea)").evaluateAll(fields =>
        fields.map(field => ({ name: field.getAttribute("aria-label") ?? field.id ?? field.name, size: parseFloat(getComputedStyle(field).fontSize) })));
      for (const field of sizes) assert.ok(field.size >= 16, `${state}: ${field.name} is ${field.size}px`);
      checked += sizes.length;
    }
    assert.ok(checked >= 8, `checked ${checked} fields`);
  } finally {
    await browser.close();
  }
});

test("D13-G1 the composer carries no resize control, and Send keeps the row's end at every height", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await open(page, "composing");
    assert.equal(await page.locator(".oak-composer").getByRole("button", { name: /resize/i }).count(), 0, "the window resizes from its edges");
    const rowEnd = () => page.evaluate(() => {
      const row = document.querySelector(".oak-composer__actions").getBoundingClientRect();
      const button = document.querySelector(".oak-composer__actions .ui-button--primary").getBoundingClientRect();
      return Math.round(row.right - button.right);
    });
    assert.ok(await rowEnd() <= 16, "Send ends the row");
    // A portrait software keyboard shortens the visible viewport, which sets data-short-viewport.
    const phone = await browser.newPage({ viewport: { width: 402, height: 874 }, isMobile: true, hasTouch: true });
    await open(phone, "composing");
    const gap = await phone.evaluate(() => {
      document.querySelector(".oak-workspace").dataset.shortViewport = "true";
      const row = document.querySelector(".oak-composer__actions").getBoundingClientRect();
      const button = document.querySelector(".oak-composer__actions .ui-button--primary").getBoundingClientRect();
      return Math.round(row.right - button.right);
    });
    assert.ok(gap <= 16, `Send sits ${gap}px from the row's end on a short viewport`);
    await page.evaluate(() => { document.querySelector(".oak-workspace").dataset.compact = "true"; });
    assert.ok(await rowEnd() <= 16, "compact: Send still ends the row");
  } finally {
    await browser.close();
  }
});
