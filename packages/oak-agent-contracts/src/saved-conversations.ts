import { z } from 'zod';
import { parseOakAnswer, renderOakAnswer } from './output.ts';
import type { OakAnswer } from './types.ts';
import { oakCardSchema, oakPublicUrlSchema, oakSameSitePathSchema } from './transport.ts';
import { publicResearchEventSchema } from './public-research.ts';
import { savedDocumentSetSchema, savedDocumentProofSchema } from './saved-documents.ts';
import { oakAnswerUiSchema, oakOpenUIProgramCovers } from './openui/verdict.ts';

export const SAVED_CONVERSATION_MAX_MESSAGES = 128;
export const SAVED_CONVERSATION_MAX_BYTES = 512 * 1024;
export const SAVED_CONVERSATION_MAX_TEXT_BYTES = 32 * 1024;
export const SAVED_CONVERSATION_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

const utf8Bytes = (value: string) => new TextEncoder().encode(value).byteLength;
const boundedMessageText = (maxCharacters: number) => z.string().min(1).max(maxCharacters).refine(value => utf8Bytes(value) <= SAVED_CONVERSATION_MAX_TEXT_BYTES,
  `Message text must be at most ${SAVED_CONVERSATION_MAX_TEXT_BYTES} UTF-8 bytes.`);
const taskKind = z.enum(['question', 'role-fit', 'advice']);
const userMessageIdSchema = z.string().max(41).refine(value => value.endsWith(':user') && z.uuid().safeParse(value.slice(0, -5)).success,
  'User message IDs must be the request UUID followed by :user.');
const savedMessageIdSchema = z.union([z.uuid(), userMessageIdSchema]);
const citationSchema = z.strictObject({ documentId: z.string().min(1).max(240), passageId: z.string().min(1).max(240),
  sectionId: z.string().min(1).max(240), url: oakPublicUrlSchema });
const claimSchema = z.strictObject({ id: z.string().min(1).max(240), text: z.string().min(1).max(2000),
  citations: z.array(citationSchema).min(1).max(2) });
function isValidatedOakAnswer(value: unknown): value is OakAnswer {
  const answer = parseOakAnswer(value);
  if (!answer) return false;
  const claims = answer.kind === 'role-fit' ? answer.rows.flatMap(row => row.evidence) :
    answer.kind === 'advice' ? answer.evidence :
      answer.kind === 'sourced' || answer.kind === 'gap' ? answer.claims : [];
  return claims.length <= 8 && claims.every(claim => claimSchema.safeParse(claim).success) &&
    answer.characterVersion.length > 0 && answer.characterVersion.length <= 240 &&
    answer.hardPolicyVersion.length > 0 && answer.hardPolicyVersion.length <= 240 &&
    answer.knowledgeRevision.length > 0 && answer.knowledgeRevision.length <= 240 &&
    answer.operations.length <= 6 && renderOakAnswer(answer).length <= 12000;
}
const answerSchema = z.custom<OakAnswer>(isValidatedOakAnswer, 'Invalid validated Oak answer.');
const terminalResearchSchema = publicResearchEventSchema.refine(value => value.phase !== 'started',
  'Only terminal public-research events may be saved.');

/** The quote chips a question was sent with and the visitor's own words, kept so a reopened chat shows them as sent (D140). */
export const savedQuotedQuestionSchema = z.strictObject({
  quotes: z.array(z.string().min(1).max(280)).min(1).max(3),
  text: z.string().max(4000),
});

const userMessageSchema = z.strictObject({
  id: userMessageIdSchema,
  role: z.literal('user'),
  text: boundedMessageText(4000),
  answer: z.null(),
  cards: z.array(z.never()).length(0),
  page: oakSameSitePathSchema,
  taskKind,
  privateDocumentTurn: z.literal(true).optional(),
  quoted: savedQuotedQuestionSchema.optional(),
}).superRefine((message, context) => {
  if (message.taskKind === 'role-fit' && message.text.length > 400) {
    context.addIssue({ code: 'custom', path: ['text'], message: 'Role-fit intent must be at most 400 characters.' });
  }
});

