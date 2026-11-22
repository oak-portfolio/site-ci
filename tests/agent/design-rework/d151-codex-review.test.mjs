import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

// D151: Codex review on PR #119 (e6468646). An account switch cleared the transcript but kept staged quotes, so a
// private quote lost the source that marks it private and could go out as an ordinary turn.
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");

test("D151-G1 a staged quote leaves with its source answer, so a private quote never outlives its transcript", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${galleryUrl}/__dev/oak-states?state=answer-points`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
    const result = await page.evaluate(async () => {
      const find = name => performance.getEntriesByType("resource").map(entry => entry.name).find(url => new RegExp(`/${name}\\.ts(\\?|$)`).test(url));
      const workspace = await import(find("src/lib/oakWorkspace"));
      const quotes = [{ id: "a", text: "private", source: "turn-1" }, { id: "b", text: "public", source: "turn-2" }, { id: "c", text: "typed" }];
      const kept = workspace.oakQuotesWithSources([{ id: "turn-2" }], quotes).map(quote => quote.id);
      // The real path: a cleared transcript (as an account switch does) drops the quote staged from it.
      const turn = crypto.randomUUID(), base = { cards: [], usage: null, state: "complete", page: "/", research: null, answer: null, taskKind: "question", privateDocumentTurn: true };
      workspace.setOakWorkspaceFixture({ conversationId: crypto.randomUUID(), quotes: [], draft: "", pending: false, error: null, messages: [
        { ...base, id: `${turn}:user`, role: "user", text: "What does my resume say?" }, { ...base, id: turn, role: "assistant", text: "An answer." }] });
      workspace.addOakQuote("Led design for an AI meeting-notes app", turn);
      const staged = workspace.getOakWorkspace().quotes.length;
      workspace.startNewOakConversation();
      return { kept, staged, after: workspace.getOakWorkspace().quotes.length };
    });
    assert.deepEqual(result.kept, ["b", "c"], "a quote whose answer is gone leaves; others stay");
    assert.equal(result.staged, 1);
    assert.equal(result.after, 0, "clearing the transcript clears its quotes");
  } finally {
    await browser.close();
  }
});
