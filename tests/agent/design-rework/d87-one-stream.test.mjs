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
// Ends whatever runs and adds a running thought, the way a provider's next summary block arrives.
const think = (page, id, title, text) => store(page, (workspace, [stepId, heading, words]) => {
  const messages = workspace.getOakWorkspace().messages;
  const last = messages.at(-1), now = Date.now();
  const steps = last.steps.map(step => step.state === "running" ? { ...step, state: "done", endedAt: now } : step);
  workspace.setOakWorkspaceFixture({ messages: [...messages.slice(0, -1), { ...last,
    steps: [...steps, { id: stepId, operation: "think", state: "running", startedAt: now, thought: { title: heading, text: words } }] }] });
}, [id, title, text]);
// Every animation frame for `ms`: how much of each titled thought a reader sees, and the trail's and answer's state.
const sample = (page, titles, ms) => page.evaluate(([names, span]) => new Promise(resolve => {
  const rows = [], start = performance.now();
  const shown = title => {
    const node = [...document.querySelectorAll(".oak-cot__step")].find(step => step.querySelector(".oak-cot__step-title")?.textContent?.includes(title));
    const copy = node?.querySelector(".oak-cot__thought .ui-stream-text")?.cloneNode(true);
    copy?.querySelectorAll(".sr-only").forEach(child => child.remove());
    return copy ? copy.textContent.length : -1;
  };
  const tick = () => {
    const cot = [...document.querySelectorAll("[data-slot='chain-of-thought']")].at(-1);
    rows.push({ t: performance.now() - start, shown: names.map(shown), answer: Boolean(document.querySelector(".oak-turn__answer")),
      settled: Boolean(document.querySelector(".oak-turn__answer [data-slot='message-footer']:not([inert])")),
      // v3 review (intentional update): follow-ups are the Related rows under the answer, rising in with its actions.
      related: (node => node ? (Number(getComputedStyle(node.parentElement).opacity) > 0.5 ? "visible" : "hidden") : "none")(document.querySelector(".oak-related")),
      folding: Boolean(cot?.hasAttribute("data-folding")), expanded: cot?.querySelector(".ui-chain-of-thought__header")?.getAttribute("aria-expanded") });
    if (performance.now() - start < span) requestAnimationFrame(tick); else resolve(rows);
  };
  requestAnimationFrame(tick);
}), [titles, ms]);
const FIRST = "The case study names three things Steve shipped around the classifier: the scanner flow, the rewards loop and the "
  + "mobile shell. I'll keep those as his and leave model training to the teammates the article credits, so the answer stays honest.";
const SECOND = "Two of those have their own write-ups, so each point can carry its own source instead of one page doing all the work.";

test("D87-G1 an earlier thought catches up without jumping while a newer one waits its turn", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await open(page, "reasoning-thoughts");
    await page.waitForFunction(() => !document.querySelector(".ui-stream-text[data-streaming]"), null, { timeout: 8000 });
    await think(page, "think-a", "Weighing the credits", FIRST);
    await page.waitForTimeout(1000);
    // The provider's next block arrives while the first is still typing.
    await think(page, "think-b", "Splitting the sources", SECOND);
    const rows = await sample(page, ["Weighing the credits", "Splitting the sources"], 3200);
    const first = rows.map(row => row.shown[0]);
    const backlog = FIRST.length - first[0];
    assert.ok(backlog > 60, `the first thought was still typing when the second arrived (${first[0]} of ${FIRST.length})`);
    const jumps = first.slice(1).map((value, index) => value - first[index]);
    assert.ok(Math.max(...jumps) <= 12, `never more than 12 characters in one frame (largest step ${Math.max(...jumps)})`);
    const done = rows.find(row => row.shown[0] === FIRST.length);
    assert.ok(done, "the first thought types out");
    // Three times ten words a second is 0.165 characters per ms; finishing faster than that would be a jump.
    assert.ok(done.t >= backlog / 0.165 * 0.85, `it catches up no faster than three times its pace (${Math.round(done.t)}ms for ${backlog} chars)`);
    const waiting = rows.filter(row => row.t < done.t - 20);
    assert.ok(waiting.every(row => row.shown[1] <= 0), "the newer thought waits until the earlier one has typed out");
    assert.ok(rows.at(-1).shown[1] > 0, `then the newer thought types (${rows.at(-1).shown[1]} chars)`);

    const still = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    await open(still, "reasoning-thoughts");
    await think(still, "think-a", "Weighing the credits", FIRST);
    await think(still, "think-b", "Splitting the sources", SECOND);
    await still.waitForTimeout(150);
    const whole = await sample(still, ["Weighing the credits", "Splitting the sources"], 100);
    assert.deepEqual(whole.at(-1).shown, [FIRST.length, SECOND.length], "reduced motion shows every thought whole");
  } finally {
    await browser.close();
  }
});

