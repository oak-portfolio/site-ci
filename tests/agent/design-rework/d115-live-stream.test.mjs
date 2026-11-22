import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const open = async (page, state) => {
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
  await page.waitForTimeout(300);
};
const store = (page, fn, arg) => page.evaluate(async ([source, value]) => {
  const url = performance.getEntriesByType("resource").map(entry => entry.name).find(name => /\/src\/lib\/oakWorkspace\.ts(\?|$)/.test(name));
  const workspace = await import(url);
  return new Function("workspace", "value", `return (${source})(workspace, value);`)(workspace, value);
}, [fn.toString(), arg]);
// Ends whatever runs and starts a new step, the way the next stream event arrives.
const step = (page, next) => store(page, (workspace, value) => {
  const messages = workspace.getOakWorkspace().messages;
  const last = messages.at(-1), now = Date.now();
  const steps = last.steps.map(item => item.state === "running" ? { ...item, state: "done", endedAt: now } : item);
  workspace.setOakWorkspaceFixture({ messages: [...messages.slice(0, -1), { ...last, steps: [...steps, { ...value, state: "running", startedAt: now - (value.ago ?? 0) }] }] });
}, next);
const shownOf = (page, title) => page.evaluate(name => {
  const node = [...document.querySelectorAll(".oak-cot__step")].find(item => item.querySelector(".oak-cot__step-title")?.textContent?.includes(name));
  const copy = node?.querySelector(".oak-cot__thought .ui-stream-text")?.cloneNode(true);
  copy?.querySelectorAll(".sr-only").forEach(child => child.remove());
  return copy ? copy.textContent.length : -1;
}, title);
const LONG = "I'm looking at how Steve breaks an AI workflow into parts he can test on their own: the retrieval step that finds "
  + "the right passages, the tool calls that act on them, the evaluation loop that scores each answer against what the sources "
  + "say, and the interface that shows a person what the model did and why. Each part gets its own checks, so a weak answer can "
  + "be traced to the step that caused it instead of the whole system being tuned by feel.";
const SHORT = "Two of those have their own write-ups, so each point can carry its own source.";

test("D115-G1 a long thought types in at a pace that finishes before the next one usually lands; a short one keeps reading pace", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await open(page, "reasoning-thoughts");
    await page.waitForFunction(() => !document.querySelector(".ui-stream-text[data-streaming]"), null, { timeout: 8000 });
    await step(page, { id: "think-long", operation: "think", thought: { title: "Splitting the workflow", text: LONG } });
    const frames = [];
    const started = Date.now();
    while (Date.now() - started < 5600) { frames.push({ t: Date.now() - started, shown: await shownOf(page, "Splitting the workflow") }); await page.waitForTimeout(40); }
    const done = frames.find(frame => frame.shown === LONG.length);
    assert.ok(done && done.t <= 5200, `${LONG.length} characters type out within about four seconds of opening (${done ? done.t : "never"}ms)`);
    const jumps = frames.slice(1).map((frame, index) => frame.shown - frames[index].shown);
    assert.ok(Math.max(...jumps) <= 24, `no jump: at most a few characters between 40ms samples (${Math.max(...jumps)})`);
    assert.ok(frames.filter(frame => frame.t < 1200).every(frame => frame.shown < LONG.length / 2), "still a stream, not a dump");

    await step(page, { id: "think-short", operation: "think", thought: { title: "Pairing sources", text: SHORT } });
    await page.waitForTimeout(1400);
    const short = await shownOf(page, "Pairing sources");
    assert.ok(short > 0 && short < SHORT.length, `a short thought still reads at about ten words a second (${short} of ${SHORT.length} at 1.4s)`);
  } finally {
    await browser.close();
  }
});

