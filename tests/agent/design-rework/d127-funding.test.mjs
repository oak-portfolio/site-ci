import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

// D127: model funding a first-time visitor can follow: who pays, OpenRouter by its own mark, and a way to ask for more.
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

test("D127-G1 connecting your own account shows OpenRouter's mark, says who pays, leads with Connect and folds the key field away", () => withPage(async page => {
  await open(page, "funding");
  await page.getByRole("radio", { name: /My OpenRouter account/ }).click();
  const provider = page.locator(".oak-funding__provider");
  await provider.waitFor({ timeout: 3000 });
  assert.equal(await provider.locator('img[src*="openrouter"]').count(), 1, "OpenRouter's own mark");
  assert.match(await provider.innerText(), /your OpenRouter credits/i, "it says who pays");
  assert.equal(await provider.getByRole("button", { name: "Connect OpenRouter" }).count(), 1, "Connect is the main action");
  assert.equal(await page.locator("#oak-funding-key").isVisible(), false, "the key field waits behind a disclosure");
  await page.getByText("Paste a key instead").click();
  assert.equal(await page.locator("#oak-funding-key").isVisible(), true, "and opens on request");
}));

test("D127-G2 the free allowance offers a way to ask Steve for more, as a brief the visitor sends", () => withPage(async page => {
  await open(page, "funding");
  await page.getByRole("button", { name: "Ask Steve for more answers" }).click();
  const goals = page.locator("#oak-brief-goals");
  await goals.waitFor({ timeout: 3000 });
  assert.match(await goals.inputValue(), /more (free )?answers/i, "the brief starts with the request");
  assert.equal(await page.getByRole("heading", { name: "Your contact brief" }).count(), 1, "in the contact brief, which never sends by itself");
}));
