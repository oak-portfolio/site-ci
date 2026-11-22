import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// D154: Codex review on PR #119 (fded25fc). The documents panel said only "Save conversation with documents" keeps
// document text, but an ordinary Save keeps the transcript, quotes from the visitor's documents included.
test("D154-G1 the privacy note says an ordinary Save keeps quotes from the visitor's documents", () => {
  const panel = readFileSync("src/components/agent/OakDocumentsPanel.tsx", "utf8");
  assert.ok(!panel.includes("Only Save conversation with documents keeps document text"), "the old promise is gone");
  assert.match(panel, /An ordinary Save keeps the conversation as shown, including any quotes from your documents/);
  const projection = readFileSync("src/lib/oakSavedHistoryClient.ts", "utf8");
  assert.match(projection, /privateDocumentTurn/, "the saved projection still carries private turns, which is what the note now says");
});
