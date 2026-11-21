import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { openState } from "../premium/gallery.mjs";

// Ticket 211 (gallery on OAK_GALLERY_URL): a claim that cites several case studies sits under no project card.
const STATE = "answer-openui-project-multi-cite";
const WIDTHS = [1280, 390];

async function withPage(width, run) {
  const browser = await chromium.launch();
  try { await run(await (await browser.newContext({ viewport: { width, height: 900 } })).newPage()); }
  finally { await browser.close(); }
}

for (const width of WIDTHS) {
  test(`T211-1 a claim citing three case studies prints once as a list item, in no card, at ${width}`, () => withPage(width, async page => {
    await openState(page, STATE, { settle: 400 });
    const seen = await page.evaluate(() => {
      const needle = "OmniSocial mentions outcome evidence stays under review";
      const cards = [...document.querySelectorAll(".oak-openui-card")];
      return {
        inCard: cards.filter(card => card.textContent.includes(needle)).length,
        items: [...document.querySelectorAll("li")].filter(li => li.textContent.includes(needle)).length,
        empty: cards.filter(card => !card.querySelector(".oak-openui-card__lead")).length,
        sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });
    assert.equal(seen.inCard, 0, "no .oak-openui-card holds the claim");
    assert.equal(seen.items, 1, "the claim prints once as a list item");
    assert.equal(seen.empty, 0, "no card draws with zero claims of its own");
    assert.equal(seen.sideways, false, "no sideways scroll");
  }));
}
