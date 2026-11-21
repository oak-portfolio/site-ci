import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import { loadTsx } from "../design-rework/load-tsx.mjs";
import { openState } from "./gallery.mjs";

// R17 (Oak, review v14, third flag on the role-fit answer: "i still dont like the ui"). The answer is one frame with a lead
// verdict sentence, then a full-width row per requirement. R18 (review v15, fourth flag, intentionally updated here): the
// verdict carries a segmented bar and legend, each row is one column (mark and requirement on one line, then Steve's proof as
// prose with its source), and gaps sit compact under "Not found in what Oak read". This holds that order, that a mark is never
// colour alone, and that rows fit and stack at 1280 and 390.
const { OakRoleFitReview, OakRoleFitSkeleton } = loadTsx("src/components/agent/OakRoleFitReview.tsx");
const citation = { documentId: "work:ecosmartloop", passageId: "work:ecosmartloop:p", sectionId: "work:ecosmartloop:s", url: "https://steveoak.com/work/ecosmartloop/" };
const row = (id, status, gap = null) => ({ id, requirement: { text: `Requirement ${id}`, start: 0, end: 13 }, status,
  evidence: status === "missing-evidence" ? [] : [{ id: `${id}-claim`, text: `Evidence for ${id}`, citations: [citation] }], gap, questions: gap ? [`Question about ${id}`] : [] });
const answer = { kind: "role-fit", knowledgeRevision: "r", contactTopics: [], rows: [row("a", "missing-evidence", "No public case study."), row("b", "transferable", "Memory design, not a formal program."), row("c", "demonstrated"), row("d", "demonstrated")] };
const html = renderToStaticMarkup(createElement(OakRoleFitReview, { answer, onContact() {} }));
const rowsOf = markup => markup.split('<section class="oak-role-review__row"').slice(1);

test("R19 the scorecard leads: ring, verdict, count sentence, legend, then rows run met, partial, gap", () => {
  assert.match(html, /<header class="oak-role-review__verdict"[^>]*><div class="oak-role-review__gauge" aria-hidden="true"><span class="oak-role-review__ring"[^>]*><\/span><span class="oak-role-review__gauge-count">3\/4<\/span><span class="oak-role-review__gauge-label">covered<\/span><\/div>/, "a decorative ring with 3/4 covered");
  assert.match(html, /<h3 class="oak-role-review__verdict-title">Partial match<\/h3><p class="oak-role-review__verdict-sentence">3 of 4 requirements have evidence\.<\/p><dl class="oak-role-review__highlights"><div data-status="demonstrated"><dt>Strongest<\/dt><dd>[^<]+<\/dd><\/div><div data-status="missing-evidence"><dt>Biggest gap<\/dt><dd>[^<]+<\/dd><\/div><\/dl><ul class="oak-role-review__tally" aria-label="Requirements by evidence">/);
  const legend = [...html.matchAll(/<li data-status="([a-z-]+)"><span class="oak-role-review__dot"[^>]*><\/span><span class="oak-role-review__tally-label">(\w+)<\/span><strong>(\d)<\/strong><\/li>/g)].map(match => match.slice(1, 4).join(":"));
  assert.deepEqual(legend, ["demonstrated:Met:2", "transferable:Partial:1", "missing-evidence:Gap:1"], "the legend is the text of the ring");
  assert.ok(html.indexOf("oak-role-review__verdict") < html.indexOf("oak-role-review__row"), "verdict before every row");
  const order = [...html.matchAll(/class="oak-role-review__row" data-status="([a-z-]+)"/g)].map(match => match[1]);
  assert.deepEqual(order, ["demonstrated", "demonstrated", "transferable", "missing-evidence"]);
  assert.equal(order.length, 4, "one row per requirement, no invented rows");
});

