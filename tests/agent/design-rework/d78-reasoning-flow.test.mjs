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
// The page's own store module (Vite serves one instance per URL), so the test drives the same state the workspace renders.
const store = (page, fn, arg) => page.evaluate(async ([source, value]) => {
  const url = performance.getEntriesByType("resource").map(entry => entry.name).find(name => /\/src\/lib\/oakWorkspace\.ts(\?|$)/.test(name));
  const workspace = await import(url);
  return new Function("workspace", "value", `return (${source})(workspace, value);`)(workspace, value);
}, [fn.toString(), arg]);
// What a reader sees of the newest thought: its typed text, without the screen-reader remainder.
const newest = page => page.evaluate(() => {
  const step = [...document.querySelectorAll(".oak-cot__step")].at(-1);
  const thought = step?.querySelector(".oak-cot__thought .ui-stream-text");
  const copy = thought?.cloneNode(true);
  copy?.querySelectorAll(".sr-only").forEach(node => node.remove());
  // Clipped while opening: the row is shorter than what it holds, so its height is the animation, not the text wrapping.
  return { shown: copy ? copy.textContent.length : 0, height: step ? Math.round(step.getBoundingClientRect().height) : 0, kind: step?.dataset.kind,
    clipping: step ? step.style.overflow === "hidden" && step.getBoundingClientRect().height < step.scrollHeight - 4 : false };
});
const THOUGHT = "The case study names three things Steve shipped around the classifier: the scanner flow, the rewards loop and the "
  + "mobile shell. I'll keep those as his and leave model training to the teammates the article credits, so the answer stays honest.";

test("D78-G1 a thought that lands whole types at a reading pace, its row grows open instead of jumping, and a newer step settles it", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await open(page, "reasoning-thoughts");
    // The state's own running thought types first; thoughts take turns (D87), so the new one starts on a quiet trail.
    await page.waitForFunction(() => !document.querySelector(".ui-stream-text[data-streaming]"), null, { timeout: 8000 });
    const before = await page.locator(".oak-cot__step").count();
    // A new thought arrives whole, as the provider sends it: the previous one ends and this one runs.
    await store(page, (workspace, text) => {
      const messages = workspace.getOakWorkspace().messages;
      const last = messages.at(-1), now = Date.now();
      const steps = last.steps.map(step => step.state === "running" ? { ...step, state: "done", endedAt: now } : step);
      workspace.setOakWorkspaceFixture({ messages: [...messages.slice(0, -1), { ...last,
        steps: [...steps, { id: "think-d78", operation: "think", state: "running", startedAt: now, thought: { title: "Keeping credit honest", text } }] }] });
    }, THOUGHT);
    const samples = [];
    const started = Date.now();
    while (Date.now() - started < 2200) { samples.push({ t: Date.now() - started, ...(await newest(page)) }); await page.waitForTimeout(40); }
    assert.equal(await page.locator(".oak-cot__step").count(), before + 1, "the new thought joins the rail");
    const final = Math.max(...samples.map(sample => sample.height));
    const growing = samples.filter(sample => sample.t < 500 && sample.height > 0 && sample.clipping);
    assert.ok(growing.length >= 2, `the row grows open over several frames, clipping its own content (${samples.slice(0, 8).map(sample => `${sample.height}${sample.clipping ? "c" : ""}`)})`);
    assert.ok(samples.filter(sample => sample.t < 330).every(sample => sample.shown === 0), "the thought waits for its row to open before it types");
    const at = ms => samples.filter(sample => sample.t <= ms).at(-1).shown;
    assert.ok(at(1000) > 20 && at(1000) < THOUGHT.length * 0.6, `about ten words a second, not all at once (${at(1000)} of ${THOUGHT.length} chars at 1s)`);
    assert.ok(at(2000) > at(1000), "still typing at 2s");

    // A newer step takes over: what is left of the thought catches up at up to three times its pace (D87 replaced the
    // 450ms finish, which read as a jump), so the ~150 characters left land within about 1.3s.
    await store(page, workspace => {
      const messages = workspace.getOakWorkspace().messages;
      const last = messages.at(-1), now = Date.now();
      const steps = last.steps.map(step => step.state === "running" ? { ...step, state: "done", endedAt: now } : step);
      workspace.setOakWorkspaceFixture({ messages: [...messages.slice(0, -1), { ...last, steps: [...steps, { id: "verify-d78", operation: "verify", state: "running", startedAt: now }] }] });
    });
    await page.waitForTimeout(1300);
    const settled = await page.evaluate(() => {
      const thought = [...document.querySelectorAll(".oak-cot__step")].at(-2).querySelector(".oak-cot__thought .ui-stream-text").cloneNode(true);
      thought.querySelectorAll(".sr-only").forEach(node => node.remove());
      return thought.textContent.length;
    });
    assert.equal(settled, THOUGHT.length, "the settled thought is whole within 1.3s");

    const still = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    await open(still, "reasoning-thoughts");
    await store(still, (workspace, text) => {
      const messages = workspace.getOakWorkspace().messages;
      const last = messages.at(-1);
      workspace.setOakWorkspaceFixture({ messages: [...messages.slice(0, -1), { ...last,
        steps: [...last.steps, { id: "think-d78", operation: "think", state: "running", startedAt: Date.now(), thought: { title: "Keeping credit honest", text } }] }] });
    }, THOUGHT);
    await still.waitForTimeout(120);
    assert.equal((await newest(still)).shown, THOUGHT.length, "reduced motion shows the thought whole");
  } finally {
    await browser.close();
  }
});

