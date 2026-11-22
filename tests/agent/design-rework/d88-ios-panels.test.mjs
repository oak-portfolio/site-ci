import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const open = async (page, state, settle = 400) => {
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
  await page.waitForTimeout(settle);
};
const alpha = color => { const match = color.match(/rgba?\(([^)]+)\)/); if (!match) return 1; const parts = match[1].split(/[ ,/]+/).filter(Boolean); return parts.length > 3 ? Number(parts[3]) : 1; };
const nav = page => page.locator(".oak-workflow .oak-panel-nav").evaluate(node => {
  const style = getComputedStyle(node);
  return { background: style.backgroundColor, filter: style.backdropFilter, scrolled: node.hasAttribute("data-scrolled") };
});

test("D88-G1 over the translucent workspace the panel bar is clear at the top and frosts once content scrolls under it", async () => {
  const browser = await chromium.launch();
  try {
    // A laptop-height window, so both panels run longer than the reading area.
    // Review v5: Full gives the panel the whole screen height, so a shorter laptop screen keeps both panels scrolling.
    const page = await browser.newPage({ viewport: { width: 1440, height: 700 } });
    for (const state of ["contact-brief", "role-fit"]) {
      await open(page, state);
      const workspace = await page.locator(".oak-workspace").evaluate(node => getComputedStyle(node).backgroundColor);
      assert.ok(alpha(workspace) < 1, `${state}: the workspace is translucent (${workspace})`);
      const rest = await nav(page);
      assert.equal(alpha(rest.background), 0, `${state}: no bar background at the top (${rest.background})`);
      assert.equal(rest.filter, "none", `${state}: no frost at the top`);
      const reading = page.locator(".oak-workspace__reading");
      assert.ok(await reading.evaluate(node => node.scrollHeight > node.clientHeight + 40), `${state}: the panel is long enough to scroll`);
      await reading.evaluate(node => node.scrollTo(0, node.scrollHeight));
      await page.waitForTimeout(350);
      const frosted = await nav(page);
      // Review v6 (intentional update): the frost is a full-width soft veil behind the bar, not a background on the bar itself.
      const veil = await page.locator(".oak-panel-nav").first().evaluate(node => { const style = getComputedStyle(node, "::before"); return { opacity: style.opacity, filter: style.backdropFilter }; });
      assert.ok(frosted.scrolled && veil.opacity === "1", `${state}: the veil shows once content is under it (${veil.opacity})`);
      assert.match(veil.filter, /blur\(16px\)/, `${state}: and frosts (${veil.filter})`);
      await reading.evaluate(node => node.scrollTo(0, 0));
      await page.waitForTimeout(350);
      assert.equal(await page.locator(".oak-panel-nav").first().evaluate(node => getComputedStyle(node, "::before").opacity), "0", `${state}: back at the top it clears again`);
    }
  } finally {
    await browser.close();
  }
});

// Records the hero's opacity and transform on every frame from the moment it mounts.
const recordHero = () => {
  window.__heroFrames = [];
  const sample = () => {
    const hero = document.querySelector(".oak-panel-hero");
    if (hero) { const style = getComputedStyle(hero); window.__heroFrames.push({ opacity: Number(style.opacity), transform: style.transform }); }
    if (window.__heroFrames.length < 40) requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
};

test("D88-G2 each workflow panel's picture is a 96px+ hero on a ground tinted to its meaning, with no dark tile, settling in with motion", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const grounds = new Map();
    for (const state of ["contact-brief", "question-draft", "role-fit", "advice-intake", "funding", "document-upload", "saved-list", "voice-off"]) {
      await open(page, state, 700);
      const hero = await page.locator(".oak-workflow .oak-panel-hero").evaluate(node => {
        const style = getComputedStyle(node), frame = node.querySelector(".oak-activity-sprite__frame")?.getBoundingClientRect();
        return { width: Math.round(node.getBoundingClientRect().width), art: Math.round(frame?.width ?? 0), tone: node.dataset.tone, border: style.borderTopWidth,
          fill: style.backgroundColor, ground: style.backgroundImage, radius: style.borderTopLeftRadius };
      });
      assert.ok(hero.width >= 96 && hero.art >= 96, `${state}: the hero and its art are at least 96px (${hero.width}, ${hero.art})`);
      assert.equal(hero.border, "0px", `${state}: no tile edge`);
      assert.equal(alpha(hero.fill), 0, `${state}: no dark tile fill (${hero.fill})`);
      assert.match(hero.ground, /^radial-gradient/, `${state}: a soft round ground`);
      assert.ok(hero.tone, `${state}: the ground carries a meaning tone`);
      grounds.set(hero.tone, hero.ground);
    }
    assert.ok(grounds.size >= 4, `grounds differ by meaning (${[...grounds.keys()]})`);

    await page.addInitScript(recordHero);
    await open(page, "advice-intake", 900);
    const frames = await page.evaluate(() => window.__heroFrames);
    assert.ok(frames.some(frame => frame.opacity < 0.95 || frame.transform !== "none"), "the hero settles in over several frames");
    assert.equal(frames.at(-1).opacity, 1, "and comes to rest");

    const still = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    await still.addInitScript(recordHero);
    await open(still, "advice-intake", 900);
    const stillFrames = await still.evaluate(() => window.__heroFrames);
    // Q10 (intentional update): reduced motion keeps fades only, so the hero may fade but never moves or scales.
    assert.ok(stillFrames.length && stillFrames.every(frame => frame.transform === "none") && stillFrames.at(-1).opacity === 1, "reduced motion: the hero fades in place, no movement");
  } finally {
    await browser.close();
  }
});
