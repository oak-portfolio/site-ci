import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const store = (page, fn, arg) => page.evaluate(async ([source, value]) => {
  const url = performance.getEntriesByType("resource").map(entry => entry.name).find(name => /\/src\/lib\/oakWorkspace\.ts(\?|$)/.test(name));
  const workspace = await import(url);
  return new Function("workspace", "value", `return (${source})(workspace, value);`)(workspace, value);
}, [fn.toString(), arg]);
const answer = { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "f", hardPolicyVersion: "f", knowledgeRevision: "f", operations: ["search"], kind: "sourced", acknowledgment: null,
  claims: [{ id: "own", text: "Steve owned the scanner and the mobile shell around the classifier.",
    citations: [{ documentId: "work:ecosmartloop", passageId: "work:ecosmartloop:p", sectionId: "ownership", url: "https://steveoak.com/work/ecosmartloop/#ownership" }] }] };

test("D112-G2 after an automatic re-ask, a new thought with the same block number and text holds the trail until it has typed out", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${galleryUrl}/__dev/oak-states?state=reasoning-thoughts`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
    await page.waitForFunction(() => !document.querySelector(".ui-stream-text[data-streaming]"), null, { timeout: 8000 });
    // The stalled call's rows give way to "asked again" (restartOakToolSteps keeps only a retry row).
    const thought = await store(page, workspace => {
      const messages = workspace.getOakWorkspace().messages, last = messages.at(-1), now = Date.now();
      const typed = last.steps.findLast(step => step.operation === "think" && step.thought?.text);
      workspace.setOakWorkspaceFixture({ progress: "Asking again", messages: [...messages.slice(0, -1),
        { ...last, steps: [{ id: "retry", operation: "retry", state: "done", startedAt: now - 9000, endedAt: now }] }] });
      return typed ? { id: typed.id, thought: typed.thought } : null;
    });
    assert.ok(thought, "the gallery turn had a typed thought");
    await page.waitForTimeout(300);
    // The replacement call numbers its thoughts from zero again: the same id, and here the same words.
    await store(page, (workspace, value) => {
      const messages = workspace.getOakWorkspace().messages, last = messages.at(-1);
      workspace.setOakWorkspaceFixture({ messages: [...messages.slice(0, -1), { ...last, steps: [...last.steps,
        { id: value.id, operation: "think", state: "running", startedAt: Date.now(), thought: value.thought }] }] });
    }, thought);
    await page.waitForFunction(() => document.querySelector(".ui-chain-of-thought .ui-stream-text[data-streaming]"), null, { timeout: 2000 });
    await store(page, (workspace, value) => {
      const messages = workspace.getOakWorkspace().messages, last = messages.at(-1), now = Date.now();
      const steps = last.steps.map(step => step.state === "running" ? { ...step, state: "done", endedAt: now } : step);
      workspace.setOakWorkspaceFixture({ pending: false, progress: "", activity: null,
        messages: [...messages.slice(0, -1), { ...last, state: "complete", answer: value, text: value.claims[0].text, cards: [], usage: null, steps }] });
    }, answer);
    const frames = [];
    const started = Date.now();
    while (Date.now() - started < 5000) {
      frames.push(await page.evaluate(() => {
        const root = document.querySelector(".ui-chain-of-thought");
        return { folding: root?.hasAttribute("data-folding") ?? false, open: !!root?.querySelector("[data-slot='chain-of-thought-content']"),
          streaming: !!document.querySelector(".ui-chain-of-thought .ui-stream-text[data-streaming]") };
      }));
      await page.waitForTimeout(30);
    }
    assert.ok(frames.some(frame => frame.streaming), "the re-asked thought types in after the answer lands");
    assert.ok(!frames.some(frame => frame.folding && frame.streaming), "the trail never starts folding while the re-asked thought is typing");
    assert.equal(frames.at(-1).open, false, "and it folds once the thought has typed out");
  } finally {
    await browser.close();
  }
});
