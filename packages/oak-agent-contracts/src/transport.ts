import { z } from 'zod';
import type { telemetryReceiptRequestSchema } from './telemetry.ts';
import type { OakAnswer } from './types.ts';
import { ownerContactTopics } from './policy.ts';
import { adviceCurrentUncertainty, approvedAdvicePlan } from './advice.ts';
import { publicResearchRequestSchema, type PublicResearchEvent } from './public-research.ts';
import { visitorFundingSessionSchema, modelReadingAcknowledgementSchema } from './funding.ts';
import { documentRequirementSourceSchema, documentRoleRequirementSchema, documentCoverageSchema, validPrivateCitationSet } from './document-answer.ts';
import type { OakAnswerUi } from './openui/verdict.ts';

export const roleDescriptionMaxBytes = 4000;
export const roleIntentMaxCharacters = 400;
/** The longest question or advice request one turn takes. */
export const questionMaxCharacters = 4000;
export const roleRequirementLabel = 'Visitor-supplied role requirement';
/** Stream error text for a model call that stalled or never connected. The browser asks again once, automatically. */
/** OpenRouter's guardrail refused text that reads like instructions to an AI; the model never saw it (P11-G1). */
export const oakInjectionBlockedText = {
  document: 'Part of this document reads like instructions to an AI, so I stopped before reading it. Remove that part and send again.',
  question: "Your message reads like instructions to an AI, so I stopped. Ask it as a question about Steve's work instead.",
} as const;
export const oakModelStallText = 'The model stopped responding before the answer finished. Asking again is safe.';
export function isValidRoleDescription(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 &&
    new TextEncoder().encode(value).byteLength <= roleDescriptionMaxBytes;
}

