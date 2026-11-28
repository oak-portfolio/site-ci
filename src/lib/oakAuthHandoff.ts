import { z } from "zod";
import { withoutPrivateDocumentTurns } from "./oakPrivateDocumentHistory";
import type { OakWorkspaceState } from "./oakWorkspace";
import { parseOakAnswer, renderOakAnswer } from "../../packages/oak-agent-contracts/src/output";
import { oakCardSchema, oakPublicUrlSchema, oakSameSitePathSchema, roleDescriptionMaxBytes, roleIntentMaxCharacters } from "../../packages/oak-agent-contracts/src/transport";
import { publicResearchEventSchema, withoutFavicons } from "../../packages/oak-agent-contracts/src/public-research";
import { OAK_QUOTE_CHARACTERS, OAK_QUOTE_MAX } from "./oakQuote";
import { savedQuotedQuestionSchema } from "../../packages/oak-agent-contracts/src/saved-conversations";

export const oakAuthHandoffKey = "oak.auth-handoff.v1";
export const oakAuthHandoffLifetimeMs = 20 * 60 * 1000;
export const oakAuthHandoffMaxBytes = 128 * 1024;
const citation = z.strictObject({ documentId: z.string().min(1).max(240), passageId: z.string().min(1).max(240),
  sectionId: z.string().min(1).max(240), url: oakPublicUrlSchema });
const referenceKey = (value: z.infer<typeof citation>) => JSON.stringify([value.documentId, value.passageId, value.sectionId, value.url]);
const claim = z.strictObject({ id: z.string().min(1).max(240), text: z.string().min(1).max(2000), citations: z.array(citation).min(1).max(2) });
const answer = z.unknown().transform((value, ctx) => {
  const parsed = parseOakAnswer(value);
  if (!parsed || parsed.kind === "document" || (parsed.kind === "role-fit" && parsed.coverage)) { ctx.addIssue({ code: "custom", message: "Invalid retained output" }); return z.NEVER; }
  const claims = parsed.kind === "sourced" || parsed.kind === "gap" ? parsed.claims :
    parsed.kind === "advice" ? parsed.evidence : parsed.kind === "role-fit" ? parsed.rows.flatMap(row => row.evidence) : [];
  if (claims.length > 8 || claims.some(value => !claim.safeParse(value).success) ||
    parsed.characterVersion.length > 240 || parsed.hardPolicyVersion.length > 240 || parsed.knowledgeRevision.length > 240 ||
    parsed.operations.length > 6 || renderOakAnswer(parsed).length > 12000) {
    ctx.addIssue({ code: "custom", message: "Invalid retained output" }); return z.NEVER;
  }
  return parsed;
});
const userMessageId = z.string().refine(value => value.endsWith(":user") && z.uuid().safeParse(value.slice(0, -5)).success);
const message = z.strictObject({ id: z.string().max(41), role: z.enum(["user", "assistant"]), text: z.string().max(12000),
  answer: answer.nullable(), cards: z.array(oakCardSchema).max(6), state: z.literal("complete"),
  page: oakSameSitePathSchema.optional(),
  taskKind: z.enum(["question", "role-fit", "advice"]).optional(), research: publicResearchEventSchema.nullable(),
  // A sent question's quote chips, so the restored bubble shows them as sent (D140).
  quoted: savedQuotedQuestionSchema.optional() })
  .refine(value => value.role === "user" ? userMessageId.safeParse(value.id).success && value.answer === null && value.cards.length === 0 && value.research === null && value.text.length <= (value.taskKind === "role-fit" ? roleIntentMaxCharacters : 4000) :
    z.uuid().safeParse(value.id).success && value.answer !== null && value.text === renderOakAnswer(value.answer) && value.research?.phase !== "started");
const dataSchema = z.strictObject({ conversationId: z.uuid().nullable(), draft: z.string().max(4000),
  draftKind: z.enum(["question", "advice"]), contactPreference: z.enum(["open", "declined"]),
  questionDraft: z.strictObject({ topic: z.string().max(1500), goal: z.string().max(1500) }).nullable(),
  roleDraft: z.strictObject({ roleDescription: z.string().refine(value => new TextEncoder().encode(value).byteLength <= roleDescriptionMaxBytes),
    intent: z.string().max(roleIntentMaxCharacters) }).nullable(),
  briefDraft: z.strictObject({ goals: z.string().max(1500), constraints: z.string().max(1500), startDateQuestion: z.string().max(300),
    references: z.array(citation).max(4), text: z.string().max(6000), needsFormat: z.boolean() }).nullable(),
  // Staged quote chips (D137). Optional, so a handoff written before quotes existed still restores.
  quotes: z.array(z.strictObject({ text: z.string().min(1).max(OAK_QUOTE_CHARACTERS), source: z.uuid().optional() })).max(OAK_QUOTE_MAX).optional(),
  // The visitor removed the page chip (PR 1d). Kept across sign-in for this conversation, so the page's context stays out.
  pageContextOff: z.literal(true).optional(),
  messages: z.array(message).max(24) }).refine(value => new Set(value.messages.map(message => message.id)).size === value.messages.length &&
    (value.messages.length === 0 || value.conversationId !== null)).refine(value => {
      const references = value.messages.flatMap(message => {
        const answer = message.answer;
        const claims = answer?.kind === "sourced" || answer?.kind === "gap" ? answer.claims :
          answer?.kind === "advice" ? answer.evidence : answer?.kind === "role-fit" ? answer.rows.flatMap(row => row.evidence) : [];
        return claims.flatMap(claim => claim.citations).map(referenceKey);
      });
      return !value.briefDraft || value.briefDraft.references.every(reference => references.includes(referenceKey(reference)));
    });
