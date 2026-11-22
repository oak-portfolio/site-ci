#!/usr/bin/env node
// Ticket 20 (Q35 A, decision O24): one quality report per wave. It reads the pairwise eval's JSON report, the design judge
// and the capture judge's findings, hands them to the core, and writes wave-<name>.json and wave-<name>.md into --out.
// Exit 0 means the wave passed every threshold. Rows from an OAK_EVAL_PREFERENCE_ONLY=1 run get a preference-only report
// (line 1 says so) and exit 1: that run is never a wave.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { qualityBar, qualityBarMarkdown, sameWords, trustTurns } from "./quality-bar-core.mjs";

const WIDTHS = [390, 1280];
const repo = (path) => new URL(`../../${path}`, import.meta.url);
const readJson = (file, missing) => (existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : missing);

const { values: flags } = parseArgs({ options: { wave: { type: "string" }, pairwise: { type: "string" }, out: { type: "string" }, gallery: { type: "string" },
  head: { type: "string", default: "HEAD" }, "record-cards-at-plan": { type: "string" } } });
const forced = flags["record-cards-at-plan"];
if (!flags.wave || !flags.pairwise || !flags.out || (forced !== undefined && !["on", "off"].includes(forced))) {
  console.error(`usage: quality-bar.mjs --wave <name> --pairwise <vitest json from evals/pairwise.eval.ts> --out <report folder> [--gallery <dev server url>]
                      [--head <commit the eval ran at>] [--record-cards-at-plan on|off]
  --gallery  run the design judge at ${WIDTHS.join(" and ")} on the arranged-answer gallery states and take the stills the
             capture judge reads, into <out>/capture/. Without it the last recorded reading in <out>/capture/ is used.
  --head     the commit whose shipped oakRecordCardsAtPlan decides whether plan-time record cards count as first block (default HEAD).
  --record-cards-at-plan  the run forced the flag; overrides --head.
  <out>/capture/findings.json   the capture judge's reading, [{ state, width, severity: "major" | "minor", finding }]
  <out>/hand-checks.json        Oak's picks, { "<pair id>": "arranged" | "plain" | "tie" }`);
  process.exit(2);
}

// Record cards paint at plan time only with the site flag on; the Worker cannot see it, so the bar reads it here.
function shippedRecordCards(head) {
  const git = (...args) => execFileSync("git", args, { cwd: fileURLToPath(repo("")), encoding: "utf8" }).trim();
  const at = git("rev-parse", "--short", head);
  const source = git("show", `${at}:src/lib/oakFlags/recordCardsAtPlan.ts`);
  const value = source.match(/^export const oakRecordCardsAtPlan = (true|false);/m)?.[1];
  if (!value) throw new Error(`oakRecordCardsAtPlan is not a plain true or false at ${at}`);
  return { on: value === "true", at };
}
const recordCards = forced ? { on: forced === "on", at: `${flags.head}, forced by the run` } : shippedRecordCards(flags.head);
const capture = join(flags.out, "capture");
mkdirSync(capture, { recursive: true });

// The gallery states that draw an arranged answer, judged and photographed in one browser pass.
async function readDesign(url) {
  const { chromium } = await import("playwright");
  const { judgeStates } = await import("../design-policy/design-judge.mjs");
  const debt = JSON.parse(readFileSync(repo("tests/agent/premium/design-judge-fixtures/known-debt.json"), "utf8"));
  const all = JSON.parse(readFileSync(repo("src/data/dev/oak-states.json"), "utf8"));
  const states = (Array.isArray(all) ? all : all.states).filter((state) => /^(answer-openui-|openui-)/.test(state.id));
  const browser = await chromium.launch();
  let unlisted;
  try {
    ({ unlisted } = await judgeStates(browser, url, states, { widths: WIDTHS, debt, after: async (page, { id }) => {
      for (const width of WIDTHS) {
        // shortcut: the still is the 1280 page resized, not a fresh load at 390; load fresh when a state builds differently by width.
        await page.setViewportSize({ width, height: 900 });
        await page.waitForTimeout(300);
        await page.screenshot({ path: join(capture, `${id}-${width}.jpg`), type: "jpeg", quality: 80 });
      }
    } }));
  } finally { await browser.close(); }
  const rows = unlisted.map(({ state, width, detail }) => ({ source: "design-judge", state, width, major: true, detail }));
  writeFileSync(join(capture, "design-judge.json"), JSON.stringify({ states: states.map((state) => state.id), widths: WIDTHS, findings: rows }, null, 2));
}
if (flags.gallery) await readDesign(flags.gallery.replace(/\/$/, ""));

