import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

// R11 (Oak, review v8, gallery tools-menu and empty-learner): the composer's Tools menu holds only what shapes the next
// message, and everything about the visitor (who they are, saved chats, answers and the model, privacy, signing in or out)
// lives in one header menu. References: docs/planning/oak-ai-agent-2026-10-03/premium-round/evidence/r11-references.md.
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const open = async (page, state) => {
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
  await page.waitForTimeout(800);
};
const withPage = async (run, viewport = { width: 1280, height: 800 }) => {
  const browser = await chromium.launch();
  try { await run(await browser.newPage({ viewport })); } finally { await browser.close(); }
};
const accountMenu = page => page.locator("[role='menu'][aria-label='Account and settings']");
const groups = menu => menu.evaluate(node => [...node.querySelectorAll("[role='group']")].map(group => ({
  label: group.querySelector(".ui-menu__group-label")?.textContent.trim() ?? "",
  rows: [...group.querySelectorAll("[role='menuitem']")].map(row => row.querySelector(".oak-account-menu__label")?.textContent.trim()),
})));

test("R11-G1 Tools lists only the message modes, as short labels with no header and no hint lines", () => withPage(async page => {
  await open(page, "tools-menu");
  const menu = page.locator("[role='menu'][aria-label='Oak tools']");
  await menu.waitFor({ state: "visible" });
  const rows = await menu.getByRole("menuitem").evaluateAll(nodes => nodes.map(node => node.getAttribute("aria-label")));
  assert.deepEqual(rows, ["Compare a role", "Get project advice", "Prepare a contact brief"]);
  for (const gone of ["Documents", "Dictate a message", "Save and history", "Model funding"])
    assert.equal(await menu.getByRole("menuitem", { name: gone }).count(), 0, `${gone} is not in Tools`);
  assert.equal(await menu.locator(".oak-task-menu__hint, .oak-task-menu__header").count(), 0, "no hint lines or header");
  assert.doesNotMatch(await menu.innerText(), /Pick one/);
  // Attaching and dictating stay one click away, as their own composer buttons.
  assert.equal(await page.getByRole("button", { name: "Attach documents" }).count(), 1);
  assert.equal(await page.getByRole("button", { name: "Dictate a message" }).count(), 1);
}));

test("R11-G2 a guest's gear opens one grouped menu: who you are, then Chats, then Account with Sign in", () => withPage(async page => {
  await open(page, "account-menu");
  const trigger = page.locator("[data-oak-account-trigger]");
  // R12 (intentional update): a guest's trigger is a placeholder avatar, labelled for what it opens and who is signed in.
  // R13 (intentional update): a guest who can sign in reads Sign in on the trigger, so its name leads with it.
  assert.equal(await trigger.getAttribute("aria-label"), "Sign in, account and settings");
  assert.equal(await trigger.getAttribute("data-signed-in"), null);
  const menu = accountMenu(page);
  await menu.waitFor({ state: "visible" });
  assert.equal(await menu.locator(".oak-account-menu__name").innerText(), "Guest");
  const describedBy = await menu.getAttribute("aria-describedby");
  assert.match(await page.locator(`[id="${describedBy}"]`).innerText(), /Sign in to keep chats for 30 days/, "the identity line describes the menu");
  // R12 (intentional update): Sign in moved up to a pill under the guest's identity row, so Account holds Privacy alone.
  assert.deepEqual(await groups(menu), [
    { label: "Chats", rows: ["Saved chats", "Answers and model"] },
    { label: "Account", rows: ["Privacy"] },
  ]);
  assert.equal(await menu.locator(".oak-account-menu__signin").innerText(), "Sign in");
  assert.equal(await menu.getByRole("menuitem", { name: "Sign out" }).count(), 0);
}));

test("R11-G3 signed in, the trigger becomes an avatar and the menu reaches saved chats, answers and Sign out", () => withPage(async page => {
  await open(page, "account-menu-signed-in");
  const trigger = page.locator("[data-oak-account-trigger]");
  assert.equal(await trigger.getAttribute("aria-label"), "Account");
  // R12 (intentional update): the shared avatar replaces the initial, and the gallery state now carries a profile.
  assert.equal(await trigger.locator(".oak-avatar").count(), 1);
  const menu = accountMenu(page);
  await menu.waitFor({ state: "visible" });
  assert.equal(await menu.locator(".oak-account-menu__meta").getAttribute("title"), "maya.chen.recruiting-team@example.com", "identity on top");
  assert.deepEqual(await groups(menu), [
    { label: "Chats", rows: ["Saved chats", "Answers and model"] },
    { label: "Account", rows: ["Privacy", "Sign out"] },
  ]);
  assert.equal(await menu.locator(".oak-account-menu__trailing").innerText(), "4 left", "answers left beside the row");
  assert.equal(await menu.getByRole("menuitem", { name: "Sign in" }).count(), 0);
  // Concentric corners: the popup is the sheet step, its rows step in by its padding with the 16px floor.
  const radii = await menu.evaluate(node => {
    const style = getComputedStyle(node), row = node.querySelector("[role='menuitem']");
    return { popup: parseFloat(style.borderTopLeftRadius), pad: parseFloat(style.paddingTop), row: parseFloat(getComputedStyle(row).borderTopLeftRadius) };
  });
  assert.equal(radii.popup, 48); // R14 intentional update: menus are 48px frames like every popover (ticket 25)
  assert.equal(radii.row, Math.max(16, radii.popup - radii.pad));

  await menu.getByRole("menuitem", { name: "Saved chats" }).click();
  await page.getByRole("heading", { name: "Your conversation" }).waitFor({ timeout: 3000 });
  await trigger.click();
  await menu.getByRole("menuitem", { name: "Answers and model" }).click();
  await page.getByRole("heading", { name: "Model funding" }).waitFor({ timeout: 3000 });
}));

test("R11-G4 the account menu works from the keyboard and returns focus to its trigger", () => withPage(async page => {
  await open(page, "empty-learner");
  const trigger = page.locator("[data-oak-account-trigger]");
  await trigger.focus();
  await page.keyboard.press("Enter");
  const menu = accountMenu(page);
  await menu.waitFor({ state: "visible" });
  await page.keyboard.press("ArrowDown");
  await page.waitForFunction(() => document.activeElement?.getAttribute("role") === "menuitem", null, { timeout: 3000 });
  await page.keyboard.press("Escape");
  await menu.waitFor({ state: "hidden" });
  await page.waitForFunction(() => document.activeElement?.hasAttribute("data-oak-account-trigger"), null, { timeout: 3000 });
  assert.equal(await page.locator(".oak-workspace").count(), 1, "Escape closed only the menu");
}));

test("R11-G5 Tools and the account menu never stand open together", () => withPage(async page => {
  await open(page, "tools-menu");
  await page.locator("[data-oak-account-trigger]").click();
  await accountMenu(page).waitFor({ state: "visible" });
  await page.locator("[role='menu'][aria-label='Oak tools']").waitFor({ state: "detached", timeout: 2000 });
  assert.equal(await accountMenu(page).isVisible(), true, "the account menu stays open");
}));
