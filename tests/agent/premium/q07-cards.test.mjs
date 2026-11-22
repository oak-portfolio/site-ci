import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import { loadTsx } from "../design-rework/load-tsx.mjs";
import { galleryUrl, openState } from "./gallery.mjs";

const { OakRoleFitReview, oakShortRequirement, oakRoleFitVerdict, oakLeadSentence } = loadTsx("src/components/agent/OakRoleFitReview.tsx");
const { OakAdviceAnswer } = loadTsx("src/components/agent/OakAdviceAnswer.tsx");
const { OakDocumentAnswer } = loadTsx("src/components/agent/OakDocumentAnswer.tsx");
const css = readFileSync("src/styles/oakAgent.css", "utf8");
const citation = { documentId: "work:ecosmartloop", passageId: "work:ecosmartloop:p", sectionId: "work:ecosmartloop:s", url: "https://steveoak.com/work/ecosmartloop/" };
const row = (id, status, text = `Requirement ${id}`) => ({ id, requirement: { text, start: 0, end: text.length }, status,
  evidence: status === "missing-evidence" ? [] : [{ id: `${id}-claim`, text: `Evidence for ${id}`, citations: [citation] }], gap: status === "missing-evidence" ? "No public case study." : null, questions: [] });
const long = "What you will do - Prototype and ship agent-facing product surfaces end to end with designers, researchers and the model team, from first sketch to production";
const roleFit = { kind: "role-fit", knowledgeRevision: "r", contactTopics: [], rows: [row("a", "missing-evidence"), row("b", "transferable"), row("c", "demonstrated", long), row("d", "demonstrated")] };
const rowsOfHtml = markup => markup.split('<section class="oak-role-review__row"').slice(1);
const render = answer => renderToStaticMarkup(createElement(OakRoleFitReview, { answer, onContact() {} }));
const open = async (page, state) => {
  await openState(page, state);
};

test("Q07-G1 a role-fit answer leads with a verdict and an 'Evidence for N of M requirements' count before its rows", () => {
  const html = render(roleFit);
  // R17 (intentional update, Oak review v14: "i still dont like the ui"; Workable 16a43e2d, Juicebox 46463a7f): the verdict
  // is one sentence that carries the count, then a legend naming each mark by icon and word with how many rows wear it.
  // R18 (intentional update, Oak review v15): the sentence reads "N of M requirements have evidence", with a segmented bar above the legend.
  // R19 (intentional update, Oak review v16): a scorecard. The verdict is its own line, the count sentence follows, a decorative
  // 3/4 ring leads, and the legend (dot, word, count) is the ring's text.
  assert.match(html, /<header class="oak-role-review__verdict" data-part="0"><div class="oak-role-review__gauge" aria-hidden="true">[^]*?3\/4[^]*?<h3 class="oak-role-review__verdict-title">Partial match<\/h3><p class="oak-role-review__verdict-sentence">3 of 4 requirements have evidence\.<\/p>/);
  const tally = [...html.matchAll(/<li data-status="([a-z-]+)"><span class="oak-role-review__dot"[^>]*><\/span><span class="oak-role-review__tally-label">(\w+)<\/span><strong>(\d)<\/strong><\/li>/g)].map(match => match.slice(1).join(" "));
  assert.deepEqual(tally, ["demonstrated Met 2", "transferable Partial 1", "missing-evidence Gap 1"], "each status is a word with its count, never colour alone");
  assert.match(html, /<span class="oak-role-review__ring"/, "the ring is the one visual summary");
  assert.ok(html.indexOf("oak-role-review__verdict") < html.indexOf("oak-role-review__row"), "the verdict comes before every row");
  assert.deepEqual(oakRoleFitVerdict([row("x", "demonstrated")]), { met: 1, total: 1, verdict: "Strong match", sentence: "Strong match: 1 of 1 requirement has evidence." });
  assert.equal(oakRoleFitVerdict([row("x", "demonstrated"), row("y", "transferable")]).verdict, "Good match");
  assert.equal(oakRoleFitVerdict([row("x", "missing-evidence"), row("y", "missing-evidence"), row("z", "transferable")]).verdict, "Low match", "gaps are never hidden behind a soft verdict");
});

