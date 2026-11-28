import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { debtChanges, mergeStates, rebuildDebt } from "../../../scripts/design-policy/judge-debt.mjs";

// Rows of known-debt.json at fe307e327 that the findings touch, trimmed to the judged states, their judgeLike bases
// and one other state each. `edits` is what the hand-edit commit changed in those rows: f37's 084813ecc and root's
// c500efb1e. Findings are [state, width, rule, detail, times], from site-ci run 46071014472 shard-0 (linux), f37's
// judge-states run (darwin) and r334's judge run (darwin), the last without the findings its base state's own Mac run
// shows at the same count, which r334 left to that state.
const F37 = {
  like: {"answer-openui-stats-label-held":"answer-openui-settled","record-dated":"answer-openui-projects"},
  before: [
    {"rule":"card-in-card","width":390,"detail":"div.oak-openui-card__metric sits inside card article.oak-openui-card","platform":"darwin","states":{"answer-openui-projects":4,"answer-openui-projects-streaming":2},"ticket":"57","reason":"a framed box nested in a card: div.oak-openui-card__metric, article.oak-openui-card"},
    {"rule":"card-in-card","width":390,"detail":"div.oak-openui-card__metric sits inside card article.oak-openui-card","platform":"linux","states":{"answer-openui-projects":4,"answer-openui-projects-streaming":2},"ticket":"57","reason":"a framed box nested in a card: div.oak-openui-card__metric, article.oak-openui-card"},
    {"rule":"card-in-card","width":1440,"detail":"div.oak-openui-card__metric sits inside card article.oak-openui-card","platform":"darwin","states":{"answer-openui-projects":4,"answer-openui-projects-streaming":2},"ticket":"57","reason":"a framed box nested in a card: div.oak-openui-card__metric, article.oak-openui-card"},
    {"rule":"card-in-card","width":1440,"detail":"div.oak-openui-card__metric sits inside card article.oak-openui-card","platform":"linux","states":{"answer-openui-projects":4,"answer-openui-projects-streaming":2},"ticket":"57","reason":"a framed box nested in a card: div.oak-openui-card__metric, article.oak-openui-card"},
    {"rule":"card-in-card","width":390,"detail":"span.oak-openui-art sits inside card article.oak-openui-card","platform":"darwin","states":{"answer-openui-stack":4,"answer-openui-projects":4},"ticket":"57","reason":"a framed box nested in a card: span.oak-openui-art, article.oak-openui-card"},
    {"rule":"card-in-card","width":390,"detail":"span.oak-openui-art sits inside card article.oak-openui-card","platform":"linux","states":{"answer-openui-projects":2,"answer-openui-stack":2},"ticket":"57","reason":"a framed box nested in a card: span.oak-openui-art, article.oak-openui-card"},
    {"rule":"card-in-card","width":1440,"detail":"span.oak-openui-art sits inside card article.oak-openui-card","platform":"darwin","states":{"answer-openui-stack":4,"answer-openui-projects":4},"ticket":"57","reason":"a framed box nested in a card: span.oak-openui-art, article.oak-openui-card"},
    {"rule":"card-in-card","width":1440,"detail":"span.oak-openui-art sits inside card article.oak-openui-card","platform":"linux","states":{"answer-openui-projects":2,"answer-openui-stack":2},"ticket":"57","reason":"a framed box nested in a card: span.oak-openui-art, article.oak-openui-card"},
    {"rule":"case-image-frame","width":390,"detail":"span.oak-openui-art shows a case image #px wide outside a media frame","platform":"darwin","states":{"answer-openui-stack":4,"answer-openui-projects":4},"ticket":"57","reason":"case art drawn without a media frame: span.oak-openui-art"},
    {"rule":"case-image-frame","width":390,"detail":"span.oak-openui-art shows a case image #px wide outside a media frame","platform":"linux","states":{"answer-openui-projects":2,"answer-openui-stack":2},"ticket":"57","reason":"case art drawn without a media frame: span.oak-openui-art"},
    {"rule":"case-image-frame","width":1440,"detail":"span.oak-openui-art shows a case image #px wide outside a media frame","platform":"darwin","states":{"answer-openui-stack":4,"answer-openui-projects":4},"ticket":"57","reason":"case art drawn without a media frame: span.oak-openui-art"},
    {"rule":"case-image-frame","width":1440,"detail":"span.oak-openui-art shows a case image #px wide outside a media frame","platform":"linux","states":{"answer-openui-projects":2,"answer-openui-stack":2},"ticket":"57","reason":"case art drawn without a media frame: span.oak-openui-art"},
    {"rule":"elevation-tier","width":390,"detail":"div.oak-composer__surface lifts with \"rgba(0, 0, 0, 0.5) 0px 6px 16px -6px\", outside the three elevation tiers","platform":"darwin","states":{"empty-recruiter-initials":2,"answer-openui-settled":2,"answer-openui-projects":2},"ticket":"23","reason":"a shadow or glow outside the three elevation tokens: div.oak-composer__surface, 0.5"},
    {"rule":"elevation-tier","width":390,"detail":"div.oak-composer__surface lifts with \"rgba(0, 0, 0, 0.5) 0px 6px 16px -6px\", outside the three elevation tiers","platform":"linux","states":{"empty":1,"answer-openui-settled":1,"answer-openui-projects":1},"ticket":"23","reason":"a shadow or glow outside the three elevation tokens: div.oak-composer__surface, 0.5"},
    {"rule":"elevation-tier","width":1440,"detail":"div.oak-composer__surface lifts with \"rgba(0, 0, 0, 0.5) 0px 6px 16px -6px\", outside the three elevation tiers","platform":"darwin","states":{"empty-recruiter-initials":2,"answer-openui-settled":2,"answer-openui-projects":2},"ticket":"23","reason":"a shadow or glow outside the three elevation tokens: div.oak-composer__surface, 0.5"},
    {"rule":"elevation-tier","width":1440,"detail":"div.oak-composer__surface lifts with \"rgba(0, 0, 0, 0.5) 0px 6px 16px -6px\", outside the three elevation tiers","platform":"linux","states":{"empty":1,"answer-openui-settled":1,"answer-openui-projects":1},"ticket":"23","reason":"a shadow or glow outside the three elevation tokens: div.oak-composer__surface, 0.5"},
    {"rule":"glass-contrast","width":390,"detail":"div.oak-composer__surface (fill alpha #) leaves span at #:# over the brightest text behind it","platform":"darwin","states":{"empty-recruiter-initials":1,"answer-openui-projects":1},"worst":{"1":1},"ticket":"23","reason":"a translucent surface leaves its text under AA over the text behind it: div.oak-composer__surface"},
    {"rule":"glass-contrast","width":390,"detail":"div.oak-composer__surface (fill alpha #) leaves span at #:# over the brightest text behind it","platform":"linux","states":{"empty":1,"answer-openui-projects":1},"worst":{"1":1},"ticket":"23","reason":"a translucent surface leaves its text under AA over the text behind it: div.oak-composer__surface; land-33 new states (296 lone cards, 298 opening figure): composer glass at 390, as for 254"},
    {"rule":"prose-cell","width":390,"detail":"a row keeps a picture beside prose (div.oak-openui-card__name): about # characters a line","platform":"darwin","states":{"answer-openui-stack":2,"answer-openui-projects":2},"worst":{"0":20},"ticket":"57","reason":"a thumbnail or file icon beside prose leaves under 28 characters a line: div.oak-openui-card__name; 207 full-month date range adds one line; the cell is a role plus a date, nothing clipped"},
    {"rule":"prose-cell","width":390,"detail":"a row keeps a picture beside prose (div.oak-openui-card__name): about # characters a line","platform":"linux","states":{"answer-openui-projects-streaming":1},"worst":{"0":22},"ticket":"57","reason":"a thumbnail or file icon beside prose leaves under 28 characters a line: div.oak-openui-card__name; 207 full-month date range adds one line; the cell is a role plus a date, nothing clipped"},
    {"rule":"tight-spacing","width":1440,"detail":"button.oak-composer__meter and button.ui-button are #px apart","platform":"darwin","states":{"empty-recruiter-initials":2,"answer-openui-settled":2,"answer-openui-projects":2},"worst":{"0":0},"ticket":"23","reason":"targets or text frames under the 8px gap or 12px padding floor: button.oak-composer__meter, button.ui-button"},
    {"rule":"tight-spacing","width":1440,"detail":"button.oak-composer__meter and button.ui-button are #px apart","platform":"linux","states":{"empty":1,"answer-openui-settled":1,"answer-openui-projects":1},"worst":{"0":0},"ticket":"23","reason":"targets or text frames under the 8px gap or 12px padding floor: button.oak-composer__meter, button.ui-button"},
    {"rule":"tight-spacing","width":390,"detail":"button.ui-button and button.ui-button are #px apart","platform":"darwin","states":{"empty-recruiter-initials":1,"answer-openui-settled":2,"answer-openui-projects":2},"worst":{"0":4},"ticket":"23","reason":"targets or text frames under the 8px gap or 12px padding floor: button.ui-button"},
    {"rule":"tight-spacing","width":390,"detail":"button.ui-button and button.ui-button are #px apart","platform":"linux","states":{"empty":1,"answer-openui-settled":2,"answer-openui-projects":2},"worst":{"0":4},"ticket":"23","reason":"targets or text frames under the 8px gap or 12px padding floor: button.ui-button"},
    {"rule":"tight-spacing","width":1440,"detail":"button.ui-button and button.ui-button are #px apart","platform":"darwin","states":{"empty-recruiter-initials":6,"answer-openui-settled":8,"answer-openui-projects":8},"worst":{"0":0},"ticket":"23","reason":"targets or text frames under the 8px gap or 12px padding floor: button.ui-button"},
    {"rule":"tight-spacing","width":1440,"detail":"button.ui-button and button.ui-button are #px apart","platform":"linux","states":{"empty":5,"answer-openui-settled":4,"answer-openui-projects":4},"worst":{"0":0},"ticket":"23","reason":"targets or text frames under the 8px gap or 12px padding floor: button.ui-button"},
    {"rule":"top-bar","width":390,"detail":"header.oak-workspace__header has no named Search entry","platform":"darwin","states":{"empty-recruiter-initials":2,"answer-openui-settled":2,"answer-openui-projects":2},"ticket":"23","reason":"the agent header has no named Search entry yet: header.oak-workspace__header"},
    {"rule":"top-bar","width":390,"detail":"header.oak-workspace__header has no named Search entry","platform":"linux","states":{"empty":1,"answer-openui-settled":1,"answer-openui-projects":1},"ticket":"23","reason":"the agent header has no named Search entry yet: header.oak-workspace__header"},
    {"rule":"top-bar","width":1440,"detail":"header.oak-workspace__header has no named Search entry","platform":"darwin","states":{"empty-recruiter-initials":2,"answer-openui-settled":2,"answer-openui-projects":2},"ticket":"23","reason":"the agent header has no named Search entry yet: header.oak-workspace__header"},
    {"rule":"top-bar","width":1440,"detail":"header.oak-workspace__header has no named Search entry","platform":"linux","states":{"empty":1,"answer-openui-settled":1,"answer-openui-projects":1},"ticket":"23","reason":"the agent header has no named Search entry yet: header.oak-workspace__header"},
  ],
  edits: [[16,"answer-openui-stats-label-held",1],[17,"answer-openui-stats-label-held",1],[19,"record-dated",1]],
  linux: [
    ["answer-openui-stats-label-held",390,"tight-spacing","button.ui-button and button.ui-button are 4px apart",2],
    ["answer-openui-stats-label-held",390,"glass-contrast","div.oak-composer__surface (fill alpha 0.04) leaves span at 2.14:1 over the brightest text behind it",1],
    ["answer-openui-stats-label-held",390,"top-bar","header.oak-workspace__header has no named Search entry",1],
    ["answer-openui-stats-label-held",390,"elevation-tier","div.oak-composer__surface lifts with \"rgba(0, 0, 0, 0.5) 0px 6px 16px -6px\", outside the three elevation tiers",1],
    ["answer-openui-stats-label-held",1440,"tight-spacing","button.ui-button and button.ui-button are 4px apart",2],
    ["answer-openui-stats-label-held",1440,"tight-spacing","button.ui-button and button.ui-button are 0px apart",2],
    ["answer-openui-stats-label-held",1440,"tight-spacing","button.oak-composer__meter and button.ui-button are 2.2px apart",1],
    ["answer-openui-stats-label-held",1440,"top-bar","header.oak-workspace__header has no named Search entry",1],
    ["answer-openui-stats-label-held",1440,"elevation-tier","div.oak-composer__surface lifts with \"rgba(0, 0, 0, 0.5) 0px 6px 16px -6px\", outside the three elevation tiers",1],
    ["record-dated",390,"card-in-card","span.oak-openui-art sits inside card article.oak-openui-card",2],
    ["record-dated",390,"card-in-card","div.oak-openui-card__metric sits inside card article.oak-openui-card",3],
    ["record-dated",390,"tight-spacing","button.ui-button and button.ui-button are 4px apart",2],
    ["record-dated",390,"case-image-frame","span.oak-openui-art shows a case image 107px wide outside a media frame",2],
    ["record-dated",390,"glass-contrast","div.oak-composer__surface (fill alpha 0.04) leaves span at 2.14:1 over the brightest text behind it",1],
    ["record-dated",390,"prose-cell","a row keeps a picture beside prose (div.oak-openui-card__name): about 22 characters a line",1],
    ["record-dated",390,"top-bar","header.oak-workspace__header has no named Search entry",1],
    ["record-dated",390,"elevation-tier","div.oak-composer__surface lifts with \"rgba(0, 0, 0, 0.5) 0px 6px 16px -6px\", outside the three elevation tiers",1],
    ["record-dated",1440,"card-in-card","span.oak-openui-art sits inside card article.oak-openui-card",2],
    ["record-dated",1440,"card-in-card","div.oak-openui-card__metric sits inside card article.oak-openui-card",3],
    ["record-dated",1440,"tight-spacing","button.ui-button and button.ui-button are 4px apart",2],
    ["record-dated",1440,"tight-spacing","button.ui-button and button.ui-button are 0px apart",2],
    ["record-dated",1440,"tight-spacing","button.oak-composer__meter and button.ui-button are 2.2px apart",1],
    ["record-dated",1440,"case-image-frame","span.oak-openui-art shows a case image 152px wide outside a media frame",2],
    ["record-dated",1440,"top-bar","header.oak-workspace__header has no named Search entry",1],
    ["record-dated",1440,"elevation-tier","div.oak-composer__surface lifts with \"rgba(0, 0, 0, 0.5) 0px 6px 16px -6px\", outside the three elevation tiers",1],
  ],
  darwin: [
    ["record-dated",390,"card-in-card","span.oak-openui-art sits inside card article.oak-openui-card",2],
    ["record-dated",390,"card-in-card","div.oak-openui-card__metric sits inside card article.oak-openui-card",3],
    ["record-dated",390,"tight-spacing","button.ui-button and button.ui-button are 4px apart",2],
    ["record-dated",390,"case-image-frame","span.oak-openui-art shows a case image 107px wide outside a media frame",2],
    ["record-dated",390,"glass-contrast","div.oak-composer__surface (fill alpha 0.04) leaves span at 2.14:1 over the brightest text behind it",1],
    ["record-dated",390,"prose-cell","a row keeps a picture beside prose (div.oak-openui-card__name): about 24 characters a line",1],
    ["record-dated",390,"top-bar","header.oak-workspace__header has no named Search entry",1],
    ["record-dated",390,"elevation-tier","div.oak-composer__surface lifts with \"rgba(0, 0, 0, 0.5) 0px 6px 16px -6px\", outside the three elevation tiers",1],
    ["record-dated",1280,"card-in-card","span.oak-openui-art sits inside card article.oak-openui-card",2],
    ["record-dated",1280,"card-in-card","div.oak-openui-card__metric sits inside card article.oak-openui-card",3],
    ["record-dated",1280,"tight-spacing","button.ui-button and button.ui-button are 4px apart",2],
    ["record-dated",1280,"tight-spacing","button.ui-button and button.ui-button are 0px apart",2],
    ["record-dated",1280,"tight-spacing","button.oak-composer__meter and button.ui-button are 2.2px apart",1],
    ["record-dated",1280,"case-image-frame","span.oak-openui-art shows a case image 152px wide outside a media frame",2],
    ["record-dated",1280,"top-bar","header.oak-workspace__header has no named Search entry",1],
    ["record-dated",1280,"elevation-tier","div.oak-composer__surface lifts with \"rgba(0, 0, 0, 0.5) 0px 6px 16px -6px\", outside the three elevation tiers",1],
    ["answer-openui-stats-label-held",390,"tight-spacing","button.ui-button and button.ui-button are 4px apart",2],
    ["answer-openui-stats-label-held",390,"glass-contrast","div.oak-composer__surface (fill alpha 0.04) leaves span at 2.14:1 over the brightest text behind it",1],
    ["answer-openui-stats-label-held",390,"top-bar","header.oak-workspace__header has no named Search entry",1],
    ["answer-openui-stats-label-held",390,"elevation-tier","div.oak-composer__surface lifts with \"rgba(0, 0, 0, 0.5) 0px 6px 16px -6px\", outside the three elevation tiers",1],
    ["answer-openui-stats-label-held",1280,"tight-spacing","button.ui-button and button.ui-button are 4px apart",2],
    ["answer-openui-stats-label-held",1280,"tight-spacing","button.ui-button and button.ui-button are 0px apart",2],
    ["answer-openui-stats-label-held",1280,"tight-spacing","button.oak-composer__meter and button.ui-button are 2.2px apart",1],
    ["answer-openui-stats-label-held",1280,"top-bar","header.oak-workspace__header has no named Search entry",1],
    ["answer-openui-stats-label-held",1280,"elevation-tier","div.oak-composer__surface lifts with \"rgba(0, 0, 0, 0.5) 0px 6px 16px -6px\", outside the three elevation tiers",1],
  ],
};

