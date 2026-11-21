// Run: node --test tests/quality/frontier.test.mjs (part of npm run test:quality, so npm run validate).
// Covers the streamline-pass trigger (Improve line), the pass becoming NEXT at a boundary, the stall
// fallback and the stale STATUS warning.
// Blame-based build detection needs committed PLAN lines, so it is checked live with `npm run -s premium -- --brief`.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const frontier = path.join(repo, "docs/planning/oak-ai-agent-2026-10-03/design-rework/frontier.mjs");
const gates = ["A01", "A02", "A03"].map((id) => `## ${id}: done\n- [x] ${id}-G1: shipped\n`).join("\n")
  + "\n## A04: open\n- [ ] A04-G1: still open\n  CHECK: true\n  EXPECT: never\n";

function run(files, ...args) {
  const dir = mkdtempSync(path.join(tmpdir(), "frontier-"));
  for (const [name, body] of Object.entries({ "GATES.md": gates, ...files })) writeFileSync(path.join(dir, name), body);
  return spawnSync(process.execPath, [frontier, "--dir", dir, ...args], { encoding: "utf8" }).stdout;
}

// A scratch repo whose main branch doubles as origin/main, so merges and boundaries are real git state.
function scratchRepo() {
  const dir = mkdtempSync(path.join(tmpdir(), "frontier-git-"));
  const git = (...a) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", ...a], { cwd: dir, encoding: "utf8" });
  const write = (name, body) => {
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    writeFileSync(path.join(dir, name), body);
  };
  const out = () => spawnSync(process.execPath, [frontier, "--dir", dir], { encoding: "utf8" }).stdout;
  const line = (name) => out().match(new RegExp(`^${name}: .*$`, "m"))?.[0];
  const mergePr = (n, file = `src/pr${n}.txt`) => {
    git("checkout", "-q", "-b", `pr${n}`);
    write(file, "x\n");
    git("add", ".");
    git("commit", "-q", "-m", `pr ${n}`);
    git("checkout", "-q", "main");
    git("merge", "-q", "--no-ff", `pr${n}`, "-m", `Merge pr ${n}`);
    git("update-ref", "refs/remotes/origin/main", "HEAD");
  };
  git("init", "-q", "-b", "main");
  write("GATES.md", gates);
  write("RETRO.md", "## A01-A03\n");
  write("PLAN.md", "- 2026-10-19 ARCH@3 abc: x\n");
  write("src/app.js", "x\n");
  git("add", ".");
  git("commit", "-q", "-m", "base");
  git("update-ref", "refs/remotes/origin/main", "HEAD");
  return { git, write, line, mergePr };
}

test("RETRO due names DONE tickets no heading covers; ranges and lists count", () => {
  const out = run({ "RETRO.md": "# Retro\n\n## A01-A02 (2026-10-19)\n1. x\n", "PLAN.md": "" });
  assert.match(out, /^Improve: RETRO due A03; ARCH due \(3 DONE, last ARCH@0\)$/m);
  const listed = run({ "RETRO.md": "## A01, A03 (2026-10-19)\n## A02 round 2\n", "PLAN.md": "- 2026-10-19 ARCH@3 skip: none\n" });
  assert.match(listed, /^Improve: none due$/m);
});

test("ARCH comes due three DONE tickets after the last pass, and once more when only HUMAN boxes are left", () => {
  const retro = { "RETRO.md": "## A01-A03\n" };
  assert.match(run({ ...retro, "PLAN.md": "- 2026-10-19 ARCH@1 abc: x\n" }), /^Improve: none due$/m);
  const human = gates.replace("  CHECK: true\n  EXPECT: never\n", "  HUMAN: Oak signs off\n");
  assert.match(run({ ...retro, "GATES.md": human, "PLAN.md": "- 2026-10-19 ARCH@2 abc: x\n" }), /^Improve: ARCH due \(3 DONE, last ARCH@2\)$/m);
  assert.match(run({ ...retro, "GATES.md": human, "PLAN.md": "- 2026-10-19 ARCH@3 abc: x\n" }), /^Improve: none due$/m);
});

// R28 (intentional update): once every ticket is DONE the line still prints, because the goal's done condition reads
// `Improve: none due` at exactly that point, and silence could not tell "none due" from "not checked". At 135/135 the
// first run found a real gap: no RETRO heading named Q16.
test("no Improve line without RETRO.md; once every ticket is DONE it still names any ticket no heading covers", () => {
  assert.doesNotMatch(run({ "PLAN.md": "" }), /^Improve:/m);
  assert.match(run({ "GATES.md": gates.split("\n## A04")[0], "RETRO.md": "## A01\n" }), /^Improve: RETRO due A02 A03/m);
  assert.match(run({ "GATES.md": gates.split("\n## A04")[0], "RETRO.md": "## A01-A03\n", "PLAN.md": "- 2026-10-21 ARCH@3 skip: none\n" }), /^Improve: none due$/m);
});

