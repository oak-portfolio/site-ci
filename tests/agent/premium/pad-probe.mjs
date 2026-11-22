// Retro arch 6 (pad roles): a pure padding refactor must leave every rendered padding as it was. Run inside a gallery
// page, `padProbe` records the computed padding (top right bottom left, px) of every element and ::before/::after with
// any non-zero side, keyed by a stable DOM path (tag, first class and child index from <body>). Run from the shell, it
// opens every gallery state at 1280x800 and writes or compares a baseline:
//   node tests/agent/premium/pad-probe.mjs write .lane-scratch/pad-before.json
//   node tests/agent/premium/pad-probe.mjs compare .lane-scratch/pad-before.json
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { openState, stateIds } from "./gallery.mjs";

export const padProbe = () => {
  const step = node => {
    const cls = (node.getAttribute("class") || "").trim().split(/\s+/)[0];
    const index = node.parentElement ? [...node.parentElement.children].indexOf(node) + 1 : 1;
    return `${node.tagName.toLowerCase()}${cls ? `.${cls}` : ""}:${index}`;
  };
  const path = node => { const parts = []; for (let up = node; up && up !== document.body; up = up.parentElement) parts.unshift(step(up)); return parts.join(">"); };
  const read = style => ["Top", "Right", "Bottom", "Left"].map(side => style[`padding${side}`]).join(" ");
  const out = {};
  for (const node of document.body.querySelectorAll("*")) {
    const key = path(node);
    for (const pseudo of [null, "::before", "::after"]) {
      const style = getComputedStyle(node, pseudo);
      if (pseudo && style.content === "none") continue;
      const pad = read(style);
      if (/[1-9]/.test(pad)) out[pseudo ? key + pseudo : key] = pad;
    }
  }
  return out;
};

/** Every gallery state's padding map at 1280x800, as { state: { path: "t r b l" } }. */
export const padBaseline = async (page, ids = stateIds(), settle = 400) => {
  const all = {};
  for (const id of ids) { await openState(page, id, { settle }); all[id] = await page.evaluate(padProbe); }
  return all;
};

/** Differences between two baselines: a missing, added or changed padding per state and path. */
export const padDiff = (before, after) => {
  const out = [];
  for (const state of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const a = before[state] ?? {}, b = after[state] ?? {};
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) if (a[key] !== b[key]) out.push(`${state} ${key}: ${a[key] ?? "none"} -> ${b[key] ?? "none"}`);
  }
  return out;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [mode, file] = process.argv.slice(2);
  if (!["write", "compare"].includes(mode) || !file) { console.error("usage: pad-probe.mjs write|compare <baseline.json>"); process.exit(2); }
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const now = await padBaseline(page);
    const states = Object.keys(now).length, entries = Object.values(now).reduce((sum, map) => sum + Object.keys(map).length, 0);
    if (mode === "write") { writeFileSync(file, JSON.stringify(now, null, 1)); console.log(`wrote ${file}: states=${states} padded=${entries}`); }
    else {
      const diff = padDiff(JSON.parse(readFileSync(file, "utf8")), now);
      console.log(`compared ${file}: states=${states} padded=${entries} differences=${diff.length}`);
      for (const line of diff.slice(0, 200)) console.log(line);
      process.exitCode = diff.length ? 1 : 0;
    }
  } finally { await browser.close(); }
}
