#!/usr/bin/env node
// Compares the design judge's findings with known-debt.json (compareDebt) and rebuilds that file from findings
// (rebuildDebt), per platform, keeping each entry's ticket and reason. Both read the same rules: a 1280 finding is
// looked up at 1440, a judgeLike variant borrows its base state's count, an optional state may be absent, and a listed
// finding may not get worse than the entry's worst number.
// Findings come from a local run (JUDGE_FINDINGS_OUT=<file> node --test tests/agent/premium/design-judge.test.mjs), from
// the public mirror run's shard-0 judge-findings.json artifact (docs/agents/ci.md), or from a saved old ui log, which prints the
// findings one row per line between `judge-findings-begin` and `judge-findings-end` or as one `judge-findings [...]` line.
// A platform with no input keeps what the old debt says about it, so a Mac-only refresh leaves the Linux entries alone.
// A new entry's ticket and reason come from STATE_TICKETS below, keyed by the state's name.
// A gallery state with judgeLike inherits its base state's counts, so the rebuild lists it only where it shows more.
//   node scripts/design-policy/judge-debt.mjs [--debt <known-debt.json>] [--states <oak-states.json>] [--rise-note <text>] <findings.json | ui.log>...
// --report writes nothing: it prints the rows the rebuild (or, with no findings, the debt file itself) rose or dropped,
// and the rows that sit above main's file (--main <git ref>, default origin/main).
//   node scripts/design-policy/judge-debt.mjs --report [--debt <file>] [--states <file>] [--main <ref>] [<findings>...]
// --states-only (ticket 343) writes, or with --report prints, only the named states' rows on one platform (mergeStates):
// the findings' platform, or --platform when they hold both.
//   node scripts/design-policy/judge-debt.mjs --states-only <id,id> [--platform darwin|linux] [--report] [--debt <file>] [--states <file>] <findings>...
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { RULE_REFS, debtDetail, debtKey, debtNumbers, describeFinding, severitySlots, worsen, worstNumbers } from "./design-judge.mjs";

export const PLATFORMS = ["darwin", "linux"];

const EPSILON = 0.05;

const getsWorse = (entry, finding) => {
  const numbers = debtNumbers(finding.detail);
  return Object.entries(severitySlots(finding.rule, finding.detail)).some(([slot, dir]) => {
    const worst = entry.worst?.[slot];
    return worst === undefined || (dir === "down" ? numbers[slot] < worst - EPSILON : numbers[slot] > worst + EPSILON);
  });
};

const applies = (entry, platform) => !entry.platform || entry.platform === platform;

// `like` is the gallery state's judgeLike: a variant is allowed its base state's count unless it lists its own. Its use
// is recorded under its own id, so staleDebt never counts it toward the base.
export const unlistedFindings = (debt, stateId, found, platform = process.platform, like) => {
  const counts = new Map();
  for (const finding of found) counts.set(debtKey(finding), [...(counts.get(debtKey(finding)) || []), finding]);
  const unlisted = [], used = [];
  for (const [key, list] of counts) {
    const entry = debt.find((candidate) => applies(candidate, platform) && debtKey(candidate) === key);
    const allowed = entry?.states?.[stateId] ?? (like ? entry?.states?.[like] : undefined) ?? 0;
    if (allowed) used.push({ entry, stateId, seen: list.length });
    if (list.length > allowed) unlisted.push(`${stateId}: ${describeFinding(list[0])}${list.length > 1 ? ` (${list.length} times, ${allowed} listed)` : ""}`);
    else if (entry) for (const finding of list) if (getsWorse(entry, finding)) unlisted.push(`${stateId}: ${describeFinding(finding)} (worse than the ${JSON.stringify(entry.worst ?? "nothing")} its debt entry allows)`);
  }
  return { unlisted, used };
};

export const staleDebt = (debt, used, platform = process.platform) => debt.flatMap((entry, index) => (applies(entry, platform)
  ? Object.entries(entry.states).filter(([id, allowed]) => !entry.optional?.includes(id) && (used.get(`${index}|${id}`) ?? 0) < allowed).map(([id, allowed]) => `${id}: ${debtKey(entry)} (lists ${allowed}, saw ${used.get(`${index}|${id}`) ?? 0})`)
  : []));

