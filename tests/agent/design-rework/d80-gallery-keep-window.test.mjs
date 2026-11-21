import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

// Ticket 80: the gallery's sample saved rows sit inside their 30-day keep window whenever the gallery renders.
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const rendersAt = new Date("2027-03-05T15:30:00.000Z");
const dayMs = 86_400_000;

const withPage = async run => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: "UTC" });
    const page = await context.newPage();
    await page.clock.setFixedTime(rendersAt);
    await run(page);
  } finally { await browser.close(); }
};
const open = async (page, state) => {
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
  await page.waitForTimeout(1500);
};
const utcDay = time => Math.floor(time / dayMs);

test("D80-G1 months after the fixtures were written, the sample saved list still holds three unexpired rows from 0, 1 and 4 days ago", () => withPage(async page => {
  await open(page, "saved-list");
  const rows = await page.evaluate(() => [...document.querySelectorAll("#oak-saved-conversations [data-slot='item']")].map(row => ({
    when: row.querySelector("time")?.getAttribute("dateTime") ?? "",
  })));
  assert.equal(rows.length, 3, "all three sample rows are inside their keep window");
  assert.deepEqual(rows.map(row => utcDay(rendersAt.getTime()) - utcDay(Date.parse(row.when))), [0, 1, 4], "saved today, yesterday and four days ago");
  const headers = await page.locator("#oak-saved-conversations .oak-saved__group-header").allTextContents();
  assert.deepEqual(headers, ["Today", "Yesterday", "Previous 7 days"]);
  const more = page.locator("#oak-saved-conversations [data-slot='item']").first().locator("[data-slot='item-actions'] button");
  await more.click();
  assert.match(await page.getByRole("menu").locator(".oak-saved__menu-note").innerText(), /^Kept until Apr 4$/, "30 days after the newest save");
}));

test("D80-G2 the delete confirmation still opens on the first sample row, months on", () => withPage(async page => {
  await open(page, "delete-confirm");
  const dialog = page.getByRole("dialog", { name: "Delete this saved conversation?" });
  await dialog.waitFor({ timeout: 3000 });
  assert.match(await dialog.locator("[data-slot='dialog-description']").innerText(), /^Today, .+, 4 messages, saved version 1/);
  assert.equal(await dialog.locator('[data-pose="delete-review"]').count(), 1, "the confirmation carries its art");
}));

test("D80-G3 a reopened saved conversation is still inside its keep window, so its dated separator stays", () => withPage(async page => {
  await open(page, "saved-reopened");
  const items = page.locator(".oak-conversation__content > [role=listitem]");
  assert.match(await items.first().innerText(), /^Saved conversation from Oct 10$/);
}));