const C500 = {
  like: {"lead-claim-streaming":"diagram-flow-oakminder","lead-claim-settled":"diagram-flow-oakminder"},
  before: [
    {"rule":"tight-spacing","width":390,"detail":"ul.oak-openui__points holds text with #px padding (# # # #)","platform":"darwin","states":{"answer-openui-proposal":2},"worst":{"0":0},"ticket":"57","reason":"targets or text frames under the 8px gap or 12px padding floor: ul.oak-openui__points"},
    {"rule":"tight-spacing","width":390,"detail":"ul.oak-openui__points holds text with #px padding (# # # #)","platform":"linux","states":{"answer-openui-proposal":1},"worst":{"0":0},"ticket":"57","reason":"targets or text frames under the 8px gap or 12px padding floor: ul.oak-openui__points"},
    {"rule":"tight-spacing","width":1440,"detail":"ul.oak-openui__points holds text with #px padding (# # # #)","platform":"darwin","states":{"answer-openui-proposal":2},"worst":{"0":0},"ticket":"57","reason":"targets or text frames under the 8px gap or 12px padding floor: ul.oak-openui__points"},
    {"rule":"tight-spacing","width":1440,"detail":"ul.oak-openui__points holds text with #px padding (# # # #)","platform":"linux","states":{"answer-openui-proposal":1},"worst":{"0":0},"ticket":"57","reason":"targets or text frames under the 8px gap or 12px padding floor: ul.oak-openui__points"},
    {"rule":"verified-claim","width":390,"detail":"check mark icon \"tick\" sits beside a fact in span.oak-openui__point-mark","platform":"darwin","states":{"answer-openui-proposal":8},"ticket":"57","reason":"a check mark or accuracy word beside a fact: span.oak-openui__point-mark"},
    {"rule":"verified-claim","width":390,"detail":"check mark icon \"tick\" sits beside a fact in span.oak-openui__point-mark","platform":"linux","states":{"answer-openui-proposal":4},"ticket":"57","reason":"a check mark or accuracy word beside a fact: span.oak-openui__point-mark"},
    {"rule":"verified-claim","width":1440,"detail":"check mark icon \"tick\" sits beside a fact in span.oak-openui__point-mark","platform":"darwin","states":{"answer-openui-proposal":8},"ticket":"57","reason":"a check mark or accuracy word beside a fact: span.oak-openui__point-mark"},
    {"rule":"verified-claim","width":1440,"detail":"check mark icon \"tick\" sits beside a fact in span.oak-openui__point-mark","platform":"linux","states":{"answer-openui-proposal":4},"ticket":"57","reason":"a check mark or accuracy word beside a fact: span.oak-openui__point-mark"},
  ],
  edits: [[0,"lead-claim-streaming",1],[0,"lead-claim-settled",1],[1,"lead-claim-streaming",1],[1,"lead-claim-settled",1],[2,"lead-claim-streaming",1],[2,"lead-claim-settled",1],[3,"lead-claim-streaming",1],[3,"lead-claim-settled",1],[4,"lead-claim-streaming",4],[4,"lead-claim-settled",4],[5,"lead-claim-streaming",4],[5,"lead-claim-settled",4],[6,"lead-claim-streaming",4],[6,"lead-claim-settled",4],[7,"lead-claim-streaming",4],[7,"lead-claim-settled",4]],
  darwin: [
    ["lead-claim-streaming",390,"tight-spacing","ul.oak-openui__points holds text with 0px padding (8 0 8 0)",1],
    ["lead-claim-streaming",390,"verified-claim","check mark icon \"tick\" sits beside a fact in span.oak-openui__point-mark",4],
    ["lead-claim-streaming",1280,"tight-spacing","ul.oak-openui__points holds text with 0px padding (8 0 8 0)",1],
    ["lead-claim-streaming",1280,"verified-claim","check mark icon \"tick\" sits beside a fact in span.oak-openui__point-mark",4],
    ["lead-claim-settled",390,"tight-spacing","ul.oak-openui__points holds text with 0px padding (8 0 8 0)",1],
    ["lead-claim-settled",390,"verified-claim","check mark icon \"tick\" sits beside a fact in span.oak-openui__point-mark",4],
    ["lead-claim-settled",1280,"tight-spacing","ul.oak-openui__points holds text with 0px padding (8 0 8 0)",1],
    ["lead-claim-settled",1280,"verified-claim","check mark icon \"tick\" sits beside a fact in span.oak-openui__point-mark",4],
  ],
};

