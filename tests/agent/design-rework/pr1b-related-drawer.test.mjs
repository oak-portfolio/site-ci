import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

// PR 1b: "Other ways to continue" under the one next-step card. Shipped by Oak's D3 yes (2026-11-04); its constant retired in ticket 38.
// The drawer is a Base UI Collapsible; PR gate 4 gives it its own Escape (G5, G6).
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const roleQuestion = "Is Steve a good fit for a Staff Design Engineer role?";
const noToolQuestion = "What did Steve ship?";
const open = async (page, state) => {
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 30000 });
  await page.waitForSelector(".oak-next-step, .oak-turn__footer", { timeout: 15000 });
  await page.waitForTimeout(600);
};
const askedText = (page, text) => page.evaluate(async value => {
  const url = performance.getEntriesByType("resource").map(entry => entry.name).find(name => /\/src\/lib\/oakWorkspace\.ts(\?|$)/.test(name));
  const workspace = await import(url);
  workspace.setOakWorkspaceFixture({ messages: workspace.getOakWorkspace().messages.map((message, index) => index === 0 ? { ...message, text: value } : message) });
}, text);
// Motion is allowed here on purpose: the drawer's height animates, and Tab must still skip it while it is closed.
const withPage = async run => {
  const browser = await chromium.launch();
  try { await run(await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: "no-preference" })); } finally { await browser.close(); }
};
const activeIn = (page, selector) => page.evaluate(sel => Boolean(document.activeElement?.closest(sel)), selector);

test("PR1b-G1 the drawer constant is retired (ticket 38): the drawer always ships, with no switch left", () => {
  const flags = readFileSync(new URL("../../../src/lib/oakChatFlags.ts", import.meta.url), "utf8");
  assert.doesNotMatch(flags, /oakRelatedDrawer/);
  assert.doesNotMatch(flags, /OPENUI_ANSWERS/, "it does not borrow the OpenUI answers switch");
});

test("PR1b-G2 constant off: a turn with a next step has no drawer and Related is the same section under the answer", { skip: "ticket 38 retired oakRelatedDrawer and its off state answer-next-step" }, () => withPage(async page => {
  await open(page, "answer-next-step");
  assert.equal(await page.locator(".oak-next-step").count(), 1, "the next-step card shows");
  assert.equal(await page.locator(".oak-other-ways").count(), 0, "no drawer");
  const footer = page.locator(".oak-turn__footer").last();
  assert.equal(await footer.locator(":scope > .oak-related__title").count(), 1, "the Related title still leads the action row");
  const rows = page.locator(".oak-related.oak-related--rows").last();
  assert.equal(await rows.getAttribute("aria-labelledby"), await footer.locator(":scope > .oak-related__title").getAttribute("id"));
  assert.equal(await rows.locator('[aria-label="Follow-up questions"]').count(), 1);
  assert.ok(await rows.locator(".ui-suggestion").first().isVisible(), "the rows are visible without opening anything");
}));

test("PR1b-G3 constant on: the whole Related section sits in a closed drawer that Tab skips, and Space or Enter toggles it from its trigger", () => withPage(async page => {
  await open(page, "answer-next-step-drawer");
  const drawer = page.locator(".oak-other-ways");
  const trigger = drawer.getByRole("button", { name: "Other ways to continue" });
  assert.equal(await page.locator(".oak-next-step").count(), 1, "still one next-step card");
  assert.equal(await trigger.getAttribute("aria-expanded"), "false", "closed by default");
  const kept = [".oak-related", ".oak-related.oak-related--rows", ".oak-related__title", '[aria-label="Follow-up questions"]'];
  for (const selector of kept) assert.equal(await drawer.locator(selector).count(), 1, `${selector} lives inside the drawer`);
  assert.equal(await page.locator(".oak-related__title").count(), 1, "one Related title in the turn, none left in the action row");
  assert.equal(await page.locator(".oak-turn__footer > .oak-related__title").count(), 0, "the action row lost its Related title");
  assert.equal(await drawer.locator(".ui-suggestion").first().isVisible(), false, "closed content is not visible");
  assert.equal(await page.locator(".oak-related").first().evaluate(node => Boolean(node.closest("[hidden]"))), true, "closed content is hidden, so not focusable");
  // No confidence meter anywhere in the turn.
  assert.equal(await page.locator(".oak-turn__answer [role='meter'], .oak-turn__answer .ui-meter").count(), 0);

  await page.locator(".oak-next-step").focus();
  await page.keyboard.press("Tab");
  assert.equal(await activeIn(page, ".oak-other-ways__trigger"), true, "Tab goes from the card to the drawer trigger");
  await page.keyboard.press("Tab");
  assert.equal(await activeIn(page, ".oak-other-ways"), false, "Tab skips the closed content");
  assert.equal(await activeIn(page, ".oak-related"), false);

  await trigger.focus();
  await page.keyboard.press("Enter");
  assert.equal(await trigger.getAttribute("aria-expanded"), "true", "Enter opens it");
  await page.waitForFunction(() => { const row = document.querySelector(".oak-other-ways .ui-suggestion"); return row && row.getBoundingClientRect().height > 20; });
  assert.equal(await drawer.locator(".ui-suggestion").first().isVisible(), true);
  await page.keyboard.press("Tab");
  assert.equal(await activeIn(page, ".oak-related .ui-suggestion"), true, "open, Tab reaches the first follow-up");
  await page.keyboard.press("Shift+Tab");
  assert.equal(await activeIn(page, ".oak-other-ways__trigger"), true);
  // Escape is covered by PR1b-G5 and G6.
  await page.keyboard.press("Space");
  assert.equal(await trigger.getAttribute("aria-expanded"), "false", "Space closes it again");
  await page.waitForFunction(() => document.querySelector(".oak-related")?.closest("[hidden]"));
  await page.keyboard.press("Tab");
  assert.equal(await activeIn(page, ".oak-other-ways"), false, "closed again, Tab skips it");
}));

