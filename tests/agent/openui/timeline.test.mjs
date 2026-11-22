import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTsx } from "../design-rework/load-tsx.mjs";

// Ticket 57: Timeline draws case studies as lanes on one month axis, behind oakTimelineLanes.
globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, location: { search: "" }, addEventListener() {}, removeEventListener() {} };
const flag = loadTsx("src/lib/oakFlags/timelineLanes.ts");
const { primeOakRecordFacts } = loadTsx("src/lib/oakRecordFacts.ts");
const { OakArrangedAnswer } = loadTsx("src/components/agent/OakOpenUIAnswer.tsx");

const REVISION = "k57";
const cite = (documentId, url) => ({ documentId, passageId: `${documentId}:passage-001`, sectionId: documentId, url });
const work = slug => cite(`work:${slug}`, `https://steveoak.com/work/${slug}/`);
const facts = (datePublished, extra = {}) => ({ kind: "work", category: "App", datePublished, articleStatus: "full", coverTint: "#7aa2f7",
  cover: { src: "/images/cover.webp", alt: "Cover" }, systemMap: [], artifacts: [], metrics: [], sections: [], dek: "", ...extra });
const SLUGS = ["ecosmartloop", "oakminder", "agentic-brain", "hyperskalers-ai", "steveoak-com"];
const RECORDS = {
  "work:ecosmartloop": facts("2025-09-01", { dateUpdated: "2025-12-15" }),
  "work:oakminder": facts("2026-01-10", { dateUpdated: "2026-03-02" }),
  "work:agentic-brain": facts("2026-05-01", { articleStatus: "in-progress-stub" }),
  "work:hyperskalers-ai": facts("2025-06-01"),
  "work:steveoak-com": facts("2025-11-01", { dateUpdated: "2026-02-01" }),
};
const seed = () => primeOakRecordFacts(REVISION, { version: 1, knowledgeRevision: REVISION, records: RECORDS });
const claimsFor = n => SLUGS.slice(0, n).map((slug, index) => ({ id: `claim-${index + 1}`,
  text: index === 0 ? `Steve built ${slug} in 2025, a project he led.` : `Steve built ${slug}, a project he led end to end.`, citations: [work(slug)] }));
const program = claims => `root = Answer([t])\nt = Timeline([${claims.map((_, i) => `i${i}`).join(", ")}])\n` +
  claims.map((claim, i) => `i${i} = TimelineItem("${i === 0 ? "2025" : "March 2026"}", "${claim.id}")`).join("\n");
const labelsFor = (claims, revision) => ({ knowledgeRevision: revision, documents: [...new Map(claims.flatMap(claim => claim.citations).map(c => [c.documentId,
  { documentId: c.documentId, title: `${c.documentId.split(":")[1]}: case study`, canonicalUrl: c.url.split("#")[0], card: { kind: "work", title: c.documentId.split(":")[1], stack: [] } }])).values()] });
const render = (claims, text = program(claims), revision = REVISION) => renderToStaticMarkup(createElement(OakArrangedAnswer, { id: "m1", question: "When did Steve build what?", latest: true,
  citationLabels: labelsFor(claims, revision),
  answer: { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "c", hardPolicyVersion: "h", knowledgeRevision: revision, operations: [], kind: "sourced", acknowledgment: null, claims },
  ui: { requestId: "00000000-0000-4000-8000-0000000000d7", status: "done", program: text } }));
const on = fn => { flag.forceOakTimelineLanes(true); try { return fn(); } finally { flag.forceOakTimelineLanes(null); } };
const off = fn => { flag.forceOakTimelineLanes(false); try { return fn(); } finally { flag.forceOakTimelineLanes(null); } };
const count = (html, text) => html.split(text).length - 1;

seed();
on(() => render(claimsFor(2)));
await new Promise(setImmediate);

