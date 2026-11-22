import type { OakCitationLabels } from "./oakCitationLabels";
import type { OakConversationMessage, OakWorkspaceState } from "./oakWorkspace";
import { oakAudienceOf, type OakAudience } from "../../packages/oak-agent-contracts/src/transport";
import { oakOpenUIShows } from "../../packages/oak-agent-contracts/src/openui/verdict";
import { scopeDecline } from "../../packages/oak-agent-contracts/src/scope";

/** R22 live: a gap with no claims whose note declines an off-topic request ("I only cover Steve's work, so...") is a scope
 * decline, not missing evidence: it gets its own eyebrow and turns the visitor back to Steve's work. */
export function oakIsScopeDecline(answer: { kind: string; claims?: readonly unknown[]; acknowledgment?: string | null }) {
  // R23 review M2: the shared check also passes some real gaps ("I can't say what his salary is"), so the site also needs
  // the decline itself: "can't help" or "outside" Steve's work.
  const note = answer.acknowledgment ?? "";
  return answer.kind === "gap" && !answer.claims?.length && scopeDecline(note)
    && (/\b(?:can['\u2019]t|cannot|won['\u2019]t) help\b|\boutside (?:of )?(?:Steve|his|what I)/i.test(note)
      // R27 live (12:28Z): "I only cover Steve's work and projects, so I can't provide a recipe for banana bread." The decline
      // follows "so" in the same sentence; "I can't say what his salary is" stays a gap (no "so", and "say" names a fact).
      || /\bonly (?:cover|answer|talk about|discuss)\b[^.!?]{0,60}\b(?:Steve|his)\b[^.!?]{0,40}\bso I (?:can['\u2019]t|cannot|won['\u2019]t) (?!say\b|tell\b|confirm\b)\w+/i.test(note));
}

export const oakStarters = [
  "What has Steve built?",
  "How does Steve approach AI systems?",
  "Help me draft a question for Steve",
] as const;

/**
 * Q08: what a starter is about, so the empty state can pick its glyph, and the tool it opens instead of asking (a draft,
 * a role comparison, advice or a brief). `page` is the current Work page's own project.
 */
export type OakStarterIntent = "page" | "built" | "approach" | "draft" | "owned" | "role" | "availability" | "run" | "advice" | "brief" | "learned" | "current";
export type OakStarter = Readonly<{ text: string; intent: OakStarterIntent }>;
type StarterSet = Readonly<{ page: (project: string) => string; starters: readonly OakStarter[] }>;

// One line each, in the visitor's own words (brief "Point of view"). The first slot names the page's project on a Work page.
const starterSets: Readonly<Record<OakAudience | "mixed", StarterSet>> = {
  mixed: { page: project => `What did Steve own on ${project}?`, starters: [
    { text: oakStarters[0], intent: "built" }, { text: oakStarters[1], intent: "approach" }, { text: oakStarters[2], intent: "draft" }] },
  recruiter: { page: project => `What did Steve own on ${project}?`, starters: [
    { text: "What did Steve own, and when?", intent: "owned" }, { text: "Compare my role with Steve's work", intent: "role" },
    { text: "Is Steve available, and where is he based?", intent: "availability" }] },
  collaborator: { page: project => `How did Steve run ${project}?`, starters: [
    { text: "How does Steve run a project?", intent: "run" }, { text: "Get advice on my project", intent: "advice" },
    { text: "Prepare a brief for Steve", intent: "brief" }] },
  learner: { page: project => `How does ${project} work?`, starters: [
    { text: oakStarters[1], intent: "approach" }, { text: "What did Steve learn from his projects?", intent: "learned" },
    { text: "What is current in AI SDK streaming?", intent: "current" }] },
};

/** "EcoSmartLoop: AI Agent Platform for a $640B Waste Problem…" reads as "EcoSmartLoop" inside a question. */
export function oakShortTitle(title: string): string {
  const short = title.split(/\s*(?::|\s[|–—-]\s)\s*/, 1)[0]?.trim();
  return short || title.trim();
}

/** Three starters for the visitor's audience (a guest gets the mixed welcome); on a Work page the first names its project. */
export function oakStarterSet(route: string, labels?: OakCitationLabels, audience?: OakAudience): readonly OakStarter[] {
  // Canonical URLs end in a slash; routes may not. Compare without it.
  const bare = (url: string) => url.replace(/\/+$/, "");
  const page = labels?.documents.find(document => bare(document.canonicalUrl) === bare(`https://steveoak.com${route}`));
  const set = starterSets[audience ?? "mixed"];
  // Q08-G3: the project takes the first slot instead of adding a fourth row, so every starter fits above the composer.
  return route.startsWith("/work/") && page?.title
    ? [{ text: set.page(oakShortTitle(page.title)), intent: "page" }, ...set.starters.slice(1)]
    : set.starters;
}

