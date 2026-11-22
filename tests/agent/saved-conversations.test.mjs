import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadTsx } from './design-rework/load-tsx.mjs';

const contractsDir = 'packages/oak-agent-contracts/src';
const output = loadTsx(`${contractsDir}/output.ts`);
const savedDocuments = loadTsx(`${contractsDir}/saved-documents.ts`);
const contracts = loadTsx(`${contractsDir}/saved-conversations.ts`);

const conversationId = '11111111-1111-4111-8111-111111111111';
const requestId = '22222222-2222-4222-8222-222222222222';
const answer = {
  schema: 'oak.answer.v1', speaker: 'oak-ai-host', characterVersion: 'oak-v1', hardPolicyVersion: 'policy-v1',
  knowledgeRevision: 'knowledge-2026-10', operations: ['read'], kind: 'sourced',
  claims: [{ id: 'claim-1', text: 'The answer keeps its source tuple.', citations: [{ documentId: 'work:sample',
    passageId: 'sample:section-1:passage-1', sectionId: 'sample:section-1', url: 'https://steveoak.com/work/sample/#proof' }] }],
  acknowledgment: null,
};
const terminalResearch = { requestId, topicId: 'workers-limits', provider: 'Exa', phase: 'zero-results', reason: 'none', returnedSources: 0, sources: [] };
const messages = [
  { id: `${requestId}:user`, role: 'user', text: 'Check the latest limits.', answer: null, cards: [], page: '/work/sample', taskKind: 'question' },
  { id: requestId, role: 'assistant', text: 'The answer keeps its source tuple.', answer,
    cards: [{ kind: 'navigate', label: 'Read the work page', url: 'https://steveoak.com/work/sample' }],
    page: '/work/sample', taskKind: 'question', research: terminalResearch },
];
const saveRequest = { intent: 'explicit-save', conversationId, messages };

test('validated rich completed conversation round-trips answers, cards, research, and source/version tuples', () => {
  const parsed = contracts.parseSaveConversationRequest(saveRequest);
  assert.deepEqual(parsed, saveRequest);
  assert.equal(parsed.messages[1].answer.knowledgeRevision, 'knowledge-2026-10');
  assert.equal(parsed.messages[1].answer.claims[0].citations[0].passageId, 'sample:section-1:passage-1');
  assert.deepEqual(parsed.messages[1].cards, saveRequest.messages[1].cards);
  assert.deepEqual(parsed.messages[1].research, terminalResearch);
  assert.equal(Object.hasOwn(parsed.messages[0], 'research'), false, 'canonical user rows do not carry research events');
  assert.equal(contracts.parseSavedConversationMessage({ ...messages[1], text: 'A truncated answer.' }), null,
    'visible completed text must remain the full rendering of the validated answer');
});

test('strict message and answer schemas reject secret, authority, usage, and internal fields', () => {
  for (const value of [
    { ...saveRequest, visitorCredential: 'private-session-secret' },
    { ...saveRequest, accountId: 'browser-claimed-account' },
    { ...saveRequest, messages: [{ ...messages[0], usage: { actualMicroUsd: 1 } }] },
    { ...saveRequest, messages: [{ ...messages[1], trace: { prompt: 'private' } }] },
    { ...saveRequest, messages: [messages[0], { ...messages[1], answer: { ...answer, privateNote: 'secret' } }] },
    { ...saveRequest, messages: [messages[0], { ...messages[1], answer: { ...answer, claims: [{ ...answer.claims[0], citations: [{ ...answer.claims[0].citations[0], url: 'https://evil.example/private' }] }] } }] },
  ]) assert.equal(contracts.parseSaveConversationRequest(value), null);
});

test('forged states, partial answers, and unsafe or malformed URLs are rejected', () => {
  assert.equal(contracts.parseSavedConversationMessage({ ...messages[1], state: 'complete' }), null);
  assert.equal(contracts.parseSavedConversationMessage({ ...messages[1], state: 'pending' }), null);
  assert.equal(contracts.parseSavedConversationMessage({ ...messages[1], research: { ...terminalResearch, phase: 'started' } }), null);
  assert.equal(contracts.parseSavedConversationMessage({ ...messages[1], research: { ...terminalResearch, requestId: '33333333-3333-4333-8333-333333333333' } }), null);
  assert.equal(contracts.parseSavedConversationMessage({ ...messages[0], research: terminalResearch }), null);
  assert.equal(contracts.parseSaveConversationRequest({ ...saveRequest, interruptedTurns: [{
    requestId, state: 'interrupted', retryIntent: 'explicit-user-action-required', partialText: 'unsaved chunk',
  }] }), null);
  assert.equal(contracts.parseSaveConversationRequest({ ...saveRequest, messages: [{ ...messages[0], page: 'https://evil.example/path' }] }), null);
  assert.equal(contracts.parseSavedConversationMessage({ ...messages[1], cards: [{ kind: 'navigate', label: 'leave', url: 'javascript:alert(1)' }] }), null);
  for (const url of ['javascript:alert(1)', 'https://evil.example/private', 'https://user:pass@steveoak.com/work/sample']) {
    const unsafeAnswer = { ...answer, claims: [{ ...answer.claims[0], citations: [{ ...answer.claims[0].citations[0], url }] }] };
    assert.equal(contracts.parseSavedConversationMessage({ ...messages[1], answer: unsafeAnswer }), null);
  }
});

