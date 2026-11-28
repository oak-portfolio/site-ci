import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import { loadTsx } from "../design-rework/load-tsx.mjs";
import { galleryUrl, openState } from "./gallery.mjs";

globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, addEventListener() {}, removeEventListener() {} };
const { OakSourceRow, OakSourceFace } = loadTsx("src/components/agent/OakSourceChip.tsx");
const { OakAnswerSources } = loadTsx("src/components/agent/OakWorkAnswer.tsx");
const { primeOakExcerpts } = loadTsx("src/lib/oakSourceExcerpts.ts");

const snapshot = JSON.parse(readFileSync("src/data/generated/knowledgeSnapshot.json", "utf8"));
const revision = "r-q05";
const labels = { knowledgeRevision: revision, documents: snapshot.documents.map(({ id, title, canonicalUrl }) => ({ documentId: id, title, canonicalUrl })) };
const cite = (documentId, url) => {
  const passage = snapshot.documents.find(document => document.id === documentId).passages[0];
  return { documentId, passageId: passage.id, sectionId: passage.sectionId, url: url ?? passage.citationUrl };
};
const coursera = cite("credential:google-ux"), hype4 = cite("credential:hifi-ui-2"), eco = cite("work:ecosmartloop");
const broken = cite("legacy:agentic-brain", "https://independent-performance-642823.framer.app/codex/old-memory-page");
primeOakExcerpts({ knowledgeRevision: revision, passages: { [eco.passageId]: "You are holding a greasy takeout container, and all three bins look partly right.",
  [coursera.passageId]: "Google UX Design Professional Certificate. Historical source statement." } });
const row = citation => renderToStaticMarkup(createElement(OakSourceRow, { citation, knowledgeRevision: revision, citationLabels: labels, number: 1 }));

test("Q05-G1 a source row shows its site, its title and a two-line excerpt of the cited passage", () => {
  const html = row(eco);
  assert.match(html, /class="oak-source-row__kind-text">Case study</);
  assert.match(html, /class="oak-source-row__title">EcoSmartLoop: AI Agent Platform/);
  assert.match(html, /class="oak-source-row__excerpt">You are holding a greasy takeout container/);
  const css = readFileSync("src/styles/oakAgent.css", "utf8");
  assert.match(css, /\.oak-source-row__excerpt \{[^}]*-webkit-line-clamp: 2;/, "the excerpt clamps to two lines");
  // A stale page (another knowledge revision) shows no excerpt rather than a wrong one.
  assert.doesNotMatch(renderToStaticMarkup(createElement(OakSourceRow, { citation: eco, knowledgeRevision: "older", citationLabels: labels })), /oak-source-row__excerpt/);
});

test("Q05-G1 the excerpt endpoint serves every snapshot passage, trimmed", async () => {
  const response = await fetch(`${galleryUrl}/oak/excerpts.json`);
  assert.equal(response.status, 200);
  const body = await response.json();
  const passages = snapshot.documents.flatMap(document => document.passages);
  assert.equal(Object.keys(body.passages).length, passages.length);
  assert.ok(Object.values(body.passages).every(text => text.length <= 181), "no excerpt runs past 180 characters plus an ellipsis");
});

test("Q05-G2 a web host with no bundled icon or cover shows no face, never a globe or a fetched favicon", () => {
  // Review v6 (intentional update, Oak: "if none exists then only show without"): a source with no cover and no bundled icon
  // draws no face at all, so its chip and row read as words only; the initial cell is retired.
  const face = renderToStaticMarkup(createElement(OakSourceFace, { url: "https://example.org/post" }));
  assert.equal(face, "", "no face, no globe glyph and no fetched favicon");
  assert.match(renderToStaticMarkup(createElement(OakSourceFace, { url: coursera.url, documentId: coursera.documentId })),
    /data-face="brand"[^>]*><img src="\/assets\/brand-icons\/coursera\.png"/, "a cited credential host shows its bundled icon");
  assert.match(row(coursera), /class="oak-source-row__kind-text">coursera\.org</);
  assert.match(renderToStaticMarkup(createElement(OakSourceFace, { url: "https://github.com/Absorber97" })), /data-face="brand"[^>]*><img src="\/assets\/brand-icons\/github\.png"/);
});

test("Q05-G3 a link that fails its check renders Unverified, stays listed with its title, and is not a link", () => {
  const html = row(broken);
  assert.match(html, /^<div class="oak-source-row" data-verified="false"/);
  assert.doesNotMatch(html, /href=/);
  assert.match(html, /data-origin="unverified"[^>]*>.*Unverified<\/span>/);
  assert.match(html, /class="oak-source-row__title">How a Small ML Project/);
  assert.match(row(eco), /^<a class="oak-source-row" href="https:\/\/steveoak\.com\/work\/ecosmartloop\/#the-three-bin-pause"/);
  // A stale tab (labels from another revision) cannot check anything, so it marks nothing.
  const stale = renderToStaticMarkup(createElement(OakSourceRow, { citation: broken, knowledgeRevision: "newer", citationLabels: labels }));
  assert.doesNotMatch(stale, /Unverified/);
});

test("Q05-G4 the Sources pill stacks the first three sources' own faces", () => {
  // Production labels carry a cover for Steve's pages that have one (review v6: a face is a real picture or nothing).
  const covered = { ...labels, documents: labels.documents.map(document => document.documentId === eco.documentId ? { ...document, cover: "/assets/work/ecosmartloop-cover.webp" } : document) };
  const answer = { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "c", hardPolicyVersion: "h", knowledgeRevision: revision, operations: [],
    kind: "sourced", acknowledgment: null, claims: [{ id: "a", text: "One.", citations: [coursera] }, { id: "b", text: "Two.", citations: [hype4] },
      { id: "c", text: "Three.", citations: [eco, broken] }] };
  // Review v5 (intentional update): the Sources pill moved from the answer body to the turn's one action row
  // (OakTurn renders OakAnswerSources beside copy and retry), so it is rendered on its own here.
  const html = renderToStaticMarkup(createElement(OakAnswerSources, { answer, citationLabels: covered }));
  const stack = html.match(/<span class="oak-answer__stack-icons"[\s\S]*?<\/button>/)[0];
  assert.equal(stack.match(/class="oak-answer__stack-icon"/g).length, 3);
  assert.match(stack, /brand-icons\/coursera\.png/);
  assert.match(stack, /brand-icons\/hype4\.png/);
  assert.match(stack, /<span>Sources<\/span><span class="oak-answer__sources-count">4<\/span>/);
});

test("Q05-G4 the pill opens the Sources sheet, and the page makes no third-party request", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const foreign = [];
    page.on("request", request => { const host = new URL(request.url()).hostname; if (!["127.0.0.1", "localhost"].includes(host) && !request.url().startsWith("data:")) foreign.push(host); });
    await openState(page, "answer-sources-web");
    await page.locator(".oak-answer__sources-button").click();
    const sheet = page.locator(".oak-sources-panel");
    await sheet.waitFor({ state: "visible" });
    assert.equal(await sheet.locator(".oak-source-row").count(), 4);
    await sheet.locator(".oak-source-row__excerpt").first().waitFor();
    assert.equal(await sheet.locator("[data-verified='false']").count(), 1);
    assert.deepEqual([...new Set(foreign)].filter(host => /coursera|hype4|framer/.test(host)), [], "no favicon or page fetch to a source's site");
  } finally { await browser.close(); }
});