const assistantMessageSchema = z.strictObject({
  id: z.uuid(),
  role: z.literal('assistant'),
  text: boundedMessageText(12000),
  answer: answerSchema,
  cards: z.array(oakCardSchema).max(6),
  page: oakSameSitePathSchema,
  taskKind,
  research: terminalResearchSchema.nullable().optional(),
  /** Q17: a settled arranged layout is kept as its program text, so a reopened chat lays the answer out the same way. */
  ui: oakAnswerUiSchema.optional(),
  privateDocumentTurn: z.literal(true).optional(),
}).superRefine((message, context) => {
  const layoutClaims = message.answer.kind === 'sourced' || message.answer.kind === 'gap' ? message.answer.claims : null;
  if (message.ui && (message.ui.status !== 'done' || message.ui.requestId !== message.id || !layoutClaims?.length ||
      !oakOpenUIProgramCovers(message.ui.program, layoutClaims.map(claim => claim.id)))) {
    context.addIssue({ code: 'custom', path: ['ui'], message: 'A saved layout must be the settled layout of this answer.' });
  }
  if (message.text !== renderOakAnswer(message.answer)) {
    context.addIssue({ code: 'custom', path: ['text'], message: 'Completed assistant text must match its validated rich answer.' });
  }
  if (message.research && message.research.requestId !== message.id.toLowerCase()) {
    context.addIssue({ code: 'custom', path: ['research', 'requestId'], message: 'Research must belong to this assistant turn.' });
  }
});

export const savedConversationMessageSchema = z.discriminatedUnion('role', [userMessageSchema, assistantMessageSchema]);
export type SavedConversationMessage = z.infer<typeof savedConversationMessageSchema>;

const deltaMessagesSchema = z.array(savedConversationMessageSchema).max(SAVED_CONVERSATION_MAX_MESSAGES)
  .superRefine((messages, context) => {
    const seen = new Set<string>();
    for (const [index, message] of messages.entries()) {
      if (seen.has(message.id)) context.addIssue({ code: 'custom', path: [index, 'id'], message: 'Message IDs must be unique.' });
      seen.add(message.id);
    }
  });

const interruptedRequestId = z.uuid();
export const interruptedConversationTurnSchema = z.strictObject({
  requestId: interruptedRequestId,
  state: z.literal('interrupted'),
  retryIntent: z.literal('explicit-user-action-required'),
});
export type InterruptedConversationTurn = z.infer<typeof interruptedConversationTurnSchema>;
const interruptedTurnsSchema = z.array(interruptedConversationTurnSchema).max(SAVED_CONVERSATION_MAX_MESSAGES)
  .superRefine((turns, context) => {
    if (new Set(turns.map(turn => turn.requestId)).size !== turns.length) {
      context.addIssue({ code: 'custom', message: 'Interrupted request IDs must be unique.' });
    }
  });

