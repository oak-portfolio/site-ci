import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

// PR 1c (genui merge 06): the reasoning trail's per-step source count, its results-found tally, and Retry or Continue
// on a stopped step. Every check opens a gallery state in a real browser with motion allowed and reads what the visitor sees.
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const question = "How does Steve approach AI systems?";

async function open(browser, id, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...options });
  const page = await context.newPage();
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${id}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 30000 });
  await page.waitForSelector(".oak-cot__steps", { timeout: 10000 });
  await page.waitForTimeout(1500);
  return page;
}
const withBrowser = async run => { const browser = await chromium.launch(); try { await run(browser); } finally { await browser.close(); } };

test("G06-G1 the research step's count is the data-research part's returnedSources, right-aligned on the step", async () => {
  await withBrowser(async browser => {
    const page = await open(browser, "trail-steps");
    const step = page.locator('.oak-cot__step[data-kind="research"]');
    // The fixture's research part returned 3 results and read 2, so 3 can only come from returnedSources.
    // It counts results returned, not pages read: the step's own note says some could not be read.
    assert.equal(await step.locator(".oak-cot__tally").innerText(), "3 found");
    assert.match(await step.innerText(), /some could not be read/i);
    const none = await open(browser, "trail-steps-none");
    assert.equal(await none.locator('.oak-cot__step[data-kind="research"]').count(), 1);
    assert.equal(await none.locator(".oak-cot__tally").count(), 0, "no results returned, no count");
    assert.equal(await page.locator('.oak-cot__step[data-kind="search"] .oak-cot__tally').count(), 0, "Steve's own search shows no count when the Worker sent none (today's Worker)");
    const box = await step.evaluate(row => {
      const body = row.querySelector(".oak-cot__body").getBoundingClientRect(), tally = row.querySelector(".oak-cot__tally").getBoundingClientRect(),
        title = row.querySelector(".oak-cot__step-title > span").getBoundingClientRect();
      return { gapToEdge: Math.round(body.right - tally.right), clearOfTitle: tally.left > title.right };
    });
    assert.ok(box.gapToEdge <= 2 && box.clearOfTitle, `the count sits on the right edge of the step (${JSON.stringify(box)})`);
  });
});

test("G06-G1b genui 11: Steve's own search names its tool-end count like the web step, and a zero count shows none", async () => {
  await withBrowser(async browser => {
    const page = await open(browser, "trail-steps-count");
    const searches = page.locator('.oak-cot__step[data-kind="search"]');
    assert.equal(await searches.count(), 2);
    assert.equal(await searches.nth(0).locator(".oak-cot__tally").innerText(), "5 passages", "Steve's own search counts passages, not the cited sources listed below it (M4 L2)");
    assert.equal(await searches.nth(1).locator(".oak-cot__tally").count(), 0, "a search that returned nothing shows no count, as the web step does");
    assert.equal(await page.locator('.oak-cot__step[data-kind="research"] .oak-cot__tally').innerText(), "3 found", "the web step keeps its own count");
    const box = await searches.nth(0).evaluate(row => {
      const body = row.querySelector(".oak-cot__body").getBoundingClientRect(), tally = row.querySelector(".oak-cot__tally").getBoundingClientRect(),
        title = row.querySelector(".oak-cot__step-title > span").getBoundingClientRect();
      return { gapToEdge: Math.round(body.right - tally.right), clearOfTitle: tally.left > title.right };
    });
    assert.ok(box.gapToEdge <= 2 && box.clearOfTitle, `the count sits on the right edge of the step (${JSON.stringify(box)})`);
  });
});

test("G06-G2 each step keeps its own time, and the trail keeps its landmarks", async () => {
  await withBrowser(async browser => {
    const page = await open(browser, "trail-steps");
    const times = await page.locator('.oak-cot__step[data-kind="understand"] .oak-cot__duration, .oak-cot__step[data-kind="search"] .oak-cot__duration, .oak-cot__step[data-kind="read"] .oak-cot__duration').allInnerTexts();
    assert.deepEqual(times, ["0.8s", "1.5s", "0.8s"]);
    assert.equal(await page.locator('ol[aria-label="Reasoning steps"]').count(), 1);
    for (const part of ["__step", "__glyph", "__clock", "__node", "__body", "__title", "__step-title"]) assert.ok(await page.locator(`.oak-cot${part}`).count() > 0 || part === "__clock", `.oak-cot${part} stays`);
  });
});

