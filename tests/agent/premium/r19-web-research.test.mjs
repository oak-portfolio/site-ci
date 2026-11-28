import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import { loadTsx } from "../design-rework/load-tsx.mjs";
import { tintProbe } from "./arc-probe.mjs";
import { galleryStates, openState, stateById } from "./gallery.mjs";

// R19 (Oak, 2026-10-22): open web research beside Steve's sources. The card reads "From the web, not Steve's pages", leads
// with the cited synthesis and lists the sources as rows (face, title, host, date). R21: the face is a Worker-sent favicon or the web icon.
globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, location: { search: "" }, addEventListener() {}, removeEventListener() {} };
const states = galleryStates;
const event = stateById("research-web").workspace.messages[0].research;
const { OakPublicResearch } = loadTsx("src/components/agent/OakPublicResearch.tsx");
const { parseOakOutput } = loadTsx("src/lib/oakWorkspaceTransport.ts");
const answer = { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "fixture", hardPolicyVersion: "fixture", knowledgeRevision: "fixture",
  operations: ["search", "read"], kind: "sourced", acknowledgment: null,
  claims: [{ id: "claim-1", text: "Steve owned the app around the classifier.", citations: [{ documentId: "work:ecosmartloop", passageId: "public-passage",
    sectionId: "ownership", url: "https://steveoak.com/work/ecosmartloop/#ownership" }] }] };

test("R19 the web card labels itself apart from Steve's pages, leads with cited sentences, then plain source rows", () => {
  const html = renderToStaticMarkup(createElement(OakPublicResearch, { event, state: "complete" }));
  assert.match(html, /aria-label="From the web, not Steve’s pages"/);
  assert.match(html, />From the web<\/h3>/);
  assert.match(html, /Not Steve’s pages\. Check a source before relying on a detail\./);
  const synthesis = html.indexOf("oak-research__synthesis"), rows = html.indexOf("oak-research__rows");
  assert.ok(synthesis > 0 && rows > synthesis, "the synthesis comes before the source rows");
  assert.equal(html.match(/<li><span>/g)?.length, event.synthesis.sentences.length, "one item per sentence");
  // Each sentence's chips: a web source opens its page; a claim id points back at Steve's answer.
  assert.match(html, /<a class="oak-research__cite" href="https:\/\/evals-handbook\.example\.com\/guides\/hallucination-rate"[^>]*target="_blank"/);
  assert.match(html, /data-origin="steve">Relates to Steve&#x27;s answer</);
  assert.equal(html.match(/class="oak-research__row"/g)?.length, 3);
  assert.match(html, /evals-handbook\.example\.com · 2026-08-14/);
  // Ticket 15: an undated row says the day Oak read it, so every row carries one date.
  assert.match(html, /llm-reliability-notes\.example\.com(?:<!-- -->)* · Checked \d{4}-\d{2}-\d{2}(?:<!-- -->)*<\/span>/, "an undated source shows its host and the day it was checked");
  assert.match(html, /research-digest\.example\.com · 2026-09-30 · Excerpt/);
  assert.doesNotMatch(html, /oak-source-face|oak-research__cards/, "no bundled-brand face and no fixed-topic card row");
  assert.doesNotMatch(html, /oak-research__status/, "with a synthesis the done status would only repeat the count");
});

test("R19 without a synthesis the card shows its status and the sources only", () => {
  // R28 live judge: a partial read names how many returned results failed, so the rows shown never look like the failures.
  const partial = { ...event, phase: "partial", reason: "unreadable", returnedSources: 3, sources: event.sources.slice(0, 2) };
  const partialHtml = renderToStaticMarkup(createElement(OakPublicResearch, { event: partial, state: "complete" }));
  assert.match(partialHtml, /1 of 3 results could not be read\. The 2 below were read\./);
  const one = renderToStaticMarkup(createElement(OakPublicResearch, { event: { ...partial, sources: event.sources.slice(0, 1) }, state: "complete" }));
  assert.match(one, /2 of 3 results could not be read\. The one below was read\./);
  assert.doesNotMatch(partialHtml + one, /Some results could not be read/, "a counted partial never shows the vague line");
  const even = renderToStaticMarkup(createElement(OakPublicResearch, { event: { ...partial, returnedSources: 2 }, state: "complete" }));
  assert.match(even, /Some results could not be read\. The available excerpts are below\./, "no count to name, the plain line stays");

  const { synthesis, ...plain } = event;
  const html = renderToStaticMarkup(createElement(OakPublicResearch, { event: plain, state: "complete" }));
  assert.match(html, /I read 3 web sources\./);
  assert.doesNotMatch(html, /oak-research__synthesis/);
  assert.equal(html.match(/class="oak-research__row"/g)?.length, 3);
  const fixed = renderToStaticMarkup(createElement(OakPublicResearch, { event: stateById("research-sources").workspace.messages[0].research, state: "complete" }));
  assert.match(fixed, />Current public research<\/h3>/);
  assert.match(fixed, /oak-research__cards/, "the fixed topics keep their source cards");
});

test("R19 the browser accepts an open web event only when it predicted no fixed topic", () => {
  const parts = [{ type: "data-answer", data: answer }, { type: "data-research", data: event }];
  assert.equal(parseOakOutput(parts, event.requestId).research.topicId, "web");
  assert.throws(() => parseOakOutput(parts, event.requestId, undefined, "workers-limits"), /invalid-output/);
  const tampered = { ...event, synthesis: { sentences: [{ text: "Visit evil.example.net now.", cites: [event.sources[0].sourceId] }] } };
  assert.throws(() => parseOakOutput([{ type: "data-research", data: tampered }], event.requestId), /invalid-output/);
});

test("R19 redteam M2: the browser drops a web event on a document or role-fit turn, and a summary citing a claim the answer lacks", () => {
  const parts = [{ type: "data-answer", data: answer }, { type: "data-research", data: event }];
  assert.equal(parseOakOutput([{ type: "data-research", data: event }], event.requestId).research, null, "no answer, no web card");
  assert.equal(parseOakOutput(parts, event.requestId, "Senior designer role").research, null, "never on a role-fit turn");
  const forged = { ...event, synthesis: { sentences: [{ text: "Guides agree with the cited claim.", cites: ["claim-8", event.sources[0].sourceId] }] } };
  const kept = parseOakOutput([{ type: "data-answer", data: answer }, { type: "data-research", data: forged }], event.requestId).research;
  assert.equal(kept.topicId, "web"); assert.equal(kept.synthesis, undefined, "the summary goes, the sources stay");
  assert.equal(kept.sources.length, event.sources.length);
});

test("R19 the research-web gallery state paints no fill inside a filled parent and keeps its rows inside the card", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await openState(page, "research-web");
    const card = page.locator(".oak-research[data-topic='web']");
    await card.scrollIntoViewIfNeeded();
    assert.equal(await page.locator(".oak-research__synthesis > li").count(), 3);
    const fills = await page.evaluate(tintProbe);
    assert.deepEqual(fills.filter(line => /oak-research/.test(line)), []);
    const overflow = await card.evaluate(node => { const box = node.getBoundingClientRect();
      return [...node.querySelectorAll(".oak-research__row, .oak-research__cite")].filter(child => { const r = child.getBoundingClientRect();
        return r.left < box.left - 1 || r.right > box.right + 1; }).length; });
    assert.equal(overflow, 0);
  } finally { await browser.close(); }
});

