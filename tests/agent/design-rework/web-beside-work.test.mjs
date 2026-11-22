import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import { loadTsx } from "./load-tsx.mjs";
import { ownServer } from "../support/own-server.mjs";

// Ticket 55: web results beside the case studies the answer cites. A case study is paired only when its stack names the
// topic the visitor asked about (CONTEXT.md, Bridge line); otherwise it reads "Related". Off, the card is today's.
globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, location: { search: "" }, addEventListener() {}, removeEventListener() {} };
const root = path.resolve(import.meta.dirname, "../../..");
const { oakWebBesideWork, oakWebBesideWorkOn, forceOakWebBesideWork } = loadTsx("src/lib/oakFlags/webBesideWork.ts");
const { OakPublicResearch } = loadTsx("src/components/agent/OakPublicResearch.tsx");

const requestId = "4c1b9e2a-7f3d-4e8a-9b6c-2d5e8f1a3c7b";
const png = "data:image/png;base64,iVBORw0KGgo=";
const source = (n, extra = {}) => ({ sourceId: `external:${requestId}:${n}`, origin: "external-web", title: `Convex guide ${n}`,
  url: `https://guides-${n}.dev/convex`, publishedAt: null, retrievedAt: 1791824400000, excerpt: `Convex keeps queries live, part ${n}.`, contentStatus: "read", ...extra });
const web = (over = {}) => ({ requestId, topicId: "web", provider: "Exa", phase: "completed", reason: "none", returnedSources: 2,
  sources: [source(1, { favicon: png }), source(2, { contentStatus: "partial" })],
  synthesis: { sentences: [{ text: "Current guides describe Convex as a reactive database with live queries.", cites: [`external:${requestId}:1`, "claim-1"] }] }, ...over });
const cite = (id) => ({ documentId: `work:${id}`, passageId: `work:${id}:section-001:passage-001`, sectionId: `work:${id}:section-001`, url: `https://steveoak.com/work/${id}/` });
const answer = { knowledgeRevision: "rev-55", kind: "sourced", claims: [
  { id: "claim-1", text: "Oakminder pairs Convex with Expo.", citations: [cite("oakminder")] },
  { id: "claim-2", text: "EcoSmartLoop runs on Next.js and Supabase.", citations: [cite("ecosmartloop"), cite("oakminder")] },
] };
const card = (id, title, stack) => ({ documentId: `work:${id}`, title: `${title}: case study`, canonicalUrl: `https://steveoak.com/work/${id}/`,
  card: { kind: "work", title, stack } });
const citationLabels = { knowledgeRevision: "rev-55", documents: [card("oakminder", "Oakminder", ["Expo", "React Native", "Convex"]),
  card("ecosmartloop", "EcoSmartLoop", ["Next.js", "TypeScript", "Supabase"])] };
const render = (props) => renderToStaticMarkup(createElement(OakPublicResearch, { state: "complete", ...props }));
const beside = (props = {}) => render({ event: web(), answer, citationLabels, question: "How do current guides say to use Convex?", ...props });
const rowOf = (html, name) => html.match(new RegExp(`<li[^>]*class="oak-beside__work-row"[^>]*>(?:(?!</li>).)*${name}(?:(?!</li>).)*</li>`))?.[0] ?? "";

test.afterEach(() => forceOakWebBesideWork(null));

test("55 the constant is off by default and off renders today's card, whatever the answer holds", () => {
  assert.equal(oakWebBesideWork, false);
  assert.equal(oakWebBesideWorkOn(), false);
  const today = render({ event: web() });
  assert.equal(beside(), today, "the extra props change nothing while the constant is off");
  assert.doesNotMatch(today, /oak-beside/);
  assert.equal(render({ event: web({ phase: "blocked", reason: "disabled", returnedSources: 0, sources: [], synthesis: undefined }), answer, citationLabels }),
    render({ event: web({ phase: "blocked", reason: "disabled", returnedSources: 0, sources: [], synthesis: undefined }) }));
});

