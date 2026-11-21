#!/usr/bin/env node
// Q18: builds artifacts/premium-round/review/v<N>/manifest.json from the capture folders, so no manifest is assembled by
// hand. Gallery cells come from the oak-states capture manifests (1440 and 1280), the 390 journey from its own capture run,
// and live cells from captures/live/<flow>-<nn>-<slug>@<width>.jpg. Findings live in v<N>/findings.json:
//   { "<cell id>": { "status": "open"|"fixed", "note": "...", "finding": "F1 ...", "commit": "abc1234", "from": "v1" } }
// A "fixed" finding with a commit becomes a `changes` row. A finding with "abandon": true stays "pass" and gets a
// `changes` row with commit "ABANDON" (not a defect, or deliberately not changed; the note says why). Every other cell is "pass".
//
// Usage: node scripts/quality/review-manifest.mjs --version v1 --worker 69f65290 --site 462d1329
//          [--gallery DIR] [--journey DIR|none] [--live DIR] [--carry DIR] [--supersedes v0] [--refs refs.json --off DIR]
// Sitting page (ticket 21): --refs refs.json switches to one group per behavior, in refs.json order. refs.json maps a built
// cell id (gallery:<state>@1280) to [{ kind: "concept"|"prototype"|"mobbin", src, link, label, gap }]. A group holds the built
// still at 1280 and at 390 from --gallery, the same state from --off (the constant off, or live today), then one cell per
// reference kind; a kind with no entry becomes a named gap cell. Concept and prototype images are copied into v<N>/refs/. A local
// `src` is resolved through symlinks and, inside a git repo, must be git-ignored. A Mobbin image must resolve into an ignored
// .premium-ui/cache/mobbin and is referenced there, never copied (Mobbin's terms forbid archiving; the cache is emptied when the
// task closes); with no file in the cache the cell is a link tile. --supersedes also marks each cell New or Changed against that version.
// R23 retro: --carry DIR[,DIR] adds the live cells this version did not re-shoot from an older live folder. Each carried cell
// is marked `carried` and its title says when it was captured, so a flag is never spent on work a later round changed.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mobbinRoots } from "./review-mobbin-roots.mjs";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const version = option("--version");
if (!/^v\d+$/.test(version ?? "")) throw new Error("--version vN is required");
const review = path.join(repo, "artifacts/premium-round/review");
const out = path.join(review, version);
const galleryDir = path.resolve(repo, option("--gallery", "artifacts/design-rework/review-v1"));
const journeyDir = path.resolve(repo, option("--journey", "artifacts/design-rework/review-v1-390"));
// R8: each version can read its own live folder, so a fresh capture set never mixes with an older one.
const liveDir = path.resolve(repo, option("--live", "artifacts/premium-round/review/captures/live"));
// Comma-separated, nearest first: a cell comes from the first folder that has it.
const carryDirs = (option("--carry") ?? "").split(",").filter(Boolean).map(dir => path.resolve(repo, dir));
const findingsFile = path.join(out, "findings.json");
const findings = existsSync(findingsFile) ? JSON.parse(readFileSync(findingsFile, "utf8")) : {};

const states = JSON.parse(readFileSync(path.join(repo, "src/data/dev/oak-states.json"), "utf8"));
const label = Object.fromEntries(states.map(state => [state.id, state.label ?? state.id]));
const WIDTH = { "1440x900": 1440, "1280x800": 1280, "390x844": 390 };
const shots = dir => JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8")).shots;
const revOf = value => createHash("sha1").update(value).digest("hex").slice(0, 10);

function cell(id, source, capture, viewport, title, carried = null) {
  const finding = findings[id];
  const base = carried ? `Carried from ${carried.from}, captured ${carried.date}, before this version's live reading.`
    : source === "live" ? "Live on steveoak.com in the in-app Browser; reviewed on the sheet." : "Gallery state; overflow and axe clean at capture; reviewed on the sheet.";
  return { id, source, capture, viewport, title: carried ? `${title} (captured ${carried.date}, carried)` : title,
    status: finding?.abandon ? "pass" : finding?.status ?? "pass", note: finding?.note ?? base, fix: finding?.commit ?? "",
    rev: existsSync(capture) ? revOf(readFileSync(capture)) : "", ...(carried ? { carried } : {}) };
}

const KINDS = { concept: "concept image", prototype: "prototype scene", mobbin: "Mobbin pick" };
const refsFile = option("--refs");

// A local reference file must exist, must not resolve into a tracked folder, and a Mobbin image must resolve into the premium-ui cache.
// Returns the resolved path, so a symlink is judged, and later read, by its target.
function checkReference(kind, file) {
  if (!existsSync(file)) throw new Error(`Reference file is missing: ${file}`);
  const real = realpathSync(file);
  const cwd = path.dirname(real);
  const inRepo = spawnSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], { stdio: "ignore" }).status === 0;
  if (inRepo && spawnSync("git", ["-C", cwd, "check-ignore", "-q", "--", real], { stdio: "ignore" }).status !== 0)
    throw new Error(`Reference path is inside a tracked folder (it must be git-ignored): ${file}`);
  if (kind === "mobbin" && !mobbinRoots(repo).some(cache => real.startsWith(cache + path.sep)))
    throw new Error(`Mobbin images come only from the ignored premium-ui cache (.premium-ui/cache/mobbin); use a link and a note otherwise: ${file}`);
  return real;
}

