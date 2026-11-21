import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { loadTsx } from "./load-tsx.mjs";

// D123: "Ask about this" stages the selection as a quote chip in the composer instead of writing it into the draft.
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const read = file => readFileSync(new URL(`../../../${file}`, import.meta.url), "utf8");
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
const open_ = "\u201c", close_ = "\u201d";
// Selects the first `length` characters of the nth answer point, the way a drag would, and returns the selected words.
const select = (page, nth, length) => page.evaluate(([index, count]) => {
  const node = document.querySelectorAll(".oak-turn__answer .oak-answer__point p")[index];
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  const first = walker.nextNode();
  let last = first, total = first.textContent.length;
  while (total < count && walker.nextNode()) { last = walker.currentNode; total += last.textContent.length; }
  const range = document.createRange();
  range.setStart(first, 0);
  range.setEnd(last, Math.max(0, last.textContent.length - Math.max(0, total - count)));
  document.getSelection().removeAllRanges();
  document.getSelection().addRange(range);
  return document.getSelection().toString().replace(/\s+/g, " ").trim();
}, [nth, length]);
const askAbout = async (page, nth, length = 40) => {
  const text = await select(page, nth, length);
  await page.locator(".oak-pick").waitFor({ timeout: 3000 });
  await page.getByRole("toolbar", { name: "Selected text" }).getByRole("button", { name: "Ask about this" }).click();
  return text;
};
const chips = page => page.locator(".oak-composer .oak-quote-chip");
const settle = page => page.waitForTimeout(350);
const curly = text => `${open_}${text}${close_}`;

test("D123-G1 Ask about this adds a quote chip to the composer and leaves the visitor's draft alone", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await open(page, "answer-points");
    await store(page, workspace => workspace.setOakDraft("What did he own?"));
    const before = await page.locator(".oak-turn").count();
    const quoted = await askAbout(page, 0);
    await chips(page).first().waitFor({ timeout: 3000 });
    assert.equal(await chips(page).count(), 1, "one chip");
    assert.equal(await page.locator(".oak-composer textarea").inputValue(), "What did he own?", "the draft holds only what the visitor typed");
    assert.equal(await page.getByRole("group", { name: "Quoted from Oak's answer" }).count(), 1, "the chips sit in a named group");
    assert.equal((await chips(page).first().locator(".oak-quote-chip__text").textContent()).trim(), curly(quoted), "in curly quotes");
    assert.ok(await page.evaluate(() => document.activeElement === document.querySelector(".oak-composer textarea")), "the message box has focus");
    assert.equal(await page.evaluate(() => document.getSelection().isCollapsed), true, "the selection is cleared");
    assert.equal(await page.locator(".oak-turn").count(), before, "nothing was sent");
    // The chip is 32px tall inside the composer, with room on both sides of its words.
    await settle(page);
    const box = await chips(page).first().evaluate(node => {
      const chip = node.getBoundingClientRect(), text = node.querySelector(".oak-quote-chip__text").getBoundingClientRect();
      return { height: chip.height, left: text.left - chip.left, radius: getComputedStyle(node).borderTopLeftRadius };
    });
    assert.equal(Math.round(box.height), 32);
    assert.ok(box.left >= 8, `the words keep clear of the chip's edge (${box.left}px)`);
    assert.equal(box.radius, "16px", "concentric with the 24px composer and its 8px padding");
  } finally {
    await browser.close();
  }
});

test("D123-G2 quotes stack up to three; a fourth is refused calmly", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await open(page, "answer-points");
    for (const [nth, length] of [[0, 30], [1, 30], [0, 60]]) { await askAbout(page, nth, length); await settle(page); }
    assert.equal(await chips(page).count(), 3, "three chips stack");
    await askAbout(page, 0, 20);
    await page.locator("[data-slot='toast'], .ui-toast").filter({ hasText: "Up to 3 quotes. Remove one to add another." }).first().waitFor({ timeout: 3000 });
    await settle(page);
    assert.equal(await chips(page).count(), 3, "the fourth is not added");
    assert.equal(await page.locator(".oak-pick").count(), 0, "the bar leaves");
  } finally {
    await browser.close();
  }
});

