import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseFragment } from "parse5";
import { loadTsx } from "../design-rework/load-tsx.mjs";

// Ticket 334 (r328 N1): the Worker moves claim 1 ahead of an opener that does not name the asked project; the browser makes
// the same move while the layout streams, so no drawn block moves when the turn settles.
globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, location: { search: "" }, addEventListener() {}, removeEventListener() {} };
const { OakArrangedAnswer, oakOpenUILeadClaimStream } = loadTsx("src/components/agent/OakOpenUIAnswer.tsx");
const { oakOpenUILeadStream, oakOpenUIOverviewClaim } = await import("../../../packages/oak-agent-contracts/src/openui/verdict.ts");

const REVISION = "k334";
const MINDER = { documentId: "work:oakminder", passageId: "work:oakminder:passage-003", sectionId: "work:oakminder", url: "https://steveoak.com/work/oakminder/" };
const ECO = { documentId: "work:ecosmartloop", passageId: "work:ecosmartloop:passage-002", sectionId: "work:ecosmartloop", url: "https://steveoak.com/work/ecosmartloop/" };
const LABELS = { knowledgeRevision: REVISION, documents: [
  { documentId: MINDER.documentId, title: "Oakminder", canonicalUrl: MINDER.url, card: { kind: "work", title: "Oakminder", role: "Solo founder-engineer", period: "January to March 2026", stack: ["Convex", "Expo"] } },
  { documentId: ECO.documentId, title: "EcoSmartLoop", canonicalUrl: ECO.url, card: { kind: "work", title: "EcoSmartLoop", role: "Product-side full-stack owner", period: "September to December 2025", stack: ["Next.js", "Supabase"] } },
] };
const claim = (id, text, citation) => ({ id, text, citations: [citation] });

// Wave w25 diagram-how and screens-show, as T328 pins them (workers/oak-agent/tests/premium/t328-lead-claim.test.ts).
const OAKMINDER = [
  claim("claim-1", "Steve designed Oakminder as a productivity AI agent meant to handle task details directly from notifications, including snoozing and completing reminders.", MINDER),
  claim("claim-2", "Rather than relying on a chat interface, Oakminder uses voice input to capture reminders quickly while on the move.", MINDER),
  claim("claim-3", "Its architectural setup coordinates actions between the phone interface and the backend.", MINDER),
  claim("claim-4", "The app covers features spanning voice interaction, agendas, progress tracking, snoozing, alarms, and actionable notifications.", MINDER),
];
const DIAGRAM_HOW = 'root = Answer([diag, lead, details, src, pills])\ndiag = Diagram("claim-3", "agentflow")\nlead = Prose("claim-1")\ndetails = Points(["claim-2", "claim-4"])\nsrc = Sources()\npills = Pills(["What tools did he use to build it?"])';
const DIAGRAM_HOW_SETTLED = 'root = Answer([lead, diag, details, src, pills])\ndiag = Diagram("claim-3", "agentflow")\nlead = Prose("claim-1")\ndetails = Points(["claim-2", "claim-4"])\nsrc = Sources()\npills = Pills(["What tools did he use to build it?"])';
const ECO_CLAIMS = [
  claim("claim-1", "EcoSmartLoop was designed to go beyond a basic scanner demo by remembering answers, explaining them, incentivizing better behavior, and revealing repeated confusion.", ECO),
  claim("claim-2", "Steve framed the project around the idea that a huge waste problem still shows up as small repeated decisions.", ECO),
];
const SCREENS_SHOW = 'root = Answer([intro, details, src, next])\nintro = Prose("claim-2")\ndetails = Prose("claim-1")\nsrc = Sources()\nnext = Pills(["How does the agent architecture work?", "What tools and stack did he use?"])';
const SCREENS_SHOW_SETTLED = 'root = Answer([details, intro, src, next])\nintro = Prose("claim-2")\ndetails = Prose("claim-1")\nsrc = Sources()\nnext = Pills(["How does the agent architecture work?", "What tools and stack did he use?"])';
const NAMED = [ECO_CLAIMS[0], claim("claim-2", "EcoSmartLoop started from the idea that a huge waste problem shows up as small repeated decisions.", ECO)];
const LEADS = 'root = Answer([details, intro, src])\ndetails = Prose("claim-1")\nintro = Prose("claim-2")\nsrc = Sources()';
const CARD = 'root = Answer([eco, src])\neco = Project(["claim-1", "claim-2"])\nsrc = Sources()';
const POINTS_FIRST = 'root = Answer([more, lead, src])\nmore = Points(["claim-2", "claim-4"])\nlead = Prose("claim-1")\nsrc = Sources()';
const UNDER_HEADING = 'root = Answer([diag, h, lead, src])\ndiag = Diagram("claim-3", "agentflow")\nh = Heading("How it works")\nlead = Prose("claim-1")\nsrc = Sources()';
const POINTS_ONLY = 'root = Answer([details, src])\ndetails = Points(["claim-2", "claim-1"])\nsrc = Sources()';
const ECO_THREE = [...ECO_CLAIMS, claim("claim-3", "It reveals the questions people keep getting wrong.", ECO)];
const CARD_THEN_LEAD = 'root = Answer([eco, details, src])\neco = Project(["claim-2", "claim-3"])\ndetails = Prose("claim-1")\nsrc = Sources()';
const ROLE_THEN_LEAD = CARD_THEN_LEAD.replace("Project(", "Role(");
const OAKMINDER_THREE = OAKMINDER.slice(0, 3);
const LIKE_DIAGRAM_HOW = DIAGRAM_HOW.replace(', "claim-4"', '');

