#!/usr/bin/env node
// Rebuilds the design judge's known-debt.json from gallery findings, per platform, keeping each entry's ticket and reason.
// Findings come from a local run (JUDGE_FINDINGS_OUT=<file> node --test tests/agent/premium/design-judge.test.mjs), from
// the public mirror run's shard-0 judge-findings.json artifact (docs/agents/ci.md), or from a saved old ui log, which prints the
// findings one row per line between `judge-findings-begin` and `judge-findings-end` or as one `judge-findings [...]` line.
// A platform with no input keeps what the old debt says about it, so a Mac-only refresh leaves the Linux entries alone.
// A new entry's ticket and reason come from STATE_TICKETS below, keyed by the state's name.
// A gallery state with judgeLike inherits its base state's counts, so the rebuild lists it only where it shows more.
//   node scripts/design-policy/judge-debt.mjs [--debt <known-debt.json>] <findings.json | ui.log>...
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { debtDetail, debtKey, worsen, worstNumbers } from "./design-judge.mjs";

export const PLATFORMS = ["darwin", "linux"];

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

export const buildDebt = (oldDebt, findings, { like = new Map() } = {}) => {
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
  const order = (e) => [e.rule, e.detail, String(e.width).padStart(5, "0"), e.platform || ""].join("|");
  return out.sort((a, b) => order(a).localeCompare(order(b)));
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const at = args.indexOf("--debt");
  const debtPath = at >= 0 ? args.splice(at, 2)[1] : new URL("../../tests/agent/premium/design-judge-fixtures/known-debt.json", import.meta.url).pathname;
  if (!args.length) { console.error("usage: judge-debt.mjs [--debt <known-debt.json>] <findings.json | ui.log>..."); process.exit(2); }
  const findings = args.map((file) => readFileSync(file, "utf8")).flatMap(readFindings);
  const states = JSON.parse(readFileSync(new URL("../../src/data/dev/oak-states.json", import.meta.url), "utf8"));
  const like = new Map((Array.isArray(states) ? states : states.states).filter((s) => s.judgeLike).map((s) => [s.id, s.judgeLike]));
  const debt = buildDebt(JSON.parse(readFileSync(debtPath, "utf8")), findings, { like });
  writeFileSync(debtPath, JSON.stringify(debt, null, 2) + "\n");
  console.log(`${debt.length} entries (${debt.filter((e) => e.platform).length} platform-only) from ${findings.length} findings on ${[...new Set(findings.map((f) => f.platform))].join(", ")}`);
}
