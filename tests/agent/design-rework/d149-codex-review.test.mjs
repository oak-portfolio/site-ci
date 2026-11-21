import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTsx } from "./load-tsx.mjs";

// D149: Codex review on PR #119 (a2c284b8). Open-in links dropped the quote a question was about, and the screen-reader
// announcement still cut ordinary claims to their quoted tail.
test("D149-G1 links to other assistants carry the quoted question, never a private one", () => {
  const { oakExportedQuestion } = loadTsx("src/lib/oakNextStep.ts");
  const folded = "About \u201cSteve built the scanner\u201d\n\nWhat does this mean?";
  assert.equal(oakExportedQuestion({ role: "user", text: folded, quoted: { text: "What does this mean?" } }), folded);
  assert.equal(oakExportedQuestion({ role: "user", text: "About \u201cmy notes\u201d\n\nSay more", quoted: { text: "Say more" }, privateDocumentTurn: true }), "Say more");
  assert.equal(oakExportedQuestion({ role: "assistant", text: "An answer." }), "");
  assert.equal(oakExportedQuestion(undefined), "");
});

test("D149-G2 announcements keep ordinary claims whole and read resolver quotes plainly", () => {
  const { resolverQuote } = loadTsx("src/lib/oakQuote.ts");
  const read = line => resolverQuote(line) ?? line;
  assert.equal(read("Steve wrote the UI and noted: \u201cthe team shipped it\u201d"), "Steve wrote the UI and noted: \u201cthe team shipped it\u201d");
  assert.equal(read("Steve wrote things and he wrote: \u201cthe team shipped it\u201d"), "Steve wrote things and he wrote: \u201cthe team shipped it\u201d");
  assert.equal(read("Steve Oak wrote (work period: 2024; published: not specified): \u201cI shipped the scanner.\u201d"), "I shipped the scanner.");
  assert.equal(read("Steve Oak wrote: \u201cI design AI products.\u201d"), "I design AI products.");
});
