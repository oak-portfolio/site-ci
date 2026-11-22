#!/usr/bin/env node
// Q18: the final bulk visual review. Reads artifacts/premium-round/review/v<N>/manifest.json (latest unless --version or
// --dir) and writes one labeled sheet per group (sheets/<group>.png) and INDEX.md beside it. Rerunnable: the same manifest
// gives the same files. --coverage, --status and --verify print one line each for the premium-round CHECKs.
//
// Manifest: { version, supersedes, date, commit, worker, site, groups: [{ id, title, cells: [{ id, source: "gallery"|"live",
//   capture, viewport, title, status: "pass"|"fixed"|"open"|"ref"|"gap", note, fix, slot?, kind?, link?, rev?, badge?: "new"|"changed" }] }],
//   changes: [{ from, cell, finding, commit }] }
// Sitting page cells (review-manifest.mjs --refs): a "ref" cell is a concept, prototype or Mobbin reference and a "gap" cell is a named
// missing one. A gap, or a reference that is only a link, has no capture and gets a labelled tile instead of an image.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, writeSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const reviewRoot = path.join(repo, "artifacts/premium-round/review");
const MAX_CELLS = 12, COLUMNS = 3, CELL_WIDTH = 520, LABEL_HEIGHT = 64, HEADER_HEIGHT = 72, GAP = 16;
const FIELDS = ["id", "source", "capture", "viewport", "title", "status", "note"];
const STATUS_COLOR = { pass: "#6fd394", fixed: "#4b9bff", open: "#f5b942", ref: "#b69cff", gap: "#ff6b6b" };

const args = process.argv.slice(2);
const flag = name => args.includes(name);
const option = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
if (flag("--help")) {
  process.stdout.write("Usage: node scripts/quality/review-sheets.mjs [--dir DIR | --version vN] [--coverage | --status | --verify]\n" +
    "Without a mode it builds sheets/<group>.png and INDEX.md from DIR/manifest.json.\n");
  process.exit(0);
}

function versionDir() {
  if (option("--dir")) return path.resolve(option("--dir"));
  if (option("--version")) return path.join(reviewRoot, option("--version"));
  const versions = existsSync(reviewRoot) ? readdirSync(reviewRoot).filter(name => /^v\d+$/.test(name)).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))) : [];
  if (!versions.length) throw new Error(`No review version under ${reviewRoot}`);
  return path.join(reviewRoot, versions.at(-1));
}

