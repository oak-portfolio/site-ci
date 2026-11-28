#!/usr/bin/env node
// Fails a built site that holds an owner or __dev page, a link to one, or a trace of the local owner-token proxy.
// Usage: node scripts/quality/no-private-routes.mjs [dist]   exit 0 clean, 1 findings, 2 no dist.
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const privatePage = /(^|\/)(owner|__dev)(\/|\.html$)/;
const privateLink = /["'(=]\/(owner|__dev)(\/|["'?#)])/;
const proxyMarkers = ["owner-proxy-same-origin-only", "oak-owner-api-token"];
const textFile = /\.(html|js|mjs|css|json|txt|md|xml|map)$/;

function* files(dir, base = dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* files(full, base);
    else yield path.relative(base, full).split(path.sep).join("/");
  }
}

export function scanDist(dir) {
  const findings = [];
  for (const file of files(dir)) {
    if (privatePage.test(file)) findings.push(`${file}: private page in the build`);
    if (!textFile.test(file)) continue;
    const text = readFileSync(path.join(dir, file), "utf8");
    for (const marker of proxyMarkers) if (text.includes(marker)) findings.push(`${file}: references the owner token proxy (${marker})`);
    if (file.endsWith(".html") && privateLink.test(text)) findings.push(`${file}: links to a private page`);
  }
  return findings;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const dir = path.resolve(process.argv[2] ?? "dist");
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    console.error(`no-private-routes: ${dir} is not a built site; run npm run build first`);
    process.exit(2);
  }
  const findings = scanDist(dir);
  for (const finding of findings) console.error(`no-private-routes: ${finding}`);
  if (findings.length) process.exit(1);
  console.log(`no-private-routes: ${dir} holds no owner or __dev page and no owner-proxy reference`);
}
