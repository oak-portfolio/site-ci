import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const open = async (page, state) => {
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
  await page.waitForTimeout(300);
};
const card = page => page.evaluate(() => {
  // R17: the one meter's card holds answers, then memory; this reads its answers section.
  const outer = document.querySelector(".oak-usage-card");
  if (!outer || getComputedStyle(outer).opacity === "0") return null;
  const node = outer.querySelector('.oak-usage-card__section[aria-label="Answers left"]');
  if (!node) return null;
  const meter = node.querySelector('[role="meter"]'), track = node.querySelector(".ui-meter-bar__track").getBoundingClientRect(), fill = node.querySelector(".ui-meter-bar__indicator").getBoundingClientRect();
  return { count: node.querySelector(".oak-usage-card__count strong").textContent, label: node.querySelector(".oak-usage-card__count span").textContent,
    fill: fill.width / track.width, expected: Number(meter.getAttribute("aria-valuenow")) / Number(meter.getAttribute("aria-valuemax")),
    fillColor: getComputedStyle(node.querySelector(".ui-meter-bar__indicator")).backgroundColor, lines: node.querySelectorAll("p").length, action: node.querySelector(".ui-button")?.textContent ?? null };
});

test("D92-G1 hovering or focusing the answers-left ring opens a usage card with the count, a remaining bar and what happens next", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await open(page, "allowance-guest");
    const ring = page.getByRole("button", { name: "Answers left: 3 of 6 answers left." });
    assert.equal(await ring.count(), 1, "the ring keeps its accessible name");
    assert.equal(await card(page), null, "the card waits to be asked for");

    await ring.hover();
    await page.locator(".oak-usage-card").waitFor({ timeout: 2000 });
    await page.waitForTimeout(300);
    const shown = await card(page);
    assert.deepEqual([shown.count, shown.label], ["3", "of 6 answers left"], "the big count reads against the limit, said once");
    // Q11 (intentional update): the second line is when the next answer comes back, not a repeat of the count.
    assert.equal(shown.lines, 2, "the count, then the reset line");
    assert.equal(shown.expected, 0.5, "remaining over limit");
    assert.ok(Math.abs(shown.fill - shown.expected) < 0.02, `the bar's fill matches remaining over limit (${shown.fill})`);
    assert.notEqual(shown.fillColor, "rgba(0, 0, 0, 0)", `the bar's fill is painted (${shown.fillColor})`);
    // ADR 0002: signing in adds saved chats, not answers, so the card offers no sign-in.
    // Q11 (intentional update): it offers Ask Steve, a grant code and the visitor's OpenRouter account instead.
    assert.doesNotMatch(shown.action ?? "", /sign in/i, "no way to more answers through sign-in");

    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    assert.equal(await page.locator(".oak-usage-card").count(), 0, "Escape closes it");
    assert.equal(await page.locator(".oak-workspace").count(), 1, "and only the card: the workspace stays open");

    await page.mouse.move(100, 100);
    await ring.hover();
    await page.locator(".oak-usage-card").waitFor({ timeout: 2000 });
    await page.mouse.move(100, 100);
    await page.waitForTimeout(700);
    assert.equal(await page.locator(".oak-usage-card").count(), 0, "moving away closes it");

    // A keyboard visitor tabs from Dictate onto the ring. Q11 (intentional update): Enter opens the popover in place.
    await page.getByRole("button", { name: "Dictate a message" }).focus();
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement?.classList.contains("oak-composer__meter")), true, "Tab reaches the one meter");
    await page.keyboard.press("Enter");
    // Under a loaded suite the card mounts at opacity 0 and its answers section can trail 300 ms; wait until card() can read it.
    await page.waitForFunction(() => { const outer = document.querySelector(".oak-usage-card");
      return !!outer && getComputedStyle(outer).opacity !== "0" && !!outer.querySelector('.oak-usage-card__section[aria-label="Answers left"] .oak-usage-card__count strong'); }, null, { timeout: 5000 });
    assert.equal((await card(page))?.count, "3", "keyboard focus opens it too");
    await page.keyboard.press("Escape");
    // The card closes with its exit motion, which takes longer than 400 ms when the suite runs four browsers at once.
    await page.locator(".oak-usage-card").waitFor({ state: "detached", timeout: 3000 }).catch(() => {});
    assert.equal(await page.locator(".oak-usage-card").count(), 0, "and Escape closes it from the keyboard");

  } finally {
    await browser.close();
  }
});

test("D92-G1 the usage card offers no Sign in for more, since signing in adds saved chats, not answers (ADR 0002)", () => {
  const composer = readFileSync("src/components/agent/OakComposer.tsx", "utf8");
  assert.doesNotMatch(composer, /Sign in for more|canSignIn/);
});
