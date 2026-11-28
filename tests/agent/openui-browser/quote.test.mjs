import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { openState } from "../premium/gallery.mjs";

// Ticket 29 (gallery on OAK_GALLERY_URL): the carousel never moves on its own, its controls are named buttons, and every state fits 390.
const sideways = page => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
const offset = page => page.locator(".oak-quote__viewport").first().evaluate(node => [...node.querySelectorAll(".ticker-item, .clone-item")].map(item => Math.round(item.getBoundingClientRect().left)).join(","));

test("gallery: under reduced motion the carousel never moves on its own, and previous, next and the dots are named buttons the keyboard reaches", async () => {
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" })).newPage();
    await openState(page, "quote-carousel", { settle: 500 });
    const before = await offset(page);
    await page.waitForTimeout(5000);
    assert.equal(await offset(page), before, "no movement over 5 s");
    const next = page.getByRole("button", { name: "Next quote" });
    const prev = page.getByRole("button", { name: "Previous quote" });
    assert.equal(await next.count(), 1);
    assert.equal(await prev.count(), 1);
    assert.equal(await page.getByRole("button", { name: /^Show quote \d of 3$/ }).count(), 3);
    await next.focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(600);
    assert.notEqual(await offset(page), before, "Enter on Next moves one slide");
    assert.match(await page.locator(".oak-quote__count").innerText(), /^2 of 3$/);
    const label = () => page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
    for (let step = 0; step < 4; step++) await page.keyboard.press("Shift+Tab");
    assert.equal(await label(), "Previous quote", "Shift+Tab walks back through the three dots to Previous");
  } finally { await browser.close(); }
});

test("gallery: quote text is 16/26 at 1280, the Magic Patterns frame", async () => {
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    for (const id of ["quote-pull", "quote-carousel", "quote-bridge"]) {
      await openState(page, id, { settle: 300 });
      const [size, leading] = await page.locator(".oak-quote__words").first().evaluate(node => { const style = getComputedStyle(node); return [style.fontSize, style.lineHeight]; });
      assert.deepEqual([size, leading], ["16px", "26px"], `${id}: quote text is 16/26, the Magic Patterns frame`);
    }
  } finally { await browser.close(); }
});

test("gallery: every quote state fits 390, off draws the plain Points list and streaming draws its ghost", async () => {
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    for (const id of ["quote-pull", "quote-carousel", "quote-bridge", "quote-related", "quote-streaming", "quote-off"]) {
      await openState(page, id, { settle: 300 });
      assert.equal(await sideways(page), false, `${id}: no sideways scroll at 390`);
    }
    await openState(page, "quote-off", { settle: 200 });
    assert.equal(await page.locator(".oak-quote").count(), 0);
    assert.ok(await page.locator(".oak-openui__points").count() > 0);
    await openState(page, "quote-streaming", { settle: 200 });
    assert.ok(await page.locator(".oak-quote[data-pending]").count() > 0);
    await openState(page, "quote-related", { settle: 200 });
    assert.equal(await page.locator(".oak-bridge__related").count(), 1);
    assert.equal(await page.locator("blockquote").count(), 0, "Related carries no quote");
    await openState(page, "quote-bridge", { settle: 200 });
    assert.ok(await page.locator(".oak-bridge__card blockquote").count() > 0);
    assert.equal(await page.getByText("Draft a contact brief").count(), 1, "the invitation shows once, the next-step card steps aside");
  } finally { await browser.close(); }
});
