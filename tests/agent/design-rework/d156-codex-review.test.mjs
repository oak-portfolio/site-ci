import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

// D156: Codex review on PR #119 (ebefb036). A stopped card said the question was back in the message box even when a
// draft typed while the answer ran stayed there instead. (The Worker half, declared quote lines, is D155-G1's test.)
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");

test("D156-G1 a stopped card says what is really in the message box", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${galleryUrl}/__dev/oak-states?state=answer-points`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
    const detail = async draft => page.evaluate(async draft => {
      const find = name => performance.getEntriesByType("resource").map(entry => entry.name).find(url => new RegExp(`/${name}\\.ts(\\?|$)`).test(url));
      const workspace = await import(find("src/lib/oakWorkspace"));
      const turn = crypto.randomUUID(), base = { cards: [], usage: null, page: "/", research: null, answer: null, taskKind: "question", text: "" };
      workspace.setOakWorkspaceFixture({ conversationId: crypto.randomUUID(), pending: false, error: null, quotes: [], draft, messages: [
        { ...base, id: `${turn}:user`, role: "user", state: "complete", text: "What did Steve own?" },
        { ...base, id: turn, role: "assistant", state: "failed" }] });
      await new Promise(resolve => setTimeout(resolve, 600));
      return document.querySelector(".oak-turn__stopped-detail")?.textContent ?? null;
    }, draft);
    assert.equal(await detail("What did Steve own?"), "Your question is back in the message box.");
    assert.equal(await detail("A newer question"), "Retry sends this question again. What you were typing stays in the message box.");
  } finally {
    await browser.close();
  }
});
