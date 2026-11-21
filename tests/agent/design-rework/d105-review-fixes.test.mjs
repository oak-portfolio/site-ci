import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTsx } from "./load-tsx.mjs";

globalThis.window ??= { innerWidth: 1280, innerHeight: 800, outerWidth: 1280, outerHeight: 900, screen: {}, addEventListener() {}, removeEventListener() {} };
const { oakAllowanceSummary } = loadTsx("src/lib/oakAllowance.ts");
const { OakTurn } = loadTsx("src/components/agent/OakTurn.tsx");
const { OakCitations } = loadTsx("src/components/agent/OakCitations.tsx");
const { wholeWordTitle } = loadTsx("src/lib/oakQuote.ts");
const counts = (completed, limit) => ({ completed, pending: 0, limit, remaining: limit - completed });

// ADR 0002 (production grill, 2026-10-15) replaced the one-time guest allowance: every visitor holds the same
// refilling allowance, so guests are now told when answers come back and are never sent to sign in for more.
const refilling = (remaining, window = counts(6 - remaining, 100)) => ({ answers: { limit: 6, remaining, refillsAt: null }, window });
test("D105-G1 every visitor's answers refill the same way: the footnote says when, for guests and accounts alike", () => {
  const guest = oakAllowanceSummary({ kind: "guest", configured: true, allowance: refilling(4) });
  const account = oakAllowanceSummary({ kind: "account", configured: true, allowance: refilling(4) });
  assert.match(guest.note, /^One answer comes back every 4 hours\./);
  assert.equal(account.note, guest.note, "signing in adds saved chats, not answers");
  assert.doesNotMatch(guest.note, /sign in/i);
  assert.ok(guest.note.length < 90, "the footnote fits the one short helper line panels allow (D42)");
  const stopped = (onSignIn, guest = Boolean(onSignIn)) => renderToStaticMarkup(createElement(OakTurn, { message: { id: "a1", role: "assistant", state: "failed", failure: "allowance", text: "", cards: [] },
    question: "q", progress: "", contactPreference: "open", retry: null, copied: null, onCopy() {}, onContact() {}, onSignIn, guest }));
  for (const card of [stopped(() => {}), stopped(undefined, true), stopped(undefined)]) {
    assert.match(card, /One comes back every 4 hours/);
    assert.doesNotMatch(card, /Sign in for more|don(’|'|&#x27;)t refill/);
  }
});

test("D105-G3 the count is the lower of the refilling allowance and the 30-day cap, since either one stops an answer", () => {
  const late = oakAllowanceSummary({ kind: "account", configured: true, allowance: refilling(5, counts(100, 100)) });
  assert.equal(late.remaining, 0, "a spent 30-day window shows 0 even with answers in the bucket");
  assert.match(late.detail, /^0 of 100 answers left for 30 days\.$/);
});

test("D105-G4 without the role description, a requirement keeps its whole words (D114: every validated word, nothing guessed away)", () => {
  assert.equal(wholeWordTitle("building scalable interfaces", 0, 28), "building scalable interfaces");
  assert.equal(wholeWordTitle("experience with React and TypeScript", 0, 36), "experience with React and TypeScript");
  assert.equal(wholeWordTitle("with React and TypeScript, ", 0, 27), "with React and TypeScript");
});

test("D105-G2 the trail's found sources add no navigation landmark; the answer's own source list stays one", () => {
  const citations = [{ documentId: "doc-1", passageId: "doc-1#p1", url: "https://steveoak.com/work/ecosmartloop", title: "EcoSmartLoop", type: "case-study" }];
  const trail = renderToStaticMarkup(createElement(OakCitations, { citations, knowledgeRevision: "r1", label: "Sources found", landmark: false }));
  assert.match(trail, /^<div class="oak-message__sources" aria-label="Sources found" role="group">/);
  assert.match(renderToStaticMarkup(createElement(OakCitations, { citations, knowledgeRevision: "r1", label: "Sources" })), /^<nav class="oak-message__sources" aria-label="Sources">/);
});
