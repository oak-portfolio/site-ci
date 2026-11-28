import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

// Review v7 (Oak, 2026-10-20): tooltips, the reasoning ring, the full-window glow, concentric corners, the document answer
// and the grant result. Each check reads the rendered gallery, so a later CSS rule cannot quietly undo the fix.
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

test("Q24-G16 a tooltip sentence wraps inside a rounded card and a short label stays a capsule", () => withPage(async page => {
  await open(page, "answer-sourced");
  const sizes = await page.evaluate(() => {
    const make = text => { const node = document.createElement("div"); node.className = "ui-tooltip-content"; node.textContent = text;
      node.style.position = "fixed"; node.style.left = "0"; node.style.top = "0"; document.body.append(node);
      const r = node.getBoundingClientRect(); const radius = parseFloat(getComputedStyle(node).borderTopLeftRadius); node.remove();
      return { width: r.width, height: r.height, radius }; };
    return { short: make("New chat"), long: make("Oak remembers the last few messages of this conversation and forgets the rest when it runs long.") };
  });
  assert.ok(sizes.long.width <= 281, `a sentence stays within 280px (got ${sizes.long.width})`);
  assert.ok(sizes.long.height > sizes.short.height * 1.5, "the sentence wraps onto more lines");
  assert.ok(sizes.long.radius >= 12 && sizes.long.radius < sizes.long.height / 2, "a wrapped sentence is a rounded card");
  assert.ok(sizes.short.radius >= sizes.short.height / 2 - 1, "a one-line label is still a capsule");
}));

test("Q24-G16 the reasoning panel clips with room for the running node's ring", () => withPage(async page => {
  await open(page, "reasoning-thoughts");
  const style = await page.locator(".ui-chain-of-thought__content").first().evaluate(node => {
    const s = getComputedStyle(node); return { overflow: s.overflowY, margin: parseFloat(s.overflowClipMargin) || 0 };
  });
  assert.equal(style.overflow, "clip");
  assert.ok(style.margin >= 20, `clip margin ${style.margin}px holds the 20px ring`);
}));

test("Q24-G16 Full settles into two coloured glows from below over a dark top", () => withPage(async page => {
  await open(page, "answer-sourced");
  const image = await page.locator('.oak-workspace[data-full-screen="true"]').evaluate(node => getComputedStyle(node).backgroundImage);
  assert.ok((image.match(/radial-gradient/g) ?? []).length >= 2, "at least two radial glows");
  assert.match(image, /linear-gradient/, "the dark top stays");
}, { width: 1440, height: 900 }));

test("Q24-G16 each document quote is its own rounded well with air between", () => withPage(async page => {
  await open(page, "answer-document");
  const quotes = await page.locator(".oak-document-answer__quote").evaluateAll(nodes => nodes.map(node => ({
    radius: parseFloat(getComputedStyle(node).borderTopLeftRadius), top: node.getBoundingClientRect().top, bottom: node.getBoundingClientRect().bottom })));
  assert.ok(quotes.length >= 2, "the gallery answer quotes at least two passages");
  for (const quote of quotes) assert.ok(quote.radius >= 12, `quote radius ${quote.radius}`);
  for (let i = 1; i < quotes.length; i += 1) assert.ok(quotes[i].top - quotes[i - 1].bottom >= 8, "a gap between wells");
  assert.match(await page.locator(".oak-document-answer__meta").first().innerText(), /% of your selection quoted/);
}));

test("Q24-G16 a grant result is a framed card on the radius scale", () => withPage(async page => {
  for (const state of ["grant-redeemed", "grant-invalid"]) {
    await open(page, state);
    const box = await page.locator(".oak-funding__paste .oak-grant__result").first().evaluate(node => {
      const s = getComputedStyle(node); return { radius: parseFloat(s.borderTopLeftRadius), border: parseFloat(s.borderTopWidth) };
    });
    assert.ok(box.radius >= 16, `${state}: radius ${box.radius}`);
    assert.ok(box.border >= 1, `${state}: framed`);
  }
}));

test("Q24-G16 every row inside a card keeps a 12px floor", () => withPage(async page => {
  await open(page, "answer-sourced");
  const row = await page.locator(".oak-workspace").first().evaluate(node => {
    const probe = document.createElement("div"); probe.style.borderRadius = "var(--oak-r-row)"; node.append(probe);
    const radius = parseFloat(getComputedStyle(probe).borderTopLeftRadius); probe.remove(); return radius;
  });
  assert.ok(row >= 12, `--oak-r-row resolves to ${row}px`);
}));