// known-debt.json lists desktop findings at 1440, so a 1280 finding is looked up under that width.
const debtWidth = (width) => (width === 1280 ? 1440 : width);

// The settle checks carry QJ13 on the finding itself rather than in RULE_REFS; a findings file keeps no ref.
const SETTLE_REF = "QJ13";
const withRef = (finding) => ({ ...finding, ref: finding.ref ?? RULE_REFS[finding.rule] ?? SETTLE_REF });

export const judgeLikes = (states) => new Map(states.filter((state) => state.judgeLike).map((state) => [state.id, state.judgeLike]));

// Checks findings ({ state, rule, width, detail } rows, as judgeStates returns them, from one pass or several slices
// joined) against the debt. `like` maps a state to its judgeLike. `stale` is only meaningful over every gallery state.
export const compareDebt = (debt, findings, { like = new Map(), platform = process.platform } = {}) => {
  const groups = new Map();
  for (const finding of findings) {
    const key = `${finding.state}|${finding.width}`;
    if (!groups.has(key)) groups.set(key, { state: finding.state, width: finding.width, found: [] });
    groups.get(key).found.push(finding);
  }
  const unlisted = [], used = new Map();
  for (const { state, width, found } of groups.values()) {
    const listedAt = debtWidth(width);
    const result = unlistedFindings(debt, state, found.map((finding) => withRef({ ...finding, width: listedAt })), platform, like.get(state));
    unlisted.push(...result.unlisted.map((detail) => ({ state, width, detail: detail.replaceAll(`, ${listedAt}px)`, `, ${width}px)`) })));
    for (const { entry, stateId, seen } of result.used) used.set(`${debt.indexOf(entry)}|${stateId}`, seen);
  }
  return { unlisted, stale: staleDebt(debt, used, platform), used };
};

export const STATE_TICKETS = [
  [/^openui-figure/, "109", "dev gallery figure states"],
  [/^step-peeks-/, "26", "step peeks"],
  [/openui|^(board|contact-card|diagram|evidence-chart|metric-kind|ownership|page-cards|plan-first|profile|project-wall|quote|role(?!-fit)|screens|show-me-as|site-card|stack-map|table)-/, "57", "OpenUI answer blocks"],
  [/./, "23", "agent chrome and states"],
];

const rowFor = (state) => STATE_TICKETS.find(([re]) => re.test(state));
export const ticketFor = (state) => rowFor(state)[1];

const CATCH_ALL = STATE_TICKETS.at(-1);
// An entry the catch-all filed (its generated reason says so) moves to the one block ticket all its states map to.
const retag = (src, states) => {
  const rows = [...new Set(Object.keys(states).map(rowFor))];
  const prefix = `${CATCH_ALL[2]}: `;
  if (src.ticket !== CATCH_ALL[1] || !src.reason.startsWith(prefix) || rows.length !== 1 || rows[0] === CATCH_ALL) return src;
  return { ticket: rows[0][1], reason: `${rows[0][2]}: ${src.reason.slice(prefix.length)}` };
};

export const refreshCommand = (platform) => platform === "linux"
  ? "refresh the Linux debt from this site-ci run: gh run download <run id> -R oak-portfolio/site-ci -n shard-0 -D /tmp/site-ci; node scripts/design-policy/judge-debt.mjs /tmp/site-ci/judge-findings.json, then commit known-debt.json"
  : "refresh the darwin debt: JUDGE_FINDINGS_OUT=/tmp/findings.json node --test tests/agent/premium/design-judge.test.mjs; node scripts/design-policy/judge-debt.mjs /tmp/findings.json";