test("PRs merged to origin/main after RETRO.md or the last ARCH@ line landed owe a pass", () => {
  const { git, write, line, mergePr } = scratchRepo();
  const improve = () => line("Improve");
  mergePr(1);
  assert.equal(improve(), "Improve: RETRO due 1 merged PR since RETRO.md last landed on main");
  write("RETRO.md", "## A01-A03\n## A04 round 1\n");
  assert.equal(improve(), "Improve: none due", "an uncommitted new heading is the retro just written");
  git("commit", "-q", "-a", "-m", "retro");
  mergePr(2);
  mergePr(3);
  assert.equal(improve(), "Improve: RETRO due 2 merged PRs since RETRO.md last landed on main; ARCH due (3 merged PRs since the last ARCH@ line)");
  mergePr(4, "docs/status.md");
  assert.equal(improve(), "Improve: RETRO due 2 merged PRs since RETRO.md last landed on main; ARCH due (3 merged PRs since the last ARCH@ line)", "a docs-only merge owes no pass");
});

test("a due pass becomes NEXT right after a merge, and waits while a PR is in progress", () => {
  const { git, write, line, mergePr } = scratchRepo();
  assert.equal(line("NEXT"), "NEXT: A04-G1 still open", "nothing owed, so the box stays NEXT");
  mergePr(1);
  assert.equal(line("NEXT"), "NEXT: Streamline pass (STANDING group 1), until Improve reads none due");
  assert.equal(line("Then"), "Then: A04-G1 still open");
  write("tests/stray.test.mjs", "x\n");
  assert.equal(line("Then"), "Then: A04-G1 still open", "an untracked stray file leaves the boundary in place");
  write("src/app.js", "edited\n");
  assert.equal(line("NEXT"), "NEXT: A04-G1 still open", "a tracked code edit is a PR in progress");
  git("checkout", "-q", "-b", "next-round");
  git("add", ".");
  git("commit", "-q", "-m", "next round starts");
  assert.equal(line("NEXT"), "NEXT: A04-G1 still open", "a commit ahead of origin/main is a PR in progress");
  write("GATES.md", gates.replace("  CHECK: true\n  EXPECT: never\n", "  HUMAN: Oak signs off\n"));
  assert.equal(line("NEXT"), "NEXT: Streamline pass (STANDING group 1), until Improve reads none due", "only HUMAN boxes left is a boundary");
  assert.equal(line("Then"), "Then: none");
});

test("a CHECK whose shell reports an error fails even when EXPECT matches", () => {
  const box = (check) => gates.replace("  CHECK: true\n  EXPECT: never\n", `  CHECK: ${check}\n  EXPECT: ok\n`);
  assert.match(run({ "GATES.md": box("no_such_command_zz; echo ok"), "PLAN.md": "" }, "--try", "A04-G1"), /^FAIL A04-G1/m);
  assert.match(run({ "GATES.md": box("echo ok"), "PLAN.md": "" }, "--try", "A04-G1"), /^PASS A04-G1/m);
});

test("stall counts trailing +0 lines when git blame cannot read PLAN.md", () => {
  const out = run({ "PLAN.md": "- 2026-10-19 +1 A01-G1\n- 2026-10-19 +0 waiting\n- 2026-10-19 +0 waiting\n" });
  assert.match(out, /^Stall: 2 trailing \+0 lines/m);
});

