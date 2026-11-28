import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import { loadTsx } from "./load-tsx.mjs";

globalThis.window ??= { innerWidth: 1280, innerHeight: 800, outerWidth: 1280, outerHeight: 900, screen: {}, addEventListener() {}, removeEventListener() {} };
const steps = loadTsx("src/lib/oakToolSteps.ts");
const workspace = loadTsx("src/lib/oakWorkspace.ts");
const { OakChainOfThought } = loadTsx("src/components/agent/OakChainOfThought.tsx");
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const kinds = rows => rows.map(row => `${row.operation}:${row.state}`);

test("D35-G1 every Worker phase becomes a timed first-person step, and only a validated answer adds wrote and checked", () => {
  let rows = [{ id: "research", operation: "research", state: "pending" }];
  rows = steps.advanceOakToolSteps(rows, { kind: "model", phase: "started" }, 1000);
  assert.deepEqual(kinds(rows), ["understand:running", "research:pending"], "reading the question leads, ahead of queued research");
  rows = steps.advanceOakToolSteps(rows, { kind: "model", phase: "step", step: 1 }, 1200);
  rows = steps.advanceOakToolSteps(rows, { kind: "model", phase: "step", step: 2 }, 1300);
  assert.deepEqual(kinds(rows), ["understand:running", "research:pending"], "a model step with nothing found yet weighs nothing");
  rows = steps.advanceOakToolSteps(rows, { kind: "tool", operation: "search", phase: "started" }, 1800);
  assert.deepEqual(kinds(rows), ["understand:done", "research:pending", "search:running"], "a tool call ends the thinking before it");
  rows = steps.advanceOakToolSteps(rows, { kind: "tool", operation: "search", phase: "completed" }, 3300);
  rows = steps.advanceOakToolSteps(rows, { kind: "model", phase: "step", step: 2 }, 3400);
  assert.deepEqual(kinds(rows).slice(-1), ["weigh:running"], "the model step after a tool weighs what it found");
  rows = steps.advanceOakToolSteps(rows, { kind: "model", phase: "step", step: 3 }, 3500);
  assert.equal(rows.filter(row => row.operation === "weigh").length, 1, "one weighing step while it runs");
  const done = steps.settleOakToolSteps(rows, "complete", 7000);
  assert.deepEqual(kinds(done), ["understand:done", "search:done", "weigh:done", "compose:done", "verify:done"], "research that never started drops out");
  assert.equal(steps.formatOakStepDuration(done[0]), "0.8s");
  assert.equal(steps.formatOakStepDuration(done[1]), "1.5s");
  assert.equal(steps.formatOakStepDuration(done[3]), null, "the final two steps claim no time of their own");
  assert.equal(steps.oakThinkingSeconds(done), 6);
  assert.equal(steps.oakThinkingSeconds(rows, 5600), 5, "the live clock counts from the first step");
  const stopped = steps.settleOakToolSteps(rows, "failed", 7000);
  assert.deepEqual(kinds(stopped).slice(-1), ["weigh:error"]);
  assert.ok(!stopped.some(row => row.operation === "compose" || row.operation === "verify"), "a stopped turn claims neither");
  assert.deepEqual(kinds(steps.settleOakToolSteps([{ id: "search-0", operation: "search", state: "done" }], "complete")), ["search:done"],
    "a turn without visible thinking keeps only its tool rows");

  const cite = slug => ({ documentId: `work:${slug}`, passageId: "p", sectionId: "s", url: `https://steveoak.com/work/${slug}/` });
  const answer = { kind: "sourced", knowledgeRevision: "r", claims: [{ id: "a", text: "x", citations: [cite("a")] }, { id: "b", text: "y", citations: [cite("b")] }] };
  const turn = { question: "What did Steve own?", citations: 2, cards: [], research: null, answer };
  const text = (operation, state) => steps.describeOakToolStep({ id: operation, operation, state }, turn);
  assert.deepEqual([text("understand", "running").title, text("understand", "done").title], ["Reading your question", "Read your question"]);
  assert.equal(text("understand", "running").detail, "What did Steve own?");
  assert.deepEqual([text("weigh", "running").title, text("weigh", "done").title], ["Weighing what I found", "Weighed what I found"]);
  assert.equal(text("compose", "done").detail, "2 points, each with its source");
  assert.equal(text("verify", "done").title, "Checked every point against its source");
  assert.equal(text("verify", "done").detail, "2 sources linked to the points they support");
  const document = steps.describeOakToolStep({ id: "verify", operation: "verify", state: "done" }, { ...turn, citations: 0, answer: { kind: "document", claims: [] } });
  assert.deepEqual([document.title, document.detail], ["Checked every quote against your document", "Each quote matches the text you selected"]);
  for (const operation of ["understand", "search", "read", "navigate", "draft", "research", "weigh", "compose", "verify"])
    assert.doesNotMatch(`${text(operation, "running").title} ${text(operation, "done").title}`, /Oak AI|Steve Oak|the agent|assistant/i, `${operation} speaks to the visitor directly`);
});

