import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");
const open = async (page, state) => {
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
  await page.waitForTimeout(300);
};
const card = page => page.evaluate(() => {
  const cards = [...document.querySelectorAll(".oak-research")];
  const node = cards[0];
  const size = element => element ? parseFloat(getComputedStyle(element).fontSize) : 0;
  return { cards: cards.length, tile: Boolean(node?.querySelector(".oak-research__tile svg, .oak-research__art img")),
    title: size(node?.querySelector(".oak-research__title")), body: size(document.querySelector(".oak-turn__answer .ui-bubble__content p")),
    status: node?.querySelector(".oak-research__status")?.textContent ?? "",
    sources: [...(node?.querySelectorAll(".oak-research__card") ?? [])].map(row => ({
      face: Boolean(row.querySelector(".oak-research__host .oak-source-face")), host: row.querySelector(".oak-research__host")?.textContent,
      excerpt: row.querySelector(".oak-research__excerpt")?.textContent ?? "", date: row.querySelector(".oak-research__meta")?.textContent ?? "",
      opens: row.getAttribute("href") ?? "" })),
    text: node?.textContent ?? "" };
});

test("D86-G1 current public research reads as one card with stacked full-width source rows, and as the same card when unavailable", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await open(page, "research-sources");
    const found = await card(page);
    assert.equal(found.cards, 1, "one research card");
    assert.ok(found.tile, "it leads with a web tile");
    assert.ok(found.title > 0 && found.title <= Math.max(17, found.body * 1.2), `a card-sized title (${found.title}px against body ${found.body}px)`);
    assert.ok(found.status.trim().length > 10, `a status row (${found.status})`);
    // D122: each web row leads with its source face and host instead of a bare number disc.
    // v3 review (intentional update): sources are cards in one sideways row (Perplexity), each opening its page.
    assert.deepEqual(found.sources.map(row => row.face), [true, true], "one card per source, each with its face");
    assert.ok(found.sources.every(row => row.host === "developers.cloudflare.com" && row.excerpt.length > 20 && /Checked/.test(row.date) && row.opens.startsWith("https://developers.cloudflare.com/")),
      "each card shows its host, excerpt and checked date, and opens its page");
    assert.match(found.sources[0].date, /Site date 2026-09-20/, "the provider's date is labelled as the site's");
    assert.match(found.text, /External sources are separate/, "external sources stay separate from Steve's evidence");
    assert.doesNotMatch(found.text, /Checking current public sources with Exa\./, "no provider-named progress line");
    // Review v4 supersedes D86's sideways scroller: each source is its own full-width row, stacked, with nothing to scroll sideways.
    const row = await page.locator(".oak-research__cards").evaluate(node => {
      const cards = [...node.querySelectorAll(".oak-research__card")].map(card => card.getBoundingClientRect()), width = node.getBoundingClientRect().width;
      return { flow: getComputedStyle(node).gridAutoFlow, scroll: node.scrollWidth - node.clientWidth,
        stacked: cards.every((card, index) => !index || card.top >= cards[index - 1].bottom - 1), full: cards.every(card => Math.abs(card.width - width) <= 1) };
    });
    assert.ok(row.flow.startsWith("row") && row.stacked && row.full && row.scroll === 0, `the cards stack as full-width rows (${JSON.stringify(row)})`);
    const preview = await page.locator(".oak-research__excerpt").first().evaluate(node => {
      const style = getComputedStyle(node);
      return { lines: node.getBoundingClientRect().height / parseFloat(style.lineHeight), clamped: node.scrollHeight > node.clientHeight + 1 || ["2", "3"].includes(style.webkitLineClamp) };
    });
    assert.ok(preview.clamped && preview.lines <= 3.5, `an excerpt is a preview of at most 3 lines (${preview.lines.toFixed(1)})`);

    await open(page, "research-unavailable");
    const unavailable = await card(page);
    assert.equal(unavailable.cards, 1, "the same card when research is unavailable");
    assert.ok(unavailable.tile && unavailable.status.trim().length > 10, `with its unavailable status (${unavailable.status})`);
    assert.equal(unavailable.sources.length, 0, "and no source rows");
  } finally {
    await browser.close();
  }
  // The transport's own research strings (did not finish, remain unverified, escaped excerpts) still render word for word.
  const { NODE_TEST_CONTEXT, ...env } = process.env;
  const transport = execFileSync(process.execPath, ["--test", "--test-reporter=tap", "--test-name-pattern", "research", "tests/agent/streaming-transport.test.mjs"], { encoding: "utf8", env });
  assert.match(transport, /# pass 2\n# fail 0/, "the streaming transport research tests pass");
});