test("Q07-G2 requirement rows show a short title (at most 80 characters), keep the full requirement one tap away, and group met before gaps", () => {
  assert.equal(oakShortRequirement("Motion design"), "Motion design");
  const short = oakShortRequirement(long);
  assert.ok(short.length <= 80, `${short.length} characters`);
  assert.match(short, /^Prototype and ship agent-facing/, "the section label before the requirement is dropped");
  assert.match(short, /\w\u2026$/, "cut on a whole word");
  const html = render(roleFit);
  const titles = [...html.matchAll(/<(?:h4|h5) class="oak-role-review__requirement"[^>]*><span class="sr-only">[^<]*<\/span>([^<]*)<\/h[45]>/g)].map(match => match[1]);
  assert.ok(titles.every(title => title.length <= 80), "every title fits");
  assert.deepEqual(titles, [short, "Requirement d", "Requirement b", "Requirement a"], "demonstrated, then transferable, then gaps");
  // R19 (intentional update): the full requirement opens in place from the row's chevron (the heading swaps short for the clause), so nothing repeats.
  assert.match(rowsOfHtml(html)[0], /oak-role-review__toggle/, "a shortened title offers its chevron");
  assert.doesNotMatch(html, /oak-role-review__full/, "no second disclosure row");
  // R17 (intentional update): no group labels; each row's own mark says met, partial or gap, in that order.
  assert.doesNotMatch(html, /oak-role-review__group/);
  const marks = [...html.matchAll(/<span class="oak-role-review__mark" data-status="([a-z-]+)">/g)].map(match => match[1]);
  assert.deepEqual(marks, ["demonstrated", "demonstrated", "transferable", "missing-evidence"]);
});

test("Q07-G3 role fit, advice and document answers share one answer-card shell at sheet radius, and their parts arrive one after another", async () => {
  const advice = renderToStaticMarkup(createElement(OakAdviceAnswer, { answer: { kind: "advice", scope: "supported-expertise", knowledgeRevision: "r",
    proposal: { recommendation: "Start with retrieval.", assumptions: ["Docs are public."], tradeoffs: ["Cheaper to evaluate."], nextStep: "List the top questions." },
    uncertainty: "General guidance.", evidence: [], contactOffer: false }, contactPreference: "open", onBrief() {}, onDecline() {} }));
  const quote = "Build agent interfaces.";
  const documentHtml = renderToStaticMarkup(createElement(OakDocumentAnswer, { answer: { kind: "document", claims: [{ id: "d1", quote,
    citation: { sourceId: "fixture:doc:section-1", label: "Document 1", sectionId: "section-1", start: 0, end: quote.length } }],
    coverage: { scope: "selected-spans-only", offsetUnit: "utf16", includedUtf16: 23, availableUtf16: 23, omittedUtf16: 0, quotedUtf16: 23, extractionCompleteness: "complete" } } }));
  for (const [name, html] of [["oak-role-review", render(roleFit)], ["oak-advice-card", advice], ["oak-document-answer", documentHtml]])
    assert.match(html, new RegExp(`^<section class="${name} oak-answer-card" aria-label=`), `${name} sits on the shared shell`);
  assert.match(css, /\.oak-answer-card \{[^}]*border-radius: var\(--oak-r-sheet\);/, "the shell takes the sheet step");
  assert.match(css, /\.oak-turn__answer\[data-arrive="live"\] \.oak-answer-card > \* \{[^}]*animation-delay: calc\(var\(--oak-reveal-base\) \+ var\(--oak-part, 0\) \* 110ms\);/, "each part waits its turn");
  assert.match(css, /prefers-reduced-motion: reduce\)[\s\S]*?\.oak-turn__answer\[data-arrive="live"\] \.oak-answer-card > \* \{\s*animation: none;/, "reduced motion shows the card at once");
  const parts = [...render(roleFit).matchAll(/data-part="(\d+)"/g)].map(match => Number(match[1]));
  assert.deepEqual(parts, [0, 1, 2, 3, 4], "R17 (intentional update): the verdict, then row by row");

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    for (const state of ["role-fit-answer", "advice", "answer-document"]) {
      await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
      const card = page.locator(".oak-turn__answer .oak-answer-card");
      await card.waitFor();
      let staggered = false;
      for (let tick = 0; tick < 120 && !staggered; tick++) {
        const opacity = await card.evaluate(node => [...node.children].map(child => Number(getComputedStyle(child).opacity)));
        staggered = opacity[0] > 0.95 && opacity.at(-1) < 0.5;
        if (opacity.every(value => value > 0.99)) break;
        await page.waitForTimeout(40);
      }
      assert.ok(staggered, `${state}: the first part is in while the last is still arriving`);
      await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
      assert.equal(await card.evaluate(node => parseFloat(getComputedStyle(node).borderTopLeftRadius)), 48, `${state}: sheet radius (R14 intentional update: the 48px frame step, ticket 25)`);
    }
  } finally {
    await browser.close();
  }
});

