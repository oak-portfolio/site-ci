import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

// D129: the contact brief starts as one question, with details on request (Oak: "still too bloated and overwhelming").
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const open = async (page, state) => {
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
  await page.waitForTimeout(500);
};
const withPage = async run => {
  const browser = await chromium.launch();
  try { await run(await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()); } finally { await browser.close(); }
};
const visibleWells = page => page.evaluate(() => [...document.querySelectorAll(".oak-brief-editor [data-slot='input-group']")].filter(node => node.checkVisibility()).length);
const visibleCounters = page => page.evaluate(() => [...document.querySelectorAll(".oak-brief-editor [data-slot='field-count']")]
  .filter(node => { const r = node.getBoundingClientRect(); return node.checkVisibility() && r.width > 2 && r.height > 2; }).length);

test("D129-G1 a fresh brief asks one thing: what you're after; details, counters and an empty reference list stay out of the way", () => withPage(async page => {
  await open(page, "funding");
  await page.getByRole("button", { name: "Ask Steve for more answers" }).click();
  await page.locator("#oak-brief-goals").waitFor({ timeout: 3000 });
  await page.waitForTimeout(400);
  assert.equal(await visibleWells(page), 1, "one well on first open");
  assert.equal(await page.locator(".oak-brief-editor summary", { hasText: "Add constraints or a start date" }).isVisible(), true, "details wait behind one row");
  assert.equal(await visibleCounters(page), 0, "no counters while there is plenty of room");
  assert.equal(await page.locator(".oak-brief__references").count(), 0, "no empty reference group before there are sources to pick");
  assert.equal(await page.getByRole("button", { name: "Prepare editable brief" }).isVisible(), true, "the one action is in view");
}));

test("D129-G2 details open on request, and a counter appears only near its limit", () => withPage(async page => {
  await open(page, "funding");
  await page.getByRole("button", { name: "Ask Steve for more answers" }).click();
  await page.locator("#oak-brief-goals").waitFor({ timeout: 3000 });
  await page.locator(".oak-brief-editor summary", { hasText: "Add constraints or a start date" }).click();
  await page.waitForTimeout(300);
  assert.equal(await visibleWells(page), 3, "constraints and the start-date question open in place");
  await page.locator("#oak-brief-goals").fill("x".repeat(1300));
  await page.waitForTimeout(200);
  assert.equal(await visibleCounters(page), 1, "the goals counter shows once it is close to 1,500");
  assert.equal(await page.locator("#oak-brief-goals-count").isVisible(), true);
}));

test("D129-G3 a brief that already has details opens with them showing", () => withPage(async page => {
  await open(page, "contact-brief");
  assert.equal(await visibleWells(page), 3, "nothing the visitor wrote is folded away");
}));