const r = (question, claims, program, status) => renderToStaticMarkup(createElement(OakArrangedAnswer, { id: "s334", question, latest: true, citationLabels: LABELS,
  answer: { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "c", hardPolicyVersion: "h", operations: [], kind: "sourced", acknowledgment: null, knowledgeRevision: REVISION, claims },
  ui: { requestId: "00000000-0000-4000-8000-000000000334", status, program } }));
const classes = node => (node.attrs?.find(attr => attr.name === "class")?.value ?? "").split(/\s+/);
const answerRoot = node => classes(node).includes("oak-openui") ? node : (node.childNodes ?? []).map(answerRoot).find(Boolean);
const textOf = node => node.nodeName === "#text" ? node.value : (node.childNodes ?? []).map(textOf).join("");
/** The answer's drawn blocks in reading order, each by its tag, first class and opening words; Pills move into the action row at settle. */
const blocks = html => (answerRoot(parseFragment(html))?.childNodes ?? []).filter(node => node.tagName && !classes(node).includes("oak-related"))
  .map(node => `${node.tagName}.${classes(node)[0]} ${textOf(node).trim().slice(0, 24)}`);
const cuts = program => program.split("\n").map((_, i, lines) => lines.slice(0, i + 1).join("\n"));

/** Every streaming frame from the one that holds claim 1's Prose draws the settled blocks in their settled order. */
const settlesInPlace = (name, question, claims, program, settledProgram) => {
  const settled = blocks(r(question, claims, settledProgram, "done"));
  const held = program.split("\n").findIndex(line => /= Prose\("claim-1"\)/.test(line));
  for (const cut of cuts(program).slice(held)) {
    const drawn = blocks(r(question, claims, cut, "streaming"));
    assert.deepEqual(drawn, settled.slice(0, drawn.length), `${name}: cut ending "${cut.split("\n").at(-1)}" draws [${drawn.join(", ")}], settled reads [${settled.join(", ")}]`);
  }
};

test("T334-1 diagram-how: once claim 1 has streamed, the diagram sits where it settles, so it never drops at done", () => {
  settlesInPlace("diagram-how", "How does Oakminder work?", OAKMINDER, DIAGRAM_HOW, DIAGRAM_HOW_SETTLED);
});

test("T334-2 screens-show: claim 1 leads the framing claim while streaming, so the two paragraphs never swap at done", () => {
  settlesInPlace("screens-show", "Show me EcoSmartLoop", ECO_CLAIMS, SCREENS_SHOW, SCREENS_SHOW_SETTLED);
});

test("T334-3 answers 328 leaves alone stream exactly as before through the client step, at every cut", () => {
  const rows = [
    ["named lead", "Show me EcoSmartLoop", NAMED, SCREENS_SHOW],
    ["topic question", "What did he build for waste sorting?", ECO_CLAIMS, SCREENS_SHOW],
    ["already leads", "Show me EcoSmartLoop", ECO_CLAIMS, LEADS],
    ["card opener (R17)", "Show me EcoSmartLoop", ECO_CLAIMS, CARD],
    ["opener names the project", "How does Oakminder work?", OAKMINDER, POINTS_FIRST],
    ["claim 1 under its own Heading", "How does Oakminder work?", OAKMINDER, UNDER_HEADING],
    ["claim 1 not alone in a Prose", "Show me EcoSmartLoop", ECO_CLAIMS, POINTS_ONLY],
    ["R17 lead out of a Project card, claim 1 in its own Prose", "Show me EcoSmartLoop", ECO_THREE, CARD_THEN_LEAD],
    ["R17 lead out of a Role card, claim 1 in its own Prose", "Show me EcoSmartLoop", ECO_THREE, ROLE_THEN_LEAD],
    ["no question", "", OAKMINDER_THREE, LIKE_DIAGRAM_HOW],
  ];
  for (const [name, question, claims, program] of rows) for (const cut of cuts(program)) {
    const base = oakOpenUILeadStream(cut, oakOpenUIOverviewClaim(claims));
    assert.equal(oakOpenUILeadClaimStream(cut, question, claims), base, `${name}: cut ending "${cut.split("\n").at(-1)}"`);
  }
});

test("T334-4 the client step makes the move only after claim 1's Prose has streamed, and keeps the unfinished tail as written", () => {
  const lines = DIAGRAM_HOW.split("\n");
  const early = lines.slice(0, 2).join("\n");
  assert.equal(oakOpenUILeadClaimStream(early, "How does Oakminder work?", OAKMINDER), early);
  const tail = `${lines.slice(0, 3).join("\n")}\ndetails = Points(["claim-2", "cla`;
  const led = oakOpenUILeadClaimStream(tail, "How does Oakminder work?", OAKMINDER);
  assert.equal(led.split("\n")[0], "root = Answer([lead, diag, details, src, pills])");
  assert.ok(led.endsWith('details = Points(["claim-2", "cla'), led);
});