test("D35-G1 the transport turns the Worker's stream and model-step phases into reasoning steps on the live turn", async () => {
  const hold = {};
  globalThis.fetch = async (_url, init) => {
    const id = JSON.parse(init.body).turn.requestId;
    const encode = part => new TextEncoder().encode(`data: ${JSON.stringify(part)}\n\n`);
    return new Response(new ReadableStream({ start(controller) {
      controller.enqueue(encode({ type: "start", messageId: id }));
      for (const data of [{ phase: "started" }, { phase: "model-start", step: 1 }, { phase: "tool-start", step: 1, operation: "search" },
        { phase: "tool-end", step: 1, operation: "search" }, { phase: "model-start", step: 2 }])
        controller.enqueue(encode({ type: "data-status", data: { requestId: id, ...data }, transient: true }));
      hold.fail = () => controller.error(new Error("network"));
    } }), { headers: { "X-Oak-Request-Id": id, "x-vercel-ai-ui-message-stream": "v1" } });
  };
  workspace.setOakWorkspaceFixture({ presentation: "human-agent", viewportSupported: true, messages: [], pending: false, draft: "What did Steve build?" });
  const run = workspace.submitOakTurn();
  for (let i = 0; i < 80 && workspace.getOakWorkspace().messages.at(-1)?.steps?.length !== 3; i++) await new Promise(resolve => setTimeout(resolve, 10));
  const live = workspace.getOakWorkspace();
  assert.deepEqual(kinds(live.messages.at(-1).steps), ["understand:done", "search:done", "weigh:running"]);
  assert.equal(live.progress, "Weighing what I found");
  assert.ok(live.messages.at(-1).steps.every(row => typeof row.startedAt === "number"), "every step carries its client start time");
  hold.fail();
  await run;
  assert.deepEqual(kinds(workspace.getOakWorkspace().messages.at(-1).steps), ["understand:done", "search:done", "weigh:error"]);
});

test("D35-G1 the reasoning header reads live, folds to its summary, and names a stopped step", () => {
  const message = value => ({ id: "a1", role: "assistant", text: "", answer: null, cards: [], usage: null, state: "pending", page: "/", ...value });
  const render = value => renderToStaticMarkup(createElement(OakChainOfThought, { question: "q", progress: "Weighing what I found", message: message(value) }));
  const live = render({ steps: [{ id: "understand", operation: "understand", state: "done", startedAt: 0, endedAt: 900 }, { id: "weigh-1", operation: "weigh", state: "running", startedAt: 900 }] });
  assert.match(live, /aria-expanded="true"/, "steps are open while Oak thinks");
  // Q03-G4 (intentional update): the step name is a visible label; the transcript's one live region announces it.
  assert.match(live, /class="oak-turn__shimmer oak-cot__label"[^>]*>Weighing what I found</);
  assert.doesNotMatch(live, /role="status"/);
  assert.match(live, /oak-cot__duration">0\.9s</);
  // M4 L2: Steve's own search counts passages, one or many, so it never reads as a second "Sources found" number.
  const tallied = render({ steps: [{ id: "search-0", operation: "search", state: "done", startedAt: 0, endedAt: 900, count: 1 },
    { id: "search-1", operation: "search", state: "done", startedAt: 900, endedAt: 1500, count: 5 }, { id: "weigh-2", operation: "weigh", state: "running", startedAt: 1500 }] });
  assert.deepEqual([...tallied.matchAll(/class="oak-cot__tally">([^<]*)</g)].map(match => match[1]), ["1 passage", "5 passages"]);
  assert.doesNotMatch(tallied, /\d found/);
  const settled = render({ state: "complete", steps: [{ id: "understand", operation: "understand", state: "done", startedAt: 0, endedAt: 900 },
    { id: "weigh-1", operation: "weigh", state: "done", startedAt: 900, endedAt: 6200 }] });
  assert.match(settled, /aria-expanded="false"/);
  // D70: the folded title is its own label, which rises in when it replaces the live step name.
  assert.match(settled, /<span class="oak-cot__title"><span class="oak-cot__label"[^>]*>Thought for 6s<\/span>/);
  const stopped = render({ state: "interrupted", steps: [{ id: "search-0", operation: "search", state: "error" }] });
  assert.match(stopped, /1 of 1 step stopped/);
  assert.equal(render({ state: "complete", steps: [] }), "", "a finished turn without steps shows no reasoning");
});

const withPage = async (run, options = {}) => {
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, ...options })).newPage();
    await run(page);
  } finally {
    await browser.close();
  }
};
const open = async (page, state) => {
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
};

