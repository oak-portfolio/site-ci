import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadTsx } from "../design-rework/load-tsx.mjs";

const { oakAnswerPlanSchema, oakPlanFor, oakPlanOrder } = loadTsx("packages/oak-agent-contracts/src/openui/plan.ts");
const { oakRequestKinds } = loadTsx("packages/oak-agent-contracts/src/openui/plan-rule.ts");
const { OAK_OPENUI_BLOCKS, OAK_PENDING_CAP } = loadTsx("packages/oak-agent-contracts/src/openui/blocks.generated.ts");
const taught = JSON.parse(readFileSync("packages/oak-agent-contracts/src/openui/taught.json", "utf8"));

const hits = (...ids) => ids.map(documentId => ({ documentId }));
const one = hits("work:oakminder", "work:oakminder", "work:oakminder");
const pair = hits("work:ecosmartloop", "work:oakminder", "work:ecosmartloop", "work:oakminder");
const all = hits("work:ecosmartloop", "work:oakminder", "work:omnisocial", "work:agentic-brain", "work:linkedin-growth-loop");

const EXAMPLES = {
  "overview": all,
  "project-deep-dive": one,
  "how-it-works": hits("work:ecosmartloop", "work:ecosmartloop", "work:ecosmartloop"),
  "compare-projects": pair,
  "timeline": hits("work:ecosmartloop", "work:agentic-brain", "experience:sfbu"),
  "skills": hits("experience:hyperskalers", "work:oakminder", "work:ecosmartloop"),
  "stack": one,
  "results-metrics": hits("work:ecosmartloop", "work:ecosmartloop", "work:ecosmartloop"),
  "who-did-what": hits("work:ecosmartloop", "work:ecosmartloop"),
  "tradeoffs": hits("work:ecosmartloop", "work:ecosmartloop"),
  "method-process": hits("work:oakminder", "experience:hyperskalers", "work:oakminder"),
  "lessons": pair,
  "employer-experience": hits("experience:hyperskalers", "experience:hyperskalers"),
};
const kindsOf = plan => plan?.blocks.map(block => block.kind);
const shapeOf = plan => plan?.blocks.map(block => `${block.kind} x${block.count}`) ?? null;
const planOf = (kind, audience, only = taught) => oakPlanFor(kind, EXAMPLES[kind], audience, only);

const ROUTED = [
  ["What did Steve do at each of his recent roles?", "employer-experience", hits("experience:hyperskalers", "experience:sfbu", "experience:aiml"), ["Prose x1", "Role x3", "Table x3"]],
  ["What are Steve's numbers?", "results-metrics", hits("work:ecosmartloop", "work:oakminder", "work:omnisocial"), ["Prose x1", "Project x3", "Stats x3", "Sources x3"]],
  ["What stack did Oakminder use?", "stack", hits("work:oakminder", "work:oakminder", "work:agentic-brain"), ["Prose x1", "Project x2", "Stack x1", "Sources x2"]],
  ["What tech did Steve use on Oakminder?", "stack", hits("work:oakminder", "work:oakminder", "work:oakminder"), ["Prose x1", "Project x1", "Stack x1", "Sources x1"]],
  ["Walk me through how Oakminder was built", "how-it-works", hits("work:oakminder", "work:oakminder", "work:agentic-brain"), ["Prose x1", "Diagram x1", "Project x2", "Steps x3", "Sources x2"]],
  ["What did Steve do at HyperSkalers?", "employer-experience", hits("experience:hyperskalers", "work:oakminder"), ["Prose x1", "Role x1", "Table x2"]],
  ["What results did EcoSmartLoop get?", "results-metrics", hits("work:ecosmartloop", "work:oakminder"), ["Prose x1", "Project x2", "Stats x2", "Sources x2"]],
  ["Compare EcoSmartLoop and Oakminder.", "compare-projects", hits("work:ecosmartloop", "work:ecosmartloop"), ["Prose x1", "Table x2"]],
  ["What has Steve built?", "overview", hits("profile:steve", "experience:hyperskalers"), ["Prose x1", "Profile x1"]],
  ["Tell me about Steve's career", "timeline", hits("experience:hyperskalers", "experience:sfbu"), ["Prose x1", "Timeline x2"]],
];

test("plan: the kind the Worker decided picks the blocks, whatever mix of records search returns", () => {
  for (const [question, kind, found, shape] of ROUTED) assert.deepEqual(shapeOf(oakPlanFor(kind, found, undefined, taught)), shape, `${kind}: ${question}`);
});

test("plan: each request kind maps to a plan of 2 to 6 taught kinds, lead first", () => {
  assert.deepEqual(Object.keys(EXAMPLES).sort(), [...oakRequestKinds].sort());
  for (const [kind, found] of Object.entries(EXAMPLES)) {
    const plan = oakPlanFor(kind, found, undefined, taught);
    assert.ok(plan, `${kind} plans`);
    assert.ok(plan.blocks.length >= 2 && plan.blocks.length <= 6, `${kind} has 2 to 6 blocks`);
    assert.deepEqual(plan.blocks[0], { kind: "Prose", count: 1 }, `${kind} opens on the lead`);
    assert.ok(plan.blocks.every(block => taught.includes(block.kind)), `${kind} plans only taught kinds`);
    assert.equal(new Set(kindsOf(plan)).size, plan.blocks.length, `${kind} plans each component once`);
    assert.deepEqual(oakAnswerPlanSchema.parse(plan), plan, `${kind} parses`);
  }
});

