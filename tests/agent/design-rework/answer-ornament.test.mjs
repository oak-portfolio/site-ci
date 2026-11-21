import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { chromium } from "playwright";
import { createLoader, stubSets } from "./load-tsx.mjs";
import { openState } from "../premium/gallery.mjs";

const root = path.resolve(import.meta.dirname, "../../..");
const read = (file) => readFileSync(path.join(root, file), "utf8");
const load = createLoader({ use: [stubSets.icons], interop: true });
const flag = load("src/lib/oakFlags/answerOrnament.ts");
const ornament = load("src/components/agent/OakAnswerOrnament.tsx");
const css = read("src/styles/agent/ornament.css").replace(/\/\*[\s\S]*?\*\//g, "");

const answer = { kind: "sourced", acknowledgment: null, knowledgeRevision: "r1", claims: [
  { id: "claim-1", text: "EcoSmartLoop runs on AWS.", citations: [{ documentId: "work:ecosmartloop", passageId: "p1", sectionId: "s1", url: "https://steveoak.com/work/ecosmartloop/" }] },
] };
const citationLabels = { knowledgeRevision: "r1", documents: [{ documentId: "work:ecosmartloop", title: "EcoSmartLoop: AI agent for recycling", canonicalUrl: "https://steveoak.com/work/ecosmartloop/" }] };
const render = (props = {}) => renderToStaticMarkup(createElement(ornament.OakAnswerOrnament,
  { messageId: "a2", answer, citationLabels, copied: false, onCopy() {}, ...props }));
const names = (html) => [...html.matchAll(/<(?:button|a)\b[^>]*aria-label="([^"]+)"/g)].map(match => match[1]);

test.afterEach(() => { flag.forceOakAnswerOrnament(null); ornament.oakOrnamentFocus.reset(); });

test("constant ships on; off renders today's controls and no ornament mounts", () => {
  assert.equal(flag.oakAnswerOrnament, true);
  assert.equal(flag.oakAnswerOrnamentOn(), true);
  flag.forceOakAnswerOrnament(false);
  assert.equal(flag.oakAnswerOrnamentOn(), false);
  ornament.oakOrnamentFocus.register("a2");
  assert.equal(render(), "");
  const turn = read("src/components/agent/OakTurn.tsx");
  assert.match(turn, /oakAnswerOrnamentOn\(\)\s*\?\s*<OakAnswerOrnament/, "OakTurn mounts the ornament only behind the switch");
  // fflip6b: it mounts with the row so its place is held (no late growth), and draws only once the row has arrived.
  assert.match(turn, /settled=\{footerSettled\}/, "the capsule waits for the action row to arrive");
  assert.match(turn, /className="oak-turn__actions" role="group" aria-label="Answer actions"/, "the action row stays as it is");
});

test("one ornament at a time, on the answer in focus", () => {
  flag.forceOakAnswerOrnament(true);
  const focus = ornament.oakOrnamentFocus;
  focus.register("a1");
  focus.register("a2");
  assert.equal(focus.current(), "a2", "the newest answer holds it until another is focused");
  assert.match(render({ messageId: "a2" }), /role="toolbar"/);
  assert.equal(render({ messageId: "a1" }), "");
  assert.match(render({ messageId: "a3", latest: true }), /role="toolbar"/, "the newest answer draws it before it registers");
  focus.focus("a1");
  assert.equal(focus.current(), "a1");
  assert.equal(render({ messageId: "a2" }), "");
  assert.equal(render({ messageId: "a3", latest: true }), "", "a focused answer keeps it from a newly mounted one");
  assert.equal((render({ messageId: "a1" }).match(/role="toolbar"/g) ?? []).length, 1);
  focus.unregister("a1");
  assert.equal(focus.current(), "a2", "a removed answer hands it back to the newest");
});

test("each action is a named button and none duplicates another control", () => {
  flag.forceOakAnswerOrnament(true);
  ornament.oakOrnamentFocus.register("a2");
  const html = render();
  assert.deepEqual(names(html), ["Copy answer", "Open page: EcoSmartLoop", "Ask a follow-up"]);
  assert.match(html, /<a\b[^>]*href="https:\/\/steveoak.com\/work\/ecosmartloop\/"/);
  assert.doesNotMatch(html, /thumb|like|share/i, "no thumbs (genui-merge M2)");
  assert.equal(render({ copied: true }).includes('aria-label="Copied"'), true);
  const held = render({ settled: false });
  assert.match(held, /data-ornament-ghost=""/, "before the row arrives the capsule keeps its box undrawn");
  assert.match(held, /aria-hidden="true"/);
  assert.match(held, /\sinert=""/);
  assert.doesNotMatch(html.match(/<div[^>]*role="toolbar"[^>]*>/)[0], /data-ornament-ghost|aria-hidden|inert/, "a settled capsule is drawn and reachable");
  // The row's own Copy steps aside on the ornamented turn, so Copy exists once.
  assert.match(css, /\[data-ornament\] \.oak-turn__actions \[data-answer-copy\]\s*\{\s*display: none;/, "hidden by a data attribute, not label text");
  assert.match(read("src/components/agent/OakTurn.tsx"), /data-answer-copy=\{answerCopy \|\| undefined\}/);
  assert.deepEqual([...html.matchAll(/tabindex="(-?\d)"/gi)].map(match => match[1]), ["0", "-1", "-1"], "one Tab stop, arrows inside");
  const unsourced = renderToStaticMarkup(createElement(ornament.OakAnswerOrnament,
    { messageId: "a2", answer: { kind: "gap", knowledgeRevision: "r1", claims: [] }, copied: false, onCopy() {} }));
  assert.deepEqual(names(unsourced), ["Copy answer", "Ask a follow-up"], "no page, no Open page");
});

test("the receded layer is inert while the sheet is open, and focus returns to the opener on close", () => {
  const attrs = new Map();
  const body = { setAttribute: (k, v) => attrs.set(k, v), removeAttribute: (k) => attrs.delete(k), hasAttribute: (k) => attrs.has(k), isConnected: true };
  let focused = 0;
  const opener = { isConnected: true, focus: () => { focused += 1; } };
  ornament.oakRecede(body, true);
  assert.equal(attrs.get("inert"), "");
  assert.equal(attrs.get("data-receded"), "");
  ornament.oakRecede(body, false, opener);
  assert.equal(attrs.has("inert"), false);
  assert.equal(attrs.has("data-receded"), false);
  assert.equal(focused, 1, "focus goes back to the opener once the layer is live again");
  attrs.set("inert", "");
  ornament.oakRecede(body, true);
  ornament.oakRecede(body, false);
  assert.equal(attrs.has("inert"), true, "an inert the layer already had (React's) stays");
  const panel = read("src/components/agent/OakSourcesPanel.tsx");
  assert.doesNotMatch(panel, /wasOpen|document\.activeElement/, "the opener is read in an event, not during render");
  assert.match(panel, /useReturnFocus\(/, "Escape closes through useReturnFocus");
  assert.match(panel, /oakRecede\(/);
  assert.match(panel, /oakAnswerOrnamentOn\(\)/, "the sheet depth sits behind the same switch");
});

test("reduced motion removes the recede and grow transitions", () => {
  const reduced = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(reduced, /\[data-receded\]/);
  assert.match(reduced, /\.oak-source-popover\[data-grow\]/);
  assert.match(reduced, /transform: none/);
  assert.match(reduced, /transition: none/);
  assert.match(read("src/components/agent/OakSourceChip.tsx"), /data-grow=\{grow/, "the popover grows from its chip behind the switch");
});

test("blur only on floating layers: every blur in ornament.css belongs to the ornament", () => {
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, , body]) => /backdrop-filter:\s*(?!none)|blur\(/.test(body));
  assert.ok(rules.length > 0, "the ornament is frosted");
  for (const [, selector] of rules) assert.match(selector.trim(), /^\.oak-ornament(\s|$|,)/, `blur outside a floating layer: ${selector.trim()}`);
  assert.doesNotMatch(css, /\.oak-ornament[^{]*\.ui-(?:popover|menu|dialog)/, "never glass on glass");
});

test("gallery states cover focus, sheet, chip popover and constant off", () => {
  const states = JSON.parse(read("src/data/dev/oak-states/answer-ornament.json"));
  const ids = states.map(state => state.id);
  for (const id of ["answer-ornament-focus", "answer-ornament-sheet", "answer-ornament-chip", "answer-ornament-long", "answer-ornament-off"]) assert.ok(ids.includes(id), id);
  assert.equal(states.find(state => state.id === "answer-ornament-off").ornament, false);
});

// Walks the conversation from top to bottom and lists every scroll position where the capsule sits over a line of the turn's text.
const capsuleOverText = page => page.evaluate(() => {
  const capsule = document.querySelector(".oak-ornament");
  const turn = capsule?.closest("[data-message-id]");
  let scroller = capsule?.parentElement;
  while (scroller && !(scroller.scrollHeight > scroller.clientHeight && /auto|scroll/.test(getComputedStyle(scroller).overflowY))) scroller = scroller.parentElement;
  if (!capsule || !turn || !scroller) return { found: false };
  const texts = [];
  const walker = document.createTreeWalker(turn, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) if (node.textContent.trim() && !capsule.contains(node)) texts.push(node);
  const hits = [];
  const step = Math.max(40, Math.floor(scroller.clientHeight / 4));
  for (let top = 0; top <= scroller.scrollHeight; top += step) {
    scroller.scrollTop = top;
    const view = scroller.getBoundingClientRect();
    const box = capsule.getBoundingClientRect();
    if (box.bottom <= view.top || box.top >= view.bottom) continue;
    for (const node of texts) {
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const line of range.getClientRects()) {
        if (line.width && line.left < box.right && line.right > box.left && line.top < box.bottom && line.bottom > box.top) hits.push({ top, text: node.textContent.trim().slice(0, 40) });
      }
    }
  }
  return { found: true, tall: turn.getBoundingClientRect().height > scroller.clientHeight, hits };
});

test("gallery: on an answer taller than the window the capsule never covers answer text while scrolling (1280 and 390)", async () => {
  const browser = await chromium.launch();
  try {
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      const page = await (await browser.newContext({ viewport })).newPage();
      await openState(page, "answer-ornament-long", { settle: 500 });
      const result = await capsuleOverText(page);
      assert.equal(result.found, true, `${viewport.width}: the capsule and its scroller exist`);
      assert.equal(result.tall, true, `${viewport.width}: the answer is taller than the scroll viewport`);
      assert.deepEqual(result.hits.slice(0, 3), [], `${viewport.width}: the capsule sat over answer text`);
      await page.close();
    }
  } finally { await browser.close(); }
});