test("D115-G2 between thoughts the running step is alive: its own clock ticks and a forming line shows the next thought is coming", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await open(page, "reasoning-thoughts");
    await page.waitForFunction(() => !document.querySelector(".ui-stream-text[data-streaming]"), null, { timeout: 8000 });
    await step(page, { id: "weigh-gap", operation: "weigh", ago: 2200 });
    const read = () => page.evaluate(() => {
      const row = document.querySelector('.oak-cot__step[data-state="running"]');
      const clock = row?.querySelector(".oak-cot__duration[data-live]")?.cloneNode(true);
      clock?.querySelectorAll("[data-leaving]").forEach(node => node.remove());
      return { clock: clock?.textContent ?? null, forming: !!row?.querySelector(".oak-cot__forming") };
    });
    await page.waitForTimeout(500);
    const first = await read();
    await page.waitForTimeout(1300);
    const later = await read();
    assert.match(first.clock ?? "", /^\d+s$/, `the running step shows its own seconds (${first.clock})`);
    assert.ok(parseInt(later.clock, 10) > parseInt(first.clock, 10), `and they tick (${first.clock} then ${later.clock})`);
    assert.ok(first.forming, "a forming line marks the thought on its way");
    await step(page, { id: "think-next", operation: "think", thought: { title: "Pairing sources", text: SHORT } });
    await page.waitForTimeout(400);
    assert.equal(await page.locator(".oak-cot__forming").count(), 0, "the thought replaces the forming line");

    const still = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    await open(still, "reasoning-thoughts");
    await step(still, { id: "weigh-gap", operation: "weigh", ago: 2200 });
    await still.waitForTimeout(300);
    const animation = await still.evaluate(() => {
      const node = document.querySelector(".oak-cot__forming");
      return node ? getComputedStyle(node).animationName : "none";
    });
    assert.equal(animation, "none", "reduced motion keeps the forming line still");
  } finally {
    await browser.close();
  }
});

test("D115-G3 the answer arrives in its final place as the trail folds, so it never slides up under the reader", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await open(page, "answer-points");
    const landed = await store(page, workspace => {
      const last = workspace.getOakWorkspace().messages.at(-1);
      return { answer: last.answer, text: last.text };
    });
    await open(page, "reasoning-thoughts");
    await page.waitForFunction(() => !document.querySelector(".ui-stream-text[data-streaming]"), null, { timeout: 8000 });
    await store(page, (workspace, value) => {
      const messages = workspace.getOakWorkspace().messages;
      const last = messages.at(-1), now = Date.now();
      const steps = last.steps.map(item => item.state === "running" ? { ...item, state: "done", endedAt: now } : item);
      workspace.setOakWorkspaceFixture({ pending: false, progress: "", messages: [...messages.slice(0, -1),
        { ...last, state: "complete", answer: value.answer, text: value.text, steps }] });
    }, landed);
    const frames = await page.evaluate(() => new Promise(resolve => {
      const rows = [], start = performance.now();
      const tick = () => {
        const cot = [...document.querySelectorAll("[data-slot='chain-of-thought']")].at(-1);
        const content = cot?.querySelector("[data-slot='chain-of-thought-content']");
        // The answer wrapper is display: contents, so its first bubble is what the reader sees move.
        const answer = document.querySelector(".oak-turn__answer .ui-bubble");
        rows.push({ t: performance.now() - start, trail: content ? content.getBoundingClientRect().height : 0, folding: !!cot?.hasAttribute("data-folding"),
          opacity: answer ? Number(getComputedStyle(answer).opacity) : 0,
          top: answer ? answer.getBoundingClientRect().top + (answer.closest(".oak-workspace__reading, [data-slot='message-scroller']")?.scrollTop ?? 0) : null });
        if (performance.now() - start < 3500) requestAnimationFrame(tick); else resolve(rows);
      };
      requestAnimationFrame(tick);
    }));
    const arrived = frames.findIndex(frame => frame.top !== null);
    assert.ok(arrived > 0, "the answer arrives");
    // Q03-G2 (intentional update): the answer starts to arrive as the fold starts (no folded header over an empty body),
    // and the folding steps leave the flow, so the answer only makes its own 8px rise instead of sliding up with them.
    assert.ok(frames.slice(arrived).some(frame => frame.folding), "the answer arrives while the trail is still folding");
    const seen = frames.slice(arrived).filter(frame => frame.opacity > 0.5).map(frame => frame.top);
    assert.ok(seen.length > 0, "the answer becomes visible");
    assert.ok(Math.max(...seen) - Math.min(...seen) <= 10, `once visible, the answer stays where it lands (moved ${Math.round(Math.max(...seen) - Math.min(...seen))}px)`);
    assert.ok(frames[arrived].t < 2000, `and it does not keep the reader waiting (${Math.round(frames[arrived].t)}ms)`);
  } finally {
    await browser.close();
  }
});
