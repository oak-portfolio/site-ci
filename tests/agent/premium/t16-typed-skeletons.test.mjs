import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTsx } from "../design-rework/load-tsx.mjs";
import { stateById } from "./gallery.mjs";

// Ticket 16 (typed skeletons and Proposal view): a streaming Stats, Compare or Timeline holds its children's places with
// skeletons of the settled item's shape; the contact-brief proposal names the answer's pages. No browser.
globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, location: { search: "" }, addEventListener() {}, removeEventListener() {} };
const { oakOpenUIPendingChildren, oakPendingFor, oakPendingPlaces } = loadTsx("src/lib/oakOpenUISkeletons.ts");
const { OakArrangedAnswer } = loadTsx("src/components/agent/OakOpenUIAnswer.tsx");
const sheet = (file) => readFileSync(new URL(`../../../src/styles/${file}`, import.meta.url), "utf8");
const css = sheet("openui/skeleton.css");
const agentCss = ["oakAgent.css", ...readdirSync(new URL("../../../src/styles/openui/", import.meta.url)).map(file => `openui/${file}`)].map(sheet).join("\n");

const base = { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "c", hardPolicyVersion: "h", knowledgeRevision: "k", operations: ["search", "read"] };
const stateOf = (id) => stateById(id).workspace.messages.find(message => message.role === "assistant");
const labels = {
  knowledgeRevision: "k",
  documents: [{ documentId: "work:ecosmartloop", title: "EcoSmartLoop: AI Agent Platform", canonicalUrl: "https://steveoak.com/work/ecosmartloop/", cover: "/eco-480.webp",
    card: { kind: "work", title: "EcoSmartLoop", image: "/eco-900.webp", imageAlt: "EcoSmartLoop cover", role: "Product-side full-stack owner", period: "September to December 2025", stack: ["Next.js"] } }],
};
const render = (id) => renderToStaticMarkup(createElement(OakArrangedAnswer,
  { id: "m2", answer: { ...base, ...stateOf(id).answer }, ui: stateOf(id).ui, question: "q", citationLabels: labels, latest: true }));
const count = (html, pattern) => html.match(pattern)?.length ?? 0;
const head = 'root = Answer([lead, nums, src])\nlead = Prose("claim-1")\n';

test("the pending map reads each container's promised children", () => {
  const stats = oakOpenUIPendingChildren(`${head}nums = Stats([a, b, c])\na = Metric("x", "1", "claim-2")\nb = Meter(`);
  assert.equal(stats.length, 1);
  assert.equal(stats[0].kind, "stats");
  assert.deepEqual([...stats[0].refs], ["a", "b", "c"]);
  assert.equal(stats[0].waiting, 2);
  assert.equal(oakOpenUIPendingChildren(`${head}cmp = Compare([r1, r2])`)[0].kind, "compare");
  assert.equal(oakOpenUIPendingChildren(`${head}t = Timeline([x, y])`)[0].kind, "timeline");
  assert.equal(oakOpenUIPendingChildren(`${head}nums = Stats([`)[0].waiting, 2, "a line still being written holds two places");
  assert.deepEqual(oakOpenUIPendingChildren(`${head}nums = Stats([a])\na = Metric("x", "1", "claim-2")`), [], "settled children leave nothing pending");
  assert.deepEqual(oakOpenUIPendingChildren(`${head}x = Prose("claim-2")`), [], "other blocks never get a skeleton here");
});

test("a container finds its own entry from the children it already shows", () => {
  const plan = [{ kind: "stats", refs: ["a", "b"], waiting: 1 }, { kind: "compare", refs: ["r1", "r2"], waiting: 2 }];
  assert.equal(oakPendingFor(plan, "compare", ["r1"]).waiting, 2);
  assert.equal(oakPendingFor(plan, "timeline", []), null);
});

test("streaming layouts render aria-hidden skeletons in the settled shapes", () => {
  const stats = render("answer-openui-stats-streaming");
  assert.ok(count(stats, /oak-openui-skel[^>]*data-pending=""[^>]*aria-hidden="true"/g) >= 1, "stats tiles");
  const compare = render("answer-openui-compare-streaming");
  assert.match(compare, /oak-openui__compare-row oak-openui-skel/);
  const timeline = render("answer-openui-timeline-streaming");
  assert.equal(count(timeline, /oak__timeline-item oak-openui-skel|oak-openui__timeline-item oak-openui-skel/g), 2);
  for (const html of [stats, compare, timeline]) {
    assert.match(html, /aria-busy="true"/, "the answer is busy while it streams");
    assert.equal(count(html, /oak-openui-skel[^>]*data-pending/g) > 0, true);
  }
});

test("a settled answer has no skeleton and is not busy", () => {
  const html = render("answer-openui-proposal-topics");
  assert.equal(count(html, /oak-openui-skel/g), 0);
  assert.doesNotMatch(html, /aria-busy="true"/);
});

test("the brief proposal names the answer's pages and describes them to a screen reader", () => {
  const html = render("answer-openui-proposal-topics");
  assert.match(html, /oak-next-step__topics/);
  assert.match(html, /Pages from this answer/);
  assert.match(html, /aria-describedby="[^"]+ [^"]+"/, "hint and topics are both read");
});