function refineFullHistory(value: { messages: SavedConversationMessage[]; interruptedTurns: InterruptedConversationTurn[] | undefined }, context: z.RefinementCtx) {
  const interrupted = new Set((value.interruptedTurns ?? []).map(turn => turn.requestId));
  const byId = new Map(value.messages.map(message => [message.id, message]));
  const seenRequests = new Set<string>();
  for (const [index, message] of value.messages.entries()) {
    const requestId = message.role === 'user' ? message.id.slice(0, -5) : message.id;
    if (seenRequests.has(requestId) && message.role === 'user') {
      context.addIssue({ code: 'custom', path: ['messages', index, 'id'], message: 'Each request UUID can have only one user message.' });
    }
    seenRequests.add(requestId);
    if (message.role === 'assistant') {
      const user = byId.get(`${requestId}:user`);
      if (!user || user.role !== 'user') {
        context.addIssue({ code: 'custom', path: ['messages', index, 'id'], message: 'A full history assistant message requires its retained user message.' });
      } else {
        const userIndex = value.messages.indexOf(user);
        if (userIndex >= index) context.addIssue({ code: 'custom', path: ['messages', index], message: 'User messages must precede their assistant response.' });
        if (user.page !== message.page || user.taskKind !== message.taskKind || user.privateDocumentTurn !== message.privateDocumentTurn) {
          context.addIssue({ code: 'custom', path: ['messages', index], message: 'Correlated turn messages must retain the same page and task kind.' });
        }
      }
      if (interrupted.has(requestId)) {
        context.addIssue({ code: 'custom', path: ['interruptedTurns'], message: 'An interrupted turn cannot also contain a completed assistant message.' });
      }
    } else {
      const assistant = byId.get(requestId);
      if ((!assistant || assistant.role !== 'assistant') && !interrupted.has(requestId)) {
        context.addIssue({ code: 'custom', path: ['messages', index], message: 'A user message without an assistant response requires its separate interrupted-turn marker.' });
      }
    }
  }
  for (const [index, turn] of (value.interruptedTurns ?? []).entries()) {
    if (!byId.has(`${turn.requestId}:user`)) {
      context.addIssue({ code: 'custom', path: ['interruptedTurns', index, 'requestId'], message: 'Interrupted turns must match a retained user message.' });
    }
    if (byId.has(turn.requestId)) {
      context.addIssue({ code: 'custom', path: ['interruptedTurns', index, 'requestId'], message: 'An interrupted turn cannot also contain a completed assistant message.' });
    }
  }
}

const fullHistoryRelations = <T extends z.ZodType<{ messages: SavedConversationMessage[]; interruptedTurns?: InterruptedConversationTurn[] }>>(schema: T) =>
  schema.superRefine((value, context) => refineFullHistory({ messages: value.messages, interruptedTurns: value.interruptedTurns }, context));

const payloadWithinLimit = <T extends z.ZodType>(schema: T) => schema.refine(value => {
  try { return utf8Bytes(JSON.stringify(value)) <= SAVED_CONVERSATION_MAX_BYTES; }
  catch { return false; }
}, `Serialized conversation payload must be at most ${SAVED_CONVERSATION_MAX_BYTES} UTF-8 bytes.`);

export const saveConversationRequestSchema = payloadWithinLimit(fullHistoryRelations(z.strictObject({
  intent: z.literal('explicit-save'),
  conversationId: z.uuid(),
  messages: deltaMessagesSchema.min(1),
  interruptedTurns: interruptedTurnsSchema.optional(),
  documents: savedDocumentSetSchema.optional(),
})));
export type SaveConversationRequest = z.infer<typeof saveConversationRequestSchema>;

export const appendSavedConversationRequestSchema = payloadWithinLimit(z.strictObject({
  conversationId: z.uuid(),
  expectedVersion: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  messages: deltaMessagesSchema,
  interruptedTurns: interruptedTurnsSchema.optional(),
}).superRefine((delta, context) => {
  if (delta.messages.length === 0 && (!delta.interruptedTurns || delta.interruptedTurns.length === 0)) {
    context.addIssue({ code: 'custom', path: ['messages'], message: 'An append must add messages or interruption markers.' });
  }
}));
export type AppendSavedConversationRequest = z.infer<typeof appendSavedConversationRequestSchema>;

export const replaceSavedDocumentsRequestSchema = payloadWithinLimit(z.strictObject({
  intent: z.literal('explicit-document-replace'),
  conversationId: z.uuid(),
  expectedVersion: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  documents: savedDocumentSetSchema,
}));
export type ReplaceSavedDocumentsRequest = z.infer<typeof replaceSavedDocumentsRequestSchema>;

