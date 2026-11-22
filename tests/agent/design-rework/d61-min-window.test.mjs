import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");

test("D61-G1 the larger-window notice is centered, on model and sharp, with a one-row header and contained focus", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${galleryUrl}/__dev/oak-states?state=min-window`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
    for (const size of [null, { width: 340, height: 560 }]) {
      if (size) await page.setViewportSize(size);
      await page.waitForTimeout(700);
      const layout = await page.evaluate(() => {
        const frame = document.querySelector(".oak-workspace").getBoundingClientRect();
        const centre = frame.left + frame.width / 2;
        const offset = selector => { const box = document.querySelector(selector).getBoundingClientRect(); return Math.abs(box.left + box.width / 2 - centre); };
        const image = document.querySelector('.oak-workspace__viewport-notice [data-pose="larger-window"] img');
        const title = document.querySelector(".oak-workspace__heading").getBoundingClientRect();
        const actions = document.querySelector(".oak-workspace__header-actions").getBoundingClientRect();
        return { art: offset('.oak-workspace__viewport-notice [data-pose="larger-window"]'), heading: offset(".oak-workspace__viewport-title"),
          line: offset('.oak-workspace__viewport-notice [role="status"]'), width: image.getBoundingClientRect().width, natural: image.naturalWidth,
          oneRow: Math.abs((title.top + title.bottom) / 2 - (actions.top + actions.bottom) / 2) < 8,
          overflow: document.documentElement.scrollWidth > window.innerWidth };
      });
      const label = size ? `${size.width}x${size.height}` : "1440x900";
      for (const part of ["art", "heading", "line"]) assert.ok(layout[part] <= 4, `${label}: ${part} is centered (${layout[part].toFixed(1)} px off)`);
      assert.ok(layout.width >= 120, `${label}: art is ${layout.width}px wide`);
      // The browser picks a srcset candidate for its density; the candidate still has to be at least the drawn width.
      assert.ok(layout.natural >= layout.width, `${label}: the chosen candidate (${layout.natural}px) is not upscaled`);
      assert.ok(layout.oneRow, `${label}: header title and actions share one row`);
      assert.equal(layout.overflow, false, `${label}: no horizontal overflow`);
    }
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    const focus = await page.evaluate(() => { const node = document.activeElement; return { inHeader: !!node.closest(".oak-workspace__header"), offset: parseFloat(getComputedStyle(node).outlineOffset), style: getComputedStyle(node).outlineStyle }; });
    assert.ok(focus.inHeader && focus.style !== "none" && focus.offset <= 0, `header focus stays inside the control (${JSON.stringify(focus)})`);
  } finally {
    await browser.close();
  }
});

test("D61-G1 the larger-window art source is drawn at least 4 times its 132 px display width", async () => {
  const { readFileSync } = await import("node:fs");
  const map = JSON.parse(readFileSync(new URL("../../../design/visual-integration/oak-agent-assets-v2.json", import.meta.url), "utf8"));
  const asset = map.assets[map.states["min-window"].asset];
  const sharp = (await import("sharp")).default;
  const { fileURLToPath } = await import("node:url");
  const { width } = await sharp(fileURLToPath(new URL(`../../../${asset.source}`, import.meta.url))).metadata();
  assert.ok(width >= 132 * 4, `source is ${width}px wide`);
});
