import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { loadTsx } from "../design-rework/load-tsx.mjs";
import { galleryStates } from "../premium/gallery.mjs";

const PINS = {
  "src/lib/oakChatFlags.ts": {
    oakRelatedDrawer: true, oakExplainSimply: true, oakBriefSummary: true, oakEditEarlierQuestions: false, oakComposerPasteOffer: true,
    oakResearchTally: true, oakStepRetry: true, oakSourceBackdrop: true, oakToolMarks: true, oakWebRowChecked: true,
    oakTypedSkeletons: true, oakProposalTopics: true,
  },
  "src/lib/oakFlags/chatFirstHome.ts": { oakChatFirstHome: false },
  "src/lib/oakFlags/pausedBanner.ts": { oakPausedBanner: false },
  "src/lib/oakFlags/planFirst.ts": { oakPlanFirst: false },
  "src/lib/oakFlags/showMeAs.ts": { oakShowMeAs: false },
  "src/lib/oakFlags/ownership.ts": { oakOwnershipBlock: false },
  "src/lib/oakFlags/projectWall.ts": { oakProjectWall: true },
  "src/lib/oakFlags/profile.ts": { oakProfileBlock: true },
  "src/lib/oakFlags/quote.ts": { oakQuoteBlock: false },
  "src/lib/oakFlags/contactCard.ts": { oakContactCard: false },
  "src/lib/oakFlags/recordCardsAtPlan.ts": { oakRecordCardsAtPlan: false },
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
  const read = () => ({ relatedDrawer: flags.oakRelatedDrawerOn(), explainSimply: flags.oakExplainSimplyOn(), briefSummary: flags.oakBriefSummaryOn(), editEarlier: flags.oakEditEarlierOn() });
  const shipped = { relatedDrawer: true, explainSimply: true, briefSummary: true, editEarlier: false };
  flags.forceOakFlags({ relatedDrawer: false, editEarlier: true });
  assert.deepEqual(read(), { ...shipped, relatedDrawer: false, editEarlier: true });
  flags.forceOakFlags({});
  assert.deepEqual(read(), shipped);
});

test("flag pins: every gallery state pins only switches forceOakFlags knows, as booleans", () => {
  const known = ["relatedDrawer", "explainSimply", "briefSummary", "editEarlier"];
  const pinned = galleryStates.filter(state => state.flags);
  assert.ok(pinned.length > 0, "some gallery states pin their switches");
  for (const state of pinned) for (const [name, value] of Object.entries(state.flags)) {
    assert.ok(known.includes(name) && typeof value === "boolean", `${state.id}: flags.${name}`);
  }
  assert.deepEqual(galleryStates.filter(state => "relatedDrawer" in state || "review" in state).map(state => state.id), [], "the old per-switch keys are gone");
});
