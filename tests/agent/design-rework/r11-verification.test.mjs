import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

// R11 (Oak, 2026-10-20): "there's no proper spacing on Cloudflare. It should not be under the composer." A check that needs
// the visitor turns the conversation area into a centred verification view; these read the rendered gallery state.
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const question = "What did Steve own on the EcoSmartLoop classifier?";
const open = async (page, state) => {
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
  await page.waitForTimeout(800);
};
const withPage = async (run, viewport = { width: 1280, height: 800 }) => {
  const browser = await chromium.launch();
  try { await run(await browser.newPage({ viewport })); } finally { await browser.close(); }
};
const shown = '.oak-verification[data-visible="true"]';

test("R11 verification mode replaces the message list and the message box", () => withPage(async page => {
  await open(page, "verification");
  await page.locator(shown).waitFor();
  assert.equal(await page.locator(".oak-workspace__reading [data-slot='message']").count(), 0, "no transcript message shows behind the check");
  assert.equal(await page.locator(".oak-composer").first().isVisible(), false, "the message box steps aside");
  assert.equal(await page.locator(".oak-composer .oak-verification").count(), 0, "nothing of the check sits in the composer");
}));

test("R11 the view is centred, titled, framed on the sheet radius and focus lands on its heading", () => withPage(async page => {
  await open(page, "verification");
  const view = page.locator(shown);
  const heading = view.getByRole("heading", { level: 2 });
  assert.match(await heading.innerText(), /quick check/i);
  assert.equal(await heading.evaluate(node => document.activeElement === node), true, "focus moves into the view");
  const geometry = await page.evaluate(() => {
    const pane = document.querySelector(".oak-workspace__reading").getBoundingClientRect();
    const frame = document.querySelector(".oak-verification__frame");
    const box = frame.getBoundingClientRect();
    const s = getComputedStyle(frame);
    const inner = parseFloat(getComputedStyle(document.querySelector(".oak-verification__placeholder")).borderTopLeftRadius);
    return { pane: { x: pane.left + pane.width / 2, y: pane.top + pane.height / 2, h: pane.height }, frame: { x: box.left + box.width / 2, y: box.top + box.height / 2 },
      radius: parseFloat(s.borderTopLeftRadius), pad: parseFloat(s.paddingTop), inner };
  });
  assert.ok(Math.abs(geometry.frame.x - geometry.pane.x) <= 2, `horizontally centred (${geometry.frame.x} vs ${geometry.pane.x})`);
  assert.ok(Math.abs(geometry.frame.y - geometry.pane.y) <= geometry.pane.h * 0.25, "sits in the middle band of the pane");
  assert.ok(geometry.radius >= 24, `frame radius ${geometry.radius}`);
  assert.ok(geometry.pad >= 16, `frame padding ${geometry.pad}`);
  assert.ok(geometry.inner >= 16 && geometry.inner <= geometry.radius, `inner radius ${geometry.inner} is concentric with a 16px floor`);
  assert.ok(await view.locator(".oak-panel-hero .oak-activity-sprite").count() > 0, "Oak's art leads the view");
}));

test("R11 Escape returns to the conversation without sending, keeps the question, and the check can be reopened", () => withPage(async page => {
  await open(page, "verification");
  await page.keyboard.press("Escape");
  await page.locator(shown).waitFor({ state: "detached" });
  assert.equal(await page.locator(".oak-composer textarea").first().inputValue(), question);
  assert.ok(await page.locator(".oak-workspace__reading [data-slot='message']").count() > 0, "the conversation is back");
  assert.equal(await page.locator(".oak-workspace__reading [data-slot='message']").count(), 2, "nothing was sent");
  await page.getByRole("button", { name: "Finish the quick check to send" }).click();
  await page.locator(shown).waitFor();
}));
