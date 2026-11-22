import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTsx } from "../design-rework/load-tsx.mjs";

// Ticket 32: StackMap(claims, mode) maps the tools the cited records list, behind oakStackMap; venn splits two records' tools three ways.
globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, location: { search: "" }, addEventListener() {}, removeEventListener() {} };
const flag = loadTsx("src/lib/oakFlags/stackMap.ts");
const { OakArrangedAnswer } = loadTsx("src/components/agent/OakOpenUIAnswer.tsx");
const { oakToolMark } = loadTsx("src/lib/oakToolMarks.ts");

const work = (slug, title, stack) => ({ documentId: `work:${slug}`, title: `${title}: case study`, canonicalUrl: `https://steveoak.com/work/${slug}/`,
  card: { kind: "work", title, stack } });
const labels = { knowledgeRevision: "k", documents: [
  work("ecosmartloop", "EcoSmartLoop", ["Next.js", "TypeScript", "Vercel AI SDK", "Capacitor", "Supabase", "Python ML"]),
  work("oakminder", "Oakminder", ["Expo", "SwiftUI", "Convex", "Next.js", "Go"]),
] };
const cite = slug => ({ documentId: `work:${slug}`, passageId: `work:${slug}:passage-001`, sectionId: `work:${slug}`, url: `https://steveoak.com/work/${slug}/` });
const ECO = "EcoSmartLoop ran on Next.js and TypeScript with the Vercel AI SDK, shipped through Capacitor, with a Python ML model.";
const MIND = "Oakminder is an Expo app with SwiftUI widgets on a Convex backend and a Next.js site; good docs.";
const answerOf = (eco = ECO, mind = MIND) => ({ schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "c", hardPolicyVersion: "h", knowledgeRevision: "k",
  operations: [], kind: "sourced", acknowledgment: null, claims: [{ id: "claim-1", text: eco, citations: [cite("ecosmartloop")] }, { id: "claim-2", text: mind, citations: [cite("oakminder")] }] });
const render = (mode, answer = answerOf()) => renderToStaticMarkup(createElement(OakArrangedAnswer, { id: "m1", answer, question: "What tools does Steve use?", latest: true,
  citationLabels: labels, ui: { requestId: "00000000-0000-4000-8000-0000000000e1", status: "done",
    program: `root = Answer([map])\nmap = StackMap(["claim-1", "claim-2"]${mode ? `, "${mode}"` : ""})` } }));
const on = (fn) => { flag.forceOakStackMap(true); try { return fn(); } finally { flag.forceOakStackMap(null); } };
const off = (fn) => { flag.forceOakStackMap(false); try { return fn(); } finally { flag.forceOakStackMap(null); } };
const count = (html, text) => html.split(text).length - 1;
const names = html => [...html.matchAll(/class="oak-stack-map__name">([^<]+)</g)].map(match => match[1]);

// The block's view loads in its own chunk; one render starts that import, and later renders get the settled view.
on(() => render());
await new Promise(setImmediate);

test("constant: oakStackMap ships true and a force flips it", () => {
  assert.equal(flag.oakStackMap, true);
  assert.equal(flag.oakStackMapOn(), true);
  flag.forceOakStackMap(false);
  assert.equal(flag.oakStackMapOn(), false);
  flag.forceOakStackMap(null);
  assert.equal(flag.oakStackMapOn(), true);
});

test("tools: each named tool shows once across the cited records, and no unnamed or non-tool term shows", () => {
  const html = on(() => render());
  assert.deepEqual(names(html), ["Next.js", "TypeScript", "Vercel AI SDK", "Capacitor", "Python ML", "Expo", "SwiftUI", "Convex"],
    "shared first, then each record's own in page order");
  for (const absent of ["Supabase", "Go"]) assert.equal(count(html, `>${absent}<`), 0, `${absent}: listed but never named (Go is not inside good)`);
  for (const claim of [ECO, MIND]) assert.equal(count(html, claim), 1, "each claim is placed once");
});

