import type { OakAnswer, PublicCitation } from "../../packages/oak-agent-contracts/src/types";

/**
 * R16: the facts an answer card shows for one of Steve's pages, read from the site's own content (Work frontmatter, the
 * career timeline, the legacy case-study list), never from the model. Small on purpose: BaseLayout embeds it on every page.
 */
export type OakSourceCard = Readonly<{
  kind: "work" | "role";
  /** The card's short name ("EcoSmartLoop", or a role's title), where the page title is long. */
  title?: string;
  /** A card-size WebP (480 to 960px wide), or the page's og:image when none was generated. */
  image?: string;
  imageAlt?: string;
  /** R20 (Oak, review v17): the picture's own width over height, so a card shows it whole at its native shape. */
  imageRatio?: number;
  role?: string;
  period?: string;
  place?: string;
  stack?: readonly string[];
  metrics?: readonly Readonly<{ label: string; value: string }>[];
}>;

/** Public display metadata projected from the eligible server snapshot, without passages. */
export type OakCitationLabels = Readonly<{
  knowledgeRevision: string;
  /** `cover` is a small cover image for Steve's pages that have one (v3 review), shown in place of the type icon. */
  documents: readonly Readonly<{ documentId: string; title: string; canonicalUrl: string; cover?: string; card?: OakSourceCard }>[];
}>;

export type OakCitationDocument = OakCitationLabels["documents"][number];

/** The cover a cited page shows as its face, only when the labels belong to the answer's knowledge revision. */
export function oakSourceCover(citation: Pick<PublicCitation, "documentId">, answerRevision: string | undefined, labels: OakCitationLabels | undefined) {
  if (!labels || answerRevision !== labels.knowledgeRevision) return undefined;
  return labels.documents.find(document => document.documentId === citation.documentId)?.cover;
}

/** A cited page's labels entry (title, route, cover, card), only when the labels belong to the answer's knowledge revision. */
export function oakSourceDocument(citation: Pick<PublicCitation, "documentId">, answerRevision: string | undefined,
  labels: OakCitationLabels | undefined): OakCitationDocument | undefined {
  if (!labels || answerRevision !== labels.knowledgeRevision) return undefined;
  return labels.documents.find(document => document.documentId === citation.documentId);
}

function approvedSourceRoute(citationUrl: string, canonicalUrl: string): boolean {
  try {
    const citation = new URL(citationUrl);
    const canonical = new URL(canonicalUrl);
    // Reject credentials, queries and URL-parser rewrites rather than turning them into approved routes.
    if (citation.href !== citationUrl || canonical.href !== canonicalUrl ||
      citation.protocol !== "https:" || citation.origin !== canonical.origin ||
      citation.username || citation.password || citation.search || canonical.search ||
      citationUrl.split("#", 1)[0].includes("?") || canonicalUrl.split("#", 1)[0].includes("?")) return false;
    const path = (value: string) => value === "/" ? value : value.replace(/\/$/, "");
    if (path(citation.pathname) !== path(canonical.pathname)) return false;
    // Timeline documents share /work, so their canonical fragment is part of source identity.
    // A document without a canonical fragment permits its validated passage's section fragment.
    return !canonical.hash || citation.hash === canonical.hash;
  } catch {
    return false;
  }
}

/** A title identifies the approved source document, never the freshness of a historical claim. */
export function oakCitationLabel(citation: PublicCitation, answerRevision: string | undefined,
  labels: OakCitationLabels | undefined, fallback: string): string {
  if (!labels || answerRevision !== labels.knowledgeRevision) return fallback;
  const document = labels.documents.find(document => document.documentId === citation.documentId);
  return document?.title.trim() && approvedSourceRoute(citation.url, document.canonicalUrl) ? document.title : fallback;
}

/**
 * Q05: a link fails its check when this page's labels, from the answer's own knowledge revision, do not know its
 * document or its URL is not that document's route. With no labels for that revision (a stale tab after a deploy)
 * nothing can be checked, so nothing is marked.
 */
