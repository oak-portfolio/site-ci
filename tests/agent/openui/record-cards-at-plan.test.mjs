import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTsx } from "../design-rework/load-tsx.mjs";

// Ticket 169: a plan's Project and Role blocks that name records draw those cards (title, cover, role, dates) before any claim.
globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, location: { search: "" }, addEventListener() {}, removeEventListener() {} };
const flag = loadTsx("src/lib/oakFlags/recordCardsAtPlan.ts");
const planFirst = loadTsx("src/lib/oakFlags/planFirst.ts");
const { oakPlanRecordCards } = loadTsx("src/components/agent/OakRecordOnlyBlocks.tsx");
const { oakPlanLine } = loadTsx("src/lib/oakOpenUISkeletons.ts");
const { OakArrangedAnswer } = loadTsx("src/components/agent/OakOpenUIAnswer.tsx");

const labels = { knowledgeRevision: "rev-169", documents: [
  { documentId: "experience:fixture-lab", title: "Fixture Lab role page", canonicalUrl: "/about#fixture-lab",
    card: { kind: "role", title: "Design Engineer", place: "Fixture Lab", period: "Jan 2024 - Mar 2025", image: "/fixture-role.webp", imageRatio: 1.9 } },
  { documentId: "work:fixture-app", title: "Fixture App: a long page title", canonicalUrl: "/work/fixture-app", cover: "/fixture-cover.webp",
    card: { kind: "work", title: "Fixture App", role: "Lead engineer", period: "2025", stack: ["Astro"], metrics: [{ label: "Users", value: "CLAIM 9,000" }] } },
] };
const plan = (records) => ({ blocks: [{ kind: "Prose", count: 1 }, { kind: "Role", count: 1, ...(records ? { records: ["experience:fixture-lab"] } : {}) },
  { kind: "Project", count: 1, ...(records ? { records: ["work:fixture-app"] } : {}) }, { kind: "Points", count: 2 }] });
const pending = (value) => renderToStaticMarkup(createElement(OakArrangedAnswer, { id: "t169", answer: null, ui: null, question: "q", citationLabels: labels, latest: true, plan: value, pending: true }));

test("a plan-time card carries only record fields: title, cover, role, dates", () => {
  const cards = oakPlanRecordCards(plan(true).blocks, labels);
  assert.deepEqual([...cards.keys()], [1, 2]);
  assert.deepEqual(cards.get(1), [{ kind: "role", documentId: "experience:fixture-lab", title: "Fixture Lab", image: "/fixture-role.webp", ratio: 1.9, role: "Design Engineer", when: "2024 \u2013 2025 \u00b7 1 yr 3 mos" }]);
  assert.deepEqual(cards.get(2), [{ kind: "project", documentId: "work:fixture-app", title: "Fixture App", image: "/fixture-cover.webp", ratio: undefined, when: "Lead engineer \u00b7 2025" }]);
  for (const drawn of cards.values()) for (const card of drawn) assert.deepEqual(Object.keys(card).filter(key => !["kind", "documentId", "title", "image", "ratio", "role", "when"].includes(key)), []);
  assert.equal(oakPlanRecordCards(plan(false).blocks, labels).size, 0);
  assert.equal(oakPlanRecordCards([{ kind: "Role", count: 1, records: ["experience:unknown"] }], labels).size, 0);
});

test("on: the cards draw in plan order in place of their ghosts, the text ghosts still wait, and no claim text shows", () => {
  planFirst.forceOakPlanFirst(true);
  flag.forceOakRecordCardsAtPlan(true);
  try {
    const html = pending(plan(true));
    assert.match(html, /Fixture Lab/);
    assert.match(html, /Fixture App/);
    assert.doesNotMatch(html, /CLAIM|Fixture App: a long page title|Astro/);
    assert.equal((html.match(/data-plan-card=""/g) ?? []).length, 2);
    assert.ok(html.indexOf('data-ghost="Prose"') < html.indexOf("Fixture Lab"));
    assert.ok(html.indexOf("Fixture Lab") < html.indexOf("Fixture App"));
    assert.ok(html.indexOf("Fixture App") < html.indexOf('data-ghost="Points"'));
    assert.doesNotMatch(html, /data-ghost="(Role|Project)"/);
  } finally { flag.forceOakRecordCardsAtPlan(null); planFirst.forceOakPlanFirst(null); }
});

