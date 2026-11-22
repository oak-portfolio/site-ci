import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const open = async (page, state) => {
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
  await page.waitForTimeout(300);
};
// Selects the first `length` characters of the first answer point's text, the way a drag would.
const select = (page, selector, length) => page.evaluate(([css, count]) => {
  const node = document.querySelector(css);
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  const first = walker.nextNode();
  let last = first, total = first.textContent.length;
  while (total < count && walker.nextNode()) { last = walker.currentNode; total += last.textContent.length; }
  const range = document.createRange();
  range.setStart(first, 0);
  range.setEnd(last, Math.min(last.textContent.length, last.textContent.length - (total - count)));
  const selection = document.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  const box = range.getBoundingClientRect(), lines = range.getClientRects();
  return { text: selection.toString().replace(/\s+/g, " ").trim(), raw: selection.toString(), centre: box.left + box.width / 2, bottom: lines[lines.length - 1].bottom };
}, [selector, length]);
const bar = page => page.evaluate(() => {
  const node = document.querySelector(".oak-pick");
  if (!node) return null;
  const box = node.getBoundingClientRect();
  return { centre: box.left + box.width / 2, top: box.top, opacity: Number(getComputedStyle(node).opacity),
    buttons: [...node.querySelectorAll("button")].map(button => button.textContent.trim()) };
});
// The bar leaves through an exit animation, so "removed" is waited for rather than read after a fixed pause.
const gone = page => page.locator(".oak-pick").waitFor({ state: "detached", timeout: 3000 });

test("D95-G1 selecting words in an answer offers Ask about this, Explain simply and Copy under the selection", async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
    const page = await context.newPage();
    await open(page, "answer-points");
    const picked = await select(page, ".oak-turn__answer .oak-answer__point p", 40);
    await page.locator(".oak-pick").waitFor({ timeout: 3000 });
    await page.waitForTimeout(350);
    const shown = await bar(page);
    assert.deepEqual(shown.buttons, ["Ask about this", "Explain simply", "Copy"]);
    assert.ok(Math.abs(shown.centre - picked.centre) <= 2 || shown.centre > picked.centre, `centred under the selection, clamped clear of the edge (${Math.round(shown.centre)} vs ${Math.round(picked.centre)})`);
    // Ticket 23: with more answer text right under the selection the bar sits above its first line instead.
    const gap = await page.evaluate(() => {
      const range = document.getSelection().getRangeAt(0), lines = range.getClientRects(), pick = document.querySelector(".oak-pick");
      const box = pick.getBoundingClientRect();
      return pick.dataset.side === "top" ? lines[0].top - box.bottom : box.top - lines[lines.length - 1].bottom;
    });
    assert.ok(gap >= 0 && gap <= 16, `just beside the selection, under its last line or above its first (${Math.round(gap)}px)`);
    assert.ok(shown.opacity > 0.95, "settled in");

    // Copy writes the phrase and confirms.
    await page.getByRole("toolbar", { name: "Selected text" }).getByRole("button", { name: "Copy" }).click();
    // D139 (intentional update, Codex review): Copy writes the selection exactly, spacing and line breaks included.
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), picked.raw, "the clipboard holds the selection");
    await page.locator("[data-slot='toast'], .ui-toast").filter({ hasText: "Selection copied" }).first().waitFor({ timeout: 3000 });
    await page.waitForTimeout(300);
    assert.equal(await page.locator(".oak-pick").count(), 0, "the bar leaves after acting");

    // Ask about this stages the phrase as a quote chip beside the message box, focuses it, and sends nothing.
    // D123 (intentional update): the quote is a chip now, not `About "<quote>": ` written into the draft.
    const before = await page.locator(".oak-turn").count();
    await select(page, ".oak-turn__answer .oak-answer__point p", 30);
    await page.locator(".oak-pick").waitFor({ timeout: 3000 });
    const quoted = await page.evaluate(() => document.getSelection().toString().replace(/\s+/g, " ").trim());
    await page.getByRole("toolbar", { name: "Selected text" }).getByRole("button", { name: "Ask about this" }).click();
    await page.waitForTimeout(300);
    const box = await page.evaluate(() => ({ value: document.querySelector(".oak-composer textarea").value, focused: document.activeElement === document.querySelector(".oak-composer textarea"),
      chip: document.querySelector(".oak-composer .oak-quote-chip__text")?.textContent }));
    assert.equal(box.chip, `\u201c${quoted}\u201d`, "the quote is a chip in the message box");
    assert.equal(box.value, "", "and the draft stays the visitor's own");
    assert.ok(box.focused, "and the message box has focus");
    assert.equal(await page.locator(".oak-turn").count(), before, "nothing was sent");

    // Escape drops the bar (and only the bar); collapsing the selection does too.
    await select(page, ".oak-turn__answer .oak-answer__point p", 30);
    await page.locator(".oak-pick").waitFor({ timeout: 3000 });
    await page.keyboard.press("Escape");
    await gone(page);
    assert.equal(await page.locator(".oak-pick").count(), 0, "Escape removes the bar");
    assert.equal(await page.locator(".oak-workspace").count(), 1, "and the workspace stays open");
    await select(page, ".oak-turn__answer .oak-answer__point p", 30);
    await page.locator(".oak-pick").waitFor({ timeout: 3000 });
    await page.evaluate(() => document.getSelection().removeAllRanges());
    await gone(page);
    assert.equal(await page.locator(".oak-pick").count(), 0, "a collapsed selection removes the bar");

    // A long selection copies whole; only the quote in the message box is capped.
    const long = await select(page, ".oak-turn__answer", 400);
    await page.locator(".oak-pick").waitFor({ timeout: 3000 });
    await page.getByRole("toolbar", { name: "Selected text" }).getByRole("button", { name: "Copy" }).click();
    assert.ok(long.text.length > 280, `a long selection (${long.text.length} chars)`);
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), long.raw, "Copy keeps every word");

    // Words outside answers (the visitor's own question) get nothing.
    await gone(page);
    await select(page, ".ui-message[data-align='end'] .ui-bubble__content", 12);
    await page.waitForTimeout(400);
    assert.equal(await page.locator(".oak-pick").count(), 0, "no bar outside answers");
  } finally {
    await browser.close();
  }
});

