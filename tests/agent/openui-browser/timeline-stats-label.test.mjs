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
// Ticket 250 fix round: the same state still streaming, its program cut after the Timeline line so every item is a placeholder.
// Both states pin the rail (timelineLanes false): settled answers draw lanes, which have no rail item to hold still.
const GHOSTED = ["answer-openui-timeline-date-once", "answer-openui-timeline-date-later"];
const ghostStates = () => galleryStates.map(state => !GHOSTED.includes(state.id) ? state : { ...state, workspace: { ...state.workspace,
  messages: state.workspace.messages.map(message => !message.ui ? message
    : { ...message, ui: { ...message.ui, status: "streaming", program: message.ui.program.replace(/(\n\w+ = Timeline\(\[[^\n]*)[\s\S]*$/, "$1") } }) } });
const firstItemBox = page => page.locator(".oak-openui__timeline > li").first().evaluate(item => {
  const top = item.parentElement.getBoundingClientRect().top;
  const sentence = item.querySelector(".oak-openui__timeline-claim, .oak-openui-skel__claim").getBoundingClientRect();
  const node = item.querySelector(".oak-openui__timeline-node, .oak-openui-skel__mark").getBoundingClientRect();
  return { pending: item.hasAttribute("data-pending"), item: item.getBoundingClientRect().top - top, sentence: sentence.top - top, node: node.top - top };
});

for (const width of [1280, 390]) {
  test(`T250-3 gallery ${width}: the first timeline item does not move when its placeholder settles`, async () => {
    const browser = await chromium.launch();
    try {
      const page = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage();
      const ghosts = `export default ${JSON.stringify(ghostStates())};`;
      for (const id of GHOSTED) {
        await page.route(/\/oak-states\.json(\?|$)/, route => route.fulfill({ contentType: "text/javascript", body: ghosts }));
        await openState(page, id, { settle: 300 });
        const ghost = await firstItemBox(page);
        await page.unroute(/\/oak-states\.json(\?|$)/);
        await openState(page, id, { settle: 300 });
        const settled = await firstItemBox(page);
        assert.deepEqual([ghost.pending, settled.pending], [true, false], `${id}: placeholder then settled item`);
        for (const edge of ["item", "sentence", "node"]) {
          assert.ok(Math.abs(settled[edge] - ghost[edge]) <= 1, `${id} ${width}: ${edge} moves ${(settled[edge] - ghost[edge]).toFixed(1)}px on settle`);
        }
      }
    } finally { await browser.close(); }
  });

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

  test(`T250-2 gallery ${width}: a date the sentence states mid-sentence shows once, the node draws, and the page matches the printer`, async () => {
    const id = "answer-openui-timeline-date-later";
    const browser = await chromium.launch();
    try {
      const page = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage();
      const [{ program, claims }] = turns(id);
      const dates = [...program.matchAll(/TimelineItem\("([^"]+)", "([^"]+)"/g)].map(([, date, claim]) => ({ date, claim: claims.find(item => item.id === claim) }));
      const texts = await itemTexts(page, id);
      assert.equal(texts.length, dates.length, "one item per date");
      texts.forEach((text, index) => assert.equal(count(text, dates[index].date), 1, `${width}: "${dates[index].date}" once in "${text.slice(0, 80)}"`));
      const nodes = await page.locator(".oak-openui__timeline-node").evaluateAll(els => els.map(el => el.getBoundingClientRect().height));
      assert.ok(nodes.length === dates.length && nodes.every(height => height > 0), "every rail node draws");
      const view = arrangedView({ ui: { status: "done", program }, answer: {} }, claims).view.split("\n");
      const printed = dates.map(({ claim }) => words((line => line.startsWith("- ") ? line.slice(2) : line.replace(/: (?=[^:]*$)/, " "))(view.find(line => line.endsWith(claim.text)))));
      texts.forEach((text, index) => assert.ok(text.startsWith(printed[index]), `${width}: page "${text.slice(0, 90)}" vs printer "${printed[index].slice(0, 90)}"`));
    } finally { await browser.close(); }
  });
}

test("T213-2 rail: a date the sentence states after its opening words shows once (ticket 250)", () => {
  globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, location: { search: "" }, addEventListener() {}, removeEventListener() {} };
  const flag = loadTsx("src/lib/oakFlags/timelineLanes.ts");
  const { OakArrangedAnswer } = loadTsx("src/components/agent/OakOpenUIAnswer.tsx");
  const { answer, ui } = stateById("answer-openui-settled").workspace.messages.find(message => message.ui);
  flag.forceOakTimelineLanes(false);
  try {
    const html = renderToStaticMarkup(createElement(OakArrangedAnswer, { id: "m1", question: "q", latest: true, answer: { schema: "oak.answer.v1", ...answer }, ui }));
    const dated = [...html.matchAll(/<li class="oak-openui__timeline-item[^"]*"[^>]*>([\s\S]*?)<\/li>/g)].map(match => words(match[1].replace(/<[^>]+>/g, " ")));
    assert.equal(count(dated[0], "September to December 2025"), 1);
  } finally { flag.forceOakTimelineLanes(null); }
});
