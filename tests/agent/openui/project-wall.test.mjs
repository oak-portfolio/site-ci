import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTsx } from "../design-rework/load-tsx.mjs";

// Ticket 31: ProjectWall(claims, mode, audience) shows the cited projects as cover tiles, behind oakProjectWall.
globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, location: { search: "" }, addEventListener() {}, removeEventListener() {} };
const flag = loadTsx("src/lib/oakFlags/projectWall.ts");
const { primeOakRecordFacts } = loadTsx("src/lib/oakRecordFacts.ts");
const { OakArrangedAnswer } = loadTsx("src/components/agent/OakOpenUIAnswer.tsx");
const view = loadTsx("packages/oak-agent-contracts/src/openui/views/project-wall.ts");

const REVISION = "k";
const cite = id => ({ documentId: id, passageId: `${id}:passage-001`, sectionId: id, url: `https://steveoak.com/work/${id.split(":")[1]}/` });
const work = (slug, extra = {}) => ({ kind: "work", dek: "", category: "AI", badge: "Case study", articleStatus: "full", datePublished: "2025-01-01",
  cover: { src: `/c/${slug}.webp`, alt: `${slug} cover`, ratio: 16 / 9 }, coverTint: "#7fb4ff", systemMap: [], artifacts: [], metrics: [], sections: [], ...extra });
const FACTS = {
  "work:ecosmartloop": work("ecosmartloop", { category: "AI", datePublished: "2025-03-01", coverTint: "#6fd39a" }),
  "work:oakminder": work("oakminder", { category: "Mobile", datePublished: "2026-02-01", articleStatus: "in-progress-stub", coverTint: "#ffb86b" }),
  "work:linkedin-growth-loop": work("linkedin-growth-loop", { category: "AI", datePublished: "2025-09-01", coverTint: "#8fa8ff" }),
};
const CLAIMS = [
  { id: "claim-1", text: "EcoSmartLoop sorted waste photos with LEAF Engine.", citations: [cite("work:ecosmartloop")] },
  { id: "claim-2", text: "Oakminder is a reminder app Steve built.", citations: [cite("work:oakminder")] },
  { id: "claim-3", text: "LinkedIn Growth Loop ran a daily outreach job.", citations: [cite("work:linkedin-growth-loop")] },
  { id: "claim-4", text: "Steve also wrote about his process.", citations: [{ documentId: "profile:steve", passageId: "p", sectionId: "s", url: "https://steveoak.com/about/" }] },
];
const doc = (slug, title, stack) => ({ documentId: `work:${slug}`, title: `${title}: case study`, canonicalUrl: `https://steveoak.com/work/${slug}/`,
  card: { kind: "work", title, stack } });
const LABELS = { knowledgeRevision: REVISION, documents: [doc("ecosmartloop", "EcoSmartLoop", ["Next.js", "Supabase"]), doc("oakminder", "Oakminder", ["Expo", "Convex"]),
  doc("linkedin-growth-loop", "LinkedIn Growth Loop", ["Next.js", "Convex"]), doc("omnisocial", "OmniSocial", []),
  { documentId: "profile:steve", title: "About Steve", canonicalUrl: "https://steveoak.com/about/" },
  { documentId: "legacy-matcha-by-maryam", title: "Matcha by Maryam", canonicalUrl: "https://independent-performance-642823.framer.app/codex/matchabymaryam" }] };
const answerOf = claims => ({ schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "c", hardPolicyVersion: "h", knowledgeRevision: REVISION, operations: [],
  kind: "sourced", acknowledgment: null, claims });
const seed = records => primeOakRecordFacts(REVISION, { version: 1, knowledgeRevision: REVISION, records });
const render = (args, claims = CLAIMS) => renderToStaticMarkup(createElement(OakArrangedAnswer, { id: "m1", answer: answerOf(claims.filter(claim => args.includes(`"${claim.id}"`))), question: "What has Steve built?", latest: true, citationLabels: LABELS,
  ui: { requestId: "00000000-0000-4000-8000-0000000000e1", status: "done", program: `root = Answer([wall])\nwall = ProjectWall(${args})` } }));