test("a round's Aim, Fan-out, Review and Aim result print every turn once any round carries an Aim", () => {
  const line = (out, name) => out.match(new RegExp(`^${name}: .*$`, "m"))?.[0];
  const legacy = "- 2026-10-20 +0 R2 opened for review v1\n- 2026-10-20 +0 R2 live (#1, abc)\n";
  assert.doesNotMatch(run({ "PLAN.md": legacy }), /^(Aim|Fan-out|Review|Aim result):/m, "rounds before the convention print nothing");
  const aimed = `${legacy}- 2026-10-21 +0 R3 opened for review v2\n- 2026-10-21 +0 R3 Aim: 0 repeat flags; judged by Oak's v3 review; stretch 0 flags\n`;
  assert.equal(
    line(run({ "PLAN.md": aimed }), "Aim"),
    "Aim: R3 0 repeat flags; judged by Oak's v3 review; stretch 0 flags (lacks guard, via, stretch box; be-ambitious v2, STANDING group 1, Rounds)",
    "a v1-shape Aim prints what it lacks as a note, not missing",
  );
  const v2 = `${legacy}- 2026-10-22 +0 R3 opened for review v2\n- 2026-10-22 +0 R3 Aim: 0 repeat flags; guard health bars hold; via a probe on every state; judged by the probe test; stretch 0 flags in 3 tries\n`;
  assert.equal(line(run({ "PLAN.md": v2 }), "Aim"), "Aim: R3 0 repeat flags; guard health bars hold; via a probe on every state; judged by the probe test; stretch 0 flags in 3 tries");
  // R24: a box of one ("in 1 try") is a box too; R23 and R24 printed it as missing.
  const single = v2.replace("in 3 tries", "in 1 try");
  assert.equal(line(run({ "PLAN.md": single }), "Aim"), "Aim: R3 0 repeat flags; guard health bars hold; via a probe on every state; judged by the probe test; stretch 0 flags in 1 try");
  assert.match(line(run({ "PLAN.md": `${aimed}- 2026-10-22 +0 R4 opened for review v3\n` }), "Aim"), /^Aim: R4 missing: add `- <date> \+0 R4 Aim: <bar>; guard <what must not get worse>; via /);
  assert.match(line(run({ "PLAN.md": aimed }), "Fan-out"), /^Fan-out: R3 missing: add `- <date> \+0 R3 Fan-out: /);
  const fanned = `${aimed}- 2026-10-21 +0 R3 Fan-out: 3 explorers (abs sonnet) at open; 2 reviewers (abs opus) at review\n`;
  assert.equal(line(run({ "PLAN.md": fanned }), "Fan-out"), "Fan-out: R3 3 explorers (abs sonnet) at open; 2 reviewers (abs opus) at review");
  assert.equal(line(run({ "PLAN.md": aimed }), "Review"), "Review: R3 due before the merge");
  const merged = `${aimed}- 2026-10-21 +0 R3 live (#2, def); health met\n`;
  assert.match(line(run({ "PLAN.md": merged }), "Fan-out"), /^Fan-out: R3 missing: the round went live with no Fan-out line/);
  const late = `${merged}- 2026-10-21 +0 R3 Fan-out: none, one lane\n`;
  assert.match(line(run({ "PLAN.md": late }), "Fan-out"), /^Fan-out: R3 missing: written after the round went live without measured numbers/);
  const measuredLate = `${merged}- 2026-10-21 +0 R3 Fan-out: recorded after the merge, turns=9 parallel-batches=2 cross-account=0\n`;
  assert.match(line(run({ "PLAN.md": measuredLate }), "Fan-out"), /^Fan-out: R3 recorded after the merge, turns=9 parallel-batches=2/);
  assert.equal(line(run({ "PLAN.md": merged }), "Review"), "Review: R3 missing: the round merged with no Review line");
  assert.equal(line(run({ "PLAN.md": merged }), "Aim result"), "Aim result: R3 missing on its live line");
  const done = `${aimed}- 2026-10-21 +0 R3 Review: code-review 0 blocking; interrogate 2 found, 2 fixed\n- 2026-10-21 +0 R3 live (#2, def); Aim result: met, 0 repeat flags; health met\n`;
  assert.equal(line(run({ "PLAN.md": done }), "Review"), "Review: R3 code-review 0 blocking; interrogate 2 found, 2 fixed");
  assert.equal(line(run({ "PLAN.md": done }), "Aim result"), "Aim result: R3 met, 0 repeat flags");
  const next = `${done}- 2026-10-22 +0 R4 opened for review v3\n`;
  assert.match(line(run({ "PLAN.md": next }), "Aim"), /^Aim: R4 missing: add /, "a later round with no Aim line is missing one");
  const lettered = `${done}- 2026-10-21 +0 R3b Review: one-file follow-up\n- 2026-10-21 +0 R3b live (#3, fed); Aim result: met, 0 repeat flags after the follow-up; health met\n`;
  assert.equal(line(run({ "PLAN.md": lettered }), "Aim result"), "Aim result: R3 met, 0 repeat flags after the follow-up", "a lettered sub-round reports under its round");
  assert.equal(line(run({ "PLAN.md": lettered }), "Review"), "Review: R3 one-file follow-up");
});

