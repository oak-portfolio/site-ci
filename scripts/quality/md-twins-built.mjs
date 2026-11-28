#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parse as parseYaml } from "yaml";
import { attribute, descendants, readHtmlDocument, textContent } from "./html.mjs";

export const INTERNAL_PATTERNS = [
  /\/Users\//,
  /\.scratch\//,
  /Oak Portfolio/,
  /do-not-publish/,
  /needs-oak/,
  /noindex-draft/,
  /claim safety/i,
  /workpad/i,
  /public status/i,
  /homepage footer/i,
  /generated from/i,
  /crawler-friendly/i,
  /source packet/i,
];

const squash = (text) => text.replace(/\s+/g, " ").trim();

function readJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function typesOf(node) {
  return [node["@type"]].flat().filter(Boolean);
}

export function readBuiltPage(html) {
  const doc = readHtmlDocument(html);
  const main = doc.nodes.find((node) => node.tagName === "main");
  const inMain = descendants(main);
  const textOf = (tag) => inMain.filter((node) => node.tagName === tag).map((node) => squash(textContent(node)));
  const graph = doc.schemas.flatMap((script) => {
    const parsed = readJson(script);
    return parsed["@graph"] ?? [parsed];
  });
  const crumbs = graph.find((node) => typesOf(node).includes("BreadcrumbList"))?.itemListElement ?? [];
  const article = graph.find((node) => node.datePublished && node.dateModified);
  const links = inMain
    .filter((node) => node.tagName === "a")
    .map((node) => attribute(node, "href"))
    .filter((href) => {
      if (!/^https?:\/\//.test(href)) return false;
      const host = new URL(href).hostname;
      return host !== "steveoak.com" && !host.endsWith(".steveoak.com");
    });
  return {
    hasMain: Boolean(main),
    h1: textOf("h1")[0],
    headings: [...textOf("h2"), ...textOf("h3")],
    h3: textOf("h3"),
    links: [...new Set(links)],
    dates: article ? [article.datePublished, article.dateModified].map((value) => String(value).slice(0, 10)) : undefined,
    names: [
      ...(crumbs.length > 1 ? [crumbs.at(-1).name] : []),
      doc.title.split(" | ")[0],
    ].filter(Boolean),
    listed: (graph.find((node) => typesOf(node).includes("ItemList"))?.itemListElement ?? []).map((item) => item.name),
  };
}

export function readTwin(markdown) {
  const lines = markdown.split("\n");
  const headingLines = lines.filter((line) => /^#{1,6} /.test(line));
  return {
    markdown,
    lower: markdown.toLowerCase(),
    h1: lines.find((line) => line.startsWith("# "))?.slice(2).trim(),
    headings: new Set(headingLines.map((line) => squash(line.replace(/^#{1,6} /, "")))),
  };
}

export function readContentFacts(contentDir) {
  const entries = new Map();
  if (!existsSync(contentDir)) return { entries, held: [] };
  for (const file of readdirSync(contentDir).filter((name) => name.endsWith(".mdx")).sort()) {
    const match = readFileSync(path.join(contentDir, file), "utf8").match(/^---\n([\s\S]*?)\n---/);
    if (!match) continue;
    const data = parseYaml(match[1]) ?? {};
    const metrics = data.metrics ?? [];
    entries.set(file.replace(/\.mdx$/, ""), {
      questions: (data.machineQuestions ?? []).map((question) => squash(question.heading)),
      verified: metrics.filter((metric) => metric.status === "verified").map((metric) => metric.value),
      held: metrics.filter((metric) => metric.status === "do-not-publish").map((metric) => metric.value),
    });
  }
  return { entries, held: [...new Set([...entries.values()].flatMap((entry) => entry.held))] };
}

function twinViolations(twin, { page, requiredHeadings = [], requiredQuestions = [], requiredDates = [], verified = [], held }) {
  const found = [];
  if (page) {
    if (!page.hasMain) found.push("built page has no main element");
    if (!twin.h1) found.push("h1 missing");
    else if (!page.names.some((name) => twin.h1.includes(name))) found.push(`h1 does not name its page: ${twin.h1}`);
    for (const heading of requiredHeadings) if (!twin.lower.includes(heading.toLowerCase())) found.push(`heading missing: ${heading}`);
    for (const heading of requiredQuestions) if (!twin.headings.has(heading)) found.push(`heading missing: ${heading}`);
    for (const link of page.links) if (!twin.markdown.includes(link)) found.push(`link missing: ${link}`);
    for (const date of requiredDates) if (!twin.markdown.includes(date)) found.push(`date missing: ${date}`);
    for (const value of verified) if (!twin.markdown.includes(value)) found.push(`metric missing: ${value}`);
  }
  for (const value of held) if (twin.markdown.includes(value)) found.push(`held metric: ${value}`);
  for (const pattern of INTERNAL_PATTERNS) {
    const match = twin.markdown.match(pattern);
    if (match) found.push(`internal text: ${match[0]}`);
  }
  return found;
}

function readIfFile(file) {
  return existsSync(file) && statSync(file).isFile() ? readFileSync(file, "utf8") : undefined;
}

export function checkBuiltTwins({ dist, contentDir }) {
  if (!existsSync(dist) || !statSync(dist).isDirectory()) {
    throw new Error(`${dist} is not a built site; run npm run build first`);
  }
  const content = readContentFacts(contentDir);
  const out = [];
  const report = (route, messages) => messages.forEach((message) => out.push(`${route}: ${message}`));
  const html = (relative) => readIfFile(path.join(dist, relative));
  const twinOf = (relative) => {
    const markdown = readIfFile(path.join(dist, relative));
    return markdown === undefined ? undefined : readTwin(markdown);
  };

  const workHtml = html("work/index.html");
  const workPage = workHtml === undefined ? undefined : readBuiltPage(workHtml);
  const workHeadings = new Set(workPage?.h3 ?? []);

  const fixed = [
    { route: "index", page: "index.html", twin: "index.md", required: (page) => page.h3.filter((heading) => workHeadings.has(heading)) },
    { route: "work", page: "work/index.html", twin: "work.md", required: (page) => page.headings },
    { route: "404", page: "404.html", twin: "404.md", required: () => [] },
  ];
  for (const { route, page: pageFile, twin: twinFile, required } of fixed) {
    const pageHtml = html(pageFile);
    const twin = twinOf(twinFile);
    if (pageHtml === undefined) report(route, ["built page is missing"]);
    if (twin === undefined) report(route, ["built page has no twin"]);
    if (pageHtml === undefined || twin === undefined) continue;
    const page = readBuiltPage(pageHtml);
    report(route, twinViolations(twin, { page, requiredHeadings: required(page), held: content.held }));
  }

  const workDir = path.join(dist, "work");
  const listing = existsSync(workDir) ? readdirSync(workDir, { withFileTypes: true }) : [];
  const pageSlugs = listing.filter((entry) => entry.isDirectory() && existsSync(path.join(workDir, entry.name, "index.html"))).map((entry) => entry.name);
  const twinSlugs = listing.filter((entry) => entry.isFile() && entry.name.endsWith(".md")).map((entry) => entry.name.slice(0, -3));
  for (const slug of [...new Set([...pageSlugs, ...twinSlugs])].sort()) {
    const route = `work/${slug}`;
    if (!twinSlugs.includes(slug)) {
      report(route, ["built page has no twin"]);
      continue;
    }
    if (!pageSlugs.includes(slug)) {
      report(route, ["twin has no built page"]);
      continue;
    }
    const entry = content.entries.get(slug);
    if (!entry) {
      report(route, ["no content entry for built page"]);
      continue;
    }
    const page = readBuiltPage(html(`work/${slug}/index.html`));
    if (!page.dates) report(route, ["built page carries no published and updated dates"]);
    report(route, twinViolations(twinOf(`work/${slug}.md`), {
      page,
      requiredQuestions: entry.questions,
      requiredDates: page.dates ?? [],
      verified: entry.verified,
      held: content.held,
    }));
  }

  const skill = twinOf("skill.md");
  if (skill === undefined) report("skill", ["twin is missing"]);
  else {
    report("skill", twinViolations(skill, { held: content.held }));
    if (!skill.h1) report("skill", ["h1 missing"]);
    for (const name of workPage?.listed ?? []) if (!skill.markdown.includes(name)) report("skill", [`case study missing: ${name}`]);
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const dist = path.resolve(process.argv[2] ?? "dist");
  const contentDir = path.resolve(process.argv[3] ?? "src/content/work");
  let findings;
  try {
    findings = checkBuiltTwins({ dist, contentDir });
  } catch (error) {
    console.error(`md-twins-built: ${error.message}`);
    process.exit(2);
  }
  for (const finding of findings) console.error(`md-twins-built: ${finding}`);
  if (findings.length) process.exit(1);
  console.log(`md-twins-built: every built twin in ${dist} states its built page facts and holds no held metric, local path or internal note`);
}
