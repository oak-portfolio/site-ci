import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { launchSlowLazy } from "../support/slow-lazy.mjs";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");

// A lazy block swaps its ghost for the real view after the scroller has placed the transcript; this grows the last turn the same
// way and says so as oakLazyView does.
const grow = (page, px, landed = true) => page.evaluate(([height, landed]) => {
  const turns = document.querySelectorAll(".oak-conversation__viewport [data-message-id]");
  const block = document.createElement("div");
  block.style.height = `${height}px`;
  turns[turns.length - 1].appendChild(block);
  if (landed) window.dispatchEvent(new Event("oak:lazy-landed"));
}, [px, landed]);
const read = page => page.evaluate(() => {
  const viewport = document.querySelector(".oak-conversation__viewport");
  return {
    top: Math.round(viewport.scrollTop), below: Math.round(viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight),
    latest: document.querySelector(".oak-conversation__latest")?.getAttribute("data-active"),
  };
});

// A transcript at its end with no question anchored (the spacer hidden), taller than the view.
test("167-G1 a lazy block that grows after mount keeps a reader at the end there, other growth rises in place, and it leaves a reader who scrolled up in place", async () => {
  const browser = await launchSlowLazy();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
    await page.goto(`${galleryUrl}/__dev/oak-states?state=saved-reopened-last-question`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
    await page.waitForTimeout(1500);
    const start = await read(page);
    assert.ok(start.below <= 24 && start.latest === "false", `the transcript opens at its end (${JSON.stringify(start)})`);

    await grow(page, 400);
    await page.waitForTimeout(500);
    const kept = await read(page);
    assert.ok(kept.below <= 24, `a reader at the end stays at the end after the block grows (${kept.below}px below)`);
    assert.equal(kept.latest, "false", "the Latest messages button stays hidden");

    // Content that grows with no lazy view landing (an answer settling, a trail folding) rises in place: the view holds still.
    await grow(page, 120, false);
    await page.waitForTimeout(500);
    const still = await read(page);
    assert.ok(Math.abs(still.top - kept.top) <= 1, `growth with no lazy landing leaves the view in place (${still.top} vs ${kept.top})`);

    const middle = await page.evaluate(() => {
      const viewport = document.querySelector(".oak-conversation__viewport");
      viewport.dispatchEvent(new WheelEvent("wheel", { deltaY: -1, bubbles: true }));
      viewport.scrollTop = Math.round((viewport.scrollHeight - viewport.clientHeight) / 2);
      viewport.dispatchEvent(new Event("scroll"));
      return Math.round(viewport.scrollTop);
    });
    await page.waitForTimeout(300);
    await grow(page, 400);
    await page.waitForTimeout(500);
    const away = await read(page);
    assert.ok(Math.abs(away.top - middle) <= 2, `a reader who scrolled up stays where they were (${away.top} vs ${middle})`);
    assert.equal(away.latest, "true", "the Latest messages button shows for the reader above the end");
  } finally {
    await browser.close();
  }
});

// A just-sent question sits anchored at the top while the spacer under it fills the view, so the reader reads as "at the end".
// A lazy view landing in its answer must leave that question where it is (DESIGN.md: preserve the visible message and its offset).
for (const width of [1280, 390]) {
  test(`167-G1 a lazy view landing under an anchored question leaves the question's top in place at ${width}px`, async () => {
    const browser = await launchSlowLazy();
    try {
      const page = await browser.newPage({ viewport: { width, height: 800 }, reducedMotion: "reduce" });
      await page.goto(`${galleryUrl}/__dev/oak-states?state=answer-declined`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
      await page.waitForTimeout(1500);
      const tops = await page.evaluate(async () => {
        const viewport = document.querySelector(".oak-conversation__viewport");
        const spacer = viewport.querySelector("[data-message-scroller-spacer]");
        const turns = [...viewport.querySelectorAll("[data-message-id]")];
        const question = turns.filter(turn => turn.dataset.scrollAnchor === "true").at(-1) ?? turns.at(-2);
        const top = () => Math.round(question.getBoundingClientRect().top);
        const out = { anchored: spacer?.hidden === false, tops: [top()] };
        const block = document.createElement("div");
        block.style.height = "120px";
        turns.at(-1).appendChild(block);
        window.dispatchEvent(new Event("oak:lazy-landed"));
        for (let frame = 0; frame < 30; frame++) { await new Promise(resolve => requestAnimationFrame(resolve)); out.tops.push(top()); }
        return out;
      });
      assert.ok(tops.anchored, `${width}: answer-declined opens with its question anchored (spacer shown)`);
      const travel = Math.max(...tops.tops.map(top => Math.abs(top - tops.tops[0])));
      assert.ok(travel <= 1, `${width}: the anchored question moves ${travel}px when a lazy view lands (${tops.tops.join(",")})`);
    } finally {
      await browser.close();
    }
  });
}
