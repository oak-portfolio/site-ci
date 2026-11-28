import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

// Ticket 22: Edit on earlier questions can turn on once, at 390 and 1280, its tooltip stays off the header controls and the
// jump-to-latest circle stays off every visible pill, chip, control and text line. Edit is forced on through the gallery.
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const SIZES = [{ width: 390, height: 844 }, { width: 1280, height: 800 }];
const open = async (page, state) => {
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 30000 });
  await page.waitForTimeout(500);
};
const withPage = async (viewport, run, reducedMotion = "no-preference") => {
  const browser = await chromium.launch();
  try { await run(await (await browser.newContext({ viewport, reducedMotion })).newPage()); } finally { await browser.close(); }
};
const meet = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;

/** Puts the question's Edit `offset` px under the transcript's top edge, focuses it and returns the header controls its tooltip covers. */
const tooltipOverHeaderAt = async (page, index, offset) => {
  const edit = page.getByRole("button", { name: /^Edit question/ }).nth(index);
  await edit.evaluate((node, gap) => {
    const viewport = node.closest(".oak-conversation__viewport");
    viewport.scrollTop += node.getBoundingClientRect().top - viewport.getBoundingClientRect().top - gap;
  }, offset);
  await page.waitForTimeout(200);
  await page.evaluate(() => document.activeElement?.blur());
  await page.waitForFunction(() => !document.querySelector(".ui-tooltip-content"));
  await page.keyboard.press("Shift");
  await edit.focus();
  await page.locator(".ui-tooltip-content[data-open]").filter({ hasText: "Edit question" }).waitFor();
  await page.waitForTimeout(300);
  return page.evaluate(() => {
    const tip = document.querySelector(".ui-tooltip-content[data-open]").getBoundingClientRect();
    return [...document.querySelectorAll(".oak-workspace__header :is(button, a, [role=button])")]
      .filter(node => { const box = node.getBoundingClientRect(); return box.width && tip.left < box.right && box.left < tip.right && tip.top < box.bottom && box.top < tip.bottom; })
      .map(node => node.getAttribute("aria-label") ?? node.textContent.trim());
  });
};
/** The worst place is a little under the header: the tooltip still fits above, so it opens up over the header. */
const tooltipOverHeader = async (page, index) => {
  const hits = [];
  for (const offset of [8, 40, 72, 104]) for (const name of await tooltipOverHeaderAt(page, index, offset)) hits.push(`${offset}px: ${name}`);
  return hits;
};

/** Whatever the visitor can see under the jump circle: content drawn where the transcript's bottom fade is not fully clear. */
const underJump = page => page.evaluate(() => {
  const jump = document.querySelector(".oak-conversation__latest:not([data-active=false])");
  if (!jump) return null;
  const box = jump.getBoundingClientRect();
  const viewport = document.querySelector(".oak-conversation__viewport");
  const frame = viewport.getBoundingClientRect();
  const clear = parseFloat(getComputedStyle(viewport).getPropertyValue("--oak-reading-clear")) || 0;
  const drawnBottom = frame.bottom - clear;
  const meet = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
  const hits = [];
  const visible = rect => ({ left: rect.left, right: rect.right, top: Math.max(rect.top, frame.top), bottom: Math.min(rect.bottom, drawnBottom) });
  const content = viewport.querySelector(".oak-conversation__content");
  for (const node of content.querySelectorAll("button, a, [class*=chip], [class*=pill], .oak-answer__sources, .ui-suggestion")) {
    if (meet(visible(node.getBoundingClientRect()), box)) hits.push(`${node.className || node.tagName}`.slice(0, 60));
  }
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    if (!text.textContent.trim()) continue;
    const range = document.createRange();
    range.selectNodeContents(text);
    for (const line of range.getClientRects()) if (meet(visible(line), box)) hits.push(JSON.stringify(text.textContent.trim().slice(0, 40)));
  }
  for (const node of document.querySelectorAll(".oak-composer :is(button, a, textarea, [class*=chip])")) {
    if (meet(node.getBoundingClientRect(), box)) hits.push(`composer ${node.getAttribute("aria-label") ?? node.className}`.slice(0, 60));
  }
  return [...new Set(hits)];
});

