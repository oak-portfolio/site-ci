import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { loadTsx } from "../design-rework/load-tsx.mjs";
import { galleryStates } from "../premium/gallery.mjs";

const PINS = {
  "src/lib/oakChatFlags.ts": {
    oakEditEarlierQuestions: false,
  },
  "src/lib/oakFlags/chatFirstHome.ts": { oakChatFirstHome: false },
  "src/lib/oakFlags/pausedBanner.ts": { oakPausedBanner: false },
  "src/lib/oakFlags/planFirst.ts": { oakPlanFirst: true },
  "src/lib/oakFlags/recordQuery.ts": { oakRecordQuery: false },
  "src/lib/oakFlags/showMeAs.ts": { oakShowMeAs: false },
  "src/lib/oakFlags/ownership.ts": { oakOwnershipBlock: false },
  "src/lib/oakFlags/galleryPage.ts": { oakGalleryPage: false },
  "src/lib/oakFlags/projectWall.ts": { oakProjectWall: true },
  "src/lib/oakFlags/profile.ts": { oakProfileBlock: true },
  "src/lib/oakFlags/quote.ts": { oakQuoteBlock: false },
  "src/lib/oakFlags/contactCard.ts": { oakContactCard: false },
  "src/lib/oakFlags/recordCardsAtPlan.ts": { oakRecordCardsAtPlan: true },
  "src/lib/oakFlags/framingLineCount.ts": { oakFramingLineCount: false },
  "src/lib/oakFlags/gapNoteBelow.ts": { oakGapNoteBelow: false },
  "src/lib/oakFlags/cardAfterAnswer.ts": { oakCardAfterAnswer: false },
  "src/lib/oakFlags/stackMap.ts": { oakStackMap: true },
  "src/lib/oakFlags/table.ts": { oakTableBlock: true },
  "src/lib/oakFlags/board.ts": { oakBoardBlock: true },
  "src/lib/oakFlags/timelineLanes.ts": { oakTimelineLanes: true },
  "src/lib/oakFlags/compareMatrix.ts": { oakCompareMatrix: true },
  "src/lib/oakFlags/sourceButton.ts": { oakSourceButton: true },
  "src/lib/oakFlags/metricResult.ts": { oakMetricResult: false },
  "src/lib/oakFlags/calloutKinds.ts": { oakCalloutKinds: false },
  "src/lib/oakFlags/kindDecisions.ts": { oakKindDecisions: false },
  "src/lib/oakFlags/kindSimilar.ts": { oakKindSimilar: false },
  "src/lib/oakFlags/kindUnresolved.ts": { oakKindUnresolved: false },
  "src/lib/oakFlags/headingChip.ts": { oakHeadingChip: false },
  "src/lib/oakFlags/webBesideWork.ts": { oakWebBesideWork: false },
  "src/lib/oakFlags/whatChanged.ts": { oakWhatChanged: false },
  "src/lib/oakFlags/answerOrnament.ts": { oakAnswerOrnament: true },
  "src/lib/oakFlags/screens.ts": { oakScreensBlock: true },
  "src/lib/oakFlags/stepPeeks.ts": { oakStepPeeks: true },
  "src/lib/oakFlags/evidenceChart.ts": { oakEvidenceChart: false },
  "src/lib/oakFlags/pageCards.ts": { oakPageCards: true },
  "src/lib/oakFlags/recordOnlyBlocks.ts": { oakRecordOnlyBlocks: false },
  "src/lib/oakFlags/roleEntryCard.ts": { oakRoleEntryCard: false },
  "src/lib/oakFlags/metricKind.ts": { oakMetricKind: false },
  "src/lib/oakFlags/diagram.ts": { oakDiagramBlock: true },
  "src/lib/oakFlags/explainer.ts": { oakExplainerBlock: false },
  "src/lib/oakFlags/drawnDiagrams.ts": { oakDrawnDiagrams: false },
  "src/lib/oakFlags/siteCard.ts": { oakSiteCard: false },
  "src/lib/oakFlags/commandPalette.ts": { oakCommandPalette: false },
};

const flagFiles = ["src/lib/oakChatFlags.ts", ...existsSync("src/lib/oakFlags")
  ? readdirSync("src/lib/oakFlags").filter(file => file.endsWith(".ts")).map(file => `src/lib/oakFlags/${file}`) : []];
const constantsOf = (file) => Object.fromEntries(Object.entries(loadTsx(file)).filter(([, value]) => typeof value === "boolean"));

