import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { loadTsx } from "../design-rework/load-tsx.mjs";

const contractsDir = "packages/oak-agent-contracts/src";
const output = loadTsx(`${contractsDir}/output.ts`);
const contracts = loadTsx(`${contractsDir}/saved-conversations.ts`);

const stored = JSON.parse(readFileSync(new URL("./stored-openui-programs.json", import.meta.url), "utf8"));
const base = { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "oak-v1", hardPolicyVersion: "policy-v1", operations: ["search", "read"] };
const conversationId = "11111111-1111-4111-8111-111111111111";
const requestId = (n) => `${String(n).padStart(8, "0")}-2222-4222-8222-222222222222`;
const savedAt = Date.UTC(2026, 10, 4);

const turn = (n, item, program) => {
  const id = requestId(n), answer = { ...base, ...item.answer };
  return [
    { id: `${id}:user`, role: "user", text: item.question, answer: null, cards: [], page: "/", taskKind: "question" },
    { id, role: "assistant", text: output.renderOakAnswer(answer), answer, cards: [], page: "/", taskKind: "question",
      ...(program === undefined ? {} : { ui: { requestId: id, program, status: "done" } }) },
  ];
};
const record = (messages) => ({ conversationId, version: 1, messages, createdAt: savedAt, lastSavedMessageAt: savedAt, updatedAt: savedAt,
  expiresAt: contracts.getSavedConversationExpiry(savedAt), lastNewSavedMessageId: messages.at(-1).id });

const settled = stored.find(item => item.id === "answer-openui-settled");
// Places claim-1 and claim-2 but not claim-3: the shape a stored program takes once a later coverage rule stops counting one of its blocks.
const stale = 'root = Answer([t, src])\nt = Timeline([a, b])\na = TimelineItem("September to December 2025", "claim-1")\nb = TimelineItem("January 30, 2026", "claim-2")\nsrc = Sources()';

test("a saved chat whose stored layout no longer covers opens with that answer as plain text, every other message intact", () => {
  const kept = turn(1, settled, settled.program), staleTurn = turn(2, settled, stale), plain = turn(3, settled);
  const saved = record([...kept, ...staleTurn, ...plain]);
  assert.equal(contracts.parseSavedConversationRecord(saved), null, "the strict schema refuses the record, which today is a 503 for the whole chat");

  const read = contracts.parseSavedConversationRecordForRead(saved);
  assert.ok(read, "the read schema opens the chat");
  const { ui: _dropped, ...staleAsPlain } = staleTurn[1];
  assert.deepEqual(read.messages, [...kept, staleTurn[0], staleAsPlain, ...plain],
    "only the stale message loses its layout; its answer and text and every other message stay as saved");
  assert.equal(read.messages[1].ui.program, settled.program, "a layout that still covers is kept");
});

test("a save carrying a layout that does not cover is still refused", () => {
  const messages = [...turn(1, settled, stale)];
  assert.equal(contracts.parseSaveConversationRequest({ intent: "explicit-save", conversationId, messages }), null);
  assert.equal(contracts.parseAppendSavedConversationRequest({ conversationId, expectedVersion: 1, messages }), null);
  assert.equal(contracts.parseSavedConversationRecord(record(messages)), null, "the record the Worker writes stays strict");
});

test("the read drops only a layout: a message that is broken without it still fails the read", () => {
  const [user, assistant] = turn(1, settled, stale);
  assert.equal(contracts.parseSavedConversationRecordForRead(record([user, { ...assistant, text: "A truncated answer." }])), null);
  assert.equal(contracts.parseSavedConversationRecordForRead(record([user, { ...assistant, answer: { ...assistant.answer, claims: [] } }])), null);
});

/*
 * The frozen corpus: saved records as a save produced them, never regenerated. Each entry is { id, source, note?, record }.
 * A component ticket appends a record for its stored program (definition of done item 32); an existing record never changes.
 */
const corpusDir = new URL("./saved-history-corpus/", import.meta.url);
const corpus = readdirSync(corpusDir).filter(name => name.endsWith(".json")).sort()
  .flatMap(name => JSON.parse(readFileSync(new URL(name, corpusDir), "utf8")).map(entry => ({ ...entry, file: name })));

for (const entry of corpus) {
  test(`saved-history corpus ${entry.file} ${entry.id} reads back unchanged`, () => {
    assert.deepEqual(contracts.parseSavedConversationRecord(entry.record), entry.record, "the strict schema still accepts it");
    assert.deepEqual(contracts.parseSavedConversationRecordForRead(entry.record), entry.record, "the read keeps every layout");
  });
}

test("saved-history corpus: every stored program, a record saved before genui-rest and one citing a removed document", () => {
  const programs = new Set(corpus.flatMap(entry => entry.record.messages.flatMap(message => message.ui ? [message.ui.program] : [])));
  const missing = stored.filter(item => !programs.has(item.program)).map(item => item.id);
  assert.deepEqual(missing, [], `stored programs with no saved record: ${missing.join(", ")}`);
  assert.ok(corpus.some(entry => entry.record.createdAt < Date.UTC(2026, 10, 2)), "a record saved before the genui-rest round");
  assert.ok(corpus.some(entry => entry.record.messages.some(message => message.answer?.claims?.some(claim =>
    claim.citations.some(citation => citation.documentId === "work:retired-case-study")))), "a record citing a document that no longer exists");
});