test('message count, UTF-8 text bytes, total JSON bytes, and message IDs are bounded', () => {
  const tooMany = Array.from({ length: 129 }, (_, index) => ({ ...messages[0], id: `${String(index + 1).padStart(8, '0')}-2222-4222-8222-222222222222:user` }));
  assert.equal(contracts.parseSaveConversationRequest({ ...saveRequest, messages: tooMany }), null);
  const wideAnswer = { ...answer, claims: Array.from({ length: 6 }, (_, index) => ({ ...answer.claims[0], id: `claim-${index}`, text: '界'.repeat(1820) })) };
  const wideText = output.renderOakAnswer(wideAnswer);
  assert.ok(wideText.length <= 12000);
  assert.ok(new TextEncoder().encode(wideText).byteLength > contracts.SAVED_CONVERSATION_MAX_TEXT_BYTES);
  assert.equal(contracts.parseSavedConversationMessage({ ...messages[1], answer: wideAnswer, text: wideText }), null);
  const largeAnswer = { ...answer, claims: Array.from({ length: 6 }, (_, index) => ({ ...answer.claims[0], id: `claim-${index}`, text: 'x'.repeat(1800) })) };
  const largeText = output.renderOakAnswer(largeAnswer);
  const repeated = Array.from({ length: 24 }, (_, index) => {
    const id = `${String(index + 1).padStart(8, '0')}-2222-4222-8222-222222222222`;
    return [
      { ...messages[0], id: `${id}:user`, text: 'x' },
      { ...messages[1], id, answer: largeAnswer, text: largeText },
    ];
  }).flat();
  assert.equal(contracts.parseSaveConversationRequest({ ...saveRequest, messages: repeated }), null);
  assert.equal(contracts.parseSaveConversationRequest({ ...saveRequest, messages: [messages[0], messages[0]] }), null);
  assert.equal(contracts.parseSavedConversationMessage({ ...messages[0], id: 'not-a-correlated-uuid:user' }), null);
  assert.equal(contracts.parseSavedConversationMessage({ ...messages[0], id: '00000000-0000-1111-0111-000000000000:user' }), null,
    'the request prefix must be a valid UUID, including version and variant');
  assert.equal(contracts.parseSavedConversationMessage({ ...messages[1], id: `${requestId}:assistant` }), null);
  assert.equal(contracts.parseSavedConversationMessage({ ...messages[1], answer: { ...answer, knowledgeRevision: 'x'.repeat(241) } }), null);
  assert.equal(contracts.parseSavedConversationMessage({ ...messages[1], answer: { ...answer, claims: [{ ...answer.claims[0], text: 'x'.repeat(2001) }] } }), null);
});

test('CAS append carries bounded deltas and a positive expected version', () => {
  const append = { conversationId, expectedVersion: 3, messages };
  assert.deepEqual(contracts.parseAppendSavedConversationRequest(append), append);
  assert.deepEqual(contracts.parseAppendSavedConversationRequest({ ...append, messages: [messages[1]] }),
    { ...append, messages: [messages[1]] }, 'assistant-only deltas may correlate with a retained user row');
  const interruptedDelta = { requestId: '33333333-3333-4333-8333-333333333333', state: 'interrupted', retryIntent: 'explicit-user-action-required' };
  assert.deepEqual(contracts.parseAppendSavedConversationRequest({ ...append, messages: [messages[1]], interruptedTurns: [interruptedDelta] }),
    { ...append, messages: [messages[1]], interruptedTurns: [interruptedDelta] },
    'append correlation is validated after merging with stored history');
  assert.deepEqual(contracts.parseAppendSavedConversationRequest({ ...append, messages: [], interruptedTurns: [interruptedDelta] }),
    { ...append, messages: [], interruptedTurns: [interruptedDelta] }, 'delta validation permits a marker, while the server must validate the complete merged record');
  assert.equal(contracts.parseAppendSavedConversationRequest({ ...append, messages: [], interruptedTurns: [] }), null);
  assert.equal(contracts.parseAppendSavedConversationRequest({ ...append, expectedVersion: 0 }), null);
  assert.equal(contracts.parseAppendSavedConversationRequest({ ...append, expectedVersion: Number.MAX_SAFE_INTEGER + 1 }), null);
  assert.equal(contracts.parseAppendSavedConversationRequest({ ...append, messages: [messages[0], messages[0]] }), null);
  assert.equal(contracts.parseAppendSavedConversationRequest({ ...append, priorMessages: messages }), null);
});

