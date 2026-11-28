import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { loadTsx } from "./load-tsx.mjs";

// D143: Codex review on PR #119 (f1caf4f2). P1: a private quote reached the Worker as an ordinary turn. P1: Retry on a
// reopened interrupted private quote sent it as public. P2: a follow-up chip could repeat the question just asked.
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");

test("D143-G1 Retry on a reopened interrupted private quote stays private and tells the Worker so", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const sent = [];
    await page.route("**/api/oak/chat**", route => { sent.push(route.request().postDataJSON()?.turn ?? null); return route.abort(); });
    await page.goto(`${galleryUrl}/__dev/oak-states?state=answer-points`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
    const result = await page.evaluate(async () => {
      const find = name => performance.getEntriesByType("resource").map(entry => entry.name).find(url => new RegExp(`/${name}\\.ts(\\?|$)`).test(url));
      const workspace = await import(find("src/lib/oakWorkspace"));
      const turn = crypto.randomUUID(), quote = "Led design for an AI meeting-notes app", words = "Can you say more about that?";
      const base = { cards: [], usage: null, page: "/", research: null, answer: null, taskKind: "question" };
      // As a saved chat reopens: the question keeps its privacy and quotes; the synthesized interrupted reply does not.
      workspace.setOakWorkspaceFixture({ conversationId: crypto.randomUUID(), quotes: [], draft: "Something newer", pending: false, error: null, messages: [
        { ...base, id: `${turn}:user`, role: "user", state: "complete", privateDocumentTurn: true, text: `> ${quote}\n\n${words}`, quoted: { quotes: [quote], text: words } },
        { ...base, id: turn, role: "assistant", state: "interrupted", text: "" }] });
      workspace.retryOakTurn(turn);
      await new Promise(resolve => setTimeout(resolve, 1500));
      const state = workspace.getOakWorkspace();
      return { private: state.messages.at(-2)?.privateDocumentTurn ?? null, quotes: state.messages.at(-2)?.quoted?.quotes ?? null, draft: state.draft, quote };
    });
    assert.equal(result.private, true, "the resent question stays private");
    assert.deepEqual(result.quotes, [result.quote], "the quote is resent");
    assert.equal(result.draft, "Something newer", "the newer draft comes back");
    assert.equal(sent.length, 1);
    assert.equal(sent[0]?.privateQuote, true, "the Worker is told the turn quotes a private answer");
  } finally {
    await browser.close();
  }
});

test("D143-G2 a follow-up chip never repeats the question just asked", () => {
  const { oakAnswerSuggestions } = loadTsx("src/lib/oakSuggestions.ts");
  const message = { role: "assistant", state: "complete", cards: [], answer: { kind: "sourced", knowledgeRevision: "r", points: [] } };
  const suggestions = oakAnswerSuggestions(message, "What evidence supports this?");
  assert.ok(!suggestions.includes("What evidence supports this?"), JSON.stringify(suggestions));
  assert.ok(suggestions.length >= 2);
});

test("a gap answer's follow-ups never ask for evidence it just said is missing", () => {
  const { oakAnswerSuggestions } = loadTsx("src/lib/oakSuggestions.ts");
  const gap = { role: "assistant", state: "complete", cards: [], answer: { kind: "gap", knowledgeRevision: "r", claims: [] } };
  assert.deepEqual(oakAnswerSuggestions(gap), ["What has Steve built?", "What should I ask Steve to fill that evidence gap?"]);
  assert.deepEqual(oakAnswerSuggestions(gap, "What has Steve built?"), ["What should I ask Steve to fill that evidence gap?"]);
  const linked = { ...gap, cards: [{ kind: "navigate", label: "EcoSmartLoop: AI Agent Platform", url: "https://steveoak.com/work/ecosmartloop" }] };
  assert.equal(oakAnswerSuggestions(linked)[0], "What did Steve own on EcoSmartLoop?");
});
