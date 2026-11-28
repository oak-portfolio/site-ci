#!/usr/bin/env node
/**
 * Aligns a 2x2 four-frame sprite loop so its subject stays put between frames (D138).
 *
 * Generated sheets often place the four subjects off the exact cell grid: a whole column or row sits 20 to 70 source
 * pixels off, so the CSS loop (which slides the sheet by exact halves) makes the subject hop, and a subject that crosses
 * the grid line shows a sliver in the next frame. Following the sprite-pipeline rules (one shared anchor, no rescaling):
 * the sheet is split at its real empty gutters, each frame is placed where its opaque shape best overlaps frame 1, and the
 * union of all four is centred in every cell. Pixels are moved, never resampled. The reduced-motion still is re-cut as the
 * exact top-left cell.
 *
 * Usage: node scripts/align-sprite-loop.mjs <sheet.png> [--still <still.png>] [--check]
 */
import sharp from "sharp";
import { fileURLToPath } from "node:url";

const OPAQUE = 40;
const PAD = 6;

async function load(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}
const opaque = (img, x, y) => img.data[(y * img.width + x) * 4 + 3] > OPAQUE;

/** The middle of the longest fully transparent run of lines in the central band, or null when the frames touch. */
function gutter(length, empty) {
  let best = null, start = -1;
  for (let i = Math.floor(length * 0.3); i <= Math.ceil(length * 0.7); i++) {
    if (empty(i) && i < Math.ceil(length * 0.7)) { if (start < 0) start = i; continue; }
    if (start >= 0 && (!best || i - start > best.size)) best = { at: Math.floor((start + i) / 2), size: i - start };
    start = -1;
  }
  return best?.at ?? null;
}

/** One frame cut from a region: its opaque bounding box, RGBA pixels and mask. */
function frameIn(img, x0, y0, x1, y1) {
  let minX = x1, minY = y1, maxX = -1, maxY = -1;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (opaque(img, x, y)) {
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  if (maxX < 0) throw new Error("an empty frame");
  const w = maxX - minX + 1, h = maxY - minY + 1;
  const rgba = Buffer.alloc(w * h * 4), mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const from = ((minY + y) * img.width + minX + x) * 4, to = (y * w + x) * 4;
    // Only this region's pixels: a neighbour's stray pixel inside the box is left out.
    if (minX + x >= x0 && minX + x < x1 && minY + y >= y0 && minY + y < y1) img.data.copy(rgba, to, from, from + 4);
    mask[y * w + x] = rgba[to + 3] > OPAQUE ? 1 : 0;
  }
  return { w, h, rgba, mask };
}

/** Opaque pixels two frames share when frame b sits at (ox, oy) in frame a's space, sampled every `step` pixels. */
function overlap(a, b, ox, oy, step) {
  let shared = 0;
  const y0 = Math.max(0, oy), y1 = Math.min(a.h, oy + b.h), x0 = Math.max(0, ox), x1 = Math.min(a.w, ox + b.w);
  for (let y = y0; y < y1; y += step) for (let x = x0; x < x1; x += step) shared += a.mask[y * a.w + x] & b.mask[(y - oy) * b.w + x - ox];
  return shared;
}

/** Where frame b best overlaps frame a: a coarse search around the bottom-centre guess, then a fine one. */
function bestOffset(a, b) {
  const guess = [Math.round((a.w - b.w) / 2), a.h - b.h];
  let best = { score: -1, at: guess };
  for (const [step, radius, around] of [[3, 60, null], [1, 4, "best"]]) {
    const [cx, cy] = around ? best.at : guess;
    for (let dy = -radius; dy <= radius; dy += around ? 1 : step) for (let dx = -radius; dx <= radius; dx += around ? 1 : step) {
      const score = overlap(a, b, cx + dx, cy + dy, step);
      if (score > best.score) best = { score, at: [cx + dx, cy + dy] };
    }
    if (!around) best.score = -1, best = { score: overlap(a, b, best.at[0], best.at[1], 1), at: best.at };
  }
  return best.at;
}

