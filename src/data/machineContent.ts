import { isInProgressCaseStudy, sortCaseStudiesByPublishedDateDesc, type CaseStudy } from "@/data/caseStudies";
import { careerContextMetadata, careerTimelineIntro, careerTimelineItems } from "@/data/careerTimeline";
import {
  featureCards,
  platformCards,
  profileSummary,
  proofSections,
  socialLinks,
  workspaceRows,
} from "@/data/homePage";
import { legacyFramerCaseStudies } from "@/data/legacyWork";
import { siteVisibility } from "@/data/siteVisibility";
import { markdownApiHrefForPath, normalizePath } from "@/lib/markdownApiHref";
import { oakPublishable } from "@/lib/oakPublishable";
import type { IconName } from "@/components/ui/Icon";
import { machineLinkGroups, renderMachinePageMarkdown as renderPageMarkdown } from "@/lib/machineMarkdown";
import { knowledgeRevision, getKnowledgeDocument, renderKnowledgeExcerpts } from "@/lib/knowledge/snapshot";
import { renderPublicCredentialSection, type PublicCredentialRecord } from "@/lib/knowledge/publicCredentialText";

export type MachineSourceLabel = "Hero" | "Profile" | "Work" | "Proof" | "Policy" | "Case study" | "App";

export type MachineLinkGroupId =
  | "public-context-files"
  | "structured-data"
  | "markdown-mirrors"
  | "identity-files"
  | "work-proof"
  | "oak-social-profiles";

export type MachineFact = {
  label: string;
  value: string;
  items?: string[];
  source?: MachineSourceLabel;
};

export type MachineLink = {
  label: string;
  href: string;
  group: MachineLinkGroupId;
  description: string;
  icon: IconName;
};

export type MachineAnswerBlock = {
  heading: string;
  answer: string;
  items?: string[];
  source?: MachineSourceLabel;
};

export type MachineLinkGroup = {
  id: MachineLinkGroupId;
  title: string;
  description: string;
  icon: IconName;
};

export type MachinePage = {
  id: string;
  path: string;
  title: string;
  shortTitle: string;
  summary: string;
  pageType: "homepage" | "work-index" | "case-study" | "app-info" | "not-found";
  stage: "public preview" | "published";
  schemaTypes: string[];
  answerBlocks: MachineAnswerBlock[];
  facts: MachineFact[];
  localSignals: MachineFact[];
  proofSignals: MachineFact[];
  links: MachineLink[];
  crawlNotes: string[];
  queryIntents?: string[];
  retrievalHints?: string[];
  claimBoundaries?: string[];
  agentActions?: string[];
  markdownHref?: string;
  markdownApiHref?: string;
  machineJsonHref?: string;
  knowledgeRevision?: string;
  sourceDocumentIds?: string[];
};

export { machineLinkGroups };

export function renderMachinePageMarkdown(page: MachinePage) {
  const excerpts = (page.sourceDocumentIds ?? []).map(renderKnowledgeExcerpts).filter(Boolean);
  return [renderPageMarkdown(page).trimEnd(), ...excerpts,
    `<!-- revision: ${knowledgeRevision} -->`, ""].join("\n\n");
}

export const siteProfile = {
  name: "Steve Oak",
  alternateNames: ["Oak", "Okkar Kyaw"],
  legalName: "Okkar Kyaw",
  url: "https://steveoak.com/",
  image: "https://steveoak.com/assets/brand/oak-profile.png",
  description:
    "Bay Area AI/design engineer building applied agentic AI systems, RAG/tool workflows, evaluation loops, and product-quality AI surfaces.",
  jobTitle: "Applied AI systems and design engineer",
  locationSignal: "Bay Area, California",
  audience:
    "Bay Area AI teams, founders, design/product leaders, recruiters, and technical collaborators.",
  focus: [
    "Applied AI systems",
    "Design engineering",
    "AI product surfaces",
    "Agent workflows",
    "RAG and tool workflows",
    "Evaluation loops",
    "Context engineering",
    "Human-in-the-loop AI systems",
  ],
  sameAs: socialLinks.map((link) => link.href),
};

const publicContextLinks: MachineLink[] = [
  {
    label: "llms.txt",
    href: "/llms.txt",
    group: "public-context-files",
    description: "Quick map of important pages, summaries, and useful links.",
    icon: "machine",
  },
  {
    label: "llms-full.txt",
    href: "/llms-full.txt",
    group: "public-context-files",
    description: "Expanded portfolio context for readers and AI assistants with larger context windows.",
    icon: "dataFile",
  },
];

const identityLinks: MachineLink[] = [
  {
    label: "profile.json",
    href: "/profile.json",
    group: "identity-files",
    description: "Steve Oak / Okkar Kyaw profile with identity and sameAs links.",
    icon: "identityFile",
  },
  {
    label: "agent profile JSON",
    href: "/.well-known/agent-profile.json",
    group: "identity-files",
    description: "Profile, page links, focus areas, and supported actions.",
    icon: "dataFile",
  },
  {
    label: "skill.md",
    href: "/skill.md",
    group: "identity-files",
    description: "Capability profile for collaborators, recruiters, and AI assistants.",
    icon: "documentCode",
  },
];

const siteResourceLinks: MachineLink[] = [...publicContextLinks, ...identityLinks];

function absoluteUrl(pathOrUrl: string) {
  return new URL(pathOrUrl, siteProfile.url).toString();
}

function markdownHrefForPath(pathname: string) {
  const normalized = normalizePath(pathname);
  if (normalized === "/") return "/index.md";
  return `${normalized}.md`;
}

function machineJsonHrefForPath(pathname: string) {
  const normalized = normalizePath(pathname);
  const endpointSlug =
    normalized === "/"
      ? "index"
      : normalized.startsWith("/work/")
        ? normalized.split("/").pop()
        : normalized.replace(/^\/+/, "");
  return `/api/machine/${endpointSlug}.json`;
}