test("D123-G3 the remove button and Backspace in an empty message box take a quote away", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await open(page, "answer-points");
    const first = await askAbout(page, 0, 30); await settle(page);
    await askAbout(page, 1, 30); await settle(page);
    const third = await askAbout(page, 0, 60); await settle(page);
    const texts = () => chips(page).locator(".oak-quote-chip__text").allTextContents();
    await chips(page).nth(1).getByRole("button", { name: "Remove quote" }).click();
    await settle(page);
    assert.deepEqual(await texts(), [curly(first), curly(third)], "the pressed chip goes, the rest stay in order");
    await page.locator(".oak-composer textarea").fill("hi");
    await page.locator(".oak-composer textarea").press("End");
    await page.keyboard.press("Backspace");
    await settle(page);
    assert.equal(await chips(page).count(), 2, "Backspace with words in the box edits the words");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");
    await settle(page);
    assert.deepEqual(await texts(), [curly(first)], "Backspace in the empty box takes the last quote");
    assert.ok(await page.evaluate(() => document.activeElement === document.querySelector(".oak-composer textarea")), "focus stays in the box");
  } finally {
    await browser.close();
  }
});

test("D123-G4 hovering a chip shows the whole quote", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await open(page, "answer-points");
    const quoted = await askAbout(page, 0, 200);
    await settle(page);
    const cut = await chips(page).first().locator(".oak-quote-chip__text").evaluate(node => node.scrollWidth > node.clientWidth);
    assert.ok(cut, "a long quote is cut short on the chip");
    await chips(page).first().locator(".oak-quote-chip__text").hover();
    const tip = page.locator(".oak-composer__tooltip").filter({ hasText: quoted.slice(0, 60) });
    await tip.first().waitFor({ timeout: 3000 });
    assert.equal((await tip.first().textContent()).trim(), quoted, "the tooltip has every word");
    await chips(page).first().getByRole("button", { name: "Remove quote" }).hover();
    await page.locator(".oak-composer__tooltip").filter({ hasText: "Remove quote" }).first().waitFor({ timeout: 3000 });
  } finally {
    await browser.close();
  }
});

test("D123-G5 folding quotes into a question never cuts the visitor's words and stays in the contract's limit", () => {
  const { foldOakQuotes } = loadTsx("src/lib/oakQuote.ts");
  const ellipsis = String.fromCharCode(0x2026);
  assert.deepEqual(foldOakQuotes(["one thing", "another"], "Why?", 4000),
    { text: `About ${curly("one thing")}\nAbout ${curly("another")}\n\nWhy?`, quotes: ["one thing", "another"] });
  assert.equal(foldOakQuotes(["just this"], "", 4000).text, `About ${curly("just this")}`, "a quote alone is a question");
  assert.equal(foldOakQuotes([], "Plain", 4000).text, "Plain");
  const typed = "w".repeat(3900);
  const folded = foldOakQuotes(["a".repeat(280), "b".repeat(280), "c".repeat(280)], typed, 4000);
  assert.ok(folded.text.length <= 4000, `within the limit (${folded.text.length})`);
  assert.ok(folded.text.endsWith(typed), "every typed character is sent");
  assert.ok(folded.quotes.length > 0 && folded.quotes.every(quote => quote.endsWith(ellipsis)), "the quotes give way");
  const none = foldOakQuotes(["a".repeat(280)], "w".repeat(3995), 4000);
  assert.equal(none.text, "w".repeat(3995), "no room: the typed words go alone");
  assert.deepEqual(none.quotes, []);
  // The transport contract is unchanged: one text field, the same limit.
  assert.match(read("packages/oak-agent-contracts/src/transport.ts"), /const text = z\.string\(\)\.min\(1\)\.max\(questionMaxCharacters\)/);
});

