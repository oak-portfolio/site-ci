import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

// D126: first-run teaching (Apple TipKit rules: inline, one-time, dismissible; no modal tour) and tool descriptions.
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const open = async (page, state, query = "") => {
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}${query}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
  await page.waitForTimeout(500);
};
const withPage = async run => {
  const browser = await chromium.launch();
  try { await run(await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()); } finally { await browser.close(); }
};

// R11 (intentional update, Oak review v8): hint lines were cut to lower load (Claude's plus menu); each tool is a short plain
// name, and the panel it opens says in one line what it returns (Q06-G5).
test("D126-G1 every tool in the menu is a short plain name with no hint line", () => withPage(async page => {
  await open(page, "tools-menu");
  const items = await page.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].map(item => ({
    name: item.getAttribute("aria-label") ?? item.textContent.trim(),
    described: item.hasAttribute("aria-describedby"), text: item.textContent.trim(),
  })));
  assert.equal(items.length, 3, `the menu lists its message modes (${items.length})`);
  for (const item of items) {
    assert.equal(item.described, false, `${item.name}: no hint line`);
    assert.equal(item.text, item.name, `${item.name}: the row shows only its name`);
    assert.ok(item.name.split(" ").length <= 4, `${item.name}: short`);
  }
  assert.equal(await page.getByRole("menuitem", { name: "Compare a role", exact: true }).count(), 1);
}));

test("D126-G2 a first visit opens with one welcome tip that explains free answers and Tools, and it stays dismissed", () => withPage(async page => {
  await open(page, "empty", "&tips=live");
  const tip = page.locator('.oak-tip[data-tip="welcome"]');
  await tip.waitFor({ timeout: 3000 });
  const text = await tip.innerText();
  assert.match(text, /free/i, "it says answers are free");
  assert.match(text, /OpenRouter/, "and that a visitor can use their own OpenRouter account");
  assert.match(text, /Tools/, "and points at Tools");
  assert.equal(await page.locator(".oak-tip").count(), 1, "one tip at a time");
  await tip.getByRole("button", { name: "Open tools" }).click();
  await page.locator('[role="menu"][aria-label="Oak tools"]').waitFor({ timeout: 3000 });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Dismiss tip" }).click();
  await tip.waitFor({ state: "detached", timeout: 3000 });
  await open(page, "empty", "&tips=live");
  assert.equal(await page.locator('.oak-tip[data-tip="welcome"]').count(), 0, "dismissed tips never come back");
}));

test("D126-G3 Tools carries a small new mark until the menu is first opened", () => withPage(async page => {
  await open(page, "empty", "&tips=live");
  const trigger = page.locator("[data-oak-tools-trigger]");
  assert.equal(await trigger.getAttribute("data-new"), "true", "a new mark on first visit");
  assert.equal(await trigger.getAttribute("aria-label"), "Tools", "the button keeps its name");
  assert.match(await trigger.evaluate(node => document.getElementById(node.getAttribute("aria-describedby") ?? "")?.textContent ?? ""), /^New/, "and the mark is announced as a description");
  await trigger.click();
  await page.locator('[role="menu"][aria-label="Oak tools"]').waitFor({ timeout: 3000 });
  await page.keyboard.press("Escape");
  assert.equal(await trigger.getAttribute("data-new"), null, "gone once opened");
  await open(page, "empty", "&tips=live");
  assert.equal(await page.locator("[data-oak-tools-trigger]").getAttribute("data-new"), null, "and it stays gone");
}));

test("D126-G4 each tool panel teaches itself once on first open", () => withPage(async page => {
  for (const [state, id] of [["role-fit", "role"], ["advice-intake", "advice"], ["contact-brief", "brief"], ["funding", "funding"], ["document-upload", "documents"], ["saved-list", "history"]]) {
    await open(page, state, "&tips=live");
    const tip = page.locator(`.oak-workflow .oak-tip[data-tip="${id}"]`);
    await tip.waitFor({ timeout: 3000 });
    assert.ok((await tip.innerText()).length > 20, `${state}: a short tip`);
    await tip.getByRole("button", { name: "Dismiss tip" }).click();
    await tip.waitFor({ state: "detached", timeout: 3000 });
    await open(page, state, "&tips=live");
    assert.equal(await page.locator(`.oak-tip[data-tip="${id}"]`).count(), 0, `${state}: once dismissed, gone for good`);
  }
}));

test("D126-G5 the design gallery shows no tips unless asked, so every other state stays as designed", () => withPage(async page => {
  for (const state of ["empty", "role-fit", "funding", "answer-points"]) {
    await open(page, state);
    assert.equal(await page.locator(".oak-tip").count(), 0, `${state}: no tip`);
    assert.equal(await page.locator("[data-oak-tools-trigger][data-new]").count(), 0, `${state}: no new mark`);
  }
  await open(page, "onboarding-tips");
  assert.equal(await page.locator('.oak-tip[data-tip="welcome"]').count(), 1, "the onboarding state shows the welcome tip");
}));
