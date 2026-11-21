import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const repo = fileURLToPath(new URL("../../../", import.meta.url));
const run = (dir, ...flags) => execFileSync(process.execPath, ["scripts/quality/review-sheets.mjs", "--dir", dir, ...flags], { encoding: "utf8" }).trim();

const freePort = () => new Promise(resolve => { const probe = createServer(); probe.listen(0, "127.0.0.1", () => { const { port } = probe.address(); probe.close(() => resolve(port)); }); });
// Starts review-server.mjs on a free port over `root`; returns the base URL and a stop function.
async function startServer(root) {
  const port = await freePort();
  const child = spawn(process.execPath, ["scripts/quality/review-server.mjs", root, String(port)], { stdio: ["ignore", "pipe", "inherit"] });
  await new Promise((resolve, reject) => { child.stdout.once("data", resolve); child.once("error", reject); child.once("exit", code => reject(new Error(`server exited ${code}`))); });
  const base = `http://127.0.0.1:${port}`;
  const put = (id, entry) => fetch(`${base}/api/feedback/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(entry) });
  return { base, put, stop: () => child.kill() };
}

async function fixture() {
  const dir = mkdtempSync(path.join(tmpdir(), "q18-review-"));
  await sharp({ create: { width: 1440, height: 900, channels: 3, background: "#203040" } }).png().toFile(path.join(dir, "a.png"));
  await sharp({ create: { width: 1280, height: 800, channels: 3, background: "#402030" } }).png().toFile(path.join(dir, "b.png"));
  const manifest = { version: "v1", supersedes: null, date: "2026-10-18", commit: "abc1234", worker: "w1", site: "s1",
    groups: [{ id: "gallery-answers", title: "Answers", cells: [
      { id: "gallery:answer-sourced@1440", source: "gallery", capture: "a.png", viewport: "1440x900", title: "Sourced answer", status: "pass", note: "Reads cleanly." },
      { id: "live:research/01-sources@1280", source: "live", capture: path.join(dir, "b.png"), viewport: "1280x800", title: "Live research", status: "open", note: "Chip clips." },
    ] }], changes: [] };
  writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  return { dir, manifest };
}

test("Q18-G1 a 2-cell manifest builds one labeled sheet and INDEX.md, and a rerun gives the same files", async () => {
  const { dir } = await fixture();
  assert.match(run(dir), /built 1 sheets/);
  const sheet = path.join(dir, "sheets", "gallery-answers.png");
  const meta = await sharp(sheet).metadata();
  assert.ok(meta.width >= 1500 && meta.height > 400, `${meta.width}x${meta.height}`);
  const index = readFileSync(path.join(dir, "INDEX.md"), "utf8");
  assert.match(index, /^# Visual review v1/);
  assert.match(index, /- Totals: 2 cells, 1 pass, 0 fixed, 1 open, in 1 groups/);
  assert.match(index, new RegExp(`Sheet: ${sheet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  assert.match(index, /\| gallery:answer-sourced@1440 \| pass \| 1440x900 \| Reads cleanly\. \| \/.*a\.png \|/);
  assert.match(index, /^## Changes since the start/m);
  const first = readFileSync(sheet), firstIndex = index;
  run(dir);
  assert.deepEqual(readFileSync(sheet), first, "the sheet is rebuilt byte for byte");
  assert.equal(readFileSync(path.join(dir, "INDEX.md"), "utf8"), firstIndex);
});

test("Q18-G1 the status, verify and coverage lines count what the CHECKs read", async () => {
  const { dir, manifest } = await fixture();
  run(dir);
  assert.equal(run(dir, "--status"), "cells=2 missing-fields=0 missing-files=0 open=1");
  assert.equal(run(dir, "--verify"), "sheets=1 groups=1 max-cells=2 index=1 changelog=1");
  assert.match(run(dir, "--coverage"), /^version=v1 gallery-missing=\d+ journey-390=0 live-groups=1$/);
  // A missing field, a missing capture and a group over 12 cells are all caught.
  manifest.groups[0].cells[0].note = "";
  manifest.groups[0].cells[1].capture = "gone.png";
  writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
  assert.equal(run(dir, "--status"), "cells=2 missing-fields=1 missing-files=1 open=1");
  manifest.groups[0].cells = Array.from({ length: 13 }, (_, i) => ({ ...manifest.groups[0].cells[0], id: `gallery:s${i}@1440`, note: "ok" }));
  writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
  assert.throws(() => run(dir), /has 13 cells/);
});

test("Q21-S1 the feedback API stores a verdict and a seen mark beside flags, and an old feedback file loads unchanged", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "q21-server-"));
  mkdirSync(path.join(root, "feedback"), { recursive: true });
  const old = { "gallery:answer-sourced@1440": { comment: "Chip clips.", flagged: true, images: ["a.png"], updatedAt: "2026-10-18T00:00:00.000Z" } };
  writeFileSync(path.join(root, "feedback", "feedback.json"), JSON.stringify(old, null, 2));
  const server = await startServer(root);
  try {
    assert.deepEqual(await (await fetch(`${server.base}/api/feedback`)).json(), old);
    assert.equal((await server.put("verdict:gallery:answer-sourced@1280", { comment: "Close" })).status, 200);
    assert.equal((await server.put("seen:live:research/01-sources@1280", { comment: "rev-1" })).status, 200);
    const stored = await (await fetch(`${server.base}/api/feedback`)).json();
    assert.equal(stored["verdict:gallery:answer-sourced@1280"].comment, "Close");
    assert.equal(stored["seen:live:research/01-sources@1280"].comment, "rev-1");
    assert.deepEqual(stored["gallery:answer-sourced@1440"], old["gallery:answer-sourced@1440"], "the old entry is untouched");
    const md = await (await fetch(`${server.base}/api/feedback.md`)).text();
    assert.match(md, /- `gallery:answer-sourced@1440` \(flagged\)\n  Chip clips\.\n/);
    assert.match(md, /verdict[^\n]*gallery:answer-sourced@1280[^\n]*Close/);
    assert.match(md, /seen[^\n]*live:research\/01-sources@1280/);
    // Clearing a mark deletes its entry.
    await server.put("seen:live:research/01-sources@1280", {});
    assert.ok(!("seen:live:research/01-sources@1280" in await (await fetch(`${server.base}/api/feedback`)).json()));
  } finally { server.stop(); }
});