const on = fn => { flag.forceOakProjectWall(true); try { return fn(); } finally { flag.forceOakProjectWall(null); } };
const count = (html, text) => html.split(text).length - 1;
const tiles = html => count(html, 'class="oak-wall__tile"');

// The block's view loads in its own chunk; one render starts that import, and later renders get the settled view.
on(() => render(`["claim-1"]`));
await new Promise(setImmediate);

test("constant: oakProjectWall ships true and a force flips it", () => {
  assert.equal(flag.oakProjectWall, true);
  assert.equal(flag.oakProjectWallOn(), true);
  flag.forceOakProjectWall(false);
  assert.equal(flag.oakProjectWallOn(), false);
  flag.forceOakProjectWall(null);
  assert.equal(flag.oakProjectWallOn(), true);
});

test("unlock rule: a tile shows only for a cited record, each claim placed once, the rest after the wall", () => {
  seed({ ...FACTS, "work:omnisocial": work("omnisocial") });
  const html = on(() => render(`["claim-1", "claim-2", "claim-4"]`));
  assert.equal(tiles(html), 2, "two cited work records, two tiles");
  assert.doesNotMatch(html, /omnisocial/, "an uncited record never gets a tile");
  for (const claim of CLAIMS.filter(claim => claim.id !== "claim-3")) assert.equal(count(html, claim.text), 1, `${claim.id} placed once`);
  assert.ok(html.indexOf("oak-wall__grid") < html.indexOf(CLAIMS[3].text), "a claim citing no tile follows the wall");
  assert.match(html, /From Steve&#x27;s projects:/, "one wall of several projects never reads as one of them");
  assert.doesNotMatch(html, /From one of/);
});

test("covers keep their ratio on a Media backdrop and each tile carries its own cover tint", () => {
  seed(FACTS);
  const html = on(() => render(`["claim-1", "claim-2", "claim-3"]`));
  assert.equal(tiles(html), 3);
  assert.equal(count(html, "oak-wall__cover"), 3);
  assert.match(html, /--oak-art-ratio:1\.7777/);
  for (const tint of ["#6fd39a", "#ffb86b", "#8fa8ff"]) assert.equal(count(html, `--oak-wall-tint:${tint}`), 1, `${tint} once`);
});

test("a tint that is not a plain hex color is dropped, never written into the style", () => {
  seed({ "work:ecosmartloop": work("ecosmartloop", { coverTint: "red;background:url(x)" }) });
  const html = on(() => render(`["claim-1"]`));
  assert.doesNotMatch(html, /--oak-wall-tint/);
});

test("filter chips: category terms and stack shared by 2 or more tiles, AND, and a chip every tile matches is not drawn", () => {
  const all = [
    { id: "a", order: 0, category: "AI", stack: ["Next.js", "Convex"], date: "2025-03-01", full: true },
    { id: "b", order: 1, category: "Mobile", stack: ["Expo", "Convex"], date: "2026-02-01", full: false },
    { id: "c", order: 2, category: "AI", stack: ["Next.js"], date: "2025-09-01", full: true },
  ];
  assert.deepEqual(view.oakProjectWallChips(all), ["AI", "Next.js", "Convex"]);
  assert.deepEqual(view.oakProjectWallChips(all.map(tile => ({ ...tile, category: "AI", stack: [] }))), []);
  assert.deepEqual(view.oakProjectWallView(all, { chips: ["AI"], sort: "cited" }).map(tile => tile.id), ["a", "c"]);
  assert.deepEqual(view.oakProjectWallView(all, { chips: ["AI", "Convex"], sort: "cited" }).map(tile => tile.id), ["a"]);
  assert.deepEqual(view.oakProjectWallView(all, { chips: ["Mobile", "Next.js"], sort: "cited" }), []);
  assert.deepEqual(view.oakProjectWallView(all, { chips: [], sort: "recent" }).map(tile => tile.id), ["b", "c", "a"]);
  assert.deepEqual(view.oakProjectWallPath(all).map(tile => tile.id), ["a", "c", "b"], "full articles first, then cited order");
  assert.equal(view.oakProjectWallSorts(all), true);
  assert.equal(view.oakProjectWallSorts([all[1], all[2], all[0]].map((tile, order) => ({ ...tile, order }))), false, "already newest first: no sort control");
});

test("wall draws the filter group and sort only when they have a target; state stays in the block", () => {
  seed(FACTS);
  const html = on(() => render(`["claim-1", "claim-2", "claim-3"]`));
  assert.match(html, /aria-label="Filter projects"/);
  assert.match(html, /aria-label="Sort projects"/);
  assert.doesNotMatch(html, /href="[^"]*[?&](filter|sort)=/, "filter state never leaves the block");
  seed({ "work:ecosmartloop": FACTS["work:ecosmartloop"] });
  const one = on(() => render(`["claim-1"]`));
  assert.doesNotMatch(one, /Filter projects|Sort projects/, "one tile: no controls");
});

