import type { IconName } from "@/components/ui/Icon";
import type { OakTone } from "./oakMeaningIcons";
import type { OakAnswer } from "../../packages/oak-agent-contracts/src/types";
import { questionMaxCharacters, roleIntentMaxCharacters } from "../../packages/oak-agent-contracts/src/transport";
import { briefInputLimits } from "./oakContactBrief";

export type OakNextStepAction = "role" | "brief" | "documents" | "advice";
export type OakNextStep = { action: OakNextStepAction; title: string; hint: string; icon: IconName; tone: OakTone };

/** Each card wears the tile of the Tools menu row it opens (D128), so the suggestion and the menu read as one tool. */
export const oakNextSteps: Record<OakNextStepAction, Omit<OakNextStep, "action">> = {
  documents: { title: "Add your document", hint: "Ask about a resume or job post you have", icon: "bookOpenText", tone: "blue" },
  role: { title: "Compare a role", hint: "See how Steve fits the job you have in mind", icon: "identityFile", tone: "violet" },
  brief: { title: "Draft a contact brief", hint: "Write a short note you send to Steve yourself", icon: "mail", tone: "leaf" },
  advice: { title: "Get project advice", hint: "Talk through your product or AI decision", icon: "ideas", tone: "gold" },
};

/** In order: a document beats the word "job", a role beats contact words, and advice comes last. */
const rules: readonly [OakNextStepAction, RegExp][] = [
  ["documents", /\b(my (resume|cv|cover letter|document)|this (document|file|pdf|resume|cv)|job description i have|i('ve| have) (a|the|my) (resume|cv|job description|job post|document))\b/i],
  ["role", /\b(roles?|jobs?|job post(ing)?|positions?|fit)\b/i],
  ["brief", /\b(contact|reach (out|steve|him)|e-?mail|hire|hiring|availab\w*|interview\w*|talk (to|with) steve|get in touch|salary|compensation|rates?\b(?!\s*limit))/i],
  ["advice", /\b(should (we|i)|how would (you|steve|he) (approach|tackle|start)|advice|advise|recommend\w*|our (team|product|company|project|startup))\b/i],
];

/**
 * At most one tool to suggest after a completed answer, read only from the visitor's own question and the validated answer
 * kind, never from model prose. Q04: the Worker's app-chosen `nextTool` wins when it sends one. A tool the answer already
 * is, or an offer already on screen, is skipped.
 */
export function oakNextStep(question: string, answer: Pick<OakAnswer, "kind"> & { contactOffer?: boolean; nextTool?: OakNextStepAction } | null | undefined,
  contactPreference: "open" | "declined", used: ReadonlySet<OakNextStepAction> = new Set()): OakNextStep | null {
  if (!answer || answer.kind === "contact" || answer.kind === "declined" || answer.kind === "clarify" || answer.kind === "proposal") return null;
  // Q06: a tool the visitor already used in this chat is never offered again.
  const skip: Record<OakNextStepAction, boolean> = {
    documents: answer.kind === "document" || used.has("documents"),
    role: answer.kind === "role-fit" || used.has("role"),
    brief: contactPreference === "declined" || Boolean(answer.kind === "advice" && answer.contactOffer) || used.has("brief"),
    advice: answer.kind === "advice" || used.has("advice"),
  };
  if (answer.nextTool && !skip[answer.nextTool]) return { action: answer.nextTool, ...oakNextSteps[answer.nextTool] };
  const match = rules.find(([action, pattern]) => !skip[action] && pattern.test(question));
  return match ? { action: match[0], ...oakNextSteps[match[0]] } : null;
}

/** Q06: the tools this chat has already used, read from its answers and an opened brief. */
export function oakUsedTools(messages: readonly { role: string; answer?: Pick<OakAnswer, "kind"> | null }[], briefStarted: boolean) {
  const used = new Set<OakNextStepAction>(briefStarted ? ["brief"] : []);
  for (const message of messages) {
    const kind = message.role === "assistant" ? message.answer?.kind : undefined;
    if (kind === "role-fit") used.add("role");
    else if (kind === "advice") used.add("advice");
    else if (kind === "document") used.add("documents");
  }
  return used;
}

/** What the visitor typed in a sent question, without the quoted lines Ask about this put before it (D131). */
export const oakVisitorWords = (message: { text: string; quoted?: { text: string } } | undefined) => message?.quoted?.text ?? message?.text ?? "";
/**
 * The question as sent, quote lines included, for links that hand it to another assistant (D149). A private document turn
 * gives only the visitor's own words, so a quote from their document never leaves in a link.
 */
export const oakExportedQuestion = (message: { role: string; text: string; quoted?: { text: string }; privateDocumentTurn?: true } | undefined) =>
  message?.role !== "user" ? "" : message.privateDocumentTurn ? oakVisitorWords(message) : message.text;

const prefillLimits: Record<OakNextStepAction, number> = { role: roleIntentMaxCharacters, brief: briefInputLimits.goals, advice: questionMaxCharacters, documents: 0 };
/** The question whole when the tool's field can take it, otherwise nothing: a field never opens past its own limit (D131). */
export const oakNextStepPrefill = (action: OakNextStepAction, question: string) => question.length <= prefillLimits[action] ? question : "";
