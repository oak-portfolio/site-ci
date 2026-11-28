import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

// D144: Codex review on PR #119 (cb7b2ee8). Retry on a reopened private document question with its sections restored
// sent whatever sat in the box; a reopened role comparison offered Retry with nothing to resend.
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");

test("D144-G1 Retry on a reopened private document question resends that question, and a reopened comparison offers no Retry", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const sent = [];
    // Only chat posts carry a turn; funnel and other side calls (P07-G2) are not part of this assertion.
    await page.route("**/api/oak/**", route => { const text = route.request().postDataJSON()?.turn?.task?.text; if (text !== undefined) sent.push(text); return route.abort(); });
    await page.goto(`${galleryUrl}/__dev/oak-states?state=answer-points`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
    const result = await page.evaluate(async () => {
      const find = name => performance.getEntriesByType("resource").map(entry => entry.name).find(url => new RegExp(`/${name}\\.ts(\\?|$)`).test(url));
      const workspace = await import(find("src/lib/oakWorkspace")), documents = await import(find("src/lib/oakDocumentsWorkspace"));
      const controller = documents.getOakDocumentsController(), snapshot = controller.snapshot;
      // The saved chat restored its document sections.
      controller.snapshot = () => ({ ...snapshot(), usedSelections: [{ documentId: "d", sectionId: "s", start: 0, end: 10 }] });
      const turn = crypto.randomUUID(), base = { cards: [], usage: null, page: "/", research: null, answer: null };
      workspace.setOakWorkspaceFixture({ conversationId: crypto.randomUUID(), quotes: [], draft: "Something unrelated", roleDraft: null, pending: false, error: null, messages: [
        { ...base, id: `${turn}:user`, role: "user", state: "complete", taskKind: "question", privateDocumentTurn: true, text: "What does my resume leave out?" },
        { ...base, id: turn, role: "assistant", state: "interrupted", taskKind: "question", text: "" }] });
      workspace.retryOakTurn(turn);
      await new Promise(resolve => setTimeout(resolve, 1500));
      controller.snapshot = snapshot;
      const asked = workspace.getOakWorkspace().messages.at(-2)?.text ?? null, draft = workspace.getOakWorkspace().draft;
      const role = crypto.randomUUID();
      workspace.setOakWorkspaceFixture({ pending: false, roleDraft: null, messages: [
        { ...base, id: `${role}:user`, role: "user", state: "complete", taskKind: "role-fit", privateDocumentTurn: true, text: "Compare this role" },
        { ...base, id: role, role: "assistant", state: "interrupted", taskKind: "role-fit", text: "" }] });
      return { asked, draft, roleRetry: workspace.oakRetryKind(workspace.getOakWorkspace(), role) };
    });
    assert.equal(result.asked, "What does my resume leave out?", "Retry resends the question above the card");
    assert.equal(result.draft, "Something unrelated", "the unrelated draft stays in the box");
    assert.deepEqual(sent.slice(0, 1), ["What does my resume leave out?"]);
    assert.equal(result.roleRetry, null, "a reopened comparison with nothing staged offers no Retry");
  } finally {
    await browser.close();
  }
});
