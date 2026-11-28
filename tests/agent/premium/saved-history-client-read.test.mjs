import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createLoader } from "../design-rework/load-tsx.mjs";

const requests = [];
let respond = () => new Response("unset", { status: 500 });
const load = createLoader({
  stubs: {
    "./oakAccountClient": { getOakAccountContext: () => ({ epoch: 1 }), oakAuthorizationHeaders: async () => ({ Authorization: "Bearer unit.header.signature" }) },
    "./oakFundingSession": { oakFundingContentGuardHeaders: () => ({}) },
  },
  globals: { fetch: async (url, options) => { requests.push({ url, options }); return respond(url, options); } },
});
const client = load("src/lib/oakSavedHistoryClient.ts");
const output = load("packages/oak-agent-contracts/src/output.ts");
const contracts = load("packages/oak-agent-contracts/src/saved-conversations.ts");

const stored = JSON.parse(readFileSync(new URL("./stored-openui-programs.json", import.meta.url), "utf8"));
const settled = stored.find(item => item.id === "answer-openui-settled");
const stale = 'root = Answer([t, src])\nt = Timeline([a, b])\na = TimelineItem("September to December 2025", "claim-1")\nb = TimelineItem("January 30, 2026", "claim-2")\nsrc = Sources()';
const base = { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "oak-v1", hardPolicyVersion: "policy-v1", operations: ["search", "read"] };
const conversationId = "11111111-1111-4111-8111-111111111111";
const requestId = n => `${String(n).padStart(8, "0")}-2222-4222-8222-222222222222`;
const savedAt = Date.UTC(2026, 10, 4);

const turn = (n, program) => {
  const id = requestId(n), answer = { ...base, ...settled.answer };
  return [
    { id: `${id}:user`, role: "user", text: settled.question, answer: null, cards: [], page: "/", taskKind: "question" },
    { id, role: "assistant", text: output.renderOakAnswer(answer), answer, cards: [], page: "/", taskKind: "question",
      ...(program === undefined ? {} : { ui: { requestId: id, program, status: "done" } }) },
  ];
};
const record = messages => ({ conversationId, version: 1, messages, createdAt: savedAt, lastSavedMessageAt: savedAt, updatedAt: savedAt,
  expiresAt: contracts.getSavedConversationExpiry(savedAt), lastNewSavedMessageId: messages.at(-1).id });

const kept = turn(1, settled.program), staleTurn = turn(2, stale), plain = turn(3);
const staleRecord = record([...kept, ...staleTurn, ...plain]);
const { ui: _dropped, ...staleAsPlain } = staleTurn[1];
const expectedMessages = [...kept, staleTurn[0], staleAsPlain, ...plain];

test("the fixture record is one the strict schema refuses, so the client has to read it leniently", () => {
  assert.equal(contracts.parseSavedConversationRecord(staleRecord), null);
});

test("reopening a saved chat with a stale layout shows that one answer as plain text and keeps every other message", async () => {
  requests.length = 0;
  respond = () => Response.json(staleRecord);
  const read = await client.readOakSavedConversation(conversationId);
  assert.equal(requests[0].url, `/api/oak/conversations/${conversationId}`);
  assert.deepEqual(read.messages, expectedMessages);
  assert.equal(read.messages[1].ui.program, settled.program, "a layout that still covers is kept");
  assert.equal(read.messages[3].answer.kind, "sourced", "the stale message keeps its answer");
  assert.equal(read.messages[3].text, staleTurn[1].text, "and its text");
});

test("exporting a saved chat with a stale layout opens it the same way", async () => {
  requests.length = 0;
  respond = () => Response.json(staleRecord);
  const read = await client.exportOakSavedConversation(conversationId);
  assert.equal(requests[0].url, `/api/oak/conversations/${conversationId}/export`);
  assert.deepEqual(read.messages, expectedMessages);
});

test("a record that is broken in more than its layout is still unavailable", async () => {
  const broken = record([...kept, staleTurn[0], { ...staleTurn[1], text: "Truncated text" }]);
  respond = () => Response.json(broken);
  await assert.rejects(client.readOakSavedConversation(conversationId), error => error.code === "unavailable");
  await assert.rejects(client.exportOakSavedConversation(conversationId), error => error.code === "unavailable");
  respond = () => Response.json({ ...staleRecord, bearer: "PRIVATE" });
  await assert.rejects(client.readOakSavedConversation(conversationId), error => error.code === "unavailable");
});

test("saving or appending a stale layout is still refused before any request leaves", async () => {
  requests.length = 0;
  const messages = turn(4, stale);
  await assert.rejects(client.saveOakConversation({ intent: "explicit-save", conversationId, messages }), error => error.code === "invalid-input");
  await assert.rejects(client.appendOakSavedConversation({ conversationId, expectedVersion: 1, messages }), error => error.code === "invalid-input");
  assert.equal(requests.length, 0);
});

test("a save acknowledgement carrying a stale layout is not accepted as a read", async () => {
  respond = () => Response.json(staleRecord);
  await assert.rejects(client.saveOakConversation({ intent: "explicit-save", conversationId, messages: [...kept] }), error => error.code === "unavailable");
});