test("plan: the taxonomy's orders hold after the lead moves first", () => {
  assert.deepEqual(kindsOf(planOf("how-it-works")), ["Prose", "Diagram", "Project", "Steps", "Sources"]);
  assert.deepEqual(kindsOf(planOf("results-metrics")), ["Prose", "Project", "Stats", "Sources"]);
  assert.deepEqual(kindsOf(planOf("lessons")), ["Prose", "Points", "Project"]);
  assert.deepEqual(kindsOf(planOf("compare-projects")), ["Prose", "Table"]);
});

test("plan: counts come from the search hits, capped per kind", () => {
  assert.deepEqual(planOf("overview").blocks[1], { kind: "Profile", count: 1 });
  assert.deepEqual(planOf("overview").blocks[2], { kind: "ProjectWall", count: 5 });
  assert.deepEqual(planOf("compare-projects").blocks[1], { kind: "Table", count: 4 });
  assert.deepEqual(planOf("employer-experience").blocks[1], { kind: "Role", count: 1 });
  const many = hits(...Array.from({ length: 9 }, (_, index) => index % 2 ? "work:ecosmartloop" : "work:oakminder"));
  assert.deepEqual(oakPlanFor("compare-projects", many, undefined, taught.filter(name => name !== "Table")).blocks[1], { kind: "Compare", count: OAK_PENDING_CAP.compare });
  assert.deepEqual(oakPlanFor("compare-projects", many, undefined, taught).blocks[1], { kind: "Table", count: 6 });
  const stories = hits(...Array.from({ length: 9 }, () => "work:ecosmartloop"));
  assert.deepEqual(oakPlanFor("how-it-works", stories, undefined, taught).blocks.find(block => block.kind === "Steps"), { kind: "Steps", count: 6 });
});

test("plan: a kind not in taught.json is never planned", () => {
  for (const kind of Object.keys(EXAMPLES)) {
    for (const planned of kindsOf(planOf(kind)).slice(1)) {
      const plan = planOf(kind, undefined, taught.filter(name => name !== planned));
      assert.ok(!kindsOf(plan)?.includes(planned), `${kind} without ${planned}`);
    }
  }
  assert.equal(planOf("how-it-works", undefined, taught.filter(name => name !== "Prose")), null);
  assert.equal(planOf("compare-projects", undefined, taught.filter(name => name !== "Compare" && name !== "Table")), null);
});

test("plan: every taught component is in a plan rule or declares planned: false", () => {
  const fallbacks = taught.filter(name => OAK_OPENUI_BLOCKS[name]?.plan?.replaces).map(name => taught.filter(other => other !== name));
  const ruled = new Set([taught, ...fallbacks].flatMap(only => Object.keys(EXAMPLES).flatMap(kind => kindsOf(planOf(kind, undefined, only)) ?? [])));
  for (const name of taught) {
    const block = OAK_OPENUI_BLOCKS[name];
    assert.ok(block, `${name} is registered`);
    assert.ok(block.planned === false || ruled.has(name), `${name} is planned by some request kind (or stands in when the block replacing it is untaught) or says planned: false`);
    if (block.plan) for (const kind of Object.keys(block.plan.in)) assert.ok(oakRequestKinds.includes(kind), `${name} names request kind ${kind}`);
  }
});

test("plan: the five flip1 blocks are taught, and each planned one is planned by its own request kind", () => {
  const planned = { Profile: "overview", ProjectWall: "overview", Table: "compare-projects", Diagram: "how-it-works" };
  for (const [name, kind] of Object.entries(planned)) {
    assert.ok(taught.includes(name), `${name} is in taught.json`);
    assert.ok(kindsOf(planOf(kind)).includes(name), `${kind} plans ${name}`);
  }
  assert.ok(taught.includes("PageCards"), "PageCards is in taught.json");
  assert.equal(OAK_OPENUI_BLOCKS.PageCards.planned, false, "PageCards is picked by the model alone");
});

