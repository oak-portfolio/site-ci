import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parse as parseYaml } from "yaml";
import { loadTsx } from "../design-rework/load-tsx.mjs";

// Ticket 40: EvidenceChart(claims, mode) charts published artifacts per cited record; held ones show only as a count.
globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, location: { search: "" }, addEventListener() {}, removeEventListener() {} };
const root = path.resolve(import.meta.dirname, "../../..");
const flag = loadTsx("src/lib/oakFlags/evidenceChart.ts");
const { primeOakRecordFacts } = loadTsx("src/lib/oakRecordFacts.ts");
const { OakArrangedAnswer } = loadTsx("src/components/agent/OakOpenUIAnswer.tsx");
const { GHOST_ROWS } = loadTsx("src/lib/openui/components/EvidenceChart.tsx");
const { oakEvidenceTotals, oakEvidenceSankey, oakEvidenceRing } = loadTsx("packages/oak-agent-contracts/src/openui/views/evidence-chart.ts");

const REVISION = "k";
const works = readdirSync(path.join(root, "src/content/work")).filter(file => file.endsWith(".mdx")).sort().map(file => {
  const data = parseYaml(readFileSync(path.join(root, "src/content/work", file), "utf8").match(/^---\n([\s\S]*?)\n---/)[1]);
  const slug = file.replace(/\.mdx$/, "");
  return { slug, title: data.title, published: data.artifacts.filter(item => item.status === "verified").map(item => item.label),
    held: data.artifacts.filter(item => item.status !== "verified").map(item => item.label) };
});
const FACTS = Object.fromEntries(works.map(work => [`work:${work.slug}`, { kind: "work", articleStatus: "full", datePublished: "2026-01-01",
  artifacts: work.published.map(label => ({ label, status: "verified" })), heldArtifacts: work.held.length }]));
const HELD_LABELS = [...new Set(works.flatMap(work => work.held))].filter(label => !works.some(work => work.published.includes(label)));
const cite = document => ({ documentId: document, passageId: `${document}:passage-001`, sectionId: document, url: `https://steveoak.com/${document.replace(":", "/")}/` });
const CLAIMS = works.map((work, index) => ({ id: `claim-${index + 1}`, text: `Proof is on the page for record ${index + 1}.`, citations: [cite(`work:${work.slug}`)] }));
const IDS = CLAIMS.map(claim => claim.id);

const seed = records => primeOakRecordFacts(REVISION, records ? { version: 1, knowledgeRevision: REVISION, records } : null);
const draw = ({ claims, program, status = "done", revision = REVISION }) => renderToStaticMarkup(createElement(OakArrangedAnswer, { id: "m1", question: "How much of this work is verified?", latest: true,
  answer: { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "c", hardPolicyVersion: "h", knowledgeRevision: revision, operations: [], kind: "sourced", acknowledgment: null, claims },
  ui: { requestId: "00000000-0000-4000-8000-0000000000e4", status, program } }));
const chartOf = (ids, mode) => `root = Answer([chart])\nchart = EvidenceChart([${ids.map(id => `"${id}"`).join(", ")}]${mode ? `, "${mode}"` : ""})`;
const render = (ids, mode) => draw({ claims: CLAIMS.filter(claim => ids.includes(claim.id)), program: chartOf(ids, mode) });
const on = fn => { flag.forceOakEvidenceChart(true); try { return fn(); } finally { flag.forceOakEvidenceChart(null); } };
const off = fn => { flag.forceOakEvidenceChart(false); try { return fn(); } finally { flag.forceOakEvidenceChart(null); } };
const escape = text => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

const points = html => html.split('class="oak-openui__point-text"').length - 1;
const count = (html, needle) => html.split(needle).length - 1;
const GHOST = /class="oak-evidence oak-openui-skel oak-openui-evidence" data-pending="" aria-hidden="true"/;
const BAR_ROWS = 'class="oak-figure__bar-row"', CLAIM_LINES = 'class="oak-openui__point-mark oak-openui-skel__mark"';
const STREAMING = 'root = Answer([chart])\nchart = EvidenceChart(["claim-';

