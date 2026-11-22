import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const open = async (page, state) => {
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
  await page.waitForTimeout(500);
};
const isWhite = value => /rgb\(255, 255, 255\)/.test(value);

test("D62-G1 the brief reads as iOS groups, and chosen options read as chosen (white edge and white mark since D69)", async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
    const page = await context.newPage();
    await open(page, "contact-brief");
    const brief = await page.evaluate(() => {
      const group = document.querySelector(".oak-brief__fields");
      // D116 re-tick: each field is a labelled well (Field + InputGroup); the label and its well share a left edge.
      const rows = [...group.querySelectorAll(".oak-brief__wells > [data-slot='field']")].map(row => ({
        label: Math.round(row.querySelector("label").getBoundingClientRect().left), text: Math.round(row.querySelector("[data-slot='input-group']").getBoundingClientRect().left) }));
      const references = document.querySelector(".oak-brief__references");
      return { rows, footnotes: group.querySelectorAll(":scope > .oak-group__footnote").length,
        refHeader: references?.querySelector(".oak-group__header")?.textContent ?? "", refBody: !!references?.querySelector(".oak-group__body .oak-brief-reference") };
    });
    assert.equal(brief.rows.length, 3, "three fields share one section");
    for (const [index, row] of brief.rows.entries()) assert.ok(Math.abs(row.label - row.text) <= 1, `row ${index + 1}: label and text share a left edge (${row.label} vs ${row.text})`);
    // Q06 (intentional update): the brief's "nothing is sent" fact is now the panel's one returns line, so no footnote repeats it.
    assert.equal(brief.footnotes, 0, "no footnote repeats the panel line");
    assert.match(brief.refHeader, /Public work references\s*\d+ \/ 4/, "references header carries the count");
    assert.ok(brief.refBody, "references sit in the group body");
    // D89: a reference is an iOS checkmark row; tapping it checks it.
    const include = page.locator(".oak-brief-reference__toggle").first();
    await include.click();
    assert.equal(await include.getAttribute("aria-checked"), "true", "a reference toggles on");
    await page.getByRole("button", { name: "Prepare editable brief" }).click();
    await page.locator("#oak-brief-text").waitFor({ timeout: 3000 });
    await page.getByRole("button", { name: "Copy brief" }).click();
    await page.waitForTimeout(300);
    assert.match(await page.evaluate(() => navigator.clipboard.readText()), /Hire a design engineer/, "copy writes the brief");
    assert.match(await page.locator("a", { hasText: "Open email draft" }).getAttribute("href"), /^mailto:/, "the email draft link stays");

    await open(page, "funding");
    // D69: a chosen option is a raised gray card with a light edge and a filled white mark, no gradient.
    const funding = await page.locator(".ui-radio-card[data-checked]").evaluate(node => ({ border: getComputedStyle(node).borderTopColor,
      mark: getComputedStyle(node.querySelector(".ui-radio-card__dot")).backgroundColor, image: getComputedStyle(node.querySelector(".ui-radio-card__dot")).backgroundImage }));
    assert.match(funding.border, /255, 255, 255|srgb 1 1 1/, `funding choice has a light edge (${funding.border})`);
    assert.ok(isWhite(funding.mark), `funding choice mark is filled white (${funding.mark})`);
    assert.equal(funding.image, "none", "no gradient mark");

    await open(page, "account-purpose");
    await page.getByText("Discussing a project").click();
    await page.mouse.move(0, 0);
    await page.waitForTimeout(300);
    const purpose = await page.locator(".ui-questionnaire__choice[data-checked]").evaluate(node => ({ border: getComputedStyle(node).borderTopColor,
      mark: getComputedStyle(node.querySelector(".ui-questionnaire__shortcut")).backgroundColor, image: getComputedStyle(node.querySelector(".ui-questionnaire__shortcut")).backgroundImage }));
    assert.match(purpose.border, /255, 255, 255|srgb 1 1 1/, `purpose choice has a light edge (${purpose.border})`);
    assert.ok(isWhite(purpose.mark), `purpose choice mark is filled white (${purpose.mark})`);
    assert.equal(purpose.image, "none", "no gradient mark");
  } finally {
    await browser.close();
  }
});