const expand = (tuples, platform) => tuples.flatMap(([state, width, rule, detail, n]) => Array.from({ length: n }, () => ({ platform, state, width, rule, detail })));
const edited = (rows, edits, keep = () => true) => rows.map((row, at) => {
  const mine = edits.filter(([i]) => i === at && keep(row));
  if (!mine.length) return row;
  const states = { ...row.states };
  for (const [, state, n] of mine) if (n) states[state] = n; else delete states[state];
  return { ...row, states };
});
const statesOf = (list) => [...new Set(list.map((f) => f.state))];
const like = (fixture) => new Map(Object.entries(fixture.like));

test("343: mergeStates on f37's Linux findings writes the two Linux rows f37 typed, and its Mac findings the third", () => {
  const linux = expand(F37.linux, "linux"), darwin = expand(F37.darwin, "darwin");
  const afterLinux = mergeStates(F37.before, linux, { states: statesOf(linux), platform: "linux", like: like(F37) });
  assert.deepEqual(afterLinux, edited(F37.before, F37.edits, (row) => row.platform === "linux"));
  const both = mergeStates(afterLinux, darwin, { states: statesOf(darwin), platform: "darwin", like: like(F37) });
  assert.deepEqual(both, edited(F37.before, F37.edits));
});

test("343: mergeStates on the two lead-claim states' Mac findings writes c500efb1e's darwin half", () => {
  const darwin = expand(C500.darwin, "darwin");
  const after = mergeStates(C500.before, darwin, { states: statesOf(darwin), platform: "darwin", like: like(C500) });
  assert.deepEqual(after, edited(C500.before, C500.edits, (row) => row.platform === "darwin"));
});