// The view loads in its own chunk; renders start that import until the settled view comes back.
seed(FACTS);
for (let tries = 0; tries < 100 && !on(() => render(IDS, "proof")).includes('<figure class="oak-figure"'); tries++) await new Promise(resolve => setTimeout(resolve, 20));

test("constant: oakEvidenceChart is pinned in flag-pins, and a force flips it both ways", () => {
  flag.forceOakEvidenceChart(true);
  assert.equal(flag.oakEvidenceChartOn(), true);
  flag.forceOakEvidenceChart(null);
  assert.equal(flag.oakEvidenceChartOn(), flag.oakEvidenceChart);
  flag.forceOakEvidenceChart(false);
  assert.equal(flag.oakEvidenceChartOn(), false);
  flag.forceOakEvidenceChart(null);
  assert.equal(flag.oakEvidenceChartOn(), flag.oakEvidenceChart);
});

test("every mode: no held artifact label is in the drawing, the equivalent or the accessible tree; held shows only as a number", () => {
  assert.ok(HELD_LABELS.length > 0, "the Work records hold some artifacts");
  const published = works.reduce((sum, work) => sum + work.published.length, 0), held = works.reduce((sum, work) => sum + work.held.length, 0);
  seed(FACTS);
  for (const mode of ["proof", "donut", "sankey", undefined]) {
    const html = on(() => render(IDS, mode));
    assert.match(html, /<figure class="oak-figure"/, `${mode}: renders inside OakFigure`);
    assert.match(html, new RegExp(`data-mode="${mode ?? "proof"}"`), `${mode}: the asked mode, proof by default`);
    for (const label of HELD_LABELS) {
      assert.ok(!html.includes(label) && !html.includes(escape(label)), `${mode}: held label "${label}" reaches the markup`);
    }
    for (const work of works) for (const label of work.published.slice(0, 1)) assert.ok(html.includes(escape(label)), `${mode}: published label "${label}" is listed`);
    assert.match(html, new RegExp(`${published} of ${published + held}`), `${mode}: the published share is told in words`);
    assert.match(html, /Held/, `${mode}: held items are named by a status word`);
    assert.doesNotMatch(html, /verified/i, `${mode}: the status words are Published and Held`);
    assert.equal(points(html), CLAIMS.length, `${mode}: every claim is placed once`);
  }
});

test("a record without the held count draws its published artifacts only", () => {
  const [first] = works;
  seed({ [`work:${first.slug}`]: { ...FACTS[`work:${first.slug}`], heldArtifacts: undefined } });
  const html = on(() => render(["claim-1"], "donut"));
  assert.match(html, /<figure class="oak-figure"/);
  assert.doesNotMatch(html, /Held/);
  seed(FACTS);
});

test("constant off, missing facts or no Work record degrade to the plain Points list with every claim once", () => {
  seed(FACTS);
  for (const html of [off(() => render(IDS, "sankey")), (seed(null), on(() => render(IDS, "sankey")))]) {
    assert.doesNotMatch(html, /oak-figure/);
    assert.equal(points(html), CLAIMS.length, "every claim once");
  }
  seed({ "profile:steve-oak": { kind: "profile" } });
  assert.doesNotMatch(on(() => render(IDS, "proof")), /oak-figure/);
  seed(FACTS);
});

test("ticket 293: while the answer streams and no claim id has arrived, the chart is its own skeleton, hidden from assistive tech", () => {
  seed(FACTS);
  const html = on(() => draw({ claims: CLAIMS, program: STREAMING, status: "streaming" }));
  assert.match(html, GHOST, "the proof figure in bars, marked pending and aria-hidden");
  assert.doesNotMatch(html, /<figure/, "no figure until the claims arrive");
  assert.equal(count(html, BAR_ROWS), GHOST_ROWS, "five bar rows, the usual chart");
  assert.equal(count(html, CLAIM_LINES), GHOST_ROWS, "and five claim lines under it");
  assert.match(html, /oak-figure__head[^]*oak-evidence__ghost-switch oak-openui-card__bar/, "the list switch keeps its place in the head");
  const ghost = html.slice(html.search(GHOST), html.indexOf("</ul>", html.search(GHOST)));
  assert.doesNotMatch(ghost, /Proof is on the page/, "the skeleton draws no claim text before its id arrives");
  assert.doesNotMatch(off(() => draw({ claims: CLAIMS, program: STREAMING, status: "streaming" })), /oak-openui-evidence/, "off, it stays the plain list");
});

