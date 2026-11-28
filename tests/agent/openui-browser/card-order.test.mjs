import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import snapshot from "../../../src/data/generated/knowledgeSnapshot.json" with { type: "json" };
import { arrangedView, printerTurn } from "../../../scripts/quality/quality-bar-core.mjs";
import { openState, stateById } from "../premium/gallery.mjs";

// Ticket 214 (gallery on OAK_GALLERY_URL): a card's claim is read before its record row (title, role, dates), the record row drops
// what a sentence about the page already said, and a plan-first ghost draws the same order so nothing jumps when the card settles.
const CARDS = { "answer-openui-project-one": 1, "answer-openui-projects": 2, "answer-openui-roles-three": 3, "answer-openui-projects-five": 5 };
const STACKED = new Set(["answer-openui-projects"]);
const STREAMING = { "answer-openui-project-one-streaming": "answer-openui-project-one", "answer-openui-projects-plan-streaming": "answer-openui-projects",
  "answer-openui-roles-three-streaming": "answer-openui-roles-three", "answer-openui-projects-five-streaming": "answer-openui-projects-five" };
const WIDTHS = [1280, 390];

async function withPage(width, run) {
  const browser = await chromium.launch();
  try { await run(await (await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" })).newPage()); }
  finally { await browser.close(); }
}

/** Every settled card in page order: its kind, where its first claim and its title row sit, and which comes first in the DOM. */
// Ticket 307: beside a Stack a card whose claim names its record has no title row; its cover link, named by the record, stands in.
const cardsOf = page => page.evaluate(() => [...document.querySelectorAll(".oak-openui-card:not([data-pending]), .oak-openui-source:not([data-pending])")].map(card => {
  const cover = card.querySelector("a.oak-openui-card__cover");
  const claim = card.querySelector(".oak-openui-card__lead, .oak-openui-source__excerpt"), title = card.querySelector(".oak-openui-card__title") ?? cover;
  const top = node => node ? Math.round(node.getBoundingClientRect().top) : null;
  const shown = node => {
    if (!node) return "";
    const copy = node.cloneNode(true);
    copy.querySelectorAll(".sr-only, [hidden]").forEach(hidden => hidden.remove());
    document.body.append(copy);
    const text = copy.innerText.trim();
    copy.remove();
    return text;
  };
  return { kind: card.classList.contains("oak-openui-role") ? "Role" : card.classList.contains("oak-openui-source") ? "Source" : "Project",
    claim: top(claim), title: top(title), card: top(card), claimText: claim?.innerText.trim() ?? "", record: shown(card.querySelector(".oak-openui-card__name")),
    cover: Boolean(cover && title === cover), named: title === cover ? cover?.getAttribute("aria-label")?.trim() ?? "" : shown(title),
    domFirst: Boolean(claim && title && claim.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING) };
}));

test("T214-1 on the four card states at 1280 and 390 each card's first claim sits above its title row and comes first in the DOM", async () => {
  for (const width of WIDTHS) await withPage(width, async page => {
    for (const [id, count] of Object.entries(CARDS)) {
      await openState(page, id, { settle: 300 });
      const cards = await cardsOf(page);
      assert.equal(cards.length, count, `${id} at ${width}: ${count} cards`);
      for (const [i, card] of cards.entries()) {
        assert.ok(card.claim !== null && card.title !== null, `${id} at ${width}, card ${i + 1}: a claim and a title row`);
        assert.equal(card.cover, STACKED.has(id), `${id} at ${width}, card ${i + 1}: a cover link stands in for the title row only beside a Stack`);
        if (card.cover) assert.ok(card.named && card.claimText.includes(card.named), `${id} at ${width}, card ${i + 1}: its cover link is named by the record its claim says (${card.named})`);
        assert.ok(card.claim < card.title, `${id} at ${width}, card ${i + 1}: claim top ${card.claim} above title top ${card.title}`);
        assert.ok(card.domFirst, `${id} at ${width}, card ${i + 1}: the claim is read before the title`);
      }
      // Against the root's client width, not the viewport: on Linux the root keeps a 15 px stable scrollbar gutter, so its
      // content is 15 px narrower than its client box (1265 in 1280) and the page still does not scroll sideways.
      const { scroll, client, wide } = await page.evaluate(() => {
        const client = document.documentElement.clientWidth;
        const name = node => `${node.tagName.toLowerCase()}${typeof node.className === "string" && node.className.trim() ? `.${node.className.trim().split(/\s+/).join(".")}` : ""}`;
        const wide = [...document.body.querySelectorAll("*")].filter(node => node.getBoundingClientRect().right > client + 0.5)
          .slice(0, 6).map(node => `${name(node)} ${Math.round(node.getBoundingClientRect().left)}-${Math.round(node.getBoundingClientRect().right)}`);
        return { scroll: document.documentElement.scrollWidth, client, wide };
      });
      assert.ok(scroll <= client, `${id} at ${width}: no sideways scroll (${scroll} wide in ${client}: ${wide.join(", ")})`);
    }
  });
});

test("T214-2 the Role card after a sentence naming the role title and employer shows neither again, keeps its period and still links to its page by name", async () => {
  for (const width of WIDTHS) await withPage(width, async page => {
    await openState(page, "answer-openui-role-employer", { settle: 300 });
    const card = page.locator(".oak-openui-role").first();
    const visible = await card.evaluate(node => {
      const copy = node.cloneNode(true);
      copy.querySelectorAll(".sr-only, [hidden], .oak-source-chip").forEach(hidden => hidden.remove());
      document.body.append(copy);
      const text = copy.innerText;
      copy.remove();
      return text;
    });
    assert.doesNotMatch(visible, /HyperSkalers/, `at ${width}: the employer the sentence names is not printed again\n${visible}`);
    assert.doesNotMatch(visible, /Agentic AI Engineer|Forward Deployed/, `at ${width}: the role title the sentence names is not printed again`);
    assert.match(visible, /2026 \u00b7 4 mos/, `at ${width}: the period (Feb 2026 - May 2026, shown as years and length since R21) stays`);
    const link = card.getByRole("link", { name: /HyperSkalers/ });
    assert.equal(await link.count(), 1, `at ${width}: one link whose accessible name names HyperSkalers`);
    assert.match(await link.getAttribute("href"), /\/work#hyperskalers$/);
  });
});

test("T214-3 with plan-first on, the ghost cards come in the settled order and the first claim moves at most 8 px when the card settles", async () => {
  for (const width of WIDTHS) await withPage(width, async page => {
    for (const [ghostId, settledId] of Object.entries(STREAMING)) {
      await openState(page, ghostId, { settle: 300 });
      const ghost = await page.evaluate(() => {
        const skeletons = [...document.querySelectorAll(".oak-openui-ghost .oak-openui-card[data-pending]")];
        const first = skeletons[0], lead = first?.querySelector("[data-lead]");
        const head = first?.querySelector(".oak-openui-card__head, .oak-openui-role__head");
        const top = node => node ? node.getBoundingClientRect().top : null;
        return { kinds: skeletons.map(node => node.classList.contains("oak-openui-role") ? "Role" : "Project"),
          lead: lead ? top(lead) - top(first) : null, leadAboveHead: Boolean(lead && head && top(lead) < top(head)) };
      });
      await openState(page, settledId, { settle: 300 });
      const settled = (await cardsOf(page)).filter(card => card.kind !== "Source");
      assert.deepEqual(ghost.kinds, settled.map(card => card.kind), `${ghostId} at ${width}: ghost cards in the settled order`);
      assert.ok(ghost.leadAboveHead, `${ghostId} at ${width}: the sentence bars draw above the record bars`);
      const moved = Math.abs(ghost.lead - (settled[0].claim - settled[0].card));
      assert.ok(moved <= 8, `${ghostId} at ${width}: the first claim moves ${Math.round(moved)} px between ghost and settled`);
    }
  });
});

test("T214-5 the gallery's visible order and the pairwise arranged view agree: claim first, record line after, on every card", async () => {
  const id = "answer-openui-projects-five";
  const message = stateById(id).workspace.messages[1];
  const { view } = arrangedView(printerTurn(message), message.answer.claims, { shared: false, tags: false });
  await withPage(1280, async page => {
    await openState(page, id, { settle: 300 });
    const cards = await cardsOf(page);
    for (const [i, card] of cards.entries()) {
      const claim = message.answer.claims.find(c => card.claimText.startsWith(c.text.slice(0, 40)));
      assert.ok(claim, `card ${i + 1}: its lead is one of the answer's claims`);
      const period = snapshot.documents.find(d => d.id === claim.citations[0].documentId).dates.period;
      const row = view.split("\n").find(line => line.includes(claim.text)) ?? "";
      const record = row.slice(row.indexOf(claim.text) + claim.text.length).match(/^ \((.*)\)$/)?.[1] ?? "";
      const printedFirst = record.includes(period);
      assert.equal(card.claim < card.title, printedFirst, `card ${i + 1}: the browser and the arranged view put the claim on the same side of the record`);
      assert.ok(printedFirst, `card ${i + 1}: claim first in both`);
      const fields = text => text.split(/\n| \u00b7 |; /).map(field => field.trim()).filter(Boolean);
      assert.deepEqual(fields(record), fields(card.record), `card ${i + 1}: the printed record line is the record row the visitor sees`);
    }
  });
});
