import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTsx } from "../design-rework/load-tsx.mjs";

// Ticket 27: Ownership(claim, mode) shows Steve's lines beside his collaborators' for the record its claim cites, behind oakOwnershipBlock.
globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, location: { search: "" }, addEventListener() {}, removeEventListener() {} };
const flag = loadTsx("src/lib/oakFlags/ownership.ts");
const { primeOakRecordFacts } = loadTsx("src/lib/oakRecordFacts.ts");
const { OakArrangedAnswer } = loadTsx("src/components/agent/OakOpenUIAnswer.tsx");

const REVISION = "k";
const document = "work:ecosmartloop";
const citation = { documentId: document, passageId: `${document}:passage-001`, sectionId: document, url: "https://steveoak.com/work/ecosmartloop/" };
const CLAIM = "Steve owned the product side of EcoSmartLoop.";
const answer = { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "c", hardPolicyVersion: "h", knowledgeRevision: REVISION, operations: [],
  kind: "sourced", acknowledgment: null, claims: [{ id: "claim-1", text: CLAIM, citations: [citation] }] };
const seed = ownership => primeOakRecordFacts(REVISION, { version: 1, knowledgeRevision: REVISION,
  records: ownership ? { [document]: { kind: "work", ownership } } : {} });
const render = (mode, ui = {}) => renderToStaticMarkup(createElement(OakArrangedAnswer, { id: "m1", answer, question: "Who did what on EcoSmartLoop?", latest: true,
  ui: { requestId: "00000000-0000-4000-8000-0000000000c1", status: "done", program: `root = Answer([own])\nown = Ownership("claim-1"${mode ? `, "${mode}"` : ""})`, ...ui } }));
const count = (html, text) => html.split(text).length - 1;
// Ticket 167: the drawing is a lazy chunk, so one render with the constant on loads it before the tests read it.
flag.forceOakOwnershipBlock(true);
render();
flag.forceOakOwnershipBlock(null);
await new Promise(resolve => setTimeout(resolve, 50));

test("constant: oakOwnershipBlock is pinned in flag-pins, and a force flips it both ways", () => {
  flag.forceOakOwnershipBlock(true);
  assert.equal(flag.oakOwnershipBlockOn(), true);
  flag.forceOakOwnershipBlock(null);
  assert.equal(flag.oakOwnershipBlockOn(), flag.oakOwnershipBlock);
  flag.forceOakOwnershipBlock(false);
  assert.equal(flag.oakOwnershipBlockOn(), false);
  flag.forceOakOwnershipBlock(null);
  assert.equal(flag.oakOwnershipBlockOn(), flag.oakOwnershipBlock);
});

test("an empty collaborators list reads No collaborators listed, never as solo work", () => {
  flag.forceOakOwnershipBlock(true);
  seed({ oak: ["Product direction", "Mobile app"], collaborators: [] });
  const html = render();
  flag.forceOakOwnershipBlock(null);
  assert.match(html, /No collaborators listed/);
  assert.doesNotMatch(html, /solo|alone|by himself/i);
  assert.match(html, /Product direction/);
  assert.equal(count(html, CLAIM), 1, "the claim shows once as the lead line");
});

test("roll labels areas listed, never a rank or a score", () => {
  flag.forceOakOwnershipBlock(true);
  seed({ oak: ["Product direction", "Mobile app", "Dataset"], collaborators: ["Backend services"] });
  const html = render("roll");
  flag.forceOakOwnershipBlock(null);
  assert.match(html, /Steve&#x27;s areas listed/);
  assert.match(html, /Collaborators&#x27; areas listed/);
  assert.doesNotMatch(html.replace(/<[^>]+>/g, " "), /\b(rank|ranked|score|scored|top|best|percent)\b|%/i);
});

// r27 P3: in roll a zero collaborators bar must not read as solo work.
test("roll says No collaborators listed for a record with none", () => {
  flag.forceOakOwnershipBlock(true);
  seed({ oak: ["Product direction", "Mobile app"], collaborators: [] });
  const html = render("roll");
  flag.forceOakOwnershipBlock(null);
  assert.match(html, /No collaborators listed/);
  assert.doesNotMatch(html.replace(/<[^>]+>/g, " "), /solo|alone|by himself/i);
});

test("the prompt description names no other component", () => {
  const { Ownership } = loadTsx("src/lib/openui/components/Ownership.tsx");
  const description = Ownership.description ?? Ownership.spec?.description ?? "";
  assert.ok(description.length > 0, "description is readable");
  assert.doesNotMatch(description, /\b(Stack|Prose|Points|Project|Role|Profile|Quote|Steps|Sources)\b/);
});

test("constant off, or record facts without ownership, degrade to Points with the claim placed once", () => {
  seed({ oak: ["Product direction"], collaborators: ["Backend services"] });
  flag.forceOakOwnershipBlock(false);
  const off = render();
  seed(null);
  flag.forceOakOwnershipBlock(true);
  const missing = render();
  flag.forceOakOwnershipBlock(null);
  for (const [name, html] of [["constant off", off], ["no ownership lines", missing]]) {
    assert.match(html, /<ul class="oak-openui__points"/, `${name}: the plain Points list`);
    assert.equal(count(html, CLAIM), 1, `${name}: the claim is placed once`);
    assert.doesNotMatch(html, /oak-ownership|No collaborators listed|Product direction/, `${name}: no ownership drawing`);
  }
});
