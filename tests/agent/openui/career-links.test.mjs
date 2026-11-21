import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { loadTsx } from "../design-rework/load-tsx.mjs";

const { oakPlanFor, oakLinkedCaseStudy } = loadTsx("packages/oak-agent-contracts/src/openui/plan.ts");
const taught = JSON.parse(readFileSync("packages/oak-agent-contracts/src/openui/taught.json", "utf8"));
const table = JSON.parse(readFileSync("packages/oak-agent-contracts/src/career-case-study-links.json", "utf8"));
const snapshot = JSON.parse(readFileSync("src/data/generated/knowledgeSnapshot.json", "utf8"));
const documentIds = new Set(snapshot.documents.map(document => document.id));

const hits = (...ids) => ids.map(documentId => ({ documentId }));
const shapeOf = plan => plan?.blocks.map(block => `${block.kind} x${block.count}`) ?? null;
const link = { entry: "experience:sanfranciscobayuniversity", caseStudy: "work:ecosmartloop", sentence: "x", source: "x", approved: true };
const roles = hits("experience:sanfranciscobayuniversity");
const planWith = links => oakPlanFor("employer-experience", roles, undefined, taught, links);

test("links: every row names an existing entry, an existing case study and a sentence found in its public source", () => {
  assert.ok(table.links.length > 0);
  for (const row of table.links) {
    assert.match(row.entry, /^experience:/);
    assert.ok(documentIds.has(row.entry), `${row.entry} is a career entry`);
    assert.match(row.caseStudy, /^work:/);
    assert.ok(documentIds.has(row.caseStudy), `${row.caseStudy} is a case study`);
    assert.ok(existsSync(`src/content/work/${row.caseStudy.slice(5)}.mdx`), `${row.caseStudy} has a page`);
    assert.ok(readFileSync(row.source, "utf8").includes(row.sentence), `${row.entry}: sentence is in ${row.source}`);
    assert.equal(typeof row.approved, "boolean");
  }
});

test("links: an unapproved link never unlocks a card or a plan slot", () => {
  const without = shapeOf(oakPlanFor("employer-experience", roles, undefined, taught, []));
  assert.deepEqual(without, ["Prose x1", "Role x1", "Table x1"]);
  assert.deepEqual(shapeOf(planWith([{ ...link, approved: false }])), without);
  assert.equal(oakLinkedCaseStudy("experience:sanfranciscobayuniversity", [{ ...link, approved: false }]), null);
  assert.deepEqual(shapeOf(oakPlanFor("employer-experience", roles, undefined, taught)), shapeOf(planWith(table.links)), "the default is the shipped table");
  assert.equal(oakLinkedCaseStudy("experience:sanfranciscobayuniversity", [{ ...link, approved: "false" }]), null, "only true unlocks");
  assert.deepEqual(shapeOf(planWith([{ ...link, approved: "false" }])), without);
});

test("links: an approved link plans the Project card right after the lead", () => {
  assert.deepEqual(shapeOf(planWith([link])), ["Prose x1", "Project x1", "Role x1", "Table x1"]);
  assert.equal(shapeOf(oakPlanFor("employer-experience", roles, undefined, taught.filter(name => name !== "Project"), [link])).includes("Project x1"), false);
  assert.deepEqual(shapeOf(oakPlanFor("project-deep-dive", hits("work:ecosmartloop", "experience:sanfranciscobayuniversity"), undefined, taught, [link])).filter(slot => slot.startsWith("Project")), ["Project x1"]);
});

test("links: an approved link adds the Project card only and leaves every other kind's counts alone", () => {
  for (const kind of ["employer-experience", "timeline", "stack", "results-metrics", "how-it-works", "skills", "project-deep-dive"]) {
    const cited = hits("experience:sanfranciscobayuniversity");
    const strip = plan => shapeOf(plan)?.filter(slot => !slot.startsWith("Project"));
    assert.deepEqual(strip(oakPlanFor(kind, cited, undefined, taught, [link])), strip(oakPlanFor(kind, cited, undefined, taught, [])), kind);
  }
});

test("links: the entry card reads the same table", () => {
  assert.equal(oakLinkedCaseStudy("experience:sanfranciscobayuniversity", [link]), "work:ecosmartloop");
  assert.equal(oakLinkedCaseStudy("experience:hyperskalers", [link]), null);
});
