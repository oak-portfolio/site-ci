import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { loadTsx } from "./load-tsx.mjs";

// D140: Codex review on PR #119 (dbaa6341), two P2s.
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const store = (page, fn, arg) => page.evaluate(async ([source, value]) => {
  const url = performance.getEntriesByType("resource").map(entry => entry.name).find(name => /\/src\/lib\/oakWorkspace\.ts(\?|$)/.test(name));
  const workspace = await import(url);
  return new Function("workspace", "value", `return (${source})(workspace, value);`)(workspace, value);
}, [fn.toString(), arg]);
const withGallery = async body => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${galleryUrl}/__dev/oak-states?state=answer-points`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
    await page.waitForTimeout(300);
    await body(page);
  } finally { await browser.close(); }
};

test("D140-G1 staged quotes are part of the question that decides research, and nothing waits for approval", () => withGallery(async page => {
  // v3 review (intentional update): research runs on its own, so the quotes only decide which public topic it checks.
  const steps = await store(page, workspace => {
    workspace.setOakDraft("Tell me the latest guidance on this");
    const before = workspace.getOakResearchNeed()?.topicId ?? null;
    workspace.addOakQuote("AI SDK streaming messages and cancellation");
    const need = workspace.getOakResearchNeed();
    const [first] = workspace.getOakWorkspace().quotes;
    workspace.removeOakQuote(first.id);
    return { before, topic: need?.topicId ?? null, asks: need?.requiresConsent ?? null, afterRemove: workspace.getOakResearchNeed()?.topicId ?? null,
      consentState: "researchConsent" in workspace.getOakWorkspace() };
  });
  assert.equal(steps.before, null, "the bare draft is not a research question");
  assert.equal(steps.topic, "ai-sdk-streaming", "the quote makes it a research question");
  assert.equal(steps.asks, false, "nothing waits for approval");
  assert.equal(steps.afterRemove, null, "removing the quote takes the topic away");
  assert.equal(steps.consentState, false, "the workspace keeps no consent state");
}));

test("D140-G2 a question the visitor typed to look like a quote stays a plain question", () => withGallery(async page => {
  const typed = "About \u201cOakminder\u201d\n\nWhat changed?";
  await store(page, (workspace, text) => {
    const messages = workspace.getOakWorkspace().messages;
    workspace.setOakWorkspaceFixture({ messages: messages.map(message => message.role === "user" ? { ...message, text, quoted: undefined } : message) });
  }, typed);
  const bubble = page.locator(".ui-message[data-align='end']").first();
  await page.waitForTimeout(300);
  assert.equal(await bubble.locator(".oak-quote-chip").count(), 0, "no quote chip is made up");
  assert.equal((await bubble.locator(".ui-bubble__content").innerText()).trim(), typed, "the bubble shows what was typed");
  const { oakVisitorWords } = loadTsx("src/lib/oakNextStep.ts");
  assert.equal(oakVisitorWords({ text: typed }), typed, "next steps read every typed word");
  assert.equal(loadTsx("src/lib/oakQuote.ts").unfoldOakQuotes, undefined, "nothing infers quotes from visible text");
}));
