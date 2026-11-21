import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import { loadTsx } from "./load-tsx.mjs";
import workAnswers from "../work-answers.v1.json" with { type: "json" };
import states from "../../../src/data/dev/oak-states.json" with { type: "json" };

// D122: one quiet source chip per point (ChatGPT/Perplexity style), a hover/tap popover listing that point's sources,
// and one Sources panel for the whole answer instead of a repeated per-point pill list plus an inline stack.
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const open = async (page, state) => {
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
  await page.waitForTimeout(400);
};
const fixture = workAnswers.fixtures.find(entry => entry.id === "K01").expected;
const answer = { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "f", hardPolicyVersion: "f", operations: [], ...fixture, knowledgeRevision: "f" };
const docs = claim => [...new Set(claim.citations.map(citation => citation.documentId))];
const allDocs = [...new Set(answer.claims.flatMap(docs))];

test("D122-G1 each point ends with one inline source chip that names one source and counts the rest as +N", () => {
  const { OakWorkAnswer } = loadTsx("src/components/agent/OakWorkAnswer.tsx");
  const html = renderToStaticMarkup(createElement(OakWorkAnswer, { answer }));
  const points = [...html.matchAll(/<section class="oak-answer__point"[\s\S]*?<\/section>/g)].map(match => match[0]);
  assert.equal(points.length, answer.claims.length);
  for (const [index, point] of points.entries()) {
    const count = docs(answer.claims[index]).length;
    assert.equal(point.match(/class="oak-source-chip"/g)?.length, 1, `point ${index + 1} has exactly one chip`);
    assert.match(point, /<p>[\s\S]*<span class="oak-source-chip"[\s\S]*<\/p>/, `point ${index + 1}: the chip sits inside the point's paragraph, after its words`);
    if (count > 1) assert.match(point, new RegExp(`class="oak-source-chip__more"[^>]*>\\+${count - 1}<`), `point ${index + 1} counts the other ${count - 1}`);
    else assert.doesNotMatch(point, /oak-source-chip__more/);
    // Ticket 23: the name starts with the chip's visible words (label in name), then the full title.
    assert.match(point, new RegExp(`aria-label="Sources: [^"+,]+${count > 1 ? ` \\+${count - 1}` : ""}(, [^"]+)?"`), "the chip's name says what it holds");
  }
});

test("D122-G2 no point repeats a full source pill list, and the answer ends in one Sources button, not an inline stack", () => {
  // Review v4: the Sources button leads the turn's action row, so it renders from OakAnswerSources, not inside the answer body.
  const { OakWorkAnswer, OakAnswerSources } = loadTsx("src/components/agent/OakWorkAnswer.tsx");
  assert.doesNotMatch(renderToStaticMarkup(createElement(OakWorkAnswer, { answer })), /oak-answer__sources-button/, "the body has no Sources button");
  const html = renderToStaticMarkup(createElement(OakAnswerSources, { answer }));
  assert.doesNotMatch(html, /oak-message__source"/, "no numbered pills inside the answer");
  assert.doesNotMatch(html, /oak-answer__stack"|oak-answer__source-list/, "no inline expanding stack");
  assert.match(html, new RegExp(`<button type="button"[^>]*class="oak-answer__sources-button"[^>]*aria-haspopup="dialog"[\\s\\S]*?Sources[\\s\\S]*?${allDocs.length}[\\s\\S]*?</button>`));
  const single = { ...answer, claims: [{ ...answer.claims[0], citations: answer.claims[0].citations.slice(0, 1) }] };
  assert.doesNotMatch(renderToStaticMarkup(createElement(OakAnswerSources, { answer: single })), /oak-answer__sources-button/, "one source: its chip already names it");
});

test("D122-G3 a chip's popover lists that point's sources on hover, keyboard and tap", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await open(page, "answer-points");
    const chip = page.locator(".oak-turn__answer .oak-source-chip__trigger").first();
    const expected = docs(answer.claims[0]).length;
    await chip.scrollIntoViewIfNeeded();
    await chip.hover();
    const popover = page.locator(".oak-source-popover");
    await popover.waitFor({ timeout: 3000 });
    assert.equal(await popover.locator("a.oak-source-row").count(), expected, "one row per source document");
    assert.ok(await popover.locator(".oak-source-row__title").first().innerText(), "each row has a title");
    await page.mouse.move(5, 5);
    await popover.waitFor({ state: "detached", timeout: 3000 });
    await chip.focus();
    await page.keyboard.press("Enter");
    await popover.waitFor({ timeout: 3000 });
    await page.keyboard.press("Escape");
    await popover.waitFor({ state: "detached", timeout: 3000 });
    await page.close();

    const touch = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: true });
    const phone = await touch.newPage();
    await open(phone, "answer-points");
    const tapChip = phone.locator(".oak-turn__answer .oak-source-chip__trigger").first();
    await tapChip.scrollIntoViewIfNeeded();
    await tapChip.tap();
    await phone.locator(".oak-source-popover a.oak-source-row").first().waitFor({ timeout: 3000 });
    await touch.close();
  } finally {
    await browser.close();
  }
});