// M5 keyboard panel K0: Tab scrolls the transcript on its way to the bar, and a scroll used to drop the bar first.
test("D95-G5 a transcript scroll keeps the bar while the selection stands, still under the selection", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 600 } });
    await open(page, "answer-points");
    await select(page, ".oak-turn__answer .oak-answer__point p", 40);
    await page.locator(".oak-pick").waitFor({ timeout: 3000 });
    const moved = await page.evaluate(() => {
      let pane = document.getSelection().getRangeAt(0).startContainer.parentElement;
      while (pane && !(pane.scrollHeight > pane.clientHeight + 40 && /auto|scroll/.test(getComputedStyle(pane).overflowY))) pane = pane.parentElement;
      if (!pane) return 0;
      const before = pane.scrollTop;
      pane.scrollTop = before > 30 ? before - 30 : before + 30;
      pane.dispatchEvent(new Event("scroll"));
      return Math.abs(pane.scrollTop - before);
    });
    assert.ok(moved > 0, "the transcript scrolled");
    await page.waitForTimeout(400);
    assert.equal(await page.locator(".oak-pick").count(), 1, "the bar stays while words are still selected");
    const gap = await page.evaluate(() => {
      const range = document.getSelection().getRangeAt(0), lines = range.getClientRects(), pick = document.querySelector(".oak-pick");
      const box = pick.getBoundingClientRect();
      return pick.dataset.side === "top" ? lines[0].top - box.bottom : box.top - lines[lines.length - 1].bottom;
    });
    assert.ok(gap >= 0 && gap <= 16, `still just beside the selection after the scroll (${Math.round(gap)}px)`);
    await page.evaluate(() => document.getSelection().removeAllRanges());
    await gone(page);
    assert.equal(await page.locator(".oak-pick").count(), 0, "collapsing the selection still removes it");
  } finally {
    await browser.close();
  }
});
