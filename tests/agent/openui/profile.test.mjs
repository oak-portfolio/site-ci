import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTsx } from "../design-rework/load-tsx.mjs";

// Ticket 28: Profile(claim, size) draws the public profile record behind a who-is-Steve claim, behind oakProfileBlock.
globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, location: { search: "" }, addEventListener() {}, removeEventListener() {} };
const flag = loadTsx("src/lib/oakFlags/profile.ts");
const { primeOakRecordFacts } = loadTsx("src/lib/oakRecordFacts.ts");
const { OakArrangedAnswer } = loadTsx("src/components/agent/OakOpenUIAnswer.tsx");
const { heroCopy, profileSummary } = loadTsx("src/data/homePage.ts");
const { siteProfile, getProfileJson } = loadTsx("src/data/machineContent.ts");

const REVISION = "k";
const document = "profile:steve-oak";
const citation = { documentId: document, passageId: `${document}:section-001:passage-001`, sectionId: `${document}:section-001`, url: "https://steveoak.com/" };
const CLAIM = "Steve Oak is a Bay Area AI and design engineer.";
const answer = { schema: "oak.answer.v1", speaker: "oak-ai-host", characterVersion: "c", hardPolicyVersion: "h", knowledgeRevision: REVISION, operations: [],
  kind: "sourced", acknowledgment: null, claims: [{ id: "claim-1", text: CLAIM, citations: [citation] }] };
const record = { kind: "profile", hero: { title: heroCopy.title, description: heroCopy.description },
  summary: { heading: profileSummary.heading, description: profileSummary.description, facts: profileSummary.facts.map(({ label, value }) => ({ label, value })) },
  knowsAbout: siteProfile.focus };
// What the site serves at /profile.json: facts must come from here, or from the public home page copy (headings, labels, the third-person summary).
const served = getProfileJson();
const servedStrings = new Set([served.name, ...served.alternateName, served.description, served.jobTitle, served.homeLocation.name, ...served.knowsAbout]);
const seed = records => primeOakRecordFacts(REVISION, { version: 1, knowledgeRevision: REVISION, records });
const render = size => renderToStaticMarkup(createElement(OakArrangedAnswer, { id: "m1", answer, question: "Who is Steve?", latest: true,
  ui: { requestId: "00000000-0000-4000-8000-0000000000c2", status: "done", program: `root = Answer([who])\nwho = Profile("claim-1"${size ? `, "${size}"` : ""})` } }));
const count = (html, text) => html.split(text).length - 1;
// Ticket 167: the card is a lazy chunk, so one render with the constant on loads it before the tests read it.
flag.forceOakProfileBlock(true);
render();
flag.forceOakProfileBlock(null);
await new Promise(resolve => setTimeout(resolve, 50));
const text = html => html.replace(/<[^>]+>/g, "\n").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").split("\n").map(line => line.trim()).filter(Boolean);

test("constant: oakProfileBlock ships true and a force flips it", () => {
  assert.equal(flag.oakProfileBlock, true);
  assert.equal(flag.oakProfileBlockOn(), true);
  flag.forceOakProfileBlock(false);
  assert.equal(flag.oakProfileBlockOn(), false);
  flag.forceOakProfileBlock(null);
  assert.equal(flag.oakProfileBlockOn(), true);
});

test("brief shows the portrait, summary heading, claim and profile facts, every one from the public record", () => {
  flag.forceOakProfileBlock(true);
  seed({ [document]: record });
  const html = render();
  flag.forceOakProfileBlock(null);
  const lines = text(html);
  assert.equal(count(html, CLAIM), 1, "the claim shows once");
  assert.ok(lines.includes(profileSummary.heading));
  for (const { label, value } of profileSummary.facts) assert.ok(lines.includes(label) && lines.includes(value), `${label} fact`);
  for (const { label, value } of profileSummary.facts) for (const part of value.split(" / ")) assert.ok(servedStrings.has(part) || served.knowsAbout.includes(part), `${label} value "${part}" is in /profile.json`);
  assert.equal(new URL(served.image).pathname, new URL(siteProfile.image).pathname);
  assert.ok(html.includes(`src="${new URL(served.image).pathname}"`), "the portrait is the one /profile.json publishes");
  // "Profile" is the answer's source chip for the cited profile record, drawn by the answer shell, not by this card.
  const known = new Set(["Here is Steve at a glance:", "Profile", CLAIM, profileSummary.heading, ...profileSummary.facts.flatMap(({ label, value }) => [label, value])]);
  assert.deepEqual(lines.filter(line => !known.has(line)), [], "no line outside the record or the claim");
  assert.doesNotMatch(html, new RegExp(profileSummary.description.slice(0, 30)), "brief leaves the summary paragraph and the focus chips to full");
});

test("no size speaks as Steve in the first person", () => {
  flag.forceOakProfileBlock(true);
  seed({ [document]: record });
  for (const size of [undefined, "brief", "full"]) {
    const lines = text(render(size));
    assert.deepEqual(lines.filter(line => /^(Hi, )?I(['\u2019]m| )/.test(line) || /\bI (design|build)\b/.test(line)), [], `size ${size ?? "default"}`);
  }
  flag.forceOakProfileBlock(null);
});

test("full adds the summary description and knowsAbout, still only from the record", () => {
  flag.forceOakProfileBlock(true);
  seed({ [document]: record });
  const html = render("full");
  flag.forceOakProfileBlock(null);
  const lines = text(html);
  assert.ok(lines.includes(profileSummary.description));
  for (const item of served.knowsAbout) assert.ok(lines.includes(item), item);
  assert.equal(count(html, CLAIM), 1);
});

test("full skips the summary paragraph when the claim already says it, so the reader never sees one sentence twice", () => {
  const said = { ...answer, claims: [{ id: "claim-1", text: profileSummary.description, citations: [citation] }] };
  flag.forceOakProfileBlock(true);
  seed({ [document]: record });
  const html = renderToStaticMarkup(createElement(OakArrangedAnswer, { id: "m1", answer: said, question: "Tell me about Steve in full", latest: true,
    ui: { requestId: "00000000-0000-4000-8000-0000000000c3", status: "done", program: `root = Answer([who])\nwho = Profile("claim-1", "full")` } }));
  flag.forceOakProfileBlock(null);
  assert.equal(count(html, profileSummary.description), 1);
  for (const item of served.knowsAbout) assert.ok(text(html).includes(item), item);
});

test("constant off, or a record that is not the profile, degrade to Points with the claim placed once", () => {
  seed({ [document]: record });
  flag.forceOakProfileBlock(false);
  const off = render();
  flag.forceOakProfileBlock(true);
  seed({});
  const missing = render();
  flag.forceOakProfileBlock(null);
  for (const [name, html] of [["constant off", off], ["no profile record", missing]]) {
    assert.match(html, /<ul class="oak-openui__points"/, `${name}: the plain Points list`);
    assert.equal(count(html, CLAIM), 1, `${name}: the claim is placed once`);
    assert.doesNotMatch(html, /oak-profile/, `${name}: no profile drawing`);
  }
});
