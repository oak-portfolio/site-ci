// Run: node --test tests/quality/owner-console-shell.test.mjs (part of npm run test:quality).
// Renders the dev-only Owner console from fixed read states. Nothing here calls the owner API.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { test } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import { loadTsx } from "../agent/design-rework/load-tsx.mjs";

const root = path.resolve(import.meta.dirname, "../..");
const hasBrowser = existsSync(chromium.executablePath());
const noBrowser = hasBrowser || process.env.CI ? false : "no Playwright browser on this runner; the local validate gate runs this layout check";
const { settle, initialReads } = loadTsx("src/components/owner/console/reads.ts");
const { fixtureReads } = loadTsx("src/components/owner/console/fixtures.ts");
const { OwnerConsole, consoleTabs } = loadTsx("src/components/owner/console/OwnerConsole.tsx");

const at = Date.UTC(2026, 10, 4, 18, 30);
const json = (status, body) => ({ kind: "json", status, body });
const slot = (extra = {}) => ({ slotId: "a1", label: "Oakfolio sponsor", last4: "a91f", state: "active", position: 0, knownCreditMicroUsd: 110e6,
  usedMicroUsd: 96.4e6, remainingMicroUsd: 13.6e6, percentUsed: 88, runwayDays: 3, testedAt: at, endedAt: null, reason: null, ...extra });
const secretKey = "sk-or-v1-0123456789abcdef0123456789abcdef", grantCode = "OAK-ABCDE-FGHJK-MNPQR-STVWX-YZ0123";
const keysBody = { view: { sealing: "ready", alerts: [], providers: [
  { provider: "openrouter", active: slot({ key: secretKey }), queue: [slot({ slotId: "q1", label: "Oakfolio sponsor 2", last4: "c3d2", state: "queued", position: 1, usedMicroUsd: 0, remainingMicroUsd: 110e6, percentUsed: 0 })], history: [], needsAttention: true, events: [] },
  { provider: "exa", active: slot({ slotId: "e1", label: "Exa account 1", last4: "5b20", state: "exhausted", knownCreditMicroUsd: 10e6, usedMicroUsd: 10e6, remainingMicroUsd: 0, percentUsed: 100 }), queue: [], history: [], needsAttention: true, events: [] },
] } };
const grantsBody = { codes: [{ id: "6f1c2d3e-0000-4000-8000-000000000001", answers: 20, label: "Recruiter at Acme", createdAt: at, expiresAt: at + 7 * 864e5, status: "active", redeemedAt: null, code: grantCode }] };
const usageBody = { service: "oak-owner-usage-v1", scope: "sponsored-model", enabled: true, totals: { actualMicroUsd: 41.2e6, heldMicroUsd: 2.1e6, availableMicroUsd: 46.7e6 },
  effectiveLimitMicroUsd: 90e6, checkedAt: at, reset: { period: "utc-month", nextAt: Date.UTC(2026, 11, 1), heldCarryOver: true, keyRotationResetsUsage: false } };

function reads(entries) {
  let state = initialReads();
  for (const [name, outcome, now = at] of entries) state = { ...state, [name]: settle(name, state[name], outcome, now) };
  return state;
}
const render = (props) => renderToStaticMarkup(React.createElement(OwnerConsole, props));
const text = html => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");
const dailyBody = { service: "oak-owner-usage-daily-v1", checkedAt: at, month: "2026-11",
  days: [{ day: "2026-11-01", actualMicroUsd: 0, heldMicroUsd: 0 }, { day: "2026-11-02", actualMicroUsd: 4.8e6, heldMicroUsd: 0 },
    { day: "2026-11-03", actualMicroUsd: 2.1e6, heldMicroUsd: 1.2e6 }, { day: "2026-11-04", actualMicroUsd: 3e6, heldMicroUsd: 0 }],
  pace: { dailyPoolMicroUsd: 90e6, paceMicroUsd: 3e6 }, saver: { state: "off", thresholdPercent: 90 }, rereadBacklog: 3 };
const usageHtml = (daily = dailyBody) => render({ initialTab: "usage", initialReads: reads([["usage", json(200, usageBody)], ["usageDaily", daily === null ? json(404, {}) : json(200, daily)]]) });

test("Spend per day draws one named bar per day, stacks held on actual, and a zero day is a zero-height bar with its label", () => {
  const html = usageHtml();
  assert.equal((html.match(/class="oc-bar"/g) ?? []).length, 4, "one bar per day in the read");
  assert.match(html, /role="img" aria-label="Nov 2, \$4\.80 actual" style="--oc-actual:96;--oc-held:0"/, "$4.80 of a $5.00 axis");
  assert.match(html, /role="img" aria-label="Nov 3, \$2\.10 actual, \$1\.20 held" style="--oc-actual:42;--oc-held:24"/, "held is named and stacked: $2.10 and $1.20 of $5.00");
  const zero = html.match(/<li[^>]*><span class="oc-bar" role="img" aria-label="Nov 1, \$0\.00 actual" style="--oc-actual:0;--oc-held:0"><\/span>([\s\S]*?)<\/li>/);
  assert.ok(zero, "the zero day is a zero-height bar");
  assert.match(zero[1], /<span class="oc-bars__day" aria-hidden="true">1<\/span>/, "with its day label");
  assert.doesNotMatch(html, /oc-days/, "the bare date list is gone");
});

test("the pace line sits at the pace value on a 0 to 5 dollar axis, and the chart has a text equivalent", () => {
  const html = usageHtml();
  assert.match(html, /<li class="oc-bars__pace" aria-hidden="true" style="--oc-at:60"/, "$3.00 of a $5.00 axis is 60 percent");
  assert.match(text(html.match(/<ul class="oc-legend"[\s\S]*?<\/ul>/)[0]), /Actual Held Daily pace \$3\.00/);
  const labels = [...html.matchAll(/<ul class="oc-chart__axis"[^>]*>([\s\S]*?)<\/ul>/g)][0][1].match(/>\$[\d.]+</g);
  assert.deepEqual(labels, [">$5<", ">$2.5<", ">$0<"], "top to bottom");
  assert.match(html, /<div class="oc-chart" role="group" aria-labelledby="oc-per-day" aria-describedby="oc-per-day-text"/);
  assert.match(html, /<p class="oc-muted" id="oc-per-day-text">4 days read, \$9\.90 actual\. Highest day Nov 2 at \$4\.80\. Daily pace \$3\.00\.<\/p>/);
});

