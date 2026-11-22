import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

// Review v8 (Oak, 2026-10-20): "make the wrapper rounder ... visual harmony, concentric corner radius", on 19 cells. Every
// framed box in the workspace is a capsule or keeps a 16px corner, and a one-row card holding a pill action is a capsule.
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const states = ["allowance-guest", "contact-brief-ready", "document-parsing", "empty-learner", "grant-redeemed", "role-fit", "saved-empty",
  "saved-loading", "server-unreachable", "sign-in-unavailable", "tools-menu", "voice-daily-limit", "voice-off", "voice-recording",
  "voice-transcribing", "answer-openui-settled", "research-sources", "quota-reached-guest", "contact-handoff"];

const sharpBoxes = () => [...document.querySelectorAll(".oak-workspace *")].filter(node => {
  const style = getComputedStyle(node), box = node.getBoundingClientRect();
  if (box.width < 40 || box.height < 28 || style.visibility === "hidden" || style.display === "none") return false;
  if (/checkbox|kbd|shortcut|caret|backdrop|ui-textarea|ui-dialog__title/.test(String(node.className))) return false;
  const framed = ["Top", "Right", "Bottom", "Left"].every(side => parseFloat(style[`border${side}Width`]) > 0 && !/rgba\(\d+, \d+, \d+, 0\)/.test(style[`border${side}Color`]));
  const filled = !/rgba\(0, 0, 0, 0\)|transparent/.test(style.backgroundColor);
  if (!framed && !filled) return false;
  // A row flush inside a rounded list that clips it is drawn by its list's corners.
  const parent = node.parentElement && getComputedStyle(node.parentElement);
  if (parent && /hidden|clip/.test(parent.overflow) && parseFloat(parent.borderTopLeftRadius) >= 16 && !framed) return false;
  const radius = parseFloat(style.borderTopLeftRadius);
  return radius < box.height / 2 - 1 && radius < 16;
}).map(node => `${String(node.className).split(" ")[0]} ${getComputedStyle(node).borderTopLeftRadius}`);

test("Q24-G16 R11 every framed box on the flagged flows is a capsule or keeps the 16px floor", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const failures = [];
    for (const state of states) {
      await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 30000 });
      await page.waitForTimeout(600);
      for (const box of await page.evaluate(sharpBoxes)) failures.push(`${state}: ${box}`);
    }
    assert.deepEqual([...new Set(failures)], []);
  } finally { await browser.close(); }
});

test("Q24-G16 R11 a one-row card with a pill action is a capsule with even padding and round art", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    for (const [state, selector, art] of [["server-unreachable", ".oak-turn__stopped", ".oak-art-tile"], ["saved-loading", ".oak-saved__row--current", ".oak-saved__chip"]]) {
      await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 30000 });
      await page.waitForTimeout(600);
      const shape = await page.locator(selector).first().evaluate((node, artSelector) => {
        const style = getComputedStyle(node), tile = node.querySelector(artSelector);
        return { radius: parseFloat(style.borderTopLeftRadius), height: node.getBoundingClientRect().height,
          padding: [style.paddingTop, style.paddingRight, style.paddingBottom].map(parseFloat),
          art: tile ? parseFloat(getComputedStyle(tile).borderTopLeftRadius) >= tile.getBoundingClientRect().height / 2 - 1 : null };
      }, art);
      assert.ok(shape.radius >= shape.height / 2 - 1, `${state}: ${selector} is a capsule (${shape.radius} of ${shape.height})`);
      assert.equal(new Set(shape.padding).size, 1, `${state}: even padding ${shape.padding}`);
      assert.equal(shape.art, true, `${state}: round art`);
    }
  } finally { await browser.close(); }
});
