import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
// D62: the brief references became an iOS inset group (rows carry the padding), so they are measured as rows, not a card.
// D116 re-tick: a prepared document (.oak-documents__doc) is a plain header over one group of rows, not a card.
const cards = [".oak-ocr__consent", ".oak-documents__preview:not(.oak-documents__doc)", ".oak-turn__stopped", ".oak-voice__stage",
  ".ui-radio-card", ".ui-attachment-dropzone", ".oak-message__card", ".oak-advice-card", ".oak-role-review"];
// Sectioned cards carry their padding on each hairline-divided section.
const sectioned = [".oak-advice-card", ".oak-role-review"];
const rows = [".oak-saved__row", ".oak-brief-reference", ".oak-documents__section", ".ui-questionnaire__choice"];
const states = ["ocr-consent", "funding", "saved-list", "document-selected", "document-upload", "interrupted", "failed", "budget-paused",
  "advice", "role-fit-answer", "contact-brief", "voice-recording", "account-purpose", "answer-document"];

test("D46-G1 one spacious card rhythm: shared corners and padding, room between cards, roomy rows, stacked funding", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const problems = [];
    let measured = 0;
    for (const state of states) {
      await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
      await page.waitForTimeout(500);
      const found = await page.evaluate(({ cards, sectioned, rows }) => {
        const shown = node => { const box = node.getBoundingClientRect(); return box.width > 0 && box.height > 0 && getComputedStyle(node).visibility !== "hidden"; };
        const px = value => Math.round(parseFloat(value));
        const out = { problems: [], count: 0 };
        const root = document.querySelector(".oak-workspace");
        const cardNodes = [...root.querySelectorAll(cards.join(","))].filter(shown);
        for (const node of cardNodes) {
          out.count++;
          const style = getComputedStyle(node), name = cards.find(selector => node.matches(selector));
          // Review v4 supersedes D46 for retry-only stopped cards (neutral tone, one action): one compact row at the card
          // radius (16px) with smaller padding (8px block and start, 16px before Retry at the end).
          const compact = node.matches('.oak-turn__stopped[data-tone="neutral"]') && node.querySelector(".oak-turn__stopped-actions")?.children.length === 1;
          if (compact) {
            const pad = [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft].map(px);
            // R11 (intentional update, Oak: rounder, less right padding): the one-row notice is a capsule with even 8px padding.
            if (px(style.borderTopLeftRadius) < px(style.height) / 2 - 1) out.problems.push(`${name} compact row corner ${style.borderTopLeftRadius}`);
            if (pad.join(" ") !== "8 8 8 8") out.problems.push(`${name} compact row padding ${pad.join(" ")}`);
            out.compact = (out.compact ?? 0) + 1;
            continue;
          }
          // D121 (Oak: large radius for big surfaces): cards share the sheet corner, 24px, concentric inside the 32px window.
          // R14 (intentional update, Oak review v11): every top-level card is a 48px frame (--oak-r-frame).
          if (px(style.borderTopLeftRadius) !== 48) out.problems.push(`${name} corner ${style.borderTopLeftRadius}`);
          if (!sectioned.includes(name)) {
            const pad = [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft].map(px);
            // R17 (intentional update, inset probe): a frame ending on a ghost button lets that button's own inset make up
            // its bottom pad (oakAgent.css, :has(.oak-documents__actions > .ui-button--ghost:last-child)).
            const ghostEnd = node.matches(":has(.oak-documents__actions > .ui-button--ghost:last-child)");
            if (Math.min(...(ghostEnd ? [pad[0], pad[1], pad[3]] : pad)) < 16 || (ghostEnd && pad[2] < 8)) out.problems.push(`${name} padding ${pad.join(" ")}`);
          }
          // Room to the next card among its siblings.
          for (let next = node.nextElementSibling; next; next = next.nextElementSibling) {
            if (!shown(next)) continue;
            if (cardNodes.includes(next)) {
              const a = node.getBoundingClientRect(), b = next.getBoundingClientRect();
              const gap = b.top >= a.bottom - 1 ? b.top - a.bottom : b.left >= a.right - 1 ? b.left - a.right : null;
              if (gap !== null && gap < 12) out.problems.push(`${name} ${Math.round(gap)}px from the next card`);
            }
            break;
          }
        }
        for (const node of [...root.querySelectorAll(rows.join(","))].filter(shown)) {
          out.count++;
          const style = getComputedStyle(node), name = rows.find(selector => node.matches(selector));
          // R17 (intentional update, Oak review v14 account-purpose and saved-list): rows inset by the row role on every side
          // (--oak-row-pad-inline, the 12px frame inset), so a round leaf sits concentric with a capsule and row text shares
          // one left edge with its group label; the inset probe (r14-surfaces) holds the exact values.
          if (Math.min(px(style.paddingTop), px(style.paddingBottom)) < 12 || Math.min(px(style.paddingLeft), px(style.paddingRight)) < 12)
            out.problems.push(`${name} row padding ${[style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft].map(px).join(" ")}`);
        }
        return out;
      }, { cards, sectioned, rows });
      measured += found.count;
      if (["interrupted", "failed"].includes(state)) assert.equal(found.compact, 1, `${state}: the retry-only stopped card is one compact row`);
      if (state === "budget-paused") assert.ok(!found.compact, "budget-paused keeps the full card");
      problems.push(...found.problems.map(problem => `${state}: ${problem}`));

      if (state === "funding") {
        const widths = await page.locator(".oak-funding .ui-radio-group").evaluate(group => [...group.querySelectorAll(".ui-radio-card")].map(card => card.getBoundingClientRect().width / group.getBoundingClientRect().width));
        assert.ok(widths.length >= 2 && widths.every(share => share > 0.95), `funding options stack full width: ${widths.map(share => share.toFixed(2))}`);
      }
      if (state === "funding") await page.locator(".oak-workspace").screenshot({ path: "/tmp/d46-funding.png" });
    }
    // D116 re-tick: the prepared document stopped being a card (its blocks are rows in one group), so one fewer card.
    // P12: the scan card dropped its consent card (no checkbox), one fewer again.
    // v3 review: the research consent card and its query row are gone, two fewer.
    assert.ok(measured >= 26, `measured ${measured} cards and rows`);
    assert.deepEqual(problems, []);
  } finally {
    await browser.close();
  }
});
