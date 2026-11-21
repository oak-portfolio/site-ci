import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTsx } from "./load-tsx.mjs";

// Ticket 56: after Edit or Ask again, a note above the new answer names the blocks kept, dropped or added against the
// previous answer's program. The app computes it from the two programs; the model writes none of it.
globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, addEventListener() {}, removeEventListener() {} };
const { oakWhatChanged, oakWhatChangedOn, forceOakWhatChanged } = loadTsx("src/lib/oakFlags/whatChanged.ts");
const { oakProgramDiff } = loadTsx("src/lib/oakProgramDiff.ts");
const { OakWhatChanged, oakWhatChangedPrevious, markOakRedo, bindOakRedo, resetOakRedo } = loadTsx("src/components/agent/OakWhatChanged.tsx");
const { collectOakOutputAnnouncements, oakOutputUnitKeys } = loadTsx("src/components/agent/OakTranscript.tsx");
const { OakTurn } = loadTsx("src/components/agent/OakTurn.tsx");
const { retryOakTurn, setOakWorkspaceFixture } = loadTsx("src/lib/oakWorkspace.ts");

const pointsTable = 'root = Answer([p, t])\np = Points(["claim-1", "claim-2"])\nt = Table(["claim-3"], "Stack by project")';
const pointsTableReordered = 'root = Answer([t, p])\np = Points(["claim-2", "claim-1"])\nt = Table(["claim-3"], "Stack by project")';
const pointsOnly = 'root = Answer([p])\np = Points(["claim-1", "claim-2", "claim-3"])';
const pointsTimeline = 'root = Answer([p, tl])\np = Points(["claim-1"])\ntl = Timeline([a, b])\na = TimelineItem("claim-2")\nb = TimelineItem("claim-3")';
const twoProjects = 'root = Answer([a, b])\na = Project(["claim-1"])\nb = Project(["claim-2"])';
const oneProject = 'root = Answer([a])\na = Project(["claim-1", "claim-2"])';
const user = (id, text) => ({ id, role: "user", text, answer: null, cards: [], usage: null, state: "complete", page: "/" });
const reply = (id, program) => ({ id, role: "assistant", text: "", answer: { kind: "sourced", claims: [] }, cards: [], usage: null, state: "complete", page: "/",
  ui: program ? { requestId: "4c1b9e2a-7f3d-4e8a-9b6c-2d5e8f1a3c7b", program, status: "done" } : null });

test.afterEach(() => { forceOakWhatChanged(null); resetOakRedo(); setOakWorkspaceFixture({ messages: [] }); });

test("56 the constant is off by default, and off draws no note", () => {
  assert.equal(oakWhatChanged, false);
  assert.equal(oakWhatChangedOn(), false);
  assert.equal(renderToStaticMarkup(createElement(OakWhatChanged, { previous: pointsTable, next: pointsOnly })), "");
});

test("56 the diff names block kinds in plain words, kept, dropped and added, and never claim text or ids", () => {
  assert.deepEqual(oakProgramDiff(pointsTable, pointsOnly), { kept: ["points"], dropped: ["table"], added: [] });
  assert.deepEqual(oakProgramDiff(pointsOnly, pointsTimeline), { kept: ["points"], dropped: [], added: ["timeline"] });
  assert.deepEqual(oakProgramDiff(pointsTable, pointsTableReordered), { kept: ["points", "table"], dropped: [], added: [] }, "a reorder keeps both");
  const words = Object.values(oakProgramDiff(pointsTable, pointsTimeline)).flat();
  assert.deepEqual(words, ["points", "table", "timeline"]);
  assert.ok(words.every(word => /^[a-z ]+$/.test(word)), "plain lower-case words, no component names");
  assert.ok(!words.includes("timeline item") && !words.includes("answer"), "the root and a block's own rows are not blocks");
  const evidence = 'root = Answer([e, s])\ne = EvidenceChart(["claim-1"])\ns = StackMap(["claim-2"])';
  assert.deepEqual(oakProgramDiff(pointsOnly, evidence).added, ["evidence chart", "stack map"]);
  assert.deepEqual(oakProgramDiff(twoProjects, oneProject), { kept: ["project"], dropped: ["project"], added: [] }, "two projects to one is a dropped project");
  assert.deepEqual(oakProgramDiff(oneProject, twoProjects), { kept: ["project"], dropped: [], added: ["project"] });
  const pills = 'root = Answer([p, n])\np = Points(["claim-1"])\nn = Pills(["Which stack?"])';
  assert.deepEqual(oakProgramDiff(pills, pointsOnly).dropped, ["related questions"], "the word the visitor sees on the pills");
});

