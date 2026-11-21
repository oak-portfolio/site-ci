import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

// R12 documents (Oak's round-12 review of document-selected, ocr-consent and the live sample and preview): a clearer file
// card, a part picker that reads at a glance with Select all and Clear and each part's share of one answer, one reading-room
// meter, a calm scan card with one primary action, and a next step in every empty, error, too-long and expired state.
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const open = async (page, state) => {
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 30000 });
  await page.waitForTimeout(400);
};
const withPage = async run => {
  const browser = await chromium.launch();
  try { await run(await browser.newPage({ viewport: { width: 1280, height: 800 } })); } finally { await browser.close(); }
};
const use = page => page.getByRole("button", { name: /^Use selected text/ });

test("R12 a prepared document: file card, picker head, shares and the reading-room meter", () => withPage(async page => {
  await open(page, "document-selected");
  const doc = page.locator(".oak-documents__doc");
  assert.match(await doc.locator(".ui-attachment__description").innerText(), /^DOCX · \d+ words · 4 parts$/);
  assert.match(await doc.locator(".oak-documents__expiry").innerText(), /^Private, readable for \d+ more minutes$/);
  assert.equal(await doc.locator(".oak-documents__count-badge").innerText(), "2 of 4");
  assert.equal(await doc.locator(".oak-documents__picker-head").innerText().then(text => text.includes("Choose what Oak reads")), true);
  const shares = await doc.locator(".oak-documents__tag[data-tone='share']").allInnerTexts();
  assert.equal(shares.length, 4, "every part says its share");
  for (const share of shares) assert.match(share, /^\d+% of one answer$/);
  // The share is announced with the part's checkbox.
  const described = await doc.locator(".oak-documents__section [role='checkbox']").first().getAttribute("aria-describedby");
  assert.match(await page.locator(`[id="${described}"]`).innerText(), /% of one answer/);
  const meter = page.locator(".oak-documents__room [role='meter']");
  assert.match(await meter.getAttribute("aria-label"), /^2 parts selected, \d+% of one answer$/);
  assert.equal(await page.locator(".oak-documents__room").getAttribute("data-tone"), "ready");
  assert.equal(await page.locator(".oak-documents__status").count(), 0, "a ready preview needs no status pill");
  assert.match(await page.locator(".oak-documents p.sr-only[role='status']").innerText(), /Preview ready/, "the phase still reaches screen readers");

  await page.getByRole("button", { name: /^Select every part of/ }).click();
  assert.equal(await doc.locator(".oak-documents__section[data-selected]").count(), 4);
  assert.equal(await doc.locator(".oak-documents__count-badge").innerText(), "All parts");
  assert.equal(await page.getByRole("button", { name: /^Select every part of/ }).isDisabled(), true, "nothing left to select");
  await page.getByRole("button", { name: /^Clear the parts chosen from/ }).click();
  assert.equal(await doc.locator(".oak-documents__section[data-selected]").count(), 0);
  assert.equal(await use(page).isDisabled(), true, "nothing to use");
  assert.equal(await page.locator(".oak-documents__room-count").innerText(), "Nothing selected yet");
  // Keyboard: a part toggles with Space from its checkbox.
  await doc.locator(".oak-documents__section [role='checkbox']").first().focus();
  await page.keyboard.press("Space");
  assert.equal(await doc.locator(".oak-documents__section[data-selected]").count(), 1);
}));

test("R12 a selection over one answer turns the meter gold and holds Use until it fits", () => withPage(async page => {
  await open(page, "document-too-long");
  const room = page.locator(".oak-documents__room");
  assert.equal(await room.getAttribute("data-tone"), "over");
  assert.match(await room.locator(".oak-documents__room-note").innerText(), /more than one answer reads/);
  assert.equal(await use(page).isDisabled(), true);
  const [bar, gold] = await room.evaluate(node => {
    const probe = document.createElement("span"); probe.style.color = "var(--oak-gold)"; node.append(probe);
    const color = getComputedStyle(probe).color; probe.remove();
    return [getComputedStyle(node.querySelector(".ui-meter-bar__indicator")).backgroundColor, color];
  });
  assert.equal(bar, gold, "the bar turns gold, the colour of a real limit");
  // Clearing the long resume brings it back under one answer.
  await page.getByRole("button", { name: "Clear the parts chosen from alex-rivera-resume.pdf" }).click();
  assert.equal(await room.getAttribute("data-tone"), "ready");
  assert.equal(await use(page).isDisabled(), false);
}));

test("R12 expired previews and saved copies stay readable but cannot be chosen or used", () => withPage(async page => {
  await open(page, "document-expired");
  assert.equal(await page.locator(".oak-documents__expiry").getAttribute("data-tone"), "expired");
  assert.equal(await page.locator(".oak-documents__room").count(), 0, "no meter for a preview that cannot be read");
  assert.equal(await use(page).isDisabled(), true);
  assert.equal(await page.locator(".oak-documents__section [role='checkbox'][data-disabled]").count(), await page.locator(".oak-documents__section").count());
  await open(page, "document-restored");
  assert.match(await page.locator(".oak-documents__expiry").innerText(), /Saved copy/);
  assert.match(await page.locator(".oak-documents__doc .ui-attachment__description").innerText(), /^TXT · /);
  assert.equal(await page.locator(".oak-documents__section [role='checkbox'][data-disabled]").count(), await page.locator(".oak-documents__section").count());
  assert.equal(await page.getByRole("button", { name: /^Select every part of/ }).isDisabled(), true);
}));

