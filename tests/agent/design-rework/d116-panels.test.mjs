import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

// D116: panels feel spacious, editable and meaningful. Rendered gallery states at 1440x900.
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const open = async (page, state) => {
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
  await page.waitForTimeout(400);
};
const withPage = async run => {
  const browser = await chromium.launch();
  try { await run(await browser.newPage({ viewport: { width: 1440, height: 900 } })); } finally { await browser.close(); }
};
/** Every text well: a visible frame, a placeholder, and at least 12px between its text and the frame. */
const wells = (page, scope) => page.evaluate(css => [...document.querySelectorAll(`${css} [data-slot="input-group"]`)].map(group => {
  const field = group.querySelector("textarea, input"), style = getComputedStyle(group), inner = getComputedStyle(field);
  const framed = parseFloat(style.borderTopWidth) > 0 || style.backgroundColor !== "rgba(0, 0, 0, 0)";
  const g = group.getBoundingClientRect(), f = field.getBoundingClientRect();
  return { framed, placeholder: field.placeholder, inset: Math.round(f.left - g.left + parseFloat(inner.paddingLeft)),
    label: group.closest('[data-slot="field"]')?.querySelector('[data-slot="field-label"]')?.textContent.trim() ?? "",
    addon: group.querySelector('[data-slot="input-group-addon"]')?.textContent.trim() ?? null };
}), scope);
const hero = page => page.evaluate(() => document.querySelector(".oak-panel-hero [data-pose]")?.dataset.pose);
const icons = (page, css) => page.evaluate(selector => [...document.querySelectorAll(`${selector} svg[data-icon]`)].map(svg => svg.dataset.icon), css);

test("D116-G1 the contact brief's fields are visible wells: label above, placeholder, counter, meaning icons and roomy groups", () => withPage(async page => {
  await open(page, "contact-brief");
  const fields = await wells(page, ".oak-brief-editor");
  assert.equal(fields.length, 3, "goals, constraints and the start-date question each have a well");
  for (const field of fields) {
    assert.ok(field.framed, `${field.label}: the well is visible`);
    assert.ok(field.placeholder.length > 0, `${field.label}: the well shows a placeholder`);
    assert.ok(field.inset >= 12, `${field.label}: text sits at least 12px inside the well (${field.inset}px)`);
    assert.match(field.addon ?? "", /^[\d,]+ \/ [\d,]+$/, `${field.label}: a quiet character counter (${field.addon})`);
  }
  const fieldIcons = await icons(page, ".oak-brief__fields [data-slot='field-label']");
  // D119: constraints moved off "lock", which already meant private scope and reserved credits.
  assert.deepEqual(fieldIcons, ["flag", "filterHorizontal", "calendarCheck"], "each field leads with its meaning");
  assert.ok((await icons(page, ".oak-brief-editor > .ui-button")).includes("mailEdit"), "preparing the brief is a mail being written");
  const gap = await page.evaluate(() => {
    const [a, b] = [...document.querySelectorAll(".oak-brief__fields [data-slot='field']")].map(node => node.getBoundingClientRect());
    return Math.round(b.top - a.bottom);
  });
  assert.ok(gap >= 24, `--space-md between field groups (${gap}px)`);
  // The hero is the mailbox until a draft exists, then Oak sealing the letter.
  assert.equal(await hero(page), "mailbox");
  await page.getByRole("button", { name: "Prepare editable brief" }).click();
  await page.locator("#oak-brief-text").waitFor({ timeout: 3000 });
  await page.waitForTimeout(400);
  assert.equal(await hero(page), "brief-letter", "a prepared brief shows the sealed letter");
}));

test("D116-G2 the role comparison intake uses the same wells, a job-search meaning and the reviewing pose (the answer badge keeps comparing, one picture per state)", () => withPage(async page => {
  await open(page, "role-fit");
  const fields = await wells(page, ".oak-role-intake");
  assert.equal(fields.length, 2, "role description and intent each have a well");
  for (const field of fields) {
    assert.ok(field.framed && field.placeholder.length > 0 && field.inset >= 12, `${field.label}: a framed, roomy well with a placeholder`);
  }
  // D120 (Oak): the counter speaks in characters, beside the paste and sample actions.
  assert.match(fields[0].addon ?? "", /[\d,]+ \/ 4,000 characters/, "the description's limit sits in its well as a counter");
  assert.ok((await icons(page, ".oak-role-intake [data-slot='field-label']")).includes("jobSearch"));
  assert.equal(await page.evaluate(() => document.querySelector(".oak-panel-hero [data-pose]")?.dataset.pose), "reviewing");
}));