test("constant: oakTimelineLanes ships true and a force flips it", () => {
  assert.equal(flag.oakTimelineLanes, true);
  assert.equal(flag.oakTimelineLanesOn(), true);
  flag.forceOakTimelineLanes(false);
  assert.equal(flag.oakTimelineLanesOn(), false);
  flag.forceOakTimelineLanes(null);
  assert.equal(flag.oakTimelineLanesOn(), true);
});

for (const n of [2, 5]) test(`lanes: ${n} case studies, one lane each, inside OakFigure, every claim once`, () => {
  seed();
  const claims = claimsFor(n);
  const html = on(() => render(claims));
  assert.match(html, /<figure class="oak-figure"/);
  assert.equal(count(html, 'class="oak-lanes__lane"'), n);
  for (const claim of claims) assert.equal(count(html, claim.text), 1, `${claim.id} shown once`);
});

test("lanes: one month grid drawn once behind every lane, no per-lane column lines", () => {
  seed();
  const html = on(() => render(claimsFor(5)));
  assert.equal(count(html, 'class="oak-lanes__grid"'), 1);
  const months = count(html, 'class="oak-lanes__month"');
  const now = new Date();
  assert.equal(months, Math.max(12, now.getFullYear() * 12 + now.getMonth() - (2025 * 12 + 5) + 1), "June 2025 to the open record's today");
  assert.equal(count(html, 'class="oak-lanes__col"'), months, "one column per month, all in the single grid");
  const lanes = html.split('class="oak-lanes__lane"').slice(1);
  for (const lane of lanes) assert.doesNotMatch(lane.split("</li>")[0], /oak-lanes__col/);
});