test("55 the web column reuses OakWebSourceFace and the Excerpt wording, and the card fetches no favicon itself", () => {
  forceOakWebBesideWork(true);
  const html = beside();
  const column = html.match(/<section[^>]*class="oak-beside__card"[^>]*data-origin="web"[\s\S]*?<\/section>/)?.[0] ?? "";
  assert.ok(column, "a web card");
  assert.equal((column.match(/class="oak-web-face"/g) ?? []).length >= 2, true, "each web row leads with the shared face");
  assert.match(column, new RegExp(`<img src="${png}"`), "the Worker's favicon, as sent");
  assert.match(column, /Excerpt/);
  assert.match(column, /Fetched 2026-/, "each web quote carries its fetched date");
  assert.match(column, /guides-1\.dev/, "and its URL's host");
  assert.doesNotMatch(html, /<img src="https?:/, "no image from another site");
  const code = readFileSync(path.join(root, "src/components/agent/OakPublicResearch.tsx"), "utf8");
  assert.doesNotMatch(code, /fetch\(|favicons?\?|s2\/favicons|icon\.horse|duckduckgo/i);
});

test("55 a case study pairs only when its stack names the topic; otherwise it reads Related", () => {
  forceOakWebBesideWork(true);
  const html = beside();
  assert.match(rowOf(html, "Oakminder"), /Matches Convex/);
  assert.doesNotMatch(rowOf(html, "EcoSmartLoop"), /Matches/);
  assert.match(rowOf(html, "EcoSmartLoop"), /Related/);
  assert.equal((html.match(/class="oak-beside__work-row"/g) ?? []).length, 2, "each cited case study once");
  const unpaired = beside({ question: "What do current guides say about Kubernetes?" });
  assert.doesNotMatch(unpaired, /Matches/, "no stack names the topic, so nothing is paired");
  assert.equal((unpaired.match(/>Related</g) ?? []).length, 2);
  const word = beside({ question: "Is Convexity a real word?" });
  assert.doesNotMatch(word, /Matches/, "a stack name inside another word is not the topic");
});

test("55 every block carries one Worker label, and the summary is its own model-written block", () => {
  forceOakWebBesideWork(true);
  const html = beside();
  for (const label of ["From Steve’s records", "From the web", "Inferred"]) assert.ok(html.includes(`>${label}<`), label);
  const summary = html.match(/<section[^>]*class="oak-beside__summary"[\s\S]*?<\/section>/)?.[0] ?? "";
  assert.match(summary, /Oak AI summary/);
  assert.match(summary, /Model-written/);
  assert.match(summary, />Inferred</);
  assert.match(summary, /reactive database/);
  const work = html.match(/<section[^>]*class="oak-beside__card"[^>]*data-origin="steve"[\s\S]*?<\/section>/)?.[0] ?? "";
  assert.doesNotMatch(work, /data-face="favicon"|guides-1/, "a web block is never mixed into the records block");
});

// Depot ui 0vm1l776l5 (Retro 5): a case-study row leads with a face as a web row does, here the case-study icon.
test("55 every case-study row leads with the case-study face, never a web favicon", () => {
  forceOakWebBesideWork(true);
  for (const name of ["Oakminder", "EcoSmartLoop"]) assert.match(rowOf(beside(), name), /<a class="oak-research__row oak-beside__row"[^>]*><span class="oak-web-face" data-face="icon" data-source-type="case-study"/, name);
});

test("55 Steve's work comes first in the DOM, and every region has its own name", () => {
  forceOakWebBesideWork(true);
  for (const html of [beside(), beside({ event: web({ phase: "blocked", reason: "disabled", returnedSources: 0, sources: [], synthesis: undefined }) })]) {
    const origins = [...html.matchAll(/class="oak-beside__card" data-origin="(\w+)"/g)].map(match => match[1]);
    assert.equal(origins[0], "steve", `reading order starts with Steve's work: ${origins.join(", ")}`);
    const names = [...html.matchAll(/<section[^>]*aria-label="([^"]+)"/g)].map(match => match[1]);
    assert.equal(new Set(names).size, names.length, `region names are distinct: ${names.join(" | ")}`);
  }
});

test("55 the lookup-off notice shows only when lookup is off, announced once", () => {
  forceOakWebBesideWork(true);
  const off = beside({ event: web({ phase: "blocked", reason: "disabled", returnedSources: 0, sources: [], synthesis: undefined }) });
  assert.equal((off.match(/role="status"/g) ?? []).length, 1);
  assert.match(off, /Web lookup is off\. This answer uses Steve’s records only\./);
  assert.doesNotMatch(off, /data-origin="web"/, "the web card drops");
  assert.match(off, /data-origin="steve"/);
  assert.doesNotMatch(beside(), /Web lookup is off/);
  assert.doesNotMatch(beside({ event: web({ phase: "blocked", reason: "consent", returnedSources: 0, sources: [], synthesis: undefined }) }), /Web lookup is off/);
});

test("55 while the lookup runs it names the topic, and an empty result says so plainly", () => {
  forceOakWebBesideWork(true);
  const running = beside({ state: "pending", event: web({ phase: "started", returnedSources: 0, sources: [], synthesis: undefined }) });
  assert.match(running, /Looking up Convex on the web/);
  const early = beside({ state: "pending", answer: undefined, event: web({ phase: "started", returnedSources: 0, sources: [], synthesis: undefined }) });
  assert.match(early, /Looking up Convex on the web/, "before the answer lands the topic comes from any case study's stack");
  assert.doesNotMatch(early, /oak-beside__card/, "nothing is cited yet, so no card");
  const unknown = beside({ state: "pending", answer: undefined, question: "What is new in Kubernetes?", event: web({ phase: "started", returnedSources: 0, sources: [], synthesis: undefined }) });
  assert.match(unknown, /Searching the web for what Steve’s pages don’t cover\./, "no stack names the topic, so no name is invented");
  const empty = beside({ event: web({ phase: "zero-results", returnedSources: 0, sources: [], synthesis: undefined }) });
  assert.match(empty, /The public search returned no sources\./);
});

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
test("55 the two cards are the same height side by side at 1280, web first, and stack Steve's work first at 390", async () => {
  const browser = await chromium.launch();
  try {
    for (const width of [1280, 390]) {
      const page = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage();
      await page.goto(`${galleryUrl}/__dev/oak-states?state=web-beside-paired`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 30000 });
      await page.locator(".oak-beside__card").first().waitFor();
      await page.waitForTimeout(600);
      const boxes = await page.locator(".oak-beside__card").evaluateAll(cards => cards.map(card => ({ origin: card.dataset.origin, ...card.getBoundingClientRect().toJSON() })));
      assert.equal(boxes.length, 2);
      const steve = boxes.find(box => box.origin === "steve"), webCard = boxes.find(box => box.origin === "web");
      if (width === 1280) {
        assert.ok(Math.abs(boxes[0].height - boxes[1].height) < 1, `equal heights: ${boxes.map(box => box.height).join(" vs ")}`);
        assert.ok(Math.abs(boxes[0].top - boxes[1].top) < 1, "side by side");
        assert.ok(webCard.right <= steve.left + 1, "the web card on the left, Steve's work on the right (Direction A)");
        // Depot ui 0vm1l776l5 (R17 inset): the shorter card fills its height by design, a footer pinned to its bottom pad.
        const pads = await page.locator(".oak-beside__card").evaluateAll(cards => cards.map(card => {
          const box = card.getBoundingClientRect(), foot = card.querySelector(".oak-beside__foot")?.getBoundingClientRect();
          return foot ? Math.round(box.bottom - foot.bottom) : null;
        }));
        for (const pad of pads) assert.ok(pad !== null && pad >= 24 && pad <= 30, `each card's footer sits on its bottom pad: ${pads.join(", ")}`);
      } else {
        assert.ok(steve.bottom <= webCard.top + 1, "Steve's work first at 390");
        const first = await page.locator(".oak-beside").first().evaluate(region => {
          const link = region.querySelector("a[href], button:not([disabled])");
          return link?.closest(".oak-beside__card")?.dataset.origin;
        });
        assert.equal(first, "steve", "the first focusable link at 390 is in Steve's card");
      }
    }
  } finally { await browser.close(); }
});