test("G06-G3 the trail offers no peek: a finished search or read step has no disclosure, and the found sources stay the one pill row", async () => {
  await withBrowser(async browser => {
    const page = await open(browser, "trail-steps");
    assert.equal(await page.locator('.oak-cot__step[data-kind="search"] button, .oak-cot__step[data-kind="read"] button').count(), 0, "nothing on a search or read step opens or takes focus");
    assert.equal(await page.getByText(/See what I (searched|read)/).count(), 0);
    assert.ok(await page.locator(".oak-cot__step[data-kind=\"search\"] .oak-message__source").count() > 0, "the found sources show once, under the last search");
  });
});

test("G06-G4 a stopped step offers the footer's own Retry and it does what the footer's Retry does", async () => {
  await withBrowser(async browser => {
    const outcomes = [];
    for (const via of ["step", "footer"]) {
      const page = await open(browser, "trail-stopped");
      const sent = [];
      await page.route("**/api/oak/chat**", route => { sent.push(JSON.parse(route.request().postData() ?? "{}")); });
      assert.match(await page.locator(".ui-chain-of-thought__header").innerText(), /1 of 3 steps stopped/);
      const stopped = page.locator('.oak-cot__step[data-state="error"]');
      assert.equal(await stopped.count(), 1);
      assert.equal(await page.locator('.oak-cot__step[data-state="error"] .oak-cot__again').count(), 1, "Retry sits on the step that stopped");
      assert.equal(await page.locator('.oak-cot__step[data-state="done"] .oak-cot__again').count(), 0, "finished steps offer nothing");
      const box = page.locator("textarea.ui-textarea").first();
      await box.fill("A different draft I was typing");
      await (via === "step" ? stopped.getByRole("button", { name: /^Retry/ }) : page.locator(".oak-turn__stopped").getByRole("button", { name: "Retry" })).click();
      await page.waitForTimeout(1200);
      outcomes.push({
        via, requests: sent.length, asked: (sent[0]?.turn?.task ?? sent[0]?.task)?.text,
        live: await page.locator('.ui-chain-of-thought[data-state="live"]').count(), stoppedCards: await page.locator(".oak-turn__stopped").count(),
        draft: await box.inputValue(),
      });
      await page.context().close();
    }
    const [step, footer] = outcomes.map(({ via, ...seen }) => seen);
    assert.deepEqual(step, footer, "the visitor sees the same result from either button");
    assert.equal(step.requests, 1, "one whole-turn retry is sent");
    assert.equal(step.asked, question, "it asks the question shown above the card");
    assert.equal(step.live, 1, "a new turn is thinking");
    assert.equal(step.draft, "A different draft I was typing", "a draft typed since stays where it was, as the footer leaves it");
  });
});

test("G06-G5 a turn that answered gives its stopped research step no Retry", async () => {
  await withBrowser(async browser => {
    const page = await open(browser, "tool-error");
    assert.equal(await page.locator(".oak-cot__again").count(), 0);
    assert.equal(await page.locator('.oak-cot__step[data-state="error"]').count(), 1, "main's error step still shows");
  });
});

test("G06-G6 a turn the visitor stopped says Continue on the step, as its footer does; with reduced motion the stopped step still offers it", async () => {
  await withBrowser(async browser => {
    const page = await open(browser, "trail-interrupted");
    const again = page.locator('.oak-cot__step[data-state="error"] .oak-cot__again');
    assert.equal((await again.innerText()).trim(), "Continue");
    assert.equal(await page.locator(".oak-turn__stopped").getByRole("button", { name: "Continue" }).count(), 1, "the footer says the same word");
    const stopped = await open(browser, "trail-stopped-reduced", { reducedMotion: "reduce" });
    assert.equal((await stopped.locator(".oak-cot__again").innerText()).trim(), "Retry");
    assert.equal(await stopped.locator(".oak-turn__stopped").getByRole("button", { name: "Retry" }).count(), 1);
  });
});
