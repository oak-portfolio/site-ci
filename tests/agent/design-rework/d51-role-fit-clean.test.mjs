import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import { loadTsx } from "./load-tsx.mjs";

const { OakRoleFitReview } = loadTsx("src/components/agent/OakRoleFitReview.tsx");
const { plainQuote, wholeWordTitle, quoteParts } = loadTsx("src/lib/oakQuote.ts");
const { OakAdviceAnswer } = loadTsx("src/components/agent/OakAdviceAnswer.tsx");
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const citation = { documentId: "work:ecosmartloop", passageId: "work:ecosmartloop:p", sectionId: "work:ecosmartloop:s", url: "https://steveoak.com/work/ecosmartloop/" };
const row = (id, text, quote) => ({ id, requirement: { text, start: 1, end: 1 + text.length }, status: "demonstrated",
  evidence: [{ id: `${id}-claim`, text: quote, citations: [citation] }], gap: null, questions: [] });

test("D51-G1 role-fit titles start and end on whole words and evidence is a quote block with no authorship prefix", async () => {
  // Pure helpers.
  // D114 (Codex 4269751713): without the source nothing is guessed away; a short leading word can carry the meaning.
  assert.equal(wholeWordTitle("ou will design and build agent interfaces in React and", 1, 55), "ou will design and build agent interfaces in React and");
  assert.equal(wholeWordTitle("not just prototypes, and evaluate", 10, 43), "not just prototypes, and evaluate");
  assert.equal(wholeWordTitle("Motion design", 0, 13), "Motion design", "an untouched title gains no ellipsis");
  const original = "Role\nYou will design and build agent interfaces in React and TypeScript.";
  assert.equal(wholeWordTitle("ou will design and build agent interfaces in React and", 6, 60, original), "You will design and build agent interfaces in React and\u2026", "the original text snaps offsets outward");
  assert.equal(plainQuote("Steve Oak wrote: \u201cI built it.\u201d"), "I built it.");
  assert.equal(plainQuote("Steve wrote: \u201cI built it.\u201d"), "I built it.");
  assert.equal(plainQuote("Steve Oak and Sam Lee wrote: \u201cShipped.\u201d"), "Shipped.");
  // Advice evidence carries its dating in a parenthetical; the quote stands alone and the dates become a quiet caption.
  const dated = "Steve Oak wrote (work period: May 2026; published: 2026-05-27): \u201cUse RAG when the next step needs grounded context.\u201d";
  assert.deepEqual(quoteParts(dated), { quote: "Use RAG when the next step needs grounded context.", context: "Work from May 2026, published May 27, 2026", attributed: true });
  assert.equal(quoteParts("Steve Oak wrote during September to December 2025: \u201cI took the app around the classifier.\u201d").context, "Work from September to December 2025");
  const cite = { documentId: "agentic-brain", url: "https://steveoak.com/work/agentic-brain", title: "Agentic Brain", type: "case-study" };
  const advice = renderToStaticMarkup(createElement(OakAdviceAnswer, { answer: { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "f", hardPolicyVersion: "f", knowledgeRevision: "f", operations: [],
    kind: "advice", scope: "supported-expertise", proposal: { recommendation: "Start with retrieval.", assumptions: [], tradeoffs: [], nextStep: "List the top questions." },
    uncertainty: "General guidance.", evidence: [{ id: "e1", text: dated, citations: [cite] }], contactOffer: false }, contactPreference: "open", onBrief: () => {}, onDecline: () => {} }));
  assert.doesNotMatch(advice, /wrote/, "advice evidence names nobody in the third person");
  assert.match(advice, /<blockquote[^>]*class="oak-quote"[^>]*>Use RAG when the next step needs grounded context\.<\/blockquote><p class="oak-quote__when">Work from May 2026, published May 27, 2026<\/p><span class="oak-source-chip"/, "quote, caption, then its source (D130: the inline chip)");
  assert.equal(plainQuote("A quote with \u201cinner\u201d marks"), "A quote with \u201cinner\u201d marks");

  // Server render with mid-word offsets.
  const answer = { kind: "role-fit", knowledgeRevision: "r", contactTopics: [], rows: [
    row("a", "ou will design and build agent interfaces in React and", "Steve Oak wrote: \u201cI built agent interfaces.\u201d"),
    row("b", "ckly, and evaluate mo", "Steve wrote: \u201cI evaluated model output.\u201d")] };
  const html = renderToStaticMarkup(createElement(OakRoleFitReview, { answer, onContact() {} }));
  assert.doesNotMatch(html, /Steve( Oak)? wrote/, "no third-person lead-in");
  assert.doesNotMatch(html, />\u201c|\u201d</, "no wrapping marks");
  // D114 (Codex 4269751713): without the role description the validated words stay as they are; with it, offsets snap out.
  assert.match(html, />ou will design and build agent interfaces in React and<\/h4>/);
  const sourced = renderToStaticMarkup(createElement(OakRoleFitReview, { answer: { ...answer, rows: answer.rows.slice(0, 1) }, onContact() {},
    roleDescription: "You will design and build agent interfaces in React and TypeScript." }));
  // Q16 (intentional update): with the source the heading is the whole clause the span covers, never a cut phrase (D7).
  assert.match(sourced, />You will design and build agent interfaces in React and TypeScript\.<\/h4>/, "the source snaps a cut span to its whole clause");
  assert.match(html, /<blockquote class="oak-quote">I built agent interfaces\.<\/blockquote><span class="oak-source-chip"/, "quote block, then its source chip (D130)");

  // A private document quote is the visitor's exact text and is never reworded (D107); this cleanup is for public evidence only.

  // Browser: the gallery card at 1440 by 900.
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${galleryUrl}/__dev/oak-states?state=role-fit-answer`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
    const view = await page.locator(".oak-role-review").evaluate(card => ({
      titles: [...card.querySelectorAll(".oak-role-review__requirement")].map(node => node.textContent.replace(/^Visitor-supplied role requirement: /, "")),
      text: card.textContent,
      quotes: [...card.querySelectorAll(".oak-role-review__evidence")].map(node => {
        const quote = node.querySelector("blockquote.oak-quote"), style = quote && getComputedStyle(quote);
        return { has: !!quote, rule: style?.borderInlineStartWidth, next: quote?.nextElementSibling?.className };
      }) }));
    // D114: the gallery's row carries whole-word offsets, as a live turn's do once they snap against the role description.
    // R17 (intentional update, interrogate M7): the fixture's requirements match evidence that supports them.
    assert.match(view.titles[0], /^Own the app side of an AI product, from API integration to admin views$/);
    for (const title of view.titles) assert.doesNotMatch(title, /^[\p{Ll}]/u, "no title starts on a cut word");
    assert.doesNotMatch(view.text, /Steve( Oak)? wrote/);
    assert.ok(view.quotes.length >= 2);
    for (const quote of view.quotes) { assert.equal(quote.has, true); /* R17 (intentional update): the proof sits in its own well, so the quote drops its 2px rule. */ assert.equal(quote.rule, "0px"); assert.equal(quote.next, "oak-source-chip", "source chip follows the quote (D130)"); }
    await page.locator(".oak-role-review").screenshot({ path: "/tmp/d51-role-fit-1440x900.png" });
    await page.screenshot({ path: "/tmp/d51-role-fit-page-1440x900.png" });
  } finally {
    await browser.close();
  }
});
