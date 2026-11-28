import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

// D142: Codex review on PR #119 (f2200078). Retry on a failed turn that quoted a private document answer resent the
// visitor's current draft instead of the failed question, dropping the quote and its private provenance.
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");

test("D142-G1 Retry on a failed private quoted turn resends that question, quote and privacy included", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const sent = [];
    await page.route("**/api/oak/chat**", route => { sent.push(route.request().postDataJSON()?.task?.text ?? null); return route.abort(); });
    await page.goto(`${galleryUrl}/__dev/oak-states?state=answer-points`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
    const result = await page.evaluate(async () => {
      const find = name => performance.getEntriesByType("resource").map(entry => entry.name).find(url => new RegExp(`/${name}\\.ts(\\?|$)`).test(url));
      const workspace = await import(find("src/lib/oakWorkspace"));
      const turn = crypto.randomUUID(), quote = "Led design for an AI meeting-notes app";
      const base = { cards: [], usage: null, state: "complete", page: "/", research: null, privateDocumentTurn: true };
      workspace.setOakWorkspaceFixture({ conversationId: crypto.randomUUID(), quotes: [], draft: "", pending: false, error: null, messages: [
        { ...base, id: `${turn}:user`, role: "user", text: "What does my resume say?", answer: null, taskKind: "question" },
        { ...base, id: turn, role: "assistant", text: "An answer.", answer: null }] });
      workspace.addOakQuote(quote, turn);
      workspace.setOakDraft("Can you say more about that?");
      await workspace.submitOakTurn();
      const failed = workspace.getOakWorkspace().messages.at(-1);
      // The visitor moves on in the box before pressing Retry.
      for (const staged of workspace.getOakWorkspace().quotes) workspace.removeOakQuote(staged.id);
      workspace.setOakDraft("A different question");
      workspace.retryOakTurn(failed.id);
      await new Promise(resolve => setTimeout(resolve, 1500));
      const state = workspace.getOakWorkspace();
      return { failedState: failed.state, asked: state.messages.at(-2)?.quoted?.quotes ?? null, words: state.messages.at(-2)?.quoted?.text ?? null,
        private: state.messages.at(-2)?.privateDocumentTurn ?? null, draft: state.draft, quote };
    });
    assert.equal(result.failedState, "failed");
    assert.deepEqual(result.asked, [result.quote], "Retry resends the quote the failed question carried");
    assert.equal(result.words, "Can you say more about that?", "Retry resends the failed question's own words");
    assert.equal(result.private, true, "the resent question stays private");
    assert.equal(result.draft, "A different question", "the visitor's newer draft comes back to the box");
    assert.equal(sent.length, 2);
    assert.equal(sent[1], sent[0], "both requests carried the same folded question");
  } finally {
    await browser.close();
  }
});
