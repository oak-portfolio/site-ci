import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTsx } from "../design-rework/load-tsx.mjs";

// Q16-D1, superseded in the v3 review (Oak, 2026-10-18): research never asks, so no question needs an answer button.
test("Q16-D1 research needs no approval: no preview card exists and every topic reports requiresConsent false", () => {
  const research = loadTsx("packages/oak-agent-contracts/src/public-research.ts");
  assert.equal(loadTsx("src/components/agent/OakPublicResearch.tsx").OakResearchPreview, undefined, "the permission card is gone");
  for (const text of ["What is the current AI SDK streaming guidance?", "For the job description I pasted, what are the current Cloudflare Workers limits?"])
    assert.equal(research.publicResearchNeed("question", text)?.requiresConsent, false, text);
});

// Q16-D6: Compare a role reads at most three sections, and the visitor learns that where they select.
test("Q16-D6 the compare section limit is one shared number, with a note only past it", () => {
  const { OAK_COMPARE_SECTION_LIMIT, oakCompareSectionNote } = loadTsx("src/lib/oakDocumentsWorkspace.ts");
  const { documentRequirementSourceSchema } = loadTsx("packages/oak-agent-contracts/src/document-answer.ts");
  const ids = count => Array.from({ length: count }, (_, index) => `visitor-document:00000000-0000-4000-8000-00000000000${index}:section-${index + 1}:0-10`);
  assert.equal(OAK_COMPARE_SECTION_LIMIT, 3);
  // The note's number is the contract's own bound: three sections pass, four do not.
  assert.equal(documentRequirementSourceSchema.safeParse({ kind: "document", sourceIds: ids(OAK_COMPARE_SECTION_LIMIT) }).success, true);
  assert.equal(documentRequirementSourceSchema.safeParse({ kind: "document", sourceIds: ids(OAK_COMPARE_SECTION_LIMIT + 1) }).success, false);
  assert.equal(oakCompareSectionNote(3), null);
  assert.equal(oakCompareSectionNote(6), "Compare a role reads up to 3 sections. Unselect 3 to compare.");
});