test('interruption markers stay separate, bounded per turn, and do not invent assistant answers', () => {
  const marker = {
    requestId, state: 'interrupted', retryIntent: 'explicit-user-action-required',
  };
  const request = { ...saveRequest, messages: [messages[0]], interruptedTurns: [marker] };
  assert.deepEqual(contracts.parseSaveConversationRequest(request), request);
  assert.equal(contracts.parseSaveConversationRequest({ ...saveRequest, interruptedTurns: [marker] }), null,
    'an interrupted request cannot also claim a completed assistant message');
  assert.equal(contracts.parseSaveConversationRequest({ ...saveRequest, messages: [messages[0]] }), null,
    'a full initial Save cannot leave a user turn orphaned');
  assert.equal(contracts.parseSaveConversationRequest({ ...request, interruptedTurns: [marker, marker] }), null);
  assert.equal(contracts.parseSaveConversationRequest({ ...saveRequest, messages: [messages[1], messages[0]] }), null,
    'an initial assistant message cannot precede its user turn');
  assert.equal(contracts.parseSaveConversationRequest({ ...saveRequest, messages: [messages[0], { ...messages[1], page: '/' }] }), null,
    'the full history preserves same-turn page metadata');
  assert.equal(contracts.parseSaveConversationRequest({ ...saveRequest, messages: [] }), null);
});

test('record and list timestamps preserve exact server retention and ordering', () => {
  const lastSavedMessageAt = 1_791_000_000_000;
  const record = { conversationId, version: 3, messages, createdAt: lastSavedMessageAt - 5000,
    lastSavedMessageAt, updatedAt: lastSavedMessageAt + 200, expiresAt: lastSavedMessageAt + contracts.SAVED_CONVERSATION_RETENTION_MS,
    lastNewSavedMessageId: requestId };
  assert.deepEqual(contracts.parseSavedConversationRecord(record), record);
  assert.equal(contracts.getSavedConversationExpiry(lastSavedMessageAt), record.expiresAt);
  assert.equal(contracts.parseSavedConversationRecord({ ...record, expiresAt: record.expiresAt + 1 }), null);
  assert.equal(contracts.parseSavedConversationRecord({ ...record, createdAt: record.updatedAt + 1 }), null);
  assert.equal(contracts.parseSavedConversationRecord({ ...record, lastNewSavedMessageId: `${requestId}:user` }), null);
  assert.equal(contracts.parseSavedConversationRecord({ ...record, messages: [messages[0]] }), null,
    'a durable full record must explain a missing assistant with an interrupted marker');
  assert.equal(contracts.parseSavedConversationRecord({ ...record, messages: [messages[1], messages[0]] }), null);
  const { messages: _messages, ...summary } = record;
  assert.deepEqual(contracts.parseSavedConversationSummary({ ...summary, messageCount: messages.length }),
    { ...summary, messageCount: messages.length });
});

test('history pages are bounded, strict, and may retain a cursor after account-scoped filtering', () => {
  const lastSavedMessageAt = 1_791_000_000_000;
  const summary = { conversationId, version: 1, messageCount: 2, createdAt: lastSavedMessageAt,
    lastSavedMessageAt, updatedAt: lastSavedMessageAt,
    expiresAt: contracts.getSavedConversationExpiry(lastSavedMessageAt), lastNewSavedMessageId: requestId };
  assert.deepEqual(contracts.parseSavedConversationPage({ conversations: [summary], nextCursor: null }),
    { conversations: [summary], nextCursor: null });
  assert.deepEqual(contracts.parseSavedConversationPage({ conversations: [], nextCursor: 'bounded_cursor-1' }),
    { conversations: [], nextCursor: 'bounded_cursor-1' });
  assert.equal(contracts.parseSavedConversationPage({ conversations: [summary, summary], nextCursor: null }), null);
  assert.equal(contracts.parseSavedConversationPage({ conversations: [], nextCursor: '' }), null);
  assert.equal(contracts.parseSavedConversationPage({ conversations: [], nextCursor: 'x'.repeat(201) }), null);
  assert.equal(contracts.parseSavedConversationPage({ conversations: [], nextCursor: 'not/a/cursor' }), null);
  assert.equal(contracts.parseSavedConversationPage({ conversations: [summary], nextCursor: null, accountId: 'browser-authority' }), null);
  const oversized = Array.from({ length: 51 }, (_, index) => ({ ...summary,
    conversationId: `${String(index + 1).padStart(8, '0')}-1111-4111-8111-111111111111` }));
  assert.equal(contracts.parseSavedConversationPage({ conversations: oversized, nextCursor: null }), null);
});