for (const size of SIZES) {
  test(`T22-1 at ${size.width}, forced on, no Edit tooltip covers a header control, on the newest or an earlier question`, () => withPage(size, async page => {
    await open(page, "earlier-edit-on");
    const count = await page.getByRole("button", { name: /^Edit question/ }).count();
    assert.equal(count, 3, "every question offers Edit");
    for (let index = 0; index < count; index += 1) assert.deepEqual(await tooltipOverHeader(page, index), [], `question ${index + 1}`);
  }));

  test(`T22-2 at ${size.width}, forced off, the newest question's Edit tooltip covers no header control`, () => withPage(size, async page => {
    await open(page, "earlier-edit-off");
    assert.equal(await page.getByRole("button", { name: /^Edit question/ }).count(), 1);
    assert.deepEqual(await tooltipOverHeader(page, 0), []);
  }));

  test(`T22-3 at ${size.width}, the jump-to-latest circle never sits on a visible pill, chip, control or text line`, () => withPage(size, async page => {
    await open(page, "earlier-edit-on");
    const viewport = page.locator(".oak-conversation__viewport");
    const end = await viewport.evaluate(node => node.scrollHeight - node.clientHeight);
    let checked = 0;
    for (let top = 0; top < end - 80; top += 23) {
      await viewport.evaluate((node, value) => { node.scrollTop = value; }, top);
      await page.waitForTimeout(60);
      const hits = await underJump(page);
      if (hits === null) continue;
      checked += 1;
      assert.deepEqual(hits, [], `scrolled to ${top}`);
    }
    assert.ok(checked >= 3, `the circle showed at ${checked} scroll positions`);
  }, "reduce"));
}

test("T22-4 Edit fills the box from the newest and from an earlier question, and the box takes focus", () => withPage(SIZES[0], async page => {
  await open(page, "earlier-edit-on");
  const questions = (await page.locator(".oak-turn__question .ui-bubble").allTextContents()).map(text => text.trim());
  const edits = page.getByRole("button", { name: /^Edit question/ });
  await edits.last().click();
  assert.equal((await page.locator("#oak-composer-input").inputValue()).trim(), questions.at(-1), "newest");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "oak-composer-input");
  await page.locator("#oak-composer-input").fill("");
  await edits.first().click();
  await page.waitForTimeout(200);
  assert.equal((await page.locator("#oak-composer-input").inputValue()).trim(), questions[0], "earlier");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "oak-composer-input");
}));

test("T22-5 forced on, each earlier question has an \"Edit and ask again from here\" Marker button that opens the same editor; off, none", () => withPage(SIZES[0], async page => {
  await open(page, "earlier-edit-on");
  const markers = page.getByRole("button", { name: "Edit and ask again from here" });
  assert.equal(await markers.count(), 2, "the two earlier questions, not the newest");
  assert.equal(await markers.first().getAttribute("data-slot"), "marker");
  const questions = (await page.locator(".oak-turn__question .ui-bubble").allTextContents()).map(text => text.trim());
  await markers.nth(1).click();
  await page.waitForTimeout(200);
  assert.equal((await page.locator("#oak-composer-input").inputValue()).trim(), questions[1]);
  assert.equal(await page.evaluate(() => document.activeElement?.id), "oak-composer-input");
  assert.match(await page.locator(".oak-turn__edit-note").textContent(), /In the message box\./);
  const overflow = await page.evaluate(() => [...document.querySelectorAll(".oak-turn__edit-again")].filter(node => node.getBoundingClientRect().right > innerWidth + 1).length);
  assert.equal(overflow, 0, "no sideways scroll at 390");
  await open(page, "earlier-edit-off");
  assert.equal(await markers.count(), 0);
}));

const withTouchPage = async (viewport, run) => {
  const browser = await chromium.launch();
  try { await run(await (await browser.newContext({ viewport, hasTouch: true, isMobile: viewport.width < 600 })).newPage()); } finally { await browser.close(); }
};