test("flag pins: every switch constant is pinned with its default, and nothing pinned is gone", () => {
  for (const file of flagFiles) {
    const shipped = constantsOf(file), pinned = PINS[file] ?? {};
    for (const [name, value] of Object.entries(shipped)) {
      if (!(name in pinned)) assert.fail(value
        ? `${file}: new constant ${name} defaults to true; a constant ships false and ticket 36 flips it`
        : `${file}: pin the new constant ${name}: false in tests/agent/openui/flag-pins.test.mjs`);
      assert.equal(value, pinned[name], `${file}: ${name} changed its default; only a ticket 36 flip updates its row`);
    }
    assert.deepEqual(Object.keys(pinned).filter(name => !(name in shipped)), [], `${file}: pinned constants that no longer exist`);
  }
  assert.deepEqual(Object.keys(PINS).filter(file => !flagFiles.includes(file)), [], "every pinned file is read");
});

test("flag pins: forceOakFlags pins only the switches a gallery state names, and an empty set restores the shipped ones", () => {
  const flags = loadTsx("src/lib/oakChatFlags.ts");
  const read = () => ({ editEarlier: flags.oakEditEarlierOn() });
  const pins = PINS["src/lib/oakChatFlags.ts"];
  const shipped = { editEarlier: pins.oakEditEarlierQuestions };
  flags.forceOakFlags({ editEarlier: !pins.oakEditEarlierQuestions });
  assert.deepEqual(read(), { editEarlier: !pins.oakEditEarlierQuestions });
  flags.forceOakFlags({});
  assert.deepEqual(read(), shipped);
});

test("flag pins: every gallery state pins only switches forceOakFlags knows, as booleans", () => {
  const known = ["editEarlier"];
  const pinned = galleryStates.filter(state => state.flags);
  assert.ok(pinned.length > 0, "some gallery states pin their switches");
  for (const state of pinned) for (const [name, value] of Object.entries(state.flags)) {
    assert.ok(known.includes(name) && typeof value === "boolean", `${state.id}: flags.${name}`);
  }
  assert.deepEqual(galleryStates.filter(state => "relatedDrawer" in state || "review" in state).map(state => state.id), [], "the old per-switch keys are gone");
});

// Ticket 229: an -off state names the switch it turns off, so a flip moves only the states whose output changes on purpose.
const NO_SWITCH = { "voice-off": "the voice fixture's own availability, not a switch" };

test("flag pins: every gallery state whose id ends -off pins its switch's gallery key", () => {
  const keys = new Set(flagFiles.filter(file => file !== "src/lib/oakChatFlags.ts").map(file => loadTsx(file).oakGalleryKey).filter(Boolean));
  const offStates = galleryStates.filter(state => state.id.endsWith("-off") && !(state.id in NO_SWITCH));
  assert.ok(offStates.length > 0, "the gallery has -off states");
  const stemKey = id => id.replace(/-off$/, "").replace(/-(\w)/g, (_, letter) => letter.toUpperCase());
  const unpinned = offStates.filter(state => keys.has(stemKey(state.id)) ? typeof state[stemKey(state.id)] !== "boolean"
    : !Object.keys(state).some(key => keys.has(key) && typeof state[key] === "boolean") && !Object.values(state.flags ?? {}).some(value => typeof value === "boolean"));
  assert.deepEqual(unpinned.map(state => state.id), [], `${unpinned.length} -off states leave their switch to its shipped default`);
  assert.deepEqual(Object.keys(NO_SWITCH).filter(id => !galleryStates.some(state => state.id === id)), [], "every NO_SWITCH id is a gallery state");
});

test("flag pins: no test outside this file asserts a switch constant's shipped value", () => {
  const shippedValue = /assert\.(equal|strictEqual)\(\s*(\w+\.)?oak[A-Z]\w*,\s*(true|false)\s*[,)]/;
  const files = readdirSync("tests/agent", { recursive: true }).filter(file => /\.(m?js|ts)$/.test(file) && !file.endsWith("flag-pins.test.mjs"));
  const found = files.flatMap(file => readFileSync(`tests/agent/${file}`, "utf8").split("\n")
    .map((line, index) => ({ where: `tests/agent/${file}:${index + 1}`, line: line.trim() }))
    .filter(({ line }) => !line.startsWith("//") && shippedValue.test(line)));
  assert.deepEqual(found.map(({ where }) => where), [], `${found.length} assertions read a shipped value; force the side the test means and leave the value to PINS`);
});