function referenceCells(state, title, entries) {
  for (const entry of entries) {
    if (!KINDS[entry.kind]) throw new Error(`Unknown reference kind "${entry.kind}" for ${state}; use concept, prototype or mobbin`);
    if (typeof entry.label !== "string" || !entry.label.trim()) throw new Error(`A ${entry.kind} reference for ${state} needs a label`);
    if (entry.kind === "mobbin" && entry.link && !/^https:\/\/(www\.)?mobbin\.com\//.test(entry.link)) throw new Error(`Mobbin link for ${state} must be an https://mobbin.com URL`);
    if (!entry.gap && !entry.src && !(entry.kind === "mobbin" && entry.link)) throw new Error(`A ${entry.kind} reference for ${state} needs a src${entry.kind === "mobbin" ? " or a link" : ""}`);
  }
  mkdirSync(path.join(out, "refs"), { recursive: true });
  return Object.keys(KINDS).flatMap(kind => {
    const picks = entries.filter(entry => entry.kind === kind && !entry.gap);
    if (!picks.length) {
      const note = entries.find(entry => entry.kind === kind)?.gap ?? `No ${KINDS[kind]} for ${title}. Named gap.`;
      return [{ id: `ref:${kind}:${state}`, source: "ref", slot: kind, kind, capture: "", viewport: "ref", title: `${KINDS[kind]}: gap`, status: "gap", note, fix: "", rev: revOf(note) }];
    }
    return picks.map((entry, n) => {
      let capture = "";
      const wanted = entry.src && path.resolve(repo, entry.src);
      // Mobbin's terms forbid archiving: a pick stays in the premium-ui cache and the manifest points there. A cache that no longer
      // holds the file leaves the link and the note, so the cell becomes a link tile.
      if (wanted && !(kind === "mobbin" && entry.link && !existsSync(wanted))) {
        const file = checkReference(kind, wanted);
        capture = file;
        if (kind !== "mobbin") {
          capture = path.join(out, "refs", `${kind}-${state.replace(/[^\w-]+/g, "-")}${n ? `-${n + 1}` : ""}${path.extname(file)}`);
          copyFileSync(file, capture);
        }
      }
      return { id: `ref:${kind}:${state}${n ? `-${n + 1}` : ""}`, source: "ref", slot: kind, kind, capture, viewport: "ref", title: entry.label, status: "ref",
        note: entry.note ?? `${KINDS[kind][0].toUpperCase()}${KINDS[kind].slice(1)}: ${entry.label}`, fix: "",
        ...(entry.link ? { link: entry.link } : {}), rev: capture ? revOf(readFileSync(capture)) : revOf(entry.link) };
    });
  });
}

function behaviorGroups(refs) {
  const built = shots(galleryDir);
  const offDir = option("--off") ? path.resolve(repo, option("--off")) : null;
  const off = offDir ? shots(offDir) : null;
  const find = (list, state, width) => list.find(shot => shot.state === state && shot.viewport.split("x")[0] === width);
  return Object.entries(refs).map(([key, entries]) => {
    const state = /^gallery:(.+)@1280$/.exec(key)?.[1];
    if (!state || !Array.isArray(entries)) throw new Error(`--refs key "${key}" must be a built cell id like gallery:<state>@1280 with a list of references`);
    const title = label[state] ?? state;
    const stills = ["1280", "390"].map(width => {
      const shot = find(built, state, width);
      if (!shot) throw new Error(`No ${width} shot of ${state} in ${galleryDir}`);
      return { ...cell(`gallery:${state}@${width}`, "gallery", path.join(galleryDir, shot.file), shot.viewport, `${title} at ${width}`), slot: `built-${width}` };
    });
    const shot = off && find(off, state, "1280");
    const offCells = !off ? [] : [shot
      ? { ...cell(`off:${state}@1280`, "gallery", path.join(offDir, shot.file), shot.viewport, `${title}, constant off`), slot: "off" }
      : { id: `off:${state}@1280`, source: "gallery", slot: "off", capture: "", viewport: "1280x800", title: `${title}, constant off: gap`, status: "gap",
          note: `No constant-off shot of ${state} in ${path.basename(offDir)}. Named gap.`, fix: "", rev: revOf(`off-gap:${state}`) }];
    return { id: `behavior-${state}`, title, behavior: state, cells: [...stills, ...offCells, ...referenceCells(state, title, entries)] };
  });
}

const groups = [];
if (refsFile) groups.push(...behaviorGroups(JSON.parse(readFileSync(path.resolve(repo, refsFile), "utf8"))));
// Gallery: six states per group, both widths, in oak-states order.
const galleryShots = refsFile ? [] : shots(galleryDir);
for (let i = 0; !refsFile && i < states.length; i += 6) {
  const slice = states.slice(i, i + 6);
  // R30: a state with its own viewport (phone-390) is shot once at that size.
  const cells = slice.flatMap(state => (state.viewport ? [`${state.viewport.width}x${state.viewport.height}`] : ["1440x900", "1280x800"]).map(viewport => {
    const shot = galleryShots.find(item => item.state === state.id && item.viewport === viewport);
    if (!shot) return null;
    return cell(`gallery:${state.id}@${WIDTH[viewport] ?? viewport.split("x")[0]}`, "gallery", path.join(galleryDir, shot.file), viewport, label[state.id]);
  })).filter(Boolean);
  groups.push({ id: `gallery-${String(i / 6 + 1).padStart(2, "0")}`, title: `Gallery ${slice[0].id} to ${slice.at(-1).id}`, cells });
}
// The 390 journey: one group, at most 12 cells. R18 (Oak reviews at 1280 only): `--journey none` leaves it out.
if (!refsFile && option("--journey") !== "none") {
  const journey = shots(journeyDir).filter(shot => shot.viewport === "390x844").slice(0, 12)
    .map(shot => cell(`gallery:${shot.state}@390`, "gallery", path.join(journeyDir, shot.file), "390x844", label[shot.state] ?? shot.state));
  groups.push({ id: "journey-390", title: "Phone journey at 390", cells: journey });
}
// Live: one group per flow, 1440 then 1280.
const LIVE = /^([a-z]+)-(\d{2})-([a-z0-9-]+)@(1440|1280)\.jpg$/;
const flows = new Map();
const fresh = new Set(refsFile ? [] : readdirSync(liveDir));
const seen = new Set(fresh);
const liveFiles = [...[...fresh].map(file => ({ dir: liveDir, file, carried: null })),
  ...carryDirs.flatMap(dir => readdirSync(dir).filter(file => !seen.has(file) && seen.add(file)).map(file => ({ dir, file,
    carried: { from: path.basename(dir), date: statSync(path.join(dir, file)).mtime.toISOString().slice(0, 10) } })))]
  .sort((a, b) => a.file.localeCompare(b.file));
for (const { dir, file, carried } of liveFiles) {
  const match = LIVE.exec(file);
  if (!match) continue;
  const [, flow, nn, slug, width] = match;
  const list = flows.get(flow) ?? [];
  list.push(cell(`live:${flow}/${nn}-${slug}@${width}`, "live", path.join(dir, file), width === "1440" ? "1440x900" : "1280x800",
    `${flow} ${nn} ${slug.replace(/-/g, " ")}`, carried));
  flows.set(flow, list);
}
for (const [flow, list] of flows) {
  list.sort((a, b) => Number(b.viewport.startsWith("1440")) - Number(a.viewport.startsWith("1440")) || a.id.localeCompare(b.id));
  for (let i = 0; i < list.length; i += 12)
    groups.push({ id: `live-${flow}${i ? `-${i / 12 + 1}` : ""}`, title: `Live: ${flow}`, cells: list.slice(i, i + 12) });
}

// New and Changed against the superseded version: a cell id the older manifest lacks is New, one whose image revision differs is Changed.
const supersedesFile = option("--supersedes") ? path.join(review, option("--supersedes"), "manifest.json") : null;
if (supersedesFile && existsSync(supersedesFile)) {
  const before = new Map(JSON.parse(readFileSync(supersedesFile, "utf8")).groups.flatMap(group => group.cells).map(old => [old.id, old.rev]));
  for (const item of groups.flatMap(group => group.cells)) {
    if (!before.has(item.id)) item.badge = "new";
    else if (before.get(item.id) && before.get(item.id) !== item.rev) item.badge = "changed";
  }
} else if (supersedesFile) console.log(`supersedes ${option("--supersedes")}: no manifest to compare, so no New or Changed badges`);

const changes = Object.entries(findings).filter(([, f]) => f.abandon || (f.status === "fixed" && f.commit))
  .map(([id, f]) => ({ from: f.from ?? option("--supersedes", null), cell: id, finding: f.finding ?? f.note, commit: f.abandon ? "ABANDON" : f.commit }));
const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
const manifest = { version, supersedes: option("--supersedes", null), date: new Date().toISOString().slice(0, 10), commit,
  worker: option("--worker", ""), site: option("--site", ""), groups, changes };
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
const all = groups.flatMap(group => group.cells);
console.log(`${version}: groups=${groups.length} cells=${all.length} open=${all.filter(c => c.status === "open").length} fixed=${all.filter(c => c.status === "fixed").length} carried=${all.filter(c => c.carried).length}`);
