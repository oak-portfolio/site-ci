import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { openState } from "../premium/gallery.mjs";

// Ticket 27 (gallery on OAK_GALLERY_URL): the mode switch is a radiogroup with arrow keys, and every state fits 390.
const modeOf = page => page.locator(".oak-ownership").first().getAttribute("data-mode");
const sideways = page => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);

test("gallery: the mode switch is a radiogroup, arrow keys move split to tree to roll and back, each change is announced", async () => {
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await openState(page, "ownership-split", { settle: 300 });
    await page.evaluate(() => {
      window.__said = [];
      new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => window.__said.push(node.textContent))))
        .observe(document.querySelector("[aria-live='polite']"), { childList: true, subtree: true });
    });
    const group = page.locator(".oak-ownership [role='radiogroup']").first();
    assert.equal(await group.getAttribute("aria-label"), "Show ownership as");
    assert.equal(await group.getByRole("radio").count(), 3);
    assert.equal(await modeOf(page), "split");
    await group.getByRole("radio", { name: "Split" }).focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(await modeOf(page), "tree");
    await page.keyboard.press("ArrowRight");
    assert.equal(await modeOf(page), "roll");
    assert.match(await page.locator(".oak-ownership").first().innerText(), /areas listed/);
    await page.keyboard.press("ArrowLeft");
    assert.equal(await modeOf(page), "tree");
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("role")), "radio", "focus stays on the switch");
    await page.waitForTimeout(150);
    assert.deepEqual(await page.evaluate(() => window.__said.filter(Boolean)), ["Ownership shown as a tree.", "Ownership shown as a count of areas listed.", "Ownership shown as a tree."]);
  } finally { await browser.close(); }
});

test("gallery: every ownership state fits 390 and the off and streaming states hold their shape", async () => {
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    for (const id of ["ownership-split", "ownership-tree", "ownership-roll", "ownership-no-collaborators", "ownership-streaming", "ownership-off"]) {
      await openState(page, id, { settle: 200 });
      assert.equal(await sideways(page), false, `${id}: no sideways scroll at 390`);
    }
    await openState(page, "ownership-off", { settle: 200 });
    assert.equal(await page.locator(".oak-ownership").count(), 0, "constant off draws the plain Points list");
    assert.ok(await page.locator(".oak-openui__points").count() > 0);
    await openState(page, "ownership-streaming", { settle: 200 });
    assert.ok(await page.locator(".oak-ownership[data-pending]").count() > 0, "a streaming Ownership draws its ghost");
  } finally { await browser.close(); }
});

test("gallery parity: the switch segments are 44px targets, the group titles carry no hue, and each tree rail ends at its last leaf", async () => {
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await openState(page, "ownership-split", { settle: 300 });
    for (const radio of await page.locator(".oak-ownership [role='radio']").all()) assert.ok((await radio.boundingBox()).height >= 44, "segment height is at least 44px");
    const [red, , blue] = (await page.locator(".oak-ownership__title").first().evaluate(node => getComputedStyle(node).color)).match(/\d+/g).map(Number);
    assert.ok(Math.abs(red - blue) < 16, "the group title is neutral, not violet");
    await openState(page, "ownership-tree", { settle: 300 });
    const rails = await page.evaluate(() => [...document.querySelectorAll(".oak-ownership__tree ul")].map(list => {
      const last = list.lastElementChild, rail = getComputedStyle(last, "::after");
      return { rule: getComputedStyle(list).borderInlineStartWidth, railContent: rail.content, railHeight: parseFloat(rail.height), leaf: last.firstElementChild.getBoundingClientRect().height };
    }));
    assert.ok(rails.length >= 3);
    for (const rail of rails) {
      assert.equal(rail.rule, "0px", "the rail is drawn per row, not by the list border that runs past the last leaf");
      assert.notEqual(rail.railContent, "none");
      assert.ok(rail.railHeight <= rail.leaf + 12, "the last row's rail stops at its leaf");
    }
  } finally { await browser.close(); }
});

test("gallery: the streaming ghost is within 25% of the settled split height at 1280 and 390", async () => {
  const browser = await chromium.launch();
  try {
    for (const width of [1280, 390]) {
      const page = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage();
      const height = async id => { await openState(page, id, { settle: 300 }); return (await page.locator(".oak-ownership").first().boundingBox()).height; };
      const ghost = await height("ownership-streaming"), settled = await height("ownership-split");
      assert.ok(Math.abs(ghost - settled) / settled <= 0.25, `${width}: ghost ${ghost} against settled ${settled}`);
    }
  } finally { await browser.close(); }
});
