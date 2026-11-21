import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { loadTsx } from "./load-tsx.mjs";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const open = async (page, state) => {
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
  await page.waitForTimeout(300);
};
const withPage = async run => {
  const browser = await chromium.launch();
  try {
    await run(await browser.newPage({ viewport: { width: 1280, height: 800 } }));
  } finally {
    await browser.close();
  }
};

test("D22-G1 (v3 review) current public research runs on its own and shows as a step in the trail, with no permission card", () => withPage(async page => {
  // Oak, 2026-10-18: never ask; call Exa and show it in the chain of thought. Only the topic's fixed query goes out.
  await open(page, "research-consent");
  assert.equal(await page.locator(".oak-research-consent").count(), 0, "no permission card");
  assert.equal(await page.getByRole("button", { name: /Allow this query/ }).count(), 0, "nothing to approve");
  assert.match(await page.locator("[data-slot='chain-of-thought']").first().innerText(), /Checking current public sources/, "the research step shows in the trail");
}));

test("D23-G1 a reopened saved conversation starts with a dated separator, and a fresh one does not", () => withPage(async page => {
  await open(page, "saved-reopened");
  const items = page.locator(".oak-conversation__content > [role=listitem]");
  assert.match(await items.first().innerText(), /^Saved conversation from Oct 10$/);
  assert.equal(await items.first().locator(".ui-marker--separator time").getAttribute("datetime"), "2026-10-10T17:20:00.000Z");
  await open(page, "answer-sourced");
  assert.equal(await page.locator(".oak-conversation__reopened").count(), 0);
}));

test("D24-G1 a ring beside Send shows answers left with exact counts in its tooltip, and nothing when the count is unknown", async () => {
  const { oakAllowanceSummary } = loadTsx("src/lib/oakAllowance.ts");
  const counts = (remaining, limit) => ({ completed: limit - remaining, pending: 0, limit, remaining });
  // ADR 0002: one refilling allowance for every visitor, plus a rolling 30-day cap.
  const status = (kind, configured, remaining = 3, window = counts(97, 100)) => ({ kind, configured, phase: "ready", role: "visitor", publishableKey: null, purpose: null,
    allowance: { answers: { limit: 6, remaining, refillsAt: null }, window } });
  assert.equal(oakAllowanceSummary(null), null, "unknown status shows nothing");
  assert.equal(oakAllowanceSummary({ kind: "account", configured: true }), null, "a status without counts shows nothing");
  assert.equal(oakAllowanceSummary(status("guest", false)).detail, "3 of 6 answers left.", "no sign-in offer, for guests or accounts");
  assert.deepEqual(oakAllowanceSummary(status("account", true, 4, counts(48, 100))),
    { remaining: 4, limit: 6, label: "of 6 answers left", detail: "4 of 6 answers left.",
      // Q09 (intentional update): a grant footnote only when grant codes added answers.
      // Q11 (intentional update): the popover's reset line says when the next answer comes back.
      reset: "One answer comes back every 4 hours.",
      note: "One answer comes back every 4 hours. Your OpenRouter account never uses them.", grant: "" });
  await withPage(async page => {
    await open(page, "allowance-guest");
    const meter = page.getByRole("button", { name: "Answers left: 3 of 6 answers left." });
    assert.equal(await meter.locator(":scope > span[aria-hidden]:not(.ui-meter-ring)").innerText(), "3", "the visible count");
    assert.equal(await meter.locator(".ui-meter-ring").evaluate(node => getComputedStyle(node).getPropertyValue("--ui-meter-fraction").trim()), "0.5");
    const send = page.getByRole("button", { name: "Send", exact: true });
    const [ring, button] = await Promise.all([meter.boundingBox(), send.boundingBox()]);
    // Review v6 (intentional update): answers left leads the meters group at the right, memory sits between it and Send.
    assert.ok(button.x - (ring.x + ring.width) < 120 && ring.x < button.x && Math.abs(ring.y + ring.height / 2 - (button.y + button.height / 2)) < 4, "the ring sits in the meters group beside Send");
    await meter.hover();
    // D92 replaced the one-line tooltip with the usage card, which carries the same exact counts.
    await page.locator(".oak-usage-card", { hasText: "of 6 answers left" }).waitFor({ timeout: 3000 });
    await open(page, "composing");
    assert.equal(await page.locator(".oak-composer__meter").count(), 0, "no status, no meter");
  });
});

test("D26-G1 in a real browser, every risen or popped element settles visible at full size", () => withPage(async page => {
  const settled = async (state, selector) => {
    await open(page, state);
    await page.waitForTimeout(500);
    const [opacity, transform] = await page.locator(selector).first().evaluate(node => [getComputedStyle(node).opacity, getComputedStyle(node).transform]);
    assert.equal(opacity, "1", `${state} ${selector} opacity`);
    assert.ok(transform === "none" || transform === "matrix(1, 0, 0, 1, 0, 0)", `${state} ${selector} ends at rest, not ${transform}`);
  };
  await settled("funding", ".oak-workflow");
  // v3 review (intentional update): follow-ups are the Related rows under the answer.
  await settled("follow-ups", ".oak-related");
  await settled("tool-running", ".oak-cot__pose");
  await settled("tool-running", ".oak-cot__node-glyph");
  await settled("tool-running", ".oak-cot__step");
}));