test("from R18 a round needs every be-ambitious v2 field, and from R16 a late Fan-out never reads none", () => {
  const line = (out, name) => out.match(new RegExp(`^${name}: .*$`, "m"))?.[0];
  const opened = "- 2026-10-22 +0 R17 Aim: legacy; judged by a test; stretch 0\n- 2026-10-23 +0 R18 opened for review v15\n";
  const thin = `${opened}- 2026-10-23 +0 R18 Aim: 0 flags again; judged by review v16; stretch 0 flags\n`;
  assert.equal(
    line(run({ "PLAN.md": thin }), "Aim"),
    "Aim: R18 0 flags again; judged by review v16; stretch 0 flags; missing guard, via, stretch box (be-ambitious v2, STANDING group 1, Rounds)",
  );
  const full = `${opened}- 2026-10-23 +0 R18 Aim: 0 flags again; guard health bars hold; via the inset probe on every state; judged by the probe test; stretch 0 flags in 3 tries\n`;
  assert.doesNotMatch(line(run({ "PLAN.md": full }), "Aim"), /missing|lacks/);
  assert.equal(
    line(run({ "PLAN.md": `${full}- 2026-10-23 +0 R18 Fan-out: 2 explorers (abs sonnet) at open\n` }), "Fan-out"),
    "Fan-out: R18 2 explorers (abs sonnet) at open; missing Crew, red team (STANDING group 7)",
  );
  const crewed = `${full}- 2026-10-23 +0 R18 Fan-out: 2 explorers (abs sonnet) at open; Crew: product designer, copy editor, red team\n`;
  assert.doesNotMatch(line(run({ "PLAN.md": crewed }), "Fan-out"), /missing/);
  const reviewed = `${crewed}- 2026-10-23 +0 R18 Review: code-review 0 blocking\n`;
  assert.match(line(run({ "PLAN.md": reviewed }), "Review"), /; missing Crew passes \(STANDING group 1, Rounds\)$/);
  const crewReview = `${crewed}- 2026-10-23 +0 R18 Review: code-review 0 blocking; Crew: designer 2, copy editor 1, red team 3\n`;
  assert.doesNotMatch(line(run({ "PLAN.md": crewReview }), "Review"), /missing/);
  // RETRO Q24 rounds 27j to 27o: a Review line with a Crew but no code review pass is missing one.
  const noReviewer = `${crewed}- 2026-10-23 +0 R18 Review: Crew: walker 1 top, red team folded into a probe\n`;
  assert.match(line(run({ "PLAN.md": noReviewer }), "Review"), /; missing code review \(STANDING group 1, Rounds\)$/);
  const liveThin = `${crewReview}- 2026-10-23 +0 R18 live (#9, abc); Aim result: met 0 flags; health met\n`;
  assert.equal(line(run({ "PLAN.md": liveThin }), "Aim result"), "Aim result: R18 met 0 flags; missing guard held|broke, holdout (STANDING group 1, Rounds)");
  const liveFull = `${crewReview}- 2026-10-23 +0 R18 live (#9, abc); Aim result: met 0 flags; guard held, bars 6 of 6; holdout none, no new finding; health met\n`;
  assert.equal(line(run({ "PLAN.md": liveFull }), "Aim result"), "Aim result: R18 met 0 flags; guard held, bars 6 of 6; holdout none, no new finding");
  const lateNone = `${full}- 2026-10-23 +0 R18 live (#9, abc); Aim result: met 0 flags\n- 2026-10-23 +0 R18 Fan-out: none, one lane; parallel-batches=0 cross-account=0\n`;
  assert.match(line(run({ "PLAN.md": lateNone }), "Fan-out"), /^Fan-out: R18 missing: `none` written after the round went live/);
});

test("--brief flags a STATUS scoreboard that disagrees with GATES.md", () => {
  const out = run({ "PLAN.md": "", "STATUS.md": "# Status\n\n- Scoreboard: 1/4 boxes.\n" }, "--brief");
  assert.match(out, /^STATUS stale: its top block says 1\/4, GATES.md says 3\/4\./m);
  assert.doesNotMatch(run({ "PLAN.md": "", "STATUS.md": "- Scoreboard: 3/4 boxes.\n" }, "--brief"), /STATUS stale/);
});

