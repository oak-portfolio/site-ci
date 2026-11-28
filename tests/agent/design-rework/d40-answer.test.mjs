import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import { loadTsx } from "./load-tsx.mjs";
import workAnswers from "../work-answers.v1.json" with { type: "json" };

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const { OakWorkAnswer, OakAnswerSources } = loadTsx("src/components/agent/OakWorkAnswer.tsx");
const open = async (page, state) => {
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
  await page.waitForTimeout(900);
};

// D122 replaced the per-point pill rows and the expanding stack: each point ends in one chip, and a Sources button opens a panel.
// Review v4 supersedes D40's "the Sources button closes the answer body": the pill now leads the turn's footer action row.
test("D40-G1 each sourced point is its own block ending in its source chip, and one Sources button closes the answer and opens every source", async () => {
  const fixture = workAnswers.fixtures.find(entry => entry.id === "K01").expected;
  const answer = { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "f", hardPolicyVersion: "f", operations: [], ...fixture, knowledgeRevision: "f" };
  const documents = new Set(answer.claims.flatMap(claim => claim.citations.map(citation => citation.documentId))).size;
  const html = renderToStaticMarkup(createElement(OakWorkAnswer, { answer }));
  assert.equal(html.match(/class="oak-answer__point"/g)?.length, answer.claims.length, "one block per point");
  // D71: a point's words are wrapped for the reveal, so compare its text with the tags stripped.
  const points = [...html.matchAll(/<p>([\s\S]*?)<span class="oak-source-chip"/g)].map(match => match[1].replace(/<[^>]+>/g, "").trim());
  assert.deepEqual(points.map(text => text.replaceAll("&#x27;", "'").replaceAll("&quot;", '"').replaceAll("&amp;", "&")), answer.claims.map(claim => claim.text), "each chip follows its point's text");
  assert.doesNotMatch(html, /oak-answer__sources-button/, "the answer body no longer carries the Sources button");
  const sources = renderToStaticMarkup(createElement(OakAnswerSources, { answer }));
  assert.match(sources, new RegExp(`class="oak-answer__sources-button"[^>]*>[\\s\\S]*?Sources</span><span class="oak-answer__sources-count">${documents}</span></button>`), "the button names the count");
  const single = { ...answer, claims: [{ ...answer.claims[0], citations: answer.claims[0].citations.slice(0, 1) }] };
  assert.equal(renderToStaticMarkup(createElement(OakAnswerSources, { answer: single })), "", "one source needs no button; its chip names it");

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await open(page, "answer-points");
    const layout = await page.evaluate(() => [...document.querySelectorAll(".oak-turn__answer .oak-answer__point")].map(point => {
      const box = point.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, textDisplay: getComputedStyle(point.querySelector("p")).display };
    }));
    assert.ok(layout.length >= 2, `points rendered: ${layout.length}`);
    for (const [index, point] of layout.entries()) {
      assert.equal(point.textDisplay, "block", `point ${index + 1} text is its own block`);
      if (index) assert.ok(point.top - layout[index - 1].bottom >= 12, `point ${index + 1} sits ${point.top - layout[index - 1].bottom}px from the one before`);
    }
    const button = page.locator(".oak-turn__answer .ui-message__footer .oak-answer__sources-button");
    const box = await button.boundingBox();
    assert.ok(box.y >= layout.at(-1).bottom, "the Sources button sits after the answer");
    // Review v5 supersedes v4's order: Related leads on the left, and the right-hand group reads Sources, Copy answer,
    // Ask again (when offered), More.
    const row = await page.locator(".oak-turn__answer .ui-message__footer .oak-turn__actions").last().evaluate(footer => [...footer.children].map(child =>
      child.classList.contains("oak-answer__sources") ? "Sources" : child.classList.contains("oak-turn__more") ? "More"
        : child.getAttribute("aria-label") ?? child.className));
    assert.equal(row[0], "Sources", `the Sources pill leads the footer row (${row})`);
    assert.equal(row[1], "Copy answer", `Copy answer follows it (${row})`);
    assert.equal(row.at(-1) === "More" || row.at(-2) === "More", true, `More closes the action row (${row})`);
    assert.ok(box.height >= 32, `the button is a comfortable target: ${box.height}`);
    const icons = await button.locator(".oak-answer__stack-icon").evaluateAll(nodes => nodes.map(node => { const rect = node.getBoundingClientRect(); return { left: rect.left, right: rect.right }; }));
    assert.ok(icons.length >= 1 && icons.length <= 3, `type icons: ${icons.length}`);
    for (let index = 1; index < icons.length; index++) assert.ok(icons[index].left < icons[index - 1].right, "the type icons overlap");
    await button.focus();
    await page.keyboard.press("Enter");
    const rows = page.locator(".oak-sources-panel a.oak-source-row");
    await rows.first().waitFor({ timeout: 3000 });
    assert.equal(await rows.count(), documents, "every source is listed once");
    await page.screenshot({ path: "/tmp/d40-answer-points-1440x900.png" });
  } finally {
    await browser.close();
  }
});

test("D40-G2 the Related rows under an answer stack one per question and never scroll sideways, at 1440x900 and 1024x768", async () => {
  // v3 review (intentional update): Oak asked for Perplexity's rows under the answer in place of two-line pills over the composer.
  const browser = await chromium.launch();
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }]) {
      const page = await browser.newPage({ viewport });
      for (const state of ["answer-sourced", "role-fit-answer"]) {
        await open(page, state);
        const where = `${state} ${viewport.width}x${viewport.height}`;
        const shape = await page.locator(".oak-related .ui-suggestions").last().evaluate(node => {
          const rows = [...node.querySelectorAll(".ui-suggestion")].map(row => row.getBoundingClientRect());
          const width = node.getBoundingClientRect().width;
          return { count: rows.length, full: rows.every(row => Math.abs(row.width - width) <= 1),
            stacked: rows.every((row, index) => !index || row.top >= rows[index - 1].bottom - 1), scroll: node.scrollWidth - node.clientWidth,
            inAnswer: Boolean(node.closest("[data-slot=message]")) };
        });
        assert.ok(shape.count >= 2, `${where}: follow-ups rendered`);
        assert.ok(shape.full && shape.stacked, `${where}: one full-width row per question`);
        assert.equal(shape.scroll, 0, `${where}: nothing clips sideways`);
        assert.ok(shape.inAnswer, `${where}: the rows belong to the answer`);
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