test("PR1b-G4 constant on but no next step: Related stays where it was, with no drawer", () => withPage(async page => {
  await open(page, "answer-next-step-drawer");
  await askedText(page, noToolQuestion);
  await page.waitForFunction(() => !document.querySelector(".oak-next-step"));
  await page.waitForTimeout(600);
  assert.equal(await page.locator(".oak-other-ways").count(), 0, "no drawer without a next step");
  assert.equal(await page.locator(".oak-turn__footer > .oak-related__title").count(), 1);
  assert.equal(await page.locator(".oak-related.oak-related--rows").last().locator(".ui-suggestion").first().isVisible(), true);
  void roleQuestion;
}));

const chatOpen = page => page.evaluate(() => Boolean(document.querySelector(".oak-workspace")));
const settle = (page, open) => page.waitForFunction(isOpen => {
  const row = document.querySelector(".oak-other-ways .ui-suggestion");
  return isOpen ? row && row.getBoundingClientRect().height > 20 : document.querySelector(".oak-related")?.closest("[hidden]");
}, open);

test("PR1b-G5 PR gate 4: Escape in the open drawer collapses it, returns focus to its trigger and keeps the chat open; a second Escape is main's", () => withPage(async page => {
  await open(page, "answer-next-step-drawer");
  const trigger = page.locator(".oak-other-ways__trigger");
  await trigger.focus();
  await page.keyboard.press("Enter");
  await settle(page, true);
  // From the first follow-up inside the open drawer.
  await page.keyboard.press("Tab");
  assert.equal(await activeIn(page, ".oak-related .ui-suggestion"), true);
  await page.keyboard.press("Escape");
  assert.equal(await trigger.getAttribute("aria-expanded"), "false", "Escape collapses the drawer");
  assert.equal(await activeIn(page, ".oak-other-ways__trigger"), true, "focus returns to the trigger");
  assert.equal(await chatOpen(page), true, "the chat stays open");
  await settle(page, false);
  // On the trigger while open: the same.
  await page.keyboard.press("Enter");
  await settle(page, true);
  await page.keyboard.press("Escape");
  assert.equal(await trigger.getAttribute("aria-expanded"), "false", "Escape on the open trigger collapses it too");
  assert.equal(await chatOpen(page), true);
  // The second Escape behaves as main does: it closes the chat.
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".oak-workspace"), null, { timeout: 5000 });
}));

test("PR1b-G6 PR gate 4: with the drawer closed, Escape does what it does on main and closes the chat", () => withPage(async page => {
  await open(page, "answer-next-step-drawer");
  await page.locator(".oak-other-ways__trigger").focus();
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector(".oak-workspace"), null, { timeout: 5000 });
}));

test("PR1b-G7 PR gate 4: in an arranged answer the follow-up pills portal into the drawer, and Escape on one still collapses the drawer only", () => withPage(async page => {
  await open(page, "answer-openui-next-step-drawer");
  await page.waitForSelector(".oak-other-ways .ui-suggestion", { state: "attached", timeout: 15000 });
  await page.waitForTimeout(600);
  const trigger = page.locator(".oak-other-ways__trigger");
  assert.equal(await page.locator(".oak-other-ways").getByText("What did EcoSmartLoop ship?").count(), 1, "the arranged answer's own pills are in the drawer");
  await trigger.focus();
  await page.keyboard.press("Enter");
  await settle(page, true);
  await page.keyboard.press("Tab");
  assert.equal(await activeIn(page, ".oak-related .ui-suggestion"), true, "focus is on a pill inside the open drawer");
  await page.keyboard.press("Escape");
  assert.equal(await trigger.getAttribute("aria-expanded"), "false", "Escape collapses the drawer");
  assert.equal(await activeIn(page, ".oak-other-ways__trigger"), true, "focus returns to the trigger");
  assert.equal(await chatOpen(page), true, "the chat stays open");
}));
