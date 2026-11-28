import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

// D158: Codex review on PR #119 (9625262d). The Worker sends the answer before research and finish, so a live turn could
// show its answer under a still-typing trail, then hide it while the trail folded.
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");

test("D158-G1 an answer that lands while the turn is still pending waits under the live trail", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${galleryUrl}/__dev/oak-states?state=answer-points`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
    const result = await page.evaluate(async () => {
      const find = name => performance.getEntriesByType("resource").map(entry => entry.name).find(url => new RegExp(`/${name}\\.ts(\\?|$)`).test(url));
      const workspace = await import(find("src/lib/oakWorkspace"));
      const answer = { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "fixture", hardPolicyVersion: "fixture", knowledgeRevision: "fixture",
        operations: ["search"], kind: "sourced", acknowledgment: null,
        claims: [{ id: "c1", text: "Steve owned the scanner.", citations: [{ documentId: "work:ecosmartloop", passageId: "p1", sectionId: "s", url: "https://steveoak.com/work/ecosmartloop/#s" }] }] };
      const turn = crypto.randomUUID(), base = { cards: [], usage: null, page: "/", research: null, taskKind: "question" };
      workspace.setOakWorkspaceFixture({ conversationId: crypto.randomUUID(), pending: true, progress: "Checking", error: null, quotes: [], draft: "", messages: [
        { ...base, id: `${turn}:user`, role: "user", state: "complete", text: "What did Steve own?", answer: null },
        { ...base, id: turn, role: "assistant", state: "pending", text: "", answer, steps: [{ id: "search", operation: "search", state: "complete" }] }] });
      await new Promise(resolve => setTimeout(resolve, 800));
      const turns = document.querySelectorAll(".oak-turn, [data-state]");
      const last = [...document.querySelectorAll('[data-state="pending"]')].at(-1);
      return { held: last?.hasAttribute("data-held") ?? null, shown: last?.querySelectorAll(".oak-turn__answer").length ?? null, turns: turns.length };
    });
    assert.equal(result.held, true, "the live turn holds its answer");
    assert.equal(result.shown, 0, "no answer shows under the live trail");
  } finally {
    await browser.close();
  }
});
