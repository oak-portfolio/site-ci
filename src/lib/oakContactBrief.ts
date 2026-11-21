import type { PublicCitation } from "../../packages/oak-agent-contracts/src/types";
import { oakPublicUrlSchema } from "../../packages/oak-agent-contracts/src/transport";

export type OakContactBriefDraft = Readonly<{
  goals: string;
  constraints: string;
  startDateQuestion: string;
  references: readonly PublicCitation[];
  text: string;
  needsFormat: boolean;
}>;
export const briefInputLimits = { goals: 1500, constraints: 1500, startDateQuestion: 300, text: 6000 } as const;
export const briefReferenceKey = (value: PublicCitation) => JSON.stringify([value.documentId, value.passageId, value.sectionId, value.url]);
/** Q16-D8: a reference as the visitor shares it, the page itself without an in-page anchor such as `#hero-title`. */
export const oakBriefReferenceUrl = (url: string) => url.replace(/#.*$/, "");
/** PR 1e review: the public pages whose links are really in the brief text, one per page, so the count follows what the email carries. */
export function oakBriefLinkedPageCount(text: string) {
  const pages = new Set<string>();
  for (const match of text.matchAll(/https?:\/\/[^\s<>"')\]]+/gi)) {
    const page = oakBriefReferenceUrl(match[0].replace(/[.,;:!?]+$/, ""));
    if (oakPublicUrlSchema.safeParse(page).success) pages.add(page);
  }
  return pages.size;
}
export function validBriefReference(value: PublicCitation) {
  return Boolean(value.documentId && value.passageId && value.sectionId && oakPublicUrlSchema.safeParse(value.url).success);
}
export function emptyOakContactBrief(): OakContactBriefDraft {
  return { goals: "", constraints: "", startDateQuestion: "", references: [], text: "", needsFormat: true };
}
function steveCommitment(value: string) {
  return value.split(/\n/).some(line => !/^\s*(?:can|could|would|is|does|when|what|how)\b.*\?\s*$/i.test(line) &&
    /\bSteve\s+(?:starts|joins)\b|\bSteve\s+(?:will|can|is|has agreed|would|agrees?)\b.{0,80}\b(?:start|join|available|ready|accept|rate|salary|fee|compensation)\b|\bSteve['’]s\s+(?:salary|rate|fee|availability|start date)\s+(?:is|will be)\b/i.test(line));
}
export function oakContactBriefError(value: OakContactBriefDraft, checkText = false): string | null {
  for (const field of ["goals", "constraints", "startDateQuestion"] as const) {
    if (value[field].length > briefInputLimits[field]) return `Shorten ${field === "startDateQuestion" ? "the start-date question" : field} to ${briefInputLimits[field]} characters. Your text has been kept.`;
  }
  if (value.startDateQuestion.trim() && !/^\s*(?:can|could|would|is|does|when|what|how)\b[\s\S]*\?\s*$/i.test(value.startDateQuestion))
    return "Phrase the proposed start date as a question to Steve, without claiming his availability.";
  if (value.references.length > 4 || value.references.some(reference => !validBriefReference(reference))) return "Choose up to four approved public references.";
  if (new Set(value.references.map(briefReferenceKey)).size !== value.references.length) return "Choose each public reference only once.";
  if (steveCommitment([value.goals, value.constraints, value.startDateQuestion, ...(checkText ? [value.text] : [])].join("\n")))
    return "Ask Steve about personal terms or timing. This draft cannot commit on his behalf.";
  if (checkText && value.needsFormat) return "Update the brief from your current fields and selected references before copying or opening email.";
  if (checkText && (!value.text.trim() || value.text.length > briefInputLimits.text)) return "Review a nonblank brief within 6,000 characters before copying or opening email. Your text has been kept.";
  return null;
}
/** Only explicit visitor fields and selected source identities enter this formatter. */
export function formatOakContactBrief(value: OakContactBriefDraft) {
  const error = oakContactBriefError(value);
  if (error) throw new Error(error);
  return [
    "Hi Steve,",
    value.goals.trim() ? `My goals:\n${value.goals}` : "Question to clarify: What goals would I like to discuss?",
    value.constraints.trim() ? `My constraints:\n${value.constraints}` : "Question to clarify: What constraints should I share?",
    value.startDateQuestion.trim() ? `Start-date question for you:\n${value.startDateQuestion}` : "Question for you: If timing matters, what proposed start date should we discuss?",
    value.references.length ? `Public work references I selected:\n${[...new Set(value.references.map(reference => oakBriefReferenceUrl(reference.url)))].join("\n")}` : "Question to clarify: Which public work references would be useful?",
  ].join("\n\n");
}
export function oakBriefMailto(value: OakContactBriefDraft) {
  const error = oakContactBriefError(value, true);
  if (error) throw new Error(error);
  return `mailto:okkark.pro@gmail.com?subject=${encodeURIComponent("A question for Steve")}&body=${encodeURIComponent(value.text)}`;
}
