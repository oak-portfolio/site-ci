import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTsx } from "../design-rework/load-tsx.mjs";

// Ticket 295: a layout that holds a Stack draws its Project and Role cards by title, cover and stack, with no role or period
// line; the same cards with no Stack keep both. The signal is the Stack in the program, never the visitor's question.
globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, location: { search: "" }, addEventListener() {}, removeEventListener() {} };
const { OakArrangedAnswer } = loadTsx("src/components/agent/OakOpenUIAnswer.tsx");

const REVISION = "k295";
const ECO = { documentId: "work:ecosmartloop", passageId: "work:ecosmartloop:passage-003", sectionId: "work:ecosmartloop", url: "https://steveoak.com/work/ecosmartloop/" };
const MINDER = { documentId: "work:oakminder", passageId: "work:oakminder:passage-003", sectionId: "work:oakminder", url: "https://steveoak.com/work/oakminder/" };
const LABS = { documentId: "experience:oaklabs", passageId: "experience:oaklabs:passage-005", sectionId: "experience:oaklabs", url: "https://steveoak.com/work#oaklabs" };
const LABELS = { knowledgeRevision: REVISION, documents: [
  { documentId: ECO.documentId, title: "EcoSmartLoop", canonicalUrl: ECO.url, card: { kind: "work", title: "EcoSmartLoop", role: "Product-side full-stack owner", period: "September to December 2025", stack: ["Next.js", "Supabase"] } },
  { documentId: MINDER.documentId, title: "Oakminder", canonicalUrl: MINDER.url, card: { kind: "work", title: "Oakminder", role: "Solo founder-engineer", period: "January to March 2026", stack: ["Convex", "Expo"] } },
  { documentId: LABS.documentId, title: "Oak Labs", canonicalUrl: "https://steveoak.com/work", card: { kind: "role", title: "AI Solutions Engineer", period: "May 2026 - Present", place: "Oak Labs" } },
] };
const CLAIMS = [
  { id: "claim-1", text: "Across these AI projects the stacks connect backend data, authentication and interfaces.", citations: [ECO, MINDER, LABS] },
  { id: "claim-2", text: "For Oak Labs, listed technologies include React Native and MCP.", citations: [LABS] },
  { id: "claim-3", text: "For EcoSmartLoop, tools include Next.js and Supabase.", citations: [ECO] },
  { id: "claim-4", text: "For Oakminder, tools include Convex and Expo.", citations: [MINDER] },
];
const PROGRAM = 'root = Answer([intro, eco, oakminder, oaklabs, tools])\nintro = Prose("claim-1")\neco = Project(["claim-3"])\noakminder = Project(["claim-4"])\noaklabs = Role(["claim-2"])\ntools = Stack()';
const NO_STACK = PROGRAM.replace(", tools]", "]").replace("\ntools = Stack()", "");
const FIELDS = ["Product-side full-stack owner", "September to December 2025", "Solo founder-engineer", "January to March 2026", "AI Solutions Engineer", "2026 - Now"];
const render = (program, question = "Tell me about his recent work.") => renderToStaticMarkup(createElement(OakArrangedAnswer, { id: "m295", question, latest: true,
  citationLabels: LABELS, answer: { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "c", hardPolicyVersion: "h", operations: [], kind: "sourced",
    acknowledgment: null, knowledgeRevision: REVISION, claims: CLAIMS }, ui: { requestId: "00000000-0000-4000-8000-000000000295", status: "done", program } }));
const text = html => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\u2013/g, "-").replace(/\s+/g, " ");

test("T295-1 beside a Stack each Project and Role card shows its title with no role or period text", () => {
  const html = render(PROGRAM);
  assert.equal((html.match(/class="oak-openui-card oak-openui-(project|role)"/g) ?? []).length, 3, "three record cards");
  assert.doesNotMatch(html, /oak-openui-card__meta|oak-openui-role__when|oak-openui-role__titles/);
  for (const field of FIELDS) assert.ok(!text(html).includes(field), field);
  for (const title of ["EcoSmartLoop", "Oakminder", "Oak Labs"]) assert.ok(text(html).includes(title), title);
});

test("T295-2 the same cards with no Stack keep their role and period", () => {
  const html = render(NO_STACK);
  assert.match(html, /oak-openui-role__titles/);
  for (const field of FIELDS) assert.ok(text(html).includes(field), field);
});

test("T295-3 a tools question with a Stack draws the same title-only cards", () => {
  const html = render(PROGRAM, "Which tools has Steve used across his AI projects?");
  for (const field of FIELDS) assert.ok(!text(html).includes(field), field);
});

// Ticket 307: beside a Stack, a card whose own claim names its record draws no title or employer line; its cover, art or
// initial tile is the link, named by the record. Without the Stack, or when the claim does not name it, the title stays.
const ECO_COVER = { documentId: ECO.documentId, title: "EcoSmartLoop", canonicalUrl: ECO.url, cover: "/images/eco-cover.webp", card: { kind: "work", title: "EcoSmartLoop", role: "Product-side full-stack owner", period: "September to December 2025", stack: ["Next.js", "Supabase"] } };
const withCover = { ...LABELS, documents: LABELS.documents.map(doc => doc.documentId === ECO.documentId ? ECO_COVER : doc) };
const renderWith = (program, labels, claims = CLAIMS) => renderToStaticMarkup(createElement(OakArrangedAnswer, { id: "m307", question: "What is his stack?", latest: true,
  citationLabels: labels, answer: { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "c", hardPolicyVersion: "h", operations: [], kind: "sourced",
    acknowledgment: null, knowledgeRevision: REVISION, claims }, ui: { requestId: "00000000-0000-4000-8000-000000000307", status: "done", program } }));
const card = (html, kind, at = 0) => html.split(/(?=<article )/).filter(part => part.startsWith(`<article class="oak-openui-card oak-openui-${kind}"`))[at] ?? "";

test("T307-1 beside a Stack a Project card whose claim names it shows no title text, and its cover is the link named by its title", () => {
  const eco = card(renderWith(PROGRAM, withCover), "project", 0);
  assert.ok(eco, "the EcoSmartLoop card is drawn");
  assert.doesNotMatch(eco, /oak-openui-card__title/);
  assert.match(eco, /<a [^>]*href="https:\/\/steveoak\.com\/work\/ecosmartloop\/"[^>]*aria-label="EcoSmartLoop"[^>]*>(?:(?!<\/a>).)*<img /s);
  assert.equal(text(eco.replace(/<p class="oak-openui-card__lead"[\s\S]*?<\/p>/, "")).trim(), "");
});

test("T307-2 beside a Stack a Role card whose claim names it shows no employer line, and its art or initial tile is the link named by the employer", () => {
  const labs = card(renderWith(PROGRAM, withCover), "role", 0);
  assert.doesNotMatch(labs, /oak-openui-role__employer/);
  assert.match(labs, /<a [^>]*aria-label="Oak Labs"[^>]*>(?:(?!<\/a>).)*oak-openui-role__tile/s);
});

test("T307-3 the same Project card with no Stack keeps its title", () => {
  const eco = card(renderWith(NO_STACK, withCover), "project", 0);
  assert.match(eco, /oak-openui-card__title/);
});

test("T307-4 beside a Stack a card whose claim does not name its record keeps its title", () => {
  const claims = CLAIMS.map(claim => claim.id === "claim-3" ? { ...claim, text: "The tools include Next.js and Supabase." } : claim);
  const eco = card(renderWith(PROGRAM, withCover, claims), "project", 0);
  assert.match(eco, /oak-openui-card__title/);
  assert.ok(text(eco).includes("EcoSmartLoop"));
});
