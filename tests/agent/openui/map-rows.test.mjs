import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createLoader, loadTsx, stubSets } from "../design-rework/load-tsx.mjs";

// Ticket 57 row upgrades: Compare's matrix look, the Source card's open button, and the result Metric numeral, each behind its own constant.
globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, location: { search: "" }, addEventListener() {}, removeEventListener() {} };
const compareFlag = loadTsx("src/lib/oakFlags/compareMatrix.ts");
const sourceFlag = loadTsx("src/lib/oakFlags/sourceButton.ts");
const metricFlag = loadTsx("src/lib/oakFlags/metricResult.ts");
const { primeOakRecordFacts } = loadTsx("src/lib/oakRecordFacts.ts");
const { OakArrangedAnswer } = loadTsx("src/components/agent/OakOpenUIAnswer.tsx");

const REVISION = "k57r";
const base = { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "c", hardPolicyVersion: "h", operations: [], kind: "sourced", acknowledgment: null };
const labelsFor = (claims, revision) => ({ knowledgeRevision: revision, documents: [...new Map(claims.flatMap(claim => claim.citations).map(c => [c.documentId,
  { documentId: c.documentId, title: `${c.documentId}: page`, canonicalUrl: c.url.split("#")[0], card: { kind: "work", title: c.documentId, stack: [], image: "/images/cover.webp" } }])).values()] });
