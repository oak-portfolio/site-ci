import { test, before, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTsx } from "../design-rework/load-tsx.mjs";

// Ticket 42: Role(claims, mode) adds situation tags and credential rows, and the "entry" card, behind oakRoleEntryCard.
globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, location: { search: "" }, addEventListener() {}, removeEventListener() {} };
const flag = loadTsx("src/lib/oakFlags/roleEntryCard.ts");
const { OakArrangedAnswer } = loadTsx("src/components/agent/OakOpenUIAnswer.tsx");
const { careerTimelineItems, careerContextMetadata } = loadTsx("src/data/careerTimeline.ts");
const { loadOakRoleTimeline } = loadTsx("src/lib/openui/components/Role.tsx");
const stored = JSON.parse(readFileSync("tests/agent/premium/stored-openui-programs.json", "utf8"));

const REVISION = "k";
const SFBU = "experience:sanfranciscobayuniversity";
const item = id => careerTimelineItems.find(entry => entry.id === id.slice(11));
const roleDoc = id => ({ documentId: id, title: item(id).place, canonicalUrl: `https://steveoak.com/work#${item(id).id}`,
  card: { kind: "role", title: item(id).contexts.find(c => c.type === "employment").title, period: item(id).date, place: item(id).place } });
const labels = { knowledgeRevision: REVISION, documents: [...careerTimelineItems.map(entry => roleDoc(`experience:${entry.id}`)),
  { documentId: "work:ecosmartloop", title: "EcoSmartLoop", canonicalUrl: "https://steveoak.com/work/ecosmartloop/", card: { kind: "work", title: "EcoSmartLoop" } }] };
const cite = id => ({ documentId: id, passageId: `${id}:passage-001`, sectionId: id, url: `https://steveoak.com/work#${id.slice(11)}` });
const claimsOf = (id, n) => Array.from({ length: n }, (_, i) => ({ id: `claim-${i + 1}`, text: `Point ${i + 1} about the role at ${item(id).place}.`, citations: [cite(id)] }));
const answerOf = claims => ({ schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "c", hardPolicyVersion: "h", knowledgeRevision: REVISION,
  operations: [], kind: "sourced", acknowledgment: null, claims });
const render = (answer, program) => renderToStaticMarkup(createElement(OakArrangedAnswer, { id: "m1", answer, question: "q", latest: true, citationLabels: labels,
  ui: { requestId: "00000000-0000-4000-8000-0000000000e2", status: "done", program } }));
const role = (id = SFBU, n = 1, mode) => render(answerOf(claimsOf(id, n)),
  `root = Answer([r])\nr = Role([${claimsOf(id, n).map(c => `"${c.id}"`).join(", ")}]${mode ? `, "${mode}"` : ""})`);
const on = fn => { flag.forceOakRoleEntryCard(true); try { return fn(); } finally { flag.forceOakRoleEntryCard(null); } };
const approved = { entry: SFBU, caseStudy: "work:ecosmartloop", approved: true };
const flat = html => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const NEW = /oak-openui-role__tags|oak-openui-role__creds|data-entry|From the career timeline|This entry links to/;

before(() => loadOakRoleTimeline());
afterEach(() => { flag.forceOakRoleEntryCard(null); flag.forceOakRoleEntryLinks(null); });

test("constant off: the switch ships off, every stored Role program renders as before, and entry mode is today's row", () => {
  assert.equal(flag.oakRoleEntryCard, false);
  const programs = stored.filter(entry => /=\s*Role\(/.test(entry.program));
  assert.ok(programs.length >= 3);
  for (const entry of programs) {
    const html = render({ ...answerOf([]), ...entry.answer }, entry.program);
    assert.match(html, /oak-openui-role/, `${entry.id} draws its role card`);
    assert.doesNotMatch(html, NEW, entry.id);
    flag.forceOakRoleEntryCard(false);
    assert.equal(render({ ...answerOf([]), ...entry.answer }, entry.program), html, `${entry.id} pinned off is the default`);
    flag.forceOakRoleEntryCard(null);
  }
  flag.forceOakRoleEntryLinks([approved]);
  assert.equal(role(SFBU, 2, "entry"), role(SFBU, 2), "off, entry mode draws the shipped row and no link");
});

test("entry card: no approved row in ticket 30's table means no case-study link, and the entry still renders whole", () => {
  const table = JSON.parse(readFileSync("packages/oak-agent-contracts/src/career-case-study-links.json", "utf8"));
  for (const id of careerTimelineItems.map(entry => `experience:${entry.id}`)) {
    const html = on(() => role(id, 1, "entry"));
    assert.match(html, /data-entry/);
    assert.match(flat(html), /From the career timeline/);
    assert.match(flat(html), new RegExp(item(id).place.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    const row = table.links.find(link => link.entry === id && link.approved === true);
    if (!row) assert.doesNotMatch(flat(html), /This entry links to/, `${id}: no approved row, no link`);
  }
  flag.forceOakRoleEntryLinks([{ ...approved, approved: false }]);
  assert.doesNotMatch(flat(on(() => role(SFBU, 1, "entry"))), /This entry links to/, "an unapproved row unlocks nothing");
  flag.forceOakRoleEntryLinks([{ ...approved, approved: "true" }]);
  assert.doesNotMatch(flat(on(() => role(SFBU, 1, "entry"))), /This entry links to/, "only true unlocks");
});

test("entry card: an approved row links the entry to its case study page, and row mode never shows the link", () => {
  flag.forceOakRoleEntryLinks([approved]);
  const html = on(() => role(SFBU, 1, "entry"));
  assert.match(flat(html), /This entry links to the EcoSmartLoop case study/);
  assert.match(html, /href="https:\/\/steveoak\.com\/work\/ecosmartloop\/"/);
  assert.doesNotMatch(flat(on(() => role(SFBU, 1))), /This entry links to/);
  flag.forceOakRoleEntryLinks([{ ...approved, entry: "experience:hyperskalers" }]);
  assert.doesNotMatch(flat(on(() => role(SFBU, 1, "entry"))), /This entry links to/, "a row for another entry links nothing here");
});

test("tags come from the entry's contexts only, and credentials are its education contexts", () => {
  for (const entry of careerTimelineItems) {
    const id = `experience:${entry.id}`, html = on(() => role(id, 1));
    const tags = [...html.matchAll(/data-tag="">([^<]+)</g)].map(match => match[1]);
    const expected = [...new Set(entry.contexts.filter(c => c.type === "employment").map(careerContextMetadata))];
    assert.deepEqual(tags, expected, `${id} tags`);
    const creds = [...html.matchAll(/oak-openui-role__cred-label">([^<]+)</g)].map(match => match[1]);
    assert.deepEqual(creds, entry.contexts.filter(c => c.type === "education").map(c => c.title), `${id} credentials`);
  }
  assert.match(flat(on(() => role(SFBU, 1))), /M\.S\. Computer Science Completed/);
});

test("four claims keep the findable fold: one lead, three under one '3 more' control", () => {
  const html = on(() => role(SFBU, 4, "entry"));
  assert.match(flat(html), /3 more/);
  assert.equal(flat(html).split("Point 4 about the role").length - 1, 1, "each claim placed once");
  assert.match(html, /oak-openui-card__more-panel/, "the rest stay in the page under the fold");
});

test("Role reads the career timeline on demand, so the eager agent bundle does not carry it", () => {
  assert.doesNotMatch(readFileSync("src/lib/openui/components/Role.tsx", "utf8"), /^import [^;]*["']@\/data\/careerTimeline["']/m);
});
