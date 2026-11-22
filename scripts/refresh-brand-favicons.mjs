#!/usr/bin/env node

import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import sharp from "sharp";

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();
const REGISTRY_PATH = path.join(ROOT, "src/data/brandIconRegistry.ts");
const PUBLIC_DIR = path.join(ROOT, "public");
const ICON_DIR = path.join(PUBLIC_DIR, "assets/brand-icons");
const MANIFEST_PATH = path.join(ICON_DIR, "manifest.json");
const FETCH_TIMEOUT_MS = 12_000;
const USER_AGENT = "SteveOak.com favicon cache refresh (+https://steveoak.com)";

const args = new Set(process.argv.slice(2).filter((arg) => !arg.startsWith("--provider")));
const providerIndex = process.argv.indexOf("--provider");
const selectedProvider = providerIndex >= 0 ? process.argv[providerIndex + 1] : undefined;
const shouldRefresh = args.has("--refresh");
const shouldCheck = args.has("--check");
const dryRun = args.has("--dry-run");
const allowFallbackIco = args.has("--allow-fallback-ico");

if (!shouldRefresh && !shouldCheck) {
  console.error("Use --refresh, --check, or both.");
  process.exit(1);
}

function isFallbackDowngrade(existing, candidate) {
  if (!existing) return false;
  if (existing.sourceType === "favicon-ico") return false;
  return candidate.sourceType === "favicon-ico";
}

function parseRegistry(source) {
  const entryPattern = /(\w+):\s*\{([\s\S]*?)\n\s*\}/g;
  const entries = [];
  let match;

  while ((match = entryPattern.exec(source))) {
    const body = match[2];
    const readField = (field) => body.match(new RegExp(`${field}:\\s*"([^"]+)"`))?.[1];
    entries.push({
      provider: match[1],
      label: readField("label"),
      href: readField("href"),
      domain: readField("domain"),
      iconMode: readField("iconMode"),
      assetPath: readField("assetPath"),
      preferredIconUrl: readField("preferredIconUrl"),
    });
  }

  if (entries.length === 0) {
    throw new Error(`No brand icon registry entries found in ${REGISTRY_PATH}`);
  }

  return selectedProvider ? entries.filter((entry) => entry.provider === selectedProvider) : entries;
}

