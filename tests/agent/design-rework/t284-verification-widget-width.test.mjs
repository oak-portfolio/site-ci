import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

// Ticket 284 (root's live check of land-27): Cloudflare sizes a flexible Turnstile to at least 300px, so the quick check's
// widget slot must give it 300px at every width or the CLOUDFLARE mark and the Privacy and Terms links are clipped.
// The agent opens from 360 wide (oakViewportSupport), so 360 is the narrowest check; at 320 the panel asks for more room.
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const widths = [360, 390, 1280];

const open = async (browser, width) => {
  const page = await browser.newPage({ viewport: { width, height: 800 } });
  await page.goto(`${galleryUrl}/__dev/oak-states?state=verification`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
  return page;
};

const measure = async (browser, width) => {
  const page = await open(browser, width);
  try {
    await page.locator('.oak-verification[data-visible="true"] .oak-verification__frame').waitFor();
    return await page.evaluate(() => {
      const frame = document.querySelector('.oak-verification[data-visible="true"] .oak-verification__frame');
      const slot = document.createElement("div");
      slot.className = "oak-verification__widget";
      const widget = document.createElement("div");
      widget.style.cssText = "inline-size: 300px; block-size: 65px; min-inline-size: 300px;";
      slot.append(widget);
      frame.replaceChildren(slot);
      const s = slot.getBoundingClientRect();
      const w = widget.getBoundingClientRect();
      const f = frame.getBoundingClientRect();
      return { client: slot.clientWidth, scroll: slot.scrollWidth, slot: [s.left, s.right], widget: [w.left, w.right],
        frame: [f.left, f.right], viewport: document.documentElement.clientWidth };
    });
  } finally { await page.close(); }
};

test("284 the quick check gives Cloudflare's 300px widget its whole width at 360, 390 and 1280", async () => {
  const browser = await chromium.launch();
  try {
    for (const width of widths) {
      const m = await measure(browser, width);
      assert.ok(m.client >= 300, `${width}: the widget slot is ${m.client}px wide, under Cloudflare's 300px`);
      assert.ok(m.scroll <= m.client, `${width}: the slot clips its widget (${m.scroll} > ${m.client})`);
      assert.ok(m.widget[0] >= m.slot[0] - 0.5 && m.widget[1] <= m.slot[1] + 0.5, `${width}: the widget ${m.widget} runs past its slot ${m.slot}`);
      assert.ok(m.frame[0] >= 0 && m.frame[1] <= m.viewport + 0.5, `${width}: the frame ${m.frame} leaves the ${m.viewport}px viewport`);
    }
  } finally { await browser.close(); }
});

test("284 at 320 the panel asks for more room, so no clipped check can show", async () => {
  const browser = await chromium.launch();
  try {
    const page = await open(browser, 320);
    await page.getByText("A little more room, please").waitFor();
    assert.equal(await page.locator('.oak-verification[data-visible="true"]').isVisible(), false);
  } finally { await browser.close(); }
});

// Review r284 L1: the chat-first home hosts the same check outside .oak-workspace, where --oak-pad-frame is unset.
test("284 outside the agent workspace the frame still holds the 300px widget inside its border", async () => {
  const browser = await chromium.launch();
  try {
    const page = await open(browser, 1280);
    const m = await page.evaluate(() => {
      const host = document.createElement("div");
      host.style.cssText = "display: block; inline-size: 400px;";
      host.innerHTML = '<section class="oak-verification" data-visible="true"><div class="oak-verification__frame">' +
        '<div class="oak-verification__widget"><div style="inline-size: 300px; block-size: 65px;"></div></div></div></section>';
      document.body.prepend(host);
      const frame = host.querySelector(".oak-verification__frame");
      const slot = frame.firstElementChild;
      const f = frame.getBoundingClientRect();
      const s = slot.getBoundingClientRect();
      return { inWorkspace: !!frame.closest(".oak-workspace"), client: slot.clientWidth, frame: [f.left + 1, f.right - 1], slot: [s.left, s.right] };
    });
    assert.equal(m.inWorkspace, false);
    assert.ok(m.client >= 300, `the widget slot is ${m.client}px wide, under Cloudflare's 300px`);
    assert.ok(m.slot[0] >= m.frame[0] - 0.5 && m.slot[1] <= m.frame[1] + 0.5, `the slot ${m.slot} runs past the frame's border ${m.frame}`);
  } finally { await browser.close(); }
});