test("R19 a row is glyph, then requirement and proof with its source, then a chevron; the gap and Ask Oak wait inside", () => {
  for (const markup of rowsOf(html)) {
    const line = markup.indexOf("oak-role-review__line"), mark = markup.indexOf("oak-role-review__mark"), title = markup.indexOf("oak-role-review__requirement");
    assert.ok(line < mark && mark < title, "glyph before the requirement");
  }
  const [met, , partial, gap] = rowsOf(html);
  assert.match(met, /oak-role-review__requirement[^]*oak-quote[^]*oak-source-chip/, "requirement, proof, then its source chip");
  assert.ok(!/oak-role-review__toggle|oak-role-review__panel/.test(met), "a short met row has nothing to open");
  assert.match(partial, /oak-source-chip[^]*aria-expanded="false"[^>]*aria-label="Show more about this requirement"[^>]*oak-role-review__toggle[^]*<p class="oak-role-review__gap"><strong>Gap: <\/strong>Memory design, not a formal program\./, "a partial row's gap waits behind its chevron");
  assert.match(partial, /oak-role-review__ask-button" aria-expanded="false"><svg[^>]*><\/svg>Ask Oak about this<\/button>/, "the questions open from Ask Oak about this");
  assert.ok(!/Questions to clarify/.test(partial), "the questions stay closed until asked");
  assert.match(gap, /<p class="oak-role-review__gap">No public case study\./, "a gap row states the gap in plain text");
  assert.match(html, /<section class="oak-role-review__absent"[^>]*><h4[^>]*>Not found in what Oak read<\/h4><section class="oak-role-review__row" data-status="missing-evidence"/, "gaps group under one label");
  assert.match(renderToStaticMarkup(createElement(OakRoleFitReview, { answer: { ...answer, rows: [row("z", "missing-evidence")] }, onContact() {} })), /<p class="oak-role-review__gap">Oak found no page that covers this\.<\/p>/, "a gap with no text still says so");
  assert.ok(!/oak-source-chip/.test(gap), "a gap row has no proof to cite");
});

test("R19 every status has a word for assistive technology and a shape for sight, never colour alone", () => {
  const marks = [...html.matchAll(/<span class="oak-role-review__mark" data-status="([a-z-]+)">(<svg data-icon="tick"[^>]*><\/svg>)?<span class="sr-only">([A-Za-z]+)<\/span><\/span>/g)];
  assert.equal(marks.length, 4, "one glyph per row");
  const words = { demonstrated: "Met", transferable: "Partial", "missing-evidence": "Gap" };
  for (const [, status, tick, word] of marks) { assert.equal(word, words[status]); assert.equal(Boolean(tick), status === "demonstrated", "only Met draws a check; Partial and Gap are drawn by their own ring and dash"); }
  assert.equal(new Set(marks.map(match => match[3])).size, 3, "three distinct words");
});

test("R19 the scorecard fits at 1280 and 390: a 120px ring, a 40px pad on desktop and 32px on a phone, glyph left of the text, chevron right, no wells or row borders", async () => {
  const browser = await chromium.launch();
  try {
    for (const [width, height] of [[1280, 1700], [390, 1900]]) {
      const page = await browser.newPage({ viewport: { width, height } });
      await openState(page, "role-fit-answer");
      await page.waitForTimeout(600);
      const result = await page.evaluate(() => {
        const frame = document.querySelector(".oak-role-review");
        const box = frame.getBoundingClientRect();
        const rows = [...frame.querySelectorAll(".oak-role-review__row")].map(node => {
          const rb = node.getBoundingClientRect();
          const mark = node.querySelector(".oak-role-review__mark").getBoundingClientRect(), title = node.querySelector(".oak-role-review__requirement").getBoundingClientRect();
          const quote = node.querySelector(".oak-quote"), toggle = node.querySelector(".oak-role-review__toggle");
          return { markLeads: mark.right <= title.left + 1, glyph: Math.round(mark.width), quoteUnder: !quote || quote.getBoundingClientRect().top >= title.bottom - 1, toggleRight: !toggle || toggle.getBoundingClientRect().left >= title.right - 1,
            border: getComputedStyle(node).borderTopWidth, well: quote ? getComputedStyle(quote).backgroundColor : "rgba(0, 0, 0, 0)", fits: rb.left >= box.left - 1 && rb.right <= box.right + 1 && node.scrollWidth <= node.clientWidth + 1 };
        });
        const ring = frame.querySelector(".oak-role-review__gauge").getBoundingClientRect();
        return { ring: [Math.round(ring.width), Math.round(ring.height)], pad: parseFloat(getComputedStyle(frame).paddingLeft), radius: parseFloat(getComputedStyle(frame).borderTopLeftRadius), overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, frameFits: frame.scrollWidth <= frame.clientWidth + 1, rows };
      });
      assert.equal(result.radius, 48, `${width}: a 48px frame`);
      assert.equal(result.overflow, false, `${width}: no page overflow`);
      assert.equal(result.frameFits, true, `${width}: the frame holds its content`);
      assert.equal(result.rows.length, 4);
      assert.deepEqual(result.ring, [120, 120], `${width}: a 120px ring`);
      assert.equal(result.pad, width >= 1280 ? 40 : 32, `${width}: a 40px pad on desktop, the 32px frame pad on a phone`);
      for (const entry of result.rows) {
        assert.equal(entry.fits, true, `${width}: a row stays inside the frame`);
        assert.equal(entry.glyph, 32, `${width}: a 32px glyph`);
        assert.equal(entry.quoteUnder, true, `${width}: proof under the requirement`);
        assert.equal(entry.markLeads, true, `${width}: the glyph leads its requirement`);
        assert.equal(entry.toggleRight, true, `${width}: the chevron sits at the right`);
        assert.equal(entry.border, "0px", `${width}: no row border`);
        assert.equal(entry.well, "rgba(0, 0, 0, 0)", `${width}: the proof is prose with no well`);
      }
      await page.close();
    }
  } finally { await browser.close(); }
});

test("R19 the reading skeleton draws one row per requirement (at most six) around an indeterminate ring, and says it is busy", () => {
  const rows = count => (renderToStaticMarkup(createElement(OakRoleFitSkeleton, { rows: count })).match(/oak-role-review__row oak-role-review__line/g) ?? []).length;
  assert.deepEqual([rows(1), rows(4), rows(9)], [1, 4, 6]);
  const markup = renderToStaticMarkup(createElement(OakRoleFitSkeleton, { rows: 3 }));
  assert.match(markup, /aria-busy="true"/);
  assert.match(markup, /oak-role-review__gauge" aria-hidden="true"><span class="oak-role-review__spinner"/, "an indeterminate ring, hidden from assistive technology");
  assert.doesNotMatch(markup, /oak-role-review__ring|oak-source-chip/, "no settled arcs or sources while reading");
});

test("R19 a row's chevron opens its whole requirement and proof in place, and Ask Oak about this opens the questions", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 2000 } });
    await openState(page, "role-fit-answer");
    const first = page.locator(".oak-role-review__row").first();
    const measure = () => first.evaluate(node => ({ title: node.querySelector(".oak-role-review__requirement").textContent, quote: node.querySelector(".oak-quote").textContent,
      clamped: getComputedStyle(node.querySelector(".oak-quote")).overflow === "hidden", header: node.closest(".oak-role-review").querySelector(".oak-role-review__verdict").getBoundingClientRect().height }));
    const closed = await measure();
    assert.equal(closed.clamped, true, "collapsed proof is clamped");
    await first.locator(".oak-role-review__toggle").click();
    await page.waitForTimeout(500);
    const open = await measure();
    assert.ok(open.quote.length > closed.quote.length, "the whole quote shows once, in place of the lead");
    assert.equal(open.clamped, false);
    assert.equal(open.header, closed.header, "opening a row never moves the header");
    assert.equal(await first.locator(".oak-role-review__toggle").getAttribute("aria-label"), "Show less about this requirement");
  } finally { await browser.close(); }
});

test("R25 an arranged role card pads one frame step (32px) on a phone, like every other frame", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 1900 } });
    await openState(page, "answer-openui-roles");
    await page.waitForTimeout(600);
    const pad = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector(".oak-openui-role")).paddingLeft));
    assert.equal(pad, 32);
  } finally { await browser.close(); }
});
