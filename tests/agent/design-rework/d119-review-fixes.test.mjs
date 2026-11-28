import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { chromium } from "playwright";
import { loadTsx } from "./load-tsx.mjs";

// D119: fixes from the two-axis review of D114 to D118 (Standards and Spec).
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const read = file => readFileSync(new URL(`../../../${file}`, import.meta.url), "utf8");
const open = async (page, state) => {
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
  await page.waitForTimeout(400);
};
const store = (page, fn, arg) => page.evaluate(async ([source, value]) => {
  const url = performance.getEntriesByType("resource").map(entry => entry.name).find(name => /\/src\/lib\/oakWorkspace\.ts(\?|$)/.test(name));
  const workspace = await import(url);
  return new Function("workspace", "value", `return (${source})(workspace, value);`)(workspace, value);
}, [fn.toString(), arg]);

test("D119-G1 the message box, the advice field and the contract share one draft limit", () => {
  const transport = loadTsx("packages/oak-agent-contracts/src/transport.ts");
  assert.equal(transport.questionMaxCharacters, 4000, "the contract names its question limit");
  assert.match(read("packages/oak-agent-contracts/src/transport.ts"), /const text = z\.string\(\)\.min\(1\)\.max\(questionMaxCharacters\)/, "and its schema reads it");
  assert.match(read("src/lib/oakWorkspace.ts"), /export const OAK_DRAFT_LIMIT = questionMaxCharacters;/, "the message box takes the contract's limit");
  const panels = read("src/components/agent/OakWorkflowPanels.tsx");
  assert.doesNotMatch(panels, /maxLength=\{4000\}/, "no hand-copied limit in the advice field");
  assert.match(panels, /maxLength=\{OAK_DRAFT_LIMIT\}/);
});

test("D119-G2 the constraints field's icon means only that", () => {
  const { oakMeaningIcons } = loadTsx("src/lib/oakMeaningIcons.ts");
  const icon = oakMeaningIcons["field.constraints"];
  const literal = execSync(`rg -l 'name="${icon}"' src/components || true`, { encoding: "utf8" }).trim();
  assert.equal(literal, "", `"${icon}" is also used directly for another meaning in: ${literal}`);
});

test("D119-G3 a panel field keeps its fill when focused; only the ring changes", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await open(page, "contact-brief");
    const group = '.oak-brief-editor [data-slot="input-group"]';
    const rest = await page.locator(group).first().evaluate(node => getComputedStyle(node).backgroundColor);
    await page.locator(`${group} textarea`).first().focus();
    await page.waitForTimeout(300);
    // Review v5 supersedes: at full screen the ring is a masked ::after edge, so it is read from either layer. The fill is then the element's own colour.
    const focused = await page.locator(group).first().evaluate(node => { const s = getComputedStyle(node); return s.backgroundImage === "none" ? s.backgroundColor : s.backgroundImage; });
    const fill = focused.match(/(?:color|rgba?)\([^)]*\)/)?.[0];
    assert.ok(fill, `the focused well paints a fill (${focused})`);
    assert.equal(fill.replace(/\s/g, ""), rest.replace(/\s/g, ""), "the same fill as at rest");
  } finally {
    await browser.close();
  }
});

test("D119-G4 every counted brief field tells assistive tech its count and limit", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await open(page, "contact-brief");
    const fields = await page.evaluate(() => [...document.querySelectorAll(".oak-brief-editor textarea")].map(area => ({
      id: area.id,
      described: (area.getAttribute("aria-describedby") ?? "").split(/\s+/).map(id => document.getElementById(id)?.textContent ?? "").join(" "),
    })));
    assert.ok(fields.length >= 2, "the brief has its fields");
    for (const field of fields) assert.match(field.described, /\d[\d,]* \/ [\d,]+/, `${field.id} is described by its counter`);
  } finally {
    await browser.close();
  }
});

/**
 * Lands the answer with every animation frozen (frames and Web Animations), so the trail's fold can never report its end;
 * returns how long after landing the answer showed.
 */
const landWithFrozenFold = async (page) => {
  await open(page, "answer-points");
  const landed = await store(page, workspace => {
    const last = workspace.getOakWorkspace().messages.at(-1);
    return { answer: last.answer, text: last.text };
  });
  await open(page, "reasoning-thoughts");
  await page.waitForFunction(() => !document.querySelector(".ui-stream-text[data-streaming]"), null, { timeout: 8000 });
  await page.evaluate(() => {
    window.requestAnimationFrame = () => 0;
    const never = new Promise(() => {});
    Element.prototype.animate = function () {
      return { finished: never, ready: Promise.resolve(), playState: "running", currentTime: 0, startTime: null, playbackRate: 1, effect: null,
        cancel() {}, pause() {}, play() {}, finish() {}, reverse() {}, commitStyles() {}, updatePlaybackRate() {}, addEventListener() {}, removeEventListener() {},
        onfinish: null, oncancel: null };
    };
  });
  await store(page, (workspace, value) => {
    const messages = workspace.getOakWorkspace().messages;
    const last = messages.at(-1), now = Date.now();
    const steps = last.steps.map(item => item.state === "running" ? { ...item, state: "done", endedAt: now } : item);
    workspace.setOakWorkspaceFixture({ pending: false, progress: "", messages: [...messages.slice(0, -1),
      { ...last, state: "complete", answer: value.answer, text: value.text, steps }] });
  }, landed);
  return page.evaluate(() => new Promise(resolve => {
    const start = performance.now();
    const poll = setInterval(() => {
      const t = performance.now() - start;
      if (document.querySelector(".oak-turn__answer") || t > 6000) { clearInterval(poll); resolve(document.querySelector(".oak-turn__answer") ? t : null); }
    }, 20);
  }));
};

test("D119-G5 a fold that never ends still releases the answer, and reduced motion never waits for one", async () => {
  const browser = await chromium.launch();
  try {
    const moving = await landWithFrozenFold(await browser.newPage({ viewport: { width: 1440, height: 900 } }));
    assert.ok(moving !== null, "the answer shows even though the fold never reported its end");
    // Q03-G2 (intentional update): the answer is released as the fold starts, so a fold that never ends cannot hold it back.
    assert.ok(moving <= 2000, `it arrives as the fold starts, without waiting for the fold to end (${Math.round(moving)}ms)`);
    const still = await landWithFrozenFold(await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" }));
    assert.ok(still !== null && still < 1000, `with reduced motion there is no fold to wait for (${still === null ? "never" : Math.round(still)}ms)`);
  } finally {
    await browser.close();
  }
});