/** The four frames of a sheet, in loop order (top-left, top-right, bottom-left, bottom-right). */
function framesOf(img, exactGrid) {
  const half = (n) => Math.floor(n / 2);
  const rowEmpty = (y) => { for (let x = 0; x < img.width; x++) if (opaque(img, x, y)) return false; return true; };
  const split = exactGrid ? half(img.height) : gutter(img.height, rowEmpty);
  if (split === null) throw new Error("no empty row between the top and bottom frames");
  const frames = [];
  for (const [top, bottom] of [[0, split], [split, img.height]]) {
    const colEmpty = (x) => { for (let y = top; y < bottom; y++) if (opaque(img, x, y)) return false; return true; };
    const cut = exactGrid ? half(img.width) : gutter(img.width, colEmpty);
    if (cut === null) throw new Error("no empty column between two frames");
    frames.push(frameIn(img, 0, top, cut, bottom), frameIn(img, cut, top, img.width, bottom));
  }
  return frames;
}

/** How far frames 2 to 4 sit from frame 1 on the exact grid the CSS loop uses, and how many pixels touch a cell edge. */
export async function spriteLoopDrift(file) {
  const img = await load(file);
  const cw = Math.floor(img.width / 2), ch = Math.floor(img.height / 2);
  let edge = 0;
  for (const [ox, oy] of [[0, 0], [cw, 0], [0, ch], [cw, ch]]) {
    for (let x = ox; x < ox + cw; x++) edge += opaque(img, x, oy) + opaque(img, x, oy + ch - 1);
    for (let y = oy; y < oy + ch; y++) edge += opaque(img, ox, y) + opaque(img, ox + cw - 1, y);
  }
  // Frame positions in their cells, so the drift is what the visitor sees.
  const cells = [[0, 0], [cw, 0], [0, ch], [cw, ch]].map(([ox, oy]) => {
    let minX = Infinity, minY = Infinity;
    for (let y = oy; y < oy + ch; y++) for (let x = ox; x < ox + cw; x++) if (opaque(img, x, y)) { minX = Math.min(minX, x - ox); minY = Math.min(minY, y - oy); }
    return [minX, minY];
  });
  const frames = framesOf(img, true);
  let drift = 0;
  for (let k = 1; k < 4; k++) {
    const [ox, oy] = bestOffset(frames[0], frames[k]);
    // Where frame k actually sits relative to frame 1, minus where its shape says it should sit.
    drift = Math.max(drift, Math.abs(cells[k][0] - cells[0][0] - ox), Math.abs(cells[k][1] - cells[0][1] - oy));
  }
  return { drift, edge };
}

export async function alignSpriteLoop(file, still) {
  const img = await load(file);
  const frames = framesOf(img, false);
  const at = [[0, 0], ...frames.slice(1).map(frame => bestOffset(frames[0], frame))];
  const x0 = Math.min(...at.map(([x], k) => x)), y0 = Math.min(...at.map(([, y]) => y));
  const x1 = Math.max(...at.map(([x], k) => x + frames[k].w)), y1 = Math.max(...at.map(([, y], k) => y + frames[k].h));
  const cw = Math.floor(img.width / 2), ch = Math.floor(img.height / 2);
  if (x1 - x0 > cw - 2 * PAD || y1 - y0 > ch - 2 * PAD) throw new Error(`the aligned frames need ${x1 - x0}x${y1 - y0}, more than a ${cw}x${ch} cell`);
  const base = [Math.round((cw - (x1 - x0)) / 2) - x0, Math.round((ch - (y1 - y0)) / 2) - y0];
  const cells = [[0, 0], [cw, 0], [0, ch], [cw, ch]];
  const sheet = await sharp({ create: { width: img.width, height: img.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(frames.map((frame, k) => ({ input: frame.rgba, raw: { width: frame.w, height: frame.h, channels: 4 },
      left: cells[k][0] + base[0] + at[k][0], top: cells[k][1] + base[1] + at[k][1] }))).png().toBuffer();
  await sharp(sheet).toFile(file);
  if (still) await sharp(sheet).extract({ left: 0, top: 0, width: cw, height: ch }).png().toFile(still);
  return at;
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const [file, ...rest] = process.argv.slice(2);
  if (!file) { console.error("usage: node scripts/align-sprite-loop.mjs <sheet.png> [--still <still.png>] [--check]"); process.exit(2); }
  if (rest.includes("--check")) console.log(JSON.stringify(await spriteLoopDrift(file)));
  else {
    const still = rest[rest.indexOf("--still") + 1];
    console.log(JSON.stringify({ offsets: await alignSpriteLoop(file, rest.includes("--still") ? still : undefined), after: await spriteLoopDrift(file) }));
  }
}