// One signed text copy on the wire. The server derives the receipt-free durable set.
const initialDocumentSaveSchema = z.strictObject({
  history: z.strictObject({ intent: z.literal('explicit-save'), conversationId: z.uuid(),
    messages: deltaMessagesSchema.min(1), interruptedTurns: interruptedTurnsSchema.optional() }),
  proof: savedDocumentProofSchema,
});
const documentReplaceSchema = z.strictObject({
  history: z.strictObject({ intent: z.literal('explicit-document-replace'), conversationId: z.uuid(),
    expectedVersion: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER) }),
  proof: savedDocumentProofSchema.nullable(),
});
export const savedDocumentCommandSchema = z.union([initialDocumentSaveSchema, documentReplaceSchema])
  .superRefine((value, context) => {
    if (value.proof && value.proof.operation.conversationId !== value.history.conversationId)
      context.addIssue({ code: 'custom', message: 'Documents must belong to this conversation.' });
    if (value.history.intent === 'explicit-save') refineFullHistory({ messages: value.history.messages, interruptedTurns: value.history.interruptedTurns }, context);
  }).refine(value => utf8Bytes(JSON.stringify(value)) <= SAVED_CONVERSATION_MAX_BYTES + 8 * 1024, 'Document save envelope is too large.');
export type SavedDocumentCommand = z.infer<typeof savedDocumentCommandSchema>;

const epochMilliseconds = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const savedConversationFields = {
  conversationId: z.uuid(),
  version: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  messages: deltaMessagesSchema.min(1),
  interruptedTurns: interruptedTurnsSchema.optional(),
  createdAt: epochMilliseconds,
  lastSavedMessageAt: epochMilliseconds,
  updatedAt: epochMilliseconds,
  expiresAt: epochMilliseconds,
  lastNewSavedMessageId: savedMessageIdSchema,
  documents: savedDocumentSetSchema.optional(),
};

// Timestamps are server-owned epoch milliseconds. Validation checks internal coherence, not clock provenance.
export const savedConversationRecordSchema = payloadWithinLimit(fullHistoryRelations(z.strictObject(savedConversationFields)
  .superRefine((record, context) => {
    if (record.createdAt > record.lastSavedMessageAt || record.lastSavedMessageAt > record.updatedAt) {
      context.addIssue({ code: 'custom', path: ['updatedAt'], message: 'Record timestamps must satisfy createdAt <= lastSavedMessageAt <= updatedAt.' });
    }
    if (record.expiresAt !== getSavedConversationExpiry(record.lastSavedMessageAt)) {
      context.addIssue({ code: 'custom', path: ['expiresAt'], message: 'Expiry must be 30 days after the last newly saved message.' });
    }
    if (record.messages.at(-1)?.id !== record.lastNewSavedMessageId) {
      context.addIssue({ code: 'custom', path: ['lastNewSavedMessageId'], message: 'The last newly saved message must be the final message in the record.' });
    }
  })));
export type SavedConversationRecord = z.infer<typeof savedConversationRecordSchema>;

/** A message that fails only because of its stored layout keeps everything else; one that still fails without it is left to fail. */
function withoutStaleLayout(message: unknown): unknown {
  if (!message || typeof message !== 'object' || !('ui' in message) || savedConversationMessageSchema.safeParse(message).success) return message;
  const { ui: _stale, ...plain } = message;
  return savedConversationMessageSchema.safeParse(plain).success ? plain : message;
}

/**
 * A1: the schema for reading a stored record back. A stored layout is checked against today's coverage rules, which may tighten
 * after it was saved; one that no longer passes is dropped from its message so the answer opens as plain text instead of the
 * whole chat failing. Writes keep savedConversationRecordSchema, so no new record can carry such a layout.
 */
export const savedConversationRecordReadSchema = z.preprocess(value => {
  if (!value || typeof value !== 'object' || !('messages' in value) || !Array.isArray(value.messages)) return value;
  return { ...value, messages: value.messages.map(withoutStaleLayout) };
}, savedConversationRecordSchema);

