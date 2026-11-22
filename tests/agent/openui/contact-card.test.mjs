import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTsx } from "../design-rework/load-tsx.mjs";

// Ticket 49: the Contact card is the prepareBrief Proposal behind oakContactCard, once per conversation, never after a decline.
globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, location: { search: "" }, addEventListener() {}, removeEventListener() {} };
const flag = loadTsx("src/lib/oakFlags/contactCard.ts");
const record = loadTsx("src/data/contactCard.ts");
const once = loadTsx("src/lib/oakContactCardOnce.ts");
const { OakArrangedAnswer } = loadTsx("src/components/agent/OakOpenUIAnswer.tsx");
const workspace = loadTsx("src/lib/oakWorkspace.ts");

const cite = { documentId: "work:ecosmartloop", passageId: "work:ecosmartloop:passage-001", sectionId: "work:ecosmartloop", url: "https://steveoak.com/work/ecosmartloop/" };
const answer = { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "c", hardPolicyVersion: "h", knowledgeRevision: "k", operations: [],
  kind: "sourced", acknowledgment: null, nextTool: "brief", claims: [{ id: "claim-1", text: "Steve builds AI products end to end.", citations: [cite] }] };
const program = 'root = Answer([lead, offer])\nlead = Prose("claim-1")\noffer = Proposal("prepareBrief", "Talk to Steve about a role")';
const render = (id, latest = true) => renderToStaticMarkup(createElement(OakArrangedAnswer, { id, answer, question: "Is Steve available for contract work?", latest,
  ui: { requestId: "00000000-0000-4000-8000-0000000000c1", status: "done", program } }));
const on = fn => { flag.forceOakContactCard(true); try { return fn(); } finally { flag.forceOakContactCard(null); } };
const CARD = /class="oak-contact-card"/;
const conversation = id => workspace.setOakWorkspaceFixture({ conversationId: id });

// Ticket 167 loads the card lazily: render until its chunk resolves, so every test sees the loaded card, not the Suspense fallback.
before(async () => {
  conversation("warm");
  for (let tries = 0; tries < 100 && !CARD.test(on(() => render("warm"))); tries++) {
    once.resetOakContactCardOnce();
    await new Promise(resolve => setTimeout(resolve, 10));
  }
});

beforeEach(() => { once.resetOakContactCardOnce(); record.forceOakContactCardRecord(null); workspace.setOakWorkspaceFixture({ messages: [] }); conversation("c1"); });

test("constant off: the prepareBrief proposal is the next-step row exactly as before, and no card", () => {
  assert.equal(flag.oakContactCard, false);
  const html = render("m1");
  assert.doesNotMatch(html, CARD);
  assert.match(html, /oak-next-step oak-openui__proposal/);
});

test("on: the first intent answer shows the card, a re-render keeps it, a second intent answer shows none", () => {
  const first = on(() => render("m1"));
  assert.match(first, CARD);
  assert.match(first, /Talk to Steve/);
  assert.match(on(() => render("m1")), CARD, "the answer that drew it keeps it on re-render");
  const second = on(() => render("m2"));
  assert.doesNotMatch(second, CARD);
  assert.match(second, /oak-next-step oak-openui__proposal/, "the later answer keeps the plain next-step row");
});

test("after a decline no card shows, in that answer or a later one, until a new conversation", () => {
  assert.match(on(() => render("m1")), CARD);
  once.declineOakContactCard("c1");
  assert.doesNotMatch(on(() => render("m1")), CARD);
  assert.doesNotMatch(on(() => render("m2")), CARD);
  conversation("c2");
  assert.match(on(() => render("n1")), CARD, "a new conversation may show the card once again");
});

test("ticket 143: a declined conversation's claiming answer keeps the receipt when it renders again as an older turn", () => {
  assert.match(on(() => render("m1")), CARD);
  once.declineOakContactCard("c1");
  const again = on(() => render("m1", false));
  assert.doesNotMatch(again, CARD);
  assert.match(again, /Got it\. Contact Steve stays in the header\./);
  assert.doesNotMatch(again, /oak-next-step/, "the declined answer never turns back into the contact-brief row");
});

test("ticket 143: a claiming turn that failed gives the slot back, so the retried answer shows the card", () => {
  assert.match(on(() => render("m1")), CARD);
  workspace.setOakWorkspaceFixture({ conversationId: "c1", messages: [{ id: "m1", role: "assistant", state: "failed" }] });
  assert.match(on(() => render("m2")), CARD, "the retry draws the card");
  assert.doesNotMatch(on(() => render("m3")), CARD, "still once per conversation");
});

test("ticket 143: a failed turn does not undo a decline", () => {
  assert.match(on(() => render("m1")), CARD);
  once.declineOakContactCard("c1");
  workspace.setOakWorkspaceFixture({ conversationId: "c1", messages: [{ id: "m1", role: "assistant", state: "failed" }] });
  assert.doesNotMatch(on(() => render("m2")), CARD);
});

test("the ring glow is the Contact card's alone: one glowing block in the answer, and no other block's style uses the ring", () => {
  const html = on(() => render("m1"));
  assert.equal(html.split("data-glow").length - 1, 1);
  const dir = "src/styles/openui";
  const users = readdirSync(dir).filter(file => readFileSync(`${dir}/${file}`, "utf8").includes("--oak-ring"));
  assert.deepEqual(users, ["contact-card.css"]);
  const line = readFileSync("DESIGN.md", "utf8").split("\n").find(text => text.includes("**The ring for what matters"));
  assert.match(line, /five places/);
  assert.match(line, /Contact card/);
});

test("availability and book a call render only from reviewed values, and are absent when none exist", () => {
  assert.equal(record.oakContactCardRecord.reviewed, false, "the draft waits for Oak's review at sitting 2");
  assert.equal(record.oakContactCardRecord.bookingUrl, "", "no booking link until Oak gives one (O33)");
  const draft = on(() => render("m1"));
  assert.doesNotMatch(draft, /oak-contact-card__availability/);
  assert.doesNotMatch(draft, /Book a call/);
  once.resetOakContactCardOnce();
  record.forceOakContactCardRecord({ reviewed: true, availability: "Open to new roles", bookingUrl: "https://cal.example/steve" });
  const reviewed = on(() => render("m1"));
  assert.match(reviewed, /oak-contact-card__availability[^>]*>.*Open to new roles/);
  assert.match(reviewed, /href="https:\/\/cal\.example\/steve"[^>]*>.*Book a call/);
  once.resetOakContactCardOnce();
  record.forceOakContactCardRecord({ reviewed: false, availability: "Open to new roles", bookingUrl: "https://cal.example/steve" });
  const unreviewed = on(() => render("m1"));
  assert.doesNotMatch(unreviewed, /Open to new roles|Book a call/);
});

test("the card offers Send a note as its one white primary and LinkedIn as a quiet link", () => {
  const html = on(() => render("m1"));
  assert.equal(html.split("oak-contact-card__primary").length - 1, 1);
  assert.match(html, /Send a note/);
  assert.match(html, /href="https:\/\/www\.linkedin\.com\/in\/whoisoak\/"/);
});