const PROSE = "a row keeps a picture beside prose (div.n): about # characters a line";
const prose = (state, chars, platform = "linux", width = 390) => ({ platform, state, rule: "prose-cell", width, detail: PROSE.replace("#", chars) });
const card = (state, platform = "linux", width = 390) => ({ platform, state, rule: "card-in-card", width, detail: "span.a sits inside card article.b" });
const DEBT = [
  { rule: "card-in-card", width: 390, detail: "span.a sits inside card article.b", states: { base: 1, shared: 1, other: 3 }, ticket: "57", reason: "card row" },
  { rule: "card-in-card", width: 1440, detail: "span.a sits inside card article.b", platform: "darwin", states: { base: 2 }, ticket: "57", reason: "card row" },
  { rule: "card-in-card", width: 1440, detail: "span.a sits inside card article.b", platform: "linux", states: { base: 2, gone: 1 }, ticket: "57", reason: "card row" },
  { rule: "prose-cell", width: 390, detail: PROSE, platform: "linux", states: { base: 1, flaky: 1, other: 1, lone: 1 }, optional: ["flaky"], worst: { 0: 22 }, ticket: "57", reason: "prose row" },
];
const LIKE = new Map([["variant", "base"]]);
const views = (a, b) => [debtChanges(a, b), debtChanges(b, a)];

