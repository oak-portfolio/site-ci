import { markdownApiHrefForPath } from "@/lib/markdownApiHref";
import { oakCitationLabel, type OakCitationLabels } from "@/lib/oakCitationLabels";
import type { OakAnswer, PublicCitation } from "../../packages/oak-agent-contracts/src/types";

const site = "https://steveoak.com";

/** Assistants an answer can be opened in. Each opens in a new tab on the provider's site. */
export const oakOpenInProviders = [
  { id: "chatgpt", label: "ChatGPT", icon: "/assets/brand-icons/chatgpt.png", href: (prompt: string) => `https://chatgpt.com/?prompt=${encodeURIComponent(prompt)}` },
  { id: "claude", label: "Claude", icon: "/assets/brand-icons/claude.png", href: (prompt: string) => `https://claude.ai/new?q=${encodeURIComponent(prompt)}` },
  { id: "perplexity", label: "Perplexity", icon: "/assets/brand-icons/perplexity.png", href: (prompt: string) => `https://www.perplexity.ai/?q=${encodeURIComponent(prompt)}` },
] as const;

/** Every public citation in a validated answer, first appearance first, one per URL. */
export function oakAnswerCitations(answer: OakAnswer): PublicCitation[] {
  const claims = answer.kind === "sourced" || answer.kind === "gap" ? answer.claims : answer.kind === "advice" ? answer.evidence
    : answer.kind === "role-fit" ? answer.rows.flatMap(row => row.evidence) : [];
  return [...new Map(claims.flatMap(claim => claim.citations).map(citation => [citation.url, citation])).values()];
}

/** One entry per source document, first appearance first. Two sections of one page are one numbered source. */
export function oakAnswerSources(answer: OakAnswer): PublicCitation[] {
  return [...new Map(oakAnswerCitations(answer).map(citation => [citation.documentId, citation])).values()];
}

/** The Markdown mirror of a cited steveoak.com page, which other assistants read best; any other page stays as it is. */
export function oakSourceReadHref(url: string) {
  // Citation URLs may be site-relative; they validate against the site origin.
  const parsed = new URL(url, site);
  if (parsed.origin !== site) return url;
  const mirror = markdownApiHrefForPath(parsed.pathname);
  return mirror ? `${site}${mirror}` : url;
}

/** The visitor's question with the pages behind the answer (or the site's llms.txt when there is none), for another assistant to read. */
export function oakOpenInPrompt(question: string, answer?: OakAnswer | null) {
  const reads = answer ? [...new Set(oakAnswerCitations(answer).map(citation => oakSourceReadHref(citation.url)))].slice(0, 3) : [];
  const from = reads.length ? reads.join(" and ") : `${site}/llms.txt`;
  return `Read from ${from} so I can ask questions about Steve Oak's work.${question ? ` My question: ${question}` : ""}`;
}

/** The answer text followed by its numbered sources, as Markdown, numbered like the pills in the transcript. */
export function oakAnswerWithSources(text: string, answer: OakAnswer, labels?: OakCitationLabels) {
  const sources = oakAnswerSources(answer).map((citation, index) =>
    `${index + 1}. [${oakCitationLabel(citation, answer.knowledgeRevision, labels, `Source ${index + 1}`)}](${citation.url})`);
  return sources.length ? `${text}\n\nSources:\n${sources.join("\n")}` : text;
}
