import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { galleryStates, openState } from "../premium/gallery.mjs";
import { pairwiseViews } from "../../../scripts/quality/quality-bar-core.mjs";

// Ticket 298 (gallery on OAK_GALLERY_URL): a Metric whose sentence opens with its number shows the sentence alone;
// a Metric whose number sits later in its sentence keeps the big number (answer-openui-stats-label-stated).
// Ticket 309: a Metric outside Stats whose sentence states its number and holds every word of its label shows the sentence
// alone too (answer-openui-stats-label-in-sentence, the land-33 rerun); inside Stats every tile keeps its number (ruling 99).
const OPENS = "answer-openui-stats-opening-figure";
const LATER = "answer-openui-stats-label-stated";
const HOLDS = "answer-openui-stats-label-in-sentence";
const words = text => text.replace(/\s+/g, " ").trim();
const turnOf = id => galleryStates.find(state => state.id === id).workspace.messages.find(message => message.ui);
const answerText = page => page.locator(".oak-openui-answer").first().innerText().then(words);

for (const width of [1280, 390]) {
  test(`T298-3 gallery ${width}: the sentence that opens with 8,000 shows alone, and the number reads once`, async () => {
    const browser = await chromium.launch();
    try {
      const page = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage();
      await openState(page, OPENS, { settle: 300 });
      const sentence = turnOf(OPENS).answer.claims.find(claim => claim.id === "claim-2").text;
      assert.equal(await page.locator(".oak-openui__metric, .oak-openui__metric-value").count(), 0, "no stat card, no big number");
      const text = await answerText(page);
      assert.equal(text.split("8,000").length - 1, 1, `8,000 once in "${text.slice(0, 200)}"`);
      assert.ok(!text.includes("Training images"), "no label without its number");
      const drawn = await page.locator(".oak-openui-answer .oak-openui__prose").evaluateAll(els => els.map(el => el.innerText.replace(/\s+/g, " ").trim()));
      assert.ok(drawn.some(line => line.startsWith(sentence)), "the sentence draws as the answer's prose");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "no sideways scroll");
    } finally { await browser.close(); }
  });

  test(`T298-4 gallery ${width}: a number later in its sentence keeps its big number, and the page matches the printer`, async () => {
    const browser = await chromium.launch();
    try {
      const page = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage();
      await openState(page, LATER, { settle: 300 });
      const numbers = await page.locator(".oak-openui__metric-value").evaluateAll(els => els.map(el => ({ text: el.textContent, height: el.getBoundingClientRect().height })));
      assert.deepEqual(numbers.map(item => item.text.startsWith("224x224") || item.text.startsWith("8K")), [true, true]);
      assert.ok(numbers.every(item => item.height > 0), "the big number draws");
      for (const id of [OPENS, LATER]) {
        const { ui, answer } = turnOf(id);
        const { arranged } = pairwiseViews({ ui, answer }, answer.claims);
        await openState(page, id, { settle: 300 });
        const text = await answerText(page);
        for (const value of ["8,000", "224x224", "8K"]) {
          const printed = arranged.split(value).length - 1;
          if (printed) assert.equal(text.split(value).length - 1, printed, `${id} ${width}: "${value}" drawn as often as printed`);
        }
      }
    } finally { await browser.close(); }
  });

  test(`T309-3 gallery ${width}: the rerun Metric whose sentence holds "Training images" and 8K+ shows the sentence alone`, async () => {
    const browser = await chromium.launch();
    try {
      const page = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage();
      await openState(page, HOLDS, { settle: 300 });
      const { answer } = turnOf(HOLDS);
      const sentence = answer.claims.find(claim => claim.id === "claim-1").text;
      assert.equal(await page.locator(".oak-openui__metric, .oak-openui__metric-value").count(), 0, "no stat card, no big number");
      const text = await answerText(page);
      assert.ok(!text.includes("Training images"), "no label heading");
      assert.equal(text.split("8K+").length - 1, answer.acknowledgment.split("8K+").length - 1 + 1, `8K+ once past the gap note in "${text.slice(0, 300)}"`);
      const drawn = await page.locator(".oak-openui-answer .oak-openui__prose").evaluateAll(els => els.map(el => el.innerText.replace(/\s+/g, " ").trim()));
      assert.ok(drawn.some(line => line.startsWith(sentence)), "the sentence draws as the answer's prose");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "no sideways scroll");
    } finally { await browser.close(); }
  });

  test(`T309-4 gallery ${width}: Stats tiles keep their big numbers (ruling 99), and both states match the printer`, async () => {
    const browser = await chromium.launch();
    try {
      const page = await (await browser.newContext({ viewport: { width, height: 900 } })).newPage();
      for (const id of [HOLDS, LATER]) {
        const { ui, answer } = turnOf(id);
        const { arranged } = pairwiseViews({ ui, answer }, answer.claims);
        await openState(page, id, { settle: 300 });
        const numbers = await page.locator(".oak-openui__metric-value").evaluateAll(els => els.map(el => el.textContent));
        assert.deepEqual(numbers, id === LATER ? ["224x224", "8KTraining dataset"] : [], `${id} ${width}: big numbers`);
        assert.equal(/Input size|Training images/.test(arranged), false, `${id}: the printer prints no label the sentence holds`);
        const text = await answerText(page);
        for (const value of ["8K+", "224x224", "8K"]) {
          const printed = arranged.split(value).length - 1;
          if (printed) assert.equal(text.split(value).length - 1, printed, `${id} ${width}: "${value}" drawn as often as printed`);
        }
      }
    } finally { await browser.close(); }
  });
}