test("--brief names a Skills by step entry that no longer resolves", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "frontier-standing-"));
  const standing = (rows) => {
    const file = path.join(dir, `STANDING-${rows.length}.md`);
    writeFileSync(file, `# Standing\n\n| Step | Skills |\n| --- | --- |\n${rows.join("\n")}\n\nPlugins: \`not-a-row\`\n`);
    return file;
  };
  // oak-key-queue lives in this repo's .agents/skills, so it resolves on every checkout.
  const broken = run({ "PLAN.md": "" }, "--brief", "--standing", standing(["| Keys | `oak-key-queue`, `no-such-skill-zz` |", "| Plugin | `nope-plugin:gone` |"]));
  assert.match(broken, /^Skills missing: no-such-skill-zz, nope-plugin:gone\. /m);
  const fine = run({ "PLAN.md": "" }, "--brief", "--standing", standing(["| Keys | `oak-key-queue` and `skill-path.mjs` |"]));
  assert.doesNotMatch(fine, /Skills missing/, "file names with a dot and text after the table are not skills");
});

// --lint-plan: each fixture mutates one token of a plan FRONTIER reads cleanly, and the lint must name that line.
const lintPlan = (rows) => {
  const dir = mkdtempSync(path.join(tmpdir(), "frontier-lint-"));
  writeFileSync(path.join(dir, "PLAN.md"), `${rows.join("\n")}\n`);
  const run = spawnSync(process.execPath, [frontier, "--dir", dir, "--lint-plan"], { encoding: "utf8" });
  return { status: run.status, out: run.stdout };
};
const day = "- 2026-10-26 +0";
const cleanPlan = () => [
  `${day} R18 opened for review v15`,
  `${day} R18 Aim: 0 flags; guard health bars hold; via a probe on every state; judged by the probe test; stretch 0 flags in 1 try`,
  `${day} R18 Fan-out: 2 explorers (abs sonnet) at open; Crew: designer, copy editor, red team`,
  `${day} R18 Review: code-review 0 blocking; Crew: designer 2, red team 1`,
  `${day} R18 live (#9, abc); Aim result: met 0 flags; guard held, bars 6 of 6; holdout none, no new finding`,
  `${day} ARCH@4 abc: one module owns the charge`,
];

