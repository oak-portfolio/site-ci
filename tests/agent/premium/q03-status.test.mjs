import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import postcss from "postcss";
import { chromium } from "playwright";
import { loadTsx } from "../design-rework/load-tsx.mjs";
import { openState } from "./gallery.mjs";

globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, addEventListener() {}, removeEventListener() {} };
const workspace = loadTsx("src/lib/oakWorkspace.ts");
const { OakTurn } = loadTsx("src/components/agent/OakTurn.tsx");
const { OakChainOfThought } = loadTsx("src/components/agent/OakChainOfThought.tsx");
const { OakOutputAnnouncements, collectOakOutputAnnouncements } = loadTsx("src/components/agent/OakTranscript.tsx");
const { oakComposerSuggestions } = loadTsx("src/lib/oakSuggestions.ts");

const answer = { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "f", hardPolicyVersion: "f", knowledgeRevision: "f",
  operations: ["search"], kind: "sourced", acknowledgment: null,
  claims: [{ id: "c1", text: "Steve owned the app around the classifier.", citations: [{ documentId: "work:ecosmartloop", passageId: "p1",
    sectionId: "ownership", url: "https://steveoak.com/work/ecosmartloop/#ownership" }] }] };
const assistant = (fields) => ({ id: "a1", role: "assistant", text: "", answer: null, cards: [], usage: null, state: "complete", page: "/", ...fields });
const turnProps = { question: "What did Steve own?", progress: "", contactPreference: "open", retry: null, copied: null, onCopy() {}, onContact() {} };

