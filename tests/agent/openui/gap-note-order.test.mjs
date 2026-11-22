import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTsx } from "../design-rework/load-tsx.mjs";

// Ticket 235: with oakGapNoteBelow on, a gap answer with cited claims is spoken and copied claims first, note last, and the
// Markdown reveal ends when OakTurn's clock expects. Off, all three stay as they were at 60fcb1e59.
globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, location: { search: "" }, addEventListener() {}, removeEventListener() {} };
const flag = loadTsx("src/lib/oakFlags/gapNoteBelow.ts");
const { collectOakOutputAnnouncements } = loadTsx("src/components/agent/OakTranscript.tsx");
const { OakWorkAnswer, oakAnswerRevealPlan } = loadTsx("src/components/agent/OakWorkAnswer.tsx");
const { renderOakAnswer } = loadTsx("packages/oak-agent-contracts/src/output.ts");
const { oakAnswerWithSources } = loadTsx("src/lib/oakAnswerActions.ts");
const { oakNoteLast } = existsSync("src/lib/oakGapNoteOrder.ts") ? loadTsx("src/lib/oakGapNoteOrder.ts") : { oakNoteLast: (_answer, text) => text };

const NOTE = "The pages give no accuracy score for Oakminder.";
const cite = n => ({ documentId: "work:oakminder", passageId: `work:oakminder:passage-00${n}`, sectionId: "work:oakminder", url: "https://steveoak.com/work/oakminder/" });
const claims = [
  { id: "claim-1", text: "Oakminder splits the work between the backend and the phone.", citations: [cite(1)] },
  { id: "claim-2", text: "The phone keeps each action to a single tap.", citations: [cite(2)] },
];
const answerOf = (kind, acknowledgment, list = claims) => ({ schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "c", hardPolicyVersion: "h",
  knowledgeRevision: "k", operations: [], kind, acknowledgment, claims: list });
const withFlag = (on, fn) => { flag.forceOakGapNoteBelow(on); try { return fn(); } finally { flag.forceOakGapNoteBelow(null); } };
const spoken = answer => collectOakOutputAnnouncements([{ id: "a", role: "assistant", text: renderOakAnswer(answer), answer, cards: [], usage: null, state: "complete" }], new Set());
const copied = answer => oakNoteLast(answer, renderOakAnswer(answer));
const CLAIMS_TEXT = `${claims[0].text}\n\n${claims[1].text}`;

const long = Array.from({ length: 160 }, (_, index) => `word${index}`).join(" ");
const longAnswer = answerOf("gap", NOTE, [{ id: "claim-1", text: long, citations: [cite(1)] }]);
const noteClock = html => {
  const note = html.match(/class="oak-answer__note-below"><span[^>]*--ui-reveal-start:([\d.]+)ms;--ui-reveal-step:([\d.]+)ms/);
  assert.ok(note, "the note reveals on the word clock");
  return { start: Number(note[1]), step: Number(note[2]) };
};
const clocks = html => [...html.matchAll(/--ui-reveal-start:([\d.]+)ms;--ui-reveal-step:([\d.]+)ms/g)].map(match => `${match[1]}/${match[2]}`);

test("on: the live region speaks a gap's claims, then its note", () => withFlag(true, () => {
  assert.equal(spoken(answerOf("gap", NOTE)), `Oak answered. ${CLAIMS_TEXT}\n\n${NOTE}`);
}));

test("on: Copy answer copies a gap's claims, then its note, at both Copy calls", () => withFlag(true, () => {
  assert.equal(copied(answerOf("gap", NOTE)), `${CLAIMS_TEXT}\n\n${NOTE}`);
  const turn = readFileSync("src/components/agent/OakTurn.tsx", "utf8");
  assert.equal((turn.match(/onCopy\(`\$\{message\.id\}:answer`, oakNoteLast\(answer, message\.text\)\)/g) ?? []).length, 2,
    "the ornament's Copy and the action row's Copy answer both copy through oakNoteLast");
}));

test("on: Copy with sources copies a gap's claims, then its note, then the sources", () => withFlag(true, () => {
  const answer = answerOf("gap", NOTE);
  assert.match(oakAnswerWithSources(copied(answer), answer), new RegExp(`^${CLAIMS_TEXT.replace(/[.]/g, "\\.")}\\n\\n${NOTE.replace(/[.]/g, "\\.")}\\n\\nSources:\\n1\\. `));
  assert.match(readFileSync("src/components/agent/OakTurn.tsx", "utf8"), /onCopy\(`\$\{message\.id\}:sources`, oakAnswerWithSources\(oakNoteLast\(answer, message\.text\), answer, citationLabels\)\)/,
    "Copy with sources copies through oakNoteLast");
}));

test("on: the Markdown reveal of an answer past the 4s cap ends at the plan's total", () => withFlag(true, () => {
  const { start, step } = noteClock(renderToStaticMarkup(createElement(OakWorkAnswer, { answer: longAnswer })));
  const end = start + NOTE.split(" ").length * step;
  assert.ok(Math.abs(end - oakAnswerRevealPlan(longAnswer).total) <= 2, `note ends at ${end}, OakTurn expects ${oakAnswerRevealPlan(longAnswer).total}`);
}));

test("off: the live region, the copied text and the reveal clock are as at 60fcb1e59", () => withFlag(false, () => {
  assert.equal(spoken(answerOf("gap", NOTE)), `Oak answered. ${NOTE}\n\n${CLAIMS_TEXT}`);
  assert.equal(copied(answerOf("gap", NOTE)), `${NOTE}\n\n${CLAIMS_TEXT}`);
  assert.deepEqual(clocks(renderToStaticMarkup(createElement(OakWorkAnswer, { answer: longAnswer }))), ["0/23.8", "190/23.8"]);
  assert.deepEqual(clocks(renderToStaticMarkup(createElement(OakWorkAnswer, { answer: answerOf("gap", NOTE) }))), ["0/30", "240/30", "540/30"]);
}));

test("on, unchanged: renderOakAnswer, a gap with no claims and a sourced answer speak and copy as off", () => {
  for (const answer of [answerOf("gap", NOTE, []), answerOf("sourced", null), answerOf("sourced", "Here is what the pages say.")]) {
    assert.equal(withFlag(true, () => spoken(answer)), withFlag(false, () => spoken(answer)));
    assert.equal(withFlag(true, () => copied(answer)), renderOakAnswer(answer));
  }
  assert.equal(withFlag(true, () => renderOakAnswer(answerOf("gap", NOTE))), `${NOTE}\n\n${CLAIMS_TEXT}`, "the stored text keeps the note first");
});
