import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

// D139: Codex review on PR #119 (12a4d64f), three P2s, each with its failing case.
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const run = (page, fn, arg) => page.evaluate(async ([source, value]) => {
  const find = name => performance.getEntriesByType("resource").map(entry => entry.name).find(url => new RegExp(`/${name}\\.ts(\\?|$)`).test(url));
  const modules = { workspace: await import(find("src/lib/oakWorkspace")), research: await import(find("packages/oak-agent-contracts/src/public-research")),
    quote: await import(find("src/lib/oakQuote")) };
  return new Function("m", "value", `return (${source})(m, value);`)(modules, value);
}, [fn.toString(), arg]);
const open = async (page, state) => {
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
  await page.waitForTimeout(300);
};
const withPage = async body => {
  const browser = await chromium.launch();
  try { await body(await browser.newPage({ viewport: { width: 1440, height: 900 } })); } finally { await browser.close(); }
};

test("D139-G1 research consent is judged on the folded question the Worker receives, quote lines included", () => withPage(async page => {
  await open(page, "answer-points");
  const result = await run(page, ({ workspace, research, quote }) => {
    const question = "What is the latest AI SDK streaming guidance?";
    workspace.setOakDraft(question);
    const alone = workspace.getOakResearchNeed();
    workspace.addOakQuote("Steve built the scanner and the mobile shell");
    const state = workspace.getOakWorkspace();
    const folded = quote.foldOakQuotes(state.quotes.map(item => item.text), question, 4000).text;
    return { alone: alone?.topicId ?? null, quoted: workspace.getOakResearchNeed(), worker: research.publicResearchNeed("question", folded) };
  });
  assert.equal(result.alone, "ai-sdk-streaming", "a current-information question alone asks to research");
  assert.deepEqual(result.quoted, result.worker, "with a quote, the browser and the Worker judge the same text");
  assert.equal(result.quoted, null, "a quote naming Steve makes it a portfolio question, as the Worker sees it");
}));

// D139-G2, revised in D140 (Codex review on dbaa6341): reading quotes back from the folded text misread ordinary questions,
// so the quote chips are now kept as data through the saved-chat projection and the sign-in handoff instead.
test("D139-G2 a reopened chat or a sign-in restore keeps a sent question's quote chips and the visitor's own words", () => withPage(async page => {
  await open(page, "answer-points");
  const kept = await page.evaluate(async answer => {
    const find = name => performance.getEntriesByType("resource").map(entry => entry.name).find(url => new RegExp(`/${name}\\.ts(\\?|$)`).test(url));
    const workspace = await import(find("src/lib/oakWorkspace")), handoff = await import(find("src/lib/oakAuthHandoff"));
    const saved = await import(find("src/lib/oakSavedHistoryClient")), output = await import(find("packages/oak-agent-contracts/src/output"));
    const turn = crypto.randomUUID(), quoted = { quotes: ["Clarify the decision and seek a source"], text: "How does that work?" };
    const base = { cards: [], usage: null, state: "complete", page: "/", research: null };
    workspace.setOakWorkspaceFixture({ conversationId: crypto.randomUUID(), messages: [
      { ...base, id: `${turn}:user`, role: "user", answer: null, taskKind: "question", quoted,
        text: `About \u201c${quoted.quotes[0]}\u201d\n\n${quoted.text}` },
      { ...base, id: turn, role: "assistant", text: output.renderOakAnswer(answer), answer }] });
    const state = workspace.getOakWorkspace();
    const projected = saved.projectOakSavedHistory(state);
    handoff.saveOakAuthHandoff(state);
    return { quoted, projected: projected?.messages[0]?.quoted ?? null, handoff: handoff.readOakAuthHandoff()?.messages?.[0]?.quoted ?? null };
  }, JSON.parse(readFileSync(new URL("./fixtures/live-advice-answer.json", import.meta.url), "utf8")));
  assert.deepEqual(kept.projected, kept.quoted, "the saved-chat record keeps the chips and the visitor's words");
  assert.deepEqual(kept.handoff, kept.quoted, "so does the sign-in handoff");
  const bubble = page.locator(".ui-message[data-align='end']").first();
  await bubble.locator(".oak-quote-chip").first().waitFor({ timeout: 3000 });
  assert.equal((await bubble.locator(".ui-bubble__content").innerText()).trim(), "How does that work?", "the bubble holds only the visitor's words");
}));

test("D139-G3 Copy puts exactly the selected text on the clipboard, line breaks included", () => withPage(async page => {
  await open(page, "answer-points");
  await page.evaluate(() => {
    window.__copied = null;
    Object.defineProperty(navigator.clipboard, "writeText", { configurable: true, value: text => { window.__copied = text; return Promise.resolve(); } });
  });
  // Select from the start of the first point to partway into the second: two paragraphs in one answer.
  const selected = await page.evaluate(() => {
    const points = document.querySelectorAll(".oak-turn__answer .oak-answer__point p");
    const first = document.createTreeWalker(points[0], NodeFilter.SHOW_TEXT).nextNode();
    const second = document.createTreeWalker(points[1], NodeFilter.SHOW_TEXT).nextNode();
    const range = document.createRange();
    range.setStart(first, 0); range.setEnd(second, Math.min(20, second.textContent.length));
    document.getSelection().removeAllRanges(); document.getSelection().addRange(range);
    return document.getSelection().toString();
  });
  assert.match(selected, /\n/, "the selection spans a paragraph break");
  await page.locator(".oak-pick").waitFor({ timeout: 3000 });
  await page.getByRole("toolbar", { name: "Selected text" }).getByRole("button", { name: "Copy" }).click();
  await page.waitForFunction(() => window.__copied !== null, null, { timeout: 3000 });
  assert.equal(await page.evaluate(() => window.__copied), selected, "the clipboard holds the selection exactly");
}));
