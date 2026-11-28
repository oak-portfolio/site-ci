import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { createLoader, stubSets } from "./load-tsx.mjs";

const calls = [];
const fixture = { state: { authStatus: null, messages: [], agentEligible: true, pending: false }, inline: false };
const workspace = {
  setOakDraft: (text) => calls.push(["draft", text]),
  requestOakWorkspace: () => { calls.push(["open"]); return true; },
  submitOakTurn: () => { calls.push(["submit"]); },
  useOakWorkspace: () => fixture.state,
  getOakWorkspace: () => fixture.state,
  oakInlineHostOn: () => fixture.inline,
};
const funding = {
  oakOpenGrantCode: () => calls.push(["grant"]),
  oakUseOpenRouter: () => calls.push(["openrouter"]),
  OakOpenRouterMark: () => createElement("img", { alt: "" }),
};
const load = createLoader({ use: [stubSets.icons], stubs: { "@/lib/oakWorkspace": workspace, "@/components/agent/OakFundingControl": funding }, interop: true });
const flag = load("src/lib/oakFlags/chatFirstHome.ts");
const { OakChatFirstHome } = load("src/components/home/OakChatFirstHome.tsx");
const { OakHomeComposer, OakHomeNotice, OakHomeNoticeAction, homeComposerReducer, homeComposerModes, homeNotice, homeAnswersLeft, homeRefillRows } = load("src/components/home/OakHomeComposer.tsx");

const memoryStorage = () => {
  const items = new Map();
  return { getItem: (key) => items.get(key) ?? null, setItem: (key, value) => items.set(key, String(value)), items };
};

test.afterEach(() => { flag.forceOakChatFirstHome(null); calls.length = 0; fixture.inline = false; });

test("the chat-first home constant is pinned in flag-pins, and a force flips it both ways", () => {
  assert.equal(flag.oakChatFirstHomeOn(), flag.oakChatFirstHome);
  flag.forceOakChatFirstHome(false);
  assert.equal(flag.oakChatFirstHomeOn(), false);
  flag.forceOakChatFirstHome(true);
  assert.equal(flag.oakChatFirstHomeOn(), true);
});

test("a first visit opens in chat, Close lays out the Classic home and stays closed after a reload", () => {
  const storage = memoryStorage();
  const root = { dataset: {} };
  assert.equal(flag.readOakHomeMode(storage), "chat");
  flag.setOakHomeMode("classic", { storage, root });
  assert.equal(root.dataset.oakHome, "classic");
  assert.equal(storage.items.get(flag.oakHomeModeKey), "classic");
  assert.equal(flag.readOakHomeMode(storage), "classic", "a reload reads the closed state back");
  flag.setOakHomeMode("chat", { storage, root });
  assert.equal(flag.readOakHomeMode(storage), "chat");
});

test("an unreadable store falls back to chat without throwing", () => {
  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.equal(flag.readOakHomeMode(broken), "chat");
  assert.doesNotThrow(() => flag.setOakHomeMode("classic", { storage: broken, root: { dataset: {} } }));
});

test("Close and reopen never start a new thread", () => {
  const storage = memoryStorage(), root = { dataset: {} };
  flag.setOakHomeMode("classic", { storage, root });
  flag.setOakHomeMode("chat", { storage, root });
  assert.deepEqual(calls, [], "no workspace call, so the conversation id is untouched");
});

test("the home composer keeps typed text across ask, search and launcher modes", () => {
  assert.deepEqual(homeComposerModes.map((mode) => mode.id), ["ask", "search", "agent"]);
  let state = homeComposerReducer({ text: "", mode: "ask" }, { type: "text", text: "What has Steve built?" });
  for (const mode of ["search", "agent", "ask"]) {
    state = homeComposerReducer(state, { type: "mode", mode });
    assert.equal(state.text, "What has Steve built?", `${mode} keeps the text`);
    assert.equal(state.mode, mode);
  }
});