function getAttributes(tag) {
  const attrs = {};
  for (const match of tag.matchAll(/([:\w-]+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/g)) {
    attrs[match[1].toLowerCase()] = match[2].replace(/^["']|["']$/g, "");
  }
  return attrs;
}

function isIconRel(rel = "") {
  const tokens = rel.toLowerCase().split(/\s+/);
  return (
    tokens.includes("icon") ||
    tokens.includes("shortcut") ||
    tokens.includes("apple-touch-icon") ||
    tokens.includes("apple-touch-icon-precomposed")
  );
}

function parseSizeScore(sizes = "") {
  if (sizes.toLowerCase() === "any") return 512;
  const values = [...sizes.matchAll(/(\d+)x(\d+)/g)].map((match) => {
    const width = Number(match[1]);
    const height = Number(match[2]);
    return width === height ? width : Math.min(width, height);
  });
  return values.length > 0 ? Math.max(...values) : 0;
}

function resolveUrl(candidate, baseUrl) {
  try {
    return new URL(candidate, baseUrl).toString();
  } catch {
    return undefined;
  }
}

async function fetchWithTimeout(url, accept = "*/*") {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: accept,
        "User-Agent": USER_AGENT,
      },
      redirect: "follow",
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchText(url) {
  const response = await fetchWithTimeout(url, "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("html") && !contentType.includes("xml") && !contentType.includes("text")) {
    throw new Error(`Unexpected document content type ${contentType || "unknown"}`);
  }
  return response.text();
}

async function discoverCandidates(entry) {
  const pageUrl = `https://${entry.domain}`;
  const candidates = [];

  if (entry.preferredIconUrl) {
    candidates.push({
      sourceType: "preferred-icon",
      url: resolveUrl(entry.preferredIconUrl, pageUrl),
      score: 1000,
    });
  }

  try {
    const html = await fetchText(pageUrl);
    for (const tagMatch of html.matchAll(/<link\b[^>]*>/gi)) {
      const attrs = getAttributes(tagMatch[0]);
      if (!attrs.href || !attrs.rel) continue;

      const href = resolveUrl(attrs.href, pageUrl);
      if (!href) continue;

      if (isIconRel(attrs.rel)) {
        candidates.push({
          sourceType: attrs.rel.toLowerCase().includes("apple") ? "apple-touch-icon" : "rel-icon",
          url: href,
          score: parseSizeScore(attrs.sizes) || 96,
        });
      }

      if (attrs.rel.toLowerCase().split(/\s+/).includes("manifest")) {
        try {
          const manifestResponse = await fetchWithTimeout(href, "application/manifest+json,application/json,*/*;q=0.8");
          if (manifestResponse.ok) {
            const manifest = await manifestResponse.json();
            for (const icon of Array.isArray(manifest.icons) ? manifest.icons : []) {
              if (!icon.src) continue;
              const iconUrl = resolveUrl(icon.src, href);
              if (!iconUrl) continue;
              candidates.push({
                sourceType: "manifest-icon",
                url: iconUrl,
                score: parseSizeScore(icon.sizes) || 128,
              });
            }
          }
        } catch (error) {
          candidates.push({
            sourceType: "manifest-error",
            url: href,
            score: -1,
            error: error.message,
          });
        }
      }
    }
  } catch (error) {
    candidates.push({
      sourceType: "page-error",
      url: pageUrl,
      score: -1,
      error: error.message,
    });
  }

  candidates.push({
    sourceType: "favicon-ico",
    url: `https://${entry.domain.replace(/\/$/, "")}/favicon.ico`,
    score: 48,
  });

  return candidates
    .filter((candidate) => candidate.score >= 0)
    .sort((a, b) => b.score - a.score)
    .filter((candidate, index, list) => list.findIndex((item) => item.url === candidate.url) === index);
}

async function fetchImage(candidate) {
  const response = await fetchWithTimeout(candidate.url, "image/avif,image/webp,image/png,image/svg+xml,image/x-icon,image/*,*/*;q=0.8");
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const contentType = response.headers.get("content-type") ?? "";
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 64) throw new Error("Image response too small");
  if (/text\/html|application\/json/.test(contentType)) throw new Error(`Unexpected image content type ${contentType}`);
  return { bytes, contentType };
}

async function normalizeImage(bytes) {
  let input = bytes;
  try {
    await sharp(input, { animated: false, limitInputPixels: 32_000_000 }).metadata();
  } catch {
    input = await convertWithSips(bytes);
  }

  const image = sharp(input, { animated: false, limitInputPixels: 32_000_000 }).resize(64, 64, {
    fit: "contain",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
    withoutEnlargement: false,
  });
  const metadata = await image.metadata();
  const output = await image.png().toBuffer();
  return {
    bytes: output,
    dimensions: {
      width: metadata.width ?? null,
      height: metadata.height ?? null,
    },
  };
}

async function convertWithSips(bytes) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "steveoak-favicon-"));
  const inputPath = path.join(tempDir, "source-icon");
  const outputPath = path.join(tempDir, "source-icon.png");
  try {
    await fs.writeFile(inputPath, bytes);
    await execFileAsync("sips", ["-s", "format", "png", inputPath, "--out", outputPath], {
      timeout: FETCH_TIMEOUT_MS,
    });
    return await fs.readFile(outputPath);
  } finally {
    await fs.rm(tempDir, { force: true, recursive: true });
  }
}

async function readExistingManifest() {
  try {
    return JSON.parse(await fs.readFile(MANIFEST_PATH, "utf8"));
  } catch {
    return { generatedAt: null, icons: {} };
  }
}

async function existingAssetHash(outputPath) {
  try {
    const bytes = await fs.readFile(outputPath);
    return crypto.createHash("sha256").update(bytes).digest("hex");
  } catch {
    return null;
  }
}

function publicManifestEntry(result) {
  return {
    provider: result.provider,
    assetPath: result.assetPath,
    contentType: result.contentType,
    dimensions: result.dimensions,
  };
}