test("a pace beyond every day lifts the axis so the line stays inside the chart, and no pace draws no line", () => {
  const high = usageHtml({ ...dailyBody, pace: { dailyPoolMicroUsd: null, paceMicroUsd: 8e6 } });
  assert.match(high, /class="oc-bars__pace"[^>]*style="--oc-at:80"/, "$8.00 of a $10.00 axis");
  const none = usageHtml({ ...dailyBody, pace: { dailyPoolMicroUsd: null, paceMicroUsd: null } });
  assert.doesNotMatch(none, /oc-bars__pace/);
  assert.match(text(none), /No daily pace set\./);
});

test("a month with no spend and no pace draws one $0 tick and flat bars, and an empty read draws no bars", () => {
  for (const [label, daily] of [["all-zero days", { ...dailyBody, pace: { dailyPoolMicroUsd: null, paceMicroUsd: null }, days: dailyBody.days.map(row => ({ ...row, actualMicroUsd: 0, heldMicroUsd: 0 })) }],
    ["no days", { ...dailyBody, pace: { dailyPoolMicroUsd: null, paceMicroUsd: null }, days: [] }]]) {
    const html = usageHtml(daily);
    const axis = html.match(/<ul class="oc-chart__axis"[^>]*>([\s\S]*?)<\/ul>/)[1];
    assert.deepEqual(axis.match(/>\$[\d.]+</g), [">$0<"], `${label}: a single $0 tick`);
    assert.doesNotMatch(html, /--oc-actual:(?!0;)/, `${label}: every bar is flat`);
    assert.doesNotMatch(html, /NaN/, label);
  }
  const labelsOf = html => [...html.match(/<ul class="oc-chart__axis"[^>]*>([\s\S]*?)<\/ul>/)[1].matchAll(/<li[^>]*>/g)].length;
  assert.equal(labelsOf(usageHtml()), 3, "a month with spend keeps its three ticks");
});

test("a day with a little spend still draws a visible bar, and a zero day still draws none", () => {
  const tiny = usageHtml({ ...dailyBody, days: [{ day: "2026-11-01", actualMicroUsd: 0, heldMicroUsd: 0 }, { day: "2026-11-02", actualMicroUsd: 3e3, heldMicroUsd: 0 },
    { day: "2026-11-03", actualMicroUsd: 4.8e6, heldMicroUsd: 2e3 }] });
  assert.match(tiny, /aria-label="Nov 1, \$0\.00 actual" style="--oc-actual:0;--oc-held:0"/, "zero stays zero");
  assert.match(tiny, /aria-label="Nov 2, \$0\.00 actual" style="--oc-actual:1;--oc-held:0"/, "$0.003 on a $5 axis is lifted to 1 percent");
  assert.match(tiny, /aria-label="Nov 3, \$4\.80 actual, \$0\.00 held" style="--oc-actual:96;--oc-held:1"/, "a sliver of held shows on top");
});

test("Saver mode shows its state, threshold and the reread backlog as read-only text with no write control", () => {
  const html = usageHtml();
  const card = html.match(/<section class="oc-card oc-saver"[\s\S]*?<\/section>/)[0];
  const words = text(card);
  assert.match(words, /Saver mode/);
  assert.match(words, /Off/);
  assert.match(words, /Turns on at 90%\./);
  assert.match(words, /Lost-copy reread backlog: 3/);
  assert.doesNotMatch(html.slice(html.indexOf("oc-usage-days")), /<(button|input|select|textarea)|role="(switch|checkbox|button)"|contenteditable/i, "nothing in the per-day area writes");
  const on = text(usageHtml({ ...dailyBody, saver: { state: "on", thresholdPercent: 75 }, rereadBacklog: 12 }));
  assert.match(on, /Saver mode On/);
  assert.match(on, /Turns on at 75%\./);
  assert.match(on, /backlog: 12/);
  const unknown = text(usageHtml({ ...dailyBody, saver: { state: "unknown", thresholdPercent: null }, rereadBacklog: null }));
  assert.match(unknown, /Saver mode Unknown/);
  assert.match(unknown, /No threshold set\./);
  assert.match(unknown, /backlog: Unknown/);
});

test("a 404, loading and unreachable keep their text and draw no chart or Saver card", () => {
  const outcomes = [["404", json(404, {}), /Per-day read unavailable\./], ["unreachable", { kind: "network" }, /Per-day read unavailable\./]];
  for (const [label, outcome, words] of outcomes) {
    const html = render({ initialTab: "usage", initialReads: reads([["usage", json(200, usageBody)], ["usageDaily", outcome]]) });
    assert.match(text(html), words, label);
    assert.doesNotMatch(text(html), /Not deployed yet/i, label);
    assert.doesNotMatch(html, /oc-bar|oc-saver/, label);
  }
  const loading = render({ initialTab: "usage", initialReads: reads([["usage", json(200, usageBody)]]) });
  assert.match(text(loading), /Loading\./);
  assert.doesNotMatch(loading, /oc-bar|oc-saver/);
});

test("the signed-in fixture carries a ready per-day read, and the unreachable fixture keeps drawing its last one", () => {
  const days = fixtureState("signed-in").usageDaily;
  assert.equal(days.kind, "ready", "the fixture body passes the contract");
  for (const name of ["signed-in", "unreachable"]) {
    const html = render({ initialTab: "usage", initialReads: fixtureState(name) });
    assert.equal((html.match(/class="oc-bar"/g) ?? []).length, days.data.days.length, name);
    assert.match(html, /oc-bars__pace/, name);
    assert.match(text(html), /Saver mode/, name);
  }
});