const handoffSchema = z.strictObject({ version: z.literal(1), intent: z.literal("sign-in"), createdAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative(), data: dataSchema });
function storage() { return typeof window === "undefined" ? null : window.sessionStorage; }

/** Called only by explicit sign-in intent. No account fields, credentials, usage or audio enter this record. */
export function saveOakAuthHandoff(state: OakWorkspaceState): boolean {
  try {
    const publicMessages = withoutPrivateDocumentTurns(state.messages);
    const excludedPrivate = publicMessages.length !== state.messages.length;
    const roleDraft = state.roleDraft && 'requirementSource' in state.roleDraft && state.roleDraft.requirementSource ? null : state.roleDraft;
    // Derived brief prose may contain removed private quotations. Independent fields stay.
    const publicReferences = new Set(publicMessages.flatMap(message => {
      const answer = message.answer;
      const claims = answer?.kind === 'sourced' || answer?.kind === 'gap' ? answer.claims :
        answer?.kind === 'advice' ? answer.evidence : answer?.kind === 'role-fit' ? answer.rows.flatMap(row => row.evidence) : [];
      return claims.flatMap(claim => claim.citations).map(referenceKey);
    }));
    const briefDraft = excludedPrivate && state.briefDraft ? { ...state.briefDraft,
      references: state.briefDraft.references.filter(reference => publicReferences.has(referenceKey(reference))), text: '', needsFormat: true } : state.briefDraft;
    // A quote travels only with the public answer it came from; one from a private document turn stays behind with that turn.
    const publicIds = new Set(publicMessages.map(message => message.id));
    const quotes = (state.quotes ?? []).filter(quote => quote.source ? publicIds.has(quote.source) : !excludedPrivate)
      .map(quote => ({ text: quote.text, ...(quote.source ? { source: quote.source } : {}) }));
    const data = dataSchema.parse({ conversationId: state.conversationId, draft: state.draft, draftKind: state.draftKind,
      contactPreference: state.contactPreference, questionDraft: state.questionDraft, roleDraft, briefDraft, ...(quotes.length ? { quotes } : {}),
      ...(state.pageContextOff ? { pageContextOff: true } : {}),
      // Ticket 84: a question whose answer did not complete leaves with it when its words already wait in the box; a refusal
      // that cleared the box (Q03-G5) keeps its question, so the visitor's words stay on screen.
      messages: publicMessages.filter(message => message.state === "complete" && (message.role !== "user" ||
        publicMessages.some(answer => answer.id === message.id.slice(0, -5) && answer.state === "complete") ||
        state.draft.trim() !== (message.quoted?.text ?? message.text).trim() ||
        (!!message.quoted && message.quoted.quotes.join("\n") !== (state.quotes ?? []).map(quote => quote.text).join("\n")))).map(message => ({ id: message.id, role: message.role,
        text: message.text, answer: message.answer, cards: message.cards, state: message.state,
        ...(message.page !== "" ? { page: message.page } : {}),
        ...(message.taskKind ? { taskKind: message.taskKind } : {}), research: message.research ? withoutFavicons(message.research) : null,
        ...(message.role === "user" && message.quoted ? { quoted: { quotes: [...message.quoted.quotes], text: message.quoted.text } } : {}) })) });
    const createdAt = Date.now();
    const text = JSON.stringify({ version: 1, intent: "sign-in", createdAt, expiresAt: createdAt + oakAuthHandoffLifetimeMs, data });
    if (new TextEncoder().encode(text).byteLength > oakAuthHandoffMaxBytes) throw new Error("handoff-limit");
    const target = storage();
    if (!target) return false;
    target.setItem(oakAuthHandoffKey, text);
    return true;
  } catch { clearOakAuthHandoff(); return false; }
}

/** Data only. The canonical owner restores it only after retaining explicit sign-in intent. */
export function readOakAuthHandoff(): Partial<OakWorkspaceState> | null {
  try {
    const text = storage()?.getItem(oakAuthHandoffKey);
    if (text === null || text === undefined) return null;
    if (new TextEncoder().encode(text).byteLength > oakAuthHandoffMaxBytes) throw new Error("handoff-limit");
    const value = handoffSchema.parse(JSON.parse(text));
    const now = Date.now();
    if (value.createdAt > now || value.expiresAt - value.createdAt !== oakAuthHandoffLifetimeMs || now >= value.expiresAt) throw new Error("handoff-expired");
    // Older handoffs did not retain page metadata. Keep their text without inventing a path.
    const { quotes, ...data } = value.data;
    return { ...data, ...(quotes ? { quotes: quotes.map(quote => ({ id: crypto.randomUUID(), ...quote })) } : {}),
      messages: value.data.messages.map(message => ({ ...message, usage: null, page: message.page ?? "" })) };
  } catch { clearOakAuthHandoff(); return null; }
}
export function clearOakAuthHandoff(): void {
  try { storage()?.removeItem(oakAuthHandoffKey); } catch { /* Storage denial cannot turn into remote persistence. */ }
}
/** Remove only the matching tab handoff, never restore it as a side effect. */
export function clearOakConversationHandoff(conversationId: string): void {
  const value = readOakAuthHandoff();
  if (value?.conversationId === conversationId) clearOakAuthHandoff();
}
