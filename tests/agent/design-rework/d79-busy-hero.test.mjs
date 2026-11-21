import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const open = async (page, state) => {
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
  await page.waitForTimeout(300);
};
const hero = page => page.locator(".oak-panel-hero").evaluate(node => {
  const style = getComputedStyle(node);
  // Review v5 supersedes: at full screen the ring is a masked ::after edge, so it is read from either layer.
  const ring = style.backgroundImage.includes("conic-gradient") || getComputedStyle(node, "::after").backgroundImage.includes("conic-gradient");
  return { busy: node.hasAttribute("data-busy"), ring, turning: style.animationName, art: !!node.querySelector("img") };
});

test("D79-G1 while Oak works for a panel its picture wears the turning Oak ring; at rest, and under reduced motion, it does not turn", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    for (const state of ["voice-transcribing", "document-parsing", "saved-loading"]) {
      await open(page, state);
      const busy = await hero(page);
      assert.ok(busy.busy && busy.ring && busy.art, `${state}: the picture wears the Oak ring (${JSON.stringify(busy)})`);
      assert.equal(busy.turning, "oak-launcher-turn", `${state}: the ring turns`);
    }
    for (const state of ["voice-review", "document-selected", "saved-list"]) {
      await open(page, state);
      const rest = await hero(page);
      assert.ok(!rest.busy && !rest.ring, `${state}: a panel at rest keeps the plain tile`);
    }
    const still = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    await open(still, "voice-transcribing");
    const reduced = await hero(still);
    assert.ok(reduced.ring && reduced.turning === "none", "reduced motion: the ring shows but does not turn");
  } finally {
    await browser.close();
  }
});

test("D80-G1 secondary, ghost and icon buttons press in; the working label glints in a narrow band", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await open(page, "failed");
    // Press and hold the stopped card's Retry (secondary) and a header icon button (ghost icon).
    const pressed = async selector => {
      const target = page.locator(selector).first();
      const box = await target.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(260);
      const scale = await target.evaluate(node => getComputedStyle(node).scale);
      await page.mouse.up();
      return scale;
    };
    const near = (scale, target, message) => assert.ok(Math.abs(Number(scale) - target) <= 0.01, `${message} (got ${scale})`);
    near(await pressed(".oak-turn__stopped .ui-button--secondary"), 0.96, "a secondary button presses to 0.96");
    near(await pressed(".oak-workspace__header .ui-button--icon"), 0.94, "an icon button presses to 0.94");
    const still = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    await open(still, "failed");
    const target = still.locator(".oak-workspace__header .ui-button--icon").first(), box = await target.boundingBox();
    await still.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await still.mouse.down();
    await still.waitForTimeout(200);
    assert.equal(await target.evaluate(node => getComputedStyle(node).scale), "none", "reduced motion: no press");
    await still.mouse.up();
    await open(page, "thinking");
    const shimmer = await page.locator(".oak-turn__shimmer").first().evaluate(node => ({ image: getComputedStyle(node).backgroundImage, duration: getComputedStyle(node).animationDuration }));
    assert.match(shimmer.image, /35%.*50%.*65%/, "the glint is a narrow band");
    assert.equal(shimmer.duration, "1.8s");
  } finally {
    await browser.close();
  }
});