test("56 no note for a first answer, an unchanged program or a program that does not parse", () => {
  assert.equal(oakProgramDiff(null, pointsOnly), null);
  assert.equal(oakProgramDiff(pointsOnly, pointsOnly), null);
  assert.equal(oakProgramDiff(pointsOnly, null), null);
  assert.equal(oakProgramDiff("not a program (", pointsOnly), null);
  forceOakWhatChanged(true);
  assert.equal(renderToStaticMarkup(createElement(OakWhatChanged, { previous: null, next: pointsOnly })), "");
  assert.equal(renderToStaticMarkup(createElement(OakWhatChanged, { previous: pointsOnly, next: pointsOnly })), "");
});

test("56 on, the note reads in plain words and marks each block's change, with no live region of its own", () => {
  forceOakWhatChanged(true);
  const html = renderToStaticMarkup(createElement(OakWhatChanged, { previous: pointsTable, next: pointsTimeline }));
  assert.doesNotMatch(html, /role="status"|aria-live/, "the transcript's one polite region announces it");
  assert.match(html, /What changed/);
  assert.match(html, /data-change="kept"[^>]*>(?:(?!<\/li>).)*points/);
  assert.match(html, /data-change="dropped"[^>]*>(?:(?!<\/li>).)*table/);
  assert.match(html, /data-change="added"[^>]*>(?:(?!<\/li>).)*timeline/);
  assert.match(html, /Dropped table/, "a screen reader hears the change, not only a strikethrough");
  assert.match(html, /Added timeline/);
  assert.doesNotMatch(html, /claim-|Stack by project/, "never claim ids or block titles");
  const same = renderToStaticMarkup(createElement(OakWhatChanged, { previous: pointsTable, next: pointsTableReordered }));
  assert.match(same, /Same blocks as the last answer/);
  assert.doesNotMatch(same, /data-change="(dropped|added)"/);
  const fewer = renderToStaticMarkup(createElement(OakWhatChanged, { previous: twoProjects, next: oneProject }));
  assert.doesNotMatch(fewer, /Same blocks/);
});