test("D123-G6 sending folds the quotes into the question, and the sent bubble shows them as read-only chips", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const sent = [];
    await page.route("**/api/oak/chat**", async route => { sent.push(JSON.parse(route.request().postData() ?? "{}")); await route.abort(); });
    await open(page, "answer-points");
    const first = await askAbout(page, 0, 30); await settle(page);
    const second = await askAbout(page, 1, 30); await settle(page);
    await page.locator(".oak-composer textarea").fill("How do these connect?");
    await page.locator(".oak-composer textarea").press("Enter");
    for (const started = Date.now(); !sent.length && Date.now() - started < 5000;) await page.waitForTimeout(25);
    const task = sent[0]?.turn?.task ?? sent[0]?.task;
    assert.equal(task?.kind, "question");
    assert.equal(task?.text, `About ${curly(first)}\nAbout ${curly(second)}\n\nHow do these connect?`, "the quotes lead the question");
    const bubble = page.locator(".ui-message[data-align='end']").last();
    await bubble.locator(".oak-quote-chip").first().waitFor({ timeout: 3000 });
    assert.equal(await bubble.locator(".oak-quote-chip").count(), 2, "the sent bubble shows both quotes");
    assert.equal(await bubble.getByRole("button", { name: "Remove quote" }).count(), 0, "read-only");
    assert.equal((await bubble.locator(".ui-bubble__content").textContent()).trim(), "How do these connect?", "the bubble says only what the visitor typed");
    // A failed send puts the quotes back beside the words.
    await page.waitForFunction(() => document.querySelector(".oak-composer textarea")?.value === "How do these connect?", null, { timeout: 5000 });
    assert.equal(await chips(page).count(), 2, "a failed send restores the quotes beside the draft");
    assert.equal(await store(page, workspace => workspace.getOakWorkspace().messages.at(-2)?.text.startsWith("About ")), true,
      "history keeps the full question the model read");
  } finally {
    await browser.close();
  }
});

test("D123-G7 with reduced motion a chip only fades; the gallery shows two stacked quotes", async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    await open(page, "answer-points");
    await select(page, 0, 30);
    await page.locator(".oak-pick").waitFor({ timeout: 3000 });
    await page.evaluate(() => {
      window.__transforms = [];
      const watch = () => {
        for (const chip of document.querySelectorAll(".oak-quote-chip")) window.__transforms.push(chip.style.transform || "none");
        if (window.__transforms.length < 40) requestAnimationFrame(watch);
      };
      requestAnimationFrame(watch);
    });
    await page.getByRole("toolbar", { name: "Selected text" }).getByRole("button", { name: "Ask about this" }).click();
    await settle(page);
    const transforms = await page.evaluate(() => window.__transforms);
    assert.ok(transforms.length > 0, "the chip was watched as it arrived");
    assert.ok(transforms.every(value => !/scale/.test(value)), `no scaling under reduced motion (${[...new Set(transforms)].join(", ")})`);

    await open(page, "quote-chips");
    assert.equal(await chips(page).count(), 2, "the gallery state has two stacked quotes");
    const map = JSON.parse(read("design/visual-integration/oak-agent-assets-v2.json"));
    assert.ok(map.states["quote-chips"], "the asset map lists the state");
  } finally {
    await browser.close();
  }
});

test("D123-G8 the quote chip has its own icon meaning", () => {
  const { oakMeaningIcons } = loadTsx("src/lib/oakMeaningIcons.ts");
  assert.ok(oakMeaningIcons["composer.quote"], "a meaning for staged quotes");
  assert.notEqual(oakMeaningIcons["composer.quote"], oakMeaningIcons["action.copy-with-sources"], "not the copy-with-sources icon");
  assert.match(read("src/components/agent/OakQuoteChip.tsx"), /oakMeaningIcons\["composer\.quote"\]/);
});
