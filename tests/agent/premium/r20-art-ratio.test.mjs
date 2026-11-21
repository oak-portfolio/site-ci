import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { openState, stateIds } from "./gallery.mjs";

// R20 (Oak, review v17, sixth flag on the Roles card: "use the images I used for each work experience and use those aspect
// ratios"). Every picture an answer card shows (a role's timeline artwork, a project's cover) is drawn whole at its own
// shape: the rendered box's width over height matches the image's natural ratio within 2%. Every role whose page has
// artwork shows it, never the monogram.
const states = stateIds(state => JSON.stringify(state).includes("steveoak.com/work"));

const probe = () => {
  const out = [];
  for (const img of document.querySelectorAll(".oak-openui-role__art img, .oak-openui-card__thumb img")) {
    if (!img.complete || !img.naturalWidth) { out.push(`${img.currentSrc || img.src}: not loaded`); continue; }
    const box = img.getBoundingClientRect(), natural = img.naturalWidth / img.naturalHeight, drawn = box.width / box.height;
    if (Math.abs(drawn / natural - 1) > 0.02) out.push(`${img.src.split("/").pop()}: drawn ${drawn.toFixed(3)} vs ${natural.toFixed(3)}`);
  }
  const monograms = document.querySelectorAll(".oak-openui-role:not([data-pending]) .oak-openui-role__tile").length;
  return { out, monograms, art: document.querySelectorAll(".oak-openui-role__art img, .oak-openui-card__thumb img").length };
};

test("Q24 R20 every answer-card picture keeps its own aspect ratio, and roles show their artwork", async () => {
  assert.ok(states.length >= 5, `expected work states, got ${states.length}`);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const failures = []; let pictures = 0;
    for (const state of states) {
      await openState(page, state);
      // Lazy images below the fold load once scrolled into view.
      await page.evaluate(() => document.querySelectorAll(".oak-openui-role__art img, .oak-openui-card__thumb img").forEach(img => { img.loading = "eager"; }));
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(400);
      const { out, monograms, art } = await page.evaluate(probe);
      pictures += art;
      for (const miss of out) failures.push(`${state}: ${miss}`);
      if (monograms) failures.push(`${state}: ${monograms} role(s) show a monogram although every timeline role has artwork`);
    }
    assert.deepEqual(failures, []);
    assert.ok(pictures >= 4, `expected answer-card pictures across ${states.length} states, saw ${pictures}`);
    // R20 code review: at 390 a project title keeps at least half the card's text width beside its cover.
    await page.setViewportSize({ width: 390, height: 844 });
    await openState(page, "answer-openui-project-one");
    const narrow = await page.$eval(".oak-openui-project", card => ({ name: card.querySelector(".oak-openui-card__name").getBoundingClientRect().width,
      head: card.querySelector(".oak-openui-card__head").getBoundingClientRect().width }));
    assert.ok(narrow.name >= narrow.head / 2, JSON.stringify(narrow));
  } finally { await browser.close(); }
});