const shown = (html, claim) => html.includes(claim.text.slice(0, 40).replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;"));
const renderWith = Answer => (claims, program, revision = REVISION) => renderToStaticMarkup(createElement(Answer, { id: "m1", question: "q", latest: true,
  citationLabels: labelsFor(claims, revision),
  answer: { ...base, knowledgeRevision: revision, claims }, ui: { requestId: "00000000-0000-4000-8000-0000000000d8", status: "done", program } }));
const render = renderWith(OakArrangedAnswer);
// Heading's from and Callout's kind are in the schema only while their constant is on, so the on path loads its own module graph.
const onFlag = name => ({ [name]: true, [`${name}On`]: () => true, [`force${name[0].toUpperCase()}${name.slice(1)}`]() {} });
const onLoad = createLoader({ use: [stubSets.icons, stubSets.workspaceStore()], interop: true,
  stubs: { "@/lib/oakFlags/calloutKinds": onFlag("oakCalloutKinds"), "@/lib/oakFlags/headingChip": onFlag("oakHeadingChip") } });
const renderOn = renderWith(onLoad("src/components/agent/OakOpenUIAnswer.tsx").OakArrangedAnswer);
const primeOn = onLoad("src/lib/oakRecordFacts.ts").primeOakRecordFacts;
const forced = (flag, name, value = true) => fn => { flag[name](value); try { return fn(); } finally { flag[name](null); } };
const stored = JSON.parse(readFileSync("tests/agent/premium/stored-openui-programs.json", "utf8"));
const cite = slug => ({ documentId: `work:${slug}`, passageId: `work:${slug}:passage-001`, sectionId: `work:${slug}`, url: `https://steveoak.com/work/${slug}/` });
const facts = metrics => ({ kind: "work", category: "App", datePublished: "2025-04-01", articleStatus: "full", coverTint: "#e0af68",
  cover: { src: "/images/cover.webp", alt: "Cover" }, systemMap: [], artifacts: [], metrics, sections: [], dek: "" });

for (const [file, flag, name, force, ships] of [["compareMatrix", compareFlag, "oakCompareMatrix", "forceOakCompareMatrix", true],
  ["sourceButton", sourceFlag, "oakSourceButton", "forceOakSourceButton", true], ["metricResult", metricFlag, "oakMetricResult", "forceOakMetricResult", false]]) {
  test(`constant: ${name} (${file}.ts) ships ${ships} and a force flips it`, () => {
    assert.equal(flag[name], ships);
    assert.equal(flag[`${name}On`](), ships);
    flag[force](!ships);
    assert.equal(flag[`${name}On`](), !ships);
    flag[force](null);
    assert.equal(flag[`${name}On`](), ships);
  });
}

test("compare: every stored Compare program renders as before off, and on keeps also, the named columns and ticket 88's cell names", () => {
  const items = stored.filter(item => /Compare\(/.test(item.program));
  assert.ok(items.length >= 2);
  for (const item of items) {
    const off = forced(compareFlag, "forceOakCompareMatrix", false)(() => render(item.answer.claims, item.program, item.answer.knowledgeRevision));
    const on = forced(compareFlag, "forceOakCompareMatrix")(() => render(item.answer.claims, item.program, item.answer.knowledgeRevision));
    assert.doesNotMatch(off, /data-matrix/);
    for (const claim of item.answer.claims) assert.ok(shown(on, claim), `${item.id} ${claim.id}`);
    assert.match(on, /<dl class="oak-openui__compare" data-matrix=""/);
    assert.equal(on.split("oak-openui__compare-col").length, off.split("oak-openui__compare-col").length, "each cell still names its column");
    assert.equal(on.split('<span class="sr-only">:</span>').length, off.split('<span class="sr-only">:</span>').length);
    if (/oak-openui__compare-head/.test(off)) assert.match(on, /oak-openui__compare-head" data-matrix=""/);
  }
});

test("source: the open button is a white icon on a capsule concentric with the page, only with the constant on", () => {
  const item = stored.find(entry => /Source\(/.test(entry.program));
  const off = forced(sourceFlag, "forceOakSourceButton", false)(() => render(item.answer.claims, item.program, item.answer.knowledgeRevision));
  const on = forced(sourceFlag, "forceOakSourceButton")(() => render(item.answer.claims, item.program, item.answer.knowledgeRevision));
  assert.doesNotMatch(off, /data-button/);
  assert.match(on, /oak-openui-source__open" data-button=""/);
  const css = readFileSync("src/styles/openui/source.css", "utf8");
  const rule = css.match(/\.oak-openui-source__open\[data-button\] \{([^}]*)\}/)?.[1] ?? "";
  assert.match(rule, /color: var\(--text\)/, "white icon");
  const inset = rule.match(/right: (var\([^)]+\))/)?.[1];
  assert.ok(inset, "inset from the page edge");
  assert.match(rule, new RegExp(`bottom: ${inset.replace(/[()]/g, "\\$&")}`), "same inset on both edges");
  assert.match(rule, new RegExp(`border-radius: calc\\(var\\(--oak-r-card\\) - ${inset.replace(/[()]/g, "\\$&")}\\)`), "radius is the page radius less the inset");
});

test("metric: only a result metric gets the display numeral with its cover glow, and drops the glyph", () => {
  const claims = [{ id: "claim-1", text: "Classification reached 92% accuracy in the pilot.", citations: [cite("ecosmartloop")] }];
  const program = 'root = Answer([m])\nm = Metric("Accuracy", "92%", "claim-1")';
  const seed = kind => primeOakRecordFacts(REVISION, { version: 1, knowledgeRevision: REVISION, records: { "work:ecosmartloop": facts([{ label: "Accuracy", value: "92%", ...kind }]) } });
  const on = forced(metricFlag, "forceOakMetricResult");
  seed({ kind: "result" });
  on(() => render(claims, program));
  const result = on(() => render(claims, program));
  assert.match(result, /oak-openui__metric" data-result="" style="--oak-metric-tint:#e0af68"/);
  assert.doesNotMatch(result, /oak-openui__glyph/);
  assert.ok(result.includes(claims[0].text));
  assert.doesNotMatch(render(claims, program), /data-result/, "constant off reads as today");
  seed({ kind: "context" });
  assert.doesNotMatch(on(() => render(claims, program)), /data-result/, "a context metric never glows");
  seed({});
  assert.match(on(() => render(claims, program)), /oak-openui__glyph/, "no kind reads as today");
  assert.match(readFileSync("src/styles/openui/metric.css", "utf8"), /\[data-result\][^{]*\{[^}]*filter: drop-shadow\([^;]*--oak-metric-tint/);
});

const calloutFlag = loadTsx("src/lib/oakFlags/calloutKinds.ts");
const headingFlag = loadTsx("src/lib/oakFlags/headingChip.ts");

for (const [file, flag, name, force] of [["calloutKinds", calloutFlag, "oakCalloutKinds", "forceOakCalloutKinds"], ["headingChip", headingFlag, "oakHeadingChip", "forceOakHeadingChip"]]) {
  test(`constant: ${name} (${file}.ts) ships false and a force flips it`, () => {
    assert.equal(flag[name], false);
    flag[force](true);
    assert.equal(flag[`${name}On`](), true);
    flag[force](null);
    assert.equal(flag[`${name}On`](), false);
  });
}

test("callout: a typed banner gets its own icon and word with the constant on and agreeing facts; untyped and off read as today", () => {
  const item = stored.find(entry => /Callout\(/.test(entry.program));
  const revision = item.answer.knowledgeRevision;
  primeOn(revision, { version: 1, knowledgeRevision: revision, records: { "work:ecosmartloop": { ...facts([]), articleStatus: "in-progress-stub" } } });
  const today = render(item.answer.claims, item.program, item.answer.knowledgeRevision);
  assert.equal(renderOn(item.answer.claims, item.program, revision), today, "a stored Callout with no kind is unchanged");
  const id = item.program.match(/Callout\("([^"]+)"/)[1];
  const typed = item.program.replace(/Callout\("([^"]+)"\)/, 'Callout("$1", "held")');
  assert.doesNotMatch(render(item.answer.claims, typed, item.answer.knowledgeRevision), /data-kind/, "constant off ignores the kind");
  const held = renderOn(item.answer.claims, typed, revision);
  assert.match(held, /oak-openui__callout" role="note" data-kind="held"/);
  assert.match(held, /oak-openui__callout-kind">Not published yet</);
  assert.ok(shown(held, item.answer.claims.find(claim => claim.id === id)));
  const words = new Set(["held", "now", "guard"].map(kind => renderOn(item.answer.claims, item.program.replace(/Callout\("([^"]+)"\)/, `Callout("$1", "${kind}")`), revision).match(/callout-kind">([^<]+)</)[1]));
  assert.equal(words.size, 3, "each kind names itself in words");
});

test("callout: a banner the cited record does not back is dropped, and the caveat renders plain", () => {
  const item = stored.find(entry => /Callout\(/.test(entry.program));
  const revision = item.answer.knowledgeRevision;
  const typed = kind => item.program.replace(/Callout\("([^"]+)"\)/, `Callout("$1", "${kind}")`);
  primeOn(revision, { version: 1, knowledgeRevision: revision, records: { "work:ecosmartloop": facts([]) } });
  const plain = renderOn(item.answer.claims, item.program, revision);
  for (const kind of ["held", "now", "off"]) assert.equal(renderOn(item.answer.claims, typed(kind), revision), plain, `${kind} over a published record reads plain`);
  primeOn(revision, { version: 1, knowledgeRevision: revision, records: { "work:ecosmartloop": { ...facts([]), articleStatus: "in-progress-stub" } } });
  assert.match(renderOn(item.answer.claims, typed("now"), revision), /callout-kind">In progress</, "an in-progress record backs now");
  assert.equal(renderOn(item.answer.claims, typed("off"), revision), plain, "a cited claim is never off the record");
  assert.equal(renderOn(item.answer.claims, typed("held"), "other"), renderOn(item.answer.claims, item.program, "other"), "no facts, no banner");
});

test("heading: the provenance chip shows only with the constant on and a from label; a stored Heading is unchanged", () => {
  const item = stored.find(entry => /Heading\(/.test(entry.program));
  const today = render(item.answer.claims, item.program, item.answer.knowledgeRevision);
  assert.equal(renderOn(item.answer.claims, item.program, item.answer.knowledgeRevision), today);
  const chipped = item.program.replace(/Heading\("([^"]+)"\)/, 'Heading("$1", "Case study records")');
  assert.doesNotMatch(render(item.answer.claims, chipped, item.answer.knowledgeRevision), /heading-chip/);
  assert.match(renderOn(item.answer.claims, chipped, item.answer.knowledgeRevision), /<span class="oak-openui__heading-chip"><span class="sr-only">, from <\/span>Case study records<\/span>/);
  assert.doesNotMatch(renderOn(item.answer.claims, item.program.replace(/Heading\("([^"]+)"\)/, 'Heading("$1", "3 case studies")'), item.answer.knowledgeRevision), /heading-chip/, "a chip never states a number");
});
