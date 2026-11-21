import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTsx } from "./load-tsx.mjs";

// D153: Codex review on PR #119 (af72c662). Growing the draft after staging a quote let the fold shorten the quote at
// send time, so the question sent no longer matched the chip the visitor reviewed.
test("D153-G1 a staged quote is never shortened at send time; the visitor makes room first", async () => {
  globalThis.window ??= { innerWidth: 1280, innerHeight: 800, outerWidth: 1280, outerHeight: 900, screen: {}, addEventListener() {}, removeEventListener() {} };
  const workspace = loadTsx("src/lib/oakWorkspace.ts");
  let sent = 0;
  globalThis.fetch = async url => { if (url === "/api/oak/chat") sent++; return new Response("{}", { status: 503 }); };
  const turn = crypto.randomUUID(), base = { cards: [], usage: null, state: "complete", page: "/", research: null, answer: null, taskKind: "question" };
  workspace.setOakWorkspaceFixture({ presentation: "human-agent", viewportSupported: true, conversationId: crypto.randomUUID(), pending: false, error: null, quotes: [], draft: "",
    messages: [{ ...base, id: `${turn}:user`, role: "user", text: "What did he build?" }, { ...base, id: turn, role: "assistant", text: "An answer." }] });
  const quote = "Steve built the scanner. ".repeat(11).trim().slice(0, 270);
  workspace.addOakQuote(quote, turn);
  workspace.setOakDraft("x".repeat(workspace.OAK_DRAFT_LIMIT - 30));
  await workspace.submitOakTurn();
  const state = workspace.getOakWorkspace();
  assert.equal(sent, 0, "nothing is sent");
  assert.equal(state.quotes[0]?.text, quote, "the chip keeps its full text");
  assert.match(state.error ?? "", /Shorten it or remove a quote/);
});