test("D35-G2 in the gallery, live reasoning shows its clock and the current step's art, and a settled answer folds to Thought for Ns with its sources", () => withPage(async page => {
  await open(page, "reasoning-weighing");
  const chain = page.locator('.ui-chain-of-thought[data-state="live"]');
  await page.waitForFunction(() => ![...document.querySelectorAll(".oak-cot__clock .ui-rolling-number__slot")].some(slot => slot.querySelectorAll(".ui-rolling-number__digit").length > 1), null, { timeout: 3000 }); // Review v6 (intentional update): "at rest" waits out a tick that lands on ready.
  assert.match(await chain.locator(".oak-cot__clock").innerText(), /^\d+s$/);
  assert.equal(await chain.locator('.oak-cot__glyph [data-pose="weighing"]').count(), 1, "the header shows the weighing art");
  assert.deepEqual(await chain.locator(".oak-cot__step").evaluateAll(rows => rows.map(row => `${row.dataset.kind}:${row.dataset.state}`)),
    ["understand:done", "search:done", "read:done", "read:done", "weigh:running"]);
  assert.equal(await chain.locator(".oak-cot__step .oak-cot__duration:not([data-live])").count(), 4, "each finished step shows its time");
  assert.equal(await chain.locator('.oak-cot__step[data-state="running"] .oak-cot__duration[data-live]').count(), 1, "and the running one keeps its own clock (D115)");
  // D52: the live header turns the launcher ring.
  assert.equal(await chain.locator(".ui-chain-of-thought__header").evaluate(node => getComputedStyle(node).animationName), "oak-launcher-turn");
  await open(page, "reasoning-understanding");
  assert.equal(await page.locator('.oak-cot__glyph [data-pose="understanding"]').count(), 1);

  await open(page, "answer-sourced");
  const settled = page.locator(".ui-chain-of-thought");
  assert.match(await settled.locator(".oak-cot__title").innerText(), /^Thought for \d+s$/);
  // Q10 (intentional update): folded, the header shows the still done pose, never the checking loop.
  assert.equal(await settled.locator('.oak-cot__glyph [data-pose="tool-done"]').count(), 1, "folded, the header shows the done art");
  await settled.locator(".ui-chain-of-thought__header").click();
  await settled.locator('.oak-cot__step[data-kind="verify"]').waitFor();
  assert.ok(await settled.locator(".oak-cot__body .oak-message__source").count() > 0, "the search step names the sources it found");
  const spill = await settled.locator(".oak-cot__body .oak-message__source").evaluateAll(chips => chips.filter(chip =>
    chip.getBoundingClientRect().right > chip.closest(".oak-cot__body").getBoundingClientRect().right + 0.5).length);
  assert.equal(spill, 0, "a long source title truncates inside its step");
  await open(page, "answer-gap");
  // Q10 (intentional update): every finished answer folds to the same done moment.
  assert.equal(await page.locator('.oak-cot__glyph [data-pose="tool-done"]').count(), 1, "a gap answer folds to the done art");
  await open(page, "reasoning-composing");
  // Q10 (intentional update): the writing loop shows only while Oak writes (reasoning-writing); a finished one shows done.
  assert.equal(await page.locator('.oak-cot__glyph [data-pose="tool-done"]').count(), 1, "an answer with nothing to cite folds to the done art");
  assert.match(await page.locator(".oak-cot__title").innerText(), /^Thought for \d+s$/);
  await open(page, "reasoning-writing");
  assert.equal(await page.locator('.oak-cot__glyph [data-pose="composing"]').count(), 1, "while Oak writes, the header shows the writing art");
}));

test("D35-G2 reduced motion keeps the live reasoning still", () => withPage(async page => {
  await open(page, "reasoning-weighing");
  const animation = selector => page.locator(selector).first().evaluate(node => getComputedStyle(node).animationName);
  assert.equal(await animation(".ui-chain-of-thought__header"), "none");
  assert.equal(await page.locator('.oak-cot__step[data-state="running"] .oak-cot__node').evaluate(node => getComputedStyle(node, "::after").animationName), "none");
}, { reducedMotion: "reduce" }));