test("rendering the chat chrome and the composer calls no model and no workspace", () => {
  const fetched = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (...args) => { fetched.push(args); return Promise.reject(new Error("no network")); };
  try {
    flag.forceOakChatFirstHome(true);
    const chrome = renderToStaticMarkup(createElement(OakChatFirstHome));
    const composer = renderToStaticMarkup(createElement(OakHomeComposer));
    assert.match(chrome, /Close chat/);
    assert.match(composer, /Ask about Steve/);
    assert.doesNotMatch(chrome + composer, /<h[1-6][ >]/, "the chrome adds no section heading");
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.deepEqual(fetched, []);
  assert.deepEqual(calls, []);
});

test("only a submit in ask mode sends; agent mode opens the workspace with the text; search sends nothing", () => {
  const { submitHomeComposer } = load("src/components/home/OakHomeComposer.tsx");
  assert.equal(submitHomeComposer({ text: "  ", mode: "ask" }), false);
  assert.deepEqual(calls, []);
  submitHomeComposer({ text: "Hi Oak", mode: "agent" });
  assert.deepEqual(calls, [["draft", "Hi Oak"], ["open"]]);
  calls.length = 0;
  submitHomeComposer({ text: "Hi Oak", mode: "ask" });
  assert.deepEqual(calls, [["draft", "Hi Oak"], ["open"], ["submit"]]);
  calls.length = 0;
  submitHomeComposer({ text: "work", mode: "search" });
  assert.ok(!calls.some(([kind]) => kind === "submit"));
});

test("on the chat-first home an ask sends inline without opening the agent dialog", () => {
  const { submitHomeComposer } = load("src/components/home/OakHomeComposer.tsx");
  fixture.inline = true;
  assert.equal(submitHomeComposer({ text: "Hi Oak", mode: "ask" }), true);
  assert.deepEqual(calls, [["draft", "Hi Oak"], ["submit"]]);
  calls.length = 0;
  submitHomeComposer({ text: "Hi Oak", mode: "agent" });
  assert.deepEqual(calls, [["draft", "Hi Oak"], ["open"]], "Agent still opens the full agent");
});

const tick = () => new Promise((resolve) => setImmediate(resolve));
function storeFixture(values = new Map()) {
  const requests = [];
  const root = { dataset: {} };
  const context = {
    window: Object.assign(new EventTarget(), { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, location: { origin: "https://steveoak.com", pathname: "/", search: "" },
      sessionStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) } }),
    document: Object.assign(new EventTarget(), { documentElement: root, body: { dataset: { oakAgentEligible: "true", oakMascotEligible: "true", oakSourceIds: "[]" } },
      querySelectorAll: () => [], querySelector: () => null, createElement: () => ({ remove() {} }), head: { appendChild() {} } }),
    MutationObserver: class { observe() {} disconnect() {} },
    fetch: (...args) => { requests.push(args); return Promise.resolve(Response.json({ error: "answer-unavailable" }, { status: 503 })); },
  };
  const storeLoad = createLoader({ use: [stubSets.workspaceStore()], jsx: "react", globals: context, stubs: { "@/components/ui/Icon": { Icon: () => null } } });
  const store = storeLoad("src/lib/oakWorkspace.ts");
  store.setOakWorkspaceFixture({ agentEligible: true });
  return { store, requests, root, values, output: storeLoad("packages/oak-agent-contracts/src/output.ts") };
}
const chatRequests = (f) => f.requests.filter(([url]) => url === "/api/oak/chat");

test("with the inline host on an ask sends while the page is browsed, so nothing turns inert", async () => {
  const f = storeFixture();
  f.store.setOakInlineHost(true);
  f.store.setOakDraft("What has Steve built?");
  await f.store.submitOakTurn(); await tick();
  assert.equal(chatRequests(f).length, 1, "the ask reached the chat transport");
  const state = f.store.getOakWorkspace();
  assert.equal(state.presentation, "human-browse");
  assert.equal(f.root.dataset.oakPresentation, "human-browse", "the route surface is never made inert");
  assert.equal(state.messages.at(-1).role, "assistant", "the turn lands in the shared thread");
});

test("with the inline host off a browsing tab cannot send, as before", async () => {
  const f = storeFixture();
  f.store.setOakDraft("What has Steve built?");
  await f.store.submitOakTurn(); await tick();
  assert.equal(chatRequests(f).length, 0);
  assert.deepEqual(f.store.getOakWorkspace().messages, []);
  f.store.setOakInlineHost(true); f.store.setOakInlineHost(false);
  await f.store.submitOakTurn(); await tick();
  assert.equal(chatRequests(f).length, 0, "unmounting the home host turns it back off");
});

