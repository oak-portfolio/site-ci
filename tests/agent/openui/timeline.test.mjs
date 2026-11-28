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

test("constant: oakTimelineLanes is pinned in flag-pins, and a force flips it both ways", () => {
  flag.forceOakTimelineLanes(true);
  assert.equal(flag.oakTimelineLanesOn(), true);
  flag.forceOakTimelineLanes(null);
  assert.equal(flag.oakTimelineLanesOn(), flag.oakTimelineLanes);
  flag.forceOakTimelineLanes(false);
  assert.equal(flag.oakTimelineLanesOn(), false);
  flag.forceOakTimelineLanes(null);
  assert.equal(flag.oakTimelineLanesOn(), flag.oakTimelineLanes);
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

const LONG = "k351";
const longClaims = ["hyperskalers-ai", "ecosmartloop", "agentic-brain"].map((slug, index) => ({ id: `claim-${index + 1}`,
  text: `Steve built ${slug}, a project he led end to end.`, citations: [work(slug)] }));
const renderLong = () => {
  primeOakRecordFacts(LONG, { version: 1, knowledgeRevision: LONG, records: { ...RECORDS,
    "work:hyperskalers-ai": facts("2024-05-01", { dateUpdated: "2024-09-01" }) } });
  return atClock("2026-10-16T12:00:00", () => on(() => render(longClaims, program(longClaims), LONG)));
};
const monthsOf = html => [...html.matchAll(/<span class="oak-lanes__month"([^>]*)>(\w{3})/g)].map(([, attrs, name], index) =>
  ({ index, name, tick: /data-tick="(\w+)"/.exec(attrs)?.[1], key: /data-key="(\w+)"/.exec(attrs)?.[1], year: attrs.includes("data-year") }));

test("lanes axis (351): a 30-month span labels the ends, Today and each January at desktop, and no two labels overlap at the 1280 axis", async () => {
  const { LANES_AXIS, lanesAxisBox } = loadTsx("src/lib/openui/components/Timeline.tsx");
  renderLong();
  await new Promise(setImmediate);
  const months = monthsOf(renderLong());
  assert.equal(months.length, 30, "May 2024 to October 2026");
  assert.ok(LANES_AXIS && typeof lanesAxisBox === "function", "the axis model is exported for this proof");
  const wide = months.filter(month => month.tick === "all" || month.tick === "wide");
  const narrow = months.filter(month => month.tick === "all" || month.tick === "narrow");
  const januaries = months.filter(month => month.name === "Jan").map(month => month.index);
  for (const index of [0, 29, ...januaries]) assert.ok(wide.some(month => month.index === index), `month ${index} shows at 1280`);
  for (const index of [0, 29, ...januaries]) assert.ok(narrow.some(month => month.index === index), `month ${index} shows from 520`);
  assert.ok(wide.length > narrow.length && wide.length < 30, `1280 adds room-fitting months but not all (${wide.length})`);
  for (const month of months.filter(month => month.name === "Jan")) assert.ok(month.year, "each January prints its year");
  for (const [set, axis] of [[wide, LANES_AXIS.wide], [narrow, LANES_AXIS.narrow]]) {
    const boxes = set.map(month => lanesAxisBox(month.index, 30, axis, month.key)).sort((a, b) => a[0] - b[0]);
    for (const [left, right] of boxes) assert.ok(left >= 0 && right <= axis, `label inside the ${axis}px axis`);
    for (let i = 1; i < boxes.length; i++) assert.ok(boxes[i][0] - boxes[i - 1][1] >= LANES_AXIS.gap, `labels clear at ${axis}px: ${boxes[i - 1]} then ${boxes[i]}`);
  }
  assert.deepEqual(keysOf(renderLong()), ["first May 2024", "last Oct 2026"], "phone widths keep the same key labels");
  const css = readFileSync("src/styles/openui/timeline.css", "utf8");
  assert.match(css, /@container oak-openui \(min-width: 520px\) \{[^]*\.oak-lanes__month:not\(\[data-tick\]\)[^{]*\{\s*visibility: hidden/);
  assert.match(css, /@container oak-openui \(min-width: 520px\) and \(max-width: \d+px\) \{\s*\.oak-lanes__month\[data-tick="wide"\][^{]*\{\s*visibility: hidden/);
  assert.match(css, /@container oak-openui \(min-width: \d+px\) \{\s*\.oak-lanes__month\[data-tick="narrow"\][^{]*\{\s*visibility: hidden/);
});

const tierHas = (value, tier) => value === "all" || value === tier;
const axisLabels = html => [...html.matchAll(/<span class="oak-lanes__month"([^>]*)>(\w{3})(?:<span class="oak-lanes__year">(\d{4})<\/span>)?(?:<span class="oak-lanes__short">([^<]+)<\/span>)?/g)]
  .map(([, attrs, name, year, short], index) => { const attr = key => new RegExp(`data-${key}="(\\w*)"`).exec(attrs)?.[1];
    return { index, name, year, short, tick: attr("tick"), key: attr("key"), january: attrs.includes("data-year"), carry: attr("carry"), shortAt: attr("short") }; });
const readAt = (month, tier) => {
  if (tierHas(month.shortAt, tier)) return { text: month.short, year: month.short, short: true };
  const year = month.year && (month.january || month.key || tierHas(month.carry, tier)) ? month.year : null;
  return { text: year ? `${month.name} ${year}` : month.name, year, short: false };
};

for (const [start, label] of [["2018-11-01", "Nov 2018 (97 months)"], ["2022-11-01", "Nov 2022 (49 months)"]]) {
  test(`lanes axis (351 M1): a span from ${label} to now prints every year it covers at both desktop widths, and no label boxes overlap`, async () => {
    const { LANES_AXIS, lanesAxisBox } = loadTsx("src/lib/openui/components/Timeline.tsx");
    const revision = `k351-${start}`;
    const claims = ["agentic-brain", "oakminder"].map((slug, index) => ({ id: `claim-${index + 1}`, text: `Steve built ${slug}, a project he led end to end.`, citations: [work(slug)] }));
    primeOakRecordFacts(revision, { version: 1, knowledgeRevision: revision, records: { ...RECORDS,
      "work:agentic-brain": facts(start, { articleStatus: "in-progress-stub" }), "work:oakminder": facts("2024-02-01", { dateUpdated: "2024-08-01" }) } });
    const draw = () => atClock("2026-11-16T12:00:00", () => on(() => render(claims, program(claims), revision)));
    draw();
    await new Promise(setImmediate);
    const months = axisLabels(draw());
    const first = Number(start.slice(0, 4)) * 12 + 10, count = 2026 * 12 + 10 - first + 1;
    assert.equal(months.length, count, `${label} to November 2026`);
    const covered = [...new Set(months.map(month => Math.floor((first + month.index) / 12)))];
    for (const [tier, axis] of [["wide", LANES_AXIS.wide], ["narrow", LANES_AXIS.narrow]]) {
      const shown = months.filter(month => tierHas(month.tick, tier));
      const read = shown.map(month => ({ month, ...readAt(month, tier) }));
      const printed = new Set(read.filter(label => label.year).map(({ month, short, year }) => {
        const real = Math.floor((first + month.index) / 12);
        assert.equal(year, short ? `\u2019${String(real).slice(2)}` : String(real), `${tier}: ${month.name} reads its own year`);
        return real;
      }));
      const says = read.map(label => label.text).join(", ");
      for (const year of covered) assert.ok(printed.has(year), `${tier}: ${year} prints at least once (${says})`);
      assert.ok(shown[0]?.index === 0 && shown.at(-1)?.index === count - 1, `${tier}: both ends show (${says})`);
      const boxes = read.map(({ month, short }) => lanesAxisBox(month.index, count, axis, month.key, short)).sort((a, b) => a[0] - b[0]);
      for (const [left, right] of boxes) assert.ok(left >= 0 && right <= axis, `${tier}: label inside the ${axis}px axis (${says})`);
      for (let i = 1; i < boxes.length; i++) assert.ok(boxes[i][0] - boxes[i - 1][1] >= LANES_AXIS.gap, `${tier}: labels clear at ${axis}px: ${boxes[i - 1]} then ${boxes[i]} (${says})`);
    }
    seed();
  });
}

test("lanes axis (351 M1, L1): each desktop width shows its carried years and short years, and last and Today sit where the label boxes put them", () => {
  const css = readFileSync("src/styles/openui/timeline.css", "utf8");
  const desktop = css.split("@container oak-openui (min-width: 520px) {")[1]?.split("\n}\n")[0] ?? "";
  assert.match(desktop, /\[data-key="last"\] \{[^}]*justify-content: end/);
  assert.match(desktop, /\[data-key="now"\] \{[^}]*justify-content: center/);
  for (const [query, tier] of [[/@container oak-openui \(min-width: 520px\) and \(max-width: 699px\) \{/, "narrow"], [/@container oak-openui \(min-width: 700px\) \{/, "wide"]]) {
    const block = css.split(query)[1]?.split("\n}\n")[0] ?? "";
    assert.match(block, new RegExp(`\\[data-carry="${tier}"\\], \\[data-carry="all"\\]\\) \\.oak-lanes__year \\{\\s*display: block`), `${tier}: carried years show`);
    assert.match(block, new RegExp(`\\[data-short="${tier}"\\], \\[data-short="all"\\]\\) \\.oak-lanes__short \\{\\s*display: block;\\s*visibility: visible`), `${tier}: short years show`);
  }
  assert.match(css, /^\.oak-lanes__short \{\s*display: none/m, "short years stay hidden outside the desktop widths");
});

test("lanes: a work record with no cover still draws its lane, with no cover image", () => {
  const { cover, ...bare } = RECORDS["work:oakminder"];
  primeOakRecordFacts(REVISION, { version: 1, knowledgeRevision: REVISION, records: { ...RECORDS, "work:oakminder": bare } });
  const html = on(() => render(claimsFor(2)));
  assert.equal(count(html, 'class="oak-lanes__lane"'), 2);
  assert.equal(count(html, "oak-lanes__cover"), 1, "only the record with a cover shows one");
  seed();
});

test("lanes (276): every bar draws in one neutral tone, the accent stays on Today, and a legend names Shipped, Ongoing and Today", () => {
  seed();
  const html = atClock("2026-11-16T12:00:00", () => on(() => render(claimsFor(5))));
  assert.doesNotMatch(html, /--oak-lanes-tint/, "no lane carries its own color");
  const css = readFileSync("src/styles/openui/timeline.css", "utf8");
  assert.doesNotMatch(css, /--oak-lanes-tint/, "the bar rule reads no per-lane color");
  assert.match(css, /\.oak-lanes__bar \{[^}]*background: var\(--oak-lanes-ink\)/);
  assert.match(css, /\.oak-lanes__today \{[^}]*background: var\(--oak-violet\)/);
  const legend = html.split('class="oak-figure__legend oak-lanes__legend"')[1]?.split("</ul>")[0] ?? "";
  assert.deepEqual([...legend.matchAll(/data-mark="(\w+)"[^>]*><\/span>(\w+)/g)].map(match => `${match[1]} ${match[2]}`),
    ["shipped Shipped", "ongoing Ongoing", "today Today"]);
  assert.ok(html.indexOf("oak-lanes__legend") > html.lastIndexOf("oak-lanes__bar"), "the legend sits under the lanes");
});
