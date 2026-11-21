#!/usr/bin/env node
// Q18: one HTML page for Oak's review of the latest review version. Reads artifacts/premium-round/review/v<N>/manifest.json
// and writes review.html beside it. Image paths are relative to the repo root. Serve with scripts/quality/review-server.mjs,
// which also saves Oak's per-screenshot feedback (flag, comment, attached images) to <root>/feedback/.
//
// Sitting page (ticket 21): a manifest built with review-manifest.mjs --refs has one group per behavior. Its section header holds a
// Match, Close or Gap verdict (feedback id `verdict:<built 1280 cell>`), each cell has a Seen mark (`seen:<cell>`, holding the cell's
// image revision so a changed cell is unseen again), the lightbox adds a compare strip (built 1280, built 390, concept, prototype,
// Mobbin), New and Changed badges come from the manifest, and groups rank open flags first, then New, Changed and unchanged.
//
// --publish   Also copies the version folder and every capture folder its manifest references into the folder the
//             review server serves (default ~/.cache/oak-review, served on 127.0.0.1:4399 by review-server.mjs), then
//             fetches review.html and every image it references. Exits 1 unless all return 200. RETRO: a review page was
//             reported ready while Oak got "not found" three times.
//             Options: --cache-dir DIR, --base-url URL (default http://127.0.0.1:4399), --repo-root DIR (tests).
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const option = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const repo = option("--repo-root") ? path.resolve(option("--repo-root")) : fileURLToPath(new URL("../../", import.meta.url));
const root = path.join(repo, "artifacts/premium-round/review");
const version = option("--version") ?? readdirSync(root).filter(n => /^v\d+$/.test(n)).sort((a, b) => a.slice(1) - b.slice(1)).at(-1);
const dir = path.join(root, version);
const manifest = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8"));
// A capture path is repo-relative; one recorded from another checkout (a worktree run) keeps its artifacts/ tail.
const repoRelative = capture => {
  const inside = path.relative(repo, capture);
  if (!inside.startsWith("..")) return inside;
  const tail = capture.indexOf(`${path.sep}artifacts${path.sep}`);
  return tail >= 0 ? capture.slice(tail + 1) : inside;
};
const rel = capture => "/" + repoRelative(capture).split(path.sep).map(encodeURIComponent).join("/");
// Mobbin's terms forbid archiving, so a Mobbin pick is never copied. The manifest points at the file in the premium-ui cache, and the
// page reads it through a link --publish makes at this path in the served folder; a cache with no file leaves a link tile.
const mobbinLink = cell => `refs/mobbin-${cell.id.replace(/^ref:mobbin:/, "").replace(/[^\w-]+/g, "-")}${path.extname(cell.capture)}`;
const srcOf = cell => !cell.capture ? "" : cell.kind !== "mobbin" ? rel(cell.capture) : existsSync(cell.capture) ? rel(path.join(dir, mobbinLink(cell))) : "";
const groups = manifest.groups.map(group => ({ id: group.id, title: group.title, verdict: group.behavior ? `verdict:gallery:${group.behavior}@1280` : "",
  cells: group.cells.map(c => ({ id: c.id, title: c.title, status: c.status, note: c.note, viewport: c.viewport, source: c.source,
    src: srcOf(c), slot: c.slot ?? "", kind: c.kind ?? "", link: c.link ?? "", badge: c.badge ?? "", rev: c.rev ?? "" })) }));
