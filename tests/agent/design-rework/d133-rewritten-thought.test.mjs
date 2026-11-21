import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

// D133: Codex review on PR #119. A thought rewritten (not extended) must start typing again in the same render, so the
// trail never reports it done and folds before the rewrite is on screen.
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const store = (page, fn, arg) => page.evaluate(async ([source, value]) => {
  const url = performance.getEntriesByType("resource").map(entry => entry.name).find(name => /\/src\/lib\/oakWorkspace\.ts(\?|$)/.test(name));
  const workspace = await import(url);
  return new Function("workspace", "value", `return (${source})(workspace, value);`)(workspace, value);
}, [fn.toString(), arg]);
const setThought = (page, value) => store(page, (workspace, next) => {
  const messages = workspace.getOakWorkspace().messages, last = messages.at(-1);
  workspace.setOakWorkspaceFixture({ progress: "Thinking", messages: [...messages.slice(0, -1), { ...last, steps: [...last.steps.filter(step => step.id !== next.id),
    { id: next.id, operation: "think", state: "running", startedAt: next.startedAt, thought: { ...next.thought, text: next.text } }] }] });
}, value);

test("D133-G1 a rewritten thought types again from its first character and never reads as finished first", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${galleryUrl}/__dev/oak-states?state=reasoning-thoughts`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
    await page.waitForFunction(() => !document.querySelector(".ui-stream-text[data-streaming]"), null, { timeout: 8000 });
    const typed = await store(page, workspace => {
      const step = workspace.getOakWorkspace().messages.at(-1).steps.findLast(item => item.operation === "think" && item.thought?.text);
      return step ? { id: step.id, thought: step.thought } : null;
    });
    assert.ok(typed && typed.thought.text.length > 40, "the gallery turn has a long typed thought");
    // A fresh thought starts typing; about a second in, well past the rewrite's length, a later delta rewrites it.
    const fresh = { id: "d133-thought", startedAt: Date.now(), thought: { ...typed.thought, title: "Weighing the sources" }, text: typed.thought.text };
    await setThought(page, fresh);
    await page.waitForFunction(() => [...document.querySelectorAll(".ui-chain-of-thought .ui-stream-text[data-streaming]")].length > 0, null, { timeout: 3000 });
    await page.waitForTimeout(1000);
    // Watch every DOM change of the live thought from the moment the rewrite lands.
    await page.evaluate(() => {
      window.__frames = [];
      const root = document.querySelector(".ui-chain-of-thought");
      new MutationObserver(() => {
        const live = [...root.querySelectorAll(".ui-stream-text")].at(-1);
        if (live) window.__frames.push({ streaming: live.hasAttribute("data-streaming"), text: live.textContent });
      }).observe(root, { subtree: true, childList: true, characterData: true, attributes: true });
    });
    const rewrite = `Rewritten: ${typed.thought.text.slice(0, 20)}`;
    assert.ok(rewrite.length < typed.thought.text.length && !typed.thought.text.startsWith(rewrite.slice(0, 5)));
    await setThought(page, { ...fresh, text: rewrite });
    await page.waitForTimeout(600);
    const frames = await page.evaluate(() => window.__frames);
    const first = frames.find(frame => frame.text.includes("Rewritten"));
    assert.ok(first, "the rewrite reached the screen");
    assert.equal(first.streaming, true, "its first frame is still typing, never the whole rewrite at once");
  } finally {
    await browser.close();
  }
});
