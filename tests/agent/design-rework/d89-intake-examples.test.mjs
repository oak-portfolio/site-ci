import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const open = async (page, state) => {
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
  await page.waitForTimeout(700);
};

test("D89-G1 Project advice, Compare a role and Draft a question offer two or three example rows with icon tiles that fill and focus the field without sending", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    for (const [state, field] of [["advice-intake", "#oak-advice-input"], ["role-fit", "#oak-role-intent"], ["question-draft", "#oak-question-goal"]]) {
      await open(page, state);
      if (state === "role-fit") {
        // Review v4 supersedes D89's always-visible role examples: the job post leads, and the examples and "What would you
        // like to compare?" wait in one collapsed disclosure that opens from its summary.
        const more = page.locator(".oak-workflow details.oak-role-intake__more");
        assert.equal(await more.evaluate(node => node.open), false, "role-fit: the examples start folded away");
        assert.ok(await page.evaluate(() => {
          const post = document.querySelector("#oak-role-description"), disclosure = document.querySelector(".oak-role-intake__more");
          return Boolean(post && disclosure && post.compareDocumentPosition(disclosure) & Node.DOCUMENT_POSITION_FOLLOWING);
        }), "role-fit: the job post field leads the disclosure");
        assert.equal(await more.locator(".oak-examples").count(), 1, "role-fit: the examples live inside the disclosure");
        assert.equal(await more.locator(field).count(), 1, "role-fit: the compare field lives inside the disclosure");
        await more.locator("summary").click();
        await page.waitForTimeout(250);
        assert.equal(await more.evaluate(node => node.open), true, "role-fit: the summary opens it");
      }
      const rows = page.locator(".oak-workflow .oak-examples .ui-suggestion");
      const count = await rows.count();
      assert.ok(count >= 2 && count <= 3, `${state}: two or three examples (${count})`);
      const tiles = await rows.evaluateAll(list => list.map(row => ({ svg: !!row.querySelector(".oak-starter-glyph svg"), tone: row.querySelector(".oak-starter-glyph")?.dataset.tone })));
      assert.ok(tiles.every(tile => tile.svg && tile.tone), `${state}: each example leads with a tinted icon tile`);
      const turns = await page.locator(".oak-turn").count();
      const text = (await rows.nth(1).locator(".ui-suggestion__label").textContent()).trim();
      await rows.nth(1).click();
      await page.waitForTimeout(250);
      assert.equal(await page.locator(field).inputValue(), text, `${state}: the example fills the field`);
      assert.equal(await page.evaluate(() => `#${document.activeElement?.id}`), field, `${state}: and focuses it`);
      assert.equal(await page.locator(".oak-turn").count(), turns, `${state}: nothing is sent`);
      assert.equal(await page.locator(".oak-workflow .oak-examples").count(), 1, `${state}: the panel stays open for editing`);
    }
    // A drafted question takes its topic along with the question.
    assert.equal(await page.locator(".oak-workflow .oak-group__row input").first().inputValue(), "AI agent work");
  } finally {
    await browser.close();
  }
});

// The smallest distance from any words (or a field's text box) inside each row to that row's edges.
const roomInRows = (page, selector) => page.locator(selector).evaluateAll(rows => rows.map(row => {
  const edge = row.getBoundingClientRect(), boxes = [];
  for (const field of row.querySelectorAll("input, textarea")) {
    const box = field.getBoundingClientRect(), style = getComputedStyle(field), px = name => parseFloat(style[name]) || 0;
    boxes.push({ left: box.left + px("paddingLeft") + px("borderLeftWidth"), right: box.right - px("paddingRight") - px("borderRightWidth"),
      top: box.top + px("paddingTop") + px("borderTopWidth"), bottom: box.bottom - px("paddingBottom") - px("borderBottomWidth") });
  }
  const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode, parent = node.parentElement;
    // Text drawn for assistive tech only (sr-only, a quiet counter since D129) takes no visual room.
    if (!node.textContent.trim() || parent.closest("input, textarea, svg, [aria-hidden='true'], .sr-only, [data-quiet]")) continue;
    // Truncated titles clip at their own box, so measure the box rather than the overflowing text run.
    if (getComputedStyle(parent).overflow === "hidden") { boxes.push(parent.getBoundingClientRect()); continue; }
    const range = document.createRange();
    range.selectNodeContents(node);
    boxes.push(...range.getClientRects());
  }
  const gaps = boxes.flatMap(box => [box.left - edge.left, edge.right - box.right, box.top - edge.top, edge.bottom - box.bottom]);
  return { name: row.className, room: Math.round(Math.min(...gaps) * 10) / 10 };
}));

test("D89-G2 the brief's references are checkmark rows, and every row and field in the brief, advice and role panels keeps 12px of room", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await open(page, "contact-brief");
    const row = page.locator(".oak-brief-reference").first(), toggle = row.getByRole("checkbox");
    assert.equal(await page.locator(".oak-brief-reference .ui-button").count(), 0, "no Include buttons");
    assert.equal(await toggle.getAttribute("aria-checked"), "false");
    const check = () => row.locator(".oak-brief-reference__check").evaluate(node => Number(getComputedStyle(node).opacity));
    assert.equal(await check(), 0, "an unchosen row shows no checkmark");
    await toggle.click();
    await page.waitForTimeout(300);
    assert.equal(await toggle.getAttribute("aria-checked"), "true", "tapping the row includes the reference");
    assert.equal(await check(), 1, "and it reads as checked");
    assert.match(await page.locator(".oak-brief__references-head").textContent(), /1 \/ 4/, "the count follows");
    await toggle.click();
    await page.waitForTimeout(300);
    assert.equal(await toggle.getAttribute("aria-checked"), "false", "tapping again removes it");
    const tiles = await page.locator(".oak-brief__fields .oak-group__icon .oak-starter-glyph").evaluateAll(list => list.map(tile => tile.dataset.tone));
    assert.equal(new Set(tiles).size, 3, `brief fields lead with three tinted tiles (${tiles})`);

    // D116 re-tick: fields are wells (ui/input-group); they keep the same 12px of room.
    const rows = ".oak-workflow :is(.oak-group__row, .oak-examples .ui-suggestion, .oak-group__body:not(:has(.oak-group__row)), .ui-input-group)";
    for (const state of ["contact-brief", "advice-intake", "role-fit"]) {
      await open(page, state);
      const rooms = await roomInRows(page, rows);
      assert.ok(rooms.length >= 3, `${state}: rows measured (${rooms.length})`);
      for (const { name, room } of rooms) assert.ok(room >= 11.5, `${state}: ${name} keeps 12px of room (${room}px)`);
    }
  } finally {
    await browser.close();
  }
});
