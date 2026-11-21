// Ticket 62: the asset record behind the owner console's Assets tab. One row per image, with alt text per use, focal point,
// rights and where it is used, from Work MDX (card, hero and social frontmatter, plus <ImageFigure> blocks) and brandIconRegistry.ts.
// Run: node scripts/assets/build-asset-record.mjs (writes src/data/assetRecord.generated.json).
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const OUTPUT = "src/data/assetRecord.generated.json";
const WORK = "src/content/work";
const REGISTRY = "src/data/brandIconRegistry.ts";

const unquote = (value) => value.trim().replace(/^"(.*)"$/, "$1").replace(/\\"/g, '"');

function frontmatterUses(head, where) {
  const uses = [];
  for (const block of head.matchAll(/^(card|hero|social):\n((?:[ \t]+.*\n?)+)/gm)) {
    const image = block[2].match(/^\s+image:\s*(.+)$/m)?.[1];
    if (!image) continue;
    const focal = block[2].match(/^\s+(?:focal|imagePosition):\s*(.+)$/m)?.[1];
    uses.push({ src: unquote(image), use: block[1], alt: unquote(block[2].match(/^\s+imageAlt:\s*(.+)$/m)?.[1] ?? ""), where, focal: focal ? unquote(focal) : null });
  }
  return uses;
}

function figureUses(body, where) {
  return [...body.matchAll(/<ImageFigure\b([\s\S]*?)\/>/g)].flatMap(([, attrs]) => {
    const src = attrs.match(/\bsrc="([^"]+)"/)?.[1];
    return src ? [{ src, use: "figure", alt: attrs.match(/\balt="([^"]*)"/)?.[1] ?? "", where, focal: null }] : [];
  });
}

function brandUses(source) {
  return [...source.matchAll(/^ {2}(\w+): \{\n([\s\S]*?)^ {2}\},?$/gm)].flatMap(([, key, body]) => {
    const src = body.match(/assetPath: "([^"]+)"/)?.[1];
    const label = body.match(/label: "([^"]+)"/)?.[1] ?? key;
    const domain = body.match(/domain: "([^"]+)"/)?.[1] ?? null;
    return src ? [{ src, use: "brand icon", alt: `${label} logo`, where: REGISTRY, focal: null, domain }] : [];
  });
}

/** Builds the record in memory; the same function backs the generated file and its freshness test. */
export function buildAssetRecord(root) {
  const uses = [];
  for (const file of readdirSync(join(root, WORK)).filter((name) => name.endsWith(".mdx")).sort()) {
    const text = readFileSync(join(root, WORK, file), "utf8");
    const [, head = "", ...rest] = text.split(/^---\s*$/m);
    const where = `${WORK}/${file}`;
    uses.push(...frontmatterUses(head, where), ...figureUses(rest.join("---"), where));
  }
  uses.push(...brandUses(readFileSync(join(root, REGISTRY), "utf8")));
  const bySrc = new Map();
  for (const { src, focal, domain, ...use } of uses.filter((use) => use.src.startsWith("/assets/"))) {
    const asset = bySrc.get(src) ?? { id: createHash("sha256").update(src).digest("hex").slice(0, 12), src, kind: domain === undefined ? "work" : "brand",
      focal: "center", rights: domain === undefined ? "Not recorded" : `Third-party mark, linked to ${domain ?? "its owner"}`, uses: [], usedIn: [] };
    if (focal) asset.focal = focal;
    if (!asset.uses.some((seen) => seen.use === use.use && seen.where === use.where && seen.alt === use.alt)) asset.uses.push(use);
    if (!asset.usedIn.includes(use.where)) asset.usedIn.push(use.where);
    bySrc.set(src, asset);
  }
  return { source: [WORK, REGISTRY], assets: [...bySrc.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.src.localeCompare(b.src)) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(import.meta.dirname, "../..");
  const record = buildAssetRecord(root);
  writeFileSync(join(root, OUTPUT), `${JSON.stringify(record, null, 2)}\n`);
  console.log(`wrote ${OUTPUT}: ${record.assets.length} assets`);
}
