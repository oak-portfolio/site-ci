import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import { loadTsx } from "./load-tsx.mjs";

const { OakRoleFitReview } = loadTsx("src/components/agent/OakRoleFitReview.tsx");
const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const label = "Visitor-supplied role requirement";
const citation = { documentId: "work:ecosmartloop", passageId: "work:ecosmartloop:p", sectionId: "work:ecosmartloop:s", url: "https://steveoak.com/work/ecosmartloop/" };
const row = (id, status, extra = {}) => ({ id, requirement: { text: `Requirement ${id}`, start: 0, end: 13 }, status,
  evidence: status === "missing-evidence" ? [] : [{ id: `${id}-claim`, text: `Evidence for ${id}`, citations: [citation] }], gap: null, questions: [], ...extra });

test("D41-G1 the role-fit answer is one card of requirement rows with status chips, sourced evidence and a folded gap", async () => {
  // Server render: structure, the hidden visitor label and the disclosure.
  const answer = { kind: "role-fit", knowledgeRevision: "r", contactTopics: ["steve-rates"], rows: [row("a", "demonstrated"),
    row("b", "transferable", { gap: "Public work shows memory design.", questions: ["Which evaluation methods?"] }),
    row("c", "missing-evidence", { gap: "No public case study covers motion." })] };
  const html = renderToStaticMarkup(createElement(OakRoleFitReview, { answer, onContact() {} }));
  // Q07 (intentional update): the card root also carries the shared answer-card shell class.
  assert.equal((html.match(/class="oak-role-review oak-answer-card"/g) ?? []).length, 1, "one card");
  assert.equal((html.match(/class="oak-role-review__row"/g) ?? []).length, 3, "one row per requirement");
  assert.equal((html.match(new RegExp(`<span class="sr-only">${label}: </span>`, "g")) ?? []).length, 3, "visitor label once per row, screen-reader only");
  assert.doesNotMatch(html, /This comparison covers|public work evidence\. Missing/, "no method sentence opens the card");
  for (const id of ["a", "b", "c"]) assert.match(html, new RegExp(`<(h4|h5) class="oak-role-review__requirement"[^>]*><span class="sr-only">${label}: </span>Requirement ${id}</\\1>`), `row ${id} title is the requirement`);
  // R19 (intentional update, Oak review v16): a status is a 32px glyph with its word for assistive technology; only Met draws a check.
  assert.match(html, /<span class="oak-role-review__mark" data-status="demonstrated"><svg data-icon="tick" aria-hidden="true"><\/svg><span class="sr-only">Met<\/span>/);
  assert.match(html, /<span class="oak-role-review__mark" data-status="transferable"><span class="sr-only">Partial<\/span>/);
  assert.match(html, /<span class="oak-role-review__mark" data-status="missing-evidence"><span class="sr-only">Gap<\/span>/);
  // R19: a partial gap and the questions wait behind the row's chevron; Ask Oak about this opens the questions to clarify.
  assert.doesNotMatch(html, /<details/, "the rows open with Base UI Collapsible, not native details");
  assert.equal((html.match(/Ask Oak about this/g) ?? []).length, 1, "only a row with questions offers them");
  assert.match(html, /<strong>Gap: <\/strong>Public work shows memory design\./, "the partial gap is in its row's panel");
  assert.match(html, /<p class="oak-role-review__gap">No public case study covers motion\.<\/p>/, "a gap row states its reason in line");
  // D130 (intentional update): the evidence closes on the inline source chip instead of a numbered pill list.
  assert.match(html, /Evidence for a<\/blockquote><span class="oak-source-chip"/, "evidence sits above its sources");
  assert.match(html, /Contact Steve/);

  // Browser: the gallery card at 1440 by 900.
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${galleryUrl}/__dev/oak-states?state=role-fit-answer`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
    const card = page.locator(".oak-role-review");
    assert.equal(await card.count(), 1);
    const rows = card.locator(".oak-role-review__row");
    // Q07 (intentional update): the gallery adds a long requirement row and groups met rows before gaps.
    assert.equal(await rows.count(), 4);
    const shape = await card.evaluate(element => {
      const style = getComputedStyle(element);
      const rows = [...element.querySelectorAll(".oak-role-review__row")];
      const hidden = [...element.querySelectorAll(".oak-role-review__requirement .sr-only")].map(node => node.getBoundingClientRect());
      const workspace = getComputedStyle(element.closest(".oak-workspace"));
      const chips = rows.map(row => {
        // R14 (intentional update, Oak review v11): the status glyph leads the row on a round tint at the left rail, and the
        // status word sits quietly under the title; the coloured pill at the right is gone.
        // R19 (intentional update, Oak review v16): the 32px glyph leads its requirement; Met is a leaf check, Partial a gold half ring, Gap a dashed ring.
        const chip = row.querySelector(".oak-role-review__mark"), title = row.querySelector(".oak-role-review__requirement");
        const chipBox = chip.getBoundingClientRect(), titleBox = title.getBoundingClientRect();
        return { status: chip.dataset.status, background: getComputedStyle(chip).backgroundColor, icon: chip.dataset.status === "transferable" ? getComputedStyle(chip, "::before").borderTopColor : getComputedStyle(chip).color,
          right: chipBox.right <= titleBox.left + 1, top: Math.abs((chipBox.top + chipBox.bottom) / 2 - (titleBox.top + titleBox.bottom) / 2) <= 16 };
      });
      return { border: style.borderTopWidth, hairlines: rows.slice(1).map(row => getComputedStyle(row).borderTopWidth),
        hidden: hidden.map(box => box.width <= 1 && box.height <= 1), chips,
        leaf: workspace.getPropertyValue("--oak-leaf").trim(), gold: workspace.getPropertyValue("--oak-gold").trim() };
    });
    assert.equal(shape.border, "1px", "the card is framed once");
    // R18 (intentional update, Oak review v15): rows are told apart by 24px of space, not a hairline.
    assert.deepEqual(shape.hairlines, ["0px", "0px", "0px"], "rows carry no border");
    assert.deepEqual(shape.hidden, [true, true, true, true], "visitor label is visually hidden");
    for (const chip of shape.chips) { assert.ok(chip.right && chip.top, `${chip.status} mark leads its requirement on one line`); }
    const [demo, , transfer, missing] = shape.chips; // Q07 (intentional update): two demonstrated rows lead.
    assert.equal(new Set([demo.background, transfer.background, missing.background]).size, 3, "each status has its own chip tint");
    const hex = value => value.replace(/^#/, "").match(/../g).map(part => parseInt(part, 16)).join(", ");
    assert.equal(demo.icon, `rgb(${hex(shape.leaf)})`, "demonstrated icon is leaf");
    assert.equal(transfer.icon, `rgb(${hex(shape.gold)})`, "transferable icon is gold");
    assert.notEqual(missing.icon, demo.icon); assert.notEqual(missing.icon, transfer.icon);

    // R19 (intentional update): the partial gap and its clarifying questions fold behind the row's chevron and Ask Oak about this.
    const gapLine = rows.nth(2).getByText("Public work states what a stronger accuracy claim", { exact: false });
    assert.equal(await gapLine.isVisible(), false, "the gap starts folded");
    const toggle = rows.nth(2).locator(".oak-role-review__toggle");
    assert.equal(await toggle.getAttribute("aria-expanded"), "false");
    await toggle.focus(); await page.keyboard.press("Enter");
    assert.equal(await toggle.getAttribute("aria-expanded"), "true", "the chevron opens from the keyboard");
    assert.notEqual(await toggle.evaluate(node => getComputedStyle(node).outlineStyle), "none", "visible focus ring");
    await page.waitForTimeout(500);
    assert.equal(await gapLine.isVisible(), true, "the gap is in view once opened");
    const question = rows.nth(2).getByText("Which evaluation methods does the team use today?", { exact: false });
    assert.equal(await question.count(), 0, "the questions start closed");
    const ask = rows.nth(2).locator(".oak-role-review__ask-button");
    await ask.focus(); await page.keyboard.press("Enter");
    assert.equal(await question.isVisible(), true, "Ask Oak about this opens the questions to clarify");
    await toggle.focus(); await page.keyboard.press("Enter"); await page.waitForTimeout(500);

    // Every visible text run in the card reaches 4.5:1 against its composited background.
    const ratios = await card.evaluate(element => {
      const probe = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
      const rgba = value => { probe.clearRect(0, 0, 1, 1); probe.fillStyle = "#000"; probe.fillStyle = value; probe.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data; return [r, g, b, a / 255]; };
      const over = (top, bottom) => [0, 1, 2].map(i => top[i] * top[3] + bottom[i] * (1 - top[3])).concat(1);
      const background = node => {
        const layers = [];
        for (let current = node; current; current = current.parentElement) {
          const color = getComputedStyle(current).backgroundColor;
          if (color && color !== "rgba(0, 0, 0, 0)" && color !== "transparent") layers.push(rgba(color));
        }
        return layers.reverse().reduce((base, layer) => over(layer, base), [0, 0, 0, 1]);
      };
      const lum = rgb => { const [r, g, b] = rgb.slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const out = [];
      for (let text = walker.nextNode(); text; text = walker.nextNode()) {
        const node = text.parentElement;
        if (!text.textContent.trim() || node.closest(".sr-only") || !node.getClientRects().length || node.checkVisibility?.() === false) continue;
        const bg = background(node), fg = over(rgba(getComputedStyle(node).color), bg);
        const [hi, lo] = [lum(fg), lum(bg)].sort((x, y) => y - x);
        out.push({ text: text.textContent.trim().slice(0, 40), ratio: (hi + 0.05) / (lo + 0.05) });
      }
      return out;
    });
    assert.ok(ratios.length >= 8, `checked ${ratios.length} text runs`);
    for (const { text, ratio } of ratios) assert.ok(ratio >= 4.5, `"${text}" contrast ${ratio.toFixed(2)}`);
  } finally {
    await browser.close();
  }
});
