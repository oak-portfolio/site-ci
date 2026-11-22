import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const map = JSON.parse(readFileSync("design/visual-integration/oak-agent-assets-v2.json", "utf8"));
const gallery = new Set(JSON.parse(readFileSync("src/data/dev/oak-states.json", "utf8")).map(state => state.id));
const open = async (page, state) => {
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
  await page.waitForTimeout(300);
};
const withPage = async (run, options = {}) => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...options });
    await run(await context.newPage());
  } finally {
    await browser.close();
  }
};

// v3 review (Oak, 2026-10-18): one Oak per turn. Where the reasoning trail already shows him, the answer's eyebrow and
// the Related title keep their glyph, and research no longer has a consent card, so these mapped poses rest here.
const oneOakPerTurn = new Set(["answer-gap", "answer-document", "follow-ups", "research-consent"]);
// Review v4 supersedes D20 for sign-in being off: it is one compact inline notice with a small icon tile, no mascot.
const compactNotice = new Set(["sign-in-unavailable"]);
test("D20-G2 every state mapped to art renders that art", () => withPage(async page => {
  const missing = [];
  for (const [state, entry] of Object.entries(map.states)) {
    if (!entry.asset || !gallery.has(state) || oneOakPerTurn.has(state) || compactNotice.has(state)) continue;
    await open(page, state);
    const pose = map.assets[entry.asset].pose;
    if (!await page.locator(`[data-pose="${pose}"]`).count()) missing.push(`${state}:${pose}`);
  }
  assert.deepEqual(missing, []);
  for (const state of compactNotice) {
    await open(page, state);
    assert.equal(await page.locator(".oak-account-notice .oak-account-notice__tile svg").count(), 1, `${state}: the notice leads with a small icon tile`);
    assert.equal(await page.locator(".oak-account-notice [data-pose]").count(), 0, `${state}: the notice carries no mascot art`);
  }
}));

test("D20-G2 toast, citation, document and privacy moments render their art", () => withPage(async page => {
  await open(page, "answer-sourced");
  await page.getByRole("button", { name: "Copy answer" }).click();
  await page.locator('.ui-toast [data-pose="thumbs-up"]').waitFor({ timeout: 3000 });
  // D122, v3 review (intentional update): a lone portfolio source with a cover shows that cover in its chip's popover.
  const chip = page.locator(".oak-turn__answer .oak-source-chip__trigger").first();
  await chip.scrollIntoViewIfNeeded();
  await chip.hover();
  await page.locator('.oak-source-popover :is(img.oak-source-popover__cover, [data-pose="source-case-study"])').first().waitFor({ timeout: 3000 });
  await open(page, "document-selected");
  assert.ok(await page.locator('.ui-attachment__media [data-pose^="doc-"]').count() > 0, "document rows show their file-type art");
  assert.equal(await page.locator('.ui-disclosure__summary [data-pose="shield"]').count(), 1, "the privacy notice carries the shield");
  const source = readFileSync("src/lib/oakToasts.ts", "utf8");
  for (const pose of ["thumbs-up", "sent", "chest-locked", "swept", "carrying", "bookmark", "welcome"]) {
    assert.match(source, new RegExp(`pose: "${pose}"`), `a toast uses ${pose}`);
    assert.ok(Object.values(map.assets).some(asset => asset.pose === pose), `${pose} is registered`);
  }
}, { permissions: ["clipboard-read", "clipboard-write"] }));

test("D20-G2 new loops have a reduced-motion still that the browser selects", () => withPage(async page => {
  for (const [id, asset] of Object.entries(map.assets).filter(([, asset]) => asset.animated && asset.source.includes("-v3"))) {
    assert.ok(asset.reducedMotionFrame?.source.endsWith("-still.png"), id);
  }
  await open(page, "saved-loading");
  const sprite = page.locator('[data-pose="hourglass"]');
  assert.equal(await sprite.getAttribute("data-layout"), "animated");
  assert.equal(await sprite.locator('source[media="(prefers-reduced-motion: reduce)"]').count(), 3);
  assert.match(await sprite.locator("img").evaluate(img => img.currentSrc), /hourglass-v3-still/);
}, { reducedMotion: "reduce" }));