for (const size of SIZES) {
  test(`T106-1 at ${size.width} with touch, focusing an earlier question's Edit leaves its Marker row uncovered by the tooltip`, () => withTouchPage(size, async page => {
    await open(page, "earlier-edit-on");
    const edits = page.getByRole("button", { name: /^Edit question/ });
    const markers = page.getByRole("button", { name: "Edit and ask again from here" });
    assert.equal(await markers.count(), 2);
    for (let index = 0; index < 2; index += 1) {
      await edits.nth(index).evaluate(node => node.scrollIntoView({ block: "center" }));
      await page.waitForTimeout(200);
      await page.evaluate(() => document.activeElement?.blur());
      await page.waitForFunction(() => !document.querySelector(".ui-tooltip-content"));
      await edits.nth(index).focus();
      await page.locator(".ui-tooltip-content[data-open]").filter({ hasText: "Edit question" }).waitFor();
      await page.waitForTimeout(300);
      const tip = await page.locator(".ui-tooltip-content[data-open]").boundingBox();
      const row = await markers.nth(index).boundingBox();
      assert.ok(!meet({ left: tip.x, right: tip.x + tip.width, top: tip.y, bottom: tip.y + tip.height }, { left: row.x, right: row.x + row.width, top: row.y, bottom: row.y + row.height }), `question ${index + 1}: tooltip ${JSON.stringify(tip)} covers the row ${JSON.stringify(row)}`);
    }
  }));

  test(`T106-2 at ${size.width} with touch, a tap in the faded band beside the jump circle opens nothing`, () => withTouchPage(size, async page => {
    await open(page, "earlier-edit-on");
    const viewport = page.locator(".oak-conversation__viewport");
    const end = await viewport.evaluate(node => node.scrollHeight - node.clientHeight);
    let checked = 0;
    for (let top = 0; top < end - 80; top += 37) {
      await viewport.evaluate((node, value) => { node.scrollTop = value; }, top);
      await page.waitForTimeout(80);
      const hit = await page.evaluate(() => {
        const jump = document.querySelector(".oak-conversation__latest:not([data-active=false])");
        if (!jump) return null;
        const box = jump.getBoundingClientRect();
        const clear = parseFloat(getComputedStyle(document.querySelector(".oak-conversation__viewport")).getPropertyValue("--oak-reading-clear")) || 0;
        const frame = document.querySelector(".oak-conversation__viewport").getBoundingClientRect();
        const y = (frame.bottom - clear + box.bottom) / 2 > box.top ? box.top + box.height / 2 : box.top;
        return [box.left - 40, box.right + 40].map(x => {
          const node = document.elementFromPoint(x, y);
          return { x, y, target: node?.closest("button, a, [role=button]")?.getAttribute("aria-label") ?? node?.closest("button, a, [role=button]")?.textContent?.trim().slice(0, 30) ?? null };
        });
      });
      if (!hit) continue;
      checked += 1;
      for (const side of hit) assert.equal(side.target, null, `scrolled to ${top}, a tap at ${side.x},${side.y} reaches "${side.target}"`);
    }
    assert.ok(checked >= 3, `the circle showed at ${checked} scroll positions`);
  }));
}

// Ticket 209: at 390 the earlier question's Edit tooltip flipped right onto the bubble, hiding the question being edited.
const OAK_EDIT_EARLIER_HINT = "Sending asks it again at the end. The answers stay.";
const focusEdit = async (page, index) => {
  const edit = page.getByRole("button", { name: /^Edit question/ }).nth(index);
  await edit.evaluate(node => node.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(200);
  await page.evaluate(() => document.activeElement?.blur());
  await page.waitForFunction(() => !document.querySelector(".ui-tooltip-content"));
  await page.keyboard.press("Shift");
  await edit.focus();
  await page.waitForTimeout(600);
  return edit;
};
/** Every text line in the focused Edit's own question bubble that the button or its open tooltip is drawn over. */
const editOverBubbleText = page => page.evaluate(() => {
  const button = document.activeElement;
  const bubble = button.closest(".oak-turn__question").querySelector(".ui-bubble");
  const tip = document.querySelector(".ui-tooltip-content[data-open]");
  const drawn = [button, tip].filter(Boolean).map(node => node.getBoundingClientRect());
  const meet = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
  const hits = [];
  const walker = document.createTreeWalker(bubble, NodeFilter.SHOW_TEXT);
  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    if (!text.textContent.trim()) continue;
    const range = document.createRange();
    range.selectNodeContents(text);
    for (const line of range.getClientRects()) for (const box of drawn) if (meet(line, box)) hits.push(JSON.stringify(text.textContent.trim().slice(0, 30)));
  }
  return [...new Set(hits)];
});