export function oakCitationUnverified(citation: PublicCitation, answerRevision: string | undefined, labels: OakCitationLabels | undefined): boolean {
  if (!labels || answerRevision !== labels.knowledgeRevision) return false;
  const document = labels.documents.find(document => document.documentId === citation.documentId);
  return !document || !approvedSourceRoute(citation.url, document.canonicalUrl);
}

function answerCitations(answer: OakAnswer): readonly PublicCitation[] {
  const claims = answer.kind === "sourced" || answer.kind === "gap" ? answer.claims :
    answer.kind === "role-fit" ? answer.rows.flatMap(row => row.evidence) :
      answer.kind === "advice" ? answer.evidence : [];
  return claims.flatMap(claim => claim.citations);
}

/** Draft-only references have no revision authority. Require identical evidence in a current validated answer. */
export function oakBriefCitationLabel(citation: PublicCitation, answers: readonly OakAnswer[],
  labels: OakCitationLabels | undefined, fallback: string): string {
  const origin = answers.find(answer => answer.knowledgeRevision === labels?.knowledgeRevision &&
    answerCitations(answer).some(reference => reference.documentId === citation.documentId &&
      reference.passageId === citation.passageId && reference.sectionId === citation.sectionId && reference.url === citation.url));
  return oakCitationLabel(citation, origin?.knowledgeRevision, labels, fallback);
}

/** Hosts with a bundled icon in public/assets/brand-icons. Favicons are never fetched from the source's own site (privacy). */
const brandHosts: Readonly<Record<string, string>> = {
  "github.com": "github", "linkedin.com": "linkedin", "figma.com": "figma", "vercel.com": "vercel", "openai.com": "openai",
  "chatgpt.com": "chatgpt", "claude.ai": "claude", "anthropic.com": "claude", "perplexity.ai": "perplexity", "google.com": "google",
  "apple.com": "apple", "aws.amazon.com": "aws", "nextjs.org": "nextjs", "expo.dev": "expo", "convex.dev": "convex",
  "cursor.com": "cursor", "motion.dev": "motion", "playwright.dev": "playwright", "remotion.dev": "remotion", "mintlify.com": "mintlify",
  // v3 review: the two credential hosts Steve's sources cite, bundled so the page never asks another site for a favicon.
  "coursera.org": "coursera", "hype4.academy": "hype4",
  "clerk.com": "clerk", "cloudflare.com": "cloudflare", "astro.build": "astro", "ai-sdk.dev": "vercel", "slack.com": "slack", "discord.com": "discord", "telegram.org": "telegram", "tiktok.com": "tiktok",
};

/**
 * Steve's own pages: this site, and the old Framer site his legacy case studies still live on (`framerBaseUrl` in
 * src/data/legacyWork.ts, a knowledge source this display module must not import or edit) (D131).
 */
const ownHosts = new Set(["steveoak.com", "independent-performance-642823.framer.app"]);

/** Who a source belongs to: Steve's own site, or another host with its bundled icon when one exists (otherwise null, a globe). */
export function oakSourceSite(url: string): { host: string; firstParty: boolean; icon: string | null } {
  const host = URL.canParse(url, "https://steveoak.com") ? new URL(url, "https://steveoak.com").hostname.replace(/^www\./, "") : "";
  const brand = Object.entries(brandHosts).find(([domain]) => host === domain || host.endsWith(`.${domain}`))?.[1];
  return { host, firstParty: ownHosts.has(host), icon: brand ? `/assets/brand-icons/${brand}.png` : null };
}

/**
 * A page title's short name for a chip: "EcoSmartLoop: AI Agent ..." reads as "EcoSmartLoop", "Steve Oak / Okkar Kyaw" as
 * "Steve Oak", and a name longer than the chip's 18 characters stops at a whole word (D131).
 */
export function oakSourceShortLabel(title: string, room = 18): string {
  const name = title.split(/:\s|\s[|·–—/-]\s/, 1)[0]!.trim() || title;
  if (name.length <= room) return name;
  const cut = name.slice(0, room - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ")).trimEnd() || cut}\u2026`;
}
