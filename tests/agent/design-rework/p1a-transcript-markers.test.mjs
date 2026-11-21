import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

// Generative UI merge, PR 1a: the transcript reads the Message Scroller's own state, a reopened conversation opens on its
// last question, a "Today" marker separates saved turns from new ones, aria-busy marks a streaming answer, and a quote chip
// jumps through the scroller. The kept contract (role, aria-live, label, main's two markers) stays as it was.
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");

async function open(browser, state, size = { width: 1280, height: 800 }) {
  const page = await browser.newPage({ viewport: size, reducedMotion: "reduce" });
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 30000 });
  await page.waitForTimeout(500);
  return page;
}

test("P1A-G1 welcome and panels keep the more-below hook, and the transcript keeps its list contract", () => {
  const transcript = readFileSync("src/components/agent/OakTranscript.tsx", "utf8");
  const conversation = readFileSync("src/components/agent/OakConversation.tsx", "utf8");
  assert.match(conversation, /useOakMoreBelow\(reading\)/, "the reading pane and welcome still use the hook");
  assert.match(transcript, /role="list" aria-live="off"/);
  assert.match(transcript, /aria-label="Conversation with Oak"/);
  assert.match(transcript, /"last-anchor"/, "a reopened conversation opens on its last question");
});

// Real browser, motion allowed: the scroller reports no "end" while it follows the live edge, so the bottom fade has to come
// from the more-below mark too. The fade is the --oak-reading-fade-bottom the viewport resolves to.
test("P1A-G6 once an answer has landed with content under the fold, the transcript's bottom fade is on", async () => {
  const browser = await chromium.launch();
  try {
    let overflowing = 0;
    for (const state of ["answer-points", "meter-memory-out", "long-conversation"]) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 30000 });
      await page.waitForTimeout(1200);
      const result = await page.evaluate(() => {
        const viewport = document.querySelector(".oak-conversation__viewport");
        return { below: viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight,
          fade: getComputedStyle(viewport).getPropertyValue("--oak-reading-fade-bottom").trim() };
      });
      if (result.below > 8) {
        overflowing++;
        assert.notEqual(result.fade, "0px", `${state}: ${Math.round(result.below)}px under the fold needs the bottom fade`);
      }
      await page.close();
    }
    assert.ok(overflowing >= 1, "at least one state runs below the fold, or this test proves nothing");
  } finally {
    await browser.close();
  }
});

test("P1A-G7 the welcome has no Latest pill strip: its fade is the gutter and its clear strip is the float reserve", async () => {
  const browser = await chromium.launch();
  try {
    let fading = 0;
    for (const state of ["empty", "empty-recruiter", "empty-collaborator", "empty-learner"]) {
      const page = await browser.newPage({ viewport: { width: 390, height: 640 } });
      await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 30000 });
      await page.waitForTimeout(800);
      const result = await page.evaluate(() => {
        const viewport = document.querySelector(".oak-conversation[data-empty=\"true\"] > .oak-conversation__viewport");
        const style = getComputedStyle(viewport);
        const px = value => { const probe = document.createElement("div"); probe.style.width = value; viewport.append(probe);
          const width = getComputedStyle(probe).width; probe.remove(); return width; };
        return { pill: document.querySelectorAll(".oak-conversation__latest").length, more: viewport.hasAttribute("data-more-below"),
          clear: style.getPropertyValue("--oak-reading-clear").trim(), fade: style.getPropertyValue("--oak-reading-fade-bottom").trim(),
          gutter: px("var(--space-gutter)"), reserve: px("var(--oak-float-reserve)") };
      });
      assert.equal(result.pill, 0, `${state}: the welcome has no pill`);
      if (result.more) {
        fading++;
        assert.equal(result.fade, result.gutter, `${state}: the welcome fades by the gutter only`);
        assert.equal(result.clear, result.reserve, `${state}: the clear strip is the float reserve only`);
      }
      await page.close();
    }
    assert.ok(fading >= 1, "at least one welcome runs below the fold on a 390x640 phone, or this test proves nothing");
  } finally {
    await browser.close();
  }
});