test("D87-G2 the trail stays open until its last thought has typed out, then folds, and the answer streams at a reading pace", async () => {
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
    await think(page, "think-a", "Weighing the credits", FIRST);
    await page.waitForTimeout(900);
    // The validated answer lands while the thought is still typing.
    await store(page, (workspace, value) => {
      const messages = workspace.getOakWorkspace().messages;
      const last = messages.at(-1), now = Date.now();
      const steps = last.steps.map(step => step.state === "running" ? { ...step, state: "done", endedAt: now } : step);
      workspace.setOakWorkspaceFixture({ pending: false, progress: "", messages: [...messages.slice(0, -1),
        { ...last, state: "complete", answer: value.answer, text: value.text, steps }] });
    }, landed);
    const rows = await sample(page, ["Weighing the credits"], 4500);
    const typedAt = rows.find(row => row.shown[0] === FIRST.length);
    assert.ok(typedAt && typedAt.t > 300, `the thought was still typing when the answer landed (typed out at ${typedAt && Math.round(typedAt.t)}ms)`);
    const before = rows.filter(row => row.t < typedAt.t - 20);
    assert.ok(before.every(row => row.expanded === "true" && !row.folding), "the trail stays open while its last thought types");
    assert.ok(before.every(row => !row.answer), "the answer waits under the held lines");
    // v3 review (intentional update): the Related rows ride in on the actions' own arrival, so they stay hidden until the answer lands.
    assert.ok(rows.filter(row => !row.answer).every(row => row.related !== "visible"), "follow-ups stay hidden while the answer is held");
    const foldAt = rows.find(row => row.folding);
    assert.ok(foldAt && foldAt.t >= typedAt.t, `then it folds (fold at ${foldAt && Math.round(foldAt.t)}ms)`);
    assert.ok(rows.some(row => row.t > foldAt.t && row.answer), "and the answer arrives");
    await page.waitForFunction(() => !document.querySelector("[data-slot='chain-of-thought'][data-folding]"), null, { timeout: 4000 });
    assert.equal(await page.locator(".ui-chain-of-thought__header").last().getAttribute("aria-expanded"), "false", "it ends shut");

    // Reading pace: the shared word step puts a hundred words between 2 and 4 seconds, and the actions wait for the words.
    const pace = await page.evaluate(() => {
      const reveal = document.querySelector(".oak-turn__answer .ui-reveal-text");
      return parseFloat(reveal.style.getPropertyValue("--ui-reveal-step"));
    });
    assert.ok(pace * 100 >= 2000 && pace * 100 <= 4000, `a hundred words span ${Math.round(pace * 100)}ms`);
    const midway = await page.evaluate(() => {
      const opacity = node => Number(getComputedStyle(node).opacity);
      const words = [...document.querySelectorAll(".oak-turn__answer .ui-reveal-text__word")].map(opacity);
      const footer = document.querySelector(".oak-turn__answer [data-slot='message-footer']");
      return { pending: words.filter(value => value < 0.95).length, footer: footer ? opacity(footer) : 0 };
    });
    assert.ok(midway.pending === 0 || midway.footer < 0.5, `the actions wait for the last word (${midway.pending} words still resolving, actions at ${midway.footer})`);
    await page.waitForFunction(() => !document.querySelector(".oak-turn__answer [data-slot='message-footer'][inert]"), null, { timeout: 8000 });
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => Number(getComputedStyle(document.querySelector(".oak-related").parentElement).opacity) > 0.95 ? "visible" : "hidden"), "visible",
      "then the follow-ups arrive");
  } finally {
    await browser.close();
  }
});
