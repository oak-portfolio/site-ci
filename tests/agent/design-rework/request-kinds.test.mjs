import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createLoader, loadTsx, stubSets } from "./load-tsx.mjs";

const REVISION = "k60r";
const cite = slug => ({ documentId: `work:${slug}`, passageId: `work:${slug}:passage-001`, sectionId: `work:${slug}`, url: `https://steveoak.com/work/${slug}/` });
const labelsFor = (claims, revision) => ({ knowledgeRevision: revision, documents: [...new Map(claims.flatMap(claim => claim.citations).map(c => [c.documentId,
  { documentId: c.documentId, title: `${c.documentId.slice(5)}: page`, canonicalUrl: c.url, cover: "/images/cover.webp",
    card: { kind: "work", title: c.documentId === "work:ecosmartloop" ? "EcoSmartLoop" : c.documentId, stack: [], image: "/images/cover.webp" } }])).values()] });
const facts = extra => ({ kind: "work", category: "App", datePublished: "2025-04-01", articleStatus: "full", coverTint: "#e0af68",
  cover: { src: "/images/cover.webp", alt: "Cover" }, systemMap: [], artifacts: [], metrics: [], dek: "", sections: [], ...extra });
const DECISIONS = ["Owned the product-side full stack", "Led the V1 to V2 product shift"];

const flags = { decisions: loadTsx("src/lib/oakFlags/kindDecisions.ts"), similar: loadTsx("src/lib/oakFlags/kindSimilar.ts"), unresolved: loadTsx("src/lib/oakFlags/kindUnresolved.ts") };
for (const [kind, name] of [["decisions", "oakKindDecisions"], ["similar", "oakKindSimilar"], ["unresolved", "oakKindUnresolved"]]) {
  test(`request kinds: ${name} is pinned in flag-pins, and a force flips it both ways`, () => {
    const flag = flags[kind], force = `force${name[0].toUpperCase()}${name.slice(1)}`;
    flag[force](true);
    assert.equal(flag[`${name}On`](), true);
    flag[force](null);
    assert.equal(flag[`${name}On`](), flag[name]);
    flag[force](false);
    assert.equal(flag[`${name}On`](), false);
    flag[force](null);
    assert.equal(flag[`${name}On`](), flag[name]);
  });
}

const base = { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "c", hardPolicyVersion: "h", operations: [], kind: "sourced", acknowledgment: null };
const renderWith = Answer => (claims, program) => renderToStaticMarkup(createElement(Answer, { id: "m1", question: "q", latest: true,
  citationLabels: labelsFor(claims, REVISION), answer: { ...base, knowledgeRevision: REVISION, claims },
  ui: { requestId: "00000000-0000-4000-8000-0000000000e0", status: "done", program } }));
const { OakArrangedAnswer } = loadTsx("src/components/agent/OakOpenUIAnswer.tsx");
const renderOff = renderWith(OakArrangedAnswer);
const onFlag = name => ({ [name]: true, [`${name}On`]: () => true, [`force${name[0].toUpperCase()}${name.slice(1)}`]() {} });
const onLoad = createLoader({ use: [stubSets.icons, stubSets.workspaceStore()], interop: true, stubs: { "@/lib/oakFlags/kindDecisions": onFlag("oakKindDecisions") } });
const renderOn = renderWith(onLoad("src/components/agent/OakOpenUIAnswer.tsx").OakArrangedAnswer);
const primeOn = onLoad("src/lib/oakRecordFacts.ts").primeOakRecordFacts;
const claims = [{ id: "claim-1", text: "Steve chose a scanner-first flow over manual entry.", citations: [cite("ecosmartloop")] }];
const tradeoffs = { anchor: "the-tradeoffs-that-made-it-real", title: "The tradeoffs that made it real" };
const program = mode => `root = Answer([p])\np = Points(["claim-1"]${mode ? `, "${mode}"` : ""})`;

test("decisions: rows come only from ownership.oak of the cited record, with a link to its tradeoffs section", () => {
  primeOn(REVISION, { version: 1, knowledgeRevision: REVISION, records: { "work:ecosmartloop": { ...facts({ sections: [{ anchor: "stack", title: "Stack" }, tradeoffs] }),
    ownership: { oak: DECISIONS, collaborators: ["Frank owned LEAF Engine training"] } } } });
  const html = renderOn(claims, program("decisions"));
  assert.match(html, /class="oak-kind-decisions"/);
  assert.match(html, /What Steve owned on EcoSmartLoop/, "the head names what the rows are: Steve's ownership");
  assert.doesNotMatch(html, /decisions on/);
  for (const line of DECISIONS) assert.ok(html.includes(line), line);
  assert.doesNotMatch(html, /Frank owned/, "collaborators are not Steve's decisions");
  assert.match(html, /href="https:\/\/steveoak\.com\/work\/ecosmartloop\/#the-tradeoffs-that-made-it-real"/);
  assert.ok(html.includes("scanner-first flow"), "the claim stays");
});

