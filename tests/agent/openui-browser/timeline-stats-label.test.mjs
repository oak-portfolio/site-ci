import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import { galleryStates, openState, stateById } from "../premium/gallery.mjs";
import { arrangedView } from "../../../scripts/quality/quality-bar-core.mjs";
import { loadTsx } from "../design-rework/load-tsx.mjs";

// Ticket 213 (gallery on OAK_GALLERY_URL): a timeline date or stat label the sentence already says is not printed twice.
// The date rule is the rail's; answer-openui-timeline-date-once pins the rail, since lanes print no item date.
const STATES = ["answer-openui-timeline-date-once", "answer-openui-stats-label-stated"];
const ITEMS = ".oak-openui__timeline-item, .oak-openui__metric";
const words = text => text.replace(/\s+/g, " ").trim();
const turns = id => galleryStates.find(state => state.id === id).workspace.messages.filter(message => message.ui)
  .map(({ ui, answer }) => ({ program: ui.program, claims: answer.claims }));
const itemTexts = async (page, id) => { await openState(page, id, { settle: 300 }); return (await page.locator(ITEMS).evaluateAll(els => els.map(el => el.innerText))).map(words); };
const count = (text, phrase) => text.toLowerCase().split(phrase.toLowerCase()).length - 1;

for (const width of [1280, 390]) {
  test(`T213-2 gallery ${width}: each item holds its label's words once, the big number draws, the claim is whole`, async () => {
    const browser = await chromium.launch();
    try {
      const page = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage();
      for (const id of STATES) {
        const claims = turns(id).flatMap(turn => turn.claims);
        const labels = turns(id).flatMap(({ program }) => [...program.matchAll(/(?:TimelineItem|Metric)\("([^"]+)"/g)].map(match => match[1]));
        const texts = await itemTexts(page, id);
        assert.equal(texts.length, labels.length, `${id}: one item per label`);
        texts.forEach((text, index) => {
          assert.equal(count(text, labels[index]), 1, `${id} ${width}: "${labels[index]}" once in "${text.slice(0, 80)}"`);
          assert.ok(text.includes(words(claims[index].text)), `${id}: the claim is whole`);
        });
      }
      await openState(page, "answer-openui-stats-label-stated", { settle: 300 });
      const numbers = await page.locator(".oak-openui__metric-value").evaluateAll(els => els.map(el => ({ text: el.textContent, height: el.getBoundingClientRect().height })));
      assert.deepEqual(numbers.map(item => item.text.startsWith("224x224") || item.text.startsWith("8K")), [true, true]);
      assert.ok(numbers.every(item => item.height > 0), "the big number draws");
    } finally { await browser.close(); }
  });

  test(`T213-3 gallery ${width}: the page and arrangedView print the same words`, async () => {
    const browser = await chromium.launch();
    try {
      const page = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage();
      for (const id of STATES) {
        const expected = turns(id).flatMap(({ program, claims }) => {
          const view = arrangedView({ ui: { status: "done", program }, answer: {} }, claims).view.split("\n");
          return claims.map(claim => view.find(line => line.endsWith(claim.text))).map(line => words(line.replace(/^\[big number\] |^- /, "").replace(/: (?=[^:]*$)/, " ")));
        });
        const texts = await itemTexts(page, id);
        assert.equal(texts.length, expected.length, id);
        texts.forEach((text, index) => assert.ok(text.startsWith(expected[index]), `${id} ${width}: page "${text.slice(0, 90)}" vs printer "${expected[index].slice(0, 90)}"`));
      }
    } finally { await browser.close(); }
  });
}

test("T213-2 rail: a date the sentence states after its opening words stays", () => {
  globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, location: { search: "" }, addEventListener() {}, removeEventListener() {} };
  const flag = loadTsx("src/lib/oakFlags/timelineLanes.ts");
  const { OakArrangedAnswer } = loadTsx("src/components/agent/OakOpenUIAnswer.tsx");
  const { answer, ui } = stateById("answer-openui-settled").workspace.messages.find(message => message.ui);
  flag.forceOakTimelineLanes(false);
  try {
    const html = renderToStaticMarkup(createElement(OakArrangedAnswer, { id: "m1", question: "q", latest: true, answer: { schema: "oak.answer.v1", ...answer }, ui }));
    const dated = [...html.matchAll(/<li class="oak-openui__timeline-item[^"]*"[^>]*>([\s\S]*?)<\/li>/g)].map(match => words(match[1].replace(/<[^>]+>/g, " ")));
    assert.equal(count(dated[0], "September to December 2025"), 2);
  } finally { flag.forceOakTimelineLanes(null); }
});
