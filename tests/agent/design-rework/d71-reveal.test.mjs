import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const readWords = () => {
  const all = [...document.querySelectorAll(".oak-turn__answer .ui-reveal-text__word")];
  const opacity = node => Number(getComputedStyle(node).opacity);
  const footer = document.querySelector(".oak-turn__answer [data-slot='message-footer']");
  // Per point: the least-resolved word, and the most-landed pill.
  const points = [...document.querySelectorAll(".oak-turn__answer .oak-answer__point")].map(point => ({
    words: Math.min(...[...point.querySelectorAll(".ui-reveal-text__word")].map(opacity)),
    pill: Math.max(0, ...[...point.querySelectorAll(".oak-message__source")].map(opacity)) }));
  return { total: all.length, shown: all.filter(word => opacity(word) > 0.95).length, least: Math.min(1, ...all.map(opacity)),
    pills: [...document.querySelectorAll(".oak-turn__answer .oak-message__source")].map(opacity),
    points, footer: footer ? opacity(footer) : null, footerInert: footer ? footer.inert : null };
};
const words = page => page.evaluate(readWords);
// Records every frame from the page's first script, so the reveal is seen whenever it starts or however fast it runs.
const sampleFrames = page => page.addInitScript(`(${read => {
  window.__frames = [];
  const tick = () => {
    const sample = read();
    if (sample.total) window.__frames.push(sample);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}})(${readWords})`);

test("D71-G0 the reveal clock in CSS starts where the reasoning folds in JS", () => {
  // D115: the answer mounts after the fold, so the shared base is the short OAK_REVEAL_BASE_MS rather than the fold delay.
  const css = readFileSync("src/styles/oakAgent.css", "utf8").match(/--oak-reveal-base:\s*(\d+)ms/)?.[1];
  const js = readFileSync("src/lib/oakMotion.ts", "utf8").match(/OAK_REVEAL_BASE_MS = (\d+)/)?.[1];
  assert.ok(css && js && css === js, `--oak-reveal-base (${css}ms) equals OAK_REVEAL_BASE_MS (${js}ms)`);
});

test("D71-G1 a live work answer resolves word by word, pills and actions wait for their words, and a reopen or reduced motion is still", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await sampleFrames(page);
    await page.goto(`${galleryUrl}/__dev/oak-states?state=answer-points`, { waitUntil: "domcontentloaded" });
    // Sample the replay as it lands: some words resolved and some still on their way, with the actions not yet in.
    await page.waitForFunction(() => window.__frames.some(sample => sample.shown === sample.total && sample.footer > 0.95), null, { timeout: 20000 });
    const samples = await page.evaluate(() => window.__frames);
    const midway = samples.filter(sample => sample.total && sample.shown > 0 && sample.shown < sample.total);
    assert.ok(midway.length >= 5, `words resolve over several frames (${midway.length} partial samples)`);
    // The footer starts 100 ms after the last word starts (OakTurn footerIn: base + plan total + 100) on a JS clock, the words on a CSS clock, so a busy runner skews them by a few frames (least word 0.44 at footer 0.5 in 5 of 80 runs under load). Half in means the last word has at least begun.
    assert.ok(samples.every(sample => sample.footer === null || sample.footer < 0.5 || sample.least > 0), "the actions wait for the last word");
    assert.ok(samples.some(sample => sample.points.some(point => point.pill < 0.05)), "pills start hidden");
    assert.ok(samples.every(sample => sample.points.every(point => point.pill < 0.5 || point.words > 0.3)),
      "in every point, at every sample, no pill shows before all of that point's words have started");
    assert.ok(samples.every(sample => sample.footer === null || sample.footer > 0.95 || sample.footerInert),
      "the actions are out of the tab order until they have faded in");
    await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
    const rest = await words(page);
    assert.equal(rest.shown, rest.total, "every word at rest");
    assert.ok(rest.pills.every(value => value > 0.95) && rest.footer > 0.95, "pills and actions at rest");
    assert.equal(rest.footerInert, false, "the actions can be reached once they are in");

    // Turns already on screen when the transcript mounts render still: only the answer that just landed has a live scope.
    await page.goto(`${galleryUrl}/__dev/oak-states?state=long-conversation`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".oak-turn__answer .ui-reveal-text__word");
    const earlier = await page.evaluate(() => [...document.querySelectorAll(".oak-turn__answer:not([data-arrive]) .ui-reveal-text__word")]
      .map(word => Number(getComputedStyle(word).opacity)));
    assert.ok(earlier.length && earlier.every(value => value > 0.95), `earlier answers' words are at rest from the first frame (${earlier.length})`);
    await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
    const answers = await page.locator(".oak-turn__answer").count();
    assert.ok(answers >= 2, `several answers (${answers})`);
    assert.ok(await page.locator(".oak-turn__answer[data-arrive]").count() <= 1, "earlier answers render at rest");

    const still = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    await still.goto(`${galleryUrl}/__dev/oak-states?state=answer-points`, { waitUntil: "domcontentloaded" });
    await still.waitForSelector(".oak-turn__answer .ui-reveal-text__word");
    const reduced = await words(still);
    assert.equal(reduced.shown, reduced.total, "reduced motion shows the whole answer at once");
  } finally {
    await browser.close();
  }
});

test("D71-G2 the thinking clock rolls its digits and reads as plain text", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${galleryUrl}/__dev/oak-states?state=reasoning-slow`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
    const clock = page.locator(".oak-cot__clock");
    // Review v6 (intentional update): "at rest" waits out a tick that lands on ready; the text is read in the same turn as the check, so no tick lands between them.
    const resting = await page.waitForFunction(() => {
      const node = document.querySelector(".oak-cot__clock");
      return node && ![...node.querySelectorAll(".ui-rolling-number__slot")].some(slot => slot.querySelectorAll(".ui-rolling-number__digit").length > 1) && node.innerText;
    }, null, { timeout: 3000 });
    assert.match(await resting.jsonValue(), /^\d+s$/, "reads as one number and its unit");
    assert.ok(await clock.locator(".ui-rolling-number__slot").count() >= 1, "digits sit in rolling slots");
    // Across the next tick, a leaving digit rises out of its slot while the new one rises in.
    let rolled = false;
    let named = true;
    for (let tick = 0; tick < 24 && !rolled; tick++) {
      const state = await clock.evaluate(node => {
        // What assistive tech reads: the clock's text without anything aria-hidden.
        const copy = node.cloneNode(true);
        copy.querySelectorAll("[aria-hidden='true']").forEach(hidden => hidden.remove());
        return { rolling: [...node.querySelectorAll(".ui-rolling-number__slot")].some(slot => slot.querySelectorAll(".ui-rolling-number__digit").length > 1),
          spoken: copy.textContent };
      });
      rolled = state.rolling;
      if (rolled) named = /^\d+s$/.test(state.spoken);
      await page.waitForTimeout(60);
    }
    assert.ok(rolled, "a digit rolls on the tick");
    assert.ok(named, "mid-roll, assistive tech still reads one number: the leaving digit is hidden");
    const baseline = await clock.evaluate(node => {
      const digit = node.querySelector(".ui-rolling-number__digit").getBoundingClientRect();
      return Math.abs(digit.bottom - node.getBoundingClientRect().bottom);
    });
    assert.ok(baseline <= 6, `digits sit on the clock's line (${baseline}px)`);
  } finally {
    await browser.close();
  }
});