test("R12 the scan card: two lines, today's pages, one primary; blocked scans offer Paste the text instead", () => withPage(async page => {
  await open(page, "ocr-consent");
  const card = page.locator(".oak-ocr");
  assert.equal(await card.locator("h3").innerText(), "Scanned PDF");
  assert.equal(await card.locator(".oak-ocr__lines p").count(), 2);
  assert.match(await card.locator(".oak-ocr__allowance [role='meter']").getAttribute("aria-label"), /^17 pages of 20 left today\. This PDF uses 3 pages\.$/);
  assert.deepEqual(await card.locator(".oak-documents__actions .ui-button").allInnerTexts(), ["Read 3 pages", "Remove"]);
  assert.equal(await card.locator(".ui-button--primary").count(), 1, "one primary action");

  await open(page, "ocr-too-many");
  assert.equal(await page.locator(".oak-ocr").getAttribute("data-blocked"), "");
  assert.match(await page.locator(".oak-ocr__lead").first().innerText(), /9 pages, and 4 pages are left today/);
  assert.equal(await page.locator(".oak-ocr__allowance").getAttribute("data-tone"), "over");
  await page.getByRole("button", { name: "Paste the text instead" }).click();
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => document.activeElement?.closest(".oak-documents__add") !== null && document.activeElement.tagName), "TEXTAREA", "the paste field takes focus");

  await open(page, "ocr-paused");
  assert.doesNotMatch(await page.locator(".oak-ocr").innerText(), /Oak pays/, "a paused scan never says Oak pays");
  assert.equal(await page.locator(".oak-ocr__allowance").count(), 0);
  assert.equal(await page.getByRole("button", { name: "Paste the text instead" }).count(), 1);
}));

test("R12 empty, chosen and failed files each show one next step", () => withPage(async page => {
  await open(page, "document-upload");
  assert.match(await page.locator(".ui-attachment-dropzone").innerText(), /Drop a resume or job post[\s\S]*TXT, DOCX or PDF · up to 3 files · 20 PDF pages/);
  assert.equal(await page.locator(".oak-documents__add textarea").getAttribute("placeholder"), "Paste a job post, resume or brief");
  assert.equal(await page.getByRole("button", { name: "Try a sample role" }).count(), 1);

  await open(page, "document-staged");
  assert.equal(await page.locator(".oak-documents__status").count(), 0, "the file list and its note say it once");
  assert.equal(await page.locator(".oak-documents__add .ui-attachment").count(), 2);
  assert.equal(await page.getByRole("button", { name: "Prepare selected files" }).count(), 1);

  await open(page, "document-error");
  assert.equal(await page.locator(".oak-documents__status[data-error]").count(), 1);
  assert.equal(await page.getByRole("button", { name: "Retry role-brief.docx" }).count(), 1);
  assert.equal(await page.getByRole("button", { name: "Remove role-brief.docx" }).count(), 1);
  await page.locator(".oak-documents__status").getByRole("button", { name: "Paste the text" }).click();
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => document.activeElement?.tagName), "TEXTAREA", "the next step lands in the paste field");
}));

test("R12 every framed box in the documents states keeps the 16px corner floor or is a capsule", () => withPage(async page => {
  const failures = [];
  for (const state of ["document-upload", "document-staged", "document-error", "document-selected", "document-too-long", "document-expired",
    "document-restored", "ocr-consent", "ocr-too-many", "ocr-paused"]) {
    await open(page, state);
    failures.push(...(await page.evaluate(() => [...document.querySelectorAll(".oak-documents *")].filter(node => {
      const style = getComputedStyle(node), box = node.getBoundingClientRect();
      if (box.width < 40 || box.height < 28 || /checkbox|ui-textarea/.test(String(node.className))) return false;
      // A divider line is not a frame: a box is framed when it draws all four sides (the R11 rule).
      const framed = ["Top", "Right", "Bottom", "Left"].every(side => parseFloat(style[`border${side}Width`]) > 0 && !/rgba\(\d+, \d+, \d+, 0\)/.test(style[`border${side}Color`]));
      const filled = !/rgba\(0, 0, 0, 0\)|transparent/.test(style.backgroundColor);
      if (!framed && !filled) return false;
      const parent = node.parentElement && getComputedStyle(node.parentElement);
      if (parent && /hidden|clip/.test(parent.overflow) && parseFloat(parent.borderTopLeftRadius) >= 16 && !framed) return false;
      const radius = parseFloat(style.borderTopLeftRadius);
      return radius < box.height / 2 - 1 && radius < 16;
    }).map(node => `${String(node.className).split(" ")[0]} ${getComputedStyle(node).borderTopLeftRadius}`))).map(box => `${state}: ${box}`));
  }
  assert.deepEqual([...new Set(failures)], []);
}));
