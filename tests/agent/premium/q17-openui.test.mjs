import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import { loadTsx } from "../design-rework/load-tsx.mjs";
import { galleryStates, openState, stateById } from "./gallery.mjs";

globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, location: { search: "" }, addEventListener() {}, removeEventListener() {} };
const { createParser } = await import("@openuidev/react-lang");
const { oakRenderLibrary } = loadTsx("src/lib/openui.tsx");
const { OakArrangedAnswer, oakOpenUIVerdict, oakOpenUICitedUrl, oakPlacedClaims } = loadTsx("src/components/agent/OakOpenUIAnswer.tsx");
const states = galleryStates;

const open = async (page, state) => {
  await openState(page, state);
  await page.waitForTimeout(300);
};
const withPage = async (run) => {
  const browser = await chromium.launch();
  try { await run(await browser.newPage({ viewport: { width: 1440, height: 900 } })); } finally { await browser.close(); }
};
const stateOf = (id) => stateById(id).workspace.messages.find(message => message.role === "assistant");
const base = { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "c", hardPolicyVersion: "h", knowledgeRevision: "k", operations: ["search", "read"] };
const settled = stateOf("answer-openui-settled");
const answer = { ...base, ...settled.answer };
const render = (ui, value = answer) => renderToStaticMarkup(createElement(OakArrangedAnswer, { id: "m2", answer: value, ui, question: "How do they fit?", latest: true }));
const parse = (program) => createParser(oakRenderLibrary.toJSONSchema(), "Answer").parse(program);
const ids = answer.claims.map(claim => claim.id);
// Ticket 250's rule: a Timeline item is its sentence once, its date inside it, on a rail node; the date is never a second label.
const railItems = html => [...html.matchAll(/<li class="oak-openui__timeline-item">(.*?)<\/li>/g)].map(([, item]) => ({ node: item.includes("oak-openui__timeline-node"), text: item.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim() }));
const assertRail = (html, dates) => {
  const items = railItems(html);
  assert.equal(items.length, dates.length, "one rail item per date");
  assert.doesNotMatch(html, /oak-openui__timeline-date/, "no separate date label");
  dates.forEach((date, index) => {
    assert.ok(items[index].node, `${date}: the rail node draws`);
    assert.equal(items[index].text.split(date).length - 1, 1, `${date}: the date is in its sentence once`);
  });
  assert.deepEqual(items.map(item => dates.findIndex(date => item.text.includes(date))), dates.map((_, index) => index), "items keep their order");
};

/**
 * Programs that have shipped. Saved chats keep them as text, so each must keep parsing with no error and placing every
 * claim: a renamed component, a reordered prop or a removed one breaks this list before it breaks an old answer.
 */
const shipped = [
  // R16: a mid-stream fixture (any id ending in -streaming) holds an unfinished program by design.
  ...states.filter(state => state.id.startsWith("answer-openui-") && state.id !== "answer-openui-fallback" && !state.id.endsWith("-streaming"))
    .map(state => ({ id: state.id, program: stateOf(state.id).ui.program, claims: stateOf(state.id).answer.claims.map(claim => claim.id) })),
  { id: "every-component", claims: ["claim-1", "claim-2", "claim-3", "claim-4", "claim-5", "claim-6", "claim-7", "claim-8"], program: [
    "root = Answer([h, p, pts, st, cmp, m, mt, cl, src, next, offer])", 'h = Heading("What he did")', 'p = Prose("claim-1")',
    'pts = Points(["claim-2"])', 'st = Steps(["claim-3"])', 'cmp = Compare([r])', 'r = CompareRow("React and TypeScript", "claim-4")',
    'm = Metric("Months", "4", "claim-5")', 'mt = Meter("Covered", 40, "claim-6")', 'cl = Callout("claim-7")', 'tl = Timeline([ti])',
    'ti = TimelineItem("2025", "claim-8")', "src = Sources()", 'next = Pills(["What changed?"])', 'offer = Proposal("getAdvice", "Talk through your project")',
  ].join("\n").replace("cl, src", "cl, tl, src") },
];

