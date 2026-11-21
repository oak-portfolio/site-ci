import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const open = async (page, state) => {
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
  await page.waitForTimeout(400);
};

// Each state's list rows or drop areas, by the selector that owns the row's box.
const rows = {
  "document-upload": [".ui-attachment-dropzone", ".oak-documents__add > .ui-field", ".oak-documents > .ui-disclosure"],
  "document-selected": [".oak-documents__preview > .ui-attachment", ".ui-attachment-dropzone", ".oak-documents__add > .ui-field", ".oak-documents > .ui-disclosure"],
  "saved-list": [".oak-saved__row--current", "#oak-saved-conversations .oak-saved__row"],
  "saved-empty": [".oak-saved__row--current", ".oak-saved__none"],
  "voice-off": [".oak-voice__off"],
};
// Review v4 supersedes D90 for saved conversation rows: the date tile is gone, a row is its title and one line, and must not carry a picture.
const textOnly = new Set(["#oak-saved-conversations .oak-saved__row"]);

/** Per row: its picture (sprite poses, or the tile's icon and tint), and any text closer than 12px to a visual container edge. */
const inspect = (page, selectors) => page.evaluate(selectors => {
  const panel = document.querySelector(".oak-workflow, .oak-workspace__workflow") ?? document.querySelector(".oak-workspace");
  const picture = row => {
    const poses = [...row.querySelectorAll(".oak-activity-sprite")].map(node => node.dataset.pose).sort();
    if (poses.length) return poses.join("+");
    const tile = row.querySelector("[data-oak-tile]");
    return tile ? `tile:${tile.dataset.oakTile}:${getComputedStyle(tile).backgroundColor}` : null;
  };
  const found = selectors.flatMap(selector => [...panel.querySelectorAll(selector)].map(node => ({ selector, picture: picture(node), meaning: node.dataset.oakRow ?? selector })));
  // Text edges: every rendered text run against the nearest ancestor that draws a border or a fill, on the sides it draws.
  const close = [];
  const walker = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    const host = text.parentElement;
    // R12 (intentional update): Base UI Meter keeps a clipped 1px measuring span ([role='presentation']) that is never seen.
    if (!text.textContent.trim() || !host || host.closest("button, .ui-button, .ui-badge, input, textarea, .sr-only, [aria-hidden='true'], [role='presentation'], .oak-panel-nav, .ui-checkbox, .oak-saved__count, .oak-documents__divider")) continue;
    const range = document.createRange(); range.selectNodeContents(text);
    const box = range.getBoundingClientRect();
    if (!box.width || !box.height) continue;
    for (let node = host; node && node !== panel; node = node.parentElement) {
      const style = getComputedStyle(node), edge = node.getBoundingClientRect();
      const filled = style.backgroundColor !== "rgba(0, 0, 0, 0)" && style.backgroundColor !== "transparent";
      const sides = { top: filled || parseFloat(style.borderTopWidth) > 0, bottom: filled || parseFloat(style.borderBottomWidth) > 0,
        left: filled || parseFloat(style.borderLeftWidth) > 0, right: filled || parseFloat(style.borderRightWidth) > 0 };
      if (!Object.values(sides).some(Boolean)) continue;
      // Line boxes add half-leading, so the glyph box sits inside the measured range; allow half a pixel of rounding.
      const gaps = { top: box.top - edge.top, bottom: edge.bottom - box.bottom, left: box.left - edge.left, right: edge.right - box.right };
      for (const [side, gap] of Object.entries(gaps)) if (sides[side] && gap < 11.5)
        close.push(`${text.textContent.trim().slice(0, 24)} ${side} ${gap.toFixed(1)}px in ${node.className || node.tagName}`);
      break;
    }
  }
  return { found, close };
}, selectors);

test("D90-G1 documents, saved and voice panels give each row its own picture and keep text 12px from every edge", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    for (const [state, selectors] of Object.entries(rows)) {
      await open(page, state);
      const { found, close } = await inspect(page, selectors);
      for (const selector of selectors) assert.ok(found.some(row => row.selector === selector), `${state}: ${selector} renders`);
      for (const row of found) {
        if (textOnly.has(row.selector)) assert.equal(row.picture, null, `${state}: ${row.selector} is text only (review v4)`);
        else assert.ok(row.picture, `${state}: ${row.selector} carries a picture or tinted tile`);
      }
      // Rows of different meaning never share a picture; rows of one meaning (saved conversations) may.
      const byPicture = new Map();
      for (const row of found) {
        if (textOnly.has(row.selector)) continue;
        const meaning = byPicture.get(row.picture);
        assert.ok(!meaning || meaning === row.meaning, `${state}: ${row.selector} and ${meaning} share ${row.picture}`);
        byPicture.set(row.picture, row.meaning);
      }
      assert.deepEqual(close, [], `${state}: no text within 12px of its container edge`);
    }
  } finally {
    await browser.close();
  }
});