test("Q21-S2 only Match, Close or Gap is accepted as a verdict, and a page with marks but no flags still reads as signed off", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "q21-server-"));
  const server = await startServer(root);
  try {
    assert.equal((await server.put("verdict:gallery:a@1280", { comment: "Maybe" })).status, 400);
    assert.equal((await server.put("verdict:gallery:a@1280", { comment: "Match" })).status, 200);
    await server.put("seen:gallery:a@1280", { comment: "rev-1" });
    const md = await (await fetch(`${server.base}/api/feedback.md`)).text();
    assert.match(md, /^signed off\n/);
    assert.match(md, /verdict[^\n]*gallery:a@1280[^\n]*Match/);
  } finally { server.stop(); }
});

test("Q21-S3 a verdict with no Match, Close or Gap is refused, and an empty entry still clears one", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "q21-server-"));
  const server = await startServer(root);
  const id = "verdict:gallery:a@1280";
  try {
    assert.equal((await server.put(id, { flagged: true })).status, 400, "a flag with no value is not a verdict");
    assert.equal((await server.put(id, { comment: "   " })).status, 400);
    assert.equal((await server.put(id, { comment: "", images: ["a.png"] })).status, 400);
    assert.ok(!(id in await (await fetch(`${server.base}/api/feedback`)).json()), "nothing was stored");
    assert.equal((await server.put(id, { comment: "Gap" })).status, 200);
    assert.equal((await server.put(id, {})).status, 200, "an empty entry clears the verdict");
    assert.ok(!(id in await (await fetch(`${server.base}/api/feedback`)).json()));
    const md = await (await fetch(`${server.base}/api/feedback.md`)).text();
    assert.ok(!/verdict `gallery:a@1280`: \n/.test(md), "feedback.md never prints a blank verdict");
  } finally { server.stop(); }
});

test("Q21-S4 the static server refuses a sibling folder and a symlink that resolves outside the review folder", async () => {
  const parent = mkdtempSync(path.join(tmpdir(), "q21-path-"));
  const root = path.join(parent, "review"), sibling = path.join(parent, "review-sibling");
  mkdirSync(root); mkdirSync(sibling);
  writeFileSync(path.join(root, "inside.txt"), "inside");
  writeFileSync(path.join(sibling, "secret.txt"), "secret");
  symlinkSync(path.join(sibling, "secret.txt"), path.join(root, "escape.txt"));
  const server = await startServer(root);
  try {
    assert.equal((await fetch(`${server.base}/inside.txt`)).status, 200);
    const siblingResponse = await fetch(`${server.base}/..%2Freview-sibling%2Fsecret.txt`);
    const linkResponse = await fetch(`${server.base}/escape.txt`);
    assert.deepEqual([siblingResponse.status, linkResponse.status], [404, 404]);
  } finally { server.stop(); rmSync(parent, { recursive: true, force: true }); }
});

test("Q21-S5 a symlink into the Mobbin cache is served, and one into a lookalike folder beside it is not", async () => {
  const cacheRoot = path.join(repo, ".premium-ui"), madeRoot = !existsSync(cacheRoot);
  const cache = path.join(cacheRoot, "cache"), name = `q21-s5-${process.pid}.png`;
  const made = [], dirOf = folder => path.join(cache, folder);
  for (const folder of ["mobbin", "mobbin-evil", "mobbin.d"]) {
    if (!existsSync(dirOf(folder))) { mkdirSync(dirOf(folder), { recursive: true }); made.push(dirOf(folder)); }
    writeFileSync(path.join(dirOf(folder), name), folder);
  }
  if (madeRoot) writeFileSync(path.join(cacheRoot, ".gitignore"), "*\n");
  const root = mkdtempSync(path.join(tmpdir(), "q21-lookalike-"));
  const links = {
    real: path.join(dirOf("mobbin"), name),
    evil: path.join(dirOf("mobbin-evil"), name),
    dotted: path.join(dirOf("mobbin.d"), name),
    hop: `${dirOf("mobbin")}/../mobbin-evil/${name}`,
  };
  for (const [label, target] of Object.entries(links)) symlinkSync(target, path.join(root, `${label}.png`));
  const server = await startServer(root);
  try {
    const status = async label => (await fetch(`${server.base}/${label}.png`)).status;
    assert.equal(await status("real"), 200);
    assert.deepEqual([await status("evil"), await status("dotted"), await status("hop")], [404, 404, 404]);
  } finally {
    server.stop(); rmSync(root, { recursive: true, force: true });
    for (const folder of ["mobbin", "mobbin-evil", "mobbin.d"]) rmSync(path.join(dirOf(folder), name), { force: true });
    for (const dir of made) rmSync(dir, { recursive: true, force: true });
    if (madeRoot) rmSync(cacheRoot, { recursive: true, force: true });
  }
});

test("Q21-S6 the server and the manifest builder take the Mobbin cache roots from one helper", () => {
  assert.ok(existsSync(path.join(repo, "scripts/quality/review-mobbin-roots.mjs")), "the shared helper exists");
  for (const file of ["scripts/quality/review-server.mjs", "scripts/quality/review-manifest.mjs"]) {
    const source = readFileSync(path.join(repo, file), "utf8");
    assert.match(source, /from "\.\/review-mobbin-roots\.mjs"/, `${file} imports the helper`);
    assert.doesNotMatch(source, /homedir\(\)/, `${file} keeps no copy of the root list`);
  }
});

