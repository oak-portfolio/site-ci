import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTsx } from "../design-rework/load-tsx.mjs";

// Ticket 41: PageCards(claims) draws one card per cited page; the first opens its quick look in place, behind oakPageCards.
globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, location: { search: "" }, addEventListener() {}, removeEventListener() {} };
const flag = loadTsx("src/lib/oakFlags/pageCards.ts");
const { primeOakRecordFacts } = loadTsx("src/lib/oakRecordFacts.ts");
const { OakArrangedAnswer } = loadTsx("src/components/agent/OakOpenUIAnswer.tsx");

const REVISION = "k";
const cite = (id, anchor = "") => ({ documentId: id, passageId: `${id}:passage-001`, sectionId: `${id}:section-001`, url: `https://steveoak.com/work/${id.split(":")[1]}/${anchor ? `#${anchor}` : ""}` });
const work = (title, sections) => ({ kind: "work", dek: `${title} in one line.`, category: "Applied AI", articleStatus: "full", datePublished: "2025-01-01",
  cover: { src: `/c/${title}.webp`, alt: `${title} cover`, ratio: 1.91 }, coverTint: "#6fd39a", systemMap: [], artifacts: [], metrics: [], sections });
const CLAIMS = [
  { id: "claim-1", text: "EcoSmartLoop guided each sort with Orbi.", citations: [cite("work:ecosmartloop", "the-decision-loop")] },
  { id: "claim-2", text: "Oakminder is a voice-first reminder agent.", citations: [cite("work:oakminder")] },
];
const doc = (id, title) => ({ documentId: id, title: `${title}: case study`, canonicalUrl: `https://steveoak.com/work/${id.split(":")[1]}/`, card: { kind: "work", title, image: `/c/${title}.webp` } });
const LABELS = { knowledgeRevision: REVISION, documents: [doc("work:ecosmartloop", "EcoSmartLoop"), doc("work:oakminder", "Oakminder")] };
const answerOf = claims => ({ schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "c", hardPolicyVersion: "h", knowledgeRevision: REVISION, operations: [],
  kind: "sourced", acknowledgment: null, claims });
const seed = records => primeOakRecordFacts(REVISION, { version: 1, knowledgeRevision: REVISION, records });
const FACTS = { "work:ecosmartloop": work("EcoSmartLoop", [{ anchor: "the-decision-loop", title: "The decision loop" }]), "work:oakminder": work("Oakminder", []) };
const render = (claims = CLAIMS, labels = LABELS) => renderToStaticMarkup(createElement(OakArrangedAnswer, { id: "m1", answer: answerOf(claims), question: "Which pages talk about AI?", latest: true, citationLabels: labels,
  ui: { requestId: "00000000-0000-4000-8000-0000000000f1", status: "done", program: `root = Answer([pages])\npages = PageCards(["${claims.map(claim => claim.id).join('", "')}"])` } }));
const on = fn => { flag.forceOakPageCards(true); try { return fn(); } finally { flag.forceOakPageCards(null); } };
const count = (html, text) => html.split(text).length - 1;

seed(FACTS);
on(() => render());
await new Promise(resolve => setTimeout(resolve, 50));

test("PageCards constant ships on, and off draws each claim as the Source card", () => {
  assert.equal(flag.oakPageCards, true);
  flag.forceOakPageCards(false);
  const html = render();
  flag.forceOakPageCards(null);
  assert.equal(count(html, 'class="oak-openui-source"'), 2, html);
  assert.ok(!html.includes("oak-page-cards"), html);
});

test("on: one card per page, the first open in place by default with its cited section, quote, Open page link and Ask about this", () => {
  seed(FACTS);
  const html = on(() => render());
  assert.equal(count(html, 'class="oak-page-card"'), 2, html);
  const heads = html.match(/<button[^>]*oak-page-card__head[^>]*>/g) ?? [];
  assert.deepEqual(heads.map(head => head.match(/aria-expanded="(\w+)"/)?.[1]), ["true", "false"], "only the first card is open");
  assert.ok(html.indexOf('aria-expanded="true"') < html.indexOf("Oakminder"), "the open card is the first");
  assert.ok(html.includes('src="/c/EcoSmartLoop.webp"') && html.includes('src="/c/Oakminder.webp"'), "every card shows its cover");
  assert.ok(html.includes("The decision loop"), "the cited section from the page's own anchors");
  assert.ok(html.includes("EcoSmartLoop guided each sort with Orbi."), "the cited claim is the quote");
  assert.match(html, /<a [^>]*href="https:\/\/steveoak.com\/work\/ecosmartloop\/#the-decision-loop"[^>]*>[^]*?Open page/, "Open page is a real link to the cited section");
  assert.match(html, /<button[^>]*type="button"[^>]*>[^]*?Ask about this/);
  assert.ok(!html.includes("Oakminder is a voice-first reminder agent."), "a closed card leaves its quote out of the reading order");
});

test("a page cited twice is one card that places both claims; a claim with no page labels is its Source card", () => {
  seed(FACTS);
  const twice = [CLAIMS[0], { id: "claim-3", text: "Orbi explained each answer.", citations: [cite("work:ecosmartloop")] }];
  const html = on(() => render(twice));
  assert.equal(count(html, 'class="oak-page-card"'), 1);
  assert.ok(html.includes("EcoSmartLoop guided each sort with Orbi.") && html.includes("Orbi explained each answer."));
  const stray = [...CLAIMS, { id: "claim-4", text: "An outside page said so.", citations: [{ documentId: "web:x", passageId: "p", sectionId: "s", url: "https://example.com/" }] }];
  const mixed = on(() => render(stray));
  assert.equal(count(mixed, 'class="oak-page-card"'), 2);
  assert.ok(mixed.includes("An outside page said so."), "every claim is placed");
});

test("facts missing: cards still draw from the page labels, with no section line, and every claim placed", () => {
  seed({});
  const html = on(() => render());
  assert.equal(count(html, 'class="oak-page-card"'), 2, html);
  assert.ok(!html.includes("The decision loop"));
  assert.ok(html.includes("EcoSmartLoop guided each sort with Orbi."));
  seed(FACTS);
});

test("an unverified or outside URL gets no Open page and never reaches the markup", () => {
  seed(FACTS);
  const odd = [
    { id: "claim-5", text: "A private page.", citations: [{ ...cite("work:ecosmartloop"), url: "https://steveoak.com/private/notes/" }] },
    { id: "claim-6", text: "An outside page.", citations: [{ ...cite("work:oakminder"), url: "https://evil.example/oakminder/" }] },
  ];
  const html = on(() => render(odd));
  assert.ok(!html.includes("/private/notes") && !html.includes("evil.example"), html);
  assert.ok(!html.includes("Open page"), "no Open page for an unverified URL");
});

test("a card whose facts are still loading is one ghost card, not a whole ghost block inside a cell", () => {
  const pending = { ...LABELS, knowledgeRevision: "unprimed" };
  const html = on(() => renderToStaticMarkup(createElement(OakArrangedAnswer, { id: "m2", answer: { ...answerOf(CLAIMS), knowledgeRevision: "unprimed" }, question: "Which pages?", latest: true, citationLabels: pending,
    ui: { requestId: "00000000-0000-4000-8000-0000000000f2", status: "done", program: `root = Answer([pages])\npages = PageCards(["claim-1", "claim-2"])` } })));
  assert.ok(count(html, "data-ghost") >= 1, html);
  assert.equal(count(html, "oak-page-cards__grid"), 1, "one block, no block nested in a card cell");
});

test("the quick look sits on solid glass with no blur behind its body copy, with no motion under reduced motion", () => {
  const css = readFileSync("src/styles/openui/page-cards.css", "utf8");
  assert.match(css, /\[data-open\][^}]*--glass-fill-solid/);
  assert.doesNotMatch(css, /backdrop-filter/);
  assert.match(css, /prefers-reduced-transparency[^]*--glass-fill-solid/);
  assert.match(css, /prefers-reduced-motion/);
});