const savedDoc = (text = 'Private normalized visitor text Ω') => ({ documentId: '33333333-3333-4333-8333-333333333333', slots: [0], kind: 'paste', text,
  sections: [{ id: 'section-1', start: 0, end: text.length, sourceStart: 0, sourceEnd: text.length }], offsetUnit: 'utf16',
  normalizedBytes: new TextEncoder().encode(text).byteLength, tokens: Math.ceil(text.length / 4), normalizationComplete: true,
  extractionCompleteness: 'complete', pageMapping: 'unavailable', warnings: ['no-factual-authority'], authority: 'visitor-text-only',
  label: 'Document 1', parserRevision: 't18-reviewed-v2', processorRevision: 'local-text-v1' });

test('T18 saved documents preserve revisions, genuine UTF16 spans and coverage while excluding originals and live receipts', () => {
  const document = savedDoc(), value = { documents: [document], selections: [{ documentId: document.documentId, sectionId: 'section-1', start: 0, end: document.text.length }] };
  assert.deepEqual(contracts.parseSaveConversationRequest({ ...saveRequest, documents: value }).documents, value);
  for (const forbidden of ['receipt', 'signature', 'originalSha256', 'originalBytes', 'filename', 'principalHash', 'url', 'page']) {
    assert.equal(savedDocuments.savedDocumentSetSchema.safeParse({ ...value, documents: [{ ...document, [forbidden]: 'private' }] }).success, false, forbidden);
  }
  assert.equal(savedDocuments.savedDocumentSetSchema.safeParse({ documents: [{ ...document, label: 'My private filename.pdf' }], selections: [] }).success, false);
  assert.equal(savedDocuments.savedDocumentSetSchema.safeParse({ documents: [{ ...document, sections: [{ ...document.sections[0], end: 1 }] }], selections: [] }).success, false);
  assert.equal(savedDocuments.savedDocumentSetSchema.safeParse({ documents: [{ ...document, normalizedBytes: 1 }], selections: [] }).success, false);
  assert.equal(savedDocuments.savedDocumentSetSchema.safeParse({ documents: [{ ...document, extractionCompleteness: 'unknown' }], selections: [] }).success, false);
});

test('T18 whole serialized history cap includes durable document text and automatic append excludes attachments', () => {
  const doc = savedDoc('a'.repeat(60_000)), docs = { documents: [doc], selections: [] }, pairs = [];
  for (let i = 0; i < 64; i++) {
    const id = `${(i + 1).toString(16).padStart(8, '0')}-4444-4444-8444-444444444444`;
    const rich = { ...answer, claims: [{ ...answer.claims[0], text: 'b'.repeat(1990) }] };
    const pair = [{ ...messages[0], id: `${id}:user`, text: 'u'.repeat(4000) },
      { ...messages[1], id, text: output.renderOakAnswer(rich), answer: rich, research: undefined }];
    if (!contracts.parseSaveConversationRequest({ ...saveRequest, messages: [...pairs, ...pair] })) break;
    pairs.push(...pair);
  }
  assert.ok(contracts.parseSaveConversationRequest({ ...saveRequest, messages: pairs }));
  assert.equal(contracts.parseSaveConversationRequest({ ...saveRequest, messages: pairs, documents: docs }), null);
  assert.equal(contracts.parseAppendSavedConversationRequest({ conversationId, expectedVersion: 1, messages, documents: docs }), null);
  assert.equal(contracts.replaceSavedDocumentsRequestSchema.safeParse({ intent: 'explicit-document-replace', conversationId, expectedVersion: 1, documents: docs }).success, true);
  assert.equal(contracts.replaceSavedDocumentsRequestSchema.safeParse({ intent: 'explicit-document-replace', conversationId, expectedVersion: 0, documents: docs }).success, false);
});
