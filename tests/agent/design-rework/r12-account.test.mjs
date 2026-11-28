import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

// R12 (Oak, review v9, gallery empty and empty-recruiter): signed in feels like a member (own photo, name, Member pill,
// greeted by first name); signed out shows a placeholder avatar and one quiet, dismissible nudge to sign in.
// References: docs/planning/oak-ai-agent-2026-10-03/premium-round/evidence/r12-references.md ("Account and profile").
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
const kinds = locator => locator.evaluateAll(nodes => nodes.map(node => node.dataset.kind));

test("R12-G1 signed in with a provider photo: the photo shows on the trigger, the menu and the greeting", () => withPage(async page => {
  await open(page, "account-menu-signed-in");
  const trigger = page.locator("[data-oak-account-trigger]");
  assert.deepEqual(await kinds(trigger.locator(".oak-avatar")), ["photo"]);
  const photo = trigger.locator(".oak-avatar img");
  assert.equal(await photo.getAttribute("alt"), "", "the photo is decorative inside a labelled button");
  assert.equal(await photo.getAttribute("referrerpolicy"), "no-referrer");
  assert.ok(await photo.evaluate(img => img.complete && img.naturalWidth > 0), "the photo loaded");
  assert.equal(await trigger.getAttribute("aria-label"), "Account");
  const menu = accountMenu(page);
  await menu.waitFor({ state: "visible" });
  assert.deepEqual(await kinds(menu.locator(".oak-account-menu__identity .oak-avatar")), ["photo"]);
  assert.equal(await menu.locator(".oak-account-menu__name").innerText(), "Maya Chen");
  // R13 (intentional update, Oak v10: "member copy is not right for our case"): the row says what signing in gives.
  assert.equal(await menu.locator(".oak-account-menu__badge").count(), 0, "no Member pill");
  assert.equal(await menu.locator(".oak-account-menu__perk").innerText(), "Save chats for 30 days");
  // R13: a signed-in avatar wears the launcher gradient as its ring, in the header and the menu.
  for (const where of [trigger, menu.locator(".oak-account-menu__identity")])
    assert.match(await where.locator(".oak-avatar").evaluate(node => getComputedStyle(node).backgroundImage), /linear-gradient.*linear-gradient/);
  // 205 (carried-lows-205.test.mjs): a long email wraps whole, with nothing clipped and no end ellipsis.
  const meta = menu.locator(".oak-account-menu__meta");
  assert.ok(await meta.evaluate(node => node.scrollWidth <= node.clientWidth + 1 && getComputedStyle(node).textOverflow !== "ellipsis"));
  assert.equal(await menu.locator(".oak-account-menu__signin").count(), 0, "no sign-in pill once signed in");
  // The discs are pills.
  const radius = selector => menu.locator(selector).first().evaluate(node => parseFloat(getComputedStyle(node).borderTopLeftRadius) >= node.getBoundingClientRect().height / 2);
  assert.ok(await radius(".oak-avatar"));
}));

test("R12-G2 signed in without a photo, or when it fails to load, shows initials on a tinted disc", () => withPage(async page => {
  await open(page, "account-menu-signed-in-initials");
  const trigger = page.locator("[data-oak-account-trigger] .oak-avatar");
  await page.waitForFunction(() => document.querySelector("[data-oak-account-trigger] .oak-avatar")?.dataset.kind === "initials", null, { timeout: 3000 });
  assert.equal(await trigger.innerText(), "JE");
  assert.ok(await trigger.getAttribute("data-tone"), "initials sit on a tint");
  // R13 (intentional update): the greeting no longer carries an avatar; the header's ringed initials are the one mark.
  await open(page, "empty-recruiter-initials");
  assert.deepEqual(await kinds(page.locator("[data-oak-account-trigger] .oak-avatar")), ["initials"]);
  assert.equal(await page.locator("[data-oak-account-trigger] .oak-avatar").getAttribute("data-ring"), "");
}));