export const readFindings = (text) => {
  if (text.trimStart().startsWith("[")) return JSON.parse(text);
  const all = text.split("\n");
  const begin = all.findLastIndex((line) => line.trim() === "judge-findings-begin");
  if (begin >= 0) {
    const end = all.findIndex((line, i) => i > begin && line.trim() === "judge-findings-end");
    // Another step's lines can land inside the frame, so only lines that are a findings row count.
    return all.slice(begin + 1, end < 0 ? undefined : end).map((line) => line.trim()).filter((line) => line.startsWith("{")).map((line) => JSON.parse(line));
  }
  const lines = all.filter((line) => line.includes("judge-findings ["));
  if (!lines.length) throw new Error("no judge-findings line in this log");
  // A retried job can print a later line the log cuts short, so the last line that parses wins.
  let error;
  for (const line of lines.reverse()) {
    try { return JSON.parse(line.slice(line.indexOf("judge-findings [") + "judge-findings ".length).replace(/'?,?\s*$/, "")); }
    catch (e) { error ??= e; }
  }
  throw error;
};

const sameStates = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

const order = (e) => [e.rule, e.detail, String(e.width).padStart(5, "0"), e.platform || ""].join("|");

const newEntry = (rule, width, detail, platform, states, worst) => {
  const row = rowFor(Object.keys(states)[0]);
  return { rule, width, detail, platform, states, ...(Object.keys(worst).length ? { worst } : {}), ticket: row[1], reason: `${row[2]}: ${rule} at ${width}px, ${detail}` };
};

const withStates = (entry, platform, states, worst = entry.worst) => {
  const { rule, width, detail, platform: _, states: __, optional, worst: ___, ...rest } = entry;
  const kept = optional?.filter((state) => state in states);
  return { rule, width, detail, ...(platform ? { platform } : {}), states, ...(kept?.length ? { optional: kept } : {}), ...(worst ? { worst } : {}), ...rest };
};

// Ticket 343: the debt with only the named states' counts changed on one platform, every other row and state as it
// was. Each named state's count per debt key comes from the findings, as rebuildDebt counts it: an optional state that
// did not show keeps its count, and a judgeLike variant is listed only above its base state's count. A shared row
// splits only when that platform's counts for those states now differ, a new row goes in at its sort position, and
// `worst` rises only from those findings.
export const mergeStates = (debt, findings, { states, platform, like = new Map() }) => {
  if (!PLATFORMS.includes(platform)) throw new Error(`unknown platform ${platform}`);
  const named = new Set(states);
  const keys = new Map();
  const at = (key, item) => {
    if (!keys.has(key)) keys.set(key, { rule: item.rule, width: item.width, detail: debtDetail(item.detail, item.rule), was: {}, now: {}, optional: new Set(), rows: [], worst: {} });
    return keys.get(key);
  };
  debt.forEach((entry, index) => {
    if (!applies(entry, platform)) return;
    const view = at(debtKey(entry), entry);
    view.rows.push(index);
    for (const [state, n] of Object.entries(entry.states)) view.was[state] = (view.was[state] ?? 0) + n;
    for (const state of entry.optional ?? []) view.optional.add(state);
  });
  for (const f of findings) {
    if (f.platform !== platform || !named.has(f.state)) continue;
    const finding = { ...f, width: debtWidth(f.width) };
    const view = at(debtKey(finding), finding);
    view.now[f.state] = (view.now[f.state] ?? 0) + 1;
    view.worst = worsen(f.rule, f.detail, view.worst, worstNumbers(f.rule, f.detail));
  }
  const edits = new Map(), worst = new Map(), added = [];
  const statesAt = (index) => edits.get(index) ?? { ...debt[index].states };
  for (const { rule, width, detail, was, now, optional, rows, worst: raise } of keys.values()) {
    const count = (state) => now[state] ?? (optional.has(state) ? was[state] ?? 1 : 0);
    const host = rows.find((index) => debt[index].platform === platform) ?? rows[0];
    const fresh = {};
    for (const state of named) {
      const n = count(state), base = like.get(state);
      const floor = base === undefined ? 0 : named.has(base) ? count(base) : was[base] ?? 0;
      const listed = n > floor ? n : 0;
      if (listed === (was[state] ?? 0)) continue;
      if (host === undefined) { fresh[state] = listed; continue; }
      const own = statesAt(host);
      if (listed) own[state] = listed; else delete own[state];
      edits.set(host, own);
      for (const index of rows) if (index !== host && state in debt[index].states) { const other = statesAt(index); delete other[state]; edits.set(index, other); }
    }
    if (host !== undefined && Object.keys(raise).length) {
      const before = debt[host].worst ?? {}, next = worsen(rule, detail, before, raise);
      if (JSON.stringify(next) !== JSON.stringify(before)) worst.set(host, next);
    }
    const byTicket = new Map();
    for (const [state, n] of Object.entries(fresh)) byTicket.set(ticketFor(state), { ...byTicket.get(ticketFor(state)), [state]: n });
    for (const group of byTicket.values()) added.push(newEntry(rule, width, detail, platform, group, raise));
  }
  const out = [];
  debt.forEach((entry, index) => {
    if (!edits.has(index) && !worst.has(index)) return out.push(entry);
    const states = statesAt(index);
    const raised = worst.get(index) ?? entry.worst;
    if (entry.platform || sameStates(states, entry.states)) {
      if (Object.keys(states).length) out.push(withStates(entry, entry.platform, states, raised));
      return;
    }
    const sides = [[PLATFORMS.find((p) => p !== platform), entry.states, entry.worst], [platform, states, raised]].filter(([, s]) => Object.keys(s).length);
    for (const [p, s, w] of sides.sort(([a], [b]) => a.localeCompare(b))) out.push(withStates(entry, p, s, w));
  });
  for (const entry of added) {
    const index = out.findIndex((e) => order(e).localeCompare(order(entry)) > 0);
    out.splice(index < 0 ? out.length : index, 0, entry);
  }
  return out;
};

// `riseNote` is appended to the reason of each entry that lists more on some platform than the old debt did, so a
// ruling that allows a rise (land-30 ruling 90: "291 end pass") is recorded by the rebuild, not by hand.
export const rebuildDebt = (oldDebt, findings, { like = new Map(), riseNote } = {}) => {
  const fresh = new Set(findings.map((f) => f.platform));
  for (const p of fresh) if (!PLATFORMS.includes(p)) throw new Error(`unknown platform ${p}`);
  const keys = new Map();
  const known = new Set(oldDebt.map(debtKey));
  // A key the old debt lacks is split by the ticket its state maps to, so each new entry carries one ticket.
  const slot = (item, state) => {
    const key = known.has(debtKey(item)) ? debtKey(item) : `${debtKey(item)}|${ticketFor(state)}`;
    if (!keys.has(key)) keys.set(key, { debtKey: debtKey(item), row: state && rowFor(state), rule: item.rule, width: item.width, detail: debtDetail(item.detail, item.rule), by: Object.fromEntries(PLATFORMS.map((p) => [p, {}])), worst: Object.fromEntries(PLATFORMS.map((p) => [p, {}])) });
    return keys.get(key);
  };
  // A state marked optional (ticket 109: timing-only findings) shows on some runs and not others, so a fresh run that
  // misses it keeps it listed, and the rebuilt entry keeps the marker.
  const optional = [];
  for (const entry of oldDebt) for (const p of PLATFORMS) {
    if (entry.platform && entry.platform !== p) continue;
    for (const state of entry.optional ?? []) optional.push({ entry, p, state, n: entry.states[state] ?? 1 });
    if (fresh.has(p)) continue;
    const at = slot(entry), by = at.by[p];
    for (const [state, n] of Object.entries(entry.states)) by[state] = (by[state] || 0) + n;
    at.worst[p] = worsen(entry.rule, entry.detail, at.worst[p], entry.worst ?? {});
  }
  for (const f of findings) {
    const at = slot(f, f.state);
    at.by[f.platform][f.state] = (at.by[f.platform][f.state] || 0) + 1;
    at.worst[f.platform] = worsen(f.rule, f.detail, at.worst[f.platform], worstNumbers(f.rule, f.detail));
  }
  for (const { entry, p, state, n } of optional) {
    const at = slot(entry);
    (at.optional ??= Object.fromEntries(PLATFORMS.map((q) => [q, new Set()])))[p].add(state);
    if (fresh.has(p) && !at.by[p][state]) { at.by[p][state] = n; at.worst[p] = worsen(entry.rule, entry.detail, at.worst[p], entry.worst ?? {}); }
  }
  const out = [];
  for (const { debtKey: key, row, rule, width, detail, by, worst, optional: opt } of keys.values()) {
    for (const p of PLATFORMS) for (const [state, n] of Object.entries(by[p])) if (like.has(state) && n <= (by[p][like.get(state)] ?? 0)) delete by[p][state];
    const found = oldDebt.find((e) => debtKey(e) === key) ?? { ticket: row[1], reason: `${row[2]}: ${rule} at ${width}px, ${detail}` };
    const base = { rule, width, detail };
    const present = PLATFORMS.filter((p) => Object.keys(by[p]).length);
    const bound = (w) => (Object.keys(w).length ? { worst: w } : {});
    const marked = (states, ps) => { const o = [...new Set(ps.flatMap((p) => [...(opt?.[p] ?? [])]))].filter((s) => s in states).sort(); return o.length ? { optional: o } : {}; };
    if (present.length === PLATFORMS.length && present.every((p) => sameStates(by[p], by[present[0]]))) { const src = retag(found, by[present[0]]); out.push({ ...base, states: by[present[0]], ...marked(by[present[0]], PLATFORMS), ...bound(worsen(rule, detail, worst.darwin, worst.linux)), ticket: src.ticket, reason: src.reason }); }
    else for (const p of present) { const src = retag(found, by[p]); out.push({ ...base, platform: p, states: by[p], ...marked(by[p], [p]), ...bound(worst[p]), ticket: src.ticket, reason: src.reason }); }
  }
  out.sort((a, b) => order(a).localeCompare(order(b)));
  if (!riseNote) return out;
  const was = byPlatform(oldDebt);
  return out.map((entry) => ((entry.platform ? [entry.platform] : PLATFORMS).some((p) => Object.entries(entry.states).some(([state, n]) => n > (was.get(`${p}|${debtKey(entry)}`)?.states[state] ?? 0)))
    ? { ...entry, reason: `${entry.reason}; ${riseNote}` } : entry));
};

// Each platform's view of a debt file: a shared row counts on both platforms.
const byPlatform = (debt) => {
  const view = new Map();
  for (const entry of debt) for (const platform of entry.platform ? [entry.platform] : PLATFORMS) {
    const key = `${platform}|${debtKey(entry)}`;
    if (!view.has(key)) view.set(key, { platform, key: debtKey(entry), states: {} });
    const states = view.get(key).states;
    for (const [state, n] of Object.entries(entry.states)) states[state] = (states[state] ?? 0) + n;
  }
  return view;
};

const moved = (from, to, up) => Object.entries(up ? to : from).filter(([state, n]) => (up ? n > (from[state] ?? 0) : n > (to[state] ?? 0))).map(([state]) => [state, from[state] ?? 0, to[state] ?? 0]);

// Rows of `after` whose state counts rose or dropped against `before`, per platform. A rise the other platform already
// lists with the same counts (a platform row that became shared) says so.
export const debtChanges = (before, after) => {
  const was = byPlatform(before), now = byPlatform(after);
  const rows = [];
  for (const [id, { platform, key, states }] of now) {
    const counts = moved(was.get(id)?.states ?? {}, states, true);
    if (!counts.length) continue;
    const other = now.get(`${PLATFORMS.find((p) => p !== platform)}|${key}`)?.states;
    rows.push({ change: "rose", platform, key, counts, matches: other && counts.every(([state, , n]) => other[state] === n) ? PLATFORMS.find((p) => p !== platform) : undefined });
  }
  for (const [id, { platform, key, states }] of was) {
    const counts = moved(states, now.get(id)?.states ?? {}, false);
    if (counts.length) rows.push({ change: "dropped", platform, key, counts });
  }
  return rows;
};

export const formatChange = ({ change, platform, key, counts, matches }) => {
  const shown = counts.slice(0, 4).map(([state, from, to]) => `${state} ${from}->${to}`).join(", ");
  return `${change} ${platform} ${key}: ${counts.length} state${counts.length === 1 ? "" : "s"} (${shown}${counts.length > 4 ? `, +${counts.length - 4} more` : ""})${matches ? `, matches ${matches}` : ""}`;
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const option = (name, fallback) => { const at = args.indexOf(name); return at >= 0 ? args.splice(at, 2)[1] : fallback; };
  const report = args.includes("--report");
  if (report) args.splice(args.indexOf("--report"), 1);
  const debtFile = "tests/agent/premium/design-judge-fixtures/known-debt.json";
  const debtPath = option("--debt", new URL(`../../${debtFile}`, import.meta.url).pathname);
  const statesPath = option("--states", new URL("../../src/data/dev/oak-states.json", import.meta.url).pathname);
  const mainRef = option("--main", "origin/main");
  const riseNote = option("--rise-note");
  const statesOnly = option("--states-only")?.split(",").filter(Boolean);
  const platformArg = option("--platform");
  if ((!args.length && !report) || (statesOnly && (!statesOnly.length || !args.length))) { console.error("usage: judge-debt.mjs [--report] [--states-only <id,id> [--platform darwin|linux]] [--debt <known-debt.json>] [--states <oak-states.json>] [--main <ref>] <findings.json | ui.log>..."); process.exit(2); }
  const findings = args.map((file) => readFileSync(file, "utf8")).flatMap(readFindings);
  const states = JSON.parse(readFileSync(statesPath, "utf8"));
  const like = judgeLikes(Array.isArray(states) ? states : states.states);
  const oldDebt = JSON.parse(readFileSync(debtPath, "utf8"));
  const seen = [...new Set(findings.map((f) => f.platform))];
  if (statesOnly && platformArg && !PLATFORMS.includes(platformArg)) { console.error(`judge-debt.mjs --states-only: --platform is ${PLATFORMS.join(" or ")}, not ${platformArg}`); process.exit(2); }
  if (statesOnly && platformArg && seen.length && !seen.includes(platformArg)) { console.error(`judge-debt.mjs --states-only: findings come from ${[...seen].sort().join(" and ")}, not ${platformArg}`); process.exit(2); }
  if (statesOnly && !platformArg && seen.length !== 1) { console.error(`judge-debt.mjs --states-only: findings come from ${[...seen].sort().join(" and ") || "no platform"}: name one with --platform`); process.exit(2); }
  const platform = platformArg ?? seen[0];
  const debt = statesOnly ? mergeStates(oldDebt, findings, { states: statesOnly, platform, like }) : findings.length ? rebuildDebt(oldDebt, findings, { like, riseNote }) : oldDebt;
  if (!report) {
    writeFileSync(debtPath, JSON.stringify(debt, null, 2) + "\n");
    if (statesOnly) {
      const changes = debtChanges(oldDebt, debt);
      console.log(`${statesOnly.length} states on ${platform}: ${changes.length} rows moved, ${debt.length} entries`);
      for (const row of changes) console.log(formatChange(row));
    } else console.log(`${debt.length} entries (${debt.filter((e) => e.platform).length} platform-only) from ${findings.length} findings on ${seen.join(", ")}`);
  } else {
    const root = new URL("../..", import.meta.url).pathname;
    const main = JSON.parse(execFileSync("git", ["-C", root, "show", `${mainRef}:${debtFile}`], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
    const changes = findings.length ? debtChanges(oldDebt, debt) : [];
    const above = debtChanges(main, debt).filter((row) => row.change === "rose");
    console.log(findings.length ? `${changes.filter((r) => r.change === "rose").length} rows rose and ${changes.filter((r) => r.change === "dropped").length} dropped against ${debtPath}, from ${findings.length} findings` : "no findings given: comparing the debt file with main only");
    for (const row of changes) console.log(formatChange(row));
    console.log(`${above.length} rows sit above ${mainRef}'s file`);
    for (const row of above) console.log(formatChange({ ...row, change: "above-main" }));
  }
}
