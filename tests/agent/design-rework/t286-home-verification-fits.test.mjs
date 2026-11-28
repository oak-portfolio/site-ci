import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

// Ticket 286 (review r284 N1): the chat-first home hosts the quick check in .home-chat__thread, outside .oak-workspace,
// so the agent's 360px floor does not apply. Cloudflare's flexible widget is never under 300px, so the frame's content
// box must hold a 300px widget at every width from 320 up, with the frame inside the viewport.
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const widths = [320, 360, 390, 400, 401, 1280];

const measure = async (browser, width) => {
  const page = await browser.newPage({ viewport: { width, height: 800 } });
  try {
    await page.goto(`${galleryUrl}/?oakChatFirstHome=1`, { waitUntil: "domcontentloaded" });
    const thread = page.locator(".home-chat__thread");
    await thread.waitFor({ timeout: 20000 });
    return await thread.evaluate(host => {
      const section = document.createElement("section");
      section.className = "oak-verification";
      section.dataset.visible = "true";
      section.innerHTML = '<h2 class="oak-verification__title">A quick check before Oak answers</h2>' +
        '<div class="oak-verification__frame"><div class="oak-verification__widget">' +
        '<div data-stub-turnstile style="inline-size: 300px; block-size: 65px;"></div></div></div>';
      host.prepend(section);
      const frame = section.querySelector(".oak-verification__frame");
      const widget = section.querySelector("[data-stub-turnstile]");
      const cs = getComputedStyle(frame);
      const f = frame.getBoundingClientRect();
      const w = widget.getBoundingClientRect();
      const inset = name => parseFloat(cs[`border${name}Width`]) + parseFloat(cs[`padding${name}`]);
      return { inWorkspace: !!frame.closest(".oak-workspace"), content: [f.left + inset("Left"), f.right - inset("Right")],
        frame: [f.left, f.right], widget: [w.left, w.right], viewport: document.documentElement.clientWidth,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
  } finally { await page.close(); }
};

test("286 the chat-first home's quick check holds Cloudflare's 300px widget inside its frame at 320, 360, 390, 400, 401 and 1280", async () => {
  const browser = await chromium.launch();
  try {
    for (const width of widths) {
      const m = await measure(browser, width);
      assert.equal(m.inWorkspace, false, `${width}: the home check should sit outside the agent workspace`);
      assert.ok(m.widget[0] >= m.content[0] - 0.5 && m.widget[1] <= m.content[1] + 0.5,
        `${width}: the 300px widget ${m.widget.map(Math.round)} runs past the frame's content box ${m.content.map(Math.round)}`);
      assert.ok(Math.abs((m.widget[0] + m.widget[1]) - (m.frame[0] + m.frame[1])) / 2 <= 1,
        `${width}: the widget ${m.widget.map(Math.round)} is off centre in its frame ${m.frame.map(Math.round)}`);
      assert.ok(m.frame[0] >= -0.5 && m.frame[1] <= m.viewport + 0.5, `${width}: the frame ${m.frame.map(Math.round)} leaves the ${m.viewport}px viewport`);
      assert.ok(m.overflow <= 0, `${width}: the page scrolls sideways by ${m.overflow}px`);
    }
  } finally { await browser.close(); }
});