test("D116-G3 saved conversations are tappable Item rows with a row menu, and nothing saved is one Empty", () => withPage(async page => {
  await open(page, "saved-list");
  assert.ok((await icons(page, ".oak-saved__toggle")).includes("archive"), "the list is an archive, not a database");
  assert.ok(await page.locator(".oak-saved__terms summary [data-pose='keep-calendar']").count(), "the retention terms lead with the keep calendar");
  const rows = await page.evaluate(() => [...document.querySelectorAll("#oak-saved-conversations [data-slot='item']")].map(row => ({
    dateTile: Boolean(row.querySelector("[data-slot='item-media'], .oak-saved__date")),
    line: row.querySelector("[data-slot='item-description']")?.textContent.trim() ?? "",
    buttons: [...row.querySelectorAll("button")].map(button => button.getAttribute("aria-label")),
  })));
  assert.equal(rows.length, 3);
  for (const row of rows) {
    // Review v4 supersedes D116's date tile: the group header names the day, so a row is its title and one line "<when> · N messages".
    assert.ok(!row.dateTile, "no date tile leads the row");
    assert.match(row.line, /^(.+ · )?\d+ messages$/, `one short line: when and how many messages (${row.line})`);
    assert.equal(row.buttons.length, 2, `the row itself opens, and one menu holds the rest (${row.buttons})`);
    assert.match(row.buttons[0], /^Open conversation from /);
  }
  // Open is the row: a tap near its start or in the empty middle of the row lands on the Open button.
  const hits = await page.evaluate(() => {
    const row = document.querySelector("#oak-saved-conversations [data-slot='item']"), box = row.getBoundingClientRect();
    const at = x => document.elementFromPoint(x, box.top + box.height / 2)?.closest("button")?.getAttribute("aria-label") ?? null;
    return [at(box.left + 24), at(box.left + box.width * 0.6)];
  });
  for (const hit of hits) assert.match(hit ?? "", /^Open conversation from /, "the whole row opens the conversation");

  const more = page.locator("#oak-saved-conversations [data-slot='item']").first().locator("[data-slot='item-actions'] button");
  await more.hover();
  await page.locator(".ui-tooltip-content").filter({ hasText: /actions/i }).first().waitFor({ timeout: 3000 });
  await more.click();
  const menu = page.getByRole("menu");
  await menu.waitFor({ timeout: 3000 });
  // Review v4: the kept-until date moved off the row into its menu, above the two commands.
  assert.match(await menu.locator(".oak-saved__menu-note").innerText(), /^Kept until \w+ \d+$/);
  assert.deepEqual(await menu.getByRole("menuitem").allInnerTexts(), ["Export JSON", "Delete saved conversation"]);
  assert.ok(await page.evaluate(() => Boolean(document.querySelector(".oak-workspace [role='menu']"))), "the menu stays inside the workspace");
  // Keyboard: arrows move between the two commands and Escape hands focus back to the row's trigger. (The gallery has no
  // signed-in account context, so the delete dialog itself is covered by D08-G3's server render, not here.)
  const focused = () => page.evaluate(() => document.activeElement?.textContent);
  await page.keyboard.press("ArrowDown");
  assert.equal(await focused(), "Export JSON");
  await page.keyboard.press("ArrowDown");
  assert.equal(await focused(), "Delete saved conversation");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  assert.equal(await page.getByRole("menu").count(), 0, "Escape closes the menu");
  // The menu hands focus back after its close animation, which can outlast 300ms on a loaded machine.
  await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Conversation actions", null, { timeout: 2000 }).catch(() => {});
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Conversation actions", `focus returns to the trigger (${await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 160))})`);

  await open(page, "saved-empty");
  const empty = await page.evaluate(() => {
    const node = document.querySelector("#oak-saved-conversations [data-slot='empty']");
    return node && { title: node.querySelector("[data-slot='empty-title']")?.textContent, classes: node.className };
  });
  assert.ok(empty, "nothing saved is one Empty");
  assert.equal(empty.title, "No saved conversations yet");
  assert.equal(await hero(page), "empty-chest", "nothing saved keeps the empty chest");
}));