test("56 the note adds no icon of its own to the turn, which already has the Related plus (R6-C8); only an added chip carries its plus", () => {
  forceOakWhatChanged(true);
  const icons = html => [...html.matchAll(/data-icon="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(icons(renderToStaticMarkup(createElement(OakWhatChanged, { previous: pointsTable, next: pointsTableReordered }))), []);
  assert.deepEqual(icons(renderToStaticMarkup(createElement(OakWhatChanged, { previous: pointsTable, next: pointsOnly }))), []);
  assert.deepEqual(icons(renderToStaticMarkup(createElement(OakWhatChanged, { previous: pointsOnly, next: pointsTimeline }))), ["add"]);
});

test("56 the transcript's polite region says the note once per redone answer, and never on rerender or reopen", () => {
  forceOakWhatChanged(true);
  const before = [user("q1", "Which stack?"), reply("a1", pointsTable)];
  markOakRedo("q1", before.length);
  const after = [...before, user("q2", "Which stack, by project?"), reply("a2", pointsTimeline)];
  bindOakRedo("q2", after);
  const announced = new Set();
  const spoken = collectOakOutputAnnouncements(after, announced);
  assert.equal(spoken.match(/What changed from the last answer\./g)?.length, 1);
  assert.match(spoken, /Kept points\. Dropped table\. Added timeline\./);
  assert.doesNotMatch(collectOakOutputAnnouncements(after, announced), /What changed/, "a rerender says nothing again");
  assert.doesNotMatch(collectOakOutputAnnouncements(after, new Set(oakOutputUnitKeys(after))), /What changed/, "a reopened transcript stays quiet");
  const plain = [...after, user("q3", "Any awards?"), reply("a3", pointsOnly)];
  assert.doesNotMatch(collectOakOutputAnnouncements(plain, announced), /What changed/, "an ordinary question has no note to say");
  forceOakWhatChanged(null);
  const off = [user("q1", "Which stack?"), reply("a1", pointsTable), user("q2", "Again"), reply("a2", pointsOnly)];
  assert.doesNotMatch(collectOakOutputAnnouncements(off, new Set()), /What changed/, "off says nothing");
});

test("56 Ask again and Edit on the newest question compare with the answer they replace", () => {
  forceOakWhatChanged(true);
  const before = [user("q1", "Which stack did Steve use?"), reply("a1", pointsTable)];
  markOakRedo("q1", before.length);
  const after = [...before, user("q2", "Which stack did Steve use for Oakminder?"), reply("a2", pointsOnly)];
  bindOakRedo("q2", after);
  assert.equal(oakWhatChangedPrevious(after, 3), pointsTable);
  assert.equal(oakWhatChangedPrevious(after, 1), null, "the first answer has no note");
});

test("56 an Edit that kept the visitor's draft, or an Ask again that did not send, marks nothing", () => {
  forceOakWhatChanged(true);
  const before = [user("q1", "Which stack?"), reply("a1", pointsTable)];
  assert.equal(markOakRedo("q1", before.length, () => false), false);
  const next = [...before, user("q2", "Any awards?"), reply("a2", pointsOnly)];
  bindOakRedo("q2", next);
  assert.equal(oakWhatChangedPrevious(next, 3), null, "the next ordinary question gets no note");
  assert.equal(retryOakTurn("not-a-turn"), false, "Ask again reports a send that never started");
  assert.equal(markOakRedo("q1", before.length, () => true), true);
  assert.equal(oakWhatChangedPrevious(next, 3), pointsTable, "a send that went is marked");
});

test("56 reading the note binds nothing; the sent question's turn binds the mark", () => {
  forceOakWhatChanged(true);
  const before = [user("q1", "Which stack?"), reply("a1", pointsTable)];
  markOakRedo("q1", before.length);
  const after = [...before, user("q2", "Which stack, by project?"), reply("a2", pointsOnly)];
  assert.equal(oakWhatChangedPrevious(after, 3), pointsTable);
  markOakRedo("q2", after.length);
  assert.equal(oakWhatChangedPrevious(after, 3), null, "a render did not keep the old mark");
  resetOakRedo();
  markOakRedo("q1", before.length);
  bindOakRedo("q2", after);
  markOakRedo("q2", after.length);
  assert.equal(oakWhatChangedPrevious(after, 3), pointsTable, "the bound question keeps its mark");
});

test("56 Edit on an earlier question compares with that question's answer, not the newest one", () => {
  forceOakWhatChanged(true);
  const before = [user("q1", "Which stack?"), reply("a1", pointsTable), user("q2", "Any awards?"), reply("a2", pointsTimeline)];
  markOakRedo("q1", before.length);
  const after = [...before, user("q3", "Which stack, by project?"), reply("a3", pointsOnly)];
  bindOakRedo("q3", after);
  assert.equal(oakWhatChangedPrevious(after, 5), pointsTable);
  assert.equal(oakWhatChangedPrevious(after, 3), null, "an ordinary follow-up has no note");
  const later = [...after, user("q4", "And testing?"), reply("a4", pointsTable)];
  assert.equal(oakWhatChangedPrevious(later, 7), null, "the mark binds the next question only");
  assert.equal(oakWhatChangedPrevious(later, 5), pointsTable, "and stays with it");
});

test("56 a redone answer's turn draws the note above its answer; an ordinary one and the constant off draw none", () => {
  const messages = [user("q1", "Which stack?"), reply("a1", pointsTable), user("q2", "Which stack, by project?"), reply("a2", pointsOnly)];
  setOakWorkspaceFixture({ messages });
  const turn = () => renderToStaticMarkup(createElement(OakTurn, { latest: true, question: "Which stack, by project?", progress: "", contactPreference: "open",
    retry: null, copied: null, onCopy() {}, onContact() {}, message: messages[3] }));
  forceOakWhatChanged(true);
  assert.doesNotMatch(turn(), /oak-what-changed/, "no Edit or Ask again, no note");
  markOakRedo("q1", 2);
  assert.match(turn(), /class="oak-what-changed"[\s\S]*Dropped table/);
  forceOakWhatChanged(null);
  assert.doesNotMatch(turn(), /oak-what-changed/);
});
