import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const DAY = 24 * 60 * 60 * 1000;
const WINDOW = 7 * DAY;
const SITTING_1_TEACH = "2026-11-20T17:51:00Z";
const SITTING_1_FLIP_2 = "2026-11-21T18:13:42Z";
const GO_LIVE_324 = "2026-11-27T18:15:00Z";
const on = (ticket, live, retire) => ({ ticket, sitting: "1", state: "on", live, retire });
const off = ticket => ({ ticket, sitting: "pending", state: "off" });

const REGISTRY = {
  "src/lib/oakChatFlags.ts": {
    oakEditEarlierQuestions: off("22"),
  },
  "src/lib/oakFlags": {
    oakAnswerOrnament: on("58", SITTING_1_FLIP_2, "38"), oakBoardBlock: on("34", SITTING_1_FLIP_2, "38"),
    oakCompareMatrix: on("57", SITTING_1_FLIP_2, "38"), oakScreensBlock: on("39", SITTING_1_FLIP_2, "38"),
    oakSourceButton: on("57", SITTING_1_FLIP_2, "38"), oakStackMap: on("32", SITTING_1_FLIP_2, "38"),
    oakStepPeeks: on("26", SITTING_1_FLIP_2, "38"), oakTimelineLanes: on("57", SITTING_1_FLIP_2, "38"),
    oakDiagramBlock: on("44", SITTING_1_TEACH, "38"), oakPageCards: on("41", SITTING_1_TEACH, "38"),
    oakProfileBlock: on("28", SITTING_1_TEACH, "38"), oakProjectWall: on("31", SITTING_1_TEACH, "38"),
    oakTableBlock: on("33", SITTING_1_TEACH, "38"),
    oakCalloutKinds: off("57"), oakCardAfterAnswer: off("230"), oakChatFirstHome: off("67"), oakCommandPalette: off("47"),
    oakContactCard: off("49"), oakDrawnDiagrams: off("54"), oakEvidenceChart: off("40"), oakExplainerBlock: off("52"),
    oakFramingLineCount: off("227"), oakGalleryPage: off("50"), oakGapNoteBelow: off("225"), oakHeadingChip: off("57"), oakKindDecisions: off("60"),
    oakKindSimilar: off("60"), oakKindUnresolved: off("60"), oakMetricKind: off("43"), oakMetricResult: off("57"),
    oakOwnershipBlock: off("27"), oakPausedBanner: off("48"), oakPlanFirst: on("17", GO_LIVE_324, "38"), oakQuoteBlock: off("29"),
    oakRecordCardsAtPlan: on("169", GO_LIVE_324, "38"), oakRecordOnlyBlocks: off("46"), oakRecordQuery: off("72"), oakRoleEntryCard: off("42"), oakShowMeAs: off("19"),
    oakSiteCard: off("59"), oakWebBesideWork: off("55"), oakWhatChanged: off("56"),
  },
};

const constantsIn = source => Object.fromEntries([...source.matchAll(/^export const (\w+) = (true|false);/gm)].map(([, name, value]) => [name, value === "true"]));
const shipped = () => ({
  "src/lib/oakChatFlags.ts": constantsIn(readFileSync("src/lib/oakChatFlags.ts", "utf8")),
  "src/lib/oakFlags": Object.assign({}, ...readdirSync("src/lib/oakFlags").filter(file => file.endsWith(".ts"))
    .map(file => constantsIn(readFileSync(`src/lib/oakFlags/${file}`, "utf8")))),
});

export const overdue = (registry, constants, now) => Object.entries(constants).flatMap(([place, names]) => Object.entries(names)
  .filter(([name, value]) => value && !registry[place]?.[name]?.retire && !(Date.parse(registry[place]?.[name]?.live) + WINDOW > now))
  .map(([name]) => `${place}: ${name}`));

test("flag registry: every shipped switch names its ticket, sitting and state, and the state matches the source", () => {
  const constants = shipped();
  for (const [place, names] of Object.entries(constants)) {
    assert.deepEqual(Object.keys(REGISTRY[place]).sort(), Object.keys(names).sort(), `${place}: registry rows match the shipped switches`);
    for (const [name, value] of Object.entries(names)) {
      const row = REGISTRY[place][name];
      assert.match(row.ticket, /^\d+[a-z]?$/, `${name} names its ticket`);
      assert.ok(row.sitting, `${name} names its sitting`);
      assert.equal(row.state, value ? "on" : "off", `${name} state matches the source`);
      if (value) assert.ok(Number.isFinite(Date.parse(row.live)), `${name} names when it went live`);
    }
  }
});

test("flag registry: no switch is on past its 7-day window without an open retire ticket", () => {
  assert.deepEqual(overdue(REGISTRY, shipped(), Date.now()), []);
});

test("flag registry: the switches ticket 324 turned on still pass a day after their 7-day window", () => {
  assert.deepEqual(overdue(REGISTRY, shipped(), Date.parse(GO_LIVE_324) + WINDOW + DAY), []);
});

test("flag registry: the window check flags an on switch past 7 days with no retire ticket, and only that one", () => {
  const now = Date.parse("2026-12-01T00:00:00Z");
  const registry = { f: { late: { live: "2026-11-01T00:00:00Z" }, fresh: { live: "2026-11-30T00:00:00Z" }, owned: { live: "2026-11-01T00:00:00Z", retire: "38" }, unlisted: undefined } };
  assert.deepEqual(overdue(registry, { f: { late: true, fresh: true, owned: true, dark: false, unlisted: true } }, now), ["f: late", "f: unlisted"]);
});