test("off: a plan naming records draws exactly the ghosts a plan without them draws", () => {
  planFirst.forceOakPlanFirst(true);
  try {
    assert.equal(flag.oakRecordCardsAtPlanOn(), false);
    assert.equal(pending(plan(true)), pending(plan(false)));
    assert.doesNotMatch(pending(plan(true)), /data-plan-card|Fixture/);
  } finally { planFirst.forceOakPlanFirst(null); }
});

// Ticket 221: an overview plan's ProjectWall block draws the wall's own tiles at plan time, so the arranged wall lands on the same grid.
const wallPlan = (records) => ({ blocks: [{ kind: "Prose", count: 1 }, { kind: "Profile", count: 1 }, { kind: "ProjectWall", count: 2, ...(records ? { records: ["work:fixture-app", "experience:fixture-lab"] } : {}) }] });

test("ticket 221: a ProjectWall block's plan-time draw is wall tiles from record fields (title, cover, year), not Project cards", () => {
  const cards = oakPlanRecordCards(wallPlan(true).blocks, labels);
  assert.deepEqual([...cards.keys()], [2]);
  assert.deepEqual(cards.get(2), [{ kind: "tile", documentId: "work:fixture-app", title: "Fixture App", image: "/fixture-cover.webp", ratio: undefined, when: "2025" }]);
  planFirst.forceOakPlanFirst(true);
  flag.forceOakRecordCardsAtPlan(true);
  try {
    const html = pending(wallPlan(true));
    assert.match(html, /class="oak-wall[^"]*"/);
    assert.equal((html.match(/<li class="oak-wall__tile" data-plan-card=""/g) ?? []).length, 1);
    assert.match(html, /oak-wall__title">Fixture App</);
    assert.match(html, /oak-wall__year">2025</);
    assert.doesNotMatch(html, /oak-openui-project|data-ghost="ProjectWall"|CLAIM|Astro|Lead engineer/);
    assert.ok(html.indexOf('data-ghost="Profile"') < html.indexOf("Fixture App"));
  } finally { flag.forceOakRecordCardsAtPlan(null); planFirst.forceOakPlanFirst(null); }
  planFirst.forceOakPlanFirst(true);
  try { assert.equal(pending(wallPlan(true)), pending(wallPlan(false))); } finally { planFirst.forceOakPlanFirst(null); }
});

test("r221b: a plan-time wall tile loads the card-size cover the landed tile shows, and the trail names project tiles", () => {
  const carded = { ...labels, documents: labels.documents.map(entry => entry.card?.kind === "work" ? { ...entry, card: { ...entry.card, image: "/fixture-card-900.webp" } } : entry) };
  assert.equal(oakPlanRecordCards(wallPlan(true).blocks, carded).get(2)[0].image, "/fixture-card-900.webp");
  assert.equal(oakPlanLine(wallPlan(true).blocks), "Planned the answer: a lead, a profile and 2 project tiles");
});

test("ticket 176: the claims-landed lead is a takeaway that names neither employer and cites both roles' passages", () => {
  const states = JSON.parse(readFileSync(new URL("../../../src/data/dev/oak-states/record-cards-at-plan.json", import.meta.url), "utf8"));
  const landed = states.find(state => state.id === "record-cards-at-plan-claims-landed");
  const lead = landed.workspace.messages.find(message => message.role === "assistant").answer.claims[0];
  assert.doesNotMatch(lead.text, /Uhttention|HyperSkalers|moved from/i);
  assert.ok(lead.text.split(/\s+/).length >= 20);
  assert.deepEqual(lead.citations.map(citation => citation.passageId).sort(), ["experience:hyperskalers:passage-002", "experience:uhttention:passage-004"]);
});