test("Q07-G4 a prepared brief scrolls into view as a proposal card with a receipt line saying Oak sent nothing", async () => {
  const browser = await chromium.launch();
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport });
      await open(page, "contact-brief");
      await page.getByRole("button", { name: "Prepare editable brief" }).click();
      const card = page.locator(".oak-brief__proposal");
      await card.waitFor();
      await page.waitForTimeout(700);
      const view = await card.evaluate(node => {
        const box = node.getBoundingClientRect(), frame = node.closest(".oak-workspace__reading, .oak-workspace").getBoundingClientRect();
        return { top: box.top, frame: { top: frame.top, bottom: frame.bottom }, radius: parseFloat(getComputedStyle(node).borderTopLeftRadius), label: node.getAttribute("aria-label"),
          receipt: node.querySelector(".oak-brief__receipt")?.textContent };
      });
      assert.ok(view.top >= view.frame.top - 1 && view.top < view.frame.bottom - 80, `${viewport.width}: the proposal is in view (${Math.round(view.top)} in ${Math.round(view.frame.top)}-${Math.round(view.frame.bottom)})`);
      assert.equal(view.radius, 48, "proposal card at the sheet step (R14 intentional update: the 48px frame step, ticket 25)");
      assert.equal(view.label, "Prepared brief");
      assert.equal(view.receipt, "Nothing was sent by Oak. You review it and send it yourself.");
      await page.close();
    }
    const ready = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await open(ready, "contact-brief-ready");
    assert.equal(await ready.locator(".oak-brief__proposal .oak-brief__receipt").count(), 1, "the gallery has the prepared state");
  } finally {
    await browser.close();
  }
});

// R15 live (compare a role on steveoak.com, 2026-10-22): the proof for "evaluation loops" led with the profile's first
// sentence, "Also call me Oak or Okkar Kyaw.", while the next sentence named eval loops. The lead is the sentence that shares
// the most words with the requirement; the whole quote still opens from More.
test("R15 a role-fit proof leads with the sentence that speaks to its requirement", () => {
  const quote = "Also call me Oak or Okkar Kyaw. I design and build useful AI products: workflows, eval loops, tool systems, and interfaces that make automated work easier to inspect and trust.";
  assert.match(oakLeadSentence(quote, 160, "Work with product and ML engineers on evaluation loops, eval tooling and quality bars"), /^I design and build useful AI products/);
  assert.equal(oakLeadSentence(quote, 160, "Ship Swift apps"), "Also call me Oak or Okkar Kyaw.", "no overlap keeps the first sentence");
  assert.equal(oakLeadSentence("One short proof.", 160, "anything"), "One short proof.");
  const html = renderToStaticMarkup(createElement(OakRoleFitReview, { onContact() {}, answer: { kind: "role-fit", knowledgeRevision: "r", contactTopics: [], rows: [
    { id: "a", status: "demonstrated", requirement: { text: "Work with ML engineers on eval loops", start: 0, end: 36 }, gap: null, questions: [],
      evidence: [{ id: "e", text: quote, citations: [citation] }] }] } }));
  // R19 (intentional update): the lead sentence shows collapsed and the row's chevron opens the whole quote in place (no inline More).
  assert.match(html, /<blockquote class="oak-quote">I design and build useful AI products[^<]*<\/blockquote><span class="oak-source-chip"/);
  assert.doesNotMatch(html, /Also call me Oak/, "collapsed, only the lead sentence shows");
  assert.match(html, /aria-label="Show more about this requirement"/, "a long proof offers its chevron");
});
