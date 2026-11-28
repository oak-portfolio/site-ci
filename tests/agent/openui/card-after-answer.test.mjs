import { test, before, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTsx } from "../design-rework/load-tsx.mjs";

// Ticket 230: a sourced answer to a mixed contact and work ask carries the Worker's contact card part; with oakCardAfterAnswer
// on, the answer reads first and the Contact card follows it, the only way to write to Steve in that turn.
globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, location: { search: "" }, addEventListener() {}, removeEventListener() {} };
const flag = loadTsx("src/lib/oakFlags/cardAfterAnswer.ts");
const once = loadTsx("src/lib/oakContactCardOnce.ts");
const { OakTurn } = loadTsx("src/components/agent/OakTurn.tsx");
const workspace = loadTsx("src/lib/oakWorkspace.ts");

const cite = { documentId: "work:oak-ai-agent", passageId: "work:oak-ai-agent:passage-001", sectionId: "work:oak-ai-agent", url: "https://steveoak.com/work/oak-ai-agent/" };
const answer = { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "c", hardPolicyVersion: "h", knowledgeRevision: "k", operations: [],
  kind: "sourced", acknowledgment: null, claims: [{ id: "claim-1", text: "The agent runs on a Cloudflare Worker with a typed tool loop.", citations: [cite] }] };
const message = (cards, id = "m230") => ({ id, role: "assistant", text: "", answer, cards, usage: null, state: "complete", page: "/", ui: null });
const contact = { kind: "contact", label: "Say Hi", url: "/contact" };
const turn = (msg) => renderToStaticMarkup(createElement(OakTurn, { latest: true, question: "I need the stack of the agent project. How do I contact Steve?",
  progress: "", contactPreference: "open", retry: null, copied: null, onCopy() {}, onContact() {}, enter: false, message: msg }));
const on = fn => { flag.forceOakCardAfterAnswer(true); try { return fn(); } finally { flag.forceOakCardAfterAnswer(null); } };
const off = fn => { flag.forceOakCardAfterAnswer(false); try { return fn(); } finally { flag.forceOakCardAfterAnswer(null); } };
const CARD = /class="oak-contact-card"/;
const BARE = />Contact Steve<\/button>/;

// The Contact card loads lazily (ticket 167): render until its chunk resolves.
before(async () => {
  workspace.setOakWorkspaceFixture({ conversationId: "warm" });
  for (let tries = 0; tries < 100 && !CARD.test(on(() => turn(message([contact], "warm")))); tries++) {
    once.resetOakContactCardOnce();
    await new Promise(resolve => setTimeout(resolve, 10));
  }
});
afterEach(() => { once.resetOakContactCardOnce(); workspace.setOakWorkspaceFixture({ messages: [], conversationId: "c230" }); });

test("on: the answer comes first, then the Contact card, and no second Contact Steve button", () => {
  workspace.setOakWorkspaceFixture({ conversationId: "c230" });
  const html = on(() => turn(message([contact])));
  assert.match(html, CARD);
  assert.ok(html.indexOf("typed tool loop") < html.search(CARD), "answer text precedes the card");
  assert.ok(html.search(CARD) < html.indexOf('aria-label="Answer actions"'), "the card closes the answer, before its action row");
  assert.doesNotMatch(html, BARE);
  assert.doesNotMatch(html, /Draft a contact brief/, "the brief next step is a second way to write to Steve");
});

test("on: the card shows once per conversation; a second answer keeps neither card nor button", () => {
  workspace.setOakWorkspaceFixture({ conversationId: "c230" });
  on(() => turn(message([contact], "first")));
  const second = on(() => turn(message([contact], "second")));
  assert.doesNotMatch(second, CARD);
  assert.doesNotMatch(second, BARE);
});

test("off: the turn renders exactly as before, the bare Contact Steve button after the answer", () => {
  const html = off(() => turn(message([contact])));
  assert.doesNotMatch(html, CARD);
  assert.match(html, BARE);
});

test("on, no contact card part: no card", () => {
  assert.doesNotMatch(on(() => turn(message([]))), CARD);
});

// Root ruling 28: the card follows whatever ends the turn, a narrowing question or the Retry line as well as an answer.
const { claims: _claims, acknowledgment: _ack, ...base } = answer;
const narrowing = { ...base, kind: "clarify", question: "Which role do you mean?", options: ["Kusala", "Oak Labs"] };

test("on: a narrowing question, then the Contact card, and no bare Contact Steve button", () => {
  workspace.setOakWorkspaceFixture({ conversationId: "c230" });
  const html = on(() => turn({ ...message([contact]), answer: narrowing }));
  assert.match(html, CARD);
  assert.ok(html.indexOf("Which role do you mean?") < html.search(CARD), "the question precedes the card");
  assert.doesNotMatch(html, BARE);
});

test("on: a failed turn, the Retry line, then the Contact card", () => {
  workspace.setOakWorkspaceFixture({ conversationId: "c230" });
  const html = on(() => turn({ ...message([contact]), answer: null, state: "failed" }));
  assert.match(html, CARD);
  assert.ok(html.indexOf("This answer stopped before it finished.") < html.search(CARD), "the failure line precedes the card");
  assert.doesNotMatch(html, BARE);
});

test("off: a narrowing question and a failed turn keep the bare Contact Steve button", () => {
  assert.match(turn({ ...message([contact]), answer: narrowing }), BARE);
  assert.match(turn({ ...message([contact]), answer: null, state: "failed" }), BARE);
});