const text = z.string().min(1).max(questionMaxCharacters);
/** Q08: who the visitor said they are (their account purpose). Visitor-chosen data that shapes emphasis, never a Steve fact. */
export const oakAudienceSchema = z.enum(['recruiter', 'collaborator', 'learner']);
export type OakAudience = z.infer<typeof oakAudienceSchema>;
const audienceByPurpose: Readonly<Record<string, OakAudience>> = { recruiting: 'recruiter', consulting: 'collaborator', research: 'collaborator', exploring: 'learner' };
/** A guest, or "Something else", has no audience and gets the mixed welcome. */
export function oakAudienceOf(purpose: string | null | undefined): OakAudience | undefined {
  return purpose ? audienceByPurpose[purpose] : undefined;
}
const task = z.union([
  z.strictObject({ kind: z.literal('question'), text, contactPreference: z.enum(['open', 'declined']).optional() }),
  z.strictObject({ kind: z.literal('advice'), text, contactPreference: z.enum(['open', 'declined']) }),
  z.strictObject({ kind: z.literal('role-fit'), text: z.string().min(1).max(roleIntentMaxCharacters),
    roleDescription: z.string().refine(isValidRoleDescription, 'Role text must be nonblank and at most 4000 UTF-8 bytes.') }),
  z.strictObject({ kind: z.literal('role-fit'), text: z.string().min(1).max(roleIntentMaxCharacters),
    requirementSource: documentRequirementSourceSchema }),
  z.strictObject({ kind: z.literal('correction'), text, priorAnswer: text }),
  z.strictObject({ kind: z.literal('decline'), text }),
  z.strictObject({ kind: z.literal('contact'), text, topics: z.array(z.enum([
    'steve-pricing', 'steve-rates', 'steve-compensation', 'steve-availability', 'steve-start-date',
  ])).min(1).max(5) }),
]);
export const oakChatRequestSchema = z.strictObject({
  requestId: z.uuid(), conversationId: z.uuid(), task,
  funding: z.enum(['sponsored', 'visitor']),
  messages: z.array(z.strictObject({ role: z.enum(['user', 'assistant']), content: text })).max(12),
  sourceIds: z.array(z.string().min(1).max(240)).max(8),
  publicResearch: publicResearchRequestSchema.optional(),
  /** The question quotes a private document answer. It can only narrow the turn: lexical search, no public research (D143). */
  privateQuote: z.literal(true).optional(),
  /** How many leading "About “…”" lines the browser folded in from quote chips, so intent reads only the visitor's words (D156). */
  quotedLines: z.number().int().min(1).max(8).optional(),
  audience: oakAudienceSchema.optional(),
});
export const oakTransportSchema = z.strictObject({
  turn: oakChatRequestSchema,
  visitorCredential: z.string().min(8).max(512).optional(),
  visitorSession: visitorFundingSessionSchema.optional(),
  modelReadingAcknowledgement: modelReadingAcknowledgementSchema.optional(),
});
export type OakChatRequest = z.infer<typeof oakChatRequestSchema>;
export type OakTransportEnvelope = z.infer<typeof oakTransportSchema>;
// Approved external canonical source URLs only. Corpus URL changes require an explicit review
// here; query/fragment/path variations must not expand external navigation authority.
const approvedExternalCanonicalUrls = new Set([
  'https://independent-performance-642823.framer.app/codex/ai-automation-cloud',
  'https://independent-performance-642823.framer.app/codex/ai-memory-hallucination-solution',
  'https://independent-performance-642823.framer.app/codex/b2b-b2c-growth',
  'https://independent-performance-642823.framer.app/codex/matchabymaryam',
  'https://independent-performance-642823.framer.app/codex/personal-software-era-ai',
  'https://independent-performance-642823.framer.app/codex/research-to-redesign',
  'https://independent-performance-642823.framer.app/codex/weird-fun-impact',
  'https://hype4.academy/certificate/mobile-ui-2/f08054aa-6d89-46e1-972e-9e7145cab2df',
  'https://hype4.academy/certificate/mobile-ui-1/39afef05-d191-421b-97ac-827954fd0c06',
  'https://www.coursera.org/account/accomplishments/professional-cert/UJEHHCJ3AKXK',
]);
export const oakPublicUrlSchema = z.string().max(1000).refine(value => {
  try {
    const url = new URL(value, 'https://steveoak.com');
    return !url.username && !url.password &&
      (url.origin === 'https://steveoak.com' || approvedExternalCanonicalUrls.has(value));
  } catch { return false; }
});
export const oakSameSitePathSchema = z.string().min(1).max(2048).refine(value => {
  if (!value.startsWith('/') || value.startsWith('//') || /[?#\\\u0000-\u001f\u007f]/u.test(value)) return false;
  try {
    const url = new URL(value, 'https://steveoak.com');
    return url.origin === 'https://steveoak.com' && url.pathname === value && !url.search && !url.hash;
  } catch { return false; }
}, 'Page must be a same-site path without a query or fragment.');
export const roleFitRowSchema = z.strictObject({
  id: z.string().min(1).max(100),
  requirement: z.union([z.strictObject({ text: z.string().min(1).max(240), start: z.number().int().min(0).max(4000),
    end: z.number().int().min(1).max(4000) }).refine(value => value.end > value.start && value.end - value.start === value.text.length),
    documentRoleRequirementSchema]),
  status: z.enum(['demonstrated', 'transferable', 'missing-evidence']),
  evidence: z.array(z.strictObject({ id: z.string().min(1).max(100), text: z.string().min(1).max(400),
    citations: z.array(z.strictObject({ documentId: z.string().min(1).max(240), passageId: z.string().min(1).max(240),
      sectionId: z.string().min(1).max(240), url: oakPublicUrlSchema })).min(1).max(2) })).max(2),
  gap: z.string().min(1).max(240).nullable(),
  questions: z.array(z.string().min(1).max(200)).max(2),
}).refine(value => value.status === 'demonstrated' ? value.evidence.length > 0 :
  value.status === 'transferable' ? value.evidence.length > 0 && value.gap !== null :
    value.gap !== null && value.questions.length > 0);
export const roleFitAnswerFieldsSchema = z.strictObject({
  rows: z.array(roleFitRowSchema).min(1).max(4),
  contactTopics: z.array(z.enum(ownerContactTopics)).max(5),
  coverage: documentCoverageSchema.optional(),
}).refine(value => {
  const citations = value.rows.flatMap(row => 'source' in row.requirement ? [row.requirement.source] : []);
  return citations.length === 0 ? value.coverage === undefined : citations.length === value.rows.length &&
    value.coverage !== undefined && value.coverage.quotedUtf16 === value.rows.reduce((sum, row) => sum + row.requirement.text.length, 0) &&
    validPrivateCitationSet(citations);
});
export const adviceAnswerFieldsSchema = z.strictObject({
  scope: z.enum(['supported-expertise', 'limited-evidence']),
  proposal: z.strictObject({ recommendation: z.string().min(1).max(400),
    assumptions: z.array(z.string().min(1).max(200)).min(1).max(2),
    tradeoffs: z.array(z.string().min(1).max(240)).min(1).max(2), nextStep: z.string().min(1).max(240) }),
  evidence: roleFitRowSchema.shape.evidence,
  uncertainty: z.literal(adviceCurrentUncertainty),
  contactOffer: z.boolean(),
}).refine(value => {
  const plan = approvedAdvicePlan(value.proposal);
  return plan !== undefined && (plan === 'clarify-scope' ?
    // Limited advice may still offer the brief (Q04-G4); it never carries evidence.
    value.scope === 'limited-evidence' && value.evidence.length === 0 :
    value.scope === 'supported-expertise' && value.evidence.length > 0);
});
export const oakCardSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('navigate'), label: z.string().min(1).max(240), url: oakPublicUrlSchema }),
  z.strictObject({ kind: z.literal('draft'), title: z.string().min(1).max(100), text: z.string().min(1).max(2000) }),
  z.strictObject({ kind: z.literal('contact'), label: z.literal('Say Hi'), url: z.literal('/contact') }),
]);
export type OakCard = Readonly<z.infer<typeof oakCardSchema>>;
export type OakUsage = Readonly<{
  requestId: string; state: 'settled' | 'held'; actualMicroUsd: number; heldMicroUsd: number;
}>;
/**
 * R10: how much of the bounded prompt the conversation itself takes: prior messages, the question and any private
 * document text, not the evidence the Worker packs into whatever room is left. `limitBytes` is the bound; `inputTokens` is the provider's largest per-step count, 0 when unreported.
 */