const dir = versionDir();
const manifest = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8"));
const cells = manifest.groups.flatMap(group => group.cells.map(cell => ({ ...cell, group: group.id })));
const captureOf = cell => path.isAbsolute(cell.capture) ? cell.capture : path.join(dir, cell.capture);
// A Mobbin pick never reaches a sheet (Mobbin's terms forbid archiving), so it is drawn as a text tile whether or not the cache holds it.
const imageless = cell => (!cell.capture || cell.kind === "mobbin") && (cell.status === "gap" || cell.source === "ref");
const escapeXml = value => String(value ?? "").replace(/[<>&"']/g, char => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[char]);
const clip = (value, max) => { const text = String(value ?? ""); return text.length > max ? `${text.slice(0, max - 1)}…` : text; };

if (flag("--coverage")) {
  const states = JSON.parse(readFileSync(path.join(repo, "src/data/dev/oak-states.json"), "utf8")).map(state => state.id);
  const have = new Set(cells.filter(cell => cell.source === "gallery").map(cell => cell.id));
  const missing = states.filter(state => !have.has(`gallery:${state}@1440`) || !have.has(`gallery:${state}@1280`)).length;
  const journey = cells.filter(cell => cell.source === "gallery" && cell.group.startsWith("journey-390")).length;
  const live = new Set(cells.filter(cell => cell.source === "live").map(cell => cell.group)).size;
  console.log(`version=${manifest.version} gallery-missing=${missing} journey-390=${journey} live-groups=${live}`);
  process.exit(0);
}

if (flag("--status")) {
  const missingFields = cells.filter(cell => FIELDS.some(field => (field === "capture" && imageless(cell)) ? false : typeof cell[field] !== "string" || !cell[field].trim())).length;
  const missingFiles = cells.filter(cell => !imageless(cell) && !existsSync(captureOf(cell))).length;
  const open = cells.filter(cell => cell.status === "open").length;
  console.log(`cells=${cells.length} missing-fields=${missingFields} missing-files=${missingFiles} open=${open}`);
  process.exit(0);
}

// RETRO Q24 round 13: Oak flagged gallery:empty-recruiter in v9 and again in v10, and the v10 fix had added the very badge
// he then called redundant. --reflagged lists every cell flagged in two or more versions with the last attempt's note, so a
// round reads what already failed before it designs that cell again. Pass extra cell ids (the newest flags) to include them.
if (flag("--reflagged")) {
  const versions = readdirSync(reviewRoot).filter(name => /^v\d+$/.test(name)).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  const seen = new Map();
  for (const version of versions) {
    const file = path.join(reviewRoot, version, "findings.json");
    if (!existsSync(file)) continue;
    for (const [id, entry] of Object.entries(JSON.parse(readFileSync(file, "utf8")))) {
      const rounds = seen.get(id) ?? [];
      const from = entry.from ?? version;
      if (!rounds.some(round => round.version === from)) seen.set(id, [...rounds, { version: from, note: entry.note ?? "", finding: entry.finding ?? "" }]);
    }
  }
  const extra = process.argv.slice(process.argv.indexOf("--reflagged") + 1).filter(arg => !arg.startsWith("--"));
  for (const id of extra) seen.set(id, [...(seen.get(id) ?? []), { version: "new", note: "" }]);
  const loud = [...seen].filter(([, rounds]) => rounds.length > 1);
  // One synchronous write: process.exit after many console.log calls drops piped output.
  writeSync(1, [`reflagged=${loud.length}`, ...loud.map(([id, rounds]) => {
    const last = rounds.filter(round => round.note).at(-1);
    // RETRO Q24 round 20: the roles card was flagged six times; v14's words were "the same thumbnail on every role", a wiring
    // fault, and every later attempt redesigned around "no role art". The first flag prints so a round tests its premise.
    const words = rounds.filter(round => round.finding).map(round => `${round.version} "${clip(round.finding, 70)}"`).join(" ");
    return `${id} flagged ${rounds.map(round => round.version).join(",")}; flags: ${words || "unknown"}; last attempt: ${clip(last?.note ?? "none", 220)}`;
  })].join("\n") + "\n");
  process.exit(0);
}

if (flag("--verify")) {
  const sheets = existsSync(path.join(dir, "sheets")) ? readdirSync(path.join(dir, "sheets")).filter(name => name.endsWith(".png")) : [];
  const matched = manifest.groups.filter(group => sheets.includes(`${group.id}.png`)).length;
  const maxCells = Math.max(0, ...manifest.groups.map(group => group.cells.length));
  const index = existsSync(path.join(dir, "INDEX.md")) ? readFileSync(path.join(dir, "INDEX.md"), "utf8") : "";
  const sheetCount = sheets.length === matched ? sheets.length : sheets.length + 1000;
  console.log(`sheets=${sheetCount} groups=${manifest.groups.length} max-cells=${maxCells} index=${index.startsWith("# Visual review") ? 1 : 0} changelog=${/^## Changes since /m.test(index) ? 1 : 0}`);
  process.exit(0);
}

// Build.
for (const group of manifest.groups) if (group.cells.length > MAX_CELLS) throw new Error(`${group.id} has ${group.cells.length} cells; split it (max ${MAX_CELLS})`);
mkdirSync(path.join(dir, "sheets"), { recursive: true });

function labelSvg(cell, width) {
  const color = STATUS_COLOR[cell.status] ?? "#999999";
  const badge = cell.badge ? ` ${cell.badge.toUpperCase()}` : "";
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${LABEL_HEIGHT}">
  <rect width="100%" height="100%" fill="#161616"/>
  <rect x="12" y="12" width="64" height="20" rx="10" fill="${color}"/>
  <text x="44" y="27" font-family="Helvetica, Arial, sans-serif" font-size="12" font-weight="700" fill="#0b0b0b" text-anchor="middle">${escapeXml(cell.status)}</text>
  <text x="86" y="27" font-family="Menlo, monospace" font-size="12" fill="#bdbdbd">${escapeXml(clip(cell.id + badge, 58))}</text>
  <text x="12" y="52" font-family="Helvetica, Arial, sans-serif" font-size="14" fill="#ffffff">${escapeXml(clip(cell.title, 62))}</text>
</svg>`);
}

// The tile for a named gap or a link-only reference: its note in plain text, and the link when there is one.
function textTile(cell) {
  const lines = [clip(cell.note, 60), cell.link ? clip(cell.link, 60) : ""].filter(Boolean);
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${CELL_WIDTH}" height="320">
  <rect width="100%" height="100%" fill="#1b1e22"/>
  ${lines.map((line, i) => `<text x="${CELL_WIDTH / 2}" y="${150 + i * 24}" font-family="Helvetica, Arial, sans-serif" font-size="15" fill="#d6d9de" text-anchor="middle">${escapeXml(line)}</text>`).join("")}
</svg>`)).png().toBuffer();
}

