import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import { loadTsx } from "../design-rework/load-tsx.mjs";
import { openState, stateById } from "../premium/gallery.mjs";

// Ticket 88 (m2 keyboard F1, F2): the meter keeps a visible bar in forced colors, and Compare names each paired cell's column.
const open = async (browser, id, { width, forcedColors = "none" }) => {
  const page = await (await browser.newContext({ viewport: { width, height: 900 }, forcedColors })).newPage();
  await openState(page, id, { settle: 300 });
  return page;
};

test("gallery: in forced colors the meter's track has a border and its fill is Highlight, not background alone", async () => {
  const browser = await chromium.launch();
  try {
    for (const width of [1280, 390]) {
      const page = await open(browser, "answer-openui-meter", { width, forcedColors: "active" });
      const seen = await page.evaluate(() => {
        const probe = document.createElement("i");
        probe.style.cssText = "background-color: Highlight; border-color: CanvasText";
        document.body.append(probe);
        const system = getComputedStyle(probe);
        const expected = { highlight: system.backgroundColor, text: system.borderTopColor };
        probe.remove();
        const style = selector => { const computed = getComputedStyle(document.querySelector(selector)); return { fill: computed.backgroundColor, border: computed.borderTopWidth, edge: computed.borderTopColor }; };
        return { expected, track: style(".oak-openui__meter-track"), fill: style(".oak-openui__meter-fill"), label: document.querySelector(".oak-openui__meter")?.getAttribute("role") ?? document.querySelector("[role=img]")?.getAttribute("aria-label") };
      });
      assert.ok(parseFloat(seen.track.border) >= 1, `${width}: the track has a border (${seen.track.border})`);
      assert.equal(seen.track.edge, seen.expected.text, `${width}: the track border is CanvasText`);
      assert.equal(seen.fill.fill, seen.expected.highlight, `${width}: the fill is Highlight`);
      assert.ok(seen.label, `${width}: the figure keeps its role and label`);
      await page.context().close();
    }
  } finally { await browser.close(); }
});

test("gallery: each paired Compare definition carries its column's name in the accessibility tree, and the header stays hidden", async () => {
  const browser = await chromium.launch();
  try {
    for (const width of [1280, 390]) {
      const page = await open(browser, "answer-openui-compare-paired", { width });
      const names = await page.locator(".oak-openui__compare-head span").evaluateAll(nodes => nodes.map(node => node.textContent).filter(Boolean));
      assert.equal(names.length, 2, `${width}: the header names two columns`);
      assert.equal(await page.locator(".oak-openui__compare-head").getAttribute("aria-hidden"), "true");
      const tree = await page.locator(".oak-openui__compare").ariaSnapshot();
      const cells = tree.split(/^- definition/m).slice(1);
      assert.equal(cells.length, 4, `${width}: two rows, two definitions each`);
      // Chromium puts a space after the out-of-flow label at 1280, so the colon may follow one.
      cells.forEach((cell, index) => assert.match(cell, new RegExp(`text: "?${names[index % 2]} ?: `), `${width}: definition ${index + 1} opens with its column "${names[index % 2]}" and a colon\n${cell}`));
      const named = await page.locator(".oak-openui__compare-row dd").evaluateAll(nodes => nodes.map(node => node.firstElementChild?.className === "oak-openui__compare-col" ? node.firstElementChild.firstChild.textContent : null));
      assert.deepEqual(named, [names[0], names[1], names[0], names[1]], `${width}: the label is the first thing in each cell`);
      await page.context().close();
    }
  } finally { await browser.close(); }
});

test("gallery: outside forced colors the Compare layout at 1280 is unchanged by the labels and 390 does not scroll sideways", async () => {
  const browser = await chromium.launch();
  try {
    const wide = await open(browser, "answer-openui-compare-paired", { width: 1280 });
    const cell = await wide.locator(".oak-openui__compare-row dd").first().evaluate(node => {
      const label = node.querySelector(".oak-openui__compare-col");
      const box = label?.getBoundingClientRect();
      return { label: Boolean(label), width: box?.width, height: box?.height, columns: getComputedStyle(node.parentElement).gridTemplateColumns.split(" ").length };
    });
    assert.equal(cell.label, true);
    assert.ok(cell.width <= 1 && cell.height <= 1, "the label takes no room beside the header at 1280");
    assert.equal(cell.columns, 3);
    const narrow = await open(browser, "answer-openui-compare-paired", { width: 390 });
    assert.equal(await narrow.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
    const shown = await narrow.locator(".oak-openui__compare-col").first().evaluate(node => node.getBoundingClientRect().height);
    assert.ok(shown > 1, "at 390 the header is gone, so the cell shows its column name");
  } finally { await browser.close(); }
});

test("a Compare whose columns are not named adds no header and no column label to any cell", () => {
  globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, location: { search: "" }, addEventListener() {}, removeEventListener() {} };
  const { OakArrangedAnswer } = loadTsx("src/components/agent/OakOpenUIAnswer.tsx");
  const message = stateById("answer-openui-compare-paired").workspace.messages.find(entry => entry.role === "assistant");
  const answer = { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "c", hardPolicyVersion: "h", knowledgeRevision: "k", operations: ["search", "read"], ...message.answer };
  const html = renderToStaticMarkup(createElement(OakArrangedAnswer,
    { id: "m88", answer, ui: { ...message.ui, status: "done" }, question: "q", citationLabels: { knowledgeRevision: "k", documents: [] }, latest: true }));
  assert.match(html, /class="oak-openui__compare"/, "the compare still renders");
  assert.doesNotMatch(html, /oak-openui__compare-head/);
  assert.doesNotMatch(html, /oak-openui__compare-col/);
});