const incident = (id, extra = {}) => ({ id, service: "public-research", from: "ready", to: "near-limit", transition: id, createdAt: at - id * 36e5, thresholdPercent: 80,
  configurationRevision: 1, delivery: "inbox-observed", attempts: 1, lastAttemptAt: at, acceptedAt: at, providerDeliveredAt: at, inboxObservedAt: at, ...extra });
const historyBody = (incidents, nextCursor = null) => ({ service: "oak-owner-alert-history-v1", checkedAt: at, items: incidents.map(incident => ({ incident, held: false })), nextCursor });
const hex = i => Array.from({ length: 64 }, (_, j) => "0123456789abcdef"[(i * 7 + j * 3) % 16]).join("");
const runsBody = count => ({ service: "oak-owner-evaluation-runs-v1", checkedAt: at,
  runs: Array.from({ length: count }, (_, i) => ({ caseId: hex(i), origin: i % 3 ? "synthetic" : "owner-authored", state: ["admitted", "registered", "revoked", "expired"][i % 4], createdAt: at - i * 864e5, expiresAt: i % 2 ? null : at + 864e5 })) });
const servicesFixture = () => ({ kind: "json", status: 200, body: fixtureState("signed-in").services.data });

test("every read in the signed-in fixture is a body its contract schema accepts", () => {
  const { consoleReads } = loadTsx("src/components/owner/console/reads.ts");
  const state = fixtureState("signed-in");
  for (const name of Object.keys(consoleReads)) assert.equal(state[name].kind, "ready", `${name}: the fixture body parses with its contract`);
  const contracts = { usageDaily: ["usage-daily.ts", "ownerUsageDailySchema"], alertHistory: ["alert-history.ts", "ownerAlertHistorySchema"], evaluationRuns: ["evaluation-runs.ts", "ownerEvaluationRunsSchema"] };
  for (const [name, [file, schema]] of Object.entries(contracts))
    assert.equal(loadTsx(`packages/oak-agent-contracts/src/owner/${file}`)[schema].safeParse(state[name].data).success, true, `${name}: ${schema}`);
});

test("with the signed-in fixture, Health lists the alert history with held rows marked Held, and Release lists the evaluation runs", () => {
  const state = fixtureState("signed-in");
  const health = render({ initialTab: "health", initialReads: state });
  const history = health.match(/<section class="oc-card" aria-labelledby="oc-history">[\s\S]*?<\/section>/)?.[0];
  assert.ok(history, "an alert history card");
  assert.equal((history.match(/<tbody>[\s\S]*<\/tbody>/)[0].match(/<tr/g) ?? []).length, state.alertHistory.data.items.length, "one row per history item");
  assert.equal((history.match(/>Held</g) ?? []).length, state.alertHistory.data.items.filter(item => item.held).length, "each held item carries a Held chip");
  assert.ok(state.alertHistory.data.items.some(item => item.held) && state.alertHistory.data.items.some(item => !item.held), "the fixture has held and settled rows");
  const release = render({ initialTab: "release", initialReads: state });
  const runs = release.match(/<section class="oc-card" aria-labelledby="oc-runs">[\s\S]*?<\/section>/)?.[0];
  assert.ok(runs, "an evaluation runs card");
  assert.equal((runs.match(/<tbody>[\s\S]*<\/tbody>/)[0].match(/<tr/g) ?? []).length, state.evaluationRuns.data.runs.length);
  assert.ok(!runs.includes(state.evaluationRuns.data.runs[0].caseId), "a case id shows shortened, never whole");
  for (const html of [health, release]) assert.doesNotMatch(text(html), /Not deployed yet|arrives with/i);
});

test("a 404 from any of the three owner reads renders the error state, never Not deployed yet", () => {
  const base = [["usage", json(200, usageBody)], ["services", servicesFixture()]];
  const cases = [["usage", "usageDaily", /Per-day read unavailable\./], ["health", "alertHistory", /Alert history unavailable\./], ["release", "evaluationRuns", /Unreachable/]];
  for (const [tab, name, words] of cases) {
    const html = text(render({ initialTab: tab, initialReads: reads([...base, [name, json(404, { error: "not-found" })]]) }));
    assert.match(html, words, `${tab}: ${name}`);
    assert.doesNotMatch(html, /Not deployed yet/i, `${tab}: ${name}`);
  }
});

test("Release says newest 50 at the runs read's cap and the exact count below it", () => {
  const words = count => text(render({ initialTab: "release", initialReads: reads([["evaluationRuns", json(200, runsBody(count))]]) }));
  assert.match(words(50), /Newest 50 evaluation cases\./);
  assert.doesNotMatch(words(50), /50 evaluation cases on record/);
  assert.match(words(49), /49 evaluation cases on record\./);
  assert.doesNotMatch(words(49), /Newest/);
  assert.match(words(1), /1 evaluation case on record\./);
  assert.match(words(0), /No evaluation cases on record\./);
});

test("Health says when older alerts sit past the first page, and counts a whole history exactly", () => {
  const words = body => text(render({ initialTab: "health", initialReads: reads([["services", servicesFixture()], ["alertHistory", json(200, body)]]) }));
  assert.match(words(historyBody([incident(2), incident(1, { delivery: "failed" })], "1")), /Newest 2 alerts\. Older alerts are stored past this page\./);
  assert.match(words(historyBody([incident(3), incident(2), incident(1)])), /3 stored alerts\./);
  assert.match(words(historyBody([])), /No alerts stored\./);
});

test("Alert history names provider-account conditions in words, the way Services does", () => {
  const { historyModel } = loadTsx("src/components/owner/console/tabs/Health.tsx");
  const [row] = historyModel({ items: [{ incident: incident(1, { kind: "provider-account-change", from: "near-expiry", to: "swap-now" }), held: false }], nextCursor: null }).rows;
  assert.deepEqual([row.to, row.from], ["Swap now", "Expiring soon"]);
});

const withConditions = conditions => {
  const body = structuredClone(fixtureState("signed-in").services.data);
  body.services = body.services.map((row, i) => ({ ...row, condition: conditions[i] ?? "ready" }));
  return reads([["services", json(200, body)]]);
};