/**
 * Q16-D10: a saved conversation's row title, the visitor's first question with whitespace collapsed and cut on a word to at most
 * 80 characters (plus an ellipsis). Empty text has no title. Oak approved titles on 2026-10-18: the Worker's saved conversation list
 * titles each row from the first question the visitor typed (not an answer, not a private document turn); T14 still keeps
 * every other transcript field out of that list (workers/oak-agent/src/history/storage.ts).
 */
export function savedConversationTitle(text: string): string | undefined {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return undefined;
  if (clean.length <= 80) return clean;
  const cut = clean.slice(0, 80);
  const space = cut.lastIndexOf(' ');
  return `${(space > 40 ? cut.slice(0, space) : cut).replace(/[\s,;:.\u2013-]+$/, '')}\u2026`;
}

export const savedConversationSummarySchema = z.strictObject({
  conversationId: z.uuid(),
  version: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  messageCount: z.number().int().min(1).max(SAVED_CONVERSATION_MAX_MESSAGES),
  /** Q16-D10: optional so older Workers and stored rows still parse; see savedConversationTitle. */
  title: z.string().min(1).max(120).optional(),
  createdAt: epochMilliseconds,
  lastSavedMessageAt: epochMilliseconds,
  updatedAt: epochMilliseconds,
  expiresAt: epochMilliseconds,
  lastNewSavedMessageId: savedMessageIdSchema,
}).superRefine((summary, context) => {
  if (summary.createdAt > summary.lastSavedMessageAt || summary.lastSavedMessageAt > summary.updatedAt) {
    context.addIssue({ code: 'custom', path: ['updatedAt'], message: 'Summary timestamps must satisfy createdAt <= lastSavedMessageAt <= updatedAt.' });
  }
  if (summary.expiresAt !== getSavedConversationExpiry(summary.lastSavedMessageAt)) {
    context.addIssue({ code: 'custom', path: ['expiresAt'], message: 'Expiry must be 30 days after the last newly saved message.' });
  }
});
export type SavedConversationSummary = z.infer<typeof savedConversationSummarySchema>;

export const savedConversationPageSchema = z.strictObject({
  conversations: z.array(savedConversationSummarySchema).max(50),
  nextCursor: z.string().min(1).max(200).regex(/^[A-Za-z0-9_-]+$/u).nullable(),
}).superRefine((page, context) => {
  if (new Set(page.conversations.map(conversation => conversation.conversationId)).size !== page.conversations.length) {
    context.addIssue({ code: 'custom', path: ['conversations'], message: 'Conversation summaries must have unique IDs.' });
  }
});
export type SavedConversationPage = z.infer<typeof savedConversationPageSchema>;

export function getSavedConversationExpiry(lastSavedMessageAt: number): number {
  return lastSavedMessageAt + SAVED_CONVERSATION_RETENTION_MS;
}

function parsed<T>(schema: z.ZodType<T>, value: unknown): T | null {
  const result = schema.safeParse(value);
  return result.success ? result.data : null;
}

export const parseSavedConversationMessage = (value: unknown) => parsed(savedConversationMessageSchema, value);
export const parseSaveConversationRequest = (value: unknown) => parsed(saveConversationRequestSchema, value);
export const parseAppendSavedConversationRequest = (value: unknown) => parsed(appendSavedConversationRequestSchema, value);
export const parseSavedConversationRecord = (value: unknown) => parsed(savedConversationRecordSchema, value);
export const parseSavedConversationRecordForRead = (value: unknown) => parsed(savedConversationRecordReadSchema, value);
export const parseSavedConversationSummary = (value: unknown) => parsed(savedConversationSummarySchema, value);
export const parseSavedConversationPage = (value: unknown) => parsed(savedConversationPageSchema, value);
