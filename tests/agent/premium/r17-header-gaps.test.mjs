import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { openState } from "./gallery.mjs";

// R17 (Oak, review v14, empty: "the gap are not equal on the top right controls"; interrogate M6: buttons sat 4px apart
// but the visible gaps read 25/30/21/33px). The gap a visitor sees runs from one control's glyph, face or words to the
// next one's, so this measures ink to ink, signed out and signed in.

test("R17 the header's top-right controls sit an equal visible gap apart, signed out and signed in", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    for (const state of ["empty", "empty-recruiter"]) {
      await openState(page, state);
      const gaps = await page.evaluate(() => {
        const header = document.querySelector(".oak-workspace__header");
        const half = header.getBoundingClientRect().width / 2;
        const controls = [...header.querySelectorAll("button, a")].filter(node => node.getBoundingClientRect().width && node.getBoundingClientRect().x > half);
        const ink = node => {
          const range = document.createRange(); range.selectNodeContents(node);
          const rects = [...node.querySelectorAll("svg, img, span"), range].flatMap(item => [...item.getClientRects()]).filter(rect => rect.width && rect.height);
          return { left: Math.min(...rects.map(rect => rect.left)), right: Math.max(...rects.map(rect => rect.right)) };
        };
        const inks = controls.map(ink);
        return inks.slice(1).map((value, index) => Math.round(value.left - inks[index].right));
      });
      assert.ok(gaps.length >= 3, `${state}: ${gaps.length + 1} controls`);
      assert.ok(Math.max(...gaps) - Math.min(...gaps) <= 2, `${state}: visible gaps ${gaps.join("/")} differ by more than 2px`);
    }
  } finally {
    await browser.close();
  }
});
