import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
// Gallery state, the kind's tone, and whether its card offers Retry. Q03 (intentional update): one neutral notice for every
// kind; only a real limit (allowance, budget) tints its tile gold (brief O4, O5).
const cases = [["quota-reached", "limit", false], ["agent-unavailable", "neutral", false], ["connection-lost", "neutral", "bubble"], ["server-unreachable", "neutral", "bubble"],
  ["model-busy", "neutral", true], ["answers-paused", "neutral", true], ["budget-paused", "limit", false], ["interrupted", "neutral", true], ["failed", "neutral", true]];

test("D47-G1 every stopped card shares one anatomy: art, a short bold title, one quiet line, actions below, one surface", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const tones = new Map();
    for (const [state, tone, retry] of cases) {
      await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
      await page.waitForTimeout(500);
      const card = page.locator(".oak-turn__stopped").last();
      await card.waitFor();
      const shape = await card.evaluate(node => {
        const box = element => element?.getBoundingClientRect();
        const art = node.querySelector(".oak-turn__stopped-art"), title = node.querySelector(".oak-turn__stopped-title"), detail = node.querySelector(".oak-turn__stopped-detail");
        const actions = [...node.querySelectorAll(".oak-turn__stopped-actions :is(button, a)")];
        return { tone: node.dataset.tone, border: getComputedStyle(node).borderTopColor, title: title?.textContent.trim(), weight: Number(getComputedStyle(title).fontWeight),
          detail: detail?.textContent.trim(), artRight: box(art)?.right, artHeight: box(art)?.height, textLeft: box(title)?.left, textBottom: box(detail)?.bottom,
          textTop: box(title)?.top, textRight: Math.max(box(title)?.right ?? 0, box(detail)?.right ?? 0), actionsLeft: Math.min(...actions.map(action => box(action).left)),
          actionsBottom: Math.max(...actions.map(action => box(action).bottom)),
          actionsTop: Math.min(...actions.map(action => box(action).top)), actions: actions.map(action => action.getAttribute("aria-label") ?? action.textContent.trim()), text: node.innerText };
      });
      assert.equal(shape.tone, tone, `${state}: tone`);
      assert.ok(shape.title && shape.title.length < 60, `${state}: short title "${shape.title}"`);
      assert.ok(shape.weight >= 600, `${state}: the title is bold`);
      assert.ok(shape.detail && shape.detail.length < 100, `${state}: one quiet line "${shape.detail}"`);
      assert.ok(shape.artRight <= shape.textLeft && shape.artHeight >= 24, `${state}: art at the left`);
      // Review v4 supersedes D47's "actions below" for retry-only cards (neutral tone, one action): one compact row with the
      // action at its end, beside the text. Limit, handoff and contact cards keep their actions on a row below.
      // T23a-11 (intentional update): a send that never arrived offers its one Retry on the visitor's bubble, so its card
      // keeps the art, title and line with no action of its own.
      if (retry === "bubble") {
        assert.deepEqual(shape.actions, [], `${state}: the card leaves Retry to the bubble`);
        assert.equal(await page.locator(".oak-turn__send-failed").getByRole("button", { name: "Retry" }).count(), 1, `${state}: Retry on the bubble`);
        assert.doesNotMatch(shape.text, /Oak AI|Steve Oak|the agent|assistant|Oak will|Oak can/i, `${state}: Oak speaks for itself`);
        tones.set(state, shape.border);
        continue;
      }
      const compact = shape.tone === "neutral" && shape.actions.length === 1;
      if (compact) {
        assert.ok(shape.actionsLeft >= shape.textRight - 1, `${state}: the one action sits at the row's end, right of the text`);
        assert.ok(shape.actionsTop < shape.textBottom && shape.actionsBottom > shape.textTop, `${state}: the action shares the text's row`);
      } else assert.ok(shape.actions.length >= 1 && shape.actionsTop >= shape.textBottom - 1, `${state}: actions on a row below the text`);
      // Q09 (intentional update): a turn the visitor stopped offers Continue; every other retryable card offers Retry.
      const verb = state === "interrupted" ? "Continue" : "Retry";
      assert.equal(shape.actions.includes(verb), retry, `${state}: ${verb} ${retry ? "offered" : "withheld"}`);
      assert.doesNotMatch(shape.text, /Oak AI|Steve Oak|the agent|assistant|Oak will|Oak can/i, `${state}: Oak speaks for itself`);
      tones.set(state, shape.border);
    }
    assert.equal(new Set(tones.values()).size, 1, `every kind shares one border: ${JSON.stringify([...tones])}`);
    await page.goto(`${galleryUrl}/__dev/oak-states?state=model-busy`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
    await page.locator(".oak-turn__stopped").last().screenshot({ path: "/tmp/d47-model-busy.png" });
  } finally {
    await browser.close();
  }
});
