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
const answer = { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "f", hardPolicyVersion: "f", knowledgeRevision: "f", operations: ["search", "read"], kind: "sourced", acknowledgment: null,
  claims: [{ id: "own", text: "Steve owned the scanner, the API integration, rewards and the mobile shell around the classifier.",
    citations: [{ documentId: "work:ecosmartloop", passageId: "work:ecosmartloop:p", sectionId: "ownership", url: "https://steveoak.com/work/ecosmartloop/#ownership" }] }] };

test("D108-G1 Retry on a failed turn resends the question shown above it, and a draft the visitor typed since stays in the box", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const sent = [];
    await page.route("**/api/oak/chat**", async route => {
      sent.push(JSON.parse(route.request().postData() ?? "{}"));
      await route.abort();
    });
    await page.goto(`${galleryUrl}/__dev/oak-states?state=failed`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
    const question = "How does Steve approach AI systems?";
    const box = page.locator("textarea.ui-textarea").first();
    assert.equal(await box.inputValue(), question, "the failed question is back in the box, as the card says");
    await box.fill("A different draft I was typing");
    await page.locator(".oak-turn__stopped").getByRole("button", { name: "Retry" }).click();
    await page.waitForTimeout(800);
    assert.ok(sent.length >= 1, "Retry sends a turn");
    const task = sent[0].turn?.task ?? sent[0].task;
    assert.equal(task?.text, question, "the resent turn is the failed question, not the draft");
    assert.equal(await box.inputValue(), "A different draft I was typing", "the visitor's draft is back in the box");
  } finally {
    await browser.close();
  }
});

test("D108-G2 a thought that grows after it finished typing holds the trail open until the new words have typed out", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${galleryUrl}/__dev/oak-states?state=reasoning-thoughts`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
    await page.waitForFunction(() => !document.querySelector(".ui-stream-text[data-streaming]"), null, { timeout: 8000 });
    // The running thought gets a later snapshot (the model kept writing the same block), then the answer lands at once.
    const grew = await store(page, workspace => {
      const messages = workspace.getOakWorkspace().messages, last = messages.at(-1);
      const index = last.steps.findLastIndex(step => step.operation === "think" && step.thought?.text);
      if (index < 0) return false;
      const step = last.steps[index];
      const steps = last.steps.map((value, at) => at === index ? { ...step, thought: { ...step.thought,
        text: `${step.thought.text} Then I will separate what the case study credits to Steve from what it credits to the wider team, so the answer only claims his part and names the people he worked with.` } } : value);
      workspace.setOakWorkspaceFixture({ messages: [...messages.slice(0, -1), { ...last, steps }] });
      return true;
    });
    assert.ok(grew, "the gallery turn has a typed thought to grow");
    await page.waitForFunction(() => document.querySelector(".ui-stream-text[data-streaming]"), null, { timeout: 2000 });
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
    assert.ok(frames.some(frame => frame.streaming), "the new words type in after the answer lands");
    assert.ok(!frames.some(frame => frame.folding && frame.streaming), "the trail never starts folding while a thought is still typing");
    assert.equal(frames.at(-1).open, false, "and it folds once the thought has typed out");
  } finally {
    await browser.close();
  }
});
