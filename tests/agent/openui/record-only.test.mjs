import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTsx } from "../design-rework/load-tsx.mjs";

// Ticket 46a: a record-only plan draws the planned record blocks from the cited records' facts, with no layout program and no model call.
globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, location: { search: "" }, addEventListener() {}, removeEventListener() {} };
const flag = loadTsx("src/lib/oakFlags/recordOnlyBlocks.ts");
const ownership = loadTsx("src/lib/oakFlags/ownership.ts");
const { oakAnswerPlanSchema } = loadTsx("packages/oak-agent-contracts/src/openui/plan.ts");
const { oakRecordOnlyProgram } = loadTsx("src/components/agent/OakRecordOnlyBlocks.tsx");
const { primeOakRecordFacts } = loadTsx("src/lib/oakRecordFacts.ts");
const { OakArrangedAnswer } = loadTsx("src/components/agent/OakOpenUIAnswer.tsx");

const REVISION = "k";
const cite = id => ({ documentId: id, passageId: `${id}:passage-001`, sectionId: `${id}:section-001`, url: `https://steveoak.com/${id.replace(":", "/")}/` });
const work = (title, extra = {}) => ({ kind: "work", dek: `${title} in one line.`, category: "Applied AI", articleStatus: "full", datePublished: "2025-01-01",
  cover: { src: `/c/${title}.webp`, alt: `${title} cover`, ratio: 1.91 }, coverTint: "#6fd39a", systemMap: [], artifacts: [], metrics: [], sections: [], ...extra });
const RECORDS = {
  "work:ecosmartloop": work("EcoSmartLoop", { ownership: { oak: ["Product direction", "Mobile app"], collaborators: ["Model training"] } }),
  "work:oakminder": work("Oakminder"),
};
const CLAIMS = [
  { id: "claim-1", text: "Steve built EcoSmartLoop and Oakminder.", citations: [cite("work:ecosmartloop")] },
  { id: "claim-2", text: "Steve owned the product side of EcoSmartLoop.", citations: [cite("work:ecosmartloop")] },
  { id: "claim-3", text: "Oakminder is a voice-first reminder agent.", citations: [cite("work:oakminder")] },
  { id: "claim-4", text: "Steve studied at SFBU.", citations: [cite("profile:education")] },
];
const PLAN = { mode: "record-only", blocks: [{ kind: "Prose", count: 1 }, { kind: "Ownership", count: 1 }, { kind: "Project", count: 2 }, { kind: "Steps", count: 3 }] };
const answer = { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "c", hardPolicyVersion: "h", knowledgeRevision: REVISION, operations: [],
  kind: "sourced", acknowledgment: null, claims: CLAIMS };
