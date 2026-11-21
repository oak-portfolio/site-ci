import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readHtmlDocument, routeForFile as outputRoute, walkFiles } from "./quality/html.mjs";
import sharp from "sharp";

const repoRoot = join(import.meta.dirname, "..");
const distDir = join(repoRoot, "dist");
const siteOrigin = "https://steveoak.com";

const requiredFields = [
  ["title", (html) => getTitle(html)],
  ["meta description", (html) => getMeta(html, { name: "description" })],
  ["canonical", (html) => getLink(html, "canonical")],
  ["og:title", (html) => getMeta(html, { property: "og:title" })],
  ["og:description", (html) => getMeta(html, { property: "og:description" })],
  ["og:type", (html) => getMeta(html, { property: "og:type" })],
  ["og:url", (html) => getMeta(html, { property: "og:url" })],
  ["og:image", (html) => getMeta(html, { property: "og:image" })],
  ["og:image:width", (html) => getMeta(html, { property: "og:image:width" })],
  ["og:image:height", (html) => getMeta(html, { property: "og:image:height" })],
  ["og:image:alt", (html) => getMeta(html, { property: "og:image:alt" })],
  ["og:site_name", (html) => getMeta(html, { property: "og:site_name" })],
  ["og:locale", (html) => getMeta(html, { property: "og:locale" })],
  ["twitter:card", (html) => getMeta(html, { name: "twitter:card" })],
  ["twitter:title", (html) => getMeta(html, { name: "twitter:title" })],
  ["twitter:description", (html) => getMeta(html, { name: "twitter:description" })],
  ["twitter:image", (html) => getMeta(html, { name: "twitter:image" })],
  ["twitter:image:alt", (html) => getMeta(html, { name: "twitter:image:alt" })],
];

if (!existsSync(distDir)) {
  console.error("dist/ is missing. Run npm run build before npm run audit:metadata.");
  process.exit(1);
}

const htmlFiles = walkFiles(distDir).filter((file) => file.endsWith(".html"));
const pages = [];
const errors = [];
const warnings = [];

for (const file of htmlFiles) {
  const html = readHtmlDocument(readFileSync(file, "utf8"));
  if (!html.isDocument) continue;

  const route = outputRoute(distDir, file);
  const title = getTitle(html);
  const description = getMeta(html, { name: "description" });
  const missing = requiredFields.filter(([, read]) => !read(html)).map(([field]) => field);

  if (missing.length) {
    errors.push(`${route}: missing ${missing.join(", ")}`);
  }

  if (title.length > 65) {
    warnings.push(`${route}: title is ${title.length} characters; target is 65 or fewer`);
  }

  if (description.length > 160) {
    warnings.push(`${route}: description is ${description.length} characters; target is 160 or fewer`);
  }

  await validateOgImage(route, html);

  pages.push({
    route,
    title,
    description,
  });
}

warnDuplicates(pages, "title");
warnDuplicates(pages, "description");
if (pages.length === 0) errors.push("No full HTML pages were found in dist.");

for (const warning of warnings) {
  console.warn(`metadata warning: ${warning}`);
}

if (errors.length) {
  for (const error of errors) {
    console.error(`metadata error: ${error}`);
  }
  process.exit(1);
}

console.log(`Metadata audit passed for ${pages.length} HTML pages.`);

function getTitle(document) {
  return document.title;
}

function getMeta(document, selector) {
  return document.meta(selector.name ?? selector.property);
}

function getLink(document, rel) {
  return document.link(rel);
}

async function validateOgImage(route, html) {
  const imageHref = getMeta(html, { property: "og:image" });
  const declaredWidth = Number(getMeta(html, { property: "og:image:width" }));
  const declaredHeight = Number(getMeta(html, { property: "og:image:height" }));

  if (!Number.isInteger(declaredWidth) || !Number.isInteger(declaredHeight)) {
    errors.push(`${route}: og:image dimensions must be integers`);
    return;
  }

  let imageUrl;
  try {
    imageUrl = new URL(imageHref, siteOrigin);
  } catch {
    errors.push(`${route}: og:image is not a valid URL`);
    return;
  }

  if (imageUrl.origin !== siteOrigin) {
    warnings.push(`${route}: og:image is external; dimensions were not verified`);
    return;
  }

  const imagePath = join(distDir, decodeURIComponent(imageUrl.pathname.replace(/^\//, "")));
  if (!existsSync(imagePath)) {
    errors.push(`${route}: og:image file is missing from dist (${imageUrl.pathname})`);
    return;
  }

  const metadata = await sharp(imagePath).metadata();
  if (metadata.width !== declaredWidth || metadata.height !== declaredHeight) {
    errors.push(
      `${route}: og:image declares ${declaredWidth}x${declaredHeight}, but ${imageUrl.pathname} is ${metadata.width}x${metadata.height}`,
    );
  }
}

function warnDuplicates(pages, field) {
  const grouped = new Map();
  for (const page of pages) {
    const value = page[field];
    grouped.set(value, [...(grouped.get(value) ?? []), page]);
  }
  for (const [value, matches] of grouped.entries()) {
    if (!value || matches.length < 2) continue;
    warnings.push(`duplicate ${field} on ${matches.map((page) => page.route).join(", ")}`);
  }
}