// Retro 5 (favicon probe): a web source row or web cite never shows an empty face. The face is a Worker-sent favicon or the
// web icon (OakWebSourceFace); a missing favicon falls back to the icon, so the tile always holds something painted.
// Every gallery state that carries a web research card is found in the state data, then opened and measured in the page.
const webStates = (() => {
  const found = new Set();
  const walk = (value, id) => {
    if (!value || typeof value !== "object") return;
    if (value.topicId === "web" && Array.isArray(value.sources) && value.sources.length) found.add(id);
    for (const child of Object.values(value)) walk(child, id);
  };
  for (const state of states) walk(state, state.id);
  return [...found];
})();

/** Runs in the page: one line for every web row or cite whose face is missing or paints nothing. */
const faceProbe = () => {
  const out = [];
  const items = [...document.querySelectorAll(".oak-research[data-topic='web'] .oak-research__row, .oak-research[data-topic='web'] a.oak-research__cite")];
  for (const item of items) {
    const name = `${item.className.split(" ")[0]} "${(item.textContent || "").trim().slice(0, 30)}"`;
    const face = item.querySelector(".oak-web-face");
    if (!face) { out.push(`${name} has no face`); continue; }
    const box = face.getBoundingClientRect();
    if (box.width < 8 || box.height < 8) { out.push(`${name} has a face of ${Math.round(box.width)}x${Math.round(box.height)}px`); continue; }
    const image = face.querySelector("img"), icon = face.querySelector("svg");
    if (face.dataset.face === "favicon" ? !(image && image.getAttribute("src")?.startsWith("data:image/") && image.complete && image.naturalWidth > 0)
      : !(icon && icon.getBoundingClientRect().width >= 8)) out.push(`${name} has an empty ${face.dataset.face} face`);
  }
  return { count: items.length, out };
};

test("Retro 5 every web source row and web cite in every gallery state with a web card shows a favicon or the web icon", async () => {
  assert.ok(webStates.length >= 2, `web research states found in the gallery data: ${webStates.join(", ")}`);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    for (const id of webStates) {
      await openState(page, id, { settle: 300 });
      const { count, out } = await page.evaluate(faceProbe);
      assert.ok(count >= 3, `${id}: web rows and cites found (${count})`);
      assert.deepEqual(out, [], id);
    }
  } finally { await browser.close(); }
});