test("D116-G4 documents read as rows in one group: no card inside a card, upload and selected meanings", () => withPage(async page => {
  await open(page, "document-selected");
  const sections = await page.evaluate(() => [...document.querySelectorAll(".oak-documents__section")].map(row => {
    const style = getComputedStyle(row);
    return { side: parseFloat(style.borderLeftWidth), parent: row.parentElement.className, selected: row.hasAttribute("data-selected"),
      checked: row.querySelector(".ui-checkbox")?.hasAttribute("data-checked") ?? false,
      filled: getComputedStyle(row.querySelector(".ui-checkbox")).backgroundColor };
  }));
  assert.ok(sections.length >= 4);
  for (const row of sections) {
    assert.equal(row.side, 0, "a text block is a row, not its own bordered card");
    assert.match(row.parent, /oak-group__body/, "rows share one group");
    // v3 review (intentional update): a selected part is shown by its own filled check, not a second mark beside it.
    assert.equal(row.checked, row.selected, "a selected part's box is checked");
    if (row.selected) assert.notEqual(row.filled, "rgba(0, 0, 0, 0)", "a checked box fills");
  }
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector("article.oak-documents__preview")).borderLeftWidth), "0px",
    "the document is not a bordered card around the group");
  await open(page, "document-upload");
  assert.ok((await icons(page, ".oak-documents__add")).includes("fileUpload"), "adding files reads as an upload");
  assert.equal(await hero(page), "doc-stack", "no documents yet: the hero is the stack of types it takes");
  await open(page, "document-selected");
  assert.notEqual(await hero(page), "doc-stack", "with documents the stack gives way");
}));

test("D116-G5 the empty state's art sits on the panels' soft halo, not a squircle tile", () => withPage(async page => {
  await open(page, "empty");
  const art = await page.evaluate(() => {
    const hero = document.querySelector(".oak-conversation__empty .oak-panel-hero");
    if (!hero) return null;
    const style = getComputedStyle(hero), box = hero.getBoundingClientRect(), title = document.querySelector(".oak-conversation__empty h2").getBoundingClientRect();
    return { pose: hero.querySelector("[data-pose]")?.dataset.pose, border: parseFloat(style.borderTopWidth), round: style.borderRadius, image: style.backgroundImage, gap: Math.round(title.top - box.bottom) };
  });
  assert.ok(art, "the art uses the panel halo");
  assert.equal(art.pose, "greeting");
  assert.equal(art.border, 0, "no tile border");
  assert.match(art.image, /radial-gradient/, "the same soft tinted ground as a panel");
  assert.ok(art.gap >= 16, `room between the art and the greeting (${art.gap}px)`);
}));

test("D116-G6 the sign-in card shows the signing-in art large on the halo", () => withPage(async page => {
  await open(page, "sign-in");
  const art = await page.evaluate(() => {
    const hero = document.querySelector("section.oak-account-intake .oak-panel-hero");
    if (!hero) return null;
    const frame = hero.querySelector(".oak-activity-sprite__frame").getBoundingClientRect();
    return { pose: hero.querySelector("[data-pose]")?.dataset.pose, width: Math.round(hero.getBoundingClientRect().width), frame: Math.round(frame.width),
      empty: Boolean(hero.closest("[data-slot='empty']")), tiles: document.querySelectorAll("section.oak-account-intake .oak-art-tile").length };
  });
  assert.ok(art, "the art sits on the halo");
  assert.equal(art.pose, "signing-in");
  assert.ok(art.width >= 96 && art.frame >= 80, `large art (${art.width}px halo, ${art.frame}px art)`);
  assert.ok(art.empty, "an Empty-style media block");
  assert.equal(art.tiles, 0, "no medium tile left behind");
}));

test("D116-G7 OCR review leads with the scan meaning and stacks its actions full width", () => withPage(async page => {
  await open(page, "ocr-consent");
  assert.ok((await icons(page, ".oak-ocr__header")).includes("scanImage"), "the review is a scan");
  // P12: Gemini reads scans with no consent checkbox (Oak ruled out extra disclosures); Read pages leads with the scan icon.
  assert.ok((await icons(page, ".oak-ocr .oak-documents__actions")).includes("scanImage"), "Read pages is a scan");
  const actions = await page.evaluate(() => {
    const bar = document.querySelector(".oak-ocr .oak-documents__actions"), width = bar.getBoundingClientRect().width;
    const boxes = [...bar.querySelectorAll(".ui-button")].map(button => button.getBoundingClientRect());
    return { width, boxes: boxes.map(box => ({ width: box.width, top: box.top, bottom: box.bottom })) };
  });
  assert.equal(actions.boxes.length, 2);
  for (const box of actions.boxes) assert.ok(Math.abs(box.width - actions.width) <= 1, "each action is full width");
  assert.equal(Math.round(actions.boxes[1].top - actions.boxes[0].bottom), 8, "stacked --space-xs apart");
}));
