import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

// Review v9 (Oak, 2026-10-20): "the corner radius between children and wrapper is still not uniform". Every framed box
// nested in another framed box is concentric: the inner corner is the outer corner less the inset (16px floor), or a pill.
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const states = ["research-sources", "research-unavailable", "interrupted", "budget-paused", "quota-reached", "contact-handoff",
  "answer-proposal", "delete-confirm", "contact-brief-ready", "contact-menu", "document-selected", "ocr-consent"];

const mismatches = () => {
  const framed = node => { const s = getComputedStyle(node);
    return ["Top", "Right", "Bottom", "Left"].every(k => parseFloat(s[`border${k}Width`]) > 0 && !/rgba\(\d+, \d+, \d+, 0\)/.test(s[`border${k}Color`]))
      || !/rgba\(0, 0, 0, 0\)|transparent/.test(s.backgroundColor); };
  const out = [];
  for (const node of document.querySelectorAll(".oak-workspace *")) {
    const box = node.getBoundingClientRect();
    if (box.width < 60 || box.height < 30 || !framed(node)) continue;
    let up = node.parentElement;
    while (up && !(framed(up) && up.getBoundingClientRect().width > box.width + 4)) up = up.parentElement;
    if (!up || !up.closest(".oak-workspace") || up.classList.contains("oak-workspace")) continue;
    const outer = up.getBoundingClientRect();
    const ro = parseFloat(getComputedStyle(up).borderTopLeftRadius), ri = parseFloat(getComputedStyle(node).borderTopLeftRadius);
    // The nearest edges: a tile in a grid's second column sits at the outer frame's right, not its left.
    const inset = Math.round(Math.min(Math.min(box.left - outer.left, outer.right - box.right), Math.min(box.top - outer.top, outer.bottom - box.bottom)));
    // Only a child whose corner sits within the parent's curve shares it; a middle tile in a grid has no shared corner.
    if (inset > ro) continue;
    const want = Math.max(16, ro - inset);
    if (ri < box.height / 2 - 1 && Math.abs(ri - want) > 4)
      out.push(`${String(up.className).split(" ")[0]} ${ro}px > ${String(node.className).split(" ")[0]} ${ri}px at ${inset}px (want ${want})`);
  }
  return [...new Set(out)];
};

test("Q24-G16 R12 nested frames are concentric on every flagged flow", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const failures = [];
    for (const state of states) {
      await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 30000 });
      await page.waitForTimeout(600);
      for (const miss of await page.evaluate(mismatches)) failures.push(`${state}: ${miss}`);
    }
    assert.deepEqual(failures, []);
  } finally { await browser.close(); }
});

test("Q24-G16 R12 a long role description never runs into its button row", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`${galleryUrl}/__dev/oak-states?state=role-fit`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 30000 });
    await page.getByRole("button", { name: /Try a sample role/ }).click();
    await page.waitForTimeout(500);
    const field = await page.locator("#oak-role-description").evaluate(node => {
      const style = getComputedStyle(node), addon = node.parentElement.querySelector(".ui-input-group__addon").getBoundingClientRect();
      // The band is the field's own bottom padding (inside the fade) plus any space before the button row.
      return { gap: addon.top - node.getBoundingClientRect().bottom + parseFloat(style.paddingBottom), faded: style.maskImage.includes("gradient") || style.webkitMaskImage?.includes("gradient") };
    });
    assert.ok(field.gap >= 8, `a clear band above the buttons (${field.gap}px)`);
    assert.ok(field.faded, "the last visible line fades before the band");
  } finally { await browser.close(); }
});