test("Q03-G2 the answer's body is on screen in the same frame the reasoning fold closes", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    // Every animation frame from the first paint: is the trail's panel still there, and is the answer's body visible yet?
    await page.addInitScript(() => {
      window.__frames = [];
      const sample = () => {
        const body = document.querySelector(".oak-turn__answer .ui-bubble");
        window.__frames.push({ t: performance.now(), panel: Boolean(document.querySelector(".ui-chain-of-thought__content")),
          body: body ? Number(getComputedStyle(body).opacity) : -1 });
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    // The gallery replays this answer the way a visitor sees it: the live trail, then the answer lands and the trail folds.
    await openState(page, "answer-sourced");
    const frames = await page.evaluate(() => window.__frames);
    const opened = frames.findIndex(frame => frame.panel);
    assert.ok(opened >= 0, "the live trail opened");
    const closed = frames.findIndex((frame, index) => index > opened && !frame.panel);
    assert.ok(closed > opened, "the trail folded");
    assert.ok(frames[closed].body > 0.05, `the answer is visible as the fold closes (opacity ${frames[closed].body})`);
    const empty = frames.slice(closed).filter(frame => frame.body <= 0.05);
    assert.equal(empty.length, 0, "no later frame shows the folded header over an empty body");
  } finally { await browser.close(); }
});

test("Q03-G3 interrupted, failed, connection-lost, model-busy, quota-reached and paused share one notice: one tile, one action row", () => {
  const kinds = { interrupted: { state: "interrupted" }, failed: { state: "failed" }, "connection-lost": { state: "failed", failure: "offline" },
    "model-busy": { state: "failed", failure: "busy" }, "quota-reached": { state: "failed", failure: "allowance" }, paused: { state: "failed", failure: "paused" } };
  const roots = new Set();
  for (const [name, fields] of Object.entries(kinds)) {
    const html = renderToStaticMarkup(createElement(OakTurn, { ...turnProps, retry: fields.failure === "allowance" ? null : "resend", message: assistant(fields) }));
    const notices = html.match(/<div class="oak-turn__stopped"[^>]*>/g) ?? [];
    assert.equal(notices.length, 1, `${name}: one notice`);
    roots.add(notices[0].replace(/ data-failure="[^"]*"| data-tone="[^"]*"/g, ""));
    assert.match(notices[0], /data-tone="(neutral|limit)"/, `${name}: a neutral notice, or a gold tile for a real limit`);
    assert.equal(html.match(/class="oak-turn__stopped-art oak-art-tile"/g)?.length, 1, `${name}: one tile`);
    // T23a-11 (intentional update): a send that never arrived leaves its one Retry to the visitor's bubble, so no action row.
    assert.equal(html.match(/class="oak-turn__stopped-actions"/g)?.length ?? 0, name === "connection-lost" ? 0 : 1, `${name}: action rows`);
    assert.equal(html.match(/class="oak-turn__stopped-title"/g)?.length, 1, `${name}: one line for what happened`);
    assert.equal(html.match(/class="oak-turn__stopped-detail"/g)?.length, 1, `${name}: one line for what next`);
  }
  assert.equal(roots.size, 1, "the same component and attributes for every kind");
  // One surface: no kind repaints the notice itself; only a tile takes a tint.
  const css = postcss.parse(readFileSync("src/styles/oakAgent.css", "utf8"));
  css.walkRules(rule => {
    if (!/\.oak-turn__stopped\[data-tone="[a-z]+"\]$/.test(rule.selector.trim())) return;
    rule.walkDecls(decl => assert.ok(!/^(background|border-color|border)$/.test(decl.prop), `${rule.selector} repaints the notice (${decl.prop})`));
  });
});

test("Q03-G4 the one polite live region announces started, tool running, complete, stopped and failed, and never tokens", () => {
  const announced = new Set();
  const say = (messages) => collectOakOutputAnnouncements(messages, announced);
  const now = Date.now();
  assert.equal(say([assistant({ state: "pending" })]), "Oak started on your question.");
  assert.equal(say([assistant({ state: "pending", steps: [{ id: "search-1", operation: "search", state: "running", startedAt: now }] })]),
    "Searching Steve's public work.");
  const thought = "TOKEN-STREAM private chain of words the model is still typing";
  const typing = say([assistant({ state: "pending", steps: [{ id: "search-1", operation: "search", state: "done", startedAt: now, endedAt: now + 1 },
    { id: "think-0", operation: "think", state: "running", startedAt: now + 2, thought: { title: "Weighing", text: thought } }] })]);
  assert.equal(typing, "", "a streaming thought is never read out");
  assert.match(say([assistant({ id: "a1", state: "complete", answer, text: "Steve owned the app." })]), /^Oak answered\. /, "complete");
  assert.match(say([assistant({ id: "a2", state: "interrupted" })]), /Answer stopped\./, "stopped");
  assert.match(say([assistant({ id: "a3", state: "failed", failure: "offline" })]), /Answer failed\. The connection dropped\./, "failed");
  // The reasoning trail no longer runs its own region: the transcript's single region is the only live one.
  const trail = renderToStaticMarkup(createElement(OakChainOfThought, { question: "q", progress: "Searching Steve's public work",
    message: assistant({ state: "pending", steps: [{ id: "search-1", operation: "search", state: "running", startedAt: now }] }) }));
  assert.doesNotMatch(trail, /aria-live|role="status"/);
  const region = renderToStaticMarkup(createElement(OakOutputAnnouncements, { messages: [] }));
  assert.equal(region.match(/aria-live="polite"/g)?.length, 1);
});

test("Q03-G5 a stopped or failed turn, or an error line, hides the follow-up chips until the visitor acts", () => {
  const base = { pending: false, error: null, contactNotice: "", saveError: null, historyError: null, authError: null };
  const asked = { id: "a0:user", role: "user", text: "What did Steve own?" };
  assert.ok(oakComposerSuggestions({ ...base, messages: [asked, assistant({ answer })] }, false).length > 0, "a complete answer offers follow-ups");
  assert.deepEqual(oakComposerSuggestions({ ...base, error: "Your browser kept the clipboard private.", messages: [asked, assistant({ answer })] }, false), []);
  assert.deepEqual(oakComposerSuggestions({ ...base, messages: [asked, assistant({ state: "failed", failure: "offline" })] }, false), []);
  assert.deepEqual(oakComposerSuggestions({ ...base, messages: [asked, assistant({ state: "interrupted" })] }, false), []);
});

test("Q03-G5 a quota stop clears the stale question from the message box; other failures still give it back", async () => {
  const savedFetch = globalThis.fetch;
  const run = async (response, draft) => {
    globalThis.fetch = async (url) => url === "/api/oak/chat" ? response() : new Response("{}", { status: 503 });
    workspace.setOakWorkspaceFixture({ presentation: "human-agent", viewportSupported: true, messages: [], pending: false, error: null, draft });
    await workspace.submitOakTurn();
    return workspace.getOakWorkspace();
  };
  try {
    const quota = await run(() => new Response(JSON.stringify({ error: "allowance" }), { status: 429 }), "Who built the classifier?");
    assert.equal(quota.messages.at(-1).failure, "allowance");
    assert.equal(quota.draft, "", "sending the same question would meet the same limit");
    assert.equal(quota.messages.at(-2).text, "Who built the classifier?", "the question stays readable in the transcript");
    const busy = await run(() => new Response(null, { status: 502 }), "Who built the classifier?");
    assert.equal(busy.messages.at(-1).failure, "unreachable");
    assert.equal(busy.draft, "Who built the classifier?", "a retryable failure puts the question back");
  } finally { globalThis.fetch = savedFetch; workspace.setOakWorkspaceFixture({ messages: [], draft: "", error: null }); }
});