const data = JSON.stringify({ version: manifest.version, date: manifest.date, commit: manifest.commit, worker: manifest.worker, site: manifest.site, groups, changes: manifest.changes })
  .replace(/</g, "\\u003c");

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Oak AI Agent review ${manifest.version}</title>
<style>
:root { color-scheme: dark; --bg: #0b0c0e; --panel: #15171a; --line: #2a2d33; --text: #eceef1; --muted: #9aa1ab; --pass: #6fd394; --fixed: #4b9bff; --open: #f5b942; --flag: #ff6b6b; --ref: #b69cff; --new: #5fd0d6; --changed: #ff9f6b; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.45 -apple-system, system-ui, sans-serif; }
header { position: sticky; top: 0; z-index: 5; background: rgba(11,12,14,.94); backdrop-filter: blur(8px); border-bottom: 1px solid var(--line); padding: 12px 20px; display: grid; gap: 10px; }
.top { display: flex; flex-wrap: wrap; gap: 12px 20px; align-items: baseline; }
h1 { font-size: 18px; margin: 0; }
.meta { color: var(--muted); font-size: 12px; }
.controls { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.seg { display: inline-flex; border: 1px solid var(--line); border-radius: 999px; overflow: hidden; }
.seg button { background: none; color: var(--muted); border: 0; padding: 6px 12px; font: inherit; cursor: pointer; }
.seg button[aria-pressed="true"] { background: #262a31; color: var(--text); }
select, input[type=search], .btn { background: var(--panel); color: var(--text); border: 1px solid var(--line); border-radius: 999px; padding: 6px 12px; font: inherit; }
.btn { cursor: pointer; } .btn:hover { border-color: #444a53; }
.count { color: var(--muted); font-size: 12px; margin-left: auto; }
main { display: grid; grid-template-columns: 220px 1fr; gap: 0; }
nav { position: sticky; top: 112px; align-self: start; max-height: calc(100vh - 112px); overflow: auto; padding: 16px 12px; border-right: 1px solid var(--line); }
nav a { display: flex; justify-content: space-between; gap: 8px; color: var(--muted); text-decoration: none; padding: 5px 8px; border-radius: 8px; font-size: 13px; }
nav a:hover { background: var(--panel); color: var(--text); }
nav a .n { font-variant-numeric: tabular-nums; }
section { padding: 18px 20px 6px; scroll-margin-top: 120px; }
section h2 { font-size: 15px; margin: 0 0 12px; display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; }
section h2 small { color: var(--muted); font-weight: 400; font-size: 12px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px; align-items: start; }
.card { background: var(--panel); border: 1px solid var(--line); border-radius: 14px; overflow: hidden; display: flex; flex-direction: column; }
.card[data-flagged="true"] { border-color: var(--flag); box-shadow: 0 0 0 1px var(--flag); }
.card[data-seen="true"] .thumb img { opacity: .6; }
.thumb { display: block; width: 100%; aspect-ratio: 16 / 10; object-fit: cover; object-position: top right; background: #000; cursor: zoom-in; border: 0; padding: 0; }
.card[data-viewport="390x844"] .thumb { aspect-ratio: 390 / 600; object-position: top center; }
.thumb img { width: 100%; height: 100%; object-fit: cover; object-position: inherit; display: block; }
.thumb:focus-visible { outline: 2px solid var(--fixed); outline-offset: -2px; }
.card[data-viewport="ref"] .thumb img { object-fit: contain; object-position: center; }
.thumb.tile { display: grid; place-items: center; padding: 16px; background: #101215; color: var(--muted); font: inherit; text-align: center; }
.thumb.tile b { display: block; margin-bottom: 4px; color: var(--text); text-transform: capitalize; }
.card[data-slot="off"] .thumb.tile, .card[data-status="gap"] .thumb.tile { border-bottom: 2px dashed var(--flag); }
.body { padding: 10px 12px 12px; display: grid; gap: 6px; }
.row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.pill { border-radius: 999px; padding: 1px 9px; font-size: 11px; font-weight: 600; color: #0b0c0e; }
.pill.pass { background: var(--pass); } .pill.fixed { background: var(--fixed); } .pill.open { background: var(--open); }
.pill.ref { background: var(--ref); } .pill.gap { background: var(--flag); } .pill.new { background: var(--new); } .pill.changed { background: var(--changed); }
.tag { color: var(--muted); font-size: 11px; border: 1px solid var(--line); border-radius: 999px; padding: 0 8px; }
.title { font-weight: 600; }
.id { color: var(--muted); font: 11px ui-monospace, monospace; word-break: break-all; }
.note { color: var(--muted); font-size: 12px; }
.flag { margin-left: auto; display: inline-flex; gap: 6px; align-items: center; color: var(--muted); font-size: 12px; cursor: pointer; }
.marks { margin-left: auto; display: inline-flex; gap: 12px; }
.card .link, .lb-side .link { color: #8fc2ff; font-size: 12px; }
.verdict { margin-left: auto; display: inline-flex; border: 1px solid var(--line); border-radius: 999px; overflow: hidden; }
.verdict button { background: none; color: var(--muted); border: 0; padding: 4px 12px; font: 600 12px/1.4 inherit; font-family: inherit; cursor: pointer; }
.verdict button[aria-pressed="true"] { color: #0b0c0e; }
.verdict .v-match[aria-pressed="true"] { background: var(--pass); } .verdict .v-close[aria-pressed="true"] { background: var(--open); } .verdict .v-gap[aria-pressed="true"] { background: var(--flag); }
.lb-side .verdict { margin-left: 0; align-self: flex-start; }
.lb-side .marks { margin-left: 0; display: flex; flex-wrap: wrap; }
.lb-side .markbig { display: flex; gap: 8px; align-items: center; padding: 8px 12px; border: 1px solid var(--line); border-radius: 999px; cursor: pointer; font-weight: 600; }
.lb-side .markbig:has(input:checked) { border-color: var(--pass); color: var(--pass); }
.lb-tile { max-width: 520px; padding: 28px; border: 1px dashed #3a3f47; border-radius: 14px; background: #101215; color: var(--text); font-size: 15px; line-height: 1.5; text-align: center; }
.lb-tile a { display: block; margin-top: 10px; color: #8fc2ff; }
.changes { margin: 0 20px 30px; padding: 14px 16px; background: var(--panel); border: 1px solid var(--line); border-radius: 14px; }
.changes table { width: 100%; border-collapse: collapse; font-size: 12px; } .changes td, .changes th { text-align: left; padding: 6px 8px; border-top: 1px solid var(--line); vertical-align: top; }
dialog { width: 100vw; height: 100vh; max-width: 100vw; max-height: 100vh; margin: 0; padding: 0; border: 0; background: #050506; color: var(--text); }
dialog::backdrop { background: #000; }
.lb { display: grid; grid-template-columns: 1fr 320px; grid-template-rows: 1fr auto auto; height: 100vh; }
.lb-stage { position: relative; min-width: 0; min-height: 0; display: grid; place-items: center; padding: 16px 76px; overflow: hidden; }
.lb-stage img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; border-radius: 10px; box-shadow: 0 0 0 1px var(--line); cursor: zoom-in; }
.lb-stage img[hidden] { display: none; }
.lb-stage.zoom { align-items: start; justify-items: safe center; overflow: auto; }
.lb-stage.zoom img { max-width: none; max-height: none; cursor: zoom-out; }
.lb-nav { position: absolute; top: 50%; transform: translateY(-50%); width: 48px; height: 48px; border-radius: 999px; border: 1px solid var(--line); background: rgba(21,23,26,.85); color: var(--text); font-size: 20px; cursor: pointer; }
.lb-nav:hover { background: #262a31; } .lb-nav.prev { left: 16px; } .lb-nav.next { right: 16px; }
.lb-side { grid-row: 1 / span 3; grid-column: 2; border-left: 1px solid var(--line); background: var(--panel); padding: 18px; display: flex; flex-direction: column; gap: 14px; overflow: auto; }
.lb-side .pos { color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
.lb-side h3 { margin: 0; font-size: 17px; line-height: 1.3; }
.lb-side dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; font-size: 12px; }
.lb-side dt { color: var(--muted); } .lb-side dd { margin: 0; word-break: break-word; }
.lb-side .note { font-size: 13px; line-height: 1.5; color: var(--text); background: #1b1e22; border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; }
.lb-side .actions { display: flex; gap: 8px; flex-wrap: wrap; }
.lb-side .flagbig { display: flex; gap: 8px; align-items: center; padding: 10px 12px; border: 1px solid var(--line); border-radius: 999px; cursor: pointer; font-weight: 600; }
.lb-side .flagbig:has(input:checked) { border-color: var(--flag); color: var(--flag); }
.fb { display: grid; gap: 8px; }
.fb label.lbl { font-size: 12px; color: var(--muted); display: flex; justify-content: space-between; }
.fb textarea { width: 100%; min-height: 110px; resize: vertical; background: #1b1e22; color: var(--text); border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; font: 13px/1.5 inherit; font-family: inherit; }
.fb textarea:focus { outline: 2px solid #4b9bff; outline-offset: 1px; }
.drop { border: 1px dashed #3a3f47; border-radius: 12px; padding: 12px; text-align: center; color: var(--muted); font-size: 12px; cursor: pointer; }
.drop.over { border-color: #4b9bff; color: var(--text); background: #18222f; }
.atts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.att { position: relative; border-radius: 8px; overflow: hidden; border: 1px solid var(--line); background: #000; }
.att img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; display: block; cursor: zoom-in; }
.att button { position: absolute; top: 4px; right: 4px; width: 22px; height: 22px; border-radius: 99px; border: 0; background: rgba(0,0,0,.75); color: #fff; cursor: pointer; font-size: 12px; }
.saved { font-size: 11px; color: var(--muted); }
.badge { font-size: 11px; color: #ffd27a; border: 1px solid #5a4a24; border-radius: 999px; padding: 0 8px; }
.card[data-feedback="true"] { border-color: #6b5a2c; }
.lb-side .keys { margin-top: auto; color: var(--muted); font-size: 12px; line-height: 1.7; }
kbd { border: 1px solid var(--line); border-radius: 6px; padding: 0 6px; font: 11px ui-monospace, monospace; background: #1b1e22; }
.lb-compare { grid-column: 1; display: flex; gap: 10px; overflow-x: auto; padding: 10px 16px; border-top: 1px solid var(--line); background: #08090b; }
.lb-compare[hidden] { display: none; }
.pane { flex: 1 0 128px; max-width: 260px; display: grid; grid-template-rows: 150px auto; gap: 4px; padding: 6px; border: 2px solid transparent; border-radius: 10px; background: #000; color: var(--muted); font: inherit; cursor: pointer; }
.pane[aria-current="true"] { border-color: var(--text); color: var(--text); }
.pane:disabled { opacity: .45; cursor: default; }
.pane-media { display: grid; place-items: center; min-height: 0; overflow: hidden; border-radius: 6px; background: #101215; }
.pane-media img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
.pane-media .ctile { padding: 8px; font-size: 11px; line-height: 1.4; text-align: center; }
.pane[data-status="gap"] .pane-media { outline: 1px dashed var(--flag); outline-offset: -1px; }
.pane-cap { font-size: 11px; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lb-strip { grid-column: 1; display: flex; gap: 8px; overflow-x: auto; padding: 10px 16px 14px; border-top: 1px solid var(--line); background: #0b0c0e; }
.lb-strip button { flex: none; width: 112px; padding: 0; border: 2px solid transparent; border-radius: 8px; background: #000; cursor: pointer; overflow: hidden; position: relative; }
.lb-strip button img { width: 100%; aspect-ratio: 16 / 10; object-fit: cover; object-position: top right; display: block; opacity: .65; }
.lb-strip button[aria-current="true"] { border-color: var(--text); } .lb-strip button[aria-current="true"] img { opacity: 1; }
.lb-strip button[data-flagged="true"] { border-color: var(--flag); }
.lb-strip button .dot { position: absolute; left: 6px; bottom: 6px; width: 8px; height: 8px; border-radius: 99px; }
.lb-strip button[data-seen="true"] img { opacity: .35; }
.lb-strip button .stile { display: grid; place-items: center; width: 100%; aspect-ratio: 16 / 10; background: #101215; color: var(--muted); font-size: 10px; }
.dot.pass { background: var(--pass); } .dot.fixed { background: var(--fixed); } .dot.open { background: var(--open); } .dot.ref { background: var(--ref); } .dot.gap { background: var(--flag); }
@media (max-width: 900px) {
  .lb { grid-template-columns: 1fr; grid-template-rows: minmax(0, 1fr) auto auto auto; }
  .lb-side { grid-row: auto; grid-column: 1; max-height: 30vh; }
  /* The image takes the full width; the two arrows sit under it instead of over its edges. */
  .lb-stage { padding: 8px; grid-template-columns: 1fr 1fr; grid-template-rows: minmax(0, 1fr) auto; gap: 8px; }
  .lb-stage img, .lb-tile { grid-column: 1 / -1; grid-row: 1; justify-self: center; align-self: center; }
  .lb-nav { position: static; transform: none; width: auto; height: 40px; border-radius: 10px; grid-row: 2; }
  /* All five compare panes show at once, three then two, so the group strip below would only repeat them. */
  .lb-compare { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; overflow: visible; padding: 8px; }
  .lb-compare[hidden] { display: none; }
  .pane { min-width: 0; max-width: none; grid-template-rows: 84px auto; padding: 4px; }
  .lb-compare:not([hidden]) + .lb-strip { display: none; }
}
@media (max-width: 800px) { main { grid-template-columns: 1fr; } nav { display: none; } header { position: static; } section { scroll-margin-top: 12px; } }
</style></head><body>
<header>
  <div class="top"><h1>Oak AI Agent visual review <span id="ver"></span></h1><span class="meta" id="meta"></span></div>
  <div class="controls">
    <div class="seg" role="group" aria-label="Status"><button data-f="status" data-v="all" aria-pressed="true">All</button><button data-f="status" data-v="fixed" aria-pressed="false">Fixed</button><button data-f="status" data-v="flagged" aria-pressed="false">My feedback</button></div>
    <div class="seg" role="group" aria-label="Source"><button data-f="source" data-v="all" aria-pressed="true">Everything</button><button data-f="source" data-v="live" aria-pressed="false">Live site</button><button data-f="source" data-v="gallery" aria-pressed="false">Gallery</button><button data-f="source" data-v="ref" aria-pressed="false">References</button></div>
    <button class="btn" id="hideseen" aria-pressed="false">Hide seen</button>
    <select id="vp" aria-label="Viewport"><option value="all">All widths</option><option value="1440x900">1440</option><option value="1280x800">1280</option><option value="390x844">390 phone</option></select>
    <input id="q" type="search" placeholder="Search titles and notes" aria-label="Search">
    <button class="btn" id="copy">Copy feedback</button>
    <span class="count" id="count"></span>
  </div>
</header>
<main><nav id="nav" aria-label="Groups"></nav><div id="content"></div></main>
<dialog id="lb" aria-label="Screenshot viewer"><div class="lb">
  <div class="lb-stage" id="stage"><img id="lbimg" alt=""><div class="lb-tile" id="lbtile" hidden></div><button class="lb-nav prev" id="prev" aria-label="Previous screenshot">←</button><button class="lb-nav next" id="next" aria-label="Next screenshot">→</button></div>
  <aside class="lb-side">
    <div class="actions"><button class="btn" id="close">Close</button><button class="btn" id="prevg" aria-label="Previous group">↑ Group</button><button class="btn" id="nextg" aria-label="Next group">↓ Group</button></div>
    <div class="pos" id="lbpos"></div>
    <h3 id="lbt"></h3>
    <div class="row" id="lbtags"></div>
    <div id="lbverdict"></div>
    <div class="marks"><label class="flagbig"><input type="checkbox" id="lbflag"> Flag this screenshot to change</label><label class="markbig"><input type="checkbox" id="lbseen"> Seen</label></div>
    <div class="fb">
      <label class="lbl" for="lbcomment"><span>Your comment</span><span class="saved" id="lbsaved" role="status" aria-live="polite"></span></label>
      <textarea id="lbcomment" placeholder="What should change here? Saved as you type."></textarea>
      <div class="drop" id="drop" tabindex="0" role="button">Drop images here, paste with ⌘V, or click to choose</div>
      <input type="file" id="file" accept="image/*" multiple hidden>
      <div class="atts" id="atts"></div>
    </div>
    <dl id="lbdl"></dl>
    <div class="note" id="lbnote"></div>
    <div class="keys"><kbd>←</kbd> <kbd>→</kbd> previous or next<br><kbd>↑</kbd> <kbd>↓</kbd> previous or next group<br><kbd>F</kbd> flag &nbsp; <kbd>S</kbd> seen &nbsp; <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> verdict<br><kbd>Z</kbd> or click: actual size &nbsp; <kbd>Esc</kbd> close</div>
  </aside>
  <div class="lb-compare" id="compare" aria-label="Compare with the concept, prototype and Mobbin pick" hidden></div>
  <div class="lb-strip" id="strip" aria-label="Screenshots in this group"></div>
</div></dialog>
<script>
const D = ${data};
// Feedback is saved by review-server.mjs to feedback/feedback.json; earlier browser-only flags are moved over once.
const KEY = "oak-review-flags-" + D.version;
let fb = {};
const isFlag = id => !!(fb[id] && fb[id].flagged);
const hasFb = id => { const x = fb[id]; return !!x && (x.flagged || (x.comment || "").trim() || (x.images || []).length > 0); };
// Verdicts and seen marks live in the same feedback file under their own prefixes; they are not feedback on a cell.
const isMark = id => id.startsWith("verdict:") || id.startsWith("seen:");
const fbCount = () => Object.keys(fb).filter(id => !isMark(id) && hasFb(id)).length;
const VERDICTS = ["Match", "Close", "Gap"];
const SLOT_ORDER = ["built-1280", "built-390", "concept", "prototype", "mobbin"];
const SLOT_LABEL = { "built-1280": "Built 1280", "built-390": "Built 390", off: "Constant off", concept: "Concept", prototype: "Prototype", mobbin: "Mobbin pick" };
const BADGE_LABEL = { new: "New", changed: "Changed" };
// A seen mark stores the cell's image revision, so a cell that changed since Oak looked is unseen again.
const revOf = c => c.rev || D.version;
const isSeen = c => !!fb["seen:" + c.id] && fb["seen:" + c.id].comment === revOf(c);
const seenCount = () => D.groups.reduce((n, g) => n + g.cells.filter(isSeen).length, 0);
const verdictOf = g => (g.verdict && fb[g.verdict] && fb[g.verdict].comment) || "";
// Open flags first, then New, Changed, unchanged. A seen cell sinks below the unseen of its rank; a flag always stays on top.
const rank = c => (isFlag(c.id) || c.status === "open") ? 0 : c.badge === "new" ? 1 : c.badge === "changed" ? 2 : 3;
const weight = c => { const r = rank(c); return r && isSeen(c) ? r + 3 : r; };
const timers = {};
function setSaved(text) { const el = document.querySelector("#lbsaved"); if (el) el.textContent = text; }
function put(id, now) {
  clearTimeout(timers[id]); setSaved("Saving…");
  timers[id] = setTimeout(async () => {
    try {
      const r = await fetch("/api/feedback/" + encodeURIComponent(id), { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(fb[id] || {}) });
      setSaved(r.ok ? "Saved" : "Not saved (" + r.status + ")");
    } catch { setSaved("Not saved: server offline"); }
  }, now ? 0 : 450);
}
const entry = id => (fb[id] = fb[id] || { comment: "", flagged: false, images: [] });
const f = { status: "all", source: "all", vp: "all", q: "", hideSeen: false };
const $ = s => document.querySelector(s);
$("#ver").textContent = D.version;
$("#meta").textContent = D.date + " · commit " + D.commit + " · Worker " + D.worker + " · site " + D.site;
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
// A reference or a named gap has no browser width, so the width filter leaves it in its behavior group.
const visible = c => (f.status === "all" || (f.status === "flagged" ? hasFb(c.id) : c.status === f.status)) &&
  (f.source === "all" || c.source === f.source) && (f.vp === "all" || c.source === "ref" || c.viewport === f.vp) &&
  (!f.hideSeen || !isSeen(c)) && (!f.q || (c.title + " " + c.note + " " + c.id).toLowerCase().includes(f.q));
for (const g of D.groups) for (const c of g.cells) c.group = g;
const byId = Object.fromEntries(D.groups.flatMap(g => g.cells).map(c => [c.id, c]));
// startsWith, not a regex: this script lives in a template literal, where \/ collapses to / and a regex here became a comment.
const safeLink = url => String(url || "").startsWith("https://") ? url : "";
const linkHtml = c => safeLink(c.link) ? '<a class="link" href="' + esc(c.link) + '" target="_blank" rel="noopener noreferrer">Open on Mobbin ↗</a>' : "";
const verdictHtml = g => g.verdict ? '<span class="verdict" role="group" aria-label="Verdict for ' + esc(g.title) + '">' +
  VERDICTS.map(v => '<button class="v-' + v.toLowerCase() + '" data-verdict="' + v + '" data-g="' + g.id + '" aria-pressed="' + (verdictOf(g) === v) + '">' + v + '</button>').join("") + '</span>' : "";
const badgeHtml = c => c.badge ? '<span class="pill ' + c.badge + '">' + BADGE_LABEL[c.badge] + '</span>' : "";
const kindTag = c => c.source === "ref" ? c.kind : c.viewport.split("x")[0];
// A reference with no image says what it is; its own label is the card title, so the tile never repeats it.
const tileName = c => SLOT_LABEL[c.slot] || c.kind;
// What a no-image cell shows: a gap its note, a link tile its name. An accessible name has to contain the visible text.
const tileText = c => c.status === "gap" ? "Gap " + c.note : tileName(c);
let shown = [];
function render() {
  shown = []; let html = "", nav = "";
  // Groups rank by their most urgent cell; cells keep their order inside a group so a behavior always reads built, built, off, references.
  const ranked = D.groups.map(g => ({ g, cells: g.cells.filter(visible) })).filter(x => x.cells.length)
    .sort((a, b) => Math.min(...a.cells.map(weight)) - Math.min(...b.cells.map(weight)));
  for (const { g, cells } of ranked) {
    nav += '<a href="#' + g.id + '"><span>' + esc(g.title) + '</span><span class="n">' + cells.length + '</span></a>';
    html += '<section id="' + g.id + '"><h2>' + esc(g.title) + ' <small>' + g.id + ' · ' + cells.length + '</small>' + verdictHtml(g) + '</h2><div class="grid">';
    for (const c of cells) {
      const i = shown.push(c) - 1;
      const x = fb[c.id] || {}, n = (x.images || []).length;
      const media = c.src ? '<img loading="lazy" src="' + c.src + '" alt="">' : '<span><b>' + esc(c.status === "gap" ? "Gap" : tileName(c)) + '</b>' + (c.status === "gap" ? ' ' + esc(c.note) : '') + '</span>';
      html += '<article class="card" data-viewport="' + c.viewport + '" data-slot="' + c.slot + '" data-status="' + c.status + '" data-flagged="' + isFlag(c.id) + '" data-seen="' + isSeen(c) + '" data-feedback="' + hasFb(c.id) + '">' +
        '<button class="thumb' + (c.src ? '' : ' tile') + '" data-i="' + i + '" aria-label="' + esc(c.src ? "Open " + c.title : tileText(c) + ", open " + c.title) + '">' + media + '</button>' +
        '<div class="body"><div class="row"><span class="pill ' + c.status + '">' + c.status + '</span>' + badgeHtml(c) + '<span class="tag">' + esc(kindTag(c)) + '</span>' + (c.source === "ref" ? '' : '<span class="tag">' + c.source + '</span>') +
        ((x.comment || "").trim() ? '<span class="badge">comment</span>' : '') + (n ? '<span class="badge">' + n + (n === 1 ? ' image' : ' images') + '</span>' : '') +
        '<span class="marks"><label class="flag"><input type="checkbox" data-flag="' + esc(c.id) + '"' + (isFlag(c.id) ? " checked" : "") + '> Flag</label>' +
        '<label class="flag"><input type="checkbox" data-seen="' + esc(c.id) + '"' + (isSeen(c) ? " checked" : "") + '> Seen</label></span></div>' +
        '<div class="title">' + esc(c.title) + '</div><div class="id">' + esc(c.id) + '</div>' + linkHtml(c) +
        (c.status === "open" || c.status === "fixed" || c.source === "live" ? '<div class="note">' + esc(c.note) + '</div>' : '') + '</div></article>';
    }
    html += '</div></section>';
  }
  if (D.changes.length) html += '<div class="changes"><h2 style="font-size:15px;margin:0 0 8px">Changes since the last version</h2><table><tr><th>Finding</th><th>Cell</th><th>Commit</th></tr>' +
    D.changes.map(c => '<tr><td>' + esc(c.finding) + '</td><td class="id">' + esc(c.cell) + '</td><td>' + esc(c.commit) + '</td></tr>').join("") + '</table></div>';
  $("#content").innerHTML = html || '<p style="padding:20px;color:var(--muted)">Nothing matches these filters.</p>';
  $("#nav").innerHTML = nav;
  const total = D.groups.reduce((n, g) => n + g.cells.length, 0);
  $("#count").textContent = shown.length + " of " + total + " shown · " + fbCount() + " with feedback · " + seenCount() + " seen";
}
function setFlag(id, on) { entry(id).flagged = on; put(id, true); }
function setMark(id, comment) {
  if (comment) fb[id] = { comment, flagged: false, images: [] }; else delete fb[id];
  put(id, true);
}
function setSeen(c, on) {
  setMark("seen:" + c.id, on ? revOf(c) : "");
  for (const card of document.querySelectorAll(".card")) if (card.querySelector('[data-seen="' + c.id + '"]')) card.dataset.seen = String(on);
  if (f.hideSeen && !$("#lb").open) render();
}
function setVerdict(g, value) {
  setMark(g.verdict, verdictOf(g) === value ? "" : value);
  for (const b of document.querySelectorAll('[data-verdict][data-g="' + g.id + '"]')) b.setAttribute("aria-pressed", String(verdictOf(g) === b.dataset.verdict));
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-f]");
  if (b) { f[b.dataset.f] = b.dataset.v; for (const x of b.parentElement.children) x.setAttribute("aria-pressed", String(x === b)); render(); return; }
  const v = e.target.closest("[data-verdict]"); if (v) { setVerdict(D.groups.find(g => g.id === v.dataset.g), v.dataset.verdict); return; }
  const t = e.target.closest(".thumb"); if (t) open(Number(t.dataset.i));
});
document.addEventListener("change", e => {
  if (e.target.dataset.flag) { setFlag(e.target.dataset.flag, e.target.checked); const card = e.target.closest(".card"); card.dataset.flagged = String(e.target.checked); card.dataset.feedback = String(hasFb(e.target.dataset.flag)); }
  if (e.target.dataset.seen) setSeen(byId[e.target.dataset.seen], e.target.checked);
});
$("#hideseen").addEventListener("click", e => { f.hideSeen = !f.hideSeen; e.currentTarget.setAttribute("aria-pressed", String(f.hideSeen)); render(); });
$("#vp").addEventListener("change", e => { f.vp = e.target.value; render(); });
$("#q").addEventListener("input", e => { f.q = e.target.value.trim().toLowerCase(); render(); });
$("#copy").addEventListener("click", async () => {
  let text = "signed off";
  try { text = await (await fetch("/api/feedback.md")).text(); } catch {}
  try { await navigator.clipboard.writeText(text); $("#copy").textContent = fbCount() ? "Copied " + fbCount() + " items" : "Copied: signed off"; }
  catch { prompt("Copy this:", text); }
  setTimeout(() => $("#copy").textContent = "Copy feedback", 2000);
});
let cur = 0, opener = null;
const inGroup = g => shown.filter(c => c.group === g);
function strip() {
  const c = shown[cur], items = inGroup(c.group);
  $("#strip").innerHTML = items.map(x => '<button data-j="' + shown.indexOf(x) + '" aria-current="' + (x === c) + '" data-flagged="' + (isFlag(x.id) || hasFb(x.id)) + '" data-seen="' + isSeen(x) + '" title="' + esc(x.title + " · " + kindTag(x)) + '">' +
    (x.src ? '<img loading="lazy" src="' + x.src + '" alt="">' : '<span class="stile">' + esc(x.status === "gap" ? "gap" : x.kind) + '</span>') + '<span class="dot ' + x.status + '"></span></button>').join("");
  $("#strip").querySelector('[aria-current="true"]')?.scrollIntoView({ block: "nearest", inline: "center" });
}
// The compare strip: the behavior's built 1280, built 390, concept, prototype and Mobbin pick side by side. A pane the current filters hide stays visible but cannot be opened.
function compare() {
  const c = shown[cur], box = $("#compare");
  box.hidden = !c.group.verdict;
  if (box.hidden) { box.innerHTML = ""; return; }
  const panes = c.group.cells.filter(x => SLOT_ORDER.includes(x.slot)).sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));
  box.innerHTML = panes.map(x => {
    const j = shown.indexOf(x), name = SLOT_LABEL[x.slot] + (x.status === "gap" ? ": gap" : "");
    return '<button class="pane" data-j="' + j + '"' + (j < 0 ? " disabled" : "") + ' aria-current="' + (x === c) + '" data-status="' + x.status + '" aria-label="' + esc(x.src ? name + ", " + x.title : (x.status === "gap" ? x.note : x.title) + " " + name) + '">' +
      '<span class="pane-media">' + (x.src ? '<img src="' + x.src + '" alt="">' : '<span class="ctile">' + esc(x.status === "gap" ? x.note : x.title) + '</span>') + '</span> ' +
      '<span class="pane-cap">' + esc(name) + '</span></button>';
  }).join("");
}
function open(i) {
  cur = (i + shown.length) % shown.length; const c = shown[cur], items = inGroup(c.group);
  $("#stage").classList.remove("zoom"); $("#stage").scrollTo(0, 0);
  $("#lbimg").hidden = !c.src; $("#lbtile").hidden = !!c.src;
  if (c.src) { $("#lbimg").src = c.src; $("#lbimg").alt = c.title; }
  else $("#lbtile").innerHTML = esc(c.status === "gap" ? c.note : tileName(c)) + linkHtml(c);
  $("#lbpos").textContent = (cur + 1) + " of " + shown.length + " · " + (items.indexOf(c) + 1) + " of " + items.length + " in " + c.group.title;
  $("#lbt").textContent = c.title;
  $("#lbtags").innerHTML = '<span class="pill ' + c.status + '">' + c.status + '</span>' + badgeHtml(c) + (c.source === "ref" ? '<span class="tag">' + esc(c.kind) + '</span>' :
    '<span class="tag">' + c.viewport.split("x")[0] + ' wide</span><span class="tag">' + (c.source === "live" ? "live site" : "gallery") + '</span>');
  $("#lbverdict").innerHTML = verdictHtml(c.group);
  $("#lbdl").innerHTML = '<dt>Cell</dt><dd class="id">' + esc(c.id) + '</dd><dt>Group</dt><dd>' + esc(c.group.title) + '</dd><dt>Viewport</dt><dd>' + (c.source === "ref" ? "reference" : c.viewport) + '</dd>' +
    (D.changes.some(x => x.cell === c.id) ? '<dt>Change</dt><dd>' + esc(D.changes.find(x => x.cell === c.id).finding) + ' (' + esc(D.changes.find(x => x.cell === c.id).commit) + ')</dd>' : '');
  $("#lbnote").textContent = c.note;
  $("#lbflag").checked = isFlag(c.id);
  $("#lbseen").checked = isSeen(c);
  $("#lbcomment").value = (fb[c.id] && fb[c.id].comment) || "";
  setSaved(hasFb(c.id) ? "Saved" : "");
  atts();
  strip();
  compare();
  if (!$("#lb").open) { opener = c; $("#lb").showModal(); }
}
function atts() {
  const id = shown[cur].id, list = (fb[id] && fb[id].images) || [];
  $("#atts").innerHTML = list.map(name => '<div class="att"><a href="/feedback/images/' + encodeURIComponent(name) + '" target="_blank" rel="noopener"><img src="/feedback/images/' + encodeURIComponent(name) + '" alt="Attached image"></a><button data-rm="' + esc(name) + '" aria-label="Remove image">×</button></div>').join("");
}
async function upload(files) {
  const id = shown[cur].id;
  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;
    setSaved("Uploading…");
    const ext = (file.type.split("/")[1] || "png").replace("jpeg", "jpg");
    try {
      const r = await fetch("/api/feedback-image?cell=" + encodeURIComponent(id) + "&ext=" + ext, { method: "POST", body: file });
      if (!r.ok) { setSaved("Upload failed (" + r.status + ")"); continue; }
      const { file: name } = await r.json();
      entry(id).images.push(name);
    } catch { setSaved("Upload failed: server offline"); }
  }
  atts(); strip(); put(id, true);
}
$("#lbcomment").addEventListener("input", e => { const id = shown[cur].id; entry(id).comment = e.target.value; put(id); });
$("#drop").onclick = () => $("#file").click();
$("#drop").onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("#file").click(); } };
$("#file").onchange = e => { upload([...e.target.files]); e.target.value = ""; };
for (const t of ["dragenter", "dragover"]) $("#lb").addEventListener(t, e => { if ([...(e.dataTransfer?.types || [])].includes("Files")) { e.preventDefault(); $("#drop").classList.add("over"); } });
$("#lb").addEventListener("dragleave", e => { if (!e.relatedTarget) $("#drop").classList.remove("over"); });
$("#lb").addEventListener("drop", e => { e.preventDefault(); $("#drop").classList.remove("over"); upload([...(e.dataTransfer?.files || [])]); });
document.addEventListener("paste", e => {
  if (!$("#lb").open) return;
  const files = [...(e.clipboardData?.items || [])].filter(i => i.type.startsWith("image/")).map(i => i.getAsFile()).filter(Boolean);
  if (files.length) { e.preventDefault(); upload(files); }
});
$("#atts").onclick = e => {
  const b = e.target.closest("[data-rm]"); if (!b) return;
  const id = shown[cur].id; entry(id).images = entry(id).images.filter(n => n !== b.dataset.rm); atts(); strip(); put(id, true);
};
function jumpGroup(step) {
  const gs = [...new Set(shown.map(c => c.group))], gi = gs.indexOf(shown[cur].group);
  open(shown.indexOf(inGroup(gs[(gi + step + gs.length) % gs.length])[0]));
}
$("#prev").onclick = () => open(cur - 1); $("#next").onclick = () => open(cur + 1); $("#close").onclick = () => $("#lb").close();
$("#prevg").onclick = () => jumpGroup(-1); $("#nextg").onclick = () => jumpGroup(1);
$("#lbimg").onclick = () => $("#stage").classList.toggle("zoom");
$("#strip").onclick = e => { const b = e.target.closest("[data-j]"); if (b) open(Number(b.dataset.j)); };
$("#compare").onclick = e => { const b = e.target.closest("[data-j]"); if (b && !b.disabled) open(Number(b.dataset.j)); };
$("#lbflag").onchange = e => { setFlag(shown[cur].id, e.target.checked); strip(); };
$("#lbseen").onchange = e => { setSeen(shown[cur], e.target.checked); strip(); };
$("#lb").addEventListener("close", () => { render(); const i = shown.indexOf(opener); if (i >= 0) $('.thumb[data-i="' + i + '"]').focus(); });
document.addEventListener("keydown", e => {
  if (!$("#lb").open || e.metaKey || e.ctrlKey) return;
  // Typing a comment never moves between screenshots.
  if (e.target.closest && e.target.closest("textarea, input, [contenteditable]")) { if (e.key === "Escape") e.target.blur(); return; }
  const k = e.key.toLowerCase();
  if (e.key === "ArrowRight") { e.preventDefault(); open(cur + 1); } else if (e.key === "ArrowLeft") { e.preventDefault(); open(cur - 1); }
  else if (e.key === "ArrowDown") { e.preventDefault(); jumpGroup(1); } else if (e.key === "ArrowUp") { e.preventDefault(); jumpGroup(-1); }
  else if (k === "f") { $("#lbflag").checked = !$("#lbflag").checked; setFlag(shown[cur].id, $("#lbflag").checked); strip(); }
  else if (k === "s") { $("#lbseen").checked = !$("#lbseen").checked; setSeen(shown[cur], $("#lbseen").checked); strip(); }
  else if (["1", "2", "3"].includes(e.key) && shown[cur].group.verdict) { setVerdict(shown[cur].group, VERDICTS[Number(e.key) - 1]); }
  else if (k === "z") $("#stage").classList.toggle("zoom");
});
(async () => {
  try { fb = await (await fetch("/api/feedback")).json(); } catch { fb = {}; }
  const old = JSON.parse(localStorage.getItem(KEY) || "[]");
  for (const id of old) if (!isFlag(id)) { entry(id).flagged = true; put(id, true); }
  if (old.length) localStorage.removeItem(KEY);
  render();
})();
</script></body></html>
`;
writeFileSync(path.join(dir, "review.html"), html);
console.log(`wrote ${path.join(dir, "review.html")} (${groups.reduce((n, g) => n + g.cells.length, 0)} cells)`);

if (process.argv.includes("--publish")) {
  const cacheDir = path.resolve(option("--cache-dir") ?? path.join(os.homedir(), ".cache/oak-review"));
  const base = (option("--base-url") ?? "http://127.0.0.1:4399").replace(/\/$/, "");
  // The version folder plus the folder of every capture the manifest references, each kept at its repo-relative path.
  const copies = new Map([[repoRelative(dir), dir]]);
  const missing = [], picks = [];
  for (const group of manifest.groups) for (const cell of group.cells) {
    if (!cell.capture) continue; // a named gap or a link-only reference has no image to copy or fetch
    if (cell.kind === "mobbin") { picks.push(cell); continue; }
    if (!existsSync(cell.capture)) { missing.push(cell.capture); continue; }
    copies.set(repoRelative(path.dirname(cell.capture)), path.dirname(cell.capture));
  }
  for (const [to, from] of copies) {
    mkdirSync(path.join(cacheDir, to), { recursive: true });
    cpSync(from, path.join(cacheDir, to), { recursive: true, force: true });
  }
  for (const cell of picks) {
    const link = path.join(cacheDir, repoRelative(dir), mobbinLink(cell));
    mkdirSync(path.dirname(link), { recursive: true });
    rmSync(link, { force: true });
    if (existsSync(cell.capture)) symlinkSync(cell.capture, link);
  }
  const encode = p => p.split(path.sep).map(encodeURIComponent).join("/");
  const pageUrl = `${base}/${encode(repoRelative(dir))}/review.html`;
  const status = async url => { try { return (await fetch(url, { signal: AbortSignal.timeout(15000) })).status; } catch { return 0; } };
  const page = await fetch(pageUrl, { signal: AbortSignal.timeout(15000) }).catch(() => null);
  const failures = missing.map(file => `missing capture ${file}`);
  let images = [];
  if (!page || page.status !== 200) failures.push(`review.html ${page?.status ?? "unreachable"} at ${pageUrl}`);
  else {
    const embedded = /const D = (\{.*\});\n/.exec(await page.text());
    images = embedded ? [...new Set(JSON.parse(embedded[1]).groups.flatMap(g => g.cells.map(c => c.src)).filter(Boolean))] : [];
    if (!embedded) failures.push("review.html has no embedded cell data");
  }
  let ok = 0;
  for (let i = 0; i < images.length; i += 16) {
    await Promise.all(images.slice(i, i + 16).map(async src => {
      const code = await status(base + src);
      if (code === 200) ok += 1; else failures.push(`${code} ${base}${src}`);
    }));
  }
  console.log(`publish: ${copies.size} folders copied to ${cacheDir}; review.html ${page?.status ?? "unreachable"}; images ${ok}/${images.length} return 200`);
  for (const line of failures.slice(0, 10)) console.error(`publish FAIL ${line}`);
  if (failures.length) process.exitCode = 1;
}
