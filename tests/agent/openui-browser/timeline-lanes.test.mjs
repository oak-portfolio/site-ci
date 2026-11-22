import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { openState } from "../premium/gallery.mjs";

// Ticket 57 review r1 P2: at 390 the lanes axis names its first month, its last month and the Today month, and no two labels touch.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

test("gallery: at 390 the lanes axis names its first, last and Today month with no overlap and no sideways scroll", async () => {
  const browser = await chromium.launch();
  try {
    for (const id of ["timeline-lanes-2", "timeline-lanes-5"]) {
      const page = await (await browser.newContext({ viewport: { width: 390, height: 900 } })).newPage();
      await openState(page, id, { settle: 300 });
      const seen = await page.evaluate(() => {
        const months = [...document.querySelectorAll(".oak-lanes__month")];
        const shown = months.filter(month => getComputedStyle(month).visibility !== "hidden").map(month => {
          const range = document.createRange();
          range.selectNodeContents(month);
          const box = range.getBoundingClientRect();
          return { text: month.textContent, left: box.left, right: box.right, top: box.top, bottom: box.bottom };
        });
        const today = document.querySelector(".oak-lanes__today")?.getBoundingClientRect();
        const axis = document.querySelector(".oak-lanes__axis")?.getBoundingClientRect();
        return { all: months.map(month => month.textContent), shown, scroll: document.documentElement.scrollWidth, width: innerWidth,
          todayTop: today?.top ?? null, axisBottom: axis?.bottom ?? null };
      });
      const now = new Date();
      const today = `${MONTHS[now.getMonth()]}${now.getFullYear()}`;
      const names = seen.shown.map(label => label.text);
      assert.ok(seen.all.length >= 2, `${id}: the lanes drew`);
      assert.ok(names.includes(seen.all[0]) && /\d{4}$/.test(seen.all[0]), `${id}: first month named (${names})`);
      assert.ok(names.at(-1) === seen.all.at(-1) && /\d{4}$/.test(names.at(-1)), `${id}: last month named (${names})`);
      if (seen.all.includes(today)) assert.ok(names.includes(today), `${id}: Today month named (${names})`);
      for (let i = 1; i < seen.shown.length; i++) assert.ok(seen.shown[i - 1].right <= seen.shown[i].left, `${id}: ${names[i - 1]} and ${names[i]} do not overlap`);
      if (seen.todayTop !== null) assert.ok(seen.todayTop >= seen.axisBottom - 0.5, `${id}: the Today line starts below the axis labels (${seen.todayTop} < ${seen.axisBottom})`);
      assert.ok(seen.scroll <= seen.width, `${id}: no sideways scroll (${seen.scroll})`);
      await page.context().close();
    }
  } finally { await browser.close(); }
});
