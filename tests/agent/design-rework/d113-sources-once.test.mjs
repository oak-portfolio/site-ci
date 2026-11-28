import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTsx } from "./load-tsx.mjs";

globalThis.window ??= { innerWidth: 1280, innerHeight: 800, outerWidth: 1280, outerHeight: 900, screen: {}, addEventListener() {}, removeEventListener() {} };
const { OakChainOfThought } = loadTsx("src/components/agent/OakChainOfThought.tsx");

test("D113-G1 a turn with several searches lists its found sources once, under the last search", () => {
  const answer = { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "f", hardPolicyVersion: "f", knowledgeRevision: "f", operations: ["search"], kind: "sourced", acknowledgment: null,
    claims: [{ id: "own", text: "Steve owned the scanner.", citations: [{ documentId: "work:ecosmartloop", passageId: "work:ecosmartloop:p", sectionId: "ownership", url: "https://steveoak.com/work/ecosmartloop/#ownership" }] }] };
  // Q03 (intentional update): stopped turns now fold, so a live turn whose answer has landed renders the trail open.
  const html = renderToStaticMarkup(createElement(OakChainOfThought, { question: "Who built it?", progress: "", message: {
    id: "a1", role: "assistant", text: "", cards: [], usage: null, state: "pending", answer,
    steps: [{ id: "search-0", operation: "search", state: "done" }, { id: "search-1", operation: "search", state: "done" }, { id: "read-0", operation: "read", state: "done" }] } }));
  assert.equal(html.match(/aria-label="Sources found"/g)?.length, 1, "one found-sources list for the turn");
  const last = html.indexOf('data-kind="search"', html.indexOf('data-kind="search"') + 1);
  assert.ok(html.indexOf('aria-label="Sources found"') > last, "under the last search");
});