function uniqueLinks(links: MachineLink[]) {
  const seen = new Set<string>();
  return links.filter((item) => {
    const hrefKey = item.href === "/" ? "/" : item.href.replace(/\/+$/, "");
    const key = `${hrefKey}::${item.label.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function pageResourceLinks(pathname: string): MachineLink[] {
  const markdownHref = markdownHrefForPath(pathname);
  const markdownApiHref = markdownApiHrefForPath(pathname);
  const machineJsonHref = machineJsonHrefForPath(pathname);

  return uniqueLinks([
    link("Markdown", markdownHref, "markdown-mirrors", "Copy-friendly text version of this page.", "documentCode"),
    ...(markdownApiHref
      ? [link("Markdown API", markdownApiHref, "markdown-mirrors", "Copy-friendly text endpoint for this page.", "documentCode")]
      : []),
    link("Structured JSON", machineJsonHref, "structured-data", "Page facts and links as JSON.", "dataFile"),
  ]);
}

function uniqueValues(values: Array<string | undefined | null | false>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value && value.trim()))));
}

function agentActions() {
  return ["copy_markdown", "ask_chatgpt", "ask_claude", "ask_perplexity"];
}

function retrievalHintsForPage(pathname: string, extra: string[] = []) {
  const markdownHref = markdownHrefForPath(pathname);
  const markdownApiHref = markdownApiHrefForPath(pathname);
  const machineJsonHref = machineJsonHrefForPath(pathname);
  return [
    ...(markdownApiHref ? [`Use ${markdownApiHref} when an AI assistant can fetch a plain Markdown endpoint directly.`] : []),
    `Use ${markdownHref} for a copy-friendly text version of this page.`,
    `Use ${machineJsonHref} for the page facts and links as JSON.`,
    ...extra,
  ];
}

function baseClaimBoundaries() {
  return [
    "SteveOak.com is a personal portfolio and collaboration surface rather than a local services listing.",
    "Bay Area references describe personal location, hiring context, and collaboration context; they do not imply an address, hours, reviews, map listing, or service area.",
  ];
}

function firstPublicSentences(value: string, maxSentences = 2) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  const sentences = normalized.split(/(?<=[.!?])\s+(?=[A-Z0-9])/);
  return sentences.slice(0, maxSentences).join(" ");
}

function pageMarkdownHref(page: MachinePage) {
  return page.markdownHref ?? markdownHrefForPath(page.path);
}

function pageMarkdownApiHref(page: MachinePage) {
  return page.markdownApiHref ?? markdownApiHrefForPath(page.path);
}

function pageMachineJsonHref(page: MachinePage) {
  return page.machineJsonHref ?? machineJsonHrefForPath(page.path);
}

function fact(label: string, value: string, source: MachineSourceLabel, items?: string[]): MachineFact {
  return { label, value, source, items };
}

function answer(heading: string, value: string, source: MachineSourceLabel, items?: string[]): MachineAnswerBlock {
  return { heading, answer: value, source, items };
}

function link(
  label: string,
  href: string,
  group: MachineLinkGroupId,
  description: string,
  icon: IconName,
): MachineLink {
  return { label, href, group, description, icon };
}

type CaseStudySource = CaseStudy["sources"][number];

function caseStudySourceDescription(caseStudy: CaseStudy, source: CaseStudySource) {
  const sourceKey = source.label.toLowerCase();

  if (caseStudy.slug === "linkedin-growth-loop") {
    if (sourceKey.includes("paperclip")) {
      return "Shows an open-source browser-agent workflow pattern for repeatable task execution.";
    }
    if (sourceKey.includes("karpathy autoresearch")) {
      return "Frames autonomous research loops that keep durable context and improve across runs.";
    }
    if (sourceKey.includes("fortune")) {
      return "Explains the Karpathy Loop in public terms and gives readers a wider reference for repeatable autonomous-agent cycles.";
    }
    if (sourceKey.includes("ralph")) {
      return "Shows a persistent agent architecture with roles, memory, and recurring workflow structure.";
    }
    if (sourceKey.includes("codex /goal")) {
      return "Shows goal-oriented coding-agent workflow direction with durable task context.";
    }
    if (sourceKey.includes("factory missions")) {
      return "Shows mission-style agent work with scoped objectives, status reporting, and operator handoff.";
    }
    if (sourceKey.includes("long-running harnesses")) {
      return "Explains how long-running agents stay observable, recoverable, and supervised.";
    }
    if (sourceKey.includes("arize")) {
      return "Shows how telemetry connects agent runs, traces, and future improvements.";
    }
    if (sourceKey.includes("agent evals") || sourceKey.includes("anthropic evals")) {
      return "Explains evaluation patterns for judging agent behavior beyond one-off task completion.";
    }
    if (sourceKey.includes("guardrails")) {
      return "Explains approval and guardrail patterns for keeping agent actions bounded by human review.";
    }
    if (sourceKey.includes("langgraph")) {
      return "Explains checkpointing and persistence patterns for carrying state across agent runs.";
    }
    if (sourceKey.includes("opentelemetry")) {
      return "Defines trace vocabulary for making agent steps and handoffs inspectable.";
    }
    if (sourceKey.includes("owasp")) {
      return "Frames excessive-agency risk so the case study can show bounded agent permissions and checks.";
    }
    if (sourceKey.includes("nist ai rmf")) {
      return "Frames responsible AI risk-management language for agent-system design.";
    }
    if (sourceKey.includes("nist ai agent")) {
      return "Frames standards work around agent identity, interoperability, and system boundaries.";
    }
    if (sourceKey.includes("agentrx")) {
      return "Shows systematic agent-debugging patterns through traces and review loops.";
    }
    if (sourceKey.includes("stagehand")) {
      return "Shows browser-control patterns for cached actions and lower-cost UI automation.";
    }
    if (sourceKey.includes("playwright")) {
      return "Shows browser-agent testing patterns for repeatable UI actions and page-state checks.";
    }
    if (sourceKey.includes("browser-use")) {
      return "Shows browser-harness patterns for agentic web interaction and recovery paths.";
    }
  }

  if (caseStudy.slug === "ecosmartloop") {
    if (sourceKey.includes("retrospective")) {
      return "Preserves the original project writeup behind the waste-sorting prototype and capstone story.";
    }
    if (sourceKey.includes("repository")) {
      return "Shows public prototype structure, implementation artifacts, and product direction.";
    }
    if (sourceKey.includes("live demo")) {
      return "Lets readers inspect the bin-side scanning and guidance flow.";
    }
    if (sourceKey.includes("unep")) {
      return "Anchors the global waste-management scale behind the product problem.";
    }
    if (sourceKey.includes("sb 1383") || sourceKey.includes("calrecycle")) {
      return "Explains California organics, collection, contamination, recordkeeping, and cost constraints behind the product scenario.";
    }
    if (sourceKey.includes("cool california")) {
      return "Explains business sustainability incentives behind the operations framing.";
    }
    if (sourceKey.includes("grants")) {
      return "Shows recycling-innovation funding context around public-sector and market direction.";
    }
    if (sourceKey.includes("epa")) {
      return "Shows point-of-disposal sorting research behind scanner-assisted behavior change.";
    }
    if (sourceKey.includes("nist")) {
      return "Explains AI and recycling-efficiency framing behind ML-assisted sorting.";
    }
    if (sourceKey.includes("behavior change") || sourceKey.includes("campus race")) {
      return "Frames behavior-change strategy behind repeated better sorting decisions.";
    }
    if (sourceKey.includes("google ai")) {
      return "Guides public case-study structure for AI search and assistant-readable pages.";
    }
    if (sourceKey.includes("portfolio")) {
      return "Guides UX portfolio readability for hiring and collaboration review.";
    }
  }

  if (caseStudy.slug === "oakminder") {
    if (sourceKey.includes("docs index") || sourceKey.includes("explore")) {
      return "Gives assistants a compact map of Oakminder product documentation and features.";
    }
    if (sourceKey.includes("welcome") || sourceKey.includes("why oakminder")) {
      return "Explains the reminder follow-through problem and product positioning.";
    }
    if (sourceKey.includes("quick start")) {
      return "Shows onboarding flow for first-time reminder setup.";
    }
    if (sourceKey.includes("custom snooze")) {
      return "Explains flexible reminder rescheduling behind the snooze feature.";
    }
    if (sourceKey.includes("recurring reminders")) {
      return "Explains repeat-reminder behavior behind habit-style follow-through.";
    }
    if (sourceKey.includes("voice agent")) {
      return "Explains natural-language reminder creation and control.";
    }
    if (sourceKey.includes("cross-device")) {
      return "Explains sync requirements for consistent reminder state across devices.";
    }
    if (sourceKey.includes("native alarms") || sourceKey.includes("live activity")) {
      return "Explains native iOS urgency surfaces for alarms, timers, and lock-screen reminder states.";
    }
    if (sourceKey.includes("agenda") || sourceKey.includes("analytics") || sourceKey.includes("categories")) {
      return "Explains product surfaces for organizing, reviewing, and understanding reminder activity.";
    }
    if (sourceKey.includes("who built")) {
      return "Connects product identity back to Steve Oak / Okkar Kyaw.";
    }
    if (sourceKey.includes("superwall")) {
      return "Informs mobile subscription and growth learning from founder interviews.";
    }
    if (sourceKey.includes("onboarding")) {
      return "Informs product onboarding decisions with platform design guidance.";
    }
    if (sourceKey.includes("notification")) {
      return "Explains Android notification permission behavior for reminder delivery.";
    }
    if (sourceKey.includes("mintlify")) {
      return "Explains AI-native docs patterns used to make product information readable by people and assistants.";
    }
    if (sourceKey.includes("tiktok")) {
      return "Frames creator-market and AI-creative tooling behind the distribution-studio workflow.";
    }
    if (sourceKey.includes("revenuecat")) {
      return "Explains mobile subscription and paywall patterns for premium reminder features.";
    }
    if (sourceKey.includes("convex")) {
      return "Explains realtime backend behavior for shared reminder state and sync.";
    }
    if (sourceKey.includes("vision")) {
      return "Explains OCR extraction for creative and research inputs in the distribution studio.";
    }
    if (sourceKey.includes("postiz")) {
      return "Explains publishing API handoff for distribution workflows.";
    }
    if (sourceKey.includes("app intents")) {
      return "Explains Apple automation hooks for native app actions and voice-driven workflows.";
    }
    if (sourceKey.includes("llms.txt")) {
      return "Defines concise AI-readable documentation format used by the product docs surface.";
    }
  }

  if (caseStudy.slug === "agentic-brain") {
    return "Connects the earlier January 2026 memory experiment to newer durable-memory, retrieval, and context-routing work.";
  }

  return `Explains how ${source.label} relates to ${caseStudy.projectName}'s system design and public story.`;
}

function caseStudyStatusLabel(caseStudy: CaseStudy) {
  if (isInProgressCaseStudy(caseStudy)) return "case study in progress";
  if (caseStudy.evidenceStatus.publishMode === "publish-ready") return "published case study";
  return "case study";
}

function caseStudyClaimBoundaries(caseStudy: CaseStudy) {
  const boundaries = [
    ...baseClaimBoundaries(),
    "Case-study pages describe Steve Oak's public role, system shape, artifacts, and proof where those details are available.",
    "Referenced tools, platforms, schools, or companies are context for the work; they do not imply sponsorship, endorsement, partnership, or official platform approval.",
  ];

  if (isInProgressCaseStudy(caseStudy)) {
    boundaries.push(
      "This is an intentional public in-progress case study. It describes the approved workflow shape while screenshots, diagrams, outcome metrics, and implementation details remain under review.",
      "Do not infer measured reliability, publishing, growth, revenue, client-result, or business-impact outcomes unless the page names approved public evidence.",
    );
  }

  if (caseStudy.slug === "agentic-brain") {
    boundaries.push(
      "Agentic Brain explains memory-system architecture and retrieval surfaces at a public systems level; sensitive project operations stay outside the public page.",
    );
  }

  if (caseStudy.slug === "omnisocial") {
    boundaries.push(
      "OmniSocial explains the content-production workflow and browser/API publishing split; it does not claim platform bypasses, guaranteed publishing success, client outcomes, or account-level performance.",
    );
  }

  return boundaries;
}

function publicProofSignalsForCaseStudy(caseStudy: CaseStudy): MachineFact[] {
  const metricFacts = caseStudy.metrics
    .filter(oakPublishable)
    .map((metric) => fact(metric.label, `${metric.value}: ${metric.note}`, "Case study"));

  const artifactFacts = caseStudy.artifacts
    .filter(oakPublishable)
    .map((artifact) =>
      fact(
        artifact.label,
        artifact.href ? `${artifact.note} ${artifact.href}` : artifact.note,
        "Case study",
      ),
    );

  return [...metricFacts, ...artifactFacts];
}

function caseStudyCardSignal(caseStudy: CaseStudy) {
  return `${caseStudy.projectName} (${caseStudyStatusLabel(caseStudy)}): ${caseStudy.card.category}`;
}

function caseStudyCoverageSignal(caseStudy: CaseStudy) {
  return `${caseStudy.projectName} (${caseStudyStatusLabel(caseStudy)}): ${caseStudy.card.category}. ${caseStudy.description}`;
}

function caseStudySummarySignal(caseStudy: CaseStudy) {
  const sourceSummary = caseStudy.machineSummary || caseStudy.description;
  const publicSummary = removeNegativeEvidenceSentences(sourceSummary);
  return firstPublicSentences(publicSummary, isInProgressCaseStudy(caseStudy) ? 4 : 2);
}

function caseStudySignals(caseStudies: CaseStudy[]) {
  return sortCaseStudiesByPublishedDateDesc(caseStudies).map(caseStudyCardSignal);
}

function caseStudyCoverage(caseStudies: CaseStudy[]) {
  return sortCaseStudiesByPublishedDateDesc(caseStudies).map(caseStudyCoverageSignal);
}

function inProgressCaseStudySignal(caseStudies: CaseStudy[]) {
  const inProgressCaseStudies = sortCaseStudiesByPublishedDateDesc(caseStudies).filter(isInProgressCaseStudy);
  if (inProgressCaseStudies.length === 0) return [];
  return inProgressCaseStudies.map((caseStudy) => `${caseStudy.projectName}: case study in progress for ${caseStudy.card.category}.`);
}

function machineDescriptionFor(item: { description: string; machineDescription?: string }) {
  return item.machineDescription ?? item.description;
}

function isNegativeEvidenceCopy(value: string) {
  return /avoid|outside (?:the )?public evidence|outside the claim|out of scope|not claim|not infer|does not ask readers|unpublished|not part of the public record|not part of the public evidence|does not prove|not shown on this page|unsupported|claim limits?|proof still needs review|requires separate public evidence|remain outside|remains outside|performance metrics|operating records/i.test(
    value,
  );
}

function removeNegativeEvidenceSentences(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return normalized
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .filter((sentence) => !isNegativeEvidenceCopy(sentence))
    .join(" ")
    .trim();
}

function caseStudyMachineQuestionIsUseful(question: { heading: string; answer: string }) {
  const combined = `${question.heading} ${question.answer}`;
  return (
    !isNegativeEvidenceCopy(combined) &&
    !/public evidence|what evidence|which evidence|which sources|metrics.*avoid|visuals.*interpreted|external (?:research|context) supports|remains outside|not infer|take as proven/i.test(
      question.heading,
    )
  );
}

const featureSignal = featureCards.map((card) => `${card.title}: ${machineDescriptionFor(card)}`);
const proofSignal = proofSections.map((section) => `${section.title}: ${machineDescriptionFor(section)}`);
const stagedWorkCards = platformCards.filter((card) => card.disabled);
const careerTimelineFacts = careerTimelineItems.map((item) => {
  const contexts = item.contexts
    .map((context) => `${context.title} (${careerContextMetadata(context)})`)
    .join("; ");
  const groupedItems = (section: "Highlights" | "Stack", groups: typeof item.highlights) =>
    groups.flatMap((group) =>
      group.items.map((entry) => `${section}${group.label ? ` / ${group.label}` : ""}: ${entry}`),
    );

  return fact(
    item.place,
    `${item.label}. ${item.date}. ${contexts}. ${item.title}. ${item.summary}`,
    "Work",
    [
      `Badges: ${item.badges.join(", ")}`,
      ...groupedItems("Highlights", item.highlights),
      ...groupedItems("Stack", item.stack),
    ],
  );
});
const workspaceSignal = workspaceRows.flat().map((item) => item.label).join(", ");

function createHomeMachinePage(caseStudies: CaseStudy[]): MachinePage {
  const orderedCaseStudies = sortCaseStudiesByPublishedDateDesc(caseStudies);
  const liveWorkSignal = caseStudySignals(orderedCaseStudies);
  const workCoverageSignal = caseStudyCoverage(orderedCaseStudies);
  const stubSignal = inProgressCaseStudySignal(orderedCaseStudies);
  const path = "/";
  const markdownHref = markdownHrefForPath(path);
  const markdownApiHref = markdownApiHrefForPath(path);
  const machineJsonHref = machineJsonHrefForPath(path);

  return {
    id: "home",
    path,
    title: "Steve Oak / Okkar Kyaw",
    shortTitle: "Home",
    summary:
      "Steve Oak is Okkar Kyaw, a Bay Area AI/design engineer focused on applied AI systems, agent workflows, retrieval and tool workflows, eval loops, cost/token optimization, memory, and product surfaces that make model behavior easier to inspect and trust.",
    pageType: "homepage",
    stage: siteVisibility.stage === "draft" ? "public preview" : "published",
    schemaTypes: ["Person", "ProfilePage", "WebSite", "WebPage", "BreadcrumbList"],
    answerBlocks: [
      answer(
        "Who is Steve Oak / Okkar Kyaw?",
        `${profileSummary.description} Oak is the working name on SteveOak.com; Okkar Kyaw is the real name used where identity needs to be explicit.`,
        "Profile",
      ),
      answer(
        "What work does SteveOak.com emphasize?",
        "The site centers on useful AI products: memory and retrieval workflows, tool-using agents, evaluation loops, cost/token optimization, browser/API harnesses, and interfaces that make automated work inspectable. The homepage themes include:",
        "Proof",
        [...featureSignal, ...proofSignal],
      ),
      answer(
        "What public work is available now?",
        "The current Work section includes case studies and case studies in progress.",
        "Work",
        workCoverageSignal,
      ),
      answer(
        "How should Bay Area context be read?",
        "Bay Area is a truthful personal location, hiring, and collaboration signal. It does not make the portfolio a local services listing.",
        "Policy",
      ),
      answer(
        "How should this site be used?",
        "Use SteveOak.com as a public portfolio for AI product, design-engineering, and agent-systems work.",
        "Policy",
      ),
    ],
    facts: profileSummary.facts.map((fact) => ({
      label: fact.label,
      value: `${fact.value}: ${fact.description}`,
      source: "Profile",
    })),
    localSignals: [
      fact(
        "Portfolio context",
        "Bay Area AI/design-engineering profile signal for hiring, collaboration, founders, and local AI teams.",
        "Policy",
      ),
      fact(
        "Not a local listing",
        "No address, phone number, hours, maps, reviews, service-area pages, or near-me positioning are part of this portfolio.",
        "Policy",
      ),
    ],
    proofSignals: [
      fact("Proof themes", "Homepage proof themes.", "Proof", proofSignal),
      fact("Habit signals", "Homepage feature cards.", "Profile", featureSignal),
      fact(
        "Work entries",
        "Current Work entries.",
        "Work",
        liveWorkSignal,
      ),
      fact(
        "In-progress case studies",
        stubSignal.length > 0 ? "Case studies in progress." : "None.",
        "Work",
        stubSignal,
      ),
      fact(
        "Upcoming work areas",
        stagedWorkCards.length > 0 ? "Planned or disabled Work cards." : "None.",
        "Work",
        stagedWorkCards.map((card) => `${card.title}: ${card.category}`),
      ),
      fact("Recurring interests", workspaceSignal, "Profile"),
    ],
    links: uniqueLinks([
      ...siteResourceLinks,
      link("Work index", "/work", "work-proof", "Browse current case studies, legacy work, and project context.", "sourceData"),
      ...orderedCaseStudies.map((caseStudy) =>
        link(
          `${caseStudy.projectName} case study`,
          `/work/${caseStudy.slug}`,
          "work-proof",
          `Read the ${caseStudy.projectName} story, role, system map, and supported claims.`,
          "sourceData",
        ),
      ),
      ...socialLinks.map((socialLink) =>
        link(
          `Oak on ${socialLink.label}`,
          socialLink.href,
          "oak-social-profiles",
          `Steve Oak / Okkar Kyaw public profile on ${socialLink.label}.`,
          socialLink.icon,
        ),
      ),
    ]),
    crawlNotes: [
      "This page is available as visible profile text, copy-friendly text, and JSON.",
      "Markdown, JSON, and LLM files use the same page facts shown in the portfolio.",
      "Use the linked Work pages for project-specific evidence.",
    ],
    queryIntents: [
      "Who is Steve Oak / Okkar Kyaw?",
      "What applied AI systems has Steve Oak built?",
      "Which SteveOak.com Work pages show retrieval, tools, memory, and evaluation loops?",
      "How does Steve Oak combine design engineering with AI product work?",
    ],
    retrievalHints: retrievalHintsForPage(path, [
      "Use /work.md or the linked Work pages for project-specific evidence.",
    ]),
    claimBoundaries: [
      ...baseClaimBoundaries(),
      "Production deployment, revenue, adoption, and platform approval depend on what each Work page explicitly supports.",
    ],
    agentActions: agentActions(),
    markdownHref,
    markdownApiHref,
    machineJsonHref,
  };
}

function createWorkIndexMachinePage(caseStudies: CaseStudy[]): MachinePage {
  const orderedCaseStudies = sortCaseStudiesByPublishedDateDesc(caseStudies);
  const publicCaseStudySignal = caseStudyCoverage(orderedCaseStudies);
  const liveWorkSignal = caseStudySignals(orderedCaseStudies);
  const stubSignal = inProgressCaseStudySignal(orderedCaseStudies);
  const legacyWorkSignal = legacyFramerCaseStudies.map((card) => `${card.title}: ${card.category}`);
  const path = "/work";
  const markdownHref = markdownHrefForPath(path);
  const markdownApiHref = markdownApiHrefForPath(path);
  const machineJsonHref = machineJsonHrefForPath(path);

  return {
    id: "work",
    path,
    title: "Work | Steve Oak",
    shortTitle: "Work",
    summary:
      "SteveOak.com Work index for current case studies, case studies in progress, a compact career snapshot, and selected legacy work.",
    pageType: "work-index",
    stage: siteVisibility.stage === "draft" ? "public preview" : "published",
    schemaTypes: ["CollectionPage", "WebPage", "ItemList", "BreadcrumbList", "Person"],
    answerBlocks: [
      answer(
        "What is the Work page?",
        "The Work page starts with a compact career preview, then separates current applied-AI case studies from selected older external case studies.",
        "Work",
      ),
      answer(
        "What does the career timeline show?",
        careerTimelineIntro.machineSubtitle,
        "Work",
      ),
      answer(
        "Which case studies are available?",
        "The current Work collection includes these public entries.",
        "Work",
        liveWorkSignal.length > 0 ? liveWorkSignal : publicCaseStudySignal,
      ),
      answer(
        "What do the current case studies cover?",
        "Each Work entry has a readable page, a copy-friendly text version, and JSON facts for agents or search systems.",
        "Case study",
        publicCaseStudySignal,
      ),
      answer(
        "What is in the Legacy section?",
        "The Legacy section links older external Framer case studies for chronology and background.",
        "Work",
        legacyWorkSignal,
      ),
      answer(
        "How should the Work page be used?",
        "Use the Work page as a portfolio index for public case studies, case studies in progress, and selected legacy work.",
        "Policy",
      ),
    ],
    facts: [
      fact("Primary route", "/work", "Work"),
      ...careerTimelineFacts,
      fact("Work entries", liveWorkSignal.length > 0 ? "Current Work entries." : "None.", "Work", liveWorkSignal),
      fact("In-progress case studies", stubSignal.length > 0 ? "Case studies in progress." : "None.", "Work", stubSignal),
      fact("Legacy Framer case studies", legacyWorkSignal.length > 0 ? "Selected older external case studies." : "None.", "Work", legacyWorkSignal),
    ],
    localSignals: [
      fact(
        "Portfolio context",
        "Bay Area can be used as a truthful personal, hiring, collaboration, and local AI-team signal.",
        "Policy",
      ),
    ],
    proofSignals: [
      fact("Current Work coverage", "Current Work entries.", "Work", liveWorkSignal.length > 0 ? liveWorkSignal : publicCaseStudySignal),
      fact("Case-study coverage", "Current case-study coverage.", "Case study", publicCaseStudySignal),
      fact("Legacy section", "Selected older external Framer case studies.", "Work", legacyWorkSignal),
    ],
    links: uniqueLinks([
      ...pageResourceLinks(path),
      ...siteResourceLinks,
      ...orderedCaseStudies.map((caseStudy) =>
        link(
          `${caseStudy.projectName} case study`,
          `/work/${caseStudy.slug}`,
          "work-proof",
          "Read the case study summary, project scope, and current evidence.",
          "sourceData",
        ),
      ),
      ...orderedCaseStudies.map((caseStudy) =>
        link(
          `${caseStudy.projectName} markdown`,
          `/work/${caseStudy.slug}.md`,
          "markdown-mirrors",
          `Copy-friendly text version of the ${caseStudy.projectName} case study.`,
          "documentCode",
        ),
      ),
      ...orderedCaseStudies.map((caseStudy) =>
        link(
          `${caseStudy.projectName} markdown API`,
          `/api/md/work/${caseStudy.slug}`,
          "markdown-mirrors",
          `Copy-friendly text endpoint for the ${caseStudy.projectName} case study.`,
          "documentCode",
        ),
      ),
      ...orderedCaseStudies.map((caseStudy) =>
        link(
          `${caseStudy.projectName} structured JSON`,
          `/api/machine/${caseStudy.slug}.json`,
          "structured-data",
          `Page facts and public links for ${caseStudy.projectName}.`,
          "dataFile",
        ),
      ),
      ...legacyFramerCaseStudies.map((card) =>
        link(
          `${card.title} Framer case study`,
          card.href,
          "work-proof",
          `External legacy Framer case study for ${card.category}.`,
          "link",
        ),
      ),
    ]),
    crawlNotes: [
      "The Work index is available as visible page text, copy-friendly text, and JSON.",
      "The Work page shows a compact latest-career preview before the live case-study and legacy grids.",
      "Markdown and JSON resources keep the Work list easy to inspect.",
    ],
    queryIntents: uniqueValues([
      "What case studies are available on SteveOak.com?",
      "What does Steve Oak's recent career timeline show?",
      "Which Work pages cover applied AI, memory, retrieval, tools, and product design?",
      ...caseStudies.flatMap((caseStudy) => [`What is ${caseStudy.projectName}?`, `What does ${caseStudy.projectName} cover?`]),
    ]),
    retrievalHints: retrievalHintsForPage(path, [
      "Use the Work Markdown or JSON for current case studies, external legacy work, and the career preview.",
      "Use each case-study text version for scoped evidence, sources, and boundaries.",
    ]),
    claimBoundaries: [
      "External Legacy Framer links provide chronology and background rather than current SteveOak.com MDX case-study evidence.",
      "Unsupported adoption, revenue, production usage, model accuracy, and platform approval are outside the Work index evidence.",
    ],
    agentActions: agentActions(),
    markdownHref,
    markdownApiHref,
    machineJsonHref,
  };
}

function createCaseStudyMachinePage(caseStudy: CaseStudy): MachinePage {
  const path = `/work/${caseStudy.slug}`;
  const markdownHref = markdownHrefForPath(path);
  const markdownApiHref = markdownApiHrefForPath(path);
  const machineJsonHref = machineJsonHrefForPath(path);
  const updatedDate = caseStudy.dateUpdated ?? caseStudy.datePublished;
  const curatedAnswers =
    caseStudy.machineQuestions.length > 0
      ? caseStudy.machineQuestions
          .filter(caseStudyMachineQuestionIsUseful)
          .map((question) => answer(question.heading, question.answer, "Case study"))
      : [
          answer(`What is ${caseStudy.projectName}?`, caseStudy.problem.summary, "Case study"),
          answer("What did Oak own?", caseStudy.ownership.oak.join(" "), "Case study"),
        ];

  return {
    id: caseStudy.slug,
    path,
    title: `${caseStudy.projectName} | Steve Oak case study`,
    shortTitle: caseStudy.projectName,
    summary: caseStudySummarySignal(caseStudy),
    pageType: "case-study",
    stage: caseStudy.evidenceStatus.publishMode === "publish-ready" ? "published" : "public preview",
    schemaTypes: ["TechArticle", "WebPage", "BreadcrumbList", "Person"],
    answerBlocks: [
      ...curatedAnswers,
      answer(
        "What is the full system map?",
        "The system map breaks the project into these public components.",
        "Case study",
        caseStudy.systemMap.map((step) => `${step.label}: ${step.description}`),
      ),
    ],
    facts: [
      fact("Project", caseStudy.projectName, "Case study"),
      fact("Author", "Steve Oak / Okkar Kyaw", "Profile"),
      fact("Published", caseStudy.datePublished.toISOString().slice(0, 10), "Case study"),
      fact("Updated", updatedDate.toISOString().slice(0, 10), "Case study"),
      fact("Role", caseStudy.role, "Case study"),
      fact("Timeline", caseStudy.timeline, "Case study"),
      fact("Stack", caseStudy.stack.join(", "), "Case study"),
      fact("Article tags", caseStudy.schema.about.join(", "), "Case study"),
      fact("Case-study state", caseStudyStatusLabel(caseStudy), "Case study"),
    ],
    localSignals:
      caseStudy.slug === "ecosmartloop"
        ? [
            fact(
              "California context",
              "Built at San Francisco Bay University (SFBU) in Fremont with California SB 1383 as product context for education, organics diversion, contamination monitoring, and behavior change.",
              "Case study",
            ),
            fact(
              "Bay Area relevance",
              "Relevant to Bay Area AI product, applied AI, design engineering, and trust-oriented product conversations.",
              "Policy",
            ),
          ]
        : caseStudy.slug === "linkedin-growth-loop"
          ? [
              fact(
                "Portfolio relevance",
                "Shows applied AI, agent workflows, LLMOps, browser control, internal tooling, and AI product judgment.",
                "Case study",
              ),
              fact(
                "Bay Area relevance",
                "Relevant to Bay Area AI teams evaluating agent orchestration, trustworthy automation, browser control, evaluation loops, and AI UX.",
                "Policy",
              ),
            ]
        : caseStudy.slug === "oakminder"
          ? [
              fact(
                "Portfolio relevance",
                "Shows mobile AI product engineering, voice-agent reminder workflows, native urgency, AI docs, MCP answer surfaces, and founder-built distribution systems.",
                "Case study",
              ),
              fact(
                "Bay Area relevance",
                "Relevant to Bay Area AI/product teams evaluating applied mobile AI, product taste, voice-agent workflows, native app constraints, and distribution learning loops.",
                "Policy",
              ),
            ]
          : [
            fact(
              "Portfolio relevance",
              "Shows applied AI, agent workflow, LLMOps, AI product, and AI UX judgment.",
              "Case study",
            ),
            fact(
              "Bay Area relevance",
              "Relevant to Bay Area AI teams evaluating applied systems, product taste, and agent workflows.",
              "Policy",
            ),
          ],
    proofSignals: publicProofSignalsForCaseStudy(caseStudy),
    links: uniqueLinks([
      ...pageResourceLinks(path),
      ...siteResourceLinks,
      link("Work index", "/work", "work-proof", "Browse nearby case studies and the broader Work collection.", "sourceData"),
      ...caseStudy.sources.map((source) =>
        link(source.label, source.href, "work-proof", caseStudySourceDescription(caseStudy, source), "link"),
      ),
    ]),
    crawlNotes: [
      "This page gives direct answers for readers, recruiters, and collaborators.",
      "Details come from the Work entry: summary, role, sources, artifacts, and system map.",
      "The article tells the story; this view keeps direct answers, source references, and local relevance easy to scan.",
    ],
    queryIntents: uniqueValues([
      `What is ${caseStudy.projectName}?`,
      `What did Steve Oak own in ${caseStudy.projectName}?`,
      `What system or workflow does ${caseStudy.projectName} show?`,
      ...caseStudy.machineQuestions
        .filter(caseStudyMachineQuestionIsUseful)
        .map((question) => question.heading),
      ...caseStudy.jobMappings.map((mapping) => `How does ${caseStudy.projectName} relate to ${mapping.roleFamily}?`),
    ]),
    retrievalHints: retrievalHintsForPage(path, [
      `Use ${markdownHref} for the case-study summary, system map, source references, and role context.`,
      `Use ${machineJsonHref} for structured page facts and links.`,
    ]),
    claimBoundaries: caseStudyClaimBoundaries(caseStudy),
    agentActions: agentActions(),
    markdownHref,
    markdownApiHref,
    machineJsonHref,
  };
}

type KusalaDailyPageConfig = {
  id: string;
  path: string;
  title: string;
  shortTitle: string;
  summary: string;
  schemaTypes: string[];
  answerBlocks: MachineAnswerBlock[];
  facts: MachineFact[];
  crawlNotes: string[];
  queryIntents: string[];
  claimBoundaries: string[];
};

const kusalaDailyPageConfigs: KusalaDailyPageConfig[] = [
  {
    id: "kusala-daily",
    path: "/apps/kusala-daily",
    title: "Kusala Daily | Steve Oak",
    shortTitle: "Kusala Daily",
    summary:
      "Kusala Daily is a free, private, offline iPhone and iPad app for two independent 108-count prayer practices and a bundled 24-section Paccayo reader.",
    schemaTypes: ["MobileApplication", "WebPage", "BreadcrumbList", "Person"],
    answerBlocks: [
      answer(
        "What is Kusala Daily?",
        "Kusala Daily combines two independent 108-count prayer trackers with a continuous 24-section Paccayo reader for iPhone and iPad.",
        "App",
      ),
      answer(
        "What does the app store?",
        "Prayer progress, the selected prayer, the last Paccayo section, and the reader text-size preset stay on the device.",
        "App",
      ),
      answer(
        "Does Kusala Daily collect data?",
        "No. The app has no account, advertising, analytics, tracking, cloud sync, or network feature.",
        "Policy",
      ),
      answer(
        "How much will Kusala Daily cost?",
        "Kusala Daily will be free to download after App Store review.",
        "App",
      ),
    ],
    facts: [
      fact("Platforms", "iPhone and iPad", "App"),
      fact("Minimum system", "iOS and iPadOS 16.0", "App"),
      fact("Price", "Free", "App"),
      fact("Privacy", "No data collected or tracked", "Policy"),
      fact("Connectivity", "Offline; no account or network connection", "App"),
    ],
    crawlNotes: [
      "This is the official product information page for Kusala Daily on SteveOak.com.",
      "The app is in release preparation and is not yet available for download.",
      "Use the linked privacy and support pages for App Store review and user assistance.",
    ],
    queryIntents: [
      "What is Kusala Daily?",
      "Is Kusala Daily free?",
      "Does Kusala Daily collect personal data?",
      "Which iPhone and iPad versions support Kusala Daily?",
    ],
    claimBoundaries: [
      "The page does not claim religious authority, doctrinal verification, health outcomes, or guaranteed effects.",
      "Availability begins only after App Store review; this page is not an App Store download listing.",
    ],
  },
  {
    id: "kusala-daily-privacy",
    path: "/apps/kusala-daily/privacy",
    title: "Privacy Policy | Kusala Daily",
    shortTitle: "Kusala Daily Privacy",
    summary:
      "Kusala Daily collects no personal data. Prayer progress and reader preferences are stored locally on the device.",
    schemaTypes: ["WebPage", "BreadcrumbList", "Person"],
    answerBlocks: [
      answer(
        "Does Kusala Daily collect personal data?",
        "No. Kusala Daily does not collect, transmit, sell, share, or track personal data.",
        "Policy",
      ),
      answer(
        "What information stays on the device?",
        "Prayer counts, the selected prayer, the last Paccayo section, and the reader text-size preference are stored locally so the app can restore state.",
        "App",
      ),
      answer(
        "Does the app use analytics or advertising?",
        "No. Kusala Daily has no analytics, advertising, account system, cloud service, or network feature.",
        "Policy",
      ),
    ],
    facts: [
      fact("Data collection", "None", "Policy"),
      fact("Tracking", "None", "Policy"),
      fact("Local storage", "Prayer progress and reader preferences", "App"),
      fact("Contact", "Use the Kusala Daily support page for privacy questions", "Policy"),
    ],
    crawlNotes: [
      "This is the official Kusala Daily privacy policy.",
      "The policy describes the app's local-only state and separates Apple-operated services from the app.",
    ],
    queryIntents: [
      "What is the Kusala Daily privacy policy?",
      "Does Kusala Daily track users?",
      "Where does Kusala Daily store prayer progress?",
    ],
    claimBoundaries: [
      "Apple-operated App Store, TestFlight, backup, and operating-system services are governed separately by Apple.",
    ],
  },
  {
    id: "kusala-daily-support",
    path: "/apps/kusala-daily/support",
    title: "Support | Kusala Daily",
    shortTitle: "Kusala Daily Support",
    summary:
      "Official help for Kusala Daily prayer tracking, the 24 Paccayo reader, accessibility, and app behavior.",
    schemaTypes: ["WebPage", "BreadcrumbList", "Person"],
    answerBlocks: [
      answer(
        "How do I count a prayer?",
        "Select a prayer and tap the gold count action. Undo changes only the selected prayer, and reset actions ask for confirmation.",
        "App",
      ),
      answer(
        "How do I navigate the 24 Paccayo reader?",
        "Open the 24 Paccayo tab, use the list control to jump to any section, and use the minus and plus controls to adjust the reader text preset.",
        "App",
      ),
      answer(
        "Which accessibility features are supported?",
        "Kusala Daily supports Dynamic Type, VoiceOver, Voice Control, Reduce Motion, Reduce Transparency, Increased Contrast, keyboard navigation, and responsive iPhone and iPad layouts.",
        "App",
      ),
      answer(
        "How do I contact support?",
        "Use the Say Hi control on the support page and include the device model, system version, and a short description of the issue.",
        "Policy",
      ),
    ],
    facts: [
      fact("Support scope", "Prayer tracking, reader navigation, accessibility, and troubleshooting", "App"),
      fact("Account required", "No", "App"),
      fact("Network required", "No", "App"),
    ],
    crawlNotes: [
      "This is the official Kusala Daily support page.",
      "The support page keeps direct email and Say Hi contact controls for Steve Oak.",
    ],
    queryIntents: [
      "How do I use Kusala Daily?",
      "How do I reset a Kusala Daily prayer count?",
      "How do I change Paccayo reader text size?",
      "How do I contact Kusala Daily support?",
    ],
    claimBoundaries: [
      "Support guidance describes current app behavior and does not provide religious, medical, or therapeutic advice.",
    ],
  },
];

function createKusalaDailyMachinePages(): MachinePage[] {
  return kusalaDailyPageConfigs.map((config) => {
    const markdownHref = markdownHrefForPath(config.path);
    const machineJsonHref = machineJsonHrefForPath(config.path);

    return {
      id: config.id,
      path: config.path,
      title: config.title,
      shortTitle: config.shortTitle,
      summary: config.summary,
      pageType: "app-info",
      stage: siteVisibility.stage === "draft" ? "public preview" : "published",
      schemaTypes: config.schemaTypes,
      answerBlocks: config.answerBlocks,
      facts: config.facts,
      localSignals: [],
      proofSignals: [
        fact(
          "Public product surface",
          "Visible Human page, Markdown mirror, structured JSON, canonical metadata, and sitemap entry.",
          "Policy",
        ),
      ],
      links: uniqueLinks([
        ...pageResourceLinks(config.path),
        link(
          "Kusala Daily",
          "/apps/kusala-daily",
          "public-context-files",
          "Official product information for the free offline iPhone and iPad app.",
          "sourceData",
        ),
        link(
          "Privacy policy",
          "/apps/kusala-daily/privacy",
          "public-context-files",
          "How Kusala Daily handles on-device state and personal data.",
          "documentCode",
        ),
        link(
          "Support",
          "/apps/kusala-daily/support",
          "public-context-files",
          "Help with prayer tracking, the Paccayo reader, accessibility, and contact.",
          "link",
        ),
      ]),
      crawlNotes: config.crawlNotes,
      queryIntents: config.queryIntents,
      retrievalHints: retrievalHintsForPage(config.path),
      claimBoundaries: config.claimBoundaries,
      agentActions: agentActions(),
      markdownHref,
      machineJsonHref,
    };
  });
}

function createNotFoundMachinePage(): MachinePage {
  const path = "/404";
  const markdownHref = markdownHrefForPath(path);
  const markdownApiHref = markdownApiHrefForPath(path);
  const machineJsonHref = machineJsonHrefForPath(path);

  return {
    id: "404",
    path,
    title: "Page not found | Steve Oak",
    shortTitle: "404",
    summary:
      "SteveOak.com 404 recovery page. It gives visitors clear routes back to Work or the homepage.",
    pageType: "not-found",
    stage: siteVisibility.stage === "draft" ? "public preview" : "published",
    schemaTypes: ["WebPage", "Person"],
    answerBlocks: [
      answer(
        "What happened?",
        "The requested page was not found. The visible 404 page points visitors to Work and the homepage.",
        "Policy",
      ),
      answer(
        "What should visitors open next?",
        "Open /work for the portfolio case studies, or / for the homepage.",
        "Work",
      ),
      answer(
        "How should this page be used?",
        "Use the 404 page as a recovery surface, not a project case study or landing page.",
        "Policy",
      ),
    ],
    facts: [
      fact("Primary route", "/404", "Policy"),
      fact("Best recovery route", "/work", "Work"),
      fact("Home route", "/", "Profile"),
    ],
    localSignals: [
      fact(
        "Recovery context",
        "This route exists to help visitors return to the portfolio homepage or Work index.",
        "Policy",
      ),
    ],
    proofSignals: [
      fact("404 recovery", "Visible links return visitors to Work and Home.", "Policy"),
    ],
    links: uniqueLinks([
      ...pageResourceLinks(path),
      ...siteResourceLinks,
      link("Work", "/work", "work-proof", "Work index with case studies, legacy projects, and recovery links.", "sourceData"),
      link("Home", "/", "identity-files", "Main Steve Oak portfolio entry point.", "human"),
    ]),
    crawlNotes: [
      "The 404 page is user-visible and exists for recovery.",
      "Use Work or Home for substantive portfolio context.",
    ],
    queryIntents: [
      "Where is the Steve Oak Work page?",
      "Where is the Steve Oak homepage?",
      "How do visitors recover from a missing SteveOak.com page?",
    ],
    retrievalHints: retrievalHintsForPage(path, [
      "Open /work.md or /index.md for substantive portfolio context.",
    ]),
    claimBoundaries: ["The 404 page is a recovery route, not project proof or a landing page."],
    agentActions: agentActions(),
    markdownHref,
    markdownApiHref,
    machineJsonHref,
  };
}

export function createMachinePages(caseStudies: CaseStudy[]): MachinePage[] {
  return [
    createHomeMachinePage(caseStudies),
    createWorkIndexMachinePage(caseStudies),
    ...createKusalaDailyMachinePages(),
    createNotFoundMachinePage(),
    ...caseStudies.map(createCaseStudyMachinePage),
  ].map((page) => {
    const documentId = page.pageType === "case-study" ? `work:${page.id}` :
      page.pageType === "homepage" ? "profile:steve-oak" :
      page.pageType === "app-info" ? `resource:${page.id.replace("-privacy", ":privacy").replace("-support", ":support")}` : undefined;
    return { ...page, knowledgeRevision,
      sourceDocumentIds: documentId && getKnowledgeDocument(documentId) ? [documentId] : [] };
  });
}

export function getMachinePageByPath(pages: MachinePage[], pathname: string) {
  const normalized = normalizePath(pathname);
  return pages.find((page) => normalizePath(page.path) === normalized);
}

export function getMachinePageBySlug(pages: MachinePage[], slug: string) {
  return pages.find((page) => page.id === slug);
}

export function renderLlmsTxt(allPages: MachinePage[]) {
  const pages = allPages.filter((page) => page.pageType !== "not-found");
  return [
    "# SteveOak.com",
    "",
    `> ${siteProfile.description}`,
    "",
    "## Primary Pages",
    "",
    ...pages.flatMap((page) => {
      const markdownApiHref = pageMarkdownApiHref(page);
      return [
        `- [${page.title}](${absoluteUrl(page.path)}): ${page.summary}`,
        `  - Markdown: ${absoluteUrl(pageMarkdownHref(page))}`,
        ...(markdownApiHref ? [`  - Markdown API: ${absoluteUrl(markdownApiHref)}`] : []),
        `  - JSON: ${absoluteUrl(pageMachineJsonHref(page))}`,
      ];
    }),
    "",
    "## Public Data Files",
    "",
    ...siteResourceLinks.map((link) => `- [${link.label}](${absoluteUrl(link.href)})`),
    ...pages.map((page) => `- [${page.shortTitle} Markdown mirror](${absoluteUrl(pageMarkdownHref(page))})`),
    ...pages.flatMap((page) => {
      const href = pageMarkdownApiHref(page);
      return href ? [`- [${page.shortTitle} Markdown API](${absoluteUrl(href)})`] : [];
    }),
    ...pages.map((page) => `- [${page.shortTitle} structured JSON](${absoluteUrl(pageMachineJsonHref(page))})`),
    "",
    "## Good Questions",
    "",
    ...uniqueValues(pages.flatMap((page) => page.queryIntents ?? [])).map((intent) => `- ${intent}`),
    "",
    "## Useful Facts",
    "",
    `- Public name: ${siteProfile.name}.`,
    `- Other names: ${siteProfile.alternateNames.join(", ")}.`,
    `- Location signal: ${siteProfile.locationSignal}.`,
    `- Audience: ${siteProfile.audience}`,
    `- Focus: ${siteProfile.focus.join(", ")}.`,
    "",
    "## Public Context",
    "",
    "- SteveOak.com is a public portfolio for Steve Oak / Okkar Kyaw.",
    "- Bay Area context describes personal location, hiring relevance, and collaboration context.",
    "- Work pages should be read as project and case-study pages, not local services listings.",
    "",
  ].join("\n");
}

export function renderLlmsFullTxt(allPages: MachinePage[], credentials: readonly PublicCredentialRecord[] = []) {
  const pages = allPages.filter((page) => page.pageType !== "not-found");
  const credentialSection = renderPublicCredentialSection(credentials);
  return [
    renderLlmsTxt(pages).trimEnd(),
    "",
    "---",
    "",
    ...pages.map((page) => renderMachinePageMarkdown(page).trimEnd()),
    ...(credentialSection ? [credentialSection] : []),
    "",
  ].join("\n\n");
}

export function getProfileJson(pages: MachinePage[] = []) {
  const caseStudyPages = pages.filter((page) => page.pageType === "case-study");

  return {
    "@context": "https://schema.org",
    "version": knowledgeRevision,
    "@type": "Person",
    "@id": "https://steveoak.com/#person",
    "name": siteProfile.name,
    "alternateName": siteProfile.alternateNames,
    "url": siteProfile.url,
    "image": siteProfile.image,
    "description": siteProfile.description,
    "jobTitle": siteProfile.jobTitle,
    "homeLocation": {
      "@type": "Place",
      "name": "Bay Area",
    },
    "knowsAbout": siteProfile.focus,
    "sameAs": siteProfile.sameAs,
    "subjectOf": caseStudyPages.map((page) => ({
      "@type": "TechArticle",
      "name": page.shortTitle,
      "url": absoluteUrl(page.path),
      "description": page.summary,
    })),
    "mainEntityOfPage": "https://steveoak.com/",
  };
}

export function getAgentProfileJson(allPages: MachinePage[]) {
  const pages = allPages.filter((page) => page.pageType !== "not-found");
  const publicScopeNotes = uniqueValues(pages.flatMap((page) => page.claimBoundaries ?? []));

  return {
    schema: "steveoak.agent-profile.v1",
    knowledge_revision: knowledgeRevision,
    canonical_profile: "https://steveoak.com/profile.json",
    name: siteProfile.name,
    alternate_names: siteProfile.alternateNames,
    location_signal: siteProfile.locationSignal,
    focus: siteProfile.focus.map((item) => item.toLowerCase()),
    primary_pages: pages.map((page) => absoluteUrl(page.path)),
    pages: pages.map((page) => {
      const markdownApiHref = pageMarkdownApiHref(page);
      return {
        id: page.id,
        title: page.title,
        description: page.summary,
        path: absoluteUrl(page.path),
        markdown: absoluteUrl(pageMarkdownHref(page)),
        markdown_api: markdownApiHref ? absoluteUrl(markdownApiHref) : undefined,
        machine_json: absoluteUrl(pageMachineJsonHref(page)),
        content_status: page.stage,
        page_type: page.pageType,
        query_intents: page.queryIntents ?? [],
        public_resources: page.retrievalHints ?? [],
        public_scope_notes: page.claimBoundaries ?? [],
      };
    }),
    machine_pages: {
      summary: "https://steveoak.com/llms.txt",
      full: "https://steveoak.com/llms-full.txt",
      markdown_mirrors: pages.map((page) => absoluteUrl(pageMarkdownHref(page))),
      markdown_api: pages.flatMap((page) => {
        const href = pageMarkdownApiHref(page);
        return href ? [absoluteUrl(href)] : [];
      }),
      machine_json: pages.map((page) => absoluteUrl(pageMachineJsonHref(page))),
    },
    supported_action_menu_capabilities: agentActions(),
    same_as: siteProfile.sameAs,
    public_context:
      "SteveOak.com is a personal portfolio. Bay Area context is personal, hiring, and collaboration context, not a local services listing.",
    public_scope_notes: publicScopeNotes,
  };
}

export function renderSkillMarkdown(allPages: MachinePage[]) {
  const pages = allPages.filter((page) => page.pageType !== "not-found");
  const publicScopeNotes = uniqueValues(pages.flatMap((page) => page.claimBoundaries ?? []));
  const querySections = pages.flatMap((page) =>
    (page.queryIntents ?? []).map((intent) => `- ${page.shortTitle}: ${intent}`),
  );

  return [
    "# Steve Oak",
    "",
    "metadata:",
    `  canonical_profile: ${siteProfile.url}profile.json`,
    "  supported_actions: copy_markdown, ask_chatgpt, ask_claude, ask_perplexity",
    "",
    `${siteProfile.name}, also called ${siteProfile.alternateNames.join(" or ")}, builds applied AI systems with design-engineering taste.`,
    "",
    "## Good Fit",
    "",
    "- Bay Area AI teams looking for product-minded applied AI systems work.",
    "- Founders or teams that need cost-aware RAG/tool workflows, agent orchestration, eval loops, memory, retrieval, or feedback routing turned into usable product surfaces.",
    "- Design and product engineering teams that need complex model behavior to feel clear, inspectable, and trustworthy.",
    "",
    "## Public Pages",
    "",
    ...pages.map((page) => `- ${page.title}: ${absoluteUrl(page.path)}`),
    "",
    "## Markdown Mirrors",
    "",
    ...pages.map((page) => `- ${page.shortTitle}: ${absoluteUrl(pageMarkdownHref(page))}`),
    "",
    "## Markdown API",
    "",
    ...pages.flatMap((page) => {
      const href = pageMarkdownApiHref(page);
      return href ? [`- ${page.shortTitle}: ${absoluteUrl(href)}`] : [];
    }),
    "",
    "## Structured JSON",
    "",
    ...pages.map((page) => `- ${page.shortTitle}: ${absoluteUrl(pageMachineJsonHref(page))}`),
    "- Structured identity: https://steveoak.com/profile.json",
    "- Agent profile: https://steveoak.com/.well-known/agent-profile.json",
    "",
    "## LLM Resources",
    "",
    "- Compact LLM map: https://steveoak.com/llms.txt",
    "- Full LLM context: https://steveoak.com/llms-full.txt",
    "",
    "## Good Questions",
    "",
    ...uniqueValues(querySections),
    "",
    "## Scope",
    "",
    "- Treat SteveOak.com as a personal portfolio unless the live site says otherwise.",
    "- Bay Area is a personal, hiring, collaboration, and local AI-team relevance signal.",
    "- Local business address, phone number, opening hours, service area, reviews, and map listing are outside the public profile.",
    "- Project outcomes should come from the evidence on each page.",
    ...publicScopeNotes.map((note) => `- ${note}`),
    "",
  ].join("\n");
}

export function renderRobotsTxt() {
  if (siteVisibility.stage === "draft") {
    return [
      "# Search visibility is intentionally limited for the current portfolio stage.",
      "# The site owner controls when broader public indexing opens.",
      "User-agent: *",
      "Disallow: /",
      "",
      "User-agent: OAI-SearchBot",
      "Disallow: /",
      "",
      "Sitemap: https://steveoak.com/sitemap-index.xml",
      "",
    ].join("\n");
  }

  const lines = [
    "# Public indexing is open for search. Training-bot access follows the site owner's policy.",
    "User-agent: *",
    "Allow: /",
    "Disallow: /api/oak/",
    "",
  ];

  if (!siteVisibility.allowAiSearchBotsAtLaunch) {
    lines.push("User-agent: OAI-SearchBot", "Disallow: /", "");
  }

  if (!siteVisibility.allowTrainingBotsAtLaunch) {
    lines.push(
      "User-agent: GPTBot",
      "Disallow: /",
      "",
      "User-agent: Google-Extended",
      "Disallow: /",
      "",
      "User-agent: CCBot",
      "Disallow: /",
      "",
      "User-agent: anthropic-ai",
      "Disallow: /",
      "",
      "User-agent: ClaudeBot",
      "Disallow: /",
      "",
    );
  }

  lines.push("Sitemap: https://steveoak.com/sitemap-index.xml", "");
  return lines.join("\n");
}