test("Q17-G4 the island renders the settled layout over the validated claims: every claim once, its dates, Sources and pills", () => {
  const html = render(settled.ui);
  assert.match(html, /class="oak-openui"/);
  assert.match(html, /<h4 class="oak-openui__heading"><span class="oak-openui__heading-mark" aria-hidden="true">.*?<\/span><span class="oak-openui__heading-text">In order<\/span><\/h4>/);
  assertRail(html, ["September to December 2025", "January 30, 2026"]);
  for (const claim of answer.claims) assert.equal(html.split(claim.text.slice(0, 40)).length - 1, 1, `${claim.id} renders exactly once`);
  // Review v5 (intentional update): the one Sources pill sits in the turn's action row (OakTurn), not inside the island.
  assert.doesNotMatch(html, /class="oak-answer__sources-button"/, "the island does not draw a second Sources pill");
  assert.equal(html.match(/class="ui-suggestion"/g)?.length, 2);
  assert.doesNotMatch(html, /class="oak-answer__point"/, "the plain answer is not drawn twice");
});

test("Q17-G4 while the layout streams, claims it has not placed yet stay readable below it, and it is marked busy", () => {
  const html = render(stateOf("answer-openui-streaming").ui);
  assert.match(html, /data-streaming="" aria-busy="true"/);
  assertRail(html, ["September to December 2025"]);
  assert.equal(html.match(/oak-openui__waiting/g)?.length, 2, "claims 2 and 3 wait below the layout");
  for (const claim of answer.claims) assert.ok(html.includes(claim.text.slice(0, 40)), `${claim.id} is on screen while streaming`);
});

test("Q17-G4 a broken, partial or incomplete program is judged for the plain answer, and the fallback state renders it", async () => {
  assert.equal(oakOpenUIVerdict(settled.ui.program, parse(settled.ui.program), ids), null);
  const broken = stateOf("answer-openui-fallback").ui.program;
  assert.equal(oakOpenUIVerdict(broken, parse(broken), ids), "coverage", "a layout that leaves claim-3 out");
  for (const bad of ['root = Answer([a])\na = Nope("claim-1")', "root = Answer([a, b, c])\na = Prose(\"claim-1\")", "hello"])
    assert.equal(oakOpenUIVerdict(bad, parse(bad), ids), "parse", bad);
  assert.match(render({ ...settled.ui, status: "fallback", program: "" }), /class="oak-answer__point"/);
  await withPage(async page => {
    await open(page, "answer-openui-fallback");
    assert.equal(await page.locator(".oak-openui").count(), 0);
    assert.equal(await page.locator(".oak-turn__answer .oak-answer__point").count(), 3);
  });
});

