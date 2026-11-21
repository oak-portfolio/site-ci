import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { openState } from "../premium/gallery.mjs";

// Ticket 49 (gallery on OAK_GALLERY_URL): the Contact card, its focus state, the decline receipt, and every state at 390.
const sideways = page => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
const STATES = ["contact-card-hiring", "contact-card-availability", "contact-card-focus", "contact-card-declined", "contact-card-streaming", "contact-card-off"];
const chatHidden = page => page.evaluate(() => {
  const turn = document.querySelector(".oak-conversation");
  return Boolean(turn?.closest("[inert], [aria-hidden='true']"));
});

test("gallery: the card draws on a hiring question with the glow, availability only from the reviewed record, and off draws the next-step row", async () => {
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await openState(page, "contact-card-hiring", { settle: 300 });
    assert.equal(await page.locator(".oak-contact-card").count(), 1);
    assert.equal(await page.locator("[data-glow]").count(), 1, "the glow is on this card only");
    assert.equal(await page.locator(".oak-contact-card__availability").count(), 0, "no availability while unreviewed");
    await openState(page, "contact-card-availability", { settle: 300 });
    assert.match(await page.locator(".oak-contact-card__availability").innerText(), /Open to/);
    await openState(page, "contact-card-off", { settle: 300 });
    assert.equal(await page.locator(".oak-contact-card").count(), 0);
    assert.equal(await page.locator(".oak-openui__proposal").count(), 1, "constant off draws the plain Proposal");
  } finally { await browser.close(); }
});

test("gallery: the focus state makes the chat inert, Escape closes it and returns focus to the card title", async () => {
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await openState(page, "contact-card-hiring", { settle: 300 });
    assert.equal(await chatHidden(page), false, "the chat is live before the focus state");
    await page.locator(".oak-contact-card__title").click();
    await page.locator(".oak-contact-focus").waitFor();
    assert.equal(await page.locator(".oak-contact-focus__reason").count(), 3);
    assert.equal(await chatHidden(page), true, "the chat is inert or aria-hidden behind the focus state");
    await page.keyboard.press("Escape");
    await page.locator(".oak-contact-focus").waitFor({ state: "detached" });
    await page.waitForFunction(() => document.activeElement?.classList.contains("oak-contact-card__title"), null, { timeout: 2000 });
    assert.equal(await chatHidden(page), false, "the chat is live again");
  } finally { await browser.close(); }
});

test("gallery (ticket 143): when copy fails, the address shows as text and the one mounted live region says so", async () => {
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    await openState(page, "contact-card-focus", { settle: 300 });
    const focus = page.locator(".oak-contact-focus");
    await focus.waitFor();
    const status = focus.locator('[role="status"]');
    assert.equal(await status.count(), 1, "one live region before copy");
    const before = await status.elementHandle();
    await page.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new Error("denied")); });
    await focus.getByRole("button", { name: "Copy email" }).click();
    await page.waitForFunction(() => /Copy is unavailable/.test(document.querySelector('.oak-contact-focus [role="status"]')?.textContent ?? ""), null, { timeout: 2000 });
    assert.equal(await status.count(), 1, "no second status node");
    assert.equal(await before.evaluate(el => el.isConnected), true, "the same live region carries the message");
    assert.match(await status.innerText(), /okkark\.pro@gmail\.com/, "the address is shown, not only named");
    assert.equal(await status.isVisible(), true);
    assert.doesNotMatch(await status.innerText(), /Email Steve/, "no pointer at a control the dialog has made inert");
  } finally { await browser.close(); }
});

test("gallery: Not now leaves the receipt with focus on it, and every state fits 390 without sideways scroll", async () => {
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    await openState(page, "contact-card-declined", { settle: 300 });
    assert.equal(await page.locator(".oak-contact-card").count(), 0);
    assert.equal(await page.evaluate(() => document.activeElement?.classList.contains("oak-proposal__receipt")), true);
    for (const id of STATES) {
      await openState(page, id, { settle: 300 });
      assert.equal(await sideways(page), false, `${id} scrolls sideways at 390`);
    }
  } finally { await browser.close(); }
});