test("D122-G4 the Sources button opens a Sources panel that lists every cited source once, numbered like Copy with sources", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await open(page, "answer-points");
    const button = page.locator(".oak-turn__answer .oak-answer__sources-button");
    await button.scrollIntoViewIfNeeded();
    await button.click();
    const panel = page.getByRole("dialog", { name: "Sources" });
    await panel.waitFor({ timeout: 3000 });
    const rows = panel.locator("a.oak-source-row");
    assert.equal(await rows.count(), allDocs.length, "every cited document once");
    assert.deepEqual(await panel.locator(".oak-source-row__number").allInnerTexts(), allDocs.map((_, index) => String(index + 1)), "numbered in answer order");
    const firstUrls = allDocs.map(id => answer.claims.flatMap(claim => claim.citations).find(citation => citation.documentId === id).url);
    assert.deepEqual(await rows.evaluateAll(nodes => nodes.map(node => node.getAttribute("href"))), firstUrls, "same order and links as Copy with sources");
    assert.equal(await panel.locator(".oak-sources-panel__heading").first().innerText(), "Cited", "cited sources come first, under their own heading");
    // Provenance is said in words, not only by a favicon (WAVE9-EXA-ULTRA section 1).
    // D131: Steve's legacy case studies on his old Framer site are his own pages too, so they read Portfolio.
    const own = new Set(["steveoak.com", "independent-performance-642823.framer.app"]);
    assert.deepEqual(await panel.locator(".oak-source-row__origin").allInnerTexts(),
      firstUrls.map(url => own.has(new URL(url).hostname) ? "Portfolio" : "Web"), "each row says Portfolio or Web");
    await page.keyboard.press("Escape");
    await panel.waitFor({ state: "detached", timeout: 3000 });
  } finally {
    await browser.close();
  }
});

test("D122-G5 web sources show a bundled favicon or a globe with their host, never a runtime third-party fetch", () => {
  const { oakSourceSite } = loadTsx("src/lib/oakCitationLabels.ts");
  assert.deepEqual(oakSourceSite("https://steveoak.com/work/ecosmartloop/"), { host: "steveoak.com", firstParty: true, icon: null });
  assert.deepEqual(oakSourceSite("https://www.github.com/x"), { host: "github.com", firstParty: false, icon: "/assets/brand-icons/github.png" });
  assert.deepEqual(oakSourceSite("https://developers.cloudflare.com/workers/"), { host: "developers.cloudflare.com", firstParty: false, icon: "/assets/brand-icons/cloudflare.png" });
  assert.deepEqual(oakSourceSite("https://example.org/docs"), { host: "example.org", firstParty: false, icon: null }, "an unknown host gets the globe");
  const { OakPublicResearch } = loadTsx("src/components/agent/OakPublicResearch.tsx");
  const event = states.find(state => state.id === "research-sources").workspace.messages[0].research;
  const html = renderToStaticMarkup(createElement(OakPublicResearch, { event, state: "complete" }));
  assert.equal(html.match(/class="oak-source-face"/g)?.length, event.sources.length, "each web source leads with its face");
  assert.match(html, /<img[^>]+src="\/assets\/brand-icons\/cloudflare\.png"/, "a research host shows its bundled icon (P11-G2)");
  assert.doesNotMatch(html, /<img[^>]+src="https?:\/\//, "no remote favicon URL");
  assert.doesNotMatch(html, /oak-research__index/, "the host row replaces the bare number disc");
});

test("D122-G6 chips and popover rows breathe, and reduced motion fades the popover without movement", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    await open(page, "answer-points");
    const chip = page.locator(".oak-turn__answer .oak-source-chip__trigger").first();
    const shape = await chip.evaluate(node => { const style = getComputedStyle(node); return { left: parseFloat(style.paddingLeft), right: parseFloat(style.paddingRight), radius: style.borderRadius, height: node.getBoundingClientRect().height }; });
    assert.ok(shape.left >= 6 && shape.right >= 8, `chip padding ${shape.left}/${shape.right}`);
    assert.ok(shape.height >= 20 && shape.height <= 26, `chip height ${shape.height}`);
    assert.ok(parseFloat(shape.radius) >= shape.height / 2, "the chip is a capsule");
    await chip.scrollIntoViewIfNeeded();
    await chip.hover();
    const popup = page.locator(".oak-source-popover");
    await popup.waitFor({ timeout: 3000 });
    const motion = await popup.evaluate(node => ({ property: getComputedStyle(node).transitionProperty, radius: getComputedStyle(node).borderRadius }));
    assert.equal(motion.property, "opacity", "reduced motion keeps only the fade");
    // flip2: with oakAnswerOrnament on, the chip's popover grows as a frame (land5), so it takes --oak-r-frame (48px), not the 24px card step.
    assert.equal(motion.radius, "48px", "the growing popover takes the frame radius");
    const row = await popup.locator("a.oak-source-row").first().evaluate(node => { const style = getComputedStyle(node); return [parseFloat(style.paddingLeft), parseFloat(style.paddingTop)]; });
    assert.ok(row[0] >= 8 && row[1] >= 8, `row padding ${row}`);
  } finally {
    await browser.close();
  }
});
