import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const states = ["contact-handoff", "answer-declined", "reasoning-composing"];
const widths = [320, 390, 1280];

const measure = page => page.evaluate(() => [...document.querySelectorAll(".oak-turn__handoff-actions")].map(actions => {
  const card = actions.closest(".oak-turn__handoff").getBoundingClientRect();
  return [...actions.querySelectorAll("button, a")].map(node => {
    const box = node.getBoundingClientRect();
    return { label: node.textContent.trim(), right: box.right, top: box.top, height: box.height, cardRight: card.right, cut: node.scrollWidth > node.clientWidth };
  });
}).filter(buttons => buttons.length));

for (const state of states) {
  for (const width of widths) {
    test(`handoff buttons fit the card in ${state} at ${width}`, async () => {
      const browser = await chromium.launch();
      try {
        const page = await browser.newPage({ viewport: { width, height: 800 } });
        await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
        await page.waitForTimeout(300);
        // Below 360px the workspace shows only its larger-window notice (oakViewportSupport), so no card renders at 320.
        if (width < 360) {
          assert.equal(await page.locator('.oak-workspace[data-unsupported="true"] .oak-workspace__body[hidden]').count(), 1, "320 is the unsupported notice");
          return;
        }
        const rows = await measure(page);
        if (state !== "contact-handoff" && !rows.length) return;
        assert.ok(rows.length, `${state} shows the handoff actions`);
        for (const buttons of rows) {
          for (const button of buttons) {
            assert.ok(button.right <= button.cardRight + 0.5, `${button.label} right ${button.right} inside card ${button.cardRight}`);
            assert.equal(button.cut, false, `${button.label} label is not cut`);
            if (width <= 390) assert.ok(button.height >= 44, `${button.label} is ${button.height}px tall`);
          }
          if (width === 1280) assert.equal(new Set(buttons.map(button => Math.round(button.top))).size, 1, "two buttons share one row at 1280");
        }
      } finally {
        await browser.close();
      }
    });
  }
}