const rows = JSON.parse(readFileSync(flags.pairwise, "utf8")).testResults.flatMap((file) => file.assertionResults).map((test) => test.meta?.pairwise).filter(Boolean);
const judged = readJson(join(capture, "design-judge.json"), null), captured = readJson(join(capture, "findings.json"), null);
// The capture judge is a model reading the stills (STANDING.md:148). A wave with no such reading fails its design capsule.
const design = judged && [...judged.findings, ...(captured
  ? captured.map((row) => ({ source: "capture-judge", state: row.state, width: row.width, major: row.severity === "major", detail: row.finding }))
  : WIDTHS.map((width) => ({ source: "capture-judge", state: "every state", width, major: true, detail: "no capture reading: capture/findings.json is missing" })))];
const turns = trustTurns(rows);
const report = qualityBar({ wave: flags.wave, preferenceOnly: rows.some((row) => row.preferenceOnly), pairs: rows.map(({ id, handCheck, orders, same, views }) => ({ id, handCheck, orders, same, views })), recordCardsAtPlan: recordCards.on, recordCardsHead: recordCards.at,
  handChecks: readJson(join(flags.out, "hand-checks.json"), {}), turns, traces: rows.flatMap((row) => [row.trace, ...(row.moreTraces ?? [])]).filter(Boolean), design,
  records: new Set(JSON.parse(readFileSync(repo("src/data/generated/knowledgeSnapshot.json"), "utf8")).documents.map((document) => document.id)) });

const flagged = rows.filter((row) => row.handCheck && row.views && !sameWords(row));
const notes = [
  `Mode: ${rows.some((row) => row.preferenceOnly) ? "preference only (OAK_EVAL_PREFERENCE_ONLY=1): each question was asked once with no latency repeats, so this is not a full bar wave" : "full bar run"}.`,
  `Labeled lane: ${turns.some((turn) => turn.drawn?.length) ? "checked" : "not applicable on main, no labeled-lane block exists yet"}.`,
  "Lead check: word overlap, so a lead that rewords a block passes it.",
  `Latency: read from the eval's local Worker with plan-first on; production keeps OAK_PLAN_FIRST off. A plan is sent only for a question with a request kind: ${rows.filter((row) => row.trace?.plan).length} of ${rows.length} questions, each asked ${1 + Math.max(0, ...rows.map((row) => row.moreTraces?.length ?? 0))} times.`,
  `Design: ${judged ? `${judged.states.length} gallery states at ${WIDTHS.join(" and ")}; a 1280 finding counts as known debt when known-debt.json lists it at 1440` : "the design judge did not run"}; capture judge ${captured ? `read, ${captured.length} findings` : "not read"}.`,
  `Answers with no arranged layout (not judged): ${rows.filter((row) => !row.views).map((row) => `${row.id} (${row.uiStatus === "done" ? "the browser would not draw it" : row.uiStatus ?? (row.error ? "the turn failed" : "no layout")})`).join(", ") || "none"}.`,
  `Spend: $${(Math.max(0, ...rows.map((row) => row.spentMicroUsd ?? 0)) / 1e6).toFixed(2)} across ${rows.length + rows.reduce((sum, row) => sum + (row.moreTraces?.length ?? 0), 0)} turns and the judge calls.`,
].filter((note) => !report.preferenceOnly || /^(Mode|Answers|Spend)/.test(note));
Object.assign(report, { notes, runs: rows.map(({ id, traceId, judgeIds, judgeErrors, uiStatus, microUsd }) => ({ id, traceId, judgeIds, judgeErrors, uiStatus, microUsd })) });
const markdown = [qualityBarMarkdown(report), ...notes.map((note) => `- ${note}`), "",
  ...(flagged.length ? ["## Hand check", "", "Put your pick for each pair in `hand-checks.json` as `arranged`, `plain` or `tie`.", "",
    ...flagged.flatMap((row) => [`### ${row.id}: ${row.question}`, "", "Arranged:", "", "```", row.views.arranged, "```", "", "Plain:", "", "```", row.views.plain, "```", ""])] : [])].join("\n");

writeFileSync(join(flags.out, `wave-${flags.wave}.json`), JSON.stringify(report, null, 2));
writeFileSync(join(flags.out, `wave-${flags.wave}.md`), markdown);
console.log(markdown.split("\n").slice(0, 5).join("\n"));
process.exit(report.pass ? 0 : 1);
