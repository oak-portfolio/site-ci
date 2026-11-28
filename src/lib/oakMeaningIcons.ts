import type { IconName } from "@/components/ui/Icon";
import type { OakAnswer, PublicCitation } from "../../packages/oak-agent-contracts/src/types";

/** One icon per meaning in the agent. Change a meaning's icon here, never at a call site. */
export const oakMeaningIcons = {
  "answer.advice": "ideas",
  "answer.role-fit": "balanceScale",
  "answer.document": "fileSearch",
  "web.research": "webBrowsing",
  "action.follow-up": "followUp",
  "action.copy-with-sources": "quote",
  "composer.quote": "quoteDown",
  "action.paste": "clipboardPaste",
  "action.sample": "sparkles",
  "onboarding.tip": "bulb",
  "tool.search": "search",
  "tool.read": "bookOpenText",
  "tool.navigate": "link",
  "tool.draft": "edit",
  "reasoning.trace": "reasoning",
  "reasoning.understand": "question",
  "reasoning.weigh": "weigh",
  "reasoning.think": "thought",
  "reasoning.compose": "compose",
  "reasoning.verify": "verify",
  "reasoning.retry": "retry",
  "evidence.missing": "helpCircle",
  "evidence.demonstrated": "tick",
  "evidence.transferable": "transfer",
  "advice.assumption": "checkList",
  "advice.tradeoff": "prosCons",
  "advice.next-step": "target",
  "advice.uncertainty": "info",
  "source.case-study": "workHistory",
  "source.experience": "briefcase",
  "source.profile": "userAccount",
  "source.resource": "technology",
  "source.article": "news",
  "source.web": "globe",
  "panel.brief-prepare": "mailEdit",
  "panel.brief-send": "mailSend",
  "panel.saved": "archive",
  "panel.row-actions": "moreHorizontal",
  "panel.documents-add": "fileUpload",
  "panel.document-selected": "fileVerified",
  "panel.ocr": "scanImage",
  "panel.ocr-consent": "securityCheck",
  "field.goals": "flag",
  "field.constraints": "filterHorizontal",
  "field.start-date": "calendarCheck",
  "field.reference": "linkReference",
  "field.role": "jobSearch",
  "field.role-intent": "compare",
} as const satisfies Record<string, IconName>;
export type OakMeaning = keyof typeof oakMeaningIcons;
/** The tints a meaning tile can take (`data-tone` on `.oak-starter-glyph`); one type so a misspelt tone fails to compile. */
export type OakTone = "blue" | "violet" | "gold" | "leaf" | "pink" | "neutral";

/** The eyebrow for answers that are not a plain sourced answer, which needs none. */
export const oakAnswerKinds: Partial<Record<OakAnswer["kind"], { meaning: OakMeaning; label: string }>> = {
  advice: { meaning: "answer.advice", label: "Suggestion" },
  "role-fit": { meaning: "answer.role-fit", label: "Role fit" },
  document: { meaning: "answer.document", label: "Your document" },
  gap: { meaning: "evidence.missing", label: "Evidence gap" },
};
/** R22 live: a claimless decline of an off-topic question is not missing evidence; it says what Oak covers. */
export const oakScopeDeclineKind = { meaning: "evidence.missing", label: "Outside Steve's work" } as const satisfies { meaning: OakMeaning; label: string };

/** Source type from the stable document id prefix (`work:…`, `experience:…`, `legacy-…`). */
export function oakSourceMeaning(citation: Pick<PublicCitation, "documentId">): OakMeaning {
  const prefix = citation.documentId.split(":")[0] ?? "";
  return prefix === "work" || prefix === "legacy" ? "source.case-study" : prefix === "experience" ? "source.experience" : prefix === "profile" ? "source.profile"
    : prefix === "resource" ? "source.resource" : "source.article";
}

export const oakSourceLabels: Partial<Record<OakMeaning, string>> = {
  "source.case-study": "Case study",
  "source.experience": "Experience",
  "source.profile": "Profile",
  "source.resource": "App",
  "source.article": "Article",
};
