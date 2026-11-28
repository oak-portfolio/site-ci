import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

// Ticket 289 (review r286 N1): the chat-first home hosts the thread in .home-chat__thread, outside .oak-workspace, so
// its frames lost the agent's radius and tint tokens (square corners, transparent fill). The home's frames must compute
// the same corner and fill as the open agent's. At 400 and below 286 drops the quick check's border and tint on purpose,
// so its fill is compared at 1280 only; the follow-up card is a thread card at both widths.
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const widths = [390, 1280];
const agentLook = { frameRadius: "48px", frameFill: "color(srgb 0.545098 0.360784 0.964706 / 0.06)", cardRadius: "48px", cardFill: "color(srgb 1 1 1 / 0.07)" };

const inject = host => {
  const section = document.createElement("section");
  section.className = "oak-verification";
  section.dataset.visible = "true";
  section.innerHTML = '<h2 class="oak-verification__title">A quick check before Oak answers</h2>' +
    '<div class="oak-verification__frame"><div class="oak-verification__widget">' +
    '<div data-stub-turnstile style="inline-size: 300px; block-size: 65px;"></div></div></div>';
  const card = document.createElement("button");
  card.type = "button";
  card.className = "oak-next-step";
  card.textContent = "Try the fit check";
  host.prepend(section, card);
  const frame = getComputedStyle(section.querySelector(".oak-verification__frame"));
  const next = getComputedStyle(card);
  return { inWorkspace: !!card.closest(".oak-workspace"), frameRadius: frame.borderTopLeftRadius, frameFill: frame.backgroundColor,
    cardRadius: next.borderTopLeftRadius, cardFill: next.backgroundColor };
};

const home = async (browser, width) => {
  const page = await browser.newPage({ viewport: { width, height: 800 } });
  try {
    await page.goto(`${galleryUrl}/?oakChatFirstHome=1`, { waitUntil: "domcontentloaded" });
    const thread = page.locator(".home-chat__thread");
    await thread.waitFor({ timeout: 20000 });
    return await thread.evaluate(inject);
  } finally { await page.close(); }
};

const agent = async (browser, width) => {
  const page = await browser.newPage({ viewport: { width, height: 800 } });
  try {
    await page.goto(`${galleryUrl}/__dev/oak-states?state=verification`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
    const host = page.locator('.oak-workspace .oak-verification[data-visible="true"]').locator("..");
    await host.waitFor();
    return await host.evaluate(inject);
  } finally { await page.close(); }
};

test("289 the chat-first home's quick check and thread card wear the agent's corner and tint at 390 and 1280", async () => {
  const browser = await chromium.launch();
  try {
    for (const width of widths) {
      const a = await agent(browser, width);
      const h = await home(browser, width);
      assert.equal(a.inWorkspace, true, `${width}: the reference frames should sit in the agent workspace`);
      assert.equal(h.inWorkspace, false, `${width}: the home frames should sit outside the agent workspace`);
      assert.deepEqual({ ...a, inWorkspace: undefined }, { ...agentLook, inWorkspace: undefined }, `${width}: the agent workspace's own corner and tint changed`);
      assert.equal(h.frameRadius, a.frameRadius, `${width}: the home quick check frame's corner ${h.frameRadius} is not the agent's ${a.frameRadius}`);
      if (width > 400) assert.equal(h.frameFill, a.frameFill, `${width}: the home quick check frame's fill ${h.frameFill} is not the agent's ${a.frameFill}`);
      assert.equal(h.cardRadius, a.cardRadius, `${width}: the home thread card's corner ${h.cardRadius} is not the agent's ${a.cardRadius}`);
      assert.equal(h.cardFill, a.cardFill, `${width}: the home thread card's fill ${h.cardFill} is not the agent's ${a.cardFill}`);
    }
  } finally { await browser.close(); }
});
