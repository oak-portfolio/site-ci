import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const longAnswer = "Steve owned the application around the classifier: the scanner, API integration, rewards and the mobile shell. ".repeat(18);
const open = async (page, state) => {
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
  await page.waitForTimeout(500);
};

test("D58-G1 answers land in place, and selected document sections ride in the message box", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    for (const [state, question] of [["empty", "What did Steve own on EcoSmartLoop?"], ["long-conversation", "And what would he change next time?"]]) {
      await open(page, state);
      await page.evaluate(text => window.__oakGallery.sendUser(text), question);
      await page.waitForTimeout(600);
      // Sample every frame while the whole answer lands.
      await page.evaluate(() => {
        window.__frames = [];
        const tick = () => {
          const viewport = document.querySelector(".oak-conversation__viewport");
          if (viewport) window.__frames.push({ top: viewport.scrollTop, max: viewport.scrollHeight - viewport.clientHeight });
          if (window.__frames.length < 90) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      await page.evaluate(text => window.__oakGallery.completeAssistant(text), longAnswer);
      await page.waitForTimeout(1800);
      const frames = await page.evaluate(() => window.__frames);
      const jumps = frames.slice(1).map((frame, index) => Math.abs(frame.top - frames[index].top));
      assert.ok(frames.length > 30, `${state}: sampled ${frames.length} frames`);
      assert.ok(Math.max(...jumps) <= 24, `${state}: largest scroll step ${Math.max(...jumps).toFixed(1)} px`);
      const answerEnd = await page.evaluate(() => {
        const viewport = document.querySelector(".oak-conversation__viewport");
        const turn = [...document.querySelectorAll('[data-slot="message"][data-align="start"]')].at(-1);
        return viewport.scrollHeight - viewport.clientHeight >= 0 ? { top: viewport.scrollTop, start: turn.offsetTop } : null;
      });
      assert.ok(Math.max(...frames.map(frame => frame.top)) <= answerEnd.start + 24, `${state}: the view never runs past the answer's start toward its end`);
      const placed = await page.evaluate(() => {
        const viewport = document.querySelector(".oak-conversation__viewport").getBoundingClientRect();
        const asked = [...document.querySelectorAll('[data-slot="message"][data-align="end"]')].at(-1).getBoundingClientRect();
        const answer = [...document.querySelectorAll('[data-slot="message"][data-align="start"]')].at(-1).getBoundingClientRect();
        return { asked: asked.top - viewport.top, answer: answer.top - viewport.top, height: viewport.height };
      });
      assert.ok(placed.asked >= 0 && placed.answer > placed.asked && placed.answer < placed.height / 2, `${state}: the answer starts on screen under its question (${JSON.stringify(placed)})`);
    }

    await open(page, "answer-document");
    const layout = await page.evaluate(() => {
      const rect = node => node?.getBoundingClientRect();
      const chips = rect(document.querySelector(".oak-related"));
      const overlaps = [...document.querySelectorAll(".oak-workspace__status")].filter(node => {
        const box = node.getBoundingClientRect();
        return box.height > 0 && chips && box.bottom > chips.top && box.top < chips.bottom;
      }).map(node => node.textContent.trim().slice(0, 60));
      // Q18 F4 (intentional update): the row also holds the clear button, so only the section chips are counted.
      return { attachments: document.querySelectorAll('.oak-composer__attachments [aria-label$="review selection"]').length, overlaps, chips: Boolean(chips),
        stray: [...document.querySelectorAll(".oak-workspace__status")].some(node => /Your next answer includes/.test(node.textContent)) };
    });
    // v3 review (intentional update): one chip per document carries its selected parts.
    assert.equal(layout.attachments, 1, "the selected document sits in the message box");
    assert.ok(layout.chips, "the Related rows are shown");
    assert.deepEqual(layout.overlaps, [], "no status line sits over the Related rows");
    assert.equal(layout.stray, false, "the redundant selection status line is gone");
    const chip = page.locator(".oak-composer__attachments button").first();
    assert.match(await chip.getAttribute("aria-label"), /^job-post\.txt · 2 parts, review selection$/);
    await chip.hover();
    await page.waitForFunction(() => [...document.querySelectorAll(".ui-tooltip-content")].some(node => node.textContent.includes("Review selection")), null, { timeout: 3000 });
    await page.locator(".oak-workspace").screenshot({ path: "/tmp/d58-attachments.png" });
    await chip.click();
    await page.getByRole("heading", { name: "Private documents" }).waitFor({ timeout: 3000 });
  } finally {
    await browser.close();
  }
});

test("D58-G2 prepared files leave the staged list, and block cards are compact with a hinted highlight icon", async () => {
  const { readFileSync } = await import("node:fs");
  const workspace = readFileSync(new URL("../../../src/lib/oakDocumentsWorkspace.ts", import.meta.url), "utf8");
  assert.match(workspace, /prepared = result; restoredDocuments = \[\]; active = null; stagedFiles = \[\];/, "a successful prepare drops the staged files");
  assert.match(workspace, /restored: false, error: null, stagedFiles: \[\], stagedSizes: \[\] \}\);/, "and clears their rows");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await open(page, "document-selected");
    const cards = await page.evaluate(() => [...document.querySelectorAll(".oak-documents__section")].map(card => {
      const header = card.querySelector(".oak-documents__choice").getBoundingClientRect();
      // R12 (intentional update): each part's page and share tags sit under its words, so the part ends at its tag line.
      const words = card.querySelector(".ui-textarea").getBoundingClientRect(), tags = card.querySelector(".oak-documents__tags")?.getBoundingClientRect();
      const text = { bottom: Math.max(words.bottom, tags?.bottom ?? 0) };
      const box = card.getBoundingClientRect();
      const style = getComputedStyle(card);
      // v3 review (intentional update): the text sits inside the check row, so the row's own bottom padding is not slack.
      const row = getComputedStyle(card.querySelector(".oak-documents__choice"));
      // The row ends at its tallest child: the text, or the 36px highlight action beside a one-line part.
      const action = card.querySelector(".oak-documents__choice > .ui-button--icon")?.getBoundingClientRect().bottom ?? 0;
      return { slack: Math.round(box.bottom - Math.max(text.bottom, action) - parseFloat(style.paddingBottom) - parseFloat(row.paddingBottom)), headerHasAction: !!card.querySelector(".oak-documents__choice > .ui-button--icon"),
        selected: card.hasAttribute("data-selected"), border: style.borderTopColor, actionLabel: card.querySelector(".oak-documents__choice > .ui-button--icon")?.getAttribute("aria-label") };
    }));
    assert.ok(cards.length >= 3, `measured ${cards.length} block cards`);
    for (const [index, card] of cards.entries()) {
      assert.ok(card.slack <= 2, `block ${index + 1} ends at its text (${card.slack}px of slack)`);
      assert.ok(card.headerHasAction && card.actionLabel === "Use highlighted text", `block ${index + 1} has the highlight icon in its header`);
      if (card.selected) assert.doesNotMatch(card.border, /rgb\(255, 255, 255\)/, `selected block ${index + 1} has no white edge`);
    }
    await page.locator(".oak-documents__section").nth(2).locator(".oak-documents__choice > .ui-button--icon").hover();
    await page.waitForFunction(() => [...document.querySelectorAll(".ui-tooltip-content")].some(node => node.textContent.includes("Use highlighted text")), null, { timeout: 3000 });
  } finally {
    await browser.close();
  }
});
