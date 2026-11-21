import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { galleryStates as states } from "../premium/gallery.mjs";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const open = async (page, state) => {
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
  await page.waitForTimeout(400);
};

/** Pills below their point, chip and pill sizes, and the gaps between neighbours on a row. */
const measure = page => page.evaluate(() => {
  const root = document.querySelector(".oak-workspace");
  const visible = node => { const box = node.getBoundingClientRect(); return box.width > 0 && box.height > 0 && getComputedStyle(node).visibility !== "hidden"; };
  // D122: a work answer's sources are one chip at the end of its point's paragraph, never touching the last word.
  const points = [...root.querySelectorAll(".oak-answer__point")].filter(point => point.querySelector(".oak-source-chip__trigger") && visible(point)).map(point => {
    const chip = point.querySelector(".oak-source-chip__trigger").getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(point.querySelector(".ui-reveal-text") ?? point.querySelector("p").firstChild);
    const words = [...range.getClientRects()].filter(rect => rect.width > 0);
    const last = words.at(-1);
    return { gap: chip.top >= last.bottom - 2 ? null : chip.left - last.right, overlap: chip.left < last.right && chip.top < last.bottom - 2 };
  });
  const sized = (selector, kind) => [...root.querySelectorAll(selector)].filter(visible).map(node => {
    const style = getComputedStyle(node), box = node.getBoundingClientRect();
    return { kind, height: box.height, left: parseFloat(style.paddingLeft), right: parseFloat(style.paddingRight), text: node.textContent.trim().slice(0, 30) };
  });
  const items = [
    ...sized(".oak-message__source", "source pill"),
    ...sized(".oak-answer__sources-button", "sources button"),
    ...sized(".oak-source-chip__trigger", "source chip"),
  ];
  const rows = [];
  for (const [container, child] of [[".oak-message__sources", ".oak-message__source"], [".oak-narrow__options .ui-suggestions", ".ui-suggestion"]]) {
    for (const row of root.querySelectorAll(container)) {
      const boxes = [...row.querySelectorAll(child)].filter(visible).map(node => node.getBoundingClientRect()).sort((a, b) => a.top - b.top || a.left - b.left);
      for (let index = 1; index < boxes.length; index++) {
        if (Math.abs(boxes[index].top - boxes[index - 1].top) < 2) rows.push({ kind: child, gap: boxes[index].left - boxes[index - 1].right });
      }
    }
  }
  return { points, items, rows };
});

test("D53-G1 room around every chip and pill: one chip after each point's last word, 32px chips with 12px text sides, 8px between neighbours", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const seen = { points: 0, kinds: new Set(), rows: 0 };
    const check = (id, found) => {
      for (const [index, point] of found.points.entries()) {
        seen.points++;
        assert.ok(!point.overlap, `${id} point ${index + 1}: the chip overlaps the text`);
        if (point.gap !== null) assert.ok(point.gap >= 4, `${id} point ${index + 1}: the chip sits ${point.gap.toFixed(1)}px after the last word`);
      }
      for (const item of found.items) {
        seen.kinds.add(item.kind);
        // D122: the inline source chip is a 22px capsule (WAVE9 section 1) with a 32px hit area, so it has its own floor.
        if (item.kind === "source chip") {
          assert.ok(item.height >= 22 - 0.5, `${id} source chip "${item.text}": ${item.height}px tall`);
          assert.ok(item.right >= 8 && item.left >= 6, `${id} source chip "${item.text}": padding ${item.left}/${item.right}`);
          continue;
        }
        assert.ok(item.height >= 32 - 0.5, `${id} ${item.kind} "${item.text}": ${item.height}px tall`);
        assert.ok(item.right >= 12 && item.left >= 4, `${id} ${item.kind} "${item.text}": padding ${item.left}/${item.right}`);
        if (item.kind === "follow-up chip" || item.kind === "reasoning chip") assert.ok(item.left >= 12, `${id} ${item.kind} "${item.text}": left padding ${item.left}`);
      }
      for (const row of found.rows) {
        seen.rows++;
        assert.ok(row.gap >= 8 - 0.5, `${id} ${row.kind}: neighbours ${row.gap.toFixed(1)}px apart`);
      }
    };
    for (const { id } of states) {
      await open(page, id);
      check(id, await measure(page));
    }
    // Open the reasoning rail of a finished answer so its found-source pills are measured too.
    await open(page, "answer-points");
    await page.locator(".ui-chain-of-thought__header").first().click();
    await page.waitForTimeout(500);
    check("answer-points (reasoning open)", await measure(page));
    await page.locator(".oak-workspace").screenshot({ path: "/tmp/d53-answer-points.png" });

    assert.ok(seen.points >= 4, `measured ${seen.points} sourced points`);
    // v3 review (intentional update): follow-ups are full-width Related rows, not chips, so they are measured in D40-G2 instead.
    assert.deepEqual([...seen.kinds].sort(), ["source chip", "source pill", "sources button"], "every kind measured (the open rail's found sources are source pills since D100; answers use chips since D122)");
    // v3 review: with follow-ups as rows, only the narrowing pills still sit side by side, so one gap is the floor.
    assert.ok(seen.rows >= 1, `measured ${seen.rows} neighbour gaps`);
  } finally {
    await browser.close();
  }
});