test("343: mergeStates over every state of one platform's findings counts what rebuildDebt counts", () => {
  const findings = [card("base"), card("variant"), card("variant"), card("shared"), card("other"), card("base", "linux", 1440), card("variant", "linux", 1440), card("fresh", "linux", 1440), prose("base", 22), prose("other", 25), prose("lone", 24)];
  const every = [...new Set([...DEBT.flatMap((e) => Object.keys(e.states)), ...findings.map((f) => f.state), "variant"])];
  const merged = mergeStates(DEBT, findings, { states: every, platform: "linux", like: LIKE });
  assert.deepEqual(views(merged, rebuildDebt(DEBT, findings, { like: LIKE })), [[], []]);
  assert.deepEqual(views(merged, DEBT).map((rows) => rows.filter((r) => r.platform === "darwin")), [[], []], "darwin counts stay as they were");
});

test("343: a shared row splits only when the named state's count differs, a new row goes in at its sort place, and worst rises only from those findings", () => {
  const same = mergeStates(DEBT, [card("shared")], { states: ["shared"], platform: "linux" });
  assert.deepEqual(same, DEBT, "the same count leaves the shared row whole");
  const split = mergeStates(DEBT, [card("shared"), card("shared")], { states: ["shared"], platform: "linux" });
  assert.deepEqual(split.slice(0, 2), [
    { rule: "card-in-card", width: 390, detail: "span.a sits inside card article.b", platform: "darwin", states: { base: 1, shared: 1, other: 3 }, ticket: "57", reason: "card row" },
    { rule: "card-in-card", width: 390, detail: "span.a sits inside card article.b", platform: "linux", states: { base: 1, shared: 2, other: 3 }, ticket: "57", reason: "card row" },
  ]);
  assert.deepEqual(split.slice(2), DEBT.slice(1));
  const added = mergeStates(DEBT, [{ platform: "linux", state: "profile-new", rule: "card-in-card", width: 1280, detail: "div.c sits inside card article.d" }], { states: ["profile-new"], platform: "linux" });
  assert.equal(added.length, DEBT.length + 1);
  assert.deepEqual(added[0], { rule: "card-in-card", width: 1440, detail: "div.c sits inside card article.d", platform: "linux", states: { "profile-new": 1 }, ticket: "57", reason: "OpenUI answer blocks: card-in-card at 1440px, div.c sits inside card article.d" });
  assert.deepEqual(added.slice(1), DEBT);
  assert.deepEqual(mergeStates(DEBT, [prose("lone", 18)], { states: ["lone"], platform: "linux" }), [...DEBT.slice(0, 3), { ...DEBT[3], worst: { 0: 18 } }]);
  assert.deepEqual(mergeStates(DEBT, [prose("lone", 30)], { states: ["lone"], platform: "linux" }), DEBT, "a finding inside worst leaves it");
  assert.deepEqual(mergeStates(DEBT, [], { states: ["flaky", "gone"], platform: "linux" }).slice(2), [{ ...DEBT[2], states: { base: 2 } }, DEBT[3]], "a judged state that did not show drops, an optional one keeps its count");
  assert.throws(() => mergeStates(DEBT, [], { states: ["base"], platform: "win32" }), /unknown platform win32/);
});