test("plan: a newer block replaces the older one only on its own ticket's shapes, and the older one stays everywhere else", () => {
  const link = { entry: "experience:hyperskalers", caseStudy: "work:oakminder", approved: true };
  const overviewLinked = oakPlanFor("overview", hits("experience:hyperskalers", ...all.map(hit => hit.documentId)), undefined, taught, [link]);
  for (const plan of [planOf("overview"), overviewLinked]) {
    assert.ok(kindsOf(plan).includes("ProjectWall"), "overview plans ProjectWall (ticket 31: What has Steve built?)");
    assert.equal(kindsOf(plan).includes("Project"), false, "overview never also plans Project");
  }
  assert.ok(kindsOf(planOf("compare-projects")).includes("Table"), "compare-projects plans Table (ticket 33: Compare p1 and p2)");
  assert.equal(kindsOf(planOf("compare-projects")).includes("Compare"), false, "compare-projects never also plans Compare");
  assert.ok(kindsOf(planOf("overview", undefined, taught.filter(name => name !== "ProjectWall"))).includes("Project"), "untaught ProjectWall leaves Project in overview");
  assert.ok(kindsOf(planOf("compare-projects", undefined, taught.filter(name => name !== "Table"))).includes("Compare"), "untaught Table leaves Compare in compare-projects");
  for (const kind of ["project-deep-dive", "how-it-works", "stack", "results-metrics", "who-did-what", "tradeoffs", "method-process", "lessons"]) {
    assert.ok(kindsOf(planOf(kind)).includes("Project"), `${kind} still plans Project`);
  }
  assert.ok(kindsOf(oakPlanFor("employer-experience", EXAMPLES["employer-experience"], undefined, taught, [link])).includes("Project"), "an approved link still unlocks Project outside overview");
  for (const kind of oakRequestKinds) {
    const names = kindsOf(oakPlanFor(kind, EXAMPLES[kind], undefined, taught)) ?? [];
    assert.equal(names.includes("Project") && names.includes("ProjectWall"), false, `${kind} plans one of Project and ProjectWall`);
    assert.equal(names.includes("Compare") && names.includes("Table"), false, `${kind} plans one of Compare and Table`);
  }
});

test("plan: purpose reorders only the blocks after the lead", () => {
  assert.deepEqual(kindsOf(planOf("who-did-what", "recruiter")), ["Prose", "Points", "Project"]);
  assert.deepEqual(kindsOf(planOf("how-it-works", "learner")), ["Prose", "Steps", "Diagram", "Project", "Sources"]);
  assert.deepEqual(kindsOf(planOf("stack", "collaborator")), ["Prose", "Stack", "Project", "Sources"]);
  assert.deepEqual(kindsOf(planOf("results-metrics", "recruiter")), ["Prose", "Stats", "Project", "Sources"]);
  for (const kind of Object.keys(EXAMPLES)) {
    const plain = planOf(kind);
    for (const audience of ["recruiter", "collaborator", "learner"]) {
      const ordered = planOf(kind, audience);
      assert.deepEqual(ordered.blocks[0], plain.blocks[0], `${kind} keeps its lead for ${audience}`);
      assert.deepEqual([...ordered.blocks].sort((a, b) => a.kind.localeCompare(b.kind)), [...plain.blocks].sort((a, b) => a.kind.localeCompare(b.kind)));
    }
  }
  const arranged = [{ kind: "Prose" }, { kind: "Project" }, { kind: "Points" }, { kind: "Steps" }];
  assert.deepEqual(oakPlanOrder(arranged, "collaborator").map(block => block.kind), ["Prose", "Steps", "Project", "Points"]);
  assert.deepEqual(oakPlanOrder(arranged, undefined), arranged);
});

test("plan: a turn with no request kind plans nothing", () => {
  assert.equal(oakPlanFor(null, one, undefined, taught), null);
});

test("plan: an inherited object key is not a request kind", () => {
  for (const kind of ["constructor", "toString", "__proto__"]) assert.equal(oakPlanFor(kind, one, undefined, taught), null, kind);
});

test("plan: the schema rejects text fields and counts over the cap", () => {
  const lead = { kind: "Prose", count: 1 };
  const ok = { blocks: [lead, { kind: "Stats", count: OAK_PENDING_CAP.stats }] };
  assert.ok(oakAnswerPlanSchema.safeParse(ok).success);
  const bad = [
    { ...ok, title: "Results" },
    { blocks: [{ ...lead, text: "Steve built five products." }, ok.blocks[1]] },
    { blocks: [lead, { kind: "Stats", count: OAK_PENDING_CAP.stats, label: "Key facts" }] },
    { blocks: [lead, { kind: "Stats", count: OAK_PENDING_CAP.stats + 1 }] },
    { blocks: [lead, { kind: "Compare", count: OAK_PENDING_CAP.compare + 1 }] },
    { blocks: [lead, { kind: "Callout", count: 2 }] },
    { blocks: [{ kind: "Prose", count: 2 }, ok.blocks[1]] },
    { blocks: [ok.blocks[1], lead] },
    { blocks: [{ kind: "Points", count: 1 }, lead] },
    { blocks: [lead] },
    { blocks: Array.from({ length: 7 }, (_, index) => index ? { kind: "Points", count: 1 } : lead) },
    { blocks: [lead, { kind: "Steve built five products", count: 1 }] },
    { blocks: [lead, { kind: "Points", count: 0 }] },
  ];
  for (const plan of bad) assert.equal(oakAnswerPlanSchema.safeParse(plan).success, false, JSON.stringify(plan));
  assert.ok(oakAnswerPlanSchema.safeParse({ blocks: [lead, { kind: "Hologram", count: 3 }] }).success, "a component this build does not know still parses");
});