test("decisions: no ownership.oak on the record (the live asset today) or no tradeoffs section renders no invented rows", () => {
  primeOn(REVISION, { version: 1, knowledgeRevision: REVISION, records: { "work:ecosmartloop": facts({ sections: [tradeoffs] }) } });
  const bare = renderOn(claims, program("decisions"));
  assert.doesNotMatch(bare, /oak-kind-decisions/);
  assert.equal(bare, renderOn(claims, program()), "degrades to today's Points list");
  primeOn(REVISION, { version: 1, knowledgeRevision: REVISION, records: { "work:ecosmartloop": { ...facts({}), ownership: { oak: DECISIONS, collaborators: [] } } } });
  const unlinked = renderOn(claims, program("decisions"));
  assert.match(unlinked, /oak-kind-decisions/);
  assert.doesNotMatch(unlinked, /#the-tradeoffs/);
});

test("decisions: a record with no resolvable title shows no row and never a raw slug", () => {
  const brain = [{ id: "claim-1", text: "Steve routed tools.", citations: [cite("agentic-brain")] }];
  primeOn(REVISION, { version: 1, knowledgeRevision: REVISION, records: { "work:agentic-brain": { ...facts({}), ownership: { oak: DECISIONS, collaborators: [] } } } });
  const untitled = answerClaims => renderToStaticMarkup(createElement(onLoad("src/components/agent/OakOpenUIAnswer.tsx").OakArrangedAnswer, { id: "m1", question: "q", latest: true,
    citationLabels: { knowledgeRevision: REVISION, documents: [] }, answer: { ...base, knowledgeRevision: REVISION, claims: answerClaims },
    ui: { requestId: "00000000-0000-4000-8000-0000000000e0", status: "done", program: program("decisions") } }));
  const html = untitled(brain);
  assert.doesNotMatch(html, /agentic-brain<|on agentic-brain|oak-kind-decisions/);
  assert.ok(html.includes("Steve routed tools."), "the claim stays as today's list");
});

test("decisions: constant off renders today's Points view", () => {
  assert.doesNotMatch(renderOff(claims, program()), /oak-kind-decisions/);
  assert.equal(renderOn(claims, program()), renderOff(claims, program()), "an unmoded Points is unchanged");
});

const { OakAdviceAnswer } = loadTsx("src/components/agent/OakAdviceAnswer.tsx");
const advice = evidence => ({ kind: "advice", scope: "supported-expertise", knowledgeRevision: REVISION,
  proposal: { recommendation: "Decide what a wrong answer costs.", assumptions: ["A"], tradeoffs: ["B"], nextStep: "List the failure cases." },
  uncertainty: "General guidance, not a review.", evidence, contactOffer: false });
const adviceHtml = answer => renderToStaticMarkup(createElement(OakAdviceAnswer, { answer, contactPreference: "open", onBrief() {}, onDecline() {}, citationLabels: labelsFor(answer.evidence, REVISION) }));
const withFlag = (flag, force, fn) => { flag[force](true); try { return fn(); } finally { flag[force](null); } };

test("similar: one cited case study shows as a Project card beside the advice, labeled Steve's record and never as advice", () => {
  const evidence = [{ id: "e1", text: "Orbi AI explains each sort and shows its sources.", citations: [cite("ecosmartloop")] },
    { id: "e2", text: "Agentic Brain routed tools.", citations: [cite("agentic-brain")] }];
  const html = withFlag(flags.similar, "forceOakKindSimilar", () => adviceHtml(advice(evidence)));
  const at = html.indexOf('class="oak-kind-similar"');
  assert.ok(at > 0, "the similar-build section renders");
  assert.ok(at > html.lastIndexOf("</section>", at - 1) && !html.slice(0, at).endsWith("<section"), "a sibling section");
  const section = html.slice(at);
  assert.equal(section.match(/oak-openui-project/g)?.length, 1, "exactly one case study");
  assert.match(section, /EcoSmartLoop/);
  assert.equal(section.match(/<h4/g)?.length, 1, "one section heading");
  assert.match(section, /<h5 class="oak-openui-card__title">/, "the card title sits one level under the section heading");
  assert.match(section, /Steve’s record/);
  assert.doesNotMatch(section, /[Aa]dvice/, "the record never reads as advice");
  assert.match(html.slice(0, at), /Oak AI’s general advice, not Steve’s/, "the advice says it is not Steve's");
  assert.equal(html.match(/oak-advice-card oak-answer-card/g)?.length, 1);
  assert.doesNotMatch(html.slice(html.indexOf("oak-advice-card"), at), /oak-openui-project/, "no card in the advice card");
});

test("similar: no cited case study shows nothing new, and the constant off renders today's advice", () => {
  const evidence = [{ id: "e1", text: "Steve shipped retrieval first.", citations: [cite("ecosmartloop")] }];
  flags.similar.forceOakKindSimilar(false);
  const today = adviceHtml(advice(evidence));
  flags.similar.forceOakKindSimilar(null);
  assert.doesNotMatch(today, /oak-kind-similar|general advice, not Steve/);
  const none = withFlag(flags.similar, "forceOakKindSimilar", () => adviceHtml(advice([])));
  flags.similar.forceOakKindSimilar(false);
  const noneOff = adviceHtml(advice([]));
  flags.similar.forceOakKindSimilar(null);
  assert.equal(none, noneOff, "nothing cited, nothing added");
});

const { OakDocumentAnswer } = loadTsx("src/components/agent/OakDocumentAnswer.tsx");
const span = (id, quote, start, page) => ({ id, quote, citation: { sourceId: `visitor-document:00000000-0000-4000-8000-000000000200:section-1:${start}-${start + quote.length}`,
  label: "Document 1", sectionId: "section-1", start, end: start + quote.length, ...(page ? { sourcePage: page } : {}) } });
const docAnswer = list => ({ kind: "document", claims: list, coverage: { scope: "selected-spans-only", offsetUnit: "utf16",
  includedUtf16: 400, availableUtf16: 400, omittedUtf16: 0, quotedUtf16: list.reduce((sum, claim) => sum + claim.quote.length, 0), extractionCompleteness: "complete" } });
const docHtml = answer => renderToStaticMarkup(createElement(OakDocumentAnswer, { answer }));

test("unresolved: questions inside longer quotes list once under an honest label, from the private answer only, nothing fetched or stored", () => {
  const answer = docAnswer([span("d1", "We will ship the classifier in Q3. Who owns the retry policy?", 0, 1), span("d2", "Who owns the retry policy? Legal has not said.", 70, 2),
    span("d3", "Latency matters. What error rate is acceptable?", 120), span("d4", "Is the budget fixed?", 170, 3)]);
  const touched = [];
  const saved = { fetch: globalThis.fetch, localStorage: globalThis.localStorage };
  globalThis.fetch = () => { touched.push("fetch"); throw new Error("no fetch"); };
  globalThis.localStorage = { setItem() { touched.push("storage"); }, getItem() { touched.push("storage"); return null; } };
  let html;
  try { html = withFlag(flags.unresolved, "forceOakKindUnresolved", () => docHtml(answer)); }
  finally { Object.assign(globalThis, saved); }
  assert.deepEqual(touched, [], "the list never leaves the private turn");
  const at = html.indexOf('class="oak-kind-unresolved"');
  assert.ok(at > 0);
  const section = html.slice(at);
  assert.match(section, /Questions this document raises/);
  assert.doesNotMatch(html, /leaves open/, "the label never claims a question stays unanswered");
  const rows = [...section.matchAll(/<li[^>]*>(.*?)<\/li>/g)].map(match => match[1]);
  assert.equal(rows.length, 2);
  assert.match(rows[0], /^<span>Who owns the retry policy\?<\/span>/);
  assert.match(rows[0], /Page 1/);
  assert.match(rows[1], /^<span>What error rate is acceptable\?<\/span>/);
  assert.doesNotMatch(section, /ship the classifier|Latency matters|Legal has not said/, "only the question sentence, never the whole quote again");
  assert.doesNotMatch(section, /Is the budget fixed/, "a quote that is only a question is already on the card above");
});

test("unresolved: no question in the answer, only whole-quote questions, or the constant off, renders today's document card", () => {
  const plain = docAnswer([span("d1", "We will ship the classifier in Q3.", 0, 1)]);
  assert.equal(withFlag(flags.unresolved, "forceOakKindUnresolved", () => docHtml(plain)), docHtml(plain));
  const whole = docAnswer([span("d1", "Who owns the retry policy?", 0, 1), span("d2", "What error rate is acceptable?", 40)]);
  assert.equal(withFlag(flags.unresolved, "forceOakKindUnresolved", () => docHtml(whole)), docHtml(whole), "nothing left to add renders nothing");
  const asks = docAnswer([span("d2", "Who owns the retry policy?", 40, 2)]);
  assert.doesNotMatch(docHtml(asks), /oak-kind-unresolved/);
});