test("Q21-S7 a Mobbin cache created after the server starts is served without a restart", async () => {
  const cacheRoot = path.join(repo, ".premium-ui"), madeRoot = !existsSync(cacheRoot);
  const cache = path.join(cacheRoot, "cache/mobbin"), madeCache = !existsSync(cache), name = `q21-s7-${process.pid}.png`;
  const root = mkdtempSync(path.join(tmpdir(), "q21-late-cache-"));
  const server = await startServer(root);
  try {
    mkdirSync(cache, { recursive: true });
    if (madeRoot) writeFileSync(path.join(cacheRoot, ".gitignore"), "*\n");
    writeFileSync(path.join(cache, name), "pick");
    symlinkSync(path.join(cache, name), path.join(root, "late.png"));
    assert.equal((await fetch(`${server.base}/late.png`)).status, 200);
  } finally {
    server.stop(); rmSync(root, { recursive: true, force: true });
    rmSync(path.join(cache, name), { force: true });
    if (madeRoot) rmSync(cacheRoot, { recursive: true, force: true });
    else if (madeCache) rmSync(cache, { recursive: true, force: true });
  }
});

// A sitting packet: a capture folder with both widths of two behaviors, an off folder, and the three reference kinds.
// The manifest builder writes under the repo's ignored artifacts/, so each test uses its own high version number and removes it.
let versionSeed = 900000 + (Date.now() % 90000);
const nextVersion = () => `v${versionSeed++}`;
const reviewDir = version => path.join(repo, "artifacts/premium-round/review", version);
const png = (file, background) => sharp({ create: { width: 640, height: 400, channels: 3, background } }).png().toFile(file);
async function captureFolder(root, name, states, colors) {
  const dir = path.join(root, name);
  mkdirSync(dir, { recursive: true });
  const shots = [];
  for (const state of states) for (const [viewport, color] of colors) {
    const file = `${state}-${viewport}.png`;
    await png(path.join(dir, file), color);
    shots.push({ state, viewport, file });
  }
  writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ shots }));
  return dir;
}
async function sittingFixture() {
  const root = mkdtempSync(path.join(tmpdir(), "q21-sitting-"));
  // Built stills sit under the repo's ignored artifacts/ like real captures, so --publish can copy them at their repo-relative paths.
  const captures = path.join(repo, "artifacts/premium-round/review/captures", `q21-${process.pid}-${versionSeed}`);
  const states = ["answer-sourced", "answer-points"];
  const gallery = await captureFolder(captures, "gallery", states, [["1280x800", "#203040"], ["390x844", "#304020"]]);
  const off = await captureFolder(captures, "off", ["answer-sourced"], [["1280x800", "#404040"]]);
  const concept = path.join(root, "concept.png"), prototype = path.join(root, "prototype.png");
  // The guard accepts a Mobbin image only from the real premium-ui cache, so the pick lives there and is removed with the fixture.
  const cacheRoot = path.join(repo, ".premium-ui"), madeCache = !existsSync(cacheRoot);
  const pick = path.join(cacheRoot, "cache/mobbin", `q21-${process.pid}-${versionSeed}.png`);
  mkdirSync(path.dirname(pick), { recursive: true });
  if (madeCache) writeFileSync(path.join(cacheRoot, ".gitignore"), "*\n");
  await png(concept, "#802040"); await png(prototype, "#208040"); await png(pick, "#204080");
  const refs = {
    "gallery:answer-sourced@1280": [
      { kind: "concept", src: concept, label: "Concept v10 sources" },
      { kind: "prototype", src: prototype, label: "Prototype scene 12" },
      { kind: "mobbin", link: "https://mobbin.com/screens/abc", src: pick, label: "Perplexity sources" },
    ],
    "gallery:answer-points@1280": [
      { kind: "concept", src: concept, label: "Concept v10 points" },
      { kind: "prototype", src: prototype, label: "Prototype scene 20" },
    ],
  };
  const refsFile = path.join(root, "refs.json");
  writeFileSync(refsFile, JSON.stringify(refs));
  const build = (version, extra = []) => execFileSync(process.execPath, ["scripts/quality/review-manifest.mjs", "--version", version,
    "--gallery", gallery, "--off", off, "--refs", refsFile, ...extra], { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const cleanup = (...versions) => {
    for (const version of versions) rmSync(reviewDir(version), { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true }); rmSync(captures, { recursive: true, force: true });
    rmSync(pick, { force: true });
    if (madeCache) rmSync(cacheRoot, { recursive: true, force: true });
  };
  return { root, gallery, off, refs, refsFile, concept, prototype, pick, build, cleanup };
}
const manifestOf = version => JSON.parse(readFileSync(path.join(reviewDir(version), "manifest.json"), "utf8"));

test("Q21-M1 --refs builds one group per behavior: built 1280, built 390, off, then concept, prototype and a named Mobbin gap", async () => {
  const fx = await sittingFixture(), version = nextVersion();
  try {
    fx.build(version);
    const manifest = manifestOf(version);
    assert.deepEqual(manifest.groups.map(g => g.id), ["behavior-answer-sourced", "behavior-answer-points"]);
    const [full, partial] = manifest.groups;
    assert.deepEqual(full.cells.map(c => c.slot), ["built-1280", "built-390", "off", "concept", "prototype", "mobbin"]);
    assert.deepEqual(full.cells.map(c => c.id), ["gallery:answer-sourced@1280", "gallery:answer-sourced@390", "off:answer-sourced@1280",
      "ref:concept:answer-sourced", "ref:prototype:answer-sourced", "ref:mobbin:answer-sourced"]);
    const mobbin = full.cells.at(-1);
    assert.equal(mobbin.link, "https://mobbin.com/screens/abc");
    assert.equal(mobbin.capture, realpathSync(fx.pick), "the pick is referenced where it lives, never copied into the version folder");
    // answer-points has no off shot and no Mobbin pick: the off cell and the pick are named gaps, not silently dropped.
    assert.deepEqual(partial.cells.map(c => `${c.slot}:${c.status}`), ["built-1280:pass", "built-390:pass", "off:gap", "concept:ref", "prototype:ref", "mobbin:gap"]);
    assert.match(partial.cells.at(-1).note, /No Mobbin pick/);
    assert.match(partial.cells[2].note, /^No constant-off shot of answer-points in off\. Named gap\.$/, "a gap note names the folder, never an absolute path");
    assert.ok(manifest.groups.flatMap(g => g.cells).every(c => /^[0-9a-f]{10}$/.test(c.rev)), "every cell carries a content revision");
    // The sheets tool reads the same manifest: gap cells are not missing fields or files.
    assert.match(run(reviewDir(version), "--status"), /^cells=12 missing-fields=0 missing-files=0 open=0$/);
    assert.match(run(reviewDir(version)), /built 2 sheets/);
  } finally { fx.cleanup(version); }
});

test("Q21-M2 a reference path inside a tracked folder fails the run, and a Mobbin image must come from the premium-ui cache", async () => {
  const fx = await sittingFixture(), version = nextVersion();
  const tracked = execFileSync("git", ["ls-files", "*.png"], { cwd: repo, encoding: "utf8" }).split("\n").find(Boolean);
  assert.ok(tracked, "the repo tracks at least one png");
  const rebuild = refs => { writeFileSync(fx.refsFile, JSON.stringify(refs)); return () => fx.build(version); };
  const withEntry = entry => ({ ...fx.refs, "gallery:answer-points@1280": [entry] });
  try {
    assert.throws(rebuild(withEntry({ kind: "concept", src: path.join(repo, tracked), label: "Tracked" })), /inside a tracked folder/);
    assert.throws(rebuild(withEntry({ kind: "mobbin", src: fx.concept, link: "https://mobbin.com/x", label: "Not from the cache" })), /premium-ui cache/);
    assert.throws(rebuild(withEntry({ kind: "sketch", src: fx.concept, label: "Bad kind" })), /kind/);
    assert.throws(rebuild(withEntry({ kind: "concept", src: path.join(fx.root, "missing.png"), label: "Gone" })), /missing/);
    // A Mobbin link with no image is the normal case: links and notes only.
    writeFileSync(fx.refsFile, JSON.stringify(withEntry({ kind: "mobbin", link: "https://mobbin.com/flows/y", label: "Link only" })));
    fx.build(version);
    const cell = manifestOf(version).groups[1].cells.find(c => c.slot === "mobbin");
    assert.equal(cell.status, "ref"); assert.equal(cell.link, "https://mobbin.com/flows/y"); assert.ok(!cell.capture);
  } finally { fx.cleanup(version); }
});

test("Q21-M4 a symlink is judged by where it points, so a link to a tracked file fails the run", async () => {
  const fx = await sittingFixture(), version = nextVersion();
  const tracked = execFileSync("git", ["ls-files", "*.png"], { cwd: repo, encoding: "utf8" }).split("\n").find(Boolean);
  try {
    const link = path.join(fx.root, "link.png");
    symlinkSync(path.join(repo, tracked), link);
    writeFileSync(fx.refsFile, JSON.stringify({ ...fx.refs, "gallery:answer-points@1280": [{ kind: "concept", src: link, label: "Linked" }] }));
    assert.throws(() => fx.build(version), /inside a tracked folder/);
  } finally { fx.cleanup(version); }
});

test("Q21-M5 a Mobbin image must resolve to a file under the real premium-ui cache, not under any folder named like it", async () => {
  const fx = await sittingFixture(), version = nextVersion();
  const escape = path.join(path.dirname(fx.pick), `q21-escape-${process.pid}.png`);
  const buildWith = src => { writeFileSync(fx.refsFile, JSON.stringify({ ...fx.refs, "gallery:answer-points@1280": [{ kind: "mobbin", link: "https://mobbin.com/x", src, label: "Pick" }] })); fx.build(version); };
  try {
    const lookalike = path.join(fx.root, ".premium-ui/cache/mobbin/pick.png");
    mkdirSync(path.dirname(lookalike), { recursive: true });
    await png(lookalike, "#204080");
    assert.throws(() => buildWith(lookalike), /premium-ui cache/);
    symlinkSync(fx.concept, escape);
    assert.throws(() => buildWith(escape), /premium-ui cache/, "a link inside the cache that points outside it is judged by its target");
    buildWith(fx.pick);
  } finally { rmSync(escape, { force: true }); fx.cleanup(version); }
});

test("Q21-M6 a state name cannot steer a copied reference outside v<N>/refs/", async () => {
  const fx = await sittingFixture(), version = nextVersion();
  const state = "x/../../../escaped-q21", escaped = path.join(repo, "artifacts/premium-round/review/escaped-q21.png");
  try {
    const evil = path.join(fx.root, "evil");
    mkdirSync(evil);
    for (const [viewport, file] of [["1280x800", "wide.png"], ["390x844", "narrow.png"]]) await png(path.join(evil, file), "#203040");
    writeFileSync(path.join(evil, "manifest.json"), JSON.stringify({ shots: [{ state, viewport: "1280x800", file: "wide.png" }, { state, viewport: "390x844", file: "narrow.png" }] }));
    writeFileSync(fx.refsFile, JSON.stringify({ [`gallery:${state}@1280`]: [{ kind: "concept", src: fx.concept, label: "Concept" }, { kind: "prototype", src: fx.prototype, label: "Prototype" }] }));
    execFileSync(process.execPath, ["scripts/quality/review-manifest.mjs", "--version", version, "--gallery", evil, "--refs", fx.refsFile], { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    const refs = path.join(reviewDir(version), "refs");
    const copied = manifestOf(version).groups[0].cells.filter(c => c.source === "ref" && c.capture);
    assert.equal(copied.length, 2);
    assert.ok(copied.every(c => path.dirname(c.capture) === refs), "every copy sits directly in refs/");
    assert.equal(readdirSync(refs).length, 2);
    assert.ok(!existsSync(escaped), "nothing was written beside the version folder");
  } finally { rmSync(escaped, { force: true }); fx.cleanup(version); }
});

test("Q21-M7 a Mobbin image is never copied into v<N>, its sheets or INDEX.md, and a cache with no file falls back to the link tile", async () => {
  const fx = await sittingFixture(), version = nextVersion();
  try {
    fx.build(version);
    assert.deepEqual(readdirSync(path.join(reviewDir(version), "refs")).filter(name => name.startsWith("mobbin")), [], "no Mobbin copy in refs/");
    run(reviewDir(version));
    const index = readFileSync(path.join(reviewDir(version), "INDEX.md"), "utf8");
    assert.ok(index.includes("https://mobbin.com/screens/abc") && !index.includes(fx.pick), "INDEX.md keeps the link, not the cache path");
    const mobbinCell = () => manifestOf(version).groups[0].cells.find(c => c.slot === "mobbin");
    assert.ok(mobbinCell().capture, "the first build sees the file in the cache");
    // Sheets draw a text tile for the pick, so no Mobbin pixels reach sheets/*.png: the sheet matches one built with the file gone.
    const withFile = readFileSync(path.join(reviewDir(version), "sheets", "behavior-answer-sourced.png"));
    rmSync(fx.pick);
    fx.build(version);
    assert.equal(mobbinCell().capture, "", "the cache has emptied: the pick is a link tile");
    assert.equal(mobbinCell().link, "https://mobbin.com/screens/abc");
    assert.match(run(reviewDir(version), "--status"), /missing-fields=0 missing-files=0/);
    run(reviewDir(version));
    assert.deepEqual(readFileSync(path.join(reviewDir(version), "sheets", "behavior-answer-sourced.png")), withFile);
  } finally { fx.cleanup(version); }
});

test("Q21-M3 --supersedes marks a cell New when it is absent from the older version and Changed when its image differs", async () => {
  const fx = await sittingFixture(), older = nextVersion(), newer = nextVersion();
  try {
    writeFileSync(fx.refsFile, JSON.stringify({ "gallery:answer-sourced@1280": fx.refs["gallery:answer-sourced@1280"] }));
    fx.build(older);
    await png(path.join(fx.gallery, "answer-sourced-1280x800.png"), "#ff0000");
    writeFileSync(fx.refsFile, JSON.stringify(fx.refs));
    fx.build(newer, ["--supersedes", older]);
    const badge = (group, id) => manifestOf(newer).groups.find(g => g.id === group).cells.find(c => c.id === id).badge;
    assert.equal(badge("behavior-answer-sourced", "gallery:answer-sourced@1280"), "changed");
    assert.equal(badge("behavior-answer-sourced", "gallery:answer-sourced@390"), undefined);
    assert.equal(badge("behavior-answer-points", "gallery:answer-points@1280"), "new");
    // A missing older manifest is not an error; there are just no badges.
    fx.build(older, ["--supersedes", "v899999"]);
    assert.ok(manifestOf(older).groups.flatMap(g => g.cells).every(c => !c.badge));
  } finally { fx.cleanup(older, newer); }
});

// Publishes a built version into a temp cache served by review-server, and returns the page URL.
async function publishPage(version) {
  const cacheDir = mkdtempSync(path.join(tmpdir(), "q21-cache-"));
  const server = await startServer(cacheDir);
  const publish = execFileSync(process.execPath, ["scripts/quality/review-gallery.mjs", "--version", version, "--publish", "--cache-dir", cacheDir, "--base-url", server.base],
    { cwd: repo, encoding: "utf8" });
  return { ...server, cacheDir, stop: () => { server.stop(); rmSync(cacheDir, { recursive: true, force: true }); }, publish, page: `${server.base}/artifacts/premium-round/review/${version}/review.html` };
}
const publishSitting = (fx, version) => { fx.build(version); return publishPage(version); };
const embedded = html => JSON.parse(/const D = (\{.*\});\n/.exec(html)[1]);

test("Q21-P1 --publish fetches every image of a sitting page with a 200, and the page carries every cell kind", async () => {
  const fx = await sittingFixture(), version = nextVersion();
  let site;
  try {
    site = await publishSitting(fx, version);
    // 10 cells have an image: both groups' built 1280 and 390, the off shot, three references and one more concept and prototype.
    assert.match(site.publish, /review\.html 200; images 10\/10 return 200/);
    const data = embedded(await (await fetch(site.page)).text());
    const cells = data.groups.flatMap(g => g.cells);
    assert.deepEqual([...new Set(cells.map(c => c.slot))].sort(), ["built-1280", "built-390", "concept", "mobbin", "off", "prototype"]);
    assert.deepEqual(cells.filter(c => !c.src).map(c => c.id), ["off:answer-points@1280", "ref:mobbin:answer-points"], "the two gaps have no image");
    assert.equal(data.groups[0].verdict, "verdict:gallery:answer-sourced@1280");
    assert.ok(cells.find(c => c.slot === "mobbin" && c.link).src.includes(`/${version}/refs/`));
  } finally { site?.stop(); fx.cleanup(version); }
});

test("Q21-P2 --publish links a Mobbin pick to the premium-ui cache instead of copying it, and an emptied cache leaves a link tile", async () => {
  const fx = await sittingFixture(), version = nextVersion();
  let site;
  try {
    site = await publishSitting(fx, version);
    assert.match(site.publish, /images 10\/10 return 200/, "the linked pick still answers 200");
    const link = path.join(site.cacheDir, "artifacts/premium-round/review", version, "refs/mobbin-answer-sourced.png");
    assert.ok(lstatSync(link).isSymbolicLink(), "the published pick is a link, not a file");
    assert.equal(realpathSync(link), realpathSync(fx.pick));
    const pickBytes = readFileSync(fx.pick);
    const files = readdirSync(site.cacheDir, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile()).map(entry => path.join(entry.parentPath, entry.name));
    assert.ok(files.length > 5 && files.every(file => !readFileSync(file).equals(pickBytes)), "no file in the publish cache holds the pick's bytes");

    rmSync(fx.pick);
    const again = execFileSync(process.execPath, ["scripts/quality/review-gallery.mjs", "--version", version, "--publish", "--cache-dir", site.cacheDir, "--base-url", site.base], { cwd: repo, encoding: "utf8" });
    assert.match(again, /images 9\/9 return 200/, "an emptied cache is not a failed publish");
    assert.throws(() => lstatSync(link), "the stale link is removed");
    const cell = embedded(await (await fetch(site.page)).text()).groups[0].cells.find(c => c.slot === "mobbin");
    assert.equal(cell.src, ""); assert.equal(cell.link, "https://mobbin.com/screens/abc");
  } finally { site?.stop(); fx.cleanup(version); }
});

test("Q21-B1 in the browser: groups rank open flags first, a verdict and a seen mark survive a reload, Hide seen hides, and the lightbox compares five panes", async () => {
  const fx = await sittingFixture(), older = nextVersion(), version = nextVersion();
  let site, browser;
  try {
    // The older version has only answer-sourced, whose built 1280 then changes: answer-points is New (rank 1), answer-sourced Changed (rank 2).
    writeFileSync(fx.refsFile, JSON.stringify({ "gallery:answer-sourced@1280": fx.refs["gallery:answer-sourced@1280"] }));
    fx.build(older);
    await png(path.join(fx.gallery, "answer-sourced-1280x800.png"), "#ff0000");
    writeFileSync(fx.refsFile, JSON.stringify(fx.refs));
    site = await publishSitting({ ...fx, build: (v, extra = []) => fx.build(v, ["--supersedes", older, ...extra]) }, version);
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const sections = () => page.$$eval("section", nodes => nodes.map(node => node.id));
    const saved = () => page.waitForTimeout(250).then(() => fetch(`${site.base}/api/feedback`)).then(r => r.json());
    const load = async () => { await page.goto(site.page); await page.waitForSelector("section"); };
    await load();
    assert.deepEqual(await sections(), ["behavior-answer-points", "behavior-answer-sourced"], "New outranks Changed");
    assert.deepEqual(await page.$$eval(".card .link", nodes => nodes.map(node => node.getAttribute("href"))), ["https://mobbin.com/screens/abc"], "only the Mobbin pick carries a link");
    assert.equal(await page.locator(".pill.new").count(), 6, "every cell of the new behavior carries a New badge");
    assert.equal(await page.locator(".pill.changed").count(), 1);
    await page.check('[data-flag="gallery:answer-sourced@390"]');
    await saved(); await load();
    assert.deepEqual(await sections(), ["behavior-answer-sourced", "behavior-answer-points"], "an open flag outranks New");

    // A verdict and a seen mark are stored, survive a reload, and do not count as feedback on a cell.
    await page.click('[data-g="behavior-answer-sourced"][data-verdict="Close"]');
    await page.check('[data-seen="gallery:answer-sourced@1280"]');
    const stored = await saved();
    assert.equal(stored["verdict:gallery:answer-sourced@1280"].comment, "Close");
    assert.match(stored["seen:gallery:answer-sourced@1280"].comment, /^[0-9a-f]{10}$/);
    await load();
    assert.equal(await page.getAttribute('[data-g="behavior-answer-sourced"][data-verdict="Close"]', "aria-pressed"), "true");
    assert.equal(await page.isChecked('[data-seen="gallery:answer-sourced@1280"]'), true);
    assert.match(await page.textContent("#count"), /1 with feedback · 1 seen/);
    await page.click("#hideseen");
    assert.equal(await page.locator('[data-seen="gallery:answer-sourced@1280"]').count(), 0, "a seen cell is hidden");
    await page.click("#hideseen");

    // Lightbox: five panes in order; keys set the verdict and the seen mark; a missing pick is a named gap.
    await page.click('.card:has([data-seen="gallery:answer-sourced@1280"]) .thumb');
    assert.deepEqual(await page.$$eval("#compare .pane .pane-cap", nodes => nodes.map(node => node.textContent)), ["Built 1280", "Built 390", "Concept", "Prototype", "Mobbin pick"]);
    assert.equal(await page.locator("#compare .pane[aria-current='true'] .pane-cap").textContent(), "Built 1280");
    await page.click("#compare .pane:nth-child(3)");
    assert.equal(await page.locator("#compare .pane[aria-current='true'] .pane-cap").textContent(), "Concept");
    await page.keyboard.press("3");
    await page.keyboard.press("s");
    const marks = await saved();
    assert.equal(marks["verdict:gallery:answer-sourced@1280"].comment, "Gap");
    assert.ok(marks["seen:ref:concept:answer-sourced"], "S marks the open cell seen");
    await page.keyboard.press("3");
    assert.ok(!("verdict:gallery:answer-sourced@1280" in await saved()), "pressing the chosen verdict again clears it");
    await page.keyboard.press("Escape");
    await page.click('.card:has([data-seen="gallery:answer-points@1280"]) .thumb');
    assert.equal(await page.locator("#compare .pane[data-status='gap'] .pane-cap").textContent(), "Mobbin pick: gap");
    assert.match(await page.locator("#compare .pane[data-status='gap'] .ctile").textContent(), /No Mobbin pick/);
  } finally { await browser?.close(); site?.stop(); fx.cleanup(older, version); }
});

// Builds and publishes the sitting fixture, opens its page at `viewport` and hands the page to `body`.
async function browseSitting(viewport, body, refsFor = fx => fx.refs) {
  const fx = await sittingFixture(), version = nextVersion();
  let site, browser;
  try {
    writeFileSync(fx.refsFile, JSON.stringify(refsFor(fx)));
    site = await publishSitting(fx, version);
    browser = await chromium.launch();
    const page = await (await browser.newContext({ viewport })).newPage();
    await page.goto(site.page); await page.waitForSelector("section");
    await body({ page, site, fx });
  } finally { await browser?.close(); site?.stop(); fx.cleanup(version); }
}
const openCard = (page, cell) => page.click(`.card:has([data-seen="${cell}"]) .thumb`);

test("Q21-B3 at 390 the lightbox shows all five compare panes without sideways scroll, a near full-width image and one strip", async () => {
  await browseSitting({ width: 390, height: 844 }, async ({ page }) => {
    await openCard(page, "gallery:answer-sourced@1280");
    const boxes = await page.$$eval("#compare .pane", nodes => nodes.map(node => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; }));
    assert.equal(boxes.length, 5);
    for (const box of boxes) assert.ok(box.left >= 0 && box.right <= 390 && box.top >= 0 && box.bottom <= 844, `a pane is cut off: ${JSON.stringify(box)}`);
    assert.ok(await page.locator("#compare").evaluate(node => node.scrollWidth <= node.clientWidth), "the compare strip does not scroll sideways");
    assert.equal(await page.locator("#strip").isVisible(), false, "the group strip would repeat the same cells");
    const image = await page.locator("#lbimg").boundingBox();
    assert.ok(image.width >= 390 - 24, `the main image is ${image.width}px wide`);
    for (const control of ["#close", "#prev", "#next"]) {
      const box = await page.locator(control).boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= 390 && box.y + box.height <= 844, `${control} is on screen`);
      assert.ok(box.x + box.width <= image.x || box.x >= image.x + image.width || box.y + box.height <= image.y || box.y >= image.y + image.height, `${control} sits on the image`);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  });
});

test("Q21-B6 axe finds no violation on the sitting page or its open lightbox, at 1280 and at 390", async () => {
  // The cache has no file for the first behavior's pick (a link tile) and the second behavior has none at all (a named gap).
  const refsFor = fx => ({ ...fx.refs, "gallery:answer-sourced@1280": fx.refs["gallery:answer-sourced@1280"].map(({ src, ...entry }) => entry.kind === "mobbin" ? entry : { src, ...entry }) });
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    await browseSitting(viewport, async ({ page }) => {
      const scan = async state => {
        const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice", "experimental"]).analyze();
        assert.deepEqual(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(" ")).join(", ")}`), [], `${viewport.width}px ${state}`);
      };
      await scan("page");
      await openCard(page, "gallery:answer-sourced@1280");
      await page.waitForSelector("#compare .pane");
      await scan("lightbox");
      for (const pick of ['.card[data-slot="mobbin"]:has(.link) .thumb', '.card[data-slot="mobbin"][data-status="gap"] .thumb', '.card[data-slot="off"] .thumb']) {
        await page.click("#close");
        await page.click(pick);
        await scan(`lightbox opened from ${pick}`);
      }
    }, refsFor);
  }
});

test("Q21-B4 a seen card dims only its image, so its text keeps 4.5:1 contrast", async () => {
  await browseSitting({ width: 1280, height: 800 }, async ({ page }) => {
    await page.check('[data-seen="gallery:answer-sourced@1280"]');
    const seen = await page.evaluate(() => {
      const card = document.querySelector('.card[data-seen="true"]');
      const channels = text => text.match(/[\d.]+/g).slice(0, 3).map(Number);
      const light = rgb => { const [r, g, b] = rgb.map(v => { const s = v / 255; return s <= .03928 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
      const ratio = (a, b) => { const [hi, lo] = [light(a), light(b)].sort((x, y) => y - x); return (hi + .05) / (lo + .05); };
      const fill = channels(getComputedStyle(card).backgroundColor);
      const texts = [...card.querySelectorAll(".title, .id, .tag, .flag, .note, .pill")].filter(node => node.textContent.trim());
      const faded = node => { let alpha = 1; for (let n = node; n; n = n.parentElement) alpha *= Number(getComputedStyle(n).opacity); return alpha; };
      const inner = card.querySelector(".body");
      return { count: texts.length, worstRatio: Math.min(...texts.filter(node => !node.matches(".pill")).map(node => ratio(channels(getComputedStyle(node).color), fill))),
        textOpacity: Math.min(...texts.map(faded)), cardOpacity: Number(getComputedStyle(card).opacity), thumbOpacity: Number(getComputedStyle(card.querySelector(".thumb img")).opacity), inner: !!inner };
    });
    assert.ok(seen.count >= 4, "the card has text to measure");
    assert.equal(seen.cardOpacity, 1);
    assert.equal(seen.textOpacity, 1, "no ancestor fades the text");
    assert.ok(seen.worstRatio >= 4.5, `the weakest text is ${seen.worstRatio.toFixed(2)}:1`);
    assert.ok(seen.thumbOpacity < 1, "the image still dims, so a seen card reads as done");
  });
});

test("Q21-B5 a link-only Mobbin pick shows its label once, with a Mobbin pick tile and one ref marker", async () => {
  const label = "WRITER: sources as a side panel of favicon rows";
  const refsFor = fx => ({ ...fx.refs, "gallery:answer-points@1280": [...fx.refs["gallery:answer-points@1280"], { kind: "mobbin", link: "https://mobbin.com/screens/zz", label }] });
  await browseSitting({ width: 1280, height: 800 }, async ({ page }) => {
    const card = page.locator('.card[data-slot="mobbin"]:has(.link[href$="/zz"])');
    assert.equal((await card.innerText()).split(label).length - 1, 1, "the label appears once on the card");
    assert.equal(await card.locator(".thumb.tile").textContent(), "Mobbin pick");
    assert.deepEqual(await card.locator(".tag").allTextContents(), ["mobbin"], "the ref pill is the only ref marker");
    await card.locator(".thumb").click();
    assert.equal(await page.locator("#lbt").textContent(), label);
    const tile = await page.locator("#lbtile").textContent();
    assert.ok(tile.includes("Mobbin pick") && tile.includes("Open on Mobbin") && !tile.includes(label), `the stage tile says: ${tile}`);
  }, refsFor);
});

test("Q21-B2 an old manifest and Oak's old flags and comments load and round-trip unchanged", async () => {
  const version = nextVersion();
  const captures = path.join(repo, "artifacts/premium-round/review/captures", `q21-old-${process.pid}`);
  mkdirSync(captures, { recursive: true });
  await png(path.join(captures, "a.png"), "#203040");
  mkdirSync(reviewDir(version), { recursive: true });
  writeFileSync(path.join(reviewDir(version), "manifest.json"), JSON.stringify({ version, supersedes: null, date: "2026-10-18", commit: "abc1234", worker: "w1", site: "s1",
    groups: [{ id: "gallery-answers", title: "Answers", cells: [{ id: "gallery:answer-sourced@1440", source: "gallery", capture: path.join(captures, "a.png"),
      viewport: "1440x900", title: "Sourced answer", status: "pass", note: "Reads cleanly." }] }], changes: [] }));
  let site, browser;
  try {
    site = await publishPage(version);
    assert.match(site.publish, /images 1\/1 return 200/);
    const old = { comment: "Chip clips.", flagged: true, images: [] };
    await site.put("gallery:answer-sourced@1440", old);
    const before = await (await fetch(`${site.base}/api/feedback`)).json();
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(site.page); await page.waitForSelector("section");
    assert.equal(await page.isChecked('[data-flag="gallery:answer-sourced@1440"]'), true);
    assert.equal(await page.locator(".card .badge").textContent(), "comment");
    await page.click(".thumb");
    assert.equal(await page.inputValue("#lbcomment"), "Chip clips.");
    assert.equal(await page.locator("#compare").isHidden(), true, "an old group has no compare strip");
    assert.equal(await page.locator("#lbverdict").innerHTML(), "");
    await page.keyboard.press("3");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
    assert.deepEqual(await (await fetch(`${site.base}/api/feedback`)).json(), before, "opening the page and pressing a key writes nothing");
    await page.uncheck('[data-flag="gallery:answer-sourced@1440"]');
    await page.waitForTimeout(250);
    const after = (await (await fetch(`${site.base}/api/feedback`)).json())["gallery:answer-sourced@1440"];
    assert.deepEqual({ comment: after.comment, flagged: after.flagged }, { comment: "Chip clips.", flagged: false });
  } finally { await browser?.close(); site?.stop(); rmSync(reviewDir(version), { recursive: true, force: true }); rmSync(captures, { recursive: true, force: true }); }
});

for (const [width, height] of [[1280, 800], [390, 844]]) {
  test(`Q89-F1 at ${width} Escape and the Close button leave focus on the thumb that opened it, even after arrowing away`, async () => {
    await browseSitting({ width, height }, async ({ page }) => {
      const opener = '.card:has([data-seen="gallery:answer-sourced@1280"]) .thumb';
      // dialog.close() restores focus before the page's close handler re-renders, so wait for that handler to have run.
      await page.evaluate(() => { window.__closes = 0; document.querySelector("#lb").addEventListener("close", () => window.__closes++); });
      let closes = 0;
      const onOpener = async () => { await page.waitForFunction(n => window.__closes === n, ++closes, { timeout: 2000 });
        return page.evaluate(sel => document.activeElement === document.querySelector(sel) && document.activeElement.isConnected, opener); };
      await page.focus(opener);
      await page.keyboard.press("Enter");
      await page.waitForSelector("#lb[open]");
      await page.keyboard.press("Escape");
      assert.equal(await onOpener(), true, "Escape returns focus to the thumb, not BODY");
      await page.keyboard.press("Enter");
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("Escape");
      assert.equal(await onOpener(), true, "arrowing to another screenshot still returns to the opener");
      await page.click(opener);
      await page.click("#close");
      assert.equal(await onOpener(), true, "the Close button returns focus to the thumb");
    });
  });
}

test("Q89-F2 the save note is one polite status region, its text goes through Saving and Saved, and a save never moves focus", async () => {
  await browseSitting({ width: 1280, height: 800 }, async ({ page }) => {
    const html = await (await fetch(page.url())).text();
    assert.match(html, /<span class="saved" id="lbsaved" role="status" aria-live="polite"/);
    assert.equal((html.match(/aria-live=|role="status"|role="alert"/g) || []).length, 2, "the page adds no second live region");
    await page.click('.card:has([data-seen="gallery:answer-sourced@1280"]) .thumb');
    const seen = await page.evaluate(() => { const log = []; new MutationObserver(() => log.push(document.querySelector("#lbsaved").textContent)).observe(document.querySelector("#lbsaved"), { childList: true, characterData: true, subtree: true }); window.__log = log; return log; });
    assert.deepEqual(seen, []);
    await page.focus("#lbcomment");
    await page.keyboard.type("tighter");
    await page.waitForFunction(() => document.querySelector("#lbsaved").textContent === "Saved");
    const log = await page.evaluate(() => window.__log);
    assert.ok(log.includes("Saving…") && log.includes("Saved"), `save text went through ${JSON.stringify(log)}`);
    assert.equal(await page.evaluate(() => document.activeElement.id), "lbcomment", "a save never moves focus");
    await page.route("**/api/feedback/**", route => route.fulfill({ status: 500, body: "no" }));
    await page.keyboard.type("!");
    await page.waitForFunction(() => /^Not saved/.test(document.querySelector("#lbsaved").textContent));
  });
});
