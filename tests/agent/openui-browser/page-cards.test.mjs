import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { openState } from "../premium/gallery.mjs";

// Ticket 41 (gallery on OAK_GALLERY_URL): PageCards opens its first quick look in place, returns focus on Escape, stages Ask without sending.
const sideways = page => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
const STATES = ["page-cards-two", "page-cards-four", "page-cards-look-second", "page-cards-streaming", "page-cards-off", "page-cards-no-cover"];
const isOpen = (page, index) => page.locator(".oak-page-card__head").nth(index).getAttribute("aria-expanded");

async function withPage(options, run) {
  const browser = await chromium.launch();
  try { await run(await (await browser.newContext({ viewport: { width: 1280, height: 900 }, ...options })).newPage()); }
  finally { await browser.close(); }
}

test("gallery: one card per cited page, the first open in place, covers about 180 px, and Open page is a real link", () => withPage({}, async page => {
  for (const [id, cards] of [["page-cards-two", 2], ["page-cards-four", 4]]) {
    await openState(page, id, { settle: 400 });
    assert.equal(await page.locator(".oak-page-card").count(), cards, id);
    assert.equal(await isOpen(page, 0), "true", `${id}: the first card opens by default`);
    assert.equal(await isOpen(page, 1), "false", `${id}: the others stay closed`);
    const cover = await page.locator(".oak-page-card__cover").first().evaluate(node => node.getBoundingClientRect().height);
    assert.ok(cover >= 150 && cover <= 220, `${id}: cover ${Math.round(cover)} px, about 180, not 48`);
  }
  const open = page.locator(".oak-page-card").first().locator(".oak-page-card__look a[href]");
  assert.equal(await open.count(), 1, "Open page is one <a href>");
  assert.match(await open.getAttribute("href"), /\/work\/ecosmartloop\//);
  assert.equal(await page.locator(".oak-page-card__section").first().innerText(), "LEAF Engine classified. Orbi explained.", "the cited section is the page's own title");
}));

test("gallery: closed cards are compact rows with the cover beside the text, and four cards stay short at 1280", () => withPage({}, async page => {
  await openState(page, "page-cards-four", { settle: 400 });
  const layout = await page.evaluate(() => {
    const box = node => node.getBoundingClientRect();
    const closed = [...document.querySelectorAll(".oak-page-card:not([data-open])")].map(card => ({
      height: box(card).height, coverRight: box(card.querySelector(".oak-page-card__cover")).right, textLeft: box(card.querySelector(".oak-page-card__text")).left }));
    return { block: box(document.querySelector(".oak-page-cards")).height, closed };
  });
  assert.equal(layout.closed.length, 3);
  for (const card of layout.closed) {
    assert.ok(card.coverRight <= card.textLeft, "the closed cover sits beside its text");
    assert.ok(card.height <= 160, `closed card ${Math.round(card.height)} px is a compact row`);
  }
  assert.ok(layout.block <= 700, `four cards ${Math.round(layout.block)} px tall at 1280`);
  const pills = await page.locator(".oak-page-card[data-open] .oak-page-card__actions > *").evaluateAll(nodes => nodes.map(node => Math.round(node.getBoundingClientRect().top)));
  assert.equal(new Set(pills).size, 1, `Open page and Ask about this share one row (${pills})`);
}));

test("gallery: Escape on the open card's own header closes its quick look and keeps focus there", () => withPage({}, async page => {
  await openState(page, "page-cards-two", { settle: 400 });
  await page.locator(".oak-page-card__head").first().focus();
  await page.keyboard.press("Escape");
  assert.equal(await isOpen(page, 0), "false", "Escape on the header closes the quick look");
  assert.equal(await page.evaluate(() => document.activeElement === document.querySelector(".oak-page-card__head")), true);
}));

test("gallery: opening another card closes the first, and Escape from inside its quick look returns focus to its card", () => withPage({}, async page => {
  await openState(page, "page-cards-look-second", { settle: 400 });
  assert.equal(await isOpen(page, 0), "false");
  assert.equal(await isOpen(page, 1), "true", "one quick look open at a time");
  await page.locator(".oak-page-card").nth(1).locator(".oak-page-card__ask").focus();
  await page.keyboard.press("Escape");
  assert.equal(await isOpen(page, 1), "false", "Escape closes the quick look");
  assert.equal(await page.evaluate(() => {
    const active = document.activeElement;
    return active?.classList.contains("oak-page-card__head") && active.closest(".oak-page-card") === document.querySelectorAll(".oak-page-card")[1];
  }), true, "focus is back on the second card");
}));

test("gallery: Ask about this stages the quote chip and a prefilled question and sends nothing", () => withPage({}, async page => {
  await openState(page, "page-cards-two", { settle: 400 });
  const asked = () => page.locator("button[aria-label^='Edit question']").count();
  const before = await asked();
  await page.locator(".oak-page-card__ask").first().click();
  await page.waitForTimeout(200);
  assert.equal(await page.locator(".oak-quote-chip").count(), 1, "one quote chip staged");
  assert.match(await page.locator("#oak-composer-input").inputValue(), /^Tell me more about EcoSmartLoop\.$/);
  assert.equal(await page.evaluate(() => document.activeElement?.id), "oak-composer-input");
  assert.equal(await asked(), before, "no new question was sent");
  await page.locator(".oak-page-card__ask").first().click();
  await page.waitForTimeout(200);
  assert.equal(await page.locator(".oak-quote-chip").count(), 1, "a second press adds no duplicate chip");
}));

test("gallery: Ask about this keeps a typed draft and only adds the quote chip", () => withPage({}, async page => {
  await openState(page, "page-cards-two", { settle: 400 });
  await page.locator("#oak-composer-input").fill("my own words");
  await page.locator(".oak-page-card__ask").first().click();
  await page.waitForTimeout(200);
  assert.equal(await page.locator("#oak-composer-input").inputValue(), "my own words");
  assert.equal(await page.locator(".oak-quote-chip").count(), 1);
}));

test("gallery: constant off draws one Source per claim, and the streaming state holds card ghosts", () => withPage({}, async page => {
  await openState(page, "page-cards-off", { settle: 300 });
  assert.equal(await page.locator(".oak-page-cards").count(), 0);
  assert.ok(await page.locator(".oak-openui-source").count() >= 1, "off degrades to Source");
  await openState(page, "page-cards-streaming", { settle: 300 });
  assert.ok(await page.locator(".oak-page-card[data-ghost]").count() >= 1, "pending record facts hold ghosts");
}));

test("gallery: every PageCards state fits 390 with no sideways scroll, and reduced motion stills the panel", () => withPage({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" }, async page => {
  for (const id of STATES) {
    await openState(page, id, { settle: 200 });
    assert.equal(await sideways(page), false, `${id}: no sideways scroll at 390`);
  }
  await openState(page, "page-cards-four", { settle: 200 });
  const duration = await page.locator(".oak-page-card__panel").first().evaluate(node => getComputedStyle(node).transitionDuration);
  assert.ok(duration.split(",").every(part => parseFloat(part) <= 0.001), `no panel motion under reduced motion (${duration})`);
}));

test("gallery: a closed card with no cover starts its text at its own frame pad at 390, with no empty cover gap", () => withPage({ viewport: { width: 390, height: 844 } }, async page => {
  await openState(page, "page-cards-no-cover", { settle: 400 });
  const insets = await page.evaluate(() => {
    const inset = card => card.querySelector(".oak-page-card__text").getBoundingClientRect().left - card.getBoundingClientRect().left;
    const cards = [...document.querySelectorAll(".oak-page-card")];
    const bare = cards.find(card => !card.hasAttribute("data-open") && !card.querySelector(".oak-page-card__cover"));
    const tester = cards[0].parentElement.appendChild(Object.assign(document.createElement("div"), { style: "padding-left:var(--oak-pad-frame)" }));
    const framePad = parseFloat(getComputedStyle(tester).paddingLeft);
    tester.remove();
    return bare ? { framePad, bare: inset(bare) } : null;
  });
  assert.ok(insets, "page-cards-no-cover has a closed card with no cover");
  assert.ok(Math.abs(insets.bare - insets.framePad) <= 1, `no-cover text at ${Math.round(insets.bare)} px, frame pad ${insets.framePad} px`);
}));

test("gallery: a closed card alone on its row spans the row at 1280, in DOM order", () => withPage({}, async page => {
  for (const id of ["page-cards-two", "page-cards-look-second", "page-cards-no-cover"]) {
    await openState(page, id, { settle: 400 });
    const rows = await page.evaluate(() => {
      const grid = document.querySelector(".oak-page-cards__grid").getBoundingClientRect().width;
      const cards = [...document.querySelectorAll(".oak-page-card")].map(card => card.getBoundingClientRect());
      const tops = cards.map(box => Math.round(box.top));
      return { grid, cards: cards.map((box, index) => ({ width: box.width, top: tops[index], alone: tops.filter(top => top === tops[index]).length === 1 })) };
    });
    for (const [index, card] of rows.cards.entries()) {
      if (card.alone) assert.ok(card.width >= rows.grid - 1, `${id}: card ${index + 1} alone on its row is ${Math.round(card.width)} of ${Math.round(rows.grid)} px`);
      if (index) assert.ok(card.top >= rows.cards[index - 1].top, `${id}: card ${index + 1} keeps DOM order`);
    }
  }
}));

test("gallery: a forced long title keeps every closed cover at a capped height", () => withPage({}, async page => {
  await openState(page, "page-cards-four", { settle: 400 });
  const heights = await page.evaluate(async () => {
    document.querySelector(".oak-page-card:not([data-open]) .oak-page-card__title").textContent = "A very long page title ".repeat(12);
    await new Promise(requestAnimationFrame);
    return [...document.querySelectorAll(".oak-page-card:not([data-open]) .oak-page-card__cover")].map(node => node.getBoundingClientRect().height);
  });
  for (const height of heights) assert.ok(height <= 128, `closed cover ${Math.round(height)} px tall with a long title in its row`);
}));
