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
  const steps = (last.steps ?? []).map(item => item.state === "running" ? { ...item, state: "done", endedAt: now } : item);
  workspace.setOakWorkspaceFixture({ messages: [...messages.slice(0, -1), { ...last, steps: [...steps, { ...value, state: "running", startedAt: now - (value.ago ?? 0) }] }] });
}, next);
const land = (page, value) => store(page, (workspace, landed) => {
  const messages = workspace.getOakWorkspace().messages;
  const last = messages.at(-1), now = Date.now();
  const steps = (last.steps ?? []).map(item => item.state === "running" ? { ...item, state: "done", endedAt: now } : item);
  workspace.setOakWorkspaceFixture({ pending: false, progress: "", messages: [...messages.slice(0, -1),
    { ...last, state: "complete", answer: landed.answer, text: landed.text, steps }] });
}, value);
const longTrail = [
  { id: "understand", operation: "understand" }, { id: "search-1", operation: "search" }, { id: "read-1", operation: "read" },
  { id: "search-2", operation: "search" }, { id: "read-2", operation: "read" }, { id: "navigate-1", operation: "navigate" },
  { id: "search-3", operation: "search" }, { id: "read-3", operation: "read" }, { id: "weigh-1", operation: "weigh" },
];
const sourcedAnswer = async page => {
  await open(page, "answer-points");
  return store(page, workspace => { const last = workspace.getOakWorkspace().messages.at(-1); return { answer: last.answer, text: last.text }; });
};
const runTrail = async page => {
  await open(page, "long-conversation");
  await page.evaluate(() => window.__oakGallery.sendUser("Walk me through how Steve evaluates agents, with sources."));
  await page.waitForTimeout(300);
  for (const next of longTrail) { await step(page, next); await page.waitForTimeout(160); }
  await page.waitForTimeout(600);
};
// The first visible line of the newest answer, against the conversation viewport.
const answerLine = page => page.evaluate(() => {
  const viewport = document.querySelector(".oak-conversation__viewport").getBoundingClientRect();
  const turn = [...document.querySelectorAll('.oak-conversation__content [data-slot="message"][data-align="start"]')].at(-1);
  const first = [...(turn?.querySelector(".oak-turn__answer")?.children ?? [])].find(node => node.getBoundingClientRect().height > 0);
  if (!first) return null;
  const box = first.getBoundingClientRect();
  return { top: Math.round(box.top - viewport.top), height: Math.round(viewport.height) };
});

test("D124-G1 no skeleton lines hold the answer's place while Oak works", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    for (const state of ["thinking", "tool-running", "reasoning-slow", "reasoning-thoughts"]) {
      await open(page, state);
      const turn = page.locator('[data-slot="message"][data-state="pending"]').last();
      assert.equal(await turn.count(), 1, `${state} has a pending turn`);
      assert.equal(await turn.locator(".oak-turn__placeholder, .ui-skeleton").count(), 0, `${state}: no waiting skeleton under the trail`);
    }
  } finally {
    await browser.close();
  }
});

test("D124-G2 a long live trail shows only its newest steps under one earlier-steps row that opens the rest", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await runTrail(page);
    const titles = () => page.locator(".oak-cot__step .oak-cot__step-title").allTextContents();
    const shown = await titles();
    assert.equal(shown.length, 3, `three newest steps while live (${shown.length})`);
    const earlier = page.locator(".oak-cot__earlier");
    assert.match(await earlier.innerText(), /^6 earlier steps$/, "one row names the six earlier steps");
    await earlier.click();
    await page.waitForTimeout(400);
    assert.equal((await titles()).length, longTrail.length, "opening it shows every step");
  } finally {
    await browser.close();
  }
});

test("D124-G3 after a long trail the answer's first line is on screen when it lands for a reader who was following", async () => {
  const browser = await chromium.launch();
  try {
    for (const reducedMotion of ["no-preference", "reduce"]) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion });
      const landed = await sourcedAnswer(page);
      await runTrail(page);
      await land(page, landed);
      await page.waitForTimeout(3200);
      const line = await answerLine(page);
      assert.ok(line && line.top >= 0 && line.top + 24 <= line.height, `${reducedMotion}: answer's first line in view (${JSON.stringify(line)})`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});