test("tools: counts read used in N, never a rating, and a tool's disclosure names the records that use it", () => {
  const text = on(() => render()).replace(/<[^>]+>/g, " ");
  assert.match(text, /Next\.js\s+used in 2/);
  assert.match(text, /Expo\s+used in 1/);
  assert.doesNotMatch(text, /\b(rank|ranked|score|rated|rating|top|best|expert|proficien\w*|percent)\b|%|\d\s*\/\s*\d/i);
  const html = on(() => render());
  assert.match(html, /<a href="https:\/\/steveoak.com\/work\/oakminder\/">Oakminder<\/a>/, "a disclosure links each record");
});

test("marks come from oakToolMark; a tool with no brand mark gets the neutral glyph, never a letter", () => {
  const html = on(() => render());
  const tiles = [...html.matchAll(/<li class="oak-stack-map__tool"[\s\S]*?<\/li>/g)].map(match => match[0]);
  assert.equal(tiles.length, 8);
  for (const tile of tiles) {
    const name = tile.match(/class="oak-stack-map__name">([^<]+)</)[1];
    const mark = oakToolMark(name);
    if (mark) assert.ok(tile.includes(`src="${mark}"`), `${name}: its bundled brand mark`);
    else assert.match(tile, /data-glyph=""[\s\S]*<svg/, `${name}: the neutral glyph`);
    assert.doesNotMatch(tile, /class="[^"]*(letter|initial|monogram)/, `${name}: never a letter mark`);
  }
});

test("under 2 named tools the map hides and the claims stay placed as the plain list", () => {
  const html = on(() => render(undefined, answerOf("EcoSmartLoop shipped through Capacitor.", "Oakminder has reminders.")));
  assert.doesNotMatch(html, /oak-stack-map__tool|oak-figure/);
  assert.match(html, /<ul class="oak-openui__points"/);
  assert.equal(count(html, "EcoSmartLoop shipped through Capacitor."), 1);
});

test("venn: only A, both and only B inside the accessible figure, each zone named in words, with a three-row list", () => {
  const html = on(() => render("venn"));
  assert.match(html, /<figure class="oak-figure"/);
  const zones = [...html.matchAll(/<section class="oak-stack-map__zone" data-zone="(\w+)" aria-label="([^"]+)"/g)].map(match => [match[1], match[2]]);
  assert.deepEqual(zones, [["a", "Only EcoSmartLoop"], ["both", "Both"], ["b", "Only Oakminder"]]);
  const rows = [...html.matchAll(/<div class="oak-figure__row"><dt>([^<]+)<\/dt><dd>([^<]*)<\/dd>/g)].map(match => [match[1], match[2]]);
  assert.deepEqual(rows, [["Only EcoSmartLoop", "TypeScript, Vercel AI SDK, Capacitor, Python ML"], ["Both", "Next.js"], ["Only Oakminder", "Expo, SwiftUI, Convex"]]);
});

test("venn keeps meaning in forced colors: zones keep borders and their word labels, never color alone", () => {
  const css = readFileSync(new URL("../../../src/styles/openui/stack-map.css", import.meta.url), "utf8");
  const forced = css.slice(css.indexOf("@media (forced-colors: active)"));
  assert.ok(forced.length > 30, "a forced-colors block");
  assert.match(forced, /\.oak-stack-map__zone[^{]*\{[^}]*border:[^}]*CanvasText/);
});

test("the prompt description names no other component and says when by the visitor's question", () => {
  const { StackMap } = loadTsx("src/lib/openui/components/StackMap.tsx");
  const description = StackMap.description ?? StackMap.spec?.description ?? "";
  assert.ok(description.length > 0);
  assert.doesNotMatch(description, /\b(Stack|Prose|Points|Project|Role|Profile|Quote|Steps|Sources|Ownership|Compare)\b/);
});

test("constant off degrades to the plain tool chips with every claim placed once", () => {
  const html = off(() => render());
  assert.match(html, /<ul class="oak-openui-chips oak-openui-stack" aria-label="Tools named in this answer">/);
  assert.doesNotMatch(html, /oak-stack-map/);
  for (const claim of [ECO, MIND]) assert.equal(count(html, claim), 1);
});