// R13 (intentional update, Oak v10: the Signed in badge is "redundant"): the greeting is the first name alone; the header
// photo with its ring already says who is signed in.
test("R13-G3 the signed-in greeting is the first name alone, with no Signed in badge", () => withPage(async page => {
  for (const state of ["empty-recruiter", "empty-learner", "empty-collaborator", "empty-recruiter-initials"]) {
    await open(page, state);
    const hello = page.locator(".oak-conversation__hello");
    assert.match(await hello.innerText(), /^(Good (morning|afternoon|evening)|Hello)(, \w+)?$/, `${state}: one quiet line`);
    assert.equal(await page.locator(".oak-conversation__signed-in, .oak-signin-nudge").count(), 0, `${state}: no badge, no nudge`);
  }
}));

test("R12-G4 a guest sees a placeholder avatar and the menu invites signing in with a pill", () => withPage(async page => {
  await open(page, "account-menu");
  assert.deepEqual(await kinds(page.locator("[data-oak-account-trigger] .oak-avatar")), ["guest"]);
  const menu = accountMenu(page);
  await menu.waitFor({ state: "visible" });
  assert.deepEqual(await kinds(menu.locator(".oak-account-menu__identity .oak-avatar")), ["guest"]);
  assert.match(await menu.locator(".oak-account-menu__meta").innerText(), /Sign in to keep chats for 30 days/);
  const pill = menu.locator(".oak-account-menu__signin");
  assert.equal(await pill.getAttribute("role"), "menuitem");
  assert.ok(await pill.evaluate(node => parseFloat(getComputedStyle(node).borderTopLeftRadius) >= node.getBoundingClientRect().height / 2), "Sign in is a pill");
  // It is the first stop from the keyboard: opening the menu with Enter lands on Sign in.
  await page.keyboard.press("Escape");
  await menu.waitFor({ state: "hidden" });
  await page.locator("[data-oak-account-trigger]").focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.activeElement?.classList.contains("oak-account-menu__signin"), null, { timeout: 3000 });
}));

// R13 (intentional update, Oak v10: the nudge "feels slop"): a guest is invited once, on the header trigger, where ChatGPT
// and Claude put Log in; the empty state holds only the greeting, the starters and the composer.
test("R13-G5 a guest sees Sign in on the header trigger and no nudge in the empty state", () => withPage(async page => {
  await open(page, "empty");
  assert.equal(await page.locator(".oak-signin-nudge").count(), 0);
  const trigger = page.locator("[data-oak-account-trigger]");
  assert.equal(await trigger.locator(".oak-account-trigger__label").innerText(), "Sign in");
  const name = await trigger.getAttribute("aria-label");
  assert.ok(name.startsWith("Sign in"), `the visible word leads the name (${name})`);
  assert.ok(await trigger.evaluate(node => parseFloat(getComputedStyle(node).borderTopLeftRadius) >= node.getBoundingClientRect().height / 2), "a pill");
  assert.equal(await trigger.locator(".oak-avatar").getAttribute("data-ring"), null, "a guest's face has no ring");
}));

test("R12-G6 the profile stays in the browser: identity is display-only and never reaches a request", () => {
  const client = readFileSync(new URL("../../../src/lib/oakAccountClient.ts", import.meta.url), "utf8");
  const identity = client.slice(client.indexOf("export type OakAccountIdentity"), client.indexOf("export function setOakAccountIdentityFixture"));
  assert.doesNotMatch(identity, /fetch|console\.|localStorage|authRequest/, "identity is read, not sent, stored or logged");
  assert.match(identity, /hasImage/, "only a real provider photo is used");
  for (const file of ["src/lib/oakWorkspace.ts", "src/lib/oakSavedHistoryClient.ts", "packages/oak-agent-contracts/src/transport.ts"])
    assert.doesNotMatch(readFileSync(new URL(`../../../${file}`, import.meta.url), "utf8"), /getOakAccountIdentity|imageUrl/, `${file} never reads the profile`);
});