test("P1A-G2 a reopened saved conversation lands on its last question, with main's marker and no Today marker", async () => {
  const browser = await chromium.launch();
  try {
    for (const size of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
      const page = await open(browser, "saved-reopened-last-question", size);
      const result = await page.evaluate(() => {
        const viewport = document.querySelector(".oak-conversation__viewport"), frame = viewport.getBoundingClientRect();
        const question = [...viewport.querySelectorAll('[data-message-id][data-scroll-anchor="true"]')].at(-1).getBoundingClientRect();
        return { top: question.top - frame.top, bottom: question.bottom - frame.top, height: frame.height, scrollable: viewport.getAttribute("data-scrollable"),
          reopened: document.querySelectorAll(".oak-conversation__reopened").length, today: document.querySelectorAll(".oak-conversation__today").length,
          list: viewport.querySelector("[role=list]").getAttribute("aria-live"), label: viewport.getAttribute("aria-label"),
          busy: viewport.querySelector("[role=list]").hasAttribute("aria-busy") };
      });
      assert.ok(result.top >= 0 && result.bottom <= result.height, `the last question is on screen at ${size.width}`);
      assert.equal(result.reopened, 1);
      assert.equal(result.today, 0);
      assert.doesNotMatch(result.scrollable ?? "", /end/, "at rest at the end, so no Latest pill");
      assert.equal(result.list, "off");
      assert.equal(result.label, "Conversation with Oak");
      assert.equal(result.busy, false);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});

test("P1A-G3 a Today marker sits between the saved turns and the first new one", async () => {
  const browser = await chromium.launch();
  try {
    const page = await open(browser, "saved-reopened-today");
    const order = await page.evaluate(() => [...document.querySelector("[role=list]").children].map(node =>
      node.classList.contains("oak-conversation__reopened") ? "reopened" : node.classList.contains("oak-conversation__today") ? `today:${node.textContent}` : node.dataset.messageId));
    assert.deepEqual(order.slice(0, 1), ["reopened"]);
    assert.deepEqual(order.slice(1, 6), ["m1", "m2", "m3", "m4", "today:Today"]);
    assert.equal(order[6], "m5");
    assert.equal(await page.locator(".oak-conversation__today[role=listitem]").count(), 1);
  } finally {
    await browser.close();
  }
});

test("P1A-G4 the list says it is busy while an answer streams, and only then", async () => {
  const browser = await chromium.launch();
  try {
    const page = await open(browser, "saved-reopened-last-question");
    const busy = () => page.locator("[role=list][aria-label], .oak-conversation__content[role=list]").first().getAttribute("aria-busy");
    assert.equal(await busy(), null);
    await page.evaluate(() => window.__oakGallery.sendUser("What else did Steve change?"));
    await page.waitForTimeout(200);
    assert.equal(await busy(), "true");
    await page.evaluate(() => window.__oakGallery.completeAssistant("He changed the handoff notes."));
    await page.waitForTimeout(300);
    assert.equal(await busy(), null);
  } finally {
    await browser.close();
  }
});

test("P1A-G5 a quote chip jumps through the scroller and leaves the live edge alone afterwards", async () => {
  const browser = await chromium.launch();
  try {
    const page = await open(browser, "long-conversation");
    const viewport = page.locator(".oak-conversation__viewport");
    await viewport.evaluate(node => node.scrollTo({ top: 0 }));
    await page.waitForTimeout(300);
    const source = await page.evaluate(() => {
      const node = document.querySelector(".oak-turn__answer .oak-answer__point p");
      const text = document.createTreeWalker(node, NodeFilter.SHOW_TEXT).nextNode();
      const range = document.createRange();
      range.setStart(text, 0); range.setEnd(text, Math.min(30, text.textContent.length));
      document.getSelection().removeAllRanges(); document.getSelection().addRange(range);
      return node.closest("[data-message-id]").getAttribute("data-message-id");
    });
    await page.locator(".oak-pick").waitFor({ timeout: 3000 });
    await page.getByRole("toolbar", { name: "Selected text" }).getByRole("button", { name: "Ask about this" }).click();
    const chip = page.locator(".oak-composer .oak-quote-chip .oak-quote-chip__text");
    await chip.waitFor({ timeout: 3000 });
    // A question is on its way, so the scroller is following the live edge when the chip is pressed.
    await page.evaluate(() => window.__oakGallery.sendUser("A question while the quote is staged"));
    await page.waitForTimeout(600);
    await chip.click();
    await page.waitForTimeout(500);
    const offset = () => page.evaluate(id => document.querySelector(`[data-message-id="${CSS.escape(id)}"]`).getBoundingClientRect().top
      - document.querySelector(".oak-conversation__viewport").getBoundingClientRect().top, source);
    const landed = await offset();
    assert.ok(landed >= -2 && landed < 80, `the quoted answer starts at the top of the view (${landed})`);
    // More arrives while it is pending; a released scroller does not pull the view back to the live edge.
    await page.evaluate(() => window.__oakGallery.completeAssistant("An answer that arrives after the jump."));
    await page.waitForTimeout(800);
    assert.ok(Math.abs((await offset()) - landed) < 4, "the view stayed on the quoted answer");
  } finally {
    await browser.close();
  }
});
