import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");

/** Where the transcript, its floating pill and the Related rows sit, and how far each edge fades. */
const measure = page => page.evaluate(() => {
  const rect = node => { const box = node.getBoundingClientRect(); return { top: box.top, bottom: box.bottom, left: box.left, right: box.right }; };
  const viewport = document.querySelector(".oak-conversation__viewport");
  const pill = document.querySelector(".oak-conversation__latest");
  const style = getComputedStyle(viewport);
  const pillStyle = getComputedStyle(pill);
  const turns = [...document.querySelectorAll(".oak-conversation__content [data-slot=message]")];
  return { viewport: rect(viewport), chips: rect(document.querySelector(".oak-conversation__viewport .oak-related") ?? document.querySelector(".oak-composer__surface")), surface: rect(document.querySelector(".oak-composer__surface")),
    last: rect(turns.at(-1)), pill: rect(pill), pillActive: pill.dataset.active, pillPosition: pillStyle.position, pillOpacity: Number(pillStyle.opacity), pillVisibility: pillStyle.visibility,
    fadeTop: parseFloat(style.getPropertyValue("--oak-reading-fade-top")) || 0, fadeBottom: parseFloat(style.getPropertyValue("--oak-reading-fade-bottom")) || 0, mask: style.maskImage || style.webkitMaskImage,
    scrollTop: viewport.scrollTop, room: viewport.scrollHeight - viewport.clientHeight };
});
const scrollTo = (page, where) => page.evaluate(where => {
  const viewport = document.querySelector(".oak-conversation__viewport");
  viewport.scrollTop = where === "end" ? viewport.scrollHeight : where === "start" ? 0 : (viewport.scrollHeight - viewport.clientHeight) / 2;
  viewport.dispatchEvent(new Event("scroll"));
}, where);

test("D44-G1 the Related rows sit inside the transcript, and the Latest pill floats over a transcript that fades only toward more to read", async () => {
  const browser = await chromium.launch();
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }]) {
      const page = await browser.newPage({ viewport });
      const where = `${viewport.width}x${viewport.height}`;
      await page.goto(`${galleryUrl}/__dev/oak-states?state=long-conversation`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
      await page.waitForTimeout(900);

      await scrollTo(page, "end");
      await page.waitForTimeout(600);
      const end = await measure(page);
      assert.ok(end.room > 200, `${where}: the transcript overflows (${end.room})`);
      assert.ok(end.surface.top - end.viewport.bottom <= 17, `${where}: the transcript runs to the composer, no band under it (${end.surface.top - end.viewport.bottom}px)`);
      // v3 review (intentional update): follow-ups are rows inside the newest answer, so nothing floats over the transcript.
      assert.ok(end.chips.top >= end.viewport.top && end.chips.bottom <= end.viewport.bottom + 1, `${where}: the Related rows sit inside the transcript at its end`);
      assert.ok(end.last.bottom <= end.viewport.bottom + 1, `${where}: the last answer ends inside the transcript`);
      assert.equal(end.fadeBottom, 0, `${where}: no bottom fade at the end of the transcript`);
      assert.equal(end.pillActive, "false");
      assert.ok(end.pillOpacity === 0 && end.pillVisibility === "hidden", `${where}: the idle pill is faded out, not a row`);

      await scrollTo(page, "start");
      await page.waitForTimeout(600);
      const start = await measure(page);
      assert.equal(start.fadeTop, 0, `${where}: no top fade at the start`);
      assert.ok(start.fadeBottom > 0 && start.mask !== "none", `${where}: the transcript fades out toward the composer while more is below`);
      assert.equal(start.pillActive, "true");
      assert.equal(start.pillPosition, "absolute", `${where}: the pill floats`);
      assert.equal(start.pillOpacity, 1);
      assert.ok(start.pill.top >= start.viewport.top && start.pill.bottom <= start.surface.top - 4, `${where}: the pill floats over the transcript, above the composer`);
      const centre = (start.pill.left + start.pill.right) / 2 - (start.viewport.left + start.viewport.right) / 2;
      assert.ok(Math.abs(centre) <= 8, `${where}: the pill is centred (${centre})`);
      // D70: a round frosted arrow (iOS Messages, ChatGPT), named for assistive tech, so it covers little of what it floats over.
      assert.ok(Math.round(start.pill.right - start.pill.left) <= 44, `${where}: the jump control is a 44px round arrow`);
      assert.equal(await page.locator(".oak-conversation__latest").getAttribute("aria-label"), "Latest messages");

      await scrollTo(page, "middle");
      await page.waitForTimeout(600);
      assert.ok((await measure(page)).fadeTop > 0, `${where}: the top edge fades once there is more above`);
      if (viewport.width === 1440) await page.locator(".oak-workspace").screenshot({ path: "/tmp/d44-floating-1440x900.png" });

      await page.locator(".oak-conversation__latest").click();
      await page.waitForTimeout(700);
      const back = await measure(page);
      assert.equal(back.pillActive, "false", `${where}: Latest returns to the end`);
      assert.ok(back.pillOpacity === 0, `${where}: and fades out`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