async function cellImage(cell) {
  const file = captureOf(cell);
  const shot = imageless(cell) ? await textTile(cell)
    : existsSync(file)
      ? await sharp(file).resize({ width: CELL_WIDTH, height: 680, fit: "inside", withoutEnlargement: false }).png().toBuffer()
      : await sharp({ create: { width: CELL_WIDTH, height: 320, channels: 3, background: "#3a0d0d" } }).png().toBuffer();
  const meta = await sharp(shot).metadata();
  const height = meta.height + LABEL_HEIGHT;
  return sharp({ create: { width: CELL_WIDTH, height, channels: 3, background: "#0b0b0b" } })
    .composite([{ input: shot, top: 0, left: Math.round((CELL_WIDTH - meta.width) / 2) }, { input: labelSvg(cell, CELL_WIDTH), top: meta.height, left: 0 }])
    .png().toBuffer().then(buffer => ({ buffer, height }));
}

for (const group of manifest.groups) {
  const images = [];
  for (const cell of group.cells) images.push(await cellImage({ ...cell, group: group.id }));
  const rows = Math.ceil(images.length / COLUMNS);
  const rowHeights = Array.from({ length: rows }, (_, row) => Math.max(...images.slice(row * COLUMNS, row * COLUMNS + COLUMNS).map(image => image.height)));
  const width = COLUMNS * CELL_WIDTH + (COLUMNS + 1) * GAP;
  const height = HEADER_HEIGHT + rowHeights.reduce((sum, value) => sum + value + GAP, GAP);
  const header = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${HEADER_HEIGHT}">
  <text x="${GAP}" y="34" font-family="Helvetica, Arial, sans-serif" font-size="22" font-weight="700" fill="#ffffff">${escapeXml(group.title)}</text>
  <text x="${GAP}" y="58" font-family="Menlo, monospace" font-size="13" fill="#9a9a9a">${escapeXml(`${group.id} · ${manifest.version} · ${manifest.date} · ${manifest.commit}`)}</text>
</svg>`);
  const layers = [{ input: header, top: 0, left: 0 }];
  let top = HEADER_HEIGHT + GAP;
  rowHeights.forEach((rowHeight, row) => {
    images.slice(row * COLUMNS, row * COLUMNS + COLUMNS).forEach((image, column) =>
      layers.push({ input: image.buffer, top, left: GAP + column * (CELL_WIDTH + GAP) }));
    top += rowHeight + GAP;
  });
  await sharp({ create: { width, height, channels: 3, background: "#000000" } }).composite(layers).png({ compressionLevel: 9 })
    .toFile(path.join(dir, "sheets", `${group.id}.png`));
}

const count = status => cells.filter(cell => cell.status === status).length;
const row = values => `| ${values.map(value => String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ")).join(" | ")} |`;
const lines = [
  `# Visual review ${manifest.version}`, "",
  `- Version: ${manifest.version}${manifest.supersedes ? ` (supersedes ${manifest.supersedes})` : ""}`,
  `- Date: ${manifest.date}`, `- Commit: ${manifest.commit}`, `- Worker: ${manifest.worker}`, `- Site: ${manifest.site}`,
  `- Totals: ${cells.length} cells, ${count("pass")} pass, ${count("fixed")} fixed, ${count("open")} open, in ${manifest.groups.length} groups`,
  `- Folder: ${dir}`, "",
];
for (const group of manifest.groups) {
  lines.push(`## ${group.title}`, "", `Sheet: ${path.join(dir, "sheets", `${group.id}.png`)}`, "",
    row(["Cell", "Status", "Viewport", "Note", "Capture"]), row(["---", "---", "---", "---", "---"]),
    ...group.cells.map(cell => row([cell.id, cell.badge ? `${cell.status} (${cell.badge})` : cell.status, cell.viewport, cell.fix ? `${cell.note} Fix: ${cell.fix}` : cell.note,
      imageless(cell) ? cell.link ?? "no image" : captureOf(cell)])), "");
}
lines.push(`## Changes since ${manifest.supersedes ?? "the start"}`, "");
if (manifest.changes?.length) lines.push(row(["From", "Cell", "Finding", "Commit"]), row(["---", "---", "---", "---"]),
  ...manifest.changes.map(change => row([change.from, change.cell, change.finding, change.commit])));
else lines.push("None: this is the first version.");
writeFileSync(path.join(dir, "INDEX.md"), `${lines.join("\n")}\n`);
console.log(`built ${manifest.groups.length} sheets and INDEX.md in ${dir}`);