test("--lint-plan passes a plan the parser reads cleanly, and a v1 round that lacks the v2 fields", () => {
  const clean = lintPlan(cleanPlan());
  assert.equal(clean.status, 0, clean.out);
  assert.match(clean.out, /^PLAN lint: ok \(6 lines/m);
  const v1 = lintPlan(["- 2026-10-20 +0 R3 opened", "- 2026-10-20 +0 R3 Aim: 0 flags; judged by Oak's review; stretch 0", "- 2026-10-20 +0 R3 live (#1, a); Aim result: met"]);
  assert.equal(v1.status, 0, v1.out);
});

test("--lint-plan names the line and kind of every shape the parser would misread", () => {
  const at = (rows, n, edit) => rows.map((row, i) => (i === n - 1 ? edit(row) : row));
  const cases = [
    ["a Review that skips the colon", (r) => at(r, 4, (x) => x.replace("Review:", "Review (post-merge):")), /^PLAN L4 Review: expected `R<n> Review:.*got "R18 Review \(post-merge\)/m],
    ["holdout written with a colon", (r) => at(r, 5, (x) => x.replace("holdout none", "holdout: none")), /^PLAN L5 live: expected `holdout <result> \(no colon\)`, got "holdout: none/m],
    ["Aim result without its colon", (r) => at(r, 5, (x) => x.replace("Aim result:", "Aim result -")), /^PLAN L5 live: expected `Aim result: <result>`.*got "Aim result -/m],
    ["a stretch box the parser cannot read", (r) => at(r, 2, (x) => x.replace("in 1 try", "in one go")), /^PLAN L2 Aim: expected `; stretch <bar> in <n> tries\|minutes\|hours.*got "stretch 0 flags in one go/m],
    ["a Fan-out with no Crew on its own line", (r) => at(r, 3, (x) => x.replace("; Crew: designer, copy editor, red team", "")), /^PLAN L3 Fan-out: expected `Crew: <field per verb>` and `a red team/m],
    ["a red team the Crew never names", (r) => at(r, 3, (x) => x.replace(", red team", "")), /^PLAN L3 Fan-out: expected `a red team named in the Crew`/m],
    ["a Review that never names the code review pass", (r) => at(r, 4, (x) => x.replace("code-review 0 blocking", "code review 0 blocking")), /^PLAN L4 Review: expected `code-review, interrogate or reviewer/m],
    ["ARCH with a space before the digits", (r) => at(r, 6, (x) => x.replace("ARCH@4", "ARCH@ 4")), /^PLAN L6 ARCH: expected `ARCH@<n>`.*got "ARCH@ 4"/m],
    ["a log line with no progress count in the tail the stall counter reads", (r) => at(r, 6, (x) => x.replace("+0 ", "")), /^PLAN L6 stall: expected `- <date> \+<n> <text>`/m],
    ["a count written \"+ 0\"", (r) => at(r, 1, (x) => x.replace("+0", "+ 0")), /^PLAN L1 stall: expected `- <date> \+<n> <text>`/m],
    ["a blank line inside the log", (r) => [...r.slice(0, 3), "", ...r.slice(3)], /^PLAN L4 stall: expected no blank line/m],
    ["a live judge line written after the live line", (r) => [...r, `${day} R18 live judge (sonnet): 10 of 11 pass`], /^PLAN L7 live: expected the latest live line to be `R<n> live \(<run>\)`/m],
    ["a Fan-out written after the round went live with no measured numbers", (r) => [...r.slice(0, 5), `${day} R18 Fan-out: recorded after the merge; Crew: x, red team`, r[5]], /^PLAN L6 Fan-out: expected `parallel-batches=<n>`/m],
    ["a round tag mid-line that the parser reads as that round's live line", (r) => [...r, `${day} R19 notes: the fix for R18 live defects`], /^PLAN L7 live: expected the line to begin `R<n> live`/m],
  ];
  for (const [name, mutate, expected] of cases) {
    const result = lintPlan(mutate(cleanPlan()));
    assert.equal(result.status, 1, `${name}: exit 1\n${result.out}`);
    assert.match(result.out, expected, name);
  }
});

// --lint-retro: a throwaway repo where main doubles as origin/main, like scratchRepo above.
function retroRepo() {
  const dir = mkdtempSync(path.join(tmpdir(), "frontier-retro-"));
  const git = (...a) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", ...a], { cwd: dir, encoding: "utf8" });
  const write = (name, body) => {
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    writeFileSync(path.join(dir, name), body);
  };
  const commit = (message) => {
    git("add", ".");
    git("commit", "-q", "-m", message);
  };
  const land = () => git("update-ref", "refs/remotes/origin/main", "HEAD");
  const lint = () => {
    const run = spawnSync(process.execPath, [frontier, "--dir", dir, "--lint-retro"], { encoding: "utf8" });
    return { status: run.status, out: run.stdout };
  };
  git("init", "-q", "-b", "main");
  write("scripts/tool.mjs", "v1\n");
  write("docs/goal-prompts/STANDING.md", "# Standing\n");
  write("RETRO.md", "## Q1\n");
  commit("base");
  land();
  return { git, write, commit, land, lint, dir };
}
const lesson = (owner, text = "the thing broke twice") => `1. Top, applied (owner ${owner}): ${text}\n`;

test("--lint-retro passes when the owner path changed in the commit that added the lesson, and names the commit when it did not", () => {
  const { git, write, commit, land, lint } = retroRepo();
  write("RETRO.md", `## Q1\n${lesson("scripts/tool.mjs", "first fix")}`);
  write("scripts/tool.mjs", "v2\n");
  commit("lesson with its fix");
  land();
  const ok = lint();
  assert.equal(ok.status, 0, ok.out);
  assert.match(ok.out, /^RETRO lint: ok \(1 applied lessons with an owner path\)$/m);
  write("RETRO.md", `## Q1\n${lesson("scripts/tool.mjs", "first fix")}${lesson("scripts/tool.mjs", "second fix").replace("1.", "2.")}`);
  commit("lesson only");
  land();
  const sha = git("rev-parse", "--short", "HEAD").stdout.trim();
  const miss = lint();
  assert.equal(miss.status, 1, miss.out);
  assert.match(miss.out, new RegExp(`^RETRO L3: applied to scripts/tool.mjs but scripts/tool.mjs unchanged in ${sha}$`, "m"));
  assert.doesNotMatch(miss.out, /RETRO L2/, "the first lesson still passes");
});

test("--lint-retro counts the whole merged PR, not only the commit that added the lesson", () => {
  const { git, write, commit, land, lint } = retroRepo();
  git("checkout", "-q", "-b", "pr");
  write("scripts/tool.mjs", "fixed\n");
  commit("the fix");
  write("RETRO.md", `## Q1\n${lesson("scripts/tool.mjs")}`);
  commit("the lesson, one commit later");
  git("checkout", "-q", "main");
  git("merge", "-q", "--no-ff", "pr", "-m", "Merge pr");
  land();
  const merged = lint();
  assert.equal(merged.status, 0, merged.out);
  // The same lesson in a PR that never touched the owner is a miss, even though an earlier PR did.
  git("checkout", "-q", "-b", "pr2");
  write("RETRO.md", `## Q1\n${lesson("scripts/tool.mjs")}${lesson("scripts/tool.mjs", "another").replace("1.", "2.")}`);
  commit("records only");
  git("checkout", "-q", "main");
  git("merge", "-q", "--no-ff", "pr2", "-m", "Merge pr2");
  land();
  assert.match(lint().out, /^RETRO L3: applied to scripts\/tool.mjs but scripts\/tool.mjs unchanged in /m);
});

test("--lint-retro resolves STANDING group N to STANDING.md, and reads unmerged and uncommitted lessons", () => {
  const { git, write, commit, land, lint } = retroRepo();
  const group = (n, group) => `${n}. Owner STANDING group ${group}, applied: the dev server dies with a turn.\n`;
  write("RETRO.md", `## Q1\n${group(1, 11)}`);
  commit("lesson without its group");
  land();
  assert.match(lint().out, /^RETRO L2: applied to STANDING group 11 but STANDING.md unchanged in /m);
  git("checkout", "-q", "-b", "next");
  write("docs/goal-prompts/STANDING.md", "# Standing\n- port check\n");
  commit("group 6 rule");
  write("RETRO.md", `## Q1\n${group(1, 11)}${group(2, 6)}`);
  commit("second lesson, same unmerged branch");
  const branch = lint();
  assert.match(branch.out, /RETRO L2:/, "the lesson already on main still misses");
  assert.doesNotMatch(branch.out, /RETRO L3/, "the unmerged branch is the PR in progress, and it changed STANDING.md");
  write("RETRO.md", `## Q1\n${group(1, 11)}${group(2, 6)}${lesson("scripts/tool.mjs").replace("1.", "3.")}`);
  assert.match(lint().out, /RETRO L4: applied to scripts\/tool.mjs but scripts\/tool.mjs unchanged in the working tree/);
  write("scripts/tool.mjs", "edited\n");
  assert.doesNotMatch(lint().out, /RETRO L4/, "an uncommitted owner edit counts for an uncommitted lesson");
});

test("--lint-retro skips lessons that are not applied or name no owner path", () => {
  const { write, commit, land, lint } = retroRepo();
  write("RETRO.md", [
    "## Q1",
    "1. Top, owner scripts/tool.mjs (candidate, not applied): a proposal.",
    "2. Owner scripts/tool.mjs: names a path but says nothing about applying it.",
    "3. Owner the review step, applied: a prose owner has no path to check.",
    "4. Top, applied (Q19): no owner at all.",
    "",
  ].join("\n"));
  commit("lessons");
  land();
  const result = lint();
  assert.equal(result.status, 0, result.out);
  assert.match(result.out, /^RETRO lint: ok \(0 applied lessons with an owner path\)$/m);
});

test("--lint-retro skips a lesson whose only owner is a gitignored path, and still checks a tracked one", () => {
  const { write, commit, land, lint } = retroRepo();
  write(".gitignore", ".local-setup/\n");
  commit("ignore");
  land();
  write("RETRO.md", [
    "## Q1",
    lesson(".local-setup/rounds/R1/common.md", "a local brief changed outside git").trimEnd(),
    lesson("scripts/tool.mjs", "never changed").replace(/^1\./, "2.").trimEnd(),
    "",
  ].join("\n"));
  commit("lessons");
  land();
  const result = lint();
  assert.equal(result.status, 1, result.out);
  assert.doesNotMatch(result.out, /\.local-setup/);
  assert.match(result.out, /^RETRO lint: 1 of 1 applied lessons with an owner path missed it$/m);
});

test("--lint-retro still checks a force-added file under an ignored pattern, and a lesson mixing ignored and tracked owners", () => {
  const { git, write, commit, land, lint } = retroRepo();
  write(".gitignore", ".local-setup/\n");
  write(".local-setup/tracked.md", "v1\n");
  git("add", "-f", ".local-setup/tracked.md");
  commit("force-add");
  land();
  write("RETRO.md", [
    "## Q1",
    lesson(".local-setup/tracked.md", "a tracked file under an ignored folder").trimEnd(),
    lesson(".local-setup/rounds/R1/common.md and scripts/tool.mjs", "mixed owners").replace(/^1\./, "2.").trimEnd(),
    "",
  ].join("\n"));
  commit("lessons");
  land();
  const result = lint();
  assert.equal(result.status, 1, result.out);
  // The tracked owner is checked (counted) and passes, since it changed after the previous RETRO commit; the mixed lesson misses.
  assert.doesNotMatch(result.out, /^RETRO L2:/m);
  assert.match(result.out, /^RETRO L3: applied to \.local-setup\/rounds\/R1\/common\.md and scripts\/tool\.mjs/m);
  assert.match(result.out, /^RETRO lint: 1 of 2 applied lessons with an owner path missed it$/m);
});

test("--lint-retro accepts an owner change made between the previous RETRO commit and the one that added the lesson", () => {
  const { git, write, commit, land, lint } = retroRepo();
  // The fix lands in its own commit, then a records commit touches only RETRO.md.
  write("scripts/tool.mjs", "fixed\n");
  commit("the fix");
  write("RETRO.md", `## Q1\n${lesson("scripts/tool.mjs")}`);
  commit("records");
  land();
  const after = lint();
  assert.equal(after.status, 0, after.out);
  // Records commit, then a lesson commit with no owner change in between: the older fix does not count.
  write("RETRO.md", `## Q1\n${lesson("scripts/tool.mjs")}\n## Q2\n`);
  commit("unrelated records");
  write("RETRO.md", `## Q1\n${lesson("scripts/tool.mjs")}\n## Q2\n${lesson("scripts/tool.mjs", "late").replace("1.", "2.")}`);
  commit("lesson with no fix since the last records commit");
  land();
  const sha = git("rev-parse", "--short", "HEAD").stdout.trim();
  const miss = lint();
  assert.equal(miss.status, 1, miss.out);
  assert.match(miss.out, new RegExp(`^RETRO L5: applied to scripts/tool.mjs but scripts/tool.mjs unchanged in ${sha}$`, "m"));
  assert.doesNotMatch(miss.out, /RETRO L2/, "the first lesson keeps passing");
});

// --lint-plan scope: default is the lines added since origin/main plus the current round; --all sweeps the file.
test("--lint-plan lints the current round and lines added since origin/main by default, and --all sweeps everything", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "frontier-scope-"));
  const git = (...a) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", ...a], { cwd: dir, encoding: "utf8" });
  const lint = (...flags) => {
    const run = spawnSync(process.execPath, [frontier, "--dir", dir, "--lint-plan", ...flags], { encoding: "utf8" });
    return { status: run.status, out: run.stdout };
  };
  const old = [`${day} R17 opened`, `${day} R17 Review (post-merge): a Review the parser skips`, `${day} R17 live (#1, a); Aim result: met`];
  git("init", "-q", "-b", "main");
  writeFileSync(path.join(dir, "PLAN.md"), `${[...old, ...cleanPlan()].join("\n")}\n`);
  git("add", ".");
  git("commit", "-q", "-m", "plan");
  git("update-ref", "refs/remotes/origin/main", "HEAD");
  const quiet = lint();
  assert.equal(quiet.status, 0, quiet.out);
  assert.match(quiet.out, /^PLAN lint: ok/m);
  const all = lint("--all");
  assert.equal(all.status, 1, all.out);
  assert.match(all.out, /^PLAN L2 Review:/m);
  // A new bad line above the current round is added since origin/main, so the default run reports it.
  writeFileSync(path.join(dir, "PLAN.md"), `${[old[0], `${day} R17 Review (late): added today`, ...old.slice(1), ...cleanPlan()].join("\n")}\n`);
  const added = lint();
  assert.equal(added.status, 1, added.out);
  assert.match(added.out, /^PLAN L2 Review:/m);
  assert.doesNotMatch(added.out, /^PLAN L3 /m, "the old unchanged Review line stays out of the default scope");
});

// Review wave 2: a last line that mentions "opened" mid-line emptied the default scope, so the current round went unchecked.
test("--lint-plan keeps the current round in scope when a later line mentions opened mid-line", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "frontier-midline-"));
  const git = (...a) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", ...a], { cwd: dir, encoding: "utf8" });
  const rows = cleanPlan().map((row, i) => (i === 3 ? row.replace("Review:", "Review (post-merge):") : row));
  git("init", "-q", "-b", "main");
  writeFileSync(path.join(dir, "PLAN.md"), `${[...rows, `${day} Final reading: every bar met since R18 opened`].join("\n")}\n`);
  git("add", ".");
  git("commit", "-q", "-m", "plan");
  git("update-ref", "refs/remotes/origin/main", "HEAD");
  const run = spawnSync(process.execPath, [frontier, "--dir", dir, "--lint-plan"], { encoding: "utf8" });
  assert.equal(run.status, 1, run.stdout);
  assert.match(run.stdout, /^PLAN L4 Review:/m);
});