test("Health opens with a one-line verdict from the services read, above Services", () => {
  const health = render({ initialTab: "health", initialReads: fixtureState("signed-in") });
  const verdict = health.match(/<p class="oc-muted" id="oc-verdict">([\s\S]*?)<\/p>/)?.[1];
  assert.equal(text(verdict ?? "").trim(), "1 service at its limit, 1 near limit");
  assert.ok(health.indexOf('id="oc-verdict"') < health.indexOf('id="oc-services"'), "the verdict sits above Services");
  const words = conditions => text(render({ initialTab: "health", initialReads: withConditions(conditions) }).match(/<p class="oc-muted" id="oc-verdict">([\s\S]*?)<\/p>/)?.[1] ?? "").trim();
  assert.equal(words([]), "No service at or near its limit");
  assert.equal(words(["exhausted", "exhausted", "near-limit", "near-limit", "disabled"]), "2 services at their limit, 2 near limit");
  assert.equal(words(["blocked", "failure", "stale"]), "1 blocked, 1 to check, 1 outdated");
  assert.equal(words(["unknown", "unknown", "ready"]), "2 unknown", "unknown is never read as all clear");
  assert.doesNotMatch(render({ initialTab: "health", initialReads: reads([]) }), /id="oc-verdict"/, "no services read, no verdict");
});

test("Release counts evaluation cases by state above the table in Usage's tile grid", () => {
  const html = render({ initialTab: "release", initialReads: reads([["evaluationRuns", json(200, runsBody(7))]]) });
  const grid = html.match(/<dl class="oc-grid oc-grid--4"[^>]*>([\s\S]*?)<\/dl>/)?.[1];
  assert.ok(grid, "a four-tile grid");
  assert.equal((grid.match(/class="oc-tile"/g) ?? []).length, 4);
  assert.equal(text(grid).trim(), "Admitted 2 Registered 2 Revoked 2 Expired 1");
  assert.ok(html.indexOf("oc-grid--4") < html.indexOf("<table"), "the counts sit above the table");
  assert.doesNotMatch(render({ initialTab: "release", initialReads: reads([["evaluationRuns", json(200, runsBody(0))]]) }), /oc-grid--4/, "no cases, no counts");
});

test("Alert history splits the change into Now and Was, Now first", () => {
  const health = render({ initialTab: "health", initialReads: fixtureState("signed-in") });
  const history = health.match(/<section class="oc-card" aria-labelledby="oc-history">[\s\S]*?<\/section>/)[0];
  assert.deepEqual([...history.matchAll(/<th scope="col">([^<]+)<\/th>/g)].map(m => m[1]), ["Service", "Now", "Was", "When", "Email"]);
  const first = history.match(/<tbody><tr>([\s\S]*?)<\/tr>/)[1];
  assert.deepEqual([...first.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].slice(0, 2).map(m => text(m[1]).trim()), ["Near limit Held", "Available"]);
});

test("Health and Release show signed out and unreachable the way Usage does", () => {
  for (const tab of ["health", "release"]) {
    assert.match(text(render({ initialTab: tab, initialReads: fixtureState("signed-out") })), /Signed out/, `${tab}: signed out`);
    const stale = text(render({ initialTab: tab, initialReads: fixtureState("unreachable") }));
    assert.match(stale, /Stale/, `${tab}: the unreachable fixture marks the tab stale`);
  }
  const releaseStale = render({ initialTab: "release", initialReads: fixtureState("unreachable") });
  assert.match(releaseStale, /aria-labelledby="oc-runs"/, "Release keeps drawing its last good runs");
  const signedOutHistory = text(render({ initialTab: "health", initialReads: reads([["services", servicesFixture()], ["alertHistory", json(403, { error: "owner-required" })]]) }));
  assert.match(signedOutHistory, /Alert history unavailable\./);
  const loading = text(render({ initialTab: "health", initialReads: reads([["services", servicesFixture()]]) }));
  assert.match(loading, /Loading alert history\./);
  const offline = text(render({ initialTab: "health", initialReads: reads([["services", servicesFixture()], ["alertHistory", { kind: "network" }]]) })
    .match(/<section class="oc-card" aria-labelledby="oc-history">[\s\S]*?<\/section>/)[0]);
  assert.match(offline, /Alert history unavailable\. Showing the newest 2 alerts from the services read\./);
  assert.match(offline, /Exa research: Available to Near limit/, "the services read's newest alerts still show");
});

test("no shipped owner read describes itself as not shipped", () => {
  const search = spawnSync("rg", ["-n", "-i", "arrives with ticket|POST-only today|not deployed yet", "src/components/owner", "packages/oak-agent-contracts/src/owner"], { cwd: root, encoding: "utf8" });
  assert.equal(search.status, 1, search.stdout || search.stderr);
});

test("a proxy refusal and a missing token are signed out, a 404 or 405 on a shipped read is an error, a failure keeps the last good read", () => {
  assert.deepEqual(settle("keys", { kind: "loading" }, json(403, { error: "owner-proxy-same-origin-only" }), at), { kind: "signed-out", reason: "same-origin-only" });
  assert.deepEqual(settle("keys", { kind: "loading" }, json(403, { error: "owner-required" }), at), { kind: "signed-out", reason: "no-token" });
  assert.deepEqual(settle("keys", { kind: "loading" }, json(401, { error: "sign-in-required" }), at), { kind: "signed-out", reason: "no-token" });
  assert.equal(settle("keys", { kind: "loading" }, { kind: "other", status: 403 }, at).kind, "unreachable", "an HTML 403 is the spend breaker");
  for (const name of ["usageDaily", "alertHistory", "evaluationRuns"]) {
    assert.equal(settle(name, { kind: "loading" }, json(404, { error: "not-found" }), at).kind, "unreachable", `${name}: a 404 is an error`);
    assert.equal(settle(name, { kind: "loading" }, json(405, { error: "method-not-allowed" }), at).kind, "unreachable", `${name}: a 405 is an error`);
  }
  assert.equal(settle("usage", { kind: "loading" }, json(404, { error: "not-found" }), at).kind, "unreachable", "a shipped read never reads as not deployed");
  const good = settle("usage", { kind: "loading" }, json(200, usageBody), at);
  assert.equal(good.kind, "ready");
  const failed = settle("usage", good, { kind: "network" }, at + 60_000);
  assert.equal(failed.kind, "unreachable");
  assert.equal(failed.last.at, at);
  assert.equal(failed.last.data.totals.actualMicroUsd, 41.2e6);
  assert.equal(settle("usage", failed, json(502, { error: "bad-gateway" }), at + 120_000).last.at, at, "a second failure keeps the same last good read");
});