const SCRIPT = fileURLToPath(new URL("../../../scripts/design-policy/judge-debt.mjs", import.meta.url));

test("343: judge-debt.mjs --states-only writes only the named states' rows, on the findings' platform unless --platform names one", () => {
  const dir = mkdtempSync(join(tmpdir(), "judge-debt-states-"));
  const debt = join(dir, "known-debt.json"), states = join(dir, "oak-states.json"), linux = join(dir, "linux.json"), mixed = join(dir, "mixed.json");
  writeFileSync(debt, JSON.stringify(DEBT, null, 2) + "\n");
  writeFileSync(states, JSON.stringify([{ id: "base" }, { id: "variant", judgeLike: "base" }]));
  writeFileSync(linux, JSON.stringify([card("shared"), card("shared"), card("variant"), card("variant")]));
  writeFileSync(mixed, JSON.stringify([card("shared"), card("shared", "darwin")]));
  const run = (...args) => spawnSync(process.execPath, [SCRIPT, "--debt", debt, "--states", states, ...args], { encoding: "utf8" });
  const wrote = run("--states-only", "shared,variant", linux);
  assert.equal(wrote.status, 0, wrote.stderr);
  assert.deepEqual(JSON.parse(readFileSync(debt, "utf8")), mergeStates(DEBT, JSON.parse(readFileSync(linux, "utf8")), { states: ["shared", "variant"], platform: "linux", like: LIKE }));
  assert.match(wrote.stdout, /rose linux card-in-card at 390px: span\.a sits inside card article\.b: 2 states \(shared 1->2, variant 0->2\)/);
  writeFileSync(debt, JSON.stringify(DEBT, null, 2) + "\n");
  const refused = run("--states-only", "shared", mixed);
  assert.equal(refused.status, 2);
  assert.match(refused.stderr, /findings come from darwin and linux: name one with --platform/);
  assert.equal(readFileSync(debt, "utf8"), JSON.stringify(DEBT, null, 2) + "\n");
  assert.equal(run("--states-only", "shared", "--platform", "darwin", mixed).status, 0);
  assert.deepEqual(JSON.parse(readFileSync(debt, "utf8")), DEBT, "the darwin count of shared is unchanged");
  const mac = join(dir, "mac.json");
  writeFileSync(mac, JSON.stringify([card("base", "darwin")]));
  const elsewhere = run("--states-only", "base", "--platform", "linux", mac);
  assert.equal(elsewhere.status, 2, "Mac findings never write Linux rows");
  assert.match(elsewhere.stderr, /findings come from darwin, not linux/);
  const unknown = run("--states-only", "base", "--platform", "win32", mac);
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /--platform is darwin or linux/);
  assert.deepEqual(JSON.parse(readFileSync(debt, "utf8")), DEBT);
});