async function refreshEntry(entry, manifest) {
  if (entry.iconMode === "none") {
    return { provider: entry.provider, status: "skipped-none" };
  }

  if (!entry.assetPath) {
    return { provider: entry.provider, status: "failed", error: "Missing assetPath for favicon provider" };
  }

  const outputPath = path.join(PUBLIC_DIR, entry.assetPath.replace(/^\//, ""));
  const candidates = await discoverCandidates(entry);
  const errors = [];
  const existing = manifest.icons?.[entry.provider];
  let skippedFallbackDowngrade = false;

  for (const candidate of candidates) {
    if (!allowFallbackIco && isFallbackDowngrade(existing, candidate)) {
      skippedFallbackDowngrade = true;
      continue;
    }
    try {
      const fetched = await fetchImage(candidate);
      const normalized = await normalizeImage(fetched.bytes);
      const hash = crypto.createHash("sha256").update(normalized.bytes).digest("hex");
      const existingHash = existing?.hash ?? (await existingAssetHash(outputPath));
      const changed = existingHash !== hash;

      if (!dryRun && changed) {
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        await fs.writeFile(outputPath, normalized.bytes);
      }

      return {
        provider: entry.provider,
        status: changed ? "updated" : "unchanged",
        assetPath: entry.assetPath,
        sourceUrl: candidate.url,
        sourceType: candidate.sourceType,
        contentType: fetched.contentType,
        dimensions: normalized.dimensions,
        hash,
        shouldPersist: changed || !existing,
      };
    } catch (error) {
      errors.push(`${candidate.sourceType} ${candidate.url}: ${error.message}`);
    }
  }

  if (errors.length === 0 && skippedFallbackDowngrade) {
    return {
      provider: entry.provider,
      status: "skipped-fallback-ico",
      assetPath: entry.assetPath,
    };
  }

  return {
    provider: entry.provider,
    status: "failed",
    assetPath: entry.assetPath,
    errors,
  };
}

async function checkEntry(entry, manifest) {
  if (entry.iconMode === "none") return { provider: entry.provider, status: "skipped-none" };
  if (!entry.assetPath) return { provider: entry.provider, status: "failed", error: "Missing assetPath" };

  const outputPath = path.join(PUBLIC_DIR, entry.assetPath.replace(/^\//, ""));
  try {
    const stat = await fs.stat(outputPath);
    if (!stat.isFile() || stat.size < 64) throw new Error("Cached icon is missing or empty");
    if (!manifest.icons?.[entry.provider]) throw new Error("Cached icon is missing manifest metadata");
    return { provider: entry.provider, status: "ok", assetPath: entry.assetPath };
  } catch (error) {
    return { provider: entry.provider, status: "failed", assetPath: entry.assetPath, error: error.message };
  }
}

async function main() {
  const registrySource = await fs.readFile(REGISTRY_PATH, "utf8");
  const entries = parseRegistry(registrySource);
  if (selectedProvider && entries.length === 0) {
    throw new Error(`Provider '${selectedProvider}' was not found in the brand icon registry`);
  }

  await fs.mkdir(ICON_DIR, { recursive: true });
  const manifest = await readExistingManifest();
  const results = [];
  let manifestDirty = false;

  if (shouldRefresh) {
    for (const entry of entries) {
      const result = await refreshEntry(entry, manifest);
      results.push(result);
      if (result.hash && result.shouldPersist) {
        manifest.icons ??= {};
        manifest.icons[result.provider] = publicManifestEntry(result);
        manifestDirty = true;
      }
    }

    if (!dryRun && manifestDirty) {
      manifest.generatedAt = new Date().toISOString();
      await fs.writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
    }
  }

  if (shouldCheck) {
    for (const entry of entries) {
      results.push(await checkEntry(entry, manifest));
    }
  }

  for (const result of results) {
    const resultErrors = "errors" in result && Array.isArray(result.errors) ? result.errors : [];
    const detail = result.error ? ` - ${result.error}` : resultErrors.length > 0 ? ` - ${resultErrors.join("; ")}` : "";
    console.log(`${result.provider}: ${result.status}${detail}`);
  }

  const failed = results.filter((result) => result.status === "failed");
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
