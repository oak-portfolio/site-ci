import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

// D145: Codex review on PR #119 (d09cd100). A private quote still offered public research, which the Worker then skipped.
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");

test("D145-G1 a staged private quote never offers public research; the same quote from a public answer still can", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${galleryUrl}/__dev/oak-states?state=answer-points`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
    const result = await page.evaluate(async () => {
      const find = name => performance.getEntriesByType("resource").map(entry => entry.name).find(url => new RegExp(`/${name}\\.ts(\\?|$)`).test(url));
      const workspace = await import(find("src/lib/oakWorkspace"));
      const need = privateSource => {
        const turn = crypto.randomUUID(), base = { cards: [], usage: null, state: "complete", page: "/", research: null, answer: null, taskKind: "question" };
        workspace.setOakWorkspaceFixture({ conversationId: crypto.randomUUID(), quotes: [], draft: "", roleDraft: null, questionDraft: null, pending: false, error: null, messages: [
          { ...base, id: `${turn}:user`, role: "user", text: "What does my notes file say?", ...(privateSource ? { privateDocumentTurn: true } : {}) },
          { ...base, id: turn, role: "assistant", text: "An answer.", ...(privateSource ? { privateDocumentTurn: true } : {}) }] });
        workspace.addOakQuote("Typed stream parts for the agent", turn);
        workspace.setOakDraft("What is the latest AI SDK streaming guidance?");
        return workspace.getOakResearchNeed()?.topicId ?? null;
      };
      return { fromPrivate: need(true), fromPublic: need(false) };
    });
    assert.equal(result.fromPrivate, null, "no research offer while a private quote is staged");
    assert.equal(result.fromPublic, "ai-sdk-streaming", "the same question with a public quote still offers research");
  } finally {
    await browser.close();
  }
});