test("a reload returns to the same thread inline", () => {
  const values = new Map();
  const first = storeFixture(values);
  const answer = { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "fixture", hardPolicyVersion: "fixture", knowledgeRevision: "fixture",
    operations: ["read"], kind: "sourced", acknowledgment: null, claims: [{ id: "claim-one", text: "Steve built the Oak AI Agent.",
      citations: [{ documentId: "work:ecosmartloop", passageId: "p", sectionId: "s", url: "https://steveoak.com/work/ecosmartloop/#proof" }] }] };
  const id = "0b4f6a52-5b1e-4c55-9a43-6f1c1d1c2a10", conversationId = "7d3e4f2a-1b2c-4d5e-8f90-a1b2c3d4e5f6";
  first.store.setOakInlineHost(true);
  first.store.setOakWorkspaceFixture({ conversationId, messages: [
    { id: `${id}:user`, role: "user", text: "What has Steve built?", answer: null, cards: [], usage: null, state: "complete", page: "/", research: null },
    { id, role: "assistant", text: first.output.renderOakAnswer(answer), answer, cards: [], usage: null, state: "complete", page: "/", research: null },
  ] });
  first.store.setOakDraft("A follow-up");
  assert.equal(values.has("oak.auth-handoff.v1"), false, "the sign-in handoff key stays free");
  const reloaded = storeFixture(values);
  reloaded.store.setOakInlineHost(true);
  const state = reloaded.store.getOakWorkspace();
  assert.equal(state.conversationId, conversationId);
  assert.deepEqual(state.messages.map((message) => message.id), [`${id}:user`, id]);
  assert.equal(state.presentation, "human-browse", "the thread comes back inline, not in the dialog");
  reloaded.store.startNewOakConversation();
  assert.equal(values.has("oak.home.thread.v1"), false, "a new conversation drops the kept thread");
});

const status = (remaining, extra = {}) => ({ configured: true, kind: "guest", phase: "guest", role: "visitor", publishableKey: null, purpose: null,
  allowance: { answers: { limit: 12, remaining, refillsAt: remaining < 12 ? Date.UTC(2026, 10, 17, 18) : null }, window: { completed: 0, pending: 0, limit: 60, remaining: 60 } }, ...extra });
const failed = (failure) => [{ id: "u1", role: "user", text: "Hi" }, { id: "a1", role: "assistant", state: "error", failure, text: "" }];
const states = {
  quiet: { authStatus: null, messages: [], agentEligible: true },
  plenty: { authStatus: status(11), messages: [], agentEligible: true },
  "one-left": { authStatus: status(1), messages: [], agentEligible: true },
  limit: { authStatus: status(0), messages: [], agentEligible: true },
  budget: { authStatus: status(5), messages: failed("budget"), agentEligible: true },
  model: { authStatus: status(5), messages: failed("unavailable"), agentEligible: true },
  "ai-off": { authStatus: null, messages: [], agentEligible: false },
};

test("each notice shows only in its own state, read from the allowance and the last turn the agent already holds", () => {
  const kinds = Object.fromEntries(Object.entries(states).map(([name, state]) => [name, homeNotice(state, state.agentEligible)?.kind ?? null]));
  assert.deepEqual(kinds, { quiet: null, plenty: null, "one-left": "one-left", limit: "limit", budget: "budget", model: "model", "ai-off": "ai-off" });
  assert.equal(homeNotice({ ...states.model, messages: failed("busy") }, true)?.kind, "model");
  assert.equal(homeNotice({ ...states.budget, messages: failed("budget-today") }, true)?.kind, "budget");
  assert.equal(homeNotice({ ...states.limit, agentEligible: false }, false)?.kind, "ai-off", "AI off wins over every other state");
});

test("the answers-left line counts what the allowance holds and stays away until a status is known", () => {
  assert.equal(homeAnswersLeft(null), null);
  assert.equal(homeAnswersLeft(status(11)), "11 answers left today");
  assert.equal(homeAnswersLeft(status(1)), "1 answer left today");
  assert.equal(homeAnswersLeft(status(0)), null);
});

test("while a notice shows the composer drops the answers-left line, so a paused budget never claims answers are left", () => {
  assert.equal(homeAnswersLeft(status(5), null), "5 answers left today");
  assert.equal(homeAnswersLeft(status(5), homeNotice(states.budget, true)), null, "budget paused");
  assert.equal(homeAnswersLeft(status(5), homeNotice(states.model, true)), null, "model down: the notice is the one line");
  assert.equal(homeAnswersLeft(status(5), homeNotice(states["ai-off"], false)), null, "AI off");
});

test("budget and AI-off notices offer one Browse the site action that opens the no-AI list; the model notice offers none", () => {
  const actions = {};
  for (const name of ["budget", "model", "ai-off", "quiet"]) {
    const browsed = [];
    const notice = homeNotice(states[name], states[name].agentEligible);
    const html = renderToStaticMarkup(createElement(OakHomeNoticeAction, { notice, onBrowse: () => browsed.push(name) }));
    actions[name] = html.split("data-home-browse").length - 1;
    if (actions[name]) {
      assert.match(html, /Browse the site/, `${name}: the action names itself`);
      OakHomeNoticeAction({ notice, onBrowse: () => browsed.push(name) }).props.onClick();
      assert.deepEqual(browsed, [name], `${name}: the action opens Browse`);
    }
  }
  assert.deepEqual(actions, { budget: 1, model: 0, "ai-off": 1, quiet: 0 });
});

