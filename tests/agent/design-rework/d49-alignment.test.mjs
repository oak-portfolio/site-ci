import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const open = async (page, state) => {
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
  await page.waitForTimeout(700);
};

test("D49-G1 chips, source pills and the Latest pill sit aligned with even, roomy padding", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await open(page, "long-conversation");
    // v3 review (intentional update): follow-ups are Related rows; each row's text and its plus share one centre line.
    const rows = await page.locator(".oak-related .ui-suggestion").evaluateAll(nodes => nodes.map(node => {
      const label = node.querySelector(".ui-suggestion__label").getBoundingClientRect(), plus = node.querySelector(".ui-suggestion__trailing").getBoundingClientRect();
      const style = getComputedStyle(node);
      return { left: parseFloat(style.paddingLeft), right: parseFloat(style.paddingRight), offset: Math.abs((label.top + label.bottom) / 2 - (plus.top + plus.bottom) / 2) };
    }));
    assert.ok(rows.length >= 1, "follow-ups rendered");
    for (const row of rows) assert.ok(row.left === row.right && row.offset <= 2, `row padding ${row.left}/${row.right}, plus off-centre by ${row.offset}`);

    // D122: each point ends in one unnumbered source chip: a face icon and a short name, inset from the chip's edge.
    const pills = await page.evaluate(() => [...document.querySelectorAll(".oak-answer__point")].map(point => {
      const first = point.querySelector(".oak-source-chip__trigger");
      const icon = first.querySelector(".oak-source-face svg, .oak-source-face img");
      return { inset: parseFloat(getComputedStyle(first).paddingLeft), icon: icon ? icon.getBoundingClientRect().width > 0 : false,
        label: first.querySelector(".oak-source-chip__label").textContent, inParagraph: Boolean(first.closest("p")) };
    }));
    assert.ok(pills.length >= 3, `answer points measured: ${pills.length}`);
    for (const [index, pill] of pills.entries()) {
      assert.ok(pill.icon, `point ${index + 1}: the chip shows its source face`);
      assert.ok(pill.label.trim(), `point ${index + 1}: the chip names a source`);
      assert.ok(pill.inset >= 6, `point ${index + 1}: left inset ${pill.inset}`);
      assert.ok(pill.inParagraph, `point ${index + 1}: the chip follows the text inline`);
    }

    // The Latest control (D70): a round 44px arrow, its glyph centred.
    await page.evaluate(() => { document.querySelector(".oak-conversation__viewport").scrollTo({ top: 0 }); });
    await page.waitForTimeout(600);
    const latest = await page.locator(".oak-conversation__latest").evaluate(node => {
      const box = node.getBoundingClientRect(), glyph = node.querySelector("svg").getBoundingClientRect();
      return { width: box.width, height: box.height, offset: Math.abs((glyph.left + glyph.right) / 2 - (box.left + box.right) / 2), active: node.dataset.active };
    });
    assert.equal(latest.active, "true");
    assert.ok(latest.width === 44 && latest.height >= 44 && latest.offset <= 1, `Latest is a centred 44px arrow (${latest.width}x${latest.height}, ${latest.offset})`);
    await page.locator(".oak-workspace").screenshot({ path: "/tmp/d49-long-top.png" });
    await page.evaluate(() => { const viewport = document.querySelector(".oak-conversation__viewport"); viewport.scrollTo({ top: viewport.scrollHeight }); });
    await page.waitForTimeout(600);
    await page.locator(".oak-workspace").screenshot({ path: "/tmp/d49-long-end.png" });
  } finally {
    await browser.close();
  }
});
