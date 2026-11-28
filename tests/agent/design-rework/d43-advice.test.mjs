import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import { loadTsx } from "./load-tsx.mjs";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const { OakAdviceAnswer } = loadTsx("src/components/agent/OakAdviceAnswer.tsx");
const { oakMeaningIcons } = loadTsx("src/lib/oakMeaningIcons.ts");
const icons = markup => [...markup.matchAll(/data-icon="([^"]+)"/g)].map(match => match[1]);

test("D43-G1 the advice answer is one proposal card: recommendation, side-by-side lists, a next-step row, a quiet note, pointed evidence and the offer", async () => {
  const cite = slug => ({ documentId: `work:${slug}`, passageId: "p", sectionId: "s", url: `https://steveoak.com/work/${slug}/` });
  const answer = { kind: "advice", scope: "supported-expertise", knowledgeRevision: "r",
    proposal: { recommendation: "Start with retrieval.", assumptions: ["Docs are public.", "Visitors ask how-to questions."], tradeoffs: ["Cheaper to evaluate.", "Cannot take actions."], nextStep: "List the top twenty questions." },
    uncertainty: "General guidance, not a review.", evidence: [{ id: "e1", text: "Steve shipped retrieval first.", citations: [cite("agentic-brain")] }], contactOffer: true };
  const html = renderToStaticMarkup(createElement(OakAdviceAnswer, { answer, contactPreference: "open", onBrief() {}, onDecline() {} }));
  // Q07 (intentional update): the card root also carries the shared answer-card shell class.
  assert.equal(html.match(/class="oak-advice-card oak-answer-card"/g)?.length, 1, "one proposal card");
  const order = ["oak-advice-card__lead", "oak-advice-card__lists", "oak-advice-card__next", "oak-advice-card__note", "oak-advice-card__evidence", "oak-brief-actions"].map(name => html.indexOf(name));
  assert.ok(order.every((at, index) => at > 0 && (index === 0 || at > order[index - 1])), `reading order: ${order}`);
  assert.deepEqual(icons(html).slice(0, 4), ["advice.assumption", "advice.tradeoff", "advice.next-step", "advice.uncertainty"].map(meaning => oakMeaningIcons[meaning]),
    "each part carries its semantic icon");
  // D130 (intentional update): each piece of evidence closes on the inline source chip, not a numbered pill list.
  assert.match(html, /class="oak-answer__point"[^>]*><p[^>]*>Steve shipped retrieval first\.<\/p><span class="oak-source-chip"/, "evidence uses the point anatomy");
  const declined = renderToStaticMarkup(createElement(OakAdviceAnswer, { answer, contactPreference: "declined", onBrief() {}, onDecline() {} }));
  assert.doesNotMatch(declined, /oak-brief-actions/, "a declined offer leaves no actions row");

  const browser = await chromium.launch();
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }]) {
      const page = await browser.newPage({ viewport });
      await page.goto(`${galleryUrl}/__dev/oak-states?state=advice`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
      await page.waitForTimeout(900);
      const where = `${viewport.width}x${viewport.height}`;
      const shape = await page.locator(".oak-advice-card").evaluate(card => {
        const box = node => node.getBoundingClientRect();
        const style = getComputedStyle(card);
        const lists = [...card.querySelectorAll(".oak-advice-card__list")].map(list => ({ top: box(list).top, heading: box(list.querySelector("h4")), items: box(list.querySelector("ul")) }));
        const next = card.querySelector(".oak-advice-card__next");
        return { border: style.borderTopWidth, radius: parseFloat(style.borderTopLeftRadius), lists, nextBg: getComputedStyle(next).backgroundColor,
          cardBg: style.backgroundColor, note: getComputedStyle(card.querySelector(".oak-advice-card__note")).color, lead: getComputedStyle(card.querySelector(".oak-advice-card__lead p")).color };
      });
      assert.equal(shape.border, "1px", `${where}: the card has a boundary`);
      // D121 (intentional update): workspace cards take the 24px sheet corner.
      assert.equal(shape.radius, 48, `${where}: card radius ${shape.radius} (R14 intentional update: the 48px frame step, ticket 25)`);
      assert.equal(shape.lists.length, 2, `${where}: assumptions and tradeoffs`);
      // D130 (intentional update): the lists stack, so each line has the card's full width instead of a cramped column.
      assert.ok(shape.lists[1].top > shape.lists[0].items.bottom, `${where}: tradeoffs follow assumptions`);
      for (const list of shape.lists) assert.ok(list.items.top - list.heading.bottom <= 12, `${where}: a heading sits ${list.items.top - list.heading.bottom}px from its list`);
      assert.notEqual(shape.nextBg, shape.cardBg, `${where}: the next step is a highlighted row`);
      assert.notEqual(shape.note, shape.lead, `${where}: the uncertainty reads quieter than the recommendation`);
      if (viewport.width === 1440) {
        await page.locator(".oak-advice-card").scrollIntoViewIfNeeded();
        await page.locator(".oak-advice-card").screenshot({ path: "/tmp/d43-advice-card-1440x900.png" });
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
