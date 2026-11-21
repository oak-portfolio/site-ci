import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { openState } from "./gallery.mjs";

// R25 live reading (2026-10-25, captures live-v23): what the gallery fixtures never showed.
test("R25 live: a meter tile's sentence follows its bar, and a step's source chip stays on the step's text line", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    // The live numbers answer (two pages, chips at the foot): the sentence follows the bar. One page with no chips keeps its
    // sentence at the foot by design (both tiles end on one line; r14's inset probe holds that frame balanced).
    for (const state of ["answer-openui-numbers-pages"]) {
      await openState(page, state, { settle: 300 });
      const band = await page.evaluate(() => {
        const meter = document.querySelector(".oak-openui-stats__tile .oak-openui__meter");
        const track = meter?.querySelector(".oak-openui__meter-track")?.getBoundingClientRect();
        const claim = meter?.querySelector(".oak-openui__metric-claim");
        const text = claim && document.createTreeWalker(claim, NodeFilter.SHOW_TEXT, { acceptNode: node => node.textContent?.trim() ? 1 : 3 }).nextNode();
        const range = document.createRange();
        if (text) range.selectNodeContents(text);
        const firstLine = text ? [...range.getClientRects()][0] : null;
        return track && firstLine ? firstLine.top - track.bottom : null;
      });
      assert.ok(band !== null, `${state}: the meter tile renders`);
      assert.ok(band <= 16, `${state}: the sentence starts right under the bar (gap ${band}px; live it was about 60px)`);
    }
    // Every source chip in a step sits in the text column, right of the 24px number, never under it.
    await openState(page, "answer-openui-steps", { settle: 300 });
    const chips = await page.evaluate(() => [...document.querySelectorAll(".oak-workspace .oak-openui__steps > li")].flatMap(li => {
      const left = li.getBoundingClientRect().left;
      return [...li.querySelectorAll(".oak-source-chip")].map(chip => Math.round(chip.getBoundingClientRect().left - left));
    }));
    assert.ok(chips.length >= 2, "the steps carry their source chips");
    for (const offset of chips) assert.ok(offset >= 24, `a step's chip starts ${offset}px from the step's left edge, inside the number column`);
  } finally { await browser.close(); }
});