export function oakPageSuggestions(route: string, labels?: OakCitationLabels, audience?: OakAudience): readonly string[] {
  return oakStarterSet(route, labels, audience).map(starter => starter.text);
}

/** Follow-ups for the latest answer. `question` is what the visitor just asked, so no chip repeats it. */
/** Q08: the last follow-up on a sourced answer speaks to who is asking; a guest keeps the general one. */
const audienceFollowUp: Record<OakAudience, string> = {
  recruiter: "How can I reach Steve about a role?",
  collaborator: "How would Steve approach a project like mine?",
  learner: "What lesson from this can I reuse?",
};
export function oakAnswerSuggestions(message: OakConversationMessage | undefined, question = "", audience?: OakAudience): readonly string[] {
  if (message?.role !== "assistant" || message.state !== "complete" || !message.answer) return [];
  const answer = message.answer;
  // A narrowing question carries its own pills, and a proposal its own action; chips under them would compete.
  if (answer.kind === "declined" || answer.kind === "contact" || answer.kind === "clarify" || answer.kind === "proposal") return [];
  if (answer.kind === "role-fit") return [
    answer.rows.flatMap(row => row.questions)[0] ?? "Which requirements have the strongest evidence?",
    "What evidence is still missing for this role?",
    "Help me draft a question for Steve about this role",
  ];
  if (answer.kind === "advice") return [
    "What are the tradeoffs in that recommendation?",
    "How should I test the proposed next step?",
    "Which of Steve's projects supports this advice?",
  ];
  if (answer.kind === "document") return ["What does the selected text leave unresolved?", "Which of Steve's projects relates to this document?"];
  const work = message.cards.find(card => card.kind === "navigate" && card.url.includes("/work/"));
  const project = work?.kind === "navigate" ? oakShortTitle(work.label) : undefined;
  const asked = (pattern: RegExp) => pattern.test(question) && (!project || question.toLowerCase().includes(project.toLowerCase()));
  // Two rules can land on the same question (no linked project, and the visitor already asked about tradeoffs).
  const repeat = question.trim().toLowerCase();
  const fresh = (list: string[]) => [...new Set(list)].filter(suggestion => suggestion.toLowerCase() !== repeat);
  // A gap has no evidence to probe or transfer: offer to ask Steve, or turn back to work he has documented.
  if (oakIsScopeDecline(answer)) return fresh([oakStarters[0], oakStarters[1]]);
  if (answer.kind === "gap") return fresh([project ? `What did Steve own on ${project}?` : oakStarters[0], "What should I ask Steve to fill that evidence gap?"]);
  return fresh([
    !project ? "What evidence supports this?" : asked(/\bown(ed|ership)?\b/i) ? `What would Steve change on ${project} next time?` : `What did Steve own on ${project}?`,
    asked(/\btrade-?offs?\b/i) ? "What evidence supports this?" : "What tradeoffs did Steve make?",
    audience ? audienceFollowUp[audience] : "How does this experience transfer to a new project?",
  ]);
}

/**
 * The follow-up chips above the message box. Q03-G5: a stopped or failed turn, or any status line (an error, a contact
 * note, a save or history message), takes their place until the visitor acts, so an error never sits beside suggestions.
 */
export function oakComposerSuggestions(state: OakWorkspaceState, intake: boolean): readonly string[] {
  const statusShown = Boolean(state.error || state.contactNotice || state.saveError || state.historyError || state.authError);
  if (intake || state.pending || statusShown) return [];
  // Q17: an arranged answer that brings its own follow-up pills is the Related row for that answer, so one row shows.
  const last = state.messages.at(-1);
  const claims = last?.answer && (last.answer.kind === "sourced" || last.answer.kind === "gap") ? last.answer.claims.map(claim => claim.id) : [];
  if (oakOpenUIShows(last?.ui, claims)?.pills) return [];
  // The visitor's own words, without lines quoted from an answer (oakVisitorWords, kept import-free for this module).
  const prior = state.messages.at(-2);
  const asked = prior?.role === "user" ? prior.quoted?.text ?? prior.text : "";
  return oakAnswerSuggestions(state.messages.at(-1), asked, oakAudienceOf(state.authStatus?.purpose));
}