test("lanes: a date shows only when the claim states it; an open record draws hatched", () => {
  seed();
  const html = on(() => render(claimsFor(3)));
  assert.equal(count(html, "oak-lanes__date"), 1, "only claim-1 states its date");
  assert.match(html, /oak-lanes__date">2025</);
  assert.doesNotMatch(html, />March 2026</);
  assert.equal(count(html, "data-open"), 1, "the in-progress record draws open");
});

test("lanes: missing record facts or the constant off render today's rail", () => {
  seed();
  const rail = off(() => render(claimsFor(2)));
  assert.match(rail, /oak-openui__timeline-item/);
  assert.doesNotMatch(rail, /oak-lanes/);
  const missing = on(() => render(claimsFor(2), undefined, "other"));
  assert.doesNotMatch(missing, /oak-lanes__lane/);
});

test("stored Timeline programs render, as lanes with the constant on and as today off", () => {
  const stored = JSON.parse(readFileSync("tests/agent/premium/stored-openui-programs.json", "utf8")).filter(item => /Timeline\(/.test(item.program));
  assert.ok(stored.length >= 1);
  for (const item of stored) {
    const records = Object.fromEntries(item.answer.claims.flatMap(claim => claim.citations).map(c => [c.documentId, c.documentId.startsWith("experience:")
      ? { kind: "experience", engagement: "part-time", dateStart: "2024-09", dateEnd: "2026-05", title: "Student" } : facts("2026-01-30")]));
    primeOakRecordFacts(REVISION, { version: 1, knowledgeRevision: REVISION, records });
    const claims = item.answer.claims;
    const lanes = on(() => render(claims, item.program));
    const today = off(() => render(claims, item.program));
    for (const html of [lanes, today]) for (const claim of claims) assert.ok(html.includes(claim.text.slice(0, 40)), `${item.id} ${claim.id}`);
    assert.match(lanes, /oak-lanes__lane/);
    assert.doesNotMatch(today, /oak-lanes/);
  }
});

test("css: lanes stack at narrow widths with no sideways scroll, forced colors keep the bars", () => {
  const css = readFileSync("src/styles/openui/timeline.css", "utf8");
  assert.match(css, /@container[^{]*\(max-width:[^)]*\)[^{]*\{[^]*\.oak-lanes__lane/);
  assert.doesNotMatch(css, /overflow-x:\s*(auto|scroll)/);
  assert.match(css, /@media \(forced-colors: active\)[^]*oak-lanes__bar/);
});

test("each lanes gallery state primes complete record facts, so the gallery draws lanes instead of falling back", () => {
  const states = JSON.parse(readFileSync("src/data/dev/oak-states.json", "utf8")).filter(state => state.timelineLanes);
  assert.ok(states.length >= 2);
  for (const state of states) for (const [id, facts] of Object.entries(state.recordFacts ?? {})) {
    assert.equal(typeof facts.cover?.src, "string", `${state.id} ${id} cover`);
    assert.match(facts.coverTint ?? "", /^#[0-9a-f]{3,8}$/i, `${state.id} ${id} coverTint`);
  }
});

const atClock = (iso, fn) => { mock.timers.enable({ apis: ["Date"], now: new Date(iso) }); try { return fn(); } finally { mock.timers.reset(); } };
const styleOf = (html, name) => [...html.matchAll(new RegExp(`${name}:([0-9.]+)`, "g"))].map(match => Number(match[1]));
const keysOf = html => [...html.matchAll(/data-key="(\w+)"[^>]*>(\w+)<span class="oak-lanes__year">(\d{4})/g)].map(match => `${match[1]} ${match[2]} ${match[3]}`);

test("lanes geometry: a fixed clock pins each bar's from and span, the Today line, and an open bar ending at Today", () => {
  seed();
  const html = atClock("2026-11-16T12:00:00", () => on(() => render(claimsFor(5))));
  assert.equal(count(html, 'class="oak-lanes__month"'), 18, "June 2025 to November 2026");
  assert.deepEqual(styleOf(html, "--oak-lanes-from"), [1, 4, 6, 8, 12], "hyperskalers, ecosmartloop, steveoak, oakminder, agentic-brain");
  assert.deepEqual(styleOf(html, "--oak-lanes-span"), [1, 4, 4, 3, 7]);
  const [at] = styleOf(html, "--oak-lanes-at");
  assert.ok(Math.abs(at - (17 + 16 / 31) / 18) < 1e-9, `Today sits mid November (${at})`);
  const [cut] = styleOf(html, "--oak-lanes-cut");
  assert.ok(Math.abs(cut - (1 - 16 / 31)) < 1e-9, `the open bar stops at the Today line (${cut})`);
  assert.equal(count(html, "--oak-lanes-cut"), 1, "only the open bar is trimmed");
  assert.match(readFileSync("src/styles/openui/timeline.css", "utf8"), /\.oak-lanes__bar\[data-open\][^{]*\{[^}]*margin-inline-end: calc\(100% \* var\(--oak-lanes-cut, 0\) \/ var\(--oak-lanes-span\)\)/);
});

test("lanes axis: the first, the last and a distinct Today month carry a key label with their year for phone widths", () => {
  seed();
  assert.deepEqual(keysOf(atClock("2026-11-16T12:00:00", () => on(() => render(claimsFor(5))))), ["first Jun 2025", "last Nov 2026"], "Today is the last month");
  assert.deepEqual(keysOf(atClock("2026-01-16T12:00:00", () => on(() => render(claimsFor(2))))), ["first Sep 2025", "now Jan 2026", "last Mar 2026"]);
  const css = readFileSync("src/styles/openui/timeline.css", "utf8");
  assert.match(css, /@container[^{]*\(max-width:[^)]*\)[^{]*\{[^]*\.oak-lanes__month:not\(\[data-key\]\)[^{]*\{\s*visibility: hidden/);
});

test("lanes: a work record with no cover still draws its lane, with no cover image", () => {
  const { cover, ...bare } = RECORDS["work:oakminder"];
  primeOakRecordFacts(REVISION, { version: 1, knowledgeRevision: REVISION, records: { ...RECORDS, "work:oakminder": bare } });
  const html = on(() => render(claimsFor(2)));
  assert.equal(count(html, 'class="oak-lanes__lane"'), 2);
  assert.equal(count(html, "oak-lanes__cover"), 1, "only the record with a cover shows one");
  seed();
});