for (const size of SIZES) for (const touch of [false, true]) {
  test(`T209-1 at ${size.width}${touch ? " with touch" : ""}, an earlier question's focused Edit draws nothing over that question's text`, async () => {
    const browser = await chromium.launch();
    try {
      const page = await (await browser.newContext({ viewport: size, hasTouch: touch, isMobile: touch && size.width < 600 })).newPage();
      await open(page, "earlier-edit-on");
      for (let index = 0; index < 2; index += 1) {
        await focusEdit(page, index);
        assert.deepEqual(await editOverBubbleText(page), [], `question ${index + 1}`);
      }
    } finally { await browser.close(); }
  });
}

test("T209-2 at 390, the hint is still on screen or read with the Edit button, whose name starts \"Edit question\"", () => withPage(SIZES[0], async page => {
  await open(page, "earlier-edit-on");
  const edit = await focusEdit(page, 0);
  const read = await edit.evaluate(node => {
    const described = (node.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean).map(id => document.getElementById(id)?.textContent ?? "").join(" ");
    return { name: node.getAttribute("aria-label") ?? node.textContent.trim(), description: `${node.getAttribute("aria-description") ?? ""} ${described}` };
  });
  assert.match(read.name, /^Edit question/);
  const onScreen = await page.getByText(OAK_EDIT_EARLIER_HINT, { exact: false }).filter({ visible: true }).count();
  assert.ok(onScreen > 0 || `${read.name} ${read.description}`.includes(OAK_EDIT_EARLIER_HINT), JSON.stringify(read));
}));

// Ticket 240: at 390 the newest question's Edit tooltip (the one every visitor has) sat over part of its own bubble.
for (const size of SIZES) for (const state of ["earlier-edit-off", "earlier-edit-on"]) {
  test(`T240-1 at ${size.width}, ${state}, the newest question's focused Edit draws nothing over that question's text`, () => withPage(size, async page => {
    await open(page, state);
    await focusEdit(page, (await page.getByRole("button", { name: /^Edit question/ }).count()) - 1);
    assert.equal(await page.locator(".ui-tooltip-content[data-open]").filter({ hasText: "Edit question" }).count(), 1, "the tooltip is open");
    assert.deepEqual(await editOverBubbleText(page), []);
  }, "reduce"));
}

// Ticket 275: at 390 the newest question has no Marker row under it, so its focused Edit label lay over the answer's first line.
const labelOverAnswerFirstLine = page => page.evaluate(() => {
  const tip = document.querySelector(".ui-tooltip-content[data-open]").getBoundingClientRect();
  const answer = document.activeElement.closest(".ui-message").parentElement.nextElementSibling.querySelector(".ui-message");
  const walker = document.createTreeWalker(answer, NodeFilter.SHOW_TEXT);
  let line = null;
  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    if (!text.textContent.trim() || !text.parentElement.checkVisibility() || text.parentElement.closest(".sr-only")) continue;
    const range = document.createRange();
    range.selectNodeContents(text);
    for (const box of range.getClientRects()) {
      if (!box.width) continue;
      line ??= { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
      if (Math.abs(box.top - line.top) > 4) continue;
      line.left = Math.min(line.left, box.left);
      line.right = Math.max(line.right, box.right);
    }
  }
  const width = Math.max(0, Math.min(tip.right, line.right) - Math.max(tip.left, line.left));
  const height = Math.max(0, Math.min(tip.bottom, line.bottom) - Math.max(tip.top, line.top));
  return Math.round(width * height);
});

for (const state of ["earlier-edit-off", "earlier-edit-on"]) {
  test(`T275-1 at 390, ${state}, the newest question's focused Edit label clears the answer's first line`, () => withPage(SIZES[0], async page => {
    await open(page, state);
    await focusEdit(page, (await page.getByRole("button", { name: /^Edit question/ }).count()) - 1);
    assert.equal(await page.locator(".ui-tooltip-content[data-open]").filter({ hasText: "Edit question" }).count(), 1, "the label is open");
    assert.equal(await labelOverAnswerFirstLine(page), 0, "label and first line overlap in px");
  }, "reduce"));
}
