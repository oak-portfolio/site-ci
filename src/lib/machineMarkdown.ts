import type { MachineFact, MachineLink, MachineLinkGroup, MachinePage } from "@/data/machineContent";

const SITE_URL = "https://steveoak.com/";

export const machineLinkGroups: MachineLinkGroup[] = [
  {
    id: "public-context-files",
    title: "Fast Context",
    description: "A quick orientation map with the main pages, summaries, and useful links.",
    icon: "machine",
  },
  {
    id: "structured-data",
    title: "Structured Data",
    description: "Page facts and identity data as JSON.",
    icon: "dataFile",
  },
  {
    id: "markdown-mirrors",
    title: "Copy-Friendly Text",
    description: "Plain-text versions for quoting, saving, or sharing.",
    icon: "documentCode",
  },
  {
    id: "identity-files",
    title: "Profile Files",
    description: "Names, profile links, focus areas, and collaboration fit.",
    icon: "identityFile",
  },
  {
    id: "work-proof",
    title: "Related Work",
    description: "Public Work pages, case studies, and source references.",
    icon: "sourceData",
  },
  {
    id: "oak-social-profiles",
    title: "Oak Social Profiles",
    description: "Public profiles for Steve Oak / Okkar Kyaw.",
    icon: "identityFile",
  },
];

function absoluteUrl(pathOrUrl: string) {
  return new URL(pathOrUrl, SITE_URL).toString();
}

export function normalizeMachinePath(pathname: string) {
  const withoutQuery = pathname.split("?")[0]?.split("#")[0] || "/";
  if (withoutQuery === "/") return "/";
  return withoutQuery.replace(/\/+$/, "");
}

export function getMachinePageByPath(pages: MachinePage[], pathname: string) {
  const normalized = normalizeMachinePath(pathname);
  return pages.find((page) => normalizeMachinePath(page.path) === normalized);
}

function renderFacts(title: string, facts: MachineFact[]) {
  const publicFacts = facts.filter((fact) => fact.value.trim());
  if (publicFacts.length === 0) return "";
  return [
    `## ${title}`,
    "",
    ...publicFacts.map((fact) => {
      const source = fact.source ? ` [source: ${fact.source}]` : "";
      const value = fact.value ? ` ${fact.value}` : "";
      const items = fact.items?.filter((item) => item.trim()) ?? [];
      if (items.length === 0) return `- ${fact.label}:${value}${source}`;
      return [`- ${fact.label}:${value}${source}`, ...items.map((item) => `  - ${item}`)].join("\n");
    }),
    "",
  ].join("\n");
}

const DOT_PLACEHOLDER = "\uE000";

function protectDottedTerms(value: string) {
  return value
    .replace(/\b(?:[A-Za-z]\.){2,}/g, (match) => match.replace(/\./g, DOT_PLACEHOLDER))
    .replace(/\b[A-Za-z0-9-]+\.[A-Za-z0-9.-]+\b/g, (match) => match.replace(/\./g, DOT_PLACEHOLDER));
}

function restoreDottedTerms(value: string) {
  return value.replaceAll(DOT_PLACEHOLDER, ".");
}

export function getPublicTextParagraphs(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const protectedValue = protectDottedTerms(normalized);
  const sentences = protectedValue.split(/(?<=[.!?])\s+(?=[A-Z0-9])/).map((sentence) => restoreDottedTerms(sentence.trim()));
  const paragraphs: string[] = [];

  for (let index = 0; index < sentences.length; index += 2) {
    paragraphs.push(sentences.slice(index, index + 2).join(" "));
  }

  return paragraphs;
}

function renderParagraphs(value: string) {
  return getPublicTextParagraphs(value).join("\n\n");
}

function renderAnswer(block: { heading: string; answer: string; items?: string[] }) {
  const items = block.items?.filter((item) => item.trim()) ?? [];
  return [
    `### ${block.heading}`,
    "",
    renderParagraphs(block.answer),
    "",
    ...items.map((item) => `- ${item}`),
    "",
  ];
}

function renderList(title: string, items: string[] | undefined) {
  const publicItems = items?.filter((item) => item.trim()) ?? [];
  if (publicItems.length === 0) return "";
  return [
    `## ${title}`,
    "",
    ...publicItems.map((item) => `- ${item}`),
    "",
  ].join("\n");
}

function renderLinks(title: string, links: MachineLink[]) {
  if (links.length === 0) return "";
  const seenLinks = new Set<string>();
  const uniqueLinks = links.filter((link) => {
    const key = `${link.href.replace(/\/+$/, "")}::${link.label.toLowerCase()}`;
    if (seenLinks.has(key)) return false;
    seenLinks.add(key);
    return true;
  });
  const grouped = machineLinkGroups.flatMap((group) => {
    const groupLinks = uniqueLinks.filter((link) => link.group === group.id);
    if (groupLinks.length === 0) return [];
    return [
      `### ${group.title}`,
      group.description,
      "",
      ...groupLinks.map((link) => `- [${link.label}](${absoluteUrl(link.href)}): ${link.description}`),
      "",
    ];
  });

  return [
    `## ${title}`,
    "",
    ...grouped,
    "",
  ].join("\n");
}

export function renderMachinePageMarkdown(page: MachinePage) {
  return [
    `# ${page.title}`,
    "",
    "## Overview",
    "",
    renderParagraphs(page.summary),
    "",
    "## What This Is",
    "",
    ...page.answerBlocks.flatMap(renderAnswer),
    renderFacts("Key Facts", page.facts),
    renderFacts("Context", page.localSignals),
    renderFacts("Evidence", page.proofSignals),
    renderList("Scope", page.claimBoundaries),
    renderFacts(
      "Formats",
      [
        page.markdownHref ? { label: "Markdown", value: absoluteUrl(page.markdownHref) } : undefined,
        page.markdownApiHref ? { label: "Markdown API", value: absoluteUrl(page.markdownApiHref) } : undefined,
        page.machineJsonHref ? { label: "Structured JSON", value: absoluteUrl(page.machineJsonHref) } : undefined,
      ].filter((fact): fact is MachineFact => Boolean(fact)),
    ),
    renderList("Use This Page", page.retrievalHints),
    renderList("Reading Notes", page.crawlNotes),
    renderFacts("Page Schema", page.schemaTypes.map((schemaType) => ({ label: schemaType, value: "Schema used for this page." }))),
    renderLinks("Links And Resources", page.links),
    renderList("Good Questions", page.queryIntents),
  ]
    .filter(Boolean)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd()
    .concat("\n");
}