test("ticket 293: claims in hand but facts still loading, the skeleton draws one bar per cited record and one line per claim", () => {
  const twice = { id: "claim-9", text: "A second claim on the first record.", citations: [cite(CLAIMS[0].citations[0].documentId)] };
  const claims = [...CLAIMS.slice(0, 3), twice];
  const html = on(() => draw({ claims, program: chartOf(claims.map(claim => claim.id)), revision: "k293-unloaded" }));
  assert.match(html, GHOST);
  assert.equal(count(html, BAR_ROWS), 3, "three records, three bars");
  assert.equal(count(html, CLAIM_LINES), 4, "four claims, four lines");
});

test("ticket 293: forced colors keep every skeleton bar visible by an edge in the system text color", () => {
  const css = readFileSync(path.join(root, "src/styles/openui/skeleton.css"), "utf8");
  const forced = css.slice(css.indexOf("@media (forced-colors: active)"));
  assert.match(forced, /\.oak-openui-skel\)\[data-pending\] :is\([^)]*\.oak-openui-card__bar[^)]*\)\s*\{[^}]*outline: 1px solid CanvasText/);
  seed(FACTS);
  const html = on(() => draw({ claims: CLAIMS, program: STREAMING, status: "streaming" }));
  for (const part of ["oak-evidence__ghost-switch", "oak-figure__bar"]) assert.match(html, new RegExp(`class="${part} oak-openui-card__bar"`), `${part} is a skeleton bar`);
});

test("view: totals, ring segments and sankey ribbons meet their node bars flush", () => {
  const rows = [{ document: "work:a", name: "A", published: ["x", "y"], held: 1 }, { document: "work:b", name: "B", published: ["z"], held: 0 },
    { document: "work:c", name: "C", published: [] }];
  assert.deepEqual(oakEvidenceTotals(rows), { published: 3, held: 1, total: 4, counted: true });
  assert.equal(oakEvidenceTotals([{ document: "work:a", name: "A", published: ["x"] }]).counted, false);
  const ring = oakEvidenceRing({ published: 3, held: 1, total: 4, counted: true });
  assert.deepEqual(ring.map(part => part.status), ["published", "held"]);
  assert.ok(ring.every(part => /^M[\d. -]+A/.test(part.d) && part.d.endsWith("Z")));
  const full = oakEvidenceRing({ published: 2, held: 0, total: 2, counted: true });
  assert.equal(full.length, 2, "a full ring is drawn as two halves, since one arc cannot close a circle");
  const { height, nodes, targets, links } = oakEvidenceSankey(rows);
  assert.equal(height, 3 * 44 + 2 * 8);
  assert.deepEqual(nodes.map(node => [node.y, node.height]), [[0, 44], [52, 44], [104, 44]]);
  assert.deepEqual(targets.map(target => target.status), ["published", "held"]);
  assert.equal(links.length, 3, "a zero band draws no ribbon");
  for (const link of links) {
    const source = nodes[link.row], target = targets.find(item => item.status === link.status);
    assert.ok(link.from >= source.y && link.from + link.width <= source.y + source.height + 0.001, `ribbon starts on its record bar: ${JSON.stringify(link)}`);
    assert.ok(link.to >= target.y && link.to + link.width <= target.y + target.height + 0.001, `ribbon ends on its status bar: ${JSON.stringify(link)}`);
    assert.match(link.d, /^M0 [\d.]+ C50 [\d.]+,50 [\d.]+,100 [\d.]+ L100 [\d.]+ C50 [\d.]+,50 [\d.]+,0 [\d.]+ Z$/, "starts at x 0 and ends at x 100");
  }
  assert.equal(links.filter(link => link.lead).length, 2, "the first record's path is the highlighted one");
});
