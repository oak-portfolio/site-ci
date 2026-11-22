#!/usr/bin/env node
// Usage: node scripts/quality/oak-states-review.mjs [--before baseline] [--after after] [--out REVIEW.html]
// Writes artifacts/design-rework/<out>: every before shot beside its after shot, per viewport.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const root = path.resolve(import.meta.dirname, "../..");
const dir = path.join(root, "artifacts/design-rework");
const arg = (name, fallback) => { const at = process.argv.indexOf(name); return at > 0 ? process.argv[at + 1] : fallback; };
const before = arg("--before", "baseline"), after = arg("--after", "after");
const out = arg("--out", "REVIEW.html");
const manifest = label => JSON.parse(readFileSync(path.join(dir, label, "manifest.json"), "utf8"));
const labels = Object.fromEntries(JSON.parse(readFileSync(path.join(root, "src/data/dev/oak-states.json"), "utf8")).map(state => [state.id, state.label]));
const escape = text => String(text).replace(/[&<>"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);

export function pairShots(beforeShots, afterShots) {
  const key = shot => `${shot.state}@${shot.viewport}`;
  const earlier = new Map(beforeShots.map(shot => [key(shot), shot]));
  return afterShots.map(shot => ({ state: shot.state, viewport: shot.viewport, before: earlier.get(key(shot)) ?? null, after: shot }));
}

assert.deepEqual(pairShots([{ state: "a", viewport: "1x1" }], [{ state: "a", viewport: "1x1" }, { state: "b", viewport: "1x1" }]).map(pair => [pair.state, Boolean(pair.before)]),
  [["a", true], ["b", false]], "pairs match by state and viewport; new states have no before shot");

const old = manifest(before), next = manifest(after);
const pairs = pairShots(old.shots, next.shots);
const viewports = [...new Set(pairs.map(pair => pair.viewport))];
const image = (label, shot) => `${label}/${shot.file}`;
const card = pair => `<article class="pair" data-pair="${escape(pair.state)}@${escape(pair.viewport)}" data-viewport="${escape(pair.viewport)}">
  <header><h2>${escape(labels[pair.state] ?? pair.state)}</h2><code>${escape(pair.state)}</code>${pair.before?.placeholder ? `<span class="badge new">New state: the before shot is a "not designed yet" stand-in</span>` : ""}${pair.after.axe ? `<span class="badge">axe ${pair.after.axe.serious + pair.after.axe.critical}</span>` : ""}</header>
  <div class="shots">
    <figure>${pair.before ? `<a href="${image(before, pair.before)}"><img loading="lazy" src="${image(before, pair.before)}" alt="Before: ${escape(labels[pair.state] ?? pair.state)} at ${pair.viewport}"></a>` : `<div class="empty">New state, no before shot</div>`}<figcaption>Before</figcaption></figure>
    <figure><a href="${image(after, pair.after)}"><img loading="lazy" src="${image(after, pair.after)}" alt="After: ${escape(labels[pair.state] ?? pair.state)} at ${pair.viewport}"></a><figcaption>After</figcaption></figure>
  </div>
</article>`;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Oak AI Agent design rework: before and after</title>
<style>
  :root { color-scheme: dark; --bg: #050505; --panel: #111; --line: #2a2a2a; --text: #f5f5f5; --muted: #b1b1b1; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.5 system-ui, sans-serif; }
  .top { position: sticky; top: 0; z-index: 1; display: flex; flex-wrap: wrap; gap: 16px; align-items: center; padding: 16px 24px; border-bottom: 1px solid var(--line); background: rgba(5,5,5,.94); }
  h1 { margin: 0; font-size: 18px; }
  .meta { color: var(--muted); font-size: 13px; }
  fieldset { display: flex; gap: 4px; margin: 0 0 0 auto; padding: 0; border: 0; }
  legend { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  label { padding: 6px 12px; border: 1px solid var(--line); border-radius: 999px; cursor: pointer; font-size: 13px; }
  input[type=radio] { position: absolute; opacity: 0; }
  input[type=radio]:checked + label { background: var(--text); color: var(--bg); }
  input[type=radio]:focus-visible + label { outline: 2px solid var(--text); outline-offset: 2px; }
  main { display: grid; gap: 24px; padding: 24px; }
  .pair { padding: 16px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); }
  .pair header { display: flex; gap: 12px; align-items: baseline; margin-bottom: 12px; }
  .pair h2 { margin: 0; font-size: 16px; }
  code { color: var(--muted); font-size: 12px; }
  .badge { margin-left: auto; color: var(--muted); font-size: 12px; }
  .badge.new + .badge { margin-left: 12px; }
  .shots { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  figure { margin: 0; }
  img { display: block; width: 100%; height: auto; border: 1px solid var(--line); border-radius: 6px; }
  figcaption { margin-top: 6px; color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0; }
  .empty { display: grid; place-items: center; aspect-ratio: 16 / 10; border: 1px dashed var(--line); border-radius: 6px; color: var(--muted); }
  ${viewports.map((viewport, index) => `body:has(#vp-${index}:checked) .pair:not([data-viewport="${viewport}"]) { display: none; }`).join("\n  ")}
</style></head>
<body>
<div class="top">
  <h1>Oak AI Agent: before and after</h1>
  <span class="meta">${pairs.length / viewports.length} states · before ${escape(old.commit)} · after ${escape(next.commit)} · axe serious ${next.shots.reduce((sum, shot) => sum + (shot.axe ? shot.axe.serious + shot.axe.critical : 0), 0)} · ${new Set(pairs.filter(pair => pair.before?.placeholder).map(pair => pair.state)).size} states new since before</span>
  <fieldset><legend>Viewport</legend>
    ${viewports.map((viewport, index) => `<input type="radio" name="vp" id="vp-${index}"${index === 1 || viewports.length === 1 ? " checked" : ""}><label for="vp-${index}">${viewport}</label>`).join("\n    ")}
  </fieldset>
</div>
<main>
${pairs.map(card).join("\n")}
</main>
</body></html>
`;
writeFileSync(path.join(dir, out), html);
console.log(`review-pairs=${pairs.length} with-before=${pairs.filter(pair => pair.before).length} viewports=${viewports.length}`);