test("each notice renders once inside one live region, and only the limit holds the four-row refill sheet", () => {
  for (const [name, state] of Object.entries(states)) {
    const notice = homeNotice(state, state.agentEligible);
    const html = renderToStaticMarkup(createElement(OakHomeNotice, { notice, line: homeAnswersLeft(state.authStatus), onBrowse() {} }));
    assert.equal(html.split('role="status"').length - 1, 1, `${name}: one live region`);
    if (notice) assert.equal(html.split(notice.title.replace(/'/g, "&#x27;")).length - 1, 1, `${name}: the title shows once`);
    const rows = [...html.matchAll(/data-refill-row="([^"]+)"/g)].map((match) => match[1]);
    assert.deepEqual(rows, name === "limit" ? ["wait", "grant", "openrouter", "browse"] : [], `${name}: refill rows`);
  }
  assert.deepEqual(homeRefillRows.map((row) => row.title), ["Wait for the reset", "Grant code", "Connect OpenRouter", "Browse the site"]);
});

test("the refill sheet opens with a heading and a muted line saying when more answers come", () => {
  const notice = homeNotice(states.limit, true, Date.UTC(2026, 10, 17, 14, 48));
  assert.equal(notice?.more, "More in 3 h 12 min");
  assert.equal(homeNotice(states.limit, true, Date.UTC(2026, 10, 17, 17, 50))?.more, "More in 10 min");
  const html = renderToStaticMarkup(createElement(OakHomeNotice, { notice, line: null, onBrowse() {} }));
  assert.match(html, /<h2 class="home-chat__refill-title"[^>]*>You are out of free answers\.<\/h2>/);
  assert.match(html, /<p class="home-chat__refill-more">More in 3 h 12 min<\/p>/);
  assert.match(html, /<ul class="home-chat__refill" aria-labelledby="home-refill-title"/);
});

test("the refill rows reuse the agent's grant code and own-key entry, and Browse opens the no-AI list", () => {
  const browsed = [];
  for (const row of homeRefillRows) row.run?.({ opener: null, browse: () => browsed.push(row.id) });
  assert.deepEqual(calls, [["open"], ["grant"], ["open"], ["openrouter"]]);
  assert.deepEqual(browsed, ["browse"]);
});

test("under the 30-day cap the More in line and the Wait row read the same reset", () => {
  const now = Date.UTC(2026, 10, 17, 15);
  const capped = status(5);
  capped.allowance.answers.refillsAt = now + 3 * 3600_000;
  capped.allowance.window = { completed: 60, pending: 0, limit: 60, remaining: 0 };
  const notice = homeNotice({ authStatus: capped, messages: [] }, true, now);
  assert.equal(notice?.kind, "limit");
  assert.equal(notice.more, notice.detail, "one reset line, not a 4-hour time against a 30-day one");
  assert.match(notice.more, /30 days/);
});

const homeFixtureMessages = (f) => {
  const answer = { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "fixture", hardPolicyVersion: "fixture", knowledgeRevision: "fixture",
    operations: ["read"], kind: "sourced", acknowledgment: null, claims: [{ id: "claim-one", text: "Steve built the Oak AI Agent.",
      citations: [{ documentId: "work:ecosmartloop", passageId: "p", sectionId: "s", url: "https://steveoak.com/work/ecosmartloop/#proof" }] }] };
  const id = "0b4f6a52-5b1e-4c55-9a43-6f1c1d1c2a10";
  return { conversationId: "7d3e4f2a-1b2c-4d5e-8f90-a1b2c3d4e5f6", messages: [
    { id: `${id}:user`, role: "user", text: "What has Steve built?", answer: null, cards: [], usage: null, state: "complete", page: "/", research: null },
    { id, role: "assistant", text: f.output.renderOakAnswer(answer), answer, cards: [], usage: null, state: "complete", page: "/", research: null }] };
};

test("a held sign-in handoff is never overwritten by the home thread", () => {
  const values = new Map([["oak.auth-handoff.v1", "SIGNIN"]]);
  const f = storeFixture(values);
  f.store.setOakInlineHost(true);
  f.store.setOakWorkspaceFixture(homeFixtureMessages(f));
  f.store.setOakDraft("a private draft");
  assert.equal(values.get("oak.auth-handoff.v1"), "SIGNIN");
  assert.equal(values.has("oak.home.thread.v1"), false);
});

test("a reload skips the home restore while a sign-in handoff holds the key", () => {
  const values = new Map();
  const first = storeFixture(values);
  first.store.setOakInlineHost(true);
  first.store.setOakWorkspaceFixture(homeFixtureMessages(first));
  first.store.setOakDraft("a follow-up");
  assert.ok(values.has("oak.home.thread.v1"));
  values.set("oak.auth-handoff.v1", "SIGNIN");
  const reloaded = storeFixture(values);
  reloaded.store.setOakInlineHost(true);
  assert.equal(values.get("oak.auth-handoff.v1"), "SIGNIN");
  assert.equal(reloaded.store.getOakWorkspace().messages.length, 0);
});

test("the home thread keeps no draft, and a restore keeps the original 20-minute expiry", () => {
  const values = new Map();
  const first = storeFixture(values);
  first.store.setOakInlineHost(true);
  first.store.setOakDraft("pasted role text");
  first.store.setOakWorkspaceFixture(homeFixtureMessages(first));
  first.store.setOakDraft("pasted role text");
  const stored = values.get("oak.home.thread.v1");
  assert.ok(stored);
  assert.equal(stored.includes("pasted role text"), false, "the draft is never written to the home key");
  const { createdAt, expiresAt } = JSON.parse(stored);
  const later = JSON.stringify({ ...JSON.parse(stored), createdAt: createdAt - 60_000, expiresAt: expiresAt - 60_000 });
  values.set("oak.home.thread.v1", later);
  const reloaded = storeFixture(values);
  reloaded.store.setOakInlineHost(true);
  assert.equal(reloaded.store.getOakWorkspace().messages.length, 2);
  assert.equal(values.get("oak.home.thread.v1"), later, "the restore does not renew the lifetime");
});

test("a gated inline ask shows its gate on the home with a way into the agent's sign-in", async () => {
  const f = storeFixture();
  f.store.setOakInlineHost(true);
  f.store.setOakWorkspaceFixture({ authStatus: { configured: true, kind: "guest", phase: "sign-in-required", role: "visitor", publishableKey: null, purpose: null, allowance: null } });
  f.store.setOakDraft("third question");
  await f.store.submitOakTurn();
  const state = f.store.getOakWorkspace();
  assert.equal(chatRequests(f).length, 0);
  const notice = homeNotice(state, true);
  assert.equal(notice?.kind, "gate");
  assert.equal(notice.title, state.authError);
  const html = renderToStaticMarkup(createElement(OakHomeNotice, { notice, line: null, onBrowse() {} }));
  assert.equal(html.split('role="status"').length - 1, 1);
  assert.match(html, /<button[^>]*data-home-gate[^>]*>/);
  assert.equal(homeNotice({ ...state, authError: null, error: "Finish or stop document preparation before sending a question." }, true)?.kind, "gate");
});

test("the home box takes a returned draft back only once no turn or sign-in renewal is running", () => {
  const { homeDraftReturn } = load("src/components/home/OakHomeComposer.tsx");
  fixture.inline = true;
  assert.equal(homeDraftReturn({ draft: "Hi", pending: false, authPending: false }), "Hi");
  assert.equal(homeDraftReturn({ draft: "Hi", pending: false, authPending: true }), null, "the account renew path keeps the box clear");
  assert.equal(homeDraftReturn({ draft: "Hi", pending: true, authPending: false }), null);
  fixture.inline = false;
  assert.equal(homeDraftReturn({ draft: "Hi", pending: false, authPending: false }), null);
});

test("the home styles keep the live region in the tree, 44px mode targets, type steps and one framed focus ring", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("../../../src/styles/home-chat.css", import.meta.url), "utf8");
  assert.doesNotMatch(css, /\.home-chat__notice:empty\s*\{[^}]*display:\s*none/, "an empty live region stays in the accessibility tree");
  assert.match(css, /\.home-chat__mode \{[^}]*min-height: 32px;\s*padding: 0 14px/, "16px icon plus 14px each side is 44px wide");
  assert.match(css, /\.home-chat__mode::before \{[^}]*inset: -6px 0;\s*min-height: 44px/, "the hit area reaches 44px tall");
  assert.doesNotMatch(css, /hero-copy h1 \{\s*font-size: (52|40)px/, "the chat hero h1 uses DESIGN.md type steps");
  assert.match(css, /\.home-chat__composer \.ui-textarea:focus-visible \{[^}]*outline: none/);
  assert.match(css, /\.home-chat__composer:has\(\.ui-textarea:focus-visible\) \{[^}]*outline: 2px solid var\(--text\)/);
});
