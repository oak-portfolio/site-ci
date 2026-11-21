import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTsx } from "../design-rework/load-tsx.mjs";

// Ticket 225: with oakGapNoteBelow on, a gap answer that has cited claims reads its note after the answer, not above it.
globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, location: { search: "" }, addEventListener() {}, removeEventListener() {} };
const flag = existsSync("src/lib/oakFlags/gapNoteBelow.ts") ? loadTsx("src/lib/oakFlags/gapNoteBelow.ts") : { forceOakGapNoteBelow() {} };
const { OakArrangedAnswer } = loadTsx("src/components/agent/OakOpenUIAnswer.tsx");
const { OakWorkAnswer } = loadTsx("src/components/agent/OakWorkAnswer.tsx");

const NOTE = "The pages give no accuracy score for Oakminder.";
const cite = n => ({ documentId: "work:oakminder", passageId: `work:oakminder:passage-00${n}`, sectionId: "work:oakminder", url: "https://steveoak.com/work/oakminder/" });
const claims = [
  { id: "claim-1", text: "Oakminder splits the work between the backend and the phone.", citations: [cite(1)] },
  { id: "claim-2", text: "The phone keeps each action to a single tap.", citations: [cite(2)] },
];
const answerOf = (kind, acknowledgment, list = claims) => ({ schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "c", hardPolicyVersion: "h",
  knowledgeRevision: "k", operations: [], kind, acknowledgment, claims: list });
const arranged = answer => renderToStaticMarkup(createElement(OakArrangedAnswer, { id: "m1", question: "What is Oakminder's accuracy score?", latest: true, answer,
  ui: { requestId: "00000000-0000-4000-8000-000000000225", status: "done", program: `root = Answer([p, q])\np = Prose("claim-1")\nq = Prose("claim-2")` } }));
const markdown = answer => renderToStaticMarkup(createElement(OakWorkAnswer, { answer }));
const textOf = html => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const noteAt = html => textOf(html).indexOf(NOTE);
const noteAfterClaims = html => noteAt(html) > textOf(html).indexOf("single tap");
const withFlag = (on, fn) => { flag.forceOakGapNoteBelow(on); try { return fn(); } finally { flag.forceOakGapNoteBelow(null); } };

test("on: an arranged gap answer with cited claims renders its note after the layout", () => withFlag(true, () => {
  const html = arranged(answerOf("gap", NOTE));
  assert.ok(textOf(html).includes(NOTE), "the note is in the answer");
  assert.ok(noteAfterClaims(html), "the note follows the last claim in document order");
}));

test("on: the Markdown path renders a gap's note after its claims", () => withFlag(true, () => {
  assert.ok(noteAfterClaims(markdown(answerOf("gap", NOTE))));
}));

test("on: a gap with no cited claims renders as off, and a sourced answer has no note", () => {
  const decline = answerOf("gap", NOTE, []);
  assert.equal(withFlag(true, () => markdown(decline)), withFlag(false, () => markdown(decline)));
  assert.ok(!withFlag(true, () => textOf(arranged(answerOf("sourced", null)))).includes("accuracy score"));
});

test("off: the note stays above the answer on both paths", () => {
  for (const html of [arranged(answerOf("gap", NOTE)), markdown(answerOf("gap", NOTE))]) {
    assert.ok(noteAt(html) >= 0 && noteAt(html) < textOf(html).indexOf("splits the work"));
  }
});