test("Q17-G4 a Metric, Meter or Timeline date shows only when its claim says it; otherwise the claim reads as prose", () => {
  const claims = [{ id: "claim-1", text: "The pilot cut review time by 40% across 3 teams.", citations: answer.claims[0].citations },
    { id: "claim-2", text: "The pilot ran for most of 2025.", citations: answer.claims[1].citations }];
  const value = { ...answer, claims };
  const ok = render({ requestId: "r", status: "done", program: 'root = Answer([m, t])\nm = Metric("Review time", "40%", "claim-1")\nt = Timeline([i])\ni = TimelineItem("2025", "claim-2")' }, value);
  // R19 set the % as a quieter suffix mark beside the number.
  assert.match(ok, /oak-openui__metric-value" aria-hidden="true"><span>40<span class="oak-openui__metric-suffix">%<\/span><\/span>/);
  assertRail(ok, ["2025"]);
  // The program places both claims, so the layout draws instead of falling back to the plain answer.
  const opening = render({ requestId: "r", status: "done", program: 'root = Answer([m, t])\nm = Metric("Review time", "40%", "claim-1")\nt = Timeline([i])\ni = TimelineItem("2025", "claim-2")' }, { ...value, claims: [claims[0], { ...claims[1], text: "It ran in 2025." }] });
  assertRail(opening, ["2025"]);
  const invented = render({ requestId: "r", status: "done", program: 'root = Answer([m, mt, t])\nm = Metric("Review time", "55%", "claim-1")\nmt = Meter("Teams", 75, "claim-1")\nt = Timeline([i])\ni = TimelineItem("2024", "claim-2")' }, value);
  assert.doesNotMatch(invented, /55%|75%|2024/, "no number or date the claim does not state");
  assert.doesNotMatch(invented, /oak-openui__metric-value|oak-openui__meter-track/);
});

test("Q17-G4 a Proposal shows only the app's own next tool for the answer; any other proposal renders nothing", () => {
  const program = 'root = Answer([p, q, r, offer])\np = Prose("claim-1")\nq = Prose("claim-2")\nr = Prose("claim-3")\noffer = Proposal("compareRole", "Compare a role")';
  const ui = { requestId: "r", status: "done", program };
  assert.match(render(ui, { ...answer, nextTool: "role" }), /class="oak-next-step oak-openui__proposal"/);
  for (const nextTool of [undefined, "brief", "advice"]) assert.doesNotMatch(render(ui, { ...answer, nextTool }), /oak-openui__proposal/, String(nextTool));
});

test("Q17-G4 review r5: model words never state a number or a claim id, and every block must be placed exactly once", () => {
  const base3 = 'root = Answer([h, p1, p2, p3, src])\nh = Heading("In order")\np1 = Prose("claim-1")\np2 = Prose("claim-2")\np3 = Prose("claim-3")\nsrc = Sources()';
  assert.equal(oakOpenUIVerdict(base3, parse(base3), ids), null);
  // A heading that states a number shows nothing; a heading that names a claim id fails the layout.
  const numbered = base3.replace('Heading("In order")', 'Heading("Cut costs 40% in 2023")');
  const html = render({ requestId: "r", status: "done", program: numbered });
  assert.doesNotMatch(html, /40%|2023|oak-openui__heading/);
  const hidden = base3.replace('Heading("In order")', 'Heading("claim-3")').replace('p3 = Prose("claim-3")\n', "").replace(", p3", "");
  assert.equal(oakOpenUIVerdict(hidden, parse(hidden), ids), "coverage", "claim-3 only in a heading");
  // Defined but never placed: the parse lists it as orphaned, so the layout falls back (Sources, Pills or Proposal would vanish).
  const orphan = base3.replace(", src])", "])");
  assert.equal(oakOpenUIVerdict(orphan, parse(orphan), ids), "parse");
  const twice = base3.replace('p3 = Prose("claim-3")', 'p3 = Points(["claim-3", "claim-1"])');
  assert.equal(oakOpenUIVerdict(twice, parse(twice), ids), "coverage", "a claim placed twice");
  // Pills with a digit are dropped; the rest stay.
  const pills = base3.replace(", src])", ", src, next])") + '\nnext = Pills(["Why did costs fall 40%?", "What changed for users?"])';
  const pillsHtml = render({ requestId: "r", status: "done", program: pills });
  assert.equal(pillsHtml.match(/class="ui-suggestion"/g)?.length, 1);
  assert.doesNotMatch(pillsHtml, /40%/);
});

test("Q17-G4 review r5: a number or date must be a whole token of its claim, and a proposal wears the app's own title", () => {
  const claims = [{ id: "claim-1", text: "The pilot cut review time by 40% across 3 teams in 2023.", citations: answer.claims[0].citations },
    { id: "claim-2", text: "It covered 14% of tickets.", citations: answer.claims[1].citations },
    { id: "claim-3", text: "The rollout finished in 2023.", citations: answer.claims[2].citations }];
  const value = { ...answer, claims, nextTool: "role" };
  const program = 'root = Answer([m, mt, t, offer])\nm = Metric("Review time", "4", "claim-1")\nmt = Meter("Tickets", 4, "claim-2")\nt = Timeline([i])\ni = TimelineItem("202", "claim-3")\noffer = Proposal("compareRole", "Steve doubled revenue")';
  const html = render({ requestId: "r", status: "done", program }, value);
  assert.doesNotMatch(html, /oak-openui__metric-value|oak-openui__meter-track/, "4 inside 40%, 4% inside 14% and 202 inside 2023 never match");
  assert.match(html, /class="oak-next-step__title">Compare a role</);
  assert.doesNotMatch(html, /doubled revenue/);
});

test("Q17-G4 OpenUrl opens only a URL the answer cites", () => {
  assert.equal(oakOpenUICitedUrl(answer, answer.claims[0].citations[0].url), answer.claims[0].citations[0].url);
  for (const url of ["https://example.com/", "javascript:alert(1)", 42, undefined]) assert.equal(oakOpenUICitedUrl(answer, url), null);
  const librarySources = ["src/lib/openui.tsx", ...readdirSync("src/lib/openui", { recursive: true }).filter(file => /\.tsx?$/.test(file)).map(file => `src/lib/openui/${file}`)];
  assert.ok(librarySources.length > 20, "the library and each component file are read");
  for (const file of librarySources) assert.doesNotMatch(readFileSync(file, "utf8"), /OpenUrl|href=/, `${file}: the library gives the model no link of its own`);
});

test("Q17-G4 the fixture of shipped programs still parses with no error and places every claim", () => {
  for (const entry of shipped) {
    const result = parse(entry.program);
    assert.deepEqual(result.meta.errors, [], entry.id);
    assert.deepEqual(result.meta.unresolved, [], entry.id);
    assert.deepEqual([...oakPlacedClaims(result)].sort(), [...entry.claims].sort(), entry.id);
    assert.equal(oakOpenUIVerdict(entry.program, result, entry.claims), null, entry.id);
  }
});

test("Q17-G4 a pill asks its question through the composer in the visitor's words", async () => {
  await withPage(async page => {
    await open(page, "answer-openui-settled");
    const pills = page.locator(".oak-openui__pills .ui-suggestion");
    assert.equal(await pills.count(), 2);
    assert.equal(await page.locator(".oak-composer__suggestions").count(), 0, "the answer's own pills are the one follow-up row");
    await pills.nth(0).click();
    await page.waitForFunction(() => [...document.querySelectorAll(".ui-message[data-align='end'] .ui-bubble")]
      .some(bubble => bubble.textContent.trim() === "What did EcoSmartLoop ship?"), null, { timeout: 8000 });
  });
});

test("Q17-G4 a Proposal opens the tool with the visitor's question after one confirm, then shows a receipt and sends nothing", async () => {
  await withPage(async page => {
    await open(page, "answer-openui-proposal");
    const card = page.locator(".oak-openui__proposal");
    assert.equal(await card.count(), 1);
    assert.equal(await page.locator(".oak-next-step:not(.oak-openui__proposal)").count(), 0, "the next-step card steps aside for the proposal");
    // R15 (intentional update, Oak review v12): the proposal is one next-step row named by its tool.
    await card.click();
    await page.waitForSelector("#oak-role-description", { timeout: 8000 });
    assert.equal(await page.inputValue("#oak-role-intent"), "What design training has Steve completed?", "the tool opens with the visitor's own question");
    await page.getByRole("button", { name: "Return to chat" }).click();
    await page.waitForSelector(".oak-openui__proposal .oak-proposal__receipt", { timeout: 8000 });
    assert.match(await card.textContent(), /Nothing is sent until you send it\./);
    assert.equal(await page.locator(".ui-message[data-align='end'] .ui-bubble").count(), 1, "no new question was sent");
  });
});