test("path orders full articles first with a reason chip, and the audience is the model's own words", () => {
  seed(FACTS);
  const html = on(() => render(`["claim-2", "claim-1", "claim-3"], "path", "a recruiter"`));
  assert.match(html, /data-mode="path"/);
  assert.match(html, /Start here/);
  assert.match(html, /For a recruiter/);
  assert.ok(html.indexOf("ecosmartloop cover") < html.indexOf("oakminder cover"), "the full article leads the path");
  assert.doesNotMatch(html, /Filter projects/, "path has no filter");
});

test("legacy shows only cited legacy pages, from the legacy list", () => {
  seed(FACTS);
  const legacy = { id: "claim-5", text: "Matcha by Maryam was a brand and site build.", citations: [{ documentId: "legacy-matcha-by-maryam", passageId: "legacy-matcha-by-maryam:section-001:passage-001",
    sectionId: "legacy-matcha-by-maryam:section-001", url: "https://independent-performance-642823.framer.app/codex/matchabymaryam" }] };
  const html = on(() => render(`["claim-1", "claim-5"], "legacy"`, [...CLAIMS, legacy]));
  assert.equal(tiles(html), 1);
  assert.match(html, /Matcha by Maryam/);
  assert.match(html, /Brand &amp; dev/);
  assert.match(html, /matcha-by-maryam\.png/);
  assert.equal(count(html, CLAIMS[0].text), 1, "the work claim still shows once, after the wall");
});

test("the prompt description names no other component", () => {
  const { ProjectWall } = loadTsx("src/lib/openui/components/ProjectWall.tsx");
  const description = ProjectWall.description ?? ProjectWall.spec?.description ?? "";
  assert.ok(description.length > 0);
  assert.doesNotMatch(description, /\b(Stack|Prose|Points|Project|Role|Profile|Quote|Steps|Sources|Ownership)\b/);
});

test("constant off is the existing Project list; facts missing or from another revision is the Points list; every claim placed once", () => {
  seed(FACTS);
  flag.forceOakProjectWall(false);
  const off = render(`["claim-1", "claim-2"]`);
  flag.forceOakProjectWall(null);
  assert.doesNotMatch(off, /oak-wall/);
  assert.match(off, /oak-openui-project|oak-openui__points/);
  seed({});
  const missing = on(() => render(`["claim-1", "claim-2"]`));
  primeOakRecordFacts("other", { version: 1, knowledgeRevision: "other", records: FACTS });
  seed({});
  const other = on(() => render(`["claim-1", "claim-2"]`));
  for (const [name, html] of [["off", off], ["missing", missing], ["other revision", other]]) {
    assert.doesNotMatch(html, /oak-wall__tile/, `${name}: no tiles`);
    for (const claim of CLAIMS.slice(0, 2)) assert.equal(count(html, claim.text), 1, `${name}: ${claim.id} once`);
  }
});