export type OakContextReading = Readonly<{
  requestId: string; conversationBytes: number; limitBytes: number; inputTokens: number;
}>;
const streamStep = z.number().int().min(1).max(20);
const streamOperation = z.enum(['read', 'search', 'navigate', 'draft']);
/** genui 11: how many passages a finished tool step returned. Optional so the client accepts it a deploy before the Worker sends it. */
const streamToolCount = z.number().int().min(0).max(99);
/** Caps for the model's own reasoning summaries, streamed as they arrive. Transient: never saved, never model context. */
export const OAK_THOUGHT_LIMITS = { blocks: 16, title: 120, text: 1600 } as const;
export const oakStreamStatusSchema = z.discriminatedUnion('phase', [
  z.strictObject({ requestId: z.uuid(), phase: z.literal('started') }),
  z.strictObject({ requestId: z.uuid(), phase: z.literal('model-start'), step: streamStep }),
  z.strictObject({ requestId: z.uuid(), phase: z.literal('tool-start'), step: streamStep, operation: streamOperation }),
  z.strictObject({ requestId: z.uuid(), phase: z.literal('tool-end'), step: streamStep, operation: streamOperation, count: streamToolCount.optional() }),
  // One reasoning summary so far (a snapshot, not a delta), keyed by its block within the turn.
  z.strictObject({ requestId: z.uuid(), phase: z.literal('thought'), step: streamStep, block: z.number().int().min(0).max(OAK_THOUGHT_LIMITS.blocks - 1),
    title: z.string().max(OAK_THOUGHT_LIMITS.title), text: z.string().max(OAK_THOUGHT_LIMITS.text) }),
]);
export type OakStreamData = {
  status: Readonly<z.infer<typeof oakStreamStatusSchema>>;
  answer: OakAnswer;
  card: OakCard;
  usage: OakUsage;
  context: OakContextReading;
  research: PublicResearchEvent;
  /** Q17: the arranged layout of the answer, reconciled by `<requestId>:ui`. */
  ui: OakAnswerUi;
  'telemetry-receipt': z.infer<typeof telemetryReceiptRequestSchema>;
};
export const oakCancelRequestSchema = z.strictObject({ requestId: z.uuid(), conversationId: z.uuid() });
export type OakCancelRequest = z.infer<typeof oakCancelRequestSchema>;