const render = (plan = PLAN) => renderToStaticMarkup(createElement(OakArrangedAnswer, { id: "m1", answer, question: "Who did what on EcoSmartLoop?", latest: true, ui: null, plan }));
const on = fn => { flag.forceOakRecordOnlyBlocks(true); ownership.forceOakOwnershipBlock(true); try { return fn(); } finally { flag.forceOakRecordOnlyBlocks(null); ownership.forceOakOwnershipBlock(null); } };
const placed = program => [...program.matchAll(/"(claim-\d+)"/g)].map(match => match[1]);
const kinds = program => [...program.matchAll(/= ([A-Z]\w+)\(/g)].map(match => match[1]).filter(kind => kind !== "Answer");

primeOakRecordFacts(REVISION, { version: 1, knowledgeRevision: REVISION, records: RECORDS });
// Ticket 167: Ownership's drawing is a lazy chunk, so one render with its constant on loads it before the tests read it.
on(() => render());
await new Promise(resolve => setTimeout(resolve, 50));

test("constant: oakRecordOnlyBlocks is pinned in flag-pins, and a force flips it both ways", () => {
  flag.forceOakRecordOnlyBlocks(true);
  assert.equal(flag.oakRecordOnlyBlocksOn(), true);
  flag.forceOakRecordOnlyBlocks(null);
  assert.equal(flag.oakRecordOnlyBlocksOn(), flag.oakRecordOnlyBlocks);
  flag.forceOakRecordOnlyBlocks(false);
  assert.equal(flag.oakRecordOnlyBlocksOn(), false);
  flag.forceOakRecordOnlyBlocks(null);
  assert.equal(flag.oakRecordOnlyBlocksOn(), flag.oakRecordOnlyBlocks);
});

test("contract: the plan takes an optional record-only mode and nothing else", () => {
  assert.ok(oakAnswerPlanSchema.safeParse(PLAN).success);
  assert.ok(oakAnswerPlanSchema.safeParse({ blocks: PLAN.blocks }).success, "a plan without a mode still parses");
  assert.ok(!oakAnswerPlanSchema.safeParse({ ...PLAN, mode: "arranged" }).success);
});

test("a record-only plan draws only blocks whose facts come from the cited records and places every claim once", () => {
  const facts = id => RECORDS[id] ?? null;
  const program = oakRecordOnlyProgram(PLAN, CLAIMS, facts);
  assert.deepEqual(kinds(program), ["Prose", "Ownership", "Project", "Points"], program);
  assert.match(program, /Ownership\("claim-2"\)/, "Ownership takes the claim whose record carries ownership lines");
  assert.match(program, /Project\(\["claim-3"\]\)/, "Project takes only claims citing a work record");
  assert.deepEqual(placed(program).sort(), CLAIMS.map(claim => claim.id), "every claim placed exactly once");
  assert.ok(!program.includes("Steps"), "a block that needs the model is never drawn");
  assert.equal(oakRecordOnlyProgram(PLAN, CLAIMS, () => null), null, "no cited record facts, no record blocks");
  assert.equal(oakRecordOnlyProgram({ blocks: PLAN.blocks }, CLAIMS, facts), null, "an arranged plan is not record-only");
});

test("on: the turn draws its record blocks with no model call; off, or an old client that drops the part, reads the plain answer", () => {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = (...args) => { calls.push(args[0]); return Promise.reject(new Error("no network")); };
  try {
    const html = on(() => render());
    assert.ok(html.includes("oak-ownership"), html);
    assert.ok(html.includes("Model training"), "Ownership reads the record's own lines");
    assert.deepEqual(calls, [], "no model call and no fetch: the facts were already loaded");
    flag.forceOakRecordOnlyBlocks(false);
    const off = render();
    flag.forceOakRecordOnlyBlocks(null);
    assert.ok(!off.includes("oak-ownership") && off.split("oak-answer__point").length - 1 === CLAIMS.length, off);
    assert.equal(on(() => render(null)).includes("oak-ownership"), false, "no plan, nothing new");
  } finally { globalThis.fetch = real; }
});

test("r46 M1: while the record facts load, the turn streams only its lead, then a missing load settles to the plain answer", () => {
  const late = { ...answer, knowledgeRevision: "k-late" };
  const planFirst = loadTsx("src/lib/oakFlags/planFirst.ts");
  const draw = () => { planFirst.forceOakPlanFirst(false); try { return renderToStaticMarkup(createElement(OakArrangedAnswer, { id: "m2", answer: late, question: "q", latest: true, ui: null, plan: PLAN, pending: true })); } finally { planFirst.forceOakPlanFirst(null); } };
  const html = on(draw);
  assert.ok(html.includes("data-streaming"), html);
  assert.ok(!html.includes("oak-answer__point"), "the plain answer never paints before the blocks");
  assert.ok(html.includes("Steve built EcoSmartLoop and Oakminder."), "the lead shows while the facts load");
  primeOakRecordFacts("k-late", null);
  const missing = on(draw);
  assert.ok(!missing.includes("data-streaming") && missing.split("oak-answer__point").length - 1 === CLAIMS.length, missing);
});