test("the shell lists every tab up front as a tablist, with stable labels", () => {
  const html = render({ initialTab: "overview", initialReads: initialReads() });
  assert.match(html, /role="tablist"/);
  const tabs = [...html.matchAll(/role="tab"[^>]*>([\s\S]*?)<\/button>/g)].map(match => text(match[1]).trim());
  assert.deepEqual(tabs, ["Overview", "Keys", "Usage", "Health", "Content", "Assets", "Traces", "Quality bar", "Review and release", "Public resources"]);
  assert.doesNotMatch(html, /<textarea|role="log"|aria-label="Message"/i, "no composer");
});

for (const [reason, steps] of [["no-token", /oak-owner-api-token/], ["same-origin-only", /same tab|directly/i]]) test(`signed out (${reason}) shows the fix steps on every owner tab`, () => {
  const outcome = reason === "no-token" ? json(403, { error: "owner-required" }) : json(403, { error: "owner-proxy-same-origin-only" });
  const state = reads(["keys", "grants", "usage", "services"].map(name => [name, outcome]));
  for (const tab of ["overview", "keys", "usage", "health"]) {
    const html = text(render({ initialTab: tab, initialReads: state }));
    assert.match(html, /Signed out/, tab);
    assert.match(html, steps, tab);
  }
});

test("a failed read shows the last good read with its time, the tab marked Stale, and Retry", () => {
  const state = reads([["usage", json(200, usageBody)], ["usage", { kind: "network" }, at + 5 * 60_000], ["usageDaily", json(200, dailyBody)]]);
  const html = render({ initialTab: "usage", initialReads: state });
  const words = text(html);
  assert.match(words, /\$41\.20/);
  assert.match(words, /Stale/);
  assert.match(html, /<time[^>]*datetime="2026-11-04T18:30:00.000Z"/i);
  assert.match(html, /<button[^>]*>[\s\S]*?Retry/);
  assert.match(words, /Saver mode/, "the per-day read still draws beside the stale month totals");
});

test("an unreachable read with nothing to fall back on says so and offers Retry", () => {
  const words = text(render({ initialTab: "health", initialReads: reads([["services", { kind: "network" }]]) }));
  assert.match(words, /Unreachable/);
  assert.match(words, /Retry/);
});

test("Keys shows last-4 chips, money as display numbers and a spent key, and never a key value or grant code", () => {
  const state = reads([["keys", json(200, keysBody)], ["grants", json(200, grantsBody)]]);
  for (const view of ["tab", "json"]) {
    const html = render({ initialTab: "keys", initialReads: state, initialView: view });
    assert.ok(!html.includes(secretKey), `${view}: key value`);
    assert.ok(!html.includes(grantCode), `${view}: grant code`);
    assert.ok(!html.includes("ZY0123") && !/sk-or-/.test(html), `${view}: no fragment of either`);
  }
  const words = text(render({ initialTab: "keys", initialReads: state }));
  assert.match(words, /ending a91f/);
  assert.match(words, /\$13\.60 left of \$110\.00/);
  assert.match(words, /Spent/);
  assert.match(words, /Recruiter at Acme/);
});