test("D124-G4 a reader who scrolled up is not moved and gets an Answer ready control that jumps to the answer", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const landed = await sourcedAnswer(page);
    await runTrail(page);
    await page.locator(".oak-conversation__viewport").hover();
    await page.mouse.wheel(0, -1400);
    await page.waitForTimeout(500);
    const before = await page.evaluate(() => document.querySelector(".oak-conversation__viewport").scrollTop);
    await land(page, landed);
    await page.waitForTimeout(3000);
    assert.equal(await page.evaluate(() => document.querySelector(".oak-conversation__viewport").scrollTop), before, "the reader stays put");
    const ready = page.getByRole("button", { name: "Answer ready" });
    // It appears once the trail has folded and the answer is in place (the fold has a 2.5s fallback).
    await ready.waitFor({ state: "visible", timeout: 6000 });
    assert.equal(await page.evaluate(() => document.querySelector(".oak-conversation__viewport").scrollTop), before, "the reader is still where they were");
    await ready.click();
    await page.waitForTimeout(1200);
    const line = await answerLine(page);
    assert.ok(line && line.top >= 0 && line.top <= line.height / 2, `the jump opens on the answer (${JSON.stringify(line)})`);
    assert.equal(await ready.count(), 0, "the control goes once the answer is read");
  } finally {
    await browser.close();
  }
});

test("D125-G1 the header art and the running step sit in spacious rounded-rect wells; done steps stay small", async () => {
  const browser = await chromium.launch();
  try {
    for (const reducedMotion of ["no-preference", "reduce"]) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion });
      for (const state of ["tool-running", "reasoning-slow"]) {
        await open(page, state);
        await page.waitForTimeout(500);
        const shape = await page.evaluate(() => {
          const measure = node => { const box = node.getBoundingClientRect(), style = getComputedStyle(node);
            return { w: Math.round(box.width), h: Math.round(box.height), r: parseFloat(style.borderTopLeftRadius) }; };
          const glyph = document.querySelector(".oak-cot__glyph");
          const running = document.querySelector('.oak-cot__step[data-state="running"] .oak-cot__node');
          const done = document.querySelector('.oak-cot__step[data-state="done"] .oak-cot__node');
          // The concentric target: the sheet radius minus the header's inset (--oak-r-sheet - --space-micro).
          const probe = document.createElement("div");
          probe.style.borderTopLeftRadius = "calc(var(--oak-r-sheet) - var(--space-micro))";
          glyph.parentElement.append(probe);
          const concentric = parseFloat(getComputedStyle(probe).borderTopLeftRadius);
          probe.remove();
          return { glyph: measure(glyph), running: measure(running), done: measure(done),
            concentric, runningBorder: getComputedStyle(running).borderTopColor,
            sprite: running.querySelector(".oak-activity-sprite__frame")?.getBoundingClientRect().width ?? 0,
            icon: running.querySelector("svg")?.getBoundingClientRect().width ?? 0,
            headerSprite: glyph.querySelector(".oak-activity-sprite__frame")?.getBoundingClientRect().width ?? 0 };
        });
        const tag = `${state} ${reducedMotion}: ${JSON.stringify(shape)}`;
        assert.ok(shape.glyph.w >= 44 && shape.glyph.h >= 44, `header well is at least 44px (${tag})`);
        // Review v4 supersedes D125's "radius under half minus 4": the header tile is concentric with the header sheet.
        assert.equal(shape.glyph.r, shape.concentric, `header well radius is --oak-r-sheet minus --space-micro (${tag})`);
        // R14 (intentional update, Oak review v11): the header is a 40px frame, so the concentric tile inside it reads round.
        assert.ok(shape.glyph.r <= shape.glyph.w, `header well stays concentric with its frame (${tag})`);
        assert.ok(shape.headerSprite >= 40 && shape.headerSprite <= shape.glyph.w - 4, `header sprite fits with air (${tag})`);
        assert.ok(shape.running.w >= 44 && shape.running.h >= 44, `running node is at least 44px (${tag})`);
        assert.ok(shape.running.r < shape.running.w / 2 - 4, `running node is a rounded rect (${tag})`);
        // Review v4: the running tile is a tinted fill with only its breathing ring, no second violet border.
        assert.equal(shape.runningBorder, "rgba(0, 0, 0, 0)", `running node has no border colour (${tag})`);
        // Lead's call after review: the header carries the turn's one picture; the running node is a roomy loader with a 20px icon.
        assert.equal(shape.sprite, 0, `one picture per turn: the art stays in the header (${tag})`);
        assert.ok(shape.icon >= 18, `the running node's icon is large enough to read (${tag})`);
        assert.equal(shape.done.w, 28, `done steps stay 28px (${tag})`);
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
