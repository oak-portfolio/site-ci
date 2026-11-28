import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTsx } from "./load-tsx.mjs";

const { OakDocumentAnswer } = loadTsx("src/components/agent/OakDocumentAnswer.tsx");
const { collectOakOutputAnnouncements } = loadTsx("src/components/agent/OakTranscript.tsx");

test("D107-G1 a quote from the visitor's own document shows exactly as validated, attribution and quote marks included", () => {
  const quote = "Alice wrote: \u201cShip Friday.\u201d";
  const answer = { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "f", hardPolicyVersion: "f", knowledgeRevision: "f", operations: [],
    kind: "document", claims: [{ id: "c1", quote, citation: { sourceId: "s", label: "Document 1", sectionId: "x", start: 0, end: quote.length } }],
    coverage: { scope: "selected-spans-only", offsetUnit: "utf16", includedUtf16: quote.length, availableUtf16: quote.length, omittedUtf16: 0,
      quotedUtf16: quote.length, extractionCompleteness: "complete" } };
  const html = renderToStaticMarkup(createElement(OakDocumentAnswer, { answer }));
  assert.match(html, /<blockquote>Alice wrote: \u201cShip Friday\.\u201d<\/blockquote><figcaption/, "the quote matches its private citation and the copied text");
  const spoken = collectOakOutputAnnouncements([{ id: "a", role: "assistant", text: "", cards: [], usage: null, state: "complete", answer }], new Set());
  assert.match(spoken, /Alice wrote: \u201cShip Friday\.\u201d/, "screen readers hear the same exact quote");
});