test("D78-G2 when the answer lands the reasoning trail folds shut over several frames instead of snapping", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${galleryUrl}/__dev/oak-states?state=answer-points`, { waitUntil: "domcontentloaded" });
    // Sample from the moment the replayed trail exists, so a slow first load cannot push the fold out of the window.
    await page.waitForSelector("[data-slot='chain-of-thought-content']", { timeout: 20000 });
    const heights = [];
    const started = Date.now();
    while (Date.now() - started < 2400) {
      heights.push(await page.evaluate(() => {
        const content = document.querySelector("[data-slot='chain-of-thought-content']");
        return content ? Math.round(content.getBoundingClientRect().height) : 0;
      }));
      await page.waitForTimeout(30);
    }
    const peak = Math.max(...heights);
    const peakAt = heights.indexOf(peak);
    const folding = heights.slice(peakAt).filter(height => height > 8 && height < peak - 8);
    assert.ok(peak > 120, `the trail was open while Oak worked (${peak}px)`);
    assert.ok(folding.length >= 5, `the fold passes through several heights (${folding.length} frames: ${folding.slice(0, 8)})`);
    assert.equal(heights.at(-1), 0, "and ends shut");
  } finally {
    await browser.close();
  }
});

test("D78-G3 while Oak works the transcript follows its live edge with smooth scrolling; a settled or reduced-motion transcript does not", async () => {
  const browser = await chromium.launch();
  try {
    const behaviour = page => page.locator(".oak-conversation__viewport").evaluate(node => ({ following: node.hasAttribute("data-following"), scroll: getComputedStyle(node).scrollBehavior }));
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await open(page, "reasoning-thoughts");
    assert.deepEqual(await behaviour(page), { following: true, scroll: "smooth" }, "pending: the follow glides");
    await open(page, "answer-points");
    assert.deepEqual(await behaviour(page), { following: false, scroll: "auto" }, "settled: scrolling is the reader's own");
    const still = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    await open(still, "reasoning-thoughts");
    assert.equal((await behaviour(still)).scroll, "auto", "reduced motion: no smooth follow");

    // And the follow really glides: with a pending turn on a long transcript, a scroll to the live edge passes through the middle.
    const live = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await open(live, "long-conversation");
    await store(live, workspace => {
      const messages = workspace.getOakWorkspace().messages;
      workspace.setOakWorkspaceFixture({ pending: true, progress: "Reading your question", messages: [...messages,
        { id: "d78-q", role: "user", text: "What did Steve own?", cards: [] },
        { id: "d78-a", role: "assistant", text: "", cards: [], state: "pending", steps: [{ id: "understand-0", operation: "understand", state: "running", startedAt: Date.now() }] }] });
    });
    await live.waitForTimeout(900);
    const glide = await live.locator(".oak-conversation__viewport").evaluate(async node => {
      node.scrollTo({ top: 0, behavior: "instant" });
      const max = node.scrollHeight - node.clientHeight;
      node.scrollTo({ top: max, behavior: "auto" });
      // Sample every frame until the scroll lands (or 1.5s): a glide passes through the middle; a jump never does.
      // Frames, not a fixed 60ms, so a busy machine that paints late still sees the glide (D99 de-flake).
      const seen = [];
      const started = performance.now();
      while (performance.now() - started < 1500) {
        await new Promise(resolve => requestAnimationFrame(resolve));
        seen.push(Math.round(node.scrollTop));
        if (seen.at(-1) >= max - 1) break;
      }
      return { max: Math.round(max), mid: seen.find(top => top > 0 && top < max - 20) ?? 0 };
    });
    assert.ok(glide.max > 200 && glide.mid > 0 && glide.mid < glide.max - 20, `a follow scroll glides (${glide.mid} of ${glide.max} mid-way)`);
  } finally {
    await browser.close();
  }
});

test("D78-G4 a click on the reasoning header while the trail folds reopens it", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${galleryUrl}/__dev/oak-states?state=answer-points`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".ui-chain-of-thought[data-folding]", { timeout: 20000 });
    await page.locator(".ui-chain-of-thought__header").last().click();
    await page.waitForTimeout(900);
    const after = await page.evaluate(() => ({ expanded: document.querySelector(".ui-chain-of-thought__header").getAttribute("aria-expanded"),
      height: Math.round(document.querySelector("[data-slot='chain-of-thought-content']")?.getBoundingClientRect().height ?? 0) }));
    assert.equal(after.expanded, "true", "the header reads open");
    assert.ok(after.height > 60, `the trail is open again (${after.height}px)`);
  } finally {
    await browser.close();
  }
});