test("the JSON view holds the same fields as the tab", () => {
  const state = reads([["keys", json(200, keysBody)], ["grants", json(200, grantsBody)], ["usage", json(200, usageBody)], ["usageDaily", json(404, {})]]);
  for (const tab of ["keys", "usage"]) {
    const html = render({ initialTab: tab, initialReads: state, initialView: "json" });
    const block = html.match(/<pre[^>]*data-console-json[^>]*>([\s\S]*?)<\/pre>/);
    assert.ok(block, `${tab}: a JSON block`);
    const model = JSON.parse(block[1].replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
    const tabWords = text(render({ initialTab: tab, initialReads: state }));
    if (tab === "keys") {
      assert.deepEqual(model.providers.map(p => p.active?.last4), ["a91f", "5b20"]);
      assert.equal(model.providers[1].state, "spent");
      assert.equal(model.grants[0].label, "Recruiter at Acme");
      for (const p of model.providers) assert.ok(tabWords.includes(`ending ${p.active.last4}`));
    } else {
      assert.deepEqual([model.actual, model.held, model.available, model.ceiling], ["$41.20", "$2.10", "$46.70", "$90.00"]);
      for (const value of [model.actual, model.held, model.available, model.ceiling]) assert.ok(tabWords.includes(value), value);
      assert.equal(model.perDay, "unreachable");
    }
  }
});

test("the console stylesheet paints no white panel and blurs only the top bar", () => {
  const css = readFileSync(path.join(root, "src/styles/owner-console.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({ selector: selector.trim(), body }));
  const light = /background(-color)?\s*:[^;]*(#fff\b|#ffffff|\bwhite\b|var\(--text\)|var\(--oak-primary\)|rgba\(255,\s*255,\s*255,\s*(0?\.[3-9]|1))/i;
  for (const { selector, body } of rules) if (light.test(body)) assert.match(selector, /aria-selected|data-selected|data-active|::after|__seg-fill|__bar-fill/, `light fill on ${selector}`);
  const blurred = rules.filter(({ body }) => /backdrop-filter/.test(body)).map(({ selector }) => selector);
  assert.ok(blurred.length > 0 && blurred.every(selector => /__bar\b/.test(selector)), `blur on ${blurred.join(", ")}`);
});

test("the dev route is injected only under astro dev and sits on the noindex utility layout", () => {
  const config = readFileSync(path.join(root, "astro.config.mjs"), "utf8");
  const dev = config.slice(config.indexOf("const devRoutes"), config.indexOf("function isPublicSitemapPathname"));
  assert.match(dev, /if \(command !== "dev"\)[\s\S]*pattern: "\/owner\/console"[\s\S]*entrypoint: "\.\/src\/dev\/owner-console\.astro"/);
  const page = readFileSync(path.join(root, "src/dev/owner-console.astro"), "utf8");
  assert.match(page, /OakUtilityLayout/);
});

const stylesheet = () => readFileSync(path.join(root, "src/styles/owner-console.css"), "utf8");
const fixtureState = name => fixtureReads(name, at);
const everyTabHtml = () => [["signed-in", "tab"], ["signed-in", "json"], ["signed-out", "tab"], ["unreachable", "tab"]]
  .flatMap(([name, view]) => consoleTabs.map(tab => ({ label: `${name}/${view}/${tab.id}`, html: render({ initialTab: tab.id, initialReads: fixtureState(name), initialView: view }) })));

test("the tabpanel is a plain div under the layout's main landmark, with no second main", () => {
  const layout = readFileSync(path.join(root, "src/layouts/OakUtilityLayout.astro"), "utf8");
  assert.match(layout, /<main id="main-content"[^>]*><slot \/><\/main>/, "the utility layout owns the page's main landmark");
  for (const { label, html } of everyTabHtml()) {
    assert.doesNotMatch(html, /<main[\s>]/, `${label}: the console adds no main of its own`);
    assert.match(html, /<div[^>]*role="tabpanel"/, `${label}: tabpanel is a div`);
  }
});

test("headings never skip a level on any tab or state", () => {
  for (const { label, html } of everyTabHtml()) {
    const levels = [...html.matchAll(/<h([1-6])[\s>]/g)].map(match => Number(match[1]));
    assert.equal(levels[0], 1, `${label}: starts at h1`);
    levels.forEach((level, i) => assert.ok(i === 0 || level <= levels[i - 1] + 1, `${label}: h${levels[i - 1]} then h${level}`));
  }
});

test("an Overview link's name is its visible text, not an aria-label that replaces it", () => {
  const html = render({ initialTab: "overview", initialReads: fixtureState("signed-in") });
  const links = [...html.matchAll(/<a[^>]*oc-insight__link[^>]*>/g)].map(match => match[0]);
  assert.equal(links.length, 4);
  for (const link of links) assert.doesNotMatch(link, /aria-label/);
});

test("Overview links keep the fixture and view params when they are present", () => {
  const hrefs = search => {
    globalThis.window = { location: { search } };
    try {
      const html = render({ initialTab: "overview", initialReads: fixtureState("signed-in") });
      return [...html.matchAll(/<a[^>]*href="([^"]*)"[^>]*oc-insight__link/g)].map(match => new URLSearchParams(match[1].replace(/&amp;/g, "&").replace(/^\?/, "")));
    } finally { delete globalThis.window; }
  };
  const kept = hrefs("?fixture=unreachable&view=tab&tab=overview");
  assert.deepEqual(kept.map(p => p.get("tab")), ["keys", "usage", "health", "keys"]);
  for (const p of kept) assert.deepEqual([p.get("fixture"), p.get("view")], ["unreachable", "tab"]);
  const plain = hrefs("?tab=overview");
  assert.deepEqual(plain.map(p => [...p.keys()]), [["tab"], ["tab"], ["tab"], ["tab"]]);
});

test("keys that share their last 4 characters still get distinct React keys", () => {
  const twin = (slotId, extra) => slot({ slotId, label: `Key ${slotId}`, last4: "c3d2", ...extra });
  const body = { view: { sealing: "ready", alerts: [], providers: [{ provider: "openrouter", active: slot(), needsAttention: false,
    queue: [twin("q1", { state: "queued", position: 1 }), twin("q2", { state: "queued", position: 2 })],
    history: [twin("h1", { state: "exhausted", remainingMicroUsd: 0 }), twin("h2", { state: "exhausted", remainingMicroUsd: 0 })] }] } };
  const state = reads([["keys", json(200, body)], ["grants", json(200, grantsBody)]]);
  const keysTab = consoleTabs.find(tab => tab.id === "keys");
  const siblingKeys = [];
  (function walk(node) {
    if (Array.isArray(node)) { siblingKeys.push(node.flatMap(child => child?.key == null ? [] : [child.key])); node.forEach(walk); return; }
    if (node && typeof node === "object" && node.props) walk(node.props.children);
  })(keysTab.View({ model: keysTab.model(state) }));
  const crowded = siblingKeys.filter(keys => keys.length > 1);
  assert.ok(crowded.length > 0, "the walk found keyed lists");
  for (const keys of crowded) assert.equal(new Set(keys).size, keys.length, `duplicate keys in ${keys.join(", ")}`);
  assert.ok(!crowded.flat().some(key => key === "c3d2"), "no key is a last-4 value");
});

test("Health says what the retirement-header command does without --apply and with it", () => {
  const words = text(render({ initialTab: "health", initialReads: fixtureState("signed-in") }));
  assert.match(words, /dry run/i);
  assert.match(words, /--apply/);
  assert.match(words, /workers\.dev/);
  assert.doesNotMatch(words, /changes nothing/i);
});

test("the services read uses the shared owner services contract", () => {
  const { ownerServicesViewSchema } = loadTsx("packages/oak-agent-contracts/src/owner-services.ts");
  const oneRow = { checkedAt: at, alerting: { started: true, thresholdPercent: 80, lastPollAt: at, nextPollAt: at, incidents: [] },
    services: [{ condition: "ready", status: { service: "transcription", allowance: { unit: "audio-seconds", limit: 1, reserved: 0, conservativeUsed: 0 } } }] };
  assert.equal(ownerServicesViewSchema.safeParse(oneRow).success, false, "the contract refuses this body");
  assert.equal(settle("services", { kind: "loading" }, json(200, oneRow), at).kind, "unreachable", "so does the console");
  const fixture = fixtureState("signed-in").services;
  assert.equal(fixture.kind, "ready", "the signed-in fixture is a body the contract accepts");
  assert.equal(fixture.data.services.length, 9);
  assert.match(text(render({ initialTab: "health", initialReads: fixtureState("signed-in") })), /13 of 16/);
});

test("forced colors mark the selected tab, the pressed option and the meter bars with system colors", () => {
  const css = stylesheet().replace(/\/\*[\s\S]*?\*\//g, "");
  const start = css.indexOf("@media (forced-colors: active)");
  assert.ok(start >= 0, "a forced-colors block exists");
  let depth = 0, end = css.indexOf("{", start);
  for (let i = end; i < css.length; i++) { if (css[i] === "{") depth++; if (css[i] === "}" && --depth === 0) { end = i; break; } }
  const block = css.slice(start, end + 1);
  for (const part of [".oc-tabs__indicator", ".oc-tabs__tab[aria-selected=\"true\"]", ".oc-seg__option[aria-pressed=\"true\"]", ".ui-meter-bar__track", ".ui-meter-bar__indicator"])
    assert.ok(block.includes(part), `${part} is styled in forced colors`);
  assert.match(block, /Highlight/);
  assert.match(block, /border[^;]*(CanvasText|Highlight|ButtonText)/);
});

test("the console column is 960px, DESIGN.md's width for private service utility pages", () => {
  const main = stylesheet().match(/\.oc__main\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(main, /min\(960px,\s*100%\)/);
  assert.doesNotMatch(main, /1200px/);
});

async function inChromium(body, run, contextOptions = {}) {
  assert.ok(hasBrowser, "Chromium missing in CI: the workflow installs it with npx playwright install --with-deps chromium");
  const page = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${readFileSync(path.join(root, "src/styles/global.css"), "utf8")}\n${stylesheet()}</style></head><body>${body}</body></html>`;
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext(contextOptions);
    await context.route("http://owner-console.test/**", async route => {
      const { pathname } = new URL(route.request().url());
      if (pathname === "/") return route.fulfill({ contentType: "text/html", body: page });
      try { return await route.fulfill({ body: readFileSync(path.join(root, "public", pathname)) }); } catch { return route.fulfill({ status: 404 }); }
    });
    const visit = async (width, evaluate) => {
      const tab = await context.newPage();
      await tab.setViewportSize({ width, height: 900 });
      await tab.goto("http://owner-console.test/");
      await tab.evaluate(() => document.fonts.ready);
      const result = await tab.evaluate(evaluate);
      await tab.close();
      return result;
    };
    return await run(visit);
  } finally {
    await browser.close();
  }
}

test("the Usage stat cards sit in four columns from 801px up and two below, and every number fits its card", { skip: noBrowser }, async () => {
  const widest = { ...usageBody, totals: { actualMicroUsd: 110e6, heldMicroUsd: 110e6, availableMicroUsd: 110e6 }, effectiveLimitMicroUsd: 110e6 };
  const body = render({ initialTab: "usage", initialReads: reads([["usage", json(200, widest)], ["usageDaily", json(404, {})]]) });
  await inChromium(body, async measure => {
    const columnsAt = width => measure(width, () => {
        const grid = document.querySelector("dl.oc-grid--4");
        if (!grid) return null;
        const tiles = [...grid.children].map(tile => {
          const style = getComputedStyle(tile), dd = tile.querySelector("dd"), range = document.createRange();
          range.selectNodeContents(dd);
          const room = tile.getBoundingClientRect().width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
          return { text: dd.textContent, textWidth: range.getBoundingClientRect().width, room };
        });
        return { columns: getComputedStyle(grid).gridTemplateColumns.split(" ").length, tiles };
    });
    for (const [width, columns] of [[1280, 4], [960, 4], [801, 4], [800, 2], [799, 2], [700, 2], [641, 2], [390, 2]]) {
      const result = await columnsAt(width);
      assert.ok(result, `${width}px: the Usage tab renders dl.oc-grid--4`);
      assert.equal(result.columns, columns, `${width}px column count`);
      assert.equal(result.tiles.length, 4);
      for (const tile of result.tiles) assert.ok(tile.textWidth <= tile.room, `${width}px: ${tile.text} is ${tile.textWidth}px wide in ${tile.room}px`);
    }
  });
});

const fullMonth = { ...dailyBody, month: "2026-12",
  days: Array.from({ length: 31 }, (_, i) => ({ day: `2026-12-${String(i + 1).padStart(2, "0")}`, actualMicroUsd: i === 0 ? 0 : (i % 7 + 1) * 5e5, heldMicroUsd: i === 9 ? 1e6 : 0 })), pace: { dailyPoolMicroUsd: 90e6, paceMicroUsd: 2e6 } };

test("Spend per day is as wide as the ledger card until the per-day read is ready, then makes room for the Saver card", { skip: noBrowser }, async () => {
  const stateHtml = outcome => render({ initialTab: "usage", initialReads: reads(outcome === "loading" ? [["usage", json(200, usageBody)]] : [["usage", json(200, usageBody)], ["usageDaily", outcome]]) });
  const states = [["404", stateHtml(json(404, {}))], ["unreachable", stateHtml({ kind: "network" })], ["loading", stateHtml("loading")], ["ready", usageHtml()]];
  for (const [label, html] of states) {
    await inChromium(html, async measure => {
      for (const width of [1280, 390]) {
        const m = await measure(width, () => {
          const box = element => element.getBoundingClientRect().toJSON();
          return { ledger: box(document.querySelector(".oc-stack > .oc-card")), perDay: box(document.querySelector(".oc-usage-days > .oc-card")), saver: !!document.querySelector(".oc-saver") };
        });
        if (label === "ready") {
          assert.ok(m.saver, `${width}px ${label}: the Saver card renders`);
          if (width === 1280) assert.ok(m.perDay.width < m.ledger.width, `${width}px ${label}: Spend per day shares the row, ${m.perDay.width} vs ${m.ledger.width}`);
        } else {
          assert.ok(!m.saver, `${width}px ${label}: no Saver card`);
          assert.ok(Math.abs(m.perDay.width - m.ledger.width) <= 1, `${width}px ${label}: Spend per day is ${m.perDay.width}px wide, the ledger card ${m.ledger.width}px`);
        }
      }
    });
  }
});

test("the pace line meets the top of a bar that spent exactly the pace, bars stay inside the card, and the shown day labels never touch", { skip: noBrowser }, async () => {
  const body = usageHtml(fullMonth);
  await inChromium(body, async measure => {
    for (const width of [1280, 390]) {
      const m = await measure(width, () => {
        const box = element => element.getBoundingClientRect();
        const card = box(document.querySelector(".oc-usage-days > .oc-card")), pace = box(document.querySelector(".oc-bars__pace"));
        const bars = [...document.querySelectorAll(".oc-bar")].map(bar => ({ ...box(bar).toJSON(), name: bar.getAttribute("aria-label") }));
        const labels = [...document.querySelectorAll(".oc-bars__day")].filter(label => getComputedStyle(label).visibility !== "hidden" && getComputedStyle(label).display !== "none")
          .map(label => { const range = document.createRange(); range.selectNodeContents(label); return range.getBoundingClientRect().toJSON(); });
        const main = document.querySelector(".oc__main");
        return { card: card.toJSON(), paceY: pace.bottom, bars, labels, main: [main.scrollWidth, main.clientWidth], zero: bars[0].height };
      });
      assert.equal(m.bars.length, 31, `${width}px: 31 bars`);
      assert.equal(m.zero, 0, `${width}px: day 1 is a zero-height bar`);
      const sameAsPace = m.bars.find(bar => bar.name.startsWith("Dec 4,"));
      assert.ok(Math.abs(sameAsPace.top - m.paceY) <= 1, `${width}px: Dec 4 spent $2.00, the pace; bar top ${sameAsPace.top} vs line ${m.paceY}`);
      for (const bar of m.bars) assert.ok(bar.left >= m.card.left && bar.right <= m.card.right, `${width}px: ${bar.name} inside the card`);
      assert.ok(m.main[0] <= m.main[1], `${width}px: the Usage column does not scroll sideways`);
      assert.ok(m.labels.length >= 6, `${width}px: day labels are shown`);
      const ordered = [...m.labels].sort((a, b) => a.left - b.left);
      ordered.slice(1).forEach((label, i) => assert.ok(label.left > ordered[i].right + 1, `${width}px: day labels ${i} and ${i + 1} overlap`));
    }
  });
});

function forcedColorsRules() {
  const css = stylesheet().replace(/\/\*[\s\S]*?\*\//g, "");
  const start = css.indexOf("@media (forced-colors: active)");
  let depth = 0, end = css.indexOf("{", start);
  for (let i = end; i < css.length; i++) { if (css[i] === "{") depth++; if (css[i] === "}" && --depth === 0) { end = i; break; } }
  const inner = css.slice(css.indexOf("{", start) + 1, end);
  return new Map([...inner.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => [selector.trim(), body]));
}

test("the per-day bars and pace line name their own system colors in forced colors, held is hatched, and nothing moves", () => {
  const rules = forcedColorsRules();
  const body = selector => { assert.ok(rules.has(selector), `${selector} has its own rule in forced colors`); return rules.get(selector); };
  assert.match(body(".oc-bar"), /forced-color-adjust:\s*none/);
  assert.match(body(".oc-bar::after"), /background:\s*Highlight/, "actual is the highlight color");
  assert.match(body(".oc-bar::before"), /repeating-linear-gradient\([^)]*LinkText[^)]*Canvas/, "held is hatched, so it differs from actual without hue");
  assert.match(body(".oc-bars__pace"), /border-top-color:\s*CanvasText/);
  assert.match(body(".oc-swatch[data-part=\"held\"]"), /repeating-linear-gradient/, "the legend swatch carries the same hatch");
  const css = stylesheet().replace(/\/\*[\s\S]*?\*\//g, "");
  const perDay = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, selector]) => /oc-bar|oc-chart|oc-saver|oc-usage-days/.test(selector));
  assert.ok(perDay.length > 0);
  for (const [, selector, declarations] of perDay) assert.doesNotMatch(declarations, /transition|animation/, `${selector.trim()} stays still`);
});

test("in Chromium forced colors, actual paints Highlight, held paints a hatch, and the pace line paints CanvasText", { skip: noBrowser }, async () => {
  await inChromium(usageHtml(fullMonth), async measure => {
    const m = await measure(1280, () => {
      const probe = color => { const el = document.body.appendChild(document.createElement("span")); el.style.cssText = `forced-color-adjust:none;background-color:${color};border-top:1px solid ${color}`; const out = getComputedStyle(el).backgroundColor; el.remove(); return out; };
      const held = [...document.querySelectorAll(".oc-bar")].find(bar => bar.getAttribute("aria-label").includes("held"));
      const plain = [...document.querySelectorAll(".oc-bar")].find(bar => !bar.getAttribute("aria-label").includes("held") && !bar.getAttribute("aria-label").includes("$0.00"));
      return { highlight: probe("Highlight"), canvasText: probe("CanvasText"), actual: getComputedStyle(plain, "::after").backgroundColor,
        heldImage: getComputedStyle(held, "::before").backgroundImage, pace: getComputedStyle(document.querySelector(".oc-bars__pace")).borderTopColor,
        forced: matchMedia("(forced-colors: active)").matches };
    });
    assert.ok(m.forced, "the page runs in forced colors");
    assert.equal(m.actual, m.highlight, "actual bars paint Highlight");
    assert.match(m.heldImage, /repeating-linear-gradient/, "held bars paint a hatch");
    assert.equal(m.pace, m.canvasText, "the pace line paints CanvasText");
  }, { forcedColors: "active" });
});
