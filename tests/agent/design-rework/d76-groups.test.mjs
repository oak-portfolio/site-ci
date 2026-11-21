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

test("D76-G1 sign-in and stopped cards share the raised card frame, and other assistants show as raised discs", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    // v3 review (intentional update): research no longer asks permission, so only the shared card frames are checked here.
    const frame = async selector => page.locator(selector).last().evaluate(node => {
      const style = getComputedStyle(node);
      return { radius: style.borderTopLeftRadius, padding: style.paddingTop, border: style.borderTopWidth, edge: style.borderTopColor, shadow: style.boxShadow };
    });
    // Review v4 supersedes D76's frame source: retry-only stopped cards became compact rows, so the full card frame is read
    // from a limit card (budget-paused), and sign-in being off is a compact notice that shares the compact row's corner.
    await open(page, "budget-paused");
    const stopped = await frame(".oak-turn__stopped");
    for (const state of ["sign-in", "sign-in-again"]) {
      await open(page, state);
      assert.deepEqual(await frame("section.oak-account-intake"), stopped, `${state}: the sign-in prompt uses the stopped card's frame`);
    }
    // R11 (intentional update): the one-row Retry notice became a capsule, so the multi-row sign-in notice now shares the
    // fuller card's frame (24px since the card step became the sheet step; Oak, review v8: "the sign in box should be rounder").
    await open(page, "sign-in-unavailable");
    const notice = await frame("section.oak-account-notice");
    assert.deepEqual({ radius: notice.radius, border: notice.border, edge: notice.edge, shadow: notice.shadow },
      { radius: stopped.radius, border: stopped.border, edge: stopped.edge, shadow: stopped.shadow },
      "sign-in-unavailable: the notice shares the fuller card's corner, hairline and flat surface");

    await open(page, "agent-unavailable");
    const discs = await page.locator(".oak-turn__stopped-actions .oak-turn__open-in-link").evaluateAll(links => links.map(link => {
      const style = getComputedStyle(link), box = link.getBoundingClientRect();
      return { round: Math.round(box.width) === Math.round(box.height), border: parseFloat(style.borderTopWidth), fill: style.backgroundColor };
    }));
    assert.equal(discs.length, 3, "three other assistants");
    assert.ok(discs.every(disc => disc.round && disc.border >= 1 && disc.fill !== "rgba(0, 0, 0, 0)"), "each is a raised disc");
  } finally {
    await browser.close();
  }
});

test("D77-G1 while a clip transcribes, the voice stage centres its status and Cancel on one axis", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await open(page, "voice-transcribing");
    const axis = await page.locator('.oak-voice__stage[data-phase="transcribing"]').evaluate(stage => {
      const centre = node => { const box = node.getBoundingClientRect(); return box.left + box.width / 2; };
      const readout = stage.querySelector(".oak-voice__readout"), cancel = stage.querySelector(".oak-voice__controls .ui-button");
      const inner = [...readout.children].filter(child => child.getBoundingClientRect().width > 0);
      const left = Math.min(...inner.map(child => child.getBoundingClientRect().left)), right = Math.max(...inner.map(child => child.getBoundingClientRect().right));
      const statusBottom = Math.max(...inner.map(child => child.getBoundingClientRect().bottom));
      return { stage: centre(stage), status: (left + right) / 2, cancel: centre(cancel), label: cancel.textContent.trim(),
        under: cancel.getBoundingClientRect().top - statusBottom };
    });
    assert.equal(axis.label, "Cancel voice input");
    assert.ok(Math.abs(axis.status - axis.stage) <= 3, `status centred (${Math.round(axis.status)} vs ${Math.round(axis.stage)})`);
    assert.ok(Math.abs(axis.cancel - axis.stage) <= 3, `Cancel centred (${Math.round(axis.cancel)} vs ${Math.round(axis.stage)})`);
    assert.ok(axis.under >= 0, `Cancel sits under the status (${Math.round(axis.under)}px below)`);
  } finally {
    await browser.close();
  }
});