test("skeletons hold still under reduced motion and add no new animation", () => {
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*:is\(\.oak-openui-card, \.oak-openui-source, \.oak-openui-skel\)\[data-pending\][^{]*\{\s*animation: none;/);
  assert.doesNotMatch(agentCss, /@keyframes oak-openui-skel/, "no keyframes of its own: the shimmer is the card skeleton's");
});

test("M1: a child OpenUI already draws, half written, is not drawn again as a skeleton", () => {
  const places = (program, kind, shown) => oakPendingPlaces(oakPendingFor(oakOpenUIPendingChildren(program), kind, shown), shown);
  // 3-item Stats, b half written: a and b are shown, only c is still to come.
  const stats = `${head}nums = Stats([a, b, c])\na = Metric("x", "1", "claim-2")\nb = Metric("y", "2", "claim-3"`;
  assert.equal(places(stats, "stats", ["a", "b"]), 1);
  assert.equal(places(`${stats}\nc = Metric("z", "3", "claim-4"`, "stats", ["a", "b", "c"]), 0, "3 tiles never show a 4th place");
  const compare = `${head}cmp = Compare([r1, r2])\nr1 = CompareRow("A", "claim-2", "claim-3")\nr2 = CompareRow("B", "claim-4", "claim-5"`;
  assert.equal(places(compare, "compare", ["r1", "r2"]), 0, "no extra row");
  assert.equal(places(compare, "compare", ["r1"]), 1);
});

test("M2: places are capped (Stats 4, Compare 5, Timeline 6) and duplicate refs count once", () => {
  const names = (n) => Array.from({ length: n }, (_, i) => `r${i}`).join(", ");
  const waiting = (kind, component, n) => oakOpenUIPendingChildren(`${head}x = ${component}([${names(n)}])`).find(entry => entry.kind === kind).waiting;
  assert.equal(waiting("compare", "Compare", 300), 5);
  assert.equal(waiting("timeline", "Timeline", 200), 6);
  assert.equal(waiting("stats", "Stats", 50), 4);
  assert.equal(oakOpenUIPendingChildren(`${head}x = Compare([r1, r1, r1])`)[0].waiting, 1, "duplicates count once");
  const many = oakOpenUIPendingChildren(`${head}x = Compare([${names(300)}])`)[0];
  assert.equal(oakPendingPlaces(many, ["r0", "r1"]), 3, "shown rows use up the cap");
  assert.equal(oakOpenUIPendingChildren(`${head}x = Compare([a, b, c, d`)[0].waiting, 4, "an open line counts the names already written");
});

test("a narrow Stats skeleton reserves a settled tile's height: label, number, a wrapped sentence and the chip row", () => {
  const tile = render("answer-openui-stats-streaming").match(/<div class="oak-openui-stats__tile oak-openui-skel"[\s\S]*?<\/span><\/div>/)?.[0] ?? "";
  assert.equal(count(tile, /oak-openui-card__bar/g), 10, "short, value, seven sentence bars, chip");
  assert.equal(count(tile, /data-chip=""/g), 1);
  assert.match(css, /\.oak-openui-skel \.oak-openui-card__bar\[data-chip\] \{\s*width: calc\(var\(--space-sm\) \* 5\);\s*height: calc\(var\(--space-md\) \+ var\(--space-micro\)\);/);
});

test("a Compare skeleton row holds three or four lines like a settled claim", () => {
  const rows = render("answer-openui-compare-streaming").match(/<div class="oak-openui__compare-row oak-openui-skel"[\s\S]*?<\/dd><\/div>/g) ?? [];
  assert.ok(rows.length >= 1);
  assert.equal(count(rows[0], /<dd><span class="oak-openui-card__bars">(?:<span class="oak-openui-card__bar"[^>]*><\/span>){4}<\/span><\/dd>/g), 2, "paired: four bars per claim");
});

// L1: Stats children written inline carry no statement name, so they must never borrow or add skeleton tiles.
const renderProgram = (program, status = "streaming") => {
  const message = stateOf("answer-openui-stats-streaming");
  const html = renderToStaticMarkup(createElement(OakArrangedAnswer,
    { id: "m", answer: { ...base, ...message.answer }, ui: { ...message.ui, program, status }, question: "q", citationLabels: labels, latest: true }));
  return { tiles: count(html, /oak-openui-stats__tile/g) - count(html, /oak-openui-stats__tile oak-openui-skel/g), skeletons: count(html, /oak-openui-stats__tile oak-openui-skel/g) };
};
const inlineStats = 'nums = Stats([Metric("Training images", "8K+", "claim-2"), Metric("Outcomes", "4", "claim-3")';

test("L1a: an open inline Stats line renders its two tiles and no skeletons", () => {
  assert.deepEqual(oakOpenUIPendingChildren(`${head}${inlineStats}`), [], "an inline open line holds no places");
  assert.deepEqual(renderProgram(`${head}${inlineStats}`), { tiles: 2, skeletons: 0 });
});

test("L1b: an inline Stats beside a pending named Stats shows only its own children", () => {
  // The 2 skeletons are the named `more` Stats' own places; the inline one used to add 2 more (4 in all).
  const program = `root = Answer([lead, nums, more, src])\nlead = Prose("claim-1")\n${inlineStats}])\nmore = Stats([c, d])`;
  assert.deepEqual(renderProgram(program), { tiles: 2, skeletons: 2 });
});

test("L1c: named children are unchanged", () => {
  const named = `${head}nums = Stats([a, b])\na = Metric("Training images", "8K+", "claim-2")\nb = Metric("Outcomes", "4", "claim-3")\nsrc = Sources()`;
  assert.deepEqual(renderProgram(named), { tiles: 2, skeletons: 0 });
  assert.equal(renderProgram(`${head}nums = Stats([a, b])\na = Metric("Training images", "8K+", "claim-2")`).skeletons, 1, "a named child still to come keeps its place");
});
